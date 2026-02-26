/**
 * AggregatorWorker
 *
 * 职责：每 30 秒运行一次，对所有 pool 计算：
 *  - 5M / 1H / 6H / 24H 的 volume、txns、涨跌幅
 *  - Trending Score 排行
 *  - 将结果写入 pools 表和 Redis（作为 API 缓存）
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

export class AggregatorWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  start() {
    if (this.running) return
    this.running = true
    console.log('[Aggregator] Starting (interval: 30s)')

    // 立即跑一次，然后每 30 秒重复
    this.run().catch(console.error)
    this.timer = setInterval(() => {
      this.run().catch(console.error)
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

  async run() {
    const start = Date.now()
    try {
      // 并行计算所有时间窗口
      await Promise.all(
        WINDOWS.map((w) => this.aggregateWindow(w))
      )
      await this.updatePoolsTable()
      await this.buildRankings()
      console.log(`[Aggregator] Done in ${Date.now() - start}ms`)
    } catch (err) {
      console.error('[Aggregator] Error:', err)
    }
  }

  // ─── Per-window aggregation ──────────────────────────────────

  private async aggregateWindow(window: typeof WINDOWS[number]) {
    const interval = WINDOW_TO_INTERVAL[window]

    // 每个 pool 在该时间窗口内的汇总数据
    const rows = await query<PoolAggRow>(`
      WITH window_swaps AS (
        SELECT
          pool_address,
          amount_usd,
          sender,
          price_usd,
          timestamp
        FROM swaps
        WHERE timestamp > NOW() - INTERVAL '${interval}'
      ),
      aggregated AS (
        SELECT
          pool_address,
          SUM(amount_usd)           AS volume_usd,
          COUNT(*)                  AS tx_count,
          COUNT(DISTINCT sender)    AS unique_wallets,
          -- 最新价格（最近一笔 swap）
          (SELECT price_usd FROM swaps s2
           WHERE s2.pool_address = window_swaps.pool_address
           ORDER BY timestamp DESC LIMIT 1)  AS current_price,
          -- 窗口开始时的价格
          (SELECT price_usd FROM swaps s3
           WHERE s3.pool_address = window_swaps.pool_address
             AND s3.timestamp <= NOW() - INTERVAL '${interval}'
           ORDER BY timestamp DESC LIMIT 1) AS open_price
        FROM window_swaps
        GROUP BY pool_address
      )
      SELECT * FROM aggregated
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
        volume_5m      = COALESCE(ts5m.volume_usd,  0),
        volume_1h      = COALESCE(ts1h.volume_usd,  0),
        volume_6h      = COALESCE(ts6h.volume_usd,  0),
        volume_24h     = COALESCE(ts24h.volume_usd, 0),
        txns_5m        = COALESCE(ts5m.tx_count,    0),
        txns_1h        = COALESCE(ts1h.tx_count,    0),
        txns_6h        = COALESCE(ts6h.tx_count,    0),
        txns_24h       = COALESCE(ts24h.tx_count,   0),
        change_5m      = COALESCE(ts5m.price_change,  0),
        change_1h      = COALESCE(ts1h.price_change,  0),
        change_6h      = COALESCE(ts6h.price_change,  0),
        change_24h     = COALESCE(ts24h.price_change, 0),
        trending_score = COALESCE(ts1h.score, 0),
        updated_at     = NOW()
      FROM
        (SELECT pool_address, volume_usd, tx_count, price_change, score FROM trending_scores WHERE win='5m')  ts5m
        FULL OUTER JOIN
        (SELECT pool_address, volume_usd, tx_count, price_change, score FROM trending_scores WHERE win='1h')  ts1h
          USING (pool_address)
        FULL OUTER JOIN
        (SELECT pool_address, volume_usd, tx_count, price_change, score FROM trending_scores WHERE win='6h')  ts6h
          USING (pool_address)
        FULL OUTER JOIN
        (SELECT pool_address, volume_usd, tx_count, price_change, score FROM trending_scores WHERE win='24h') ts24h
          USING (pool_address)
      WHERE p.address = COALESCE(ts5m.pool_address, ts1h.pool_address, ts6h.pool_address, ts24h.pool_address)
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
