/**
 * AggregatorWorker
 *
 * 职责：每 30 秒运行一次，对所有 pool 计算：
 *  - 5M / 1H / 6H / 24H 的 volume、txns、涨跌幅
 *  - Trending Score 排行
 *  - 将结果写入 pools 表和 Redis（作为 API 缓存）
 *
 * 性能优化：5m/1h 每 tick（30s），6h/24h 每 10 tick（~5min）
 */

import { db, redis, query, RedisKeys } from '@dex/database'
import { TRENDING_WEIGHTS, WINDOWS, WINDOW_TO_INTERVAL } from '@dex/shared'

interface PoolAggRow {
  pool_address:  string
  volume_usd:    number
  tx_count:      number
  unique_wallets: number
  current_price: number
  open_price:    number
}

// 快窗口每 tick（30s），慢窗口每 10 tick（~5min）
const FAST_WINDOWS = ['5m', '1h']  as const
const SLOW_WINDOWS = ['6h', '24h'] as const
const SLOW_EVERY   = 10  // 每 10 tick 跑一次慢窗口

export class AggregatorWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private tickCount = 0

  start() {
    if (this.running) return
    this.running = true
    console.log('[Aggregator] Starting (fast: 30s, slow: ~5min)')

    // 首次跑全部窗口
    this.tickCount = 0
    this.run(true).catch(console.error)
    this.timer = setInterval(() => {
      this.tickCount++
      const runSlow = this.tickCount % SLOW_EVERY === 0
      this.run(runSlow).catch(console.error)
    }, 30_000)
  }

  stop() {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('[Aggregator] Stopped')
  }

  // ─── Main loop ──────────────────────────────────────────────

  async run(includeSlow = false) {
    const start = Date.now()
    try {
      const windows = includeSlow
        ? [...FAST_WINDOWS, ...SLOW_WINDOWS]
        : [...FAST_WINDOWS]

      await Promise.all(
        windows.map((w) => this.aggregateWindow(w))
      )
      await this.updatePoolsTable()
      await this.updatePoolPrices()
      await this.buildRankings()

      const label = includeSlow ? 'all' : 'fast'
      console.log(`[Aggregator] Done (${label}) in ${Date.now() - start}ms`)
    } catch (err) {
      console.error('[Aggregator] Error:', err)
    }
  }

  // ─── Per-window aggregation ──────────────────────────────────

  private async aggregateWindow(window: string) {
    const interval = WINDOW_TO_INTERVAL[window]

    // 用 DISTINCT ON 代替相关子查询，性能更好、语义更清晰
    const rows = await query<PoolAggRow>(`
      WITH agg AS (
        SELECT
          pool_address,
          SUM(amount_usd)           AS volume_usd,
          COUNT(*)                  AS tx_count,
          COUNT(DISTINCT sender)    AS unique_wallets
        FROM swaps
        WHERE timestamp > NOW() - INTERVAL '${interval}'
        GROUP BY pool_address
      ),
      latest_prices AS (
        SELECT DISTINCT ON (pool_address)
          pool_address, price_usd AS current_price
        FROM swaps
        WHERE pool_address IN (SELECT pool_address FROM agg)
          AND price_usd > 0
        ORDER BY pool_address, timestamp DESC
      ),
      open_prices AS (
        SELECT DISTINCT ON (pool_address)
          pool_address, price_usd AS open_price
        FROM swaps
        WHERE pool_address IN (SELECT pool_address FROM agg)
          AND timestamp <= NOW() - INTERVAL '${interval}'
          AND price_usd > 0
        ORDER BY pool_address, timestamp DESC
      )
      SELECT
        a.pool_address,
        a.volume_usd,
        a.tx_count,
        a.unique_wallets,
        COALESCE(lp.current_price, 0) AS current_price,
        COALESCE(op.open_price, 0)    AS open_price
      FROM agg a
      LEFT JOIN latest_prices lp USING (pool_address)
      LEFT JOIN open_prices   op USING (pool_address)
    `)

    if (rows.length === 0) return

    // 批量 upsert trending_scores
    const values: unknown[] = []
    const placeholders: string[] = []

    rows.forEach((row, i) => {
      const priceChange = (row.open_price && row.open_price > 0)
        ? ((row.current_price - row.open_price) / row.open_price) * 100
        : 0

      // Trending score: txns × 0.4 + volume_normalized × 0.3 + wallets × 0.3
      // volume_normalized: log scale to avoid WETH pools dominating
      const normVolume = row.volume_usd > 0 ? Math.log10(row.volume_usd + 1) * 1000 : 0
      const score =
        row.tx_count      * TRENDING_WEIGHTS.txns_1h * 100 +
        normVolume         * TRENDING_WEIGHTS.volume_1h +
        row.unique_wallets * TRENDING_WEIGHTS.new_wallets * 100

      const base = i * 7
      placeholders.push(
        `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7})`
      )
      values.push(
        row.pool_address,
        window,
        score,
        row.volume_usd,
        row.tx_count,
        priceChange,
        row.unique_wallets,
      )
    })

    if (placeholders.length > 0) {
      await db.query(
        `INSERT INTO trending_scores
           (pool_address, win, score, volume_usd, tx_count, price_change, new_wallets)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (pool_address, win) DO UPDATE SET
           score         = EXCLUDED.score,
           volume_usd    = EXCLUDED.volume_usd,
           tx_count      = EXCLUDED.tx_count,
           price_change  = EXCLUDED.price_change,
           new_wallets   = EXCLUDED.new_wallets,
           calculated_at = NOW()`,
        values
      )
    }

    // 写入 Redis
    const pipeline = redis.pipeline()
    for (const row of rows) {
      const priceChange = (row.open_price && row.open_price > 0)
        ? ((row.current_price - row.open_price) / row.open_price) * 100
        : 0
      const normVolume = row.volume_usd > 0 ? Math.log10(row.volume_usd + 1) * 1000 : 0
      const score =
        row.tx_count      * TRENDING_WEIGHTS.txns_1h * 100 +
        normVolume         * TRENDING_WEIGHTS.volume_1h +
        row.unique_wallets * TRENDING_WEIGHTS.new_wallets * 100

      pipeline.hset(
        RedisKeys.aggregated(row.pool_address, window),
        'volume_usd',   row.volume_usd,
        'tx_count',     row.tx_count,
        'price_change', priceChange,
        'new_wallets',  row.unique_wallets,
        'score',        score,
      )
      pipeline.expire(RedisKeys.aggregated(row.pool_address, window), 90)

      // 更新排行 ZSET
      pipeline.zadd(RedisKeys.pairsRanking(window), score, row.pool_address)
    }
    await pipeline.exec()
  }

  // ─── Flush aggregated data back to pools table ───────────────

  private async updatePoolsTable() {
    // 用 trending_scores 中最新的数据更新 pools 表，便于 /api/pairs 直接查询
    await db.query(`
      UPDATE pools p
      SET
        volume_5m      = COALESCE(ts5m.volume_usd,    0),
        volume_1h      = COALESCE(ts1h.volume_usd,    0),
        volume_6h      = COALESCE(ts6h.volume_usd,    0),
        volume_24h     = COALESCE(ts24h.volume_usd,   0),
        txns_5m        = COALESCE(ts5m.tx_count,      0),
        txns_1h        = COALESCE(ts1h.tx_count,      0),
        txns_6h        = COALESCE(ts6h.tx_count,      0),
        txns_24h       = COALESCE(ts24h.tx_count,     0),
        makers_5m      = COALESCE(ts5m.new_wallets,   0),
        makers_1h      = COALESCE(ts1h.new_wallets,   0),
        makers_6h      = COALESCE(ts6h.new_wallets,   0),
        makers_24h     = COALESCE(ts24h.new_wallets,  0),
        change_5m      = COALESCE(ts5m.price_change,  0),
        change_1h      = COALESCE(ts1h.price_change,  0),
        change_6h      = COALESCE(ts6h.price_change,  0),
        change_24h     = COALESCE(ts24h.price_change, 0),
        trending_score = COALESCE(ts1h.score, 0),
        updated_at     = NOW()
      FROM
        (SELECT pool_address, volume_usd, tx_count, price_change, new_wallets, score FROM trending_scores WHERE win='5m')  ts5m
        FULL OUTER JOIN
        (SELECT pool_address, volume_usd, tx_count, price_change, new_wallets, score FROM trending_scores WHERE win='1h')  ts1h
          USING (pool_address)
        FULL OUTER JOIN
        (SELECT pool_address, volume_usd, tx_count, price_change, new_wallets, score FROM trending_scores WHERE win='6h')  ts6h
          USING (pool_address)
        FULL OUTER JOIN
        (SELECT pool_address, volume_usd, tx_count, price_change, new_wallets, score FROM trending_scores WHERE win='24h') ts24h
          USING (pool_address)
      WHERE p.address = COALESCE(ts5m.pool_address, ts1h.pool_address, ts6h.pool_address, ts24h.pool_address)
    `)
  }

  // ─── Update pools.price_usd from latest swaps ──────────────

  private async updatePoolPrices() {
    // 只更新最近 24h 有交易的 pool，避免全表扫描
    await db.query(`
      UPDATE pools p
      SET
        price_usd  = lp.price_usd,
        updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (pool_address)
          pool_address, price_usd
        FROM swaps
        WHERE timestamp > NOW() - INTERVAL '24 hours'
          AND price_usd > 0
        ORDER BY pool_address, timestamp DESC
      ) lp
      WHERE p.address = lp.pool_address
        AND lp.price_usd > 0
    `)
  }

  // ─── Rankings cache ──────────────────────────────────────────

  private async buildRankings() {
    // 将 pools 列表按窗口缓存到 Redis（JSON，TTL 60s）
    // /api/pairs 可以直接从这里读，不需要打数据库
    for (const window of WINDOWS) {
      const topPools = await query<{ pool_address: string; score: number }>(`
        SELECT pool_address, score FROM trending_scores
        WHERE win = $1
        ORDER BY score DESC
        LIMIT 500
      `, [window])

      await redis.set(
        `ranking_list:${window}`,
        JSON.stringify(topPools.map((r) => r.pool_address)),
        'EX', 60
      )
    }

    // 新上线 pairs（24h内）
    const newPairs = await query<{ address: string }>(
      `SELECT address FROM pools WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 100`
    )
    await redis.set(
      'ranking_list:new',
      JSON.stringify(newPairs.map((r) => r.address)),
      'EX', 60
    )

    // 涨幅榜
    const gainers = await query<{ pool_address: string }>(
      `SELECT pool_address FROM trending_scores
       WHERE win = '24h' AND price_change > 0
       ORDER BY price_change DESC LIMIT 100`
    )
    await redis.set(
      'ranking_list:gainers',
      JSON.stringify(gainers.map((r) => r.pool_address)),
      'EX', 60
    )
  }
}
