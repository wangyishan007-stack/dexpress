-- ============================================================
-- Base DEX Screener — Database Schema
-- PostgreSQL 16 (Supabase compatible)
-- ============================================================

-- 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- 支持模糊搜索

-- ============================================================
-- TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS tokens (
  address        VARCHAR(42)   PRIMARY KEY,
  symbol         VARCHAR(50)   NOT NULL DEFAULT '',
  name           VARCHAR(200)  NOT NULL DEFAULT '',
  decimals       SMALLINT      NOT NULL DEFAULT 18,
  total_supply   NUMERIC(78,0) DEFAULT 0,
  logo_url       TEXT,
  coingecko_id   VARCHAR(100),
  is_verified    BOOLEAN       NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tokens_symbol_trgm ON tokens USING gin(symbol gin_trgm_ops);
CREATE INDEX idx_tokens_name_trgm   ON tokens USING gin(name   gin_trgm_ops);

-- ============================================================
-- POOLS
-- ============================================================
CREATE TABLE IF NOT EXISTS pools (
  address        VARCHAR(42)    PRIMARY KEY,
  token0         VARCHAR(42)    NOT NULL REFERENCES tokens(address),
  token1         VARCHAR(42)    NOT NULL REFERENCES tokens(address),
  dex            VARCHAR(50)    NOT NULL,   -- 'uniswap_v3' | 'aerodrome' | 'uniswap_v4'
  fee_tier       INTEGER,                   -- 手续费 bps (3000 = 0.3%)
  tick_spacing   INTEGER,
  -- 实时指标（由 AggregatorWorker 更新）
  price_usd      NUMERIC(36,18) NOT NULL DEFAULT 0,
  price_eth      NUMERIC(36,18) NOT NULL DEFAULT 0,
  liquidity_usd  NUMERIC(30,6)  NOT NULL DEFAULT 0,
  volume_5m      NUMERIC(30,6)  NOT NULL DEFAULT 0,
  volume_1h      NUMERIC(30,6)  NOT NULL DEFAULT 0,
  volume_6h      NUMERIC(30,6)  NOT NULL DEFAULT 0,
  volume_24h     NUMERIC(30,6)  NOT NULL DEFAULT 0,
  txns_5m        INTEGER        NOT NULL DEFAULT 0,
  txns_1h        INTEGER        NOT NULL DEFAULT 0,
  txns_6h        INTEGER        NOT NULL DEFAULT 0,
  txns_24h       INTEGER        NOT NULL DEFAULT 0,
  change_5m      NUMERIC(10,4)  NOT NULL DEFAULT 0,  -- %
  change_1h      NUMERIC(10,4)  NOT NULL DEFAULT 0,
  change_6h      NUMERIC(10,4)  NOT NULL DEFAULT 0,
  change_24h     NUMERIC(10,4)  NOT NULL DEFAULT 0,
  trending_score NUMERIC(20,6)  NOT NULL DEFAULT 0,
  holder_count   INTEGER        NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pools_token0         ON pools(token0);
CREATE INDEX idx_pools_token1         ON pools(token1);
CREATE INDEX idx_pools_dex            ON pools(dex);
CREATE INDEX idx_pools_liquidity      ON pools(liquidity_usd DESC);
CREATE INDEX idx_pools_trending       ON pools(trending_score DESC);
CREATE INDEX idx_pools_volume_24h     ON pools(volume_24h DESC);
CREATE INDEX idx_pools_created        ON pools(created_at DESC);

-- ============================================================
-- SWAPS — 按月分区（Range Partitioning）
-- ============================================================
CREATE TABLE IF NOT EXISTS swaps (
  id            BIGSERIAL,
  pool_address  VARCHAR(42)    NOT NULL,
  block_number  BIGINT         NOT NULL,
  tx_hash       VARCHAR(66)    NOT NULL,
  log_index     INTEGER        NOT NULL DEFAULT 0,
  timestamp     TIMESTAMPTZ    NOT NULL,
  sender        VARCHAR(42),
  recipient     VARCHAR(42),
  amount0       NUMERIC(78,18) NOT NULL DEFAULT 0,  -- 负数 = 从池子流出
  amount1       NUMERIC(78,18) NOT NULL DEFAULT 0,
  amount_usd    NUMERIC(30,6)  NOT NULL DEFAULT 0,
  price_usd     NUMERIC(36,18) NOT NULL DEFAULT 0,  -- 非稳定币 token 的 USD 价格
  is_buy        BOOLEAN        NOT NULL DEFAULT true,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- 按月创建分区（2025 年起，可继续追加）
CREATE TABLE swaps_2025_01 PARTITION OF swaps FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE swaps_2025_02 PARTITION OF swaps FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE swaps_2025_03 PARTITION OF swaps FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE swaps_2025_04 PARTITION OF swaps FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE swaps_2025_05 PARTITION OF swaps FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE swaps_2025_06 PARTITION OF swaps FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE swaps_2025_07 PARTITION OF swaps FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE swaps_2025_08 PARTITION OF swaps FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE swaps_2025_09 PARTITION OF swaps FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE swaps_2025_10 PARTITION OF swaps FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE swaps_2025_11 PARTITION OF swaps FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE swaps_2025_12 PARTITION OF swaps FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE swaps_2026_01 PARTITION OF swaps FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE swaps_2026_02 PARTITION OF swaps FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE swaps_2026_03 PARTITION OF swaps FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE swaps_default  PARTITION OF swaps DEFAULT;

CREATE INDEX idx_swaps_pool_time  ON swaps(pool_address, timestamp DESC);
CREATE INDEX idx_swaps_tx         ON swaps(tx_hash);
CREATE INDEX idx_swaps_sender     ON swaps(sender);
CREATE INDEX idx_swaps_recipient  ON swaps(recipient);
CREATE INDEX idx_swaps_timestamp  ON swaps(timestamp DESC);

-- ============================================================
-- PRICE_SNAPSHOTS — 1 分钟 OHLCV（K 线数据）
-- ============================================================
CREATE TABLE IF NOT EXISTS price_snapshots (
  pool_address  VARCHAR(42)    NOT NULL,
  timestamp     TIMESTAMPTZ    NOT NULL,  -- 截断到分钟
  open_usd      NUMERIC(36,18) NOT NULL,
  high_usd      NUMERIC(36,18) NOT NULL,
  low_usd       NUMERIC(36,18) NOT NULL,
  close_usd     NUMERIC(36,18) NOT NULL,
  volume_usd    NUMERIC(30,6)  NOT NULL DEFAULT 0,
  tx_count      INTEGER        NOT NULL DEFAULT 0,
  PRIMARY KEY (pool_address, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE price_snapshots_2025 PARTITION OF price_snapshots
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE price_snapshots_2026 PARTITION OF price_snapshots
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE price_snapshots_default PARTITION OF price_snapshots DEFAULT;

CREATE INDEX idx_price_snaps_time ON price_snapshots(pool_address, timestamp DESC);

-- ============================================================
-- TRENDING_SCORES — 聚合结果缓存
-- ============================================================
CREATE TABLE IF NOT EXISTS trending_scores (
  pool_address  VARCHAR(42)   NOT NULL REFERENCES pools(address) ON DELETE CASCADE,
  win           VARCHAR(10)   NOT NULL,   -- '5m' | '1h' | '6h' | '24h'
  score         NUMERIC(20,6) NOT NULL DEFAULT 0,
  volume_usd    NUMERIC(30,6) NOT NULL DEFAULT 0,
  tx_count      INTEGER       NOT NULL DEFAULT 0,
  price_change  NUMERIC(10,4) NOT NULL DEFAULT 0,  -- %
  new_wallets   INTEGER       NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool_address, win)
);

CREATE INDEX idx_trending_score ON trending_scores(win, score DESC);

-- ============================================================
-- TOKEN_HOLDERS — 持有人数缓存
-- ============================================================
CREATE TABLE IF NOT EXISTS token_holders (
  token_address VARCHAR(42)  NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
  holder_count  INTEGER      NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (token_address)
);

-- ============================================================
-- ETH_PRICE — ETH/USD 价格历史（Chainlink）
-- ============================================================
CREATE TABLE IF NOT EXISTS eth_prices (
  timestamp  TIMESTAMPTZ    NOT NULL PRIMARY KEY,
  price_usd  NUMERIC(20,6)  NOT NULL
);

-- ============================================================
-- INDEXER_STATE — 断点续传（记录已处理的最高区块）
-- ============================================================
CREATE TABLE IF NOT EXISTS indexer_state (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO indexer_state (key, value) VALUES
  ('last_block_swaps',         '0'),
  ('last_block_pool_created',  '0')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 自动更新 updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tokens_updated_at
  BEFORE UPDATE ON tokens
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_pools_updated_at
  BEFORE UPDATE ON pools
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- 快速查询视图：pairs_view（联结 pools + tokens 信息）
-- ============================================================
CREATE OR REPLACE VIEW pairs_view AS
SELECT
  p.address,
  p.dex,
  p.fee_tier,
  p.price_usd,
  p.liquidity_usd,
  p.volume_5m,
  p.volume_1h,
  p.volume_6h,
  p.volume_24h,
  p.txns_5m,
  p.txns_1h,
  p.txns_6h,
  p.txns_24h,
  p.change_5m,
  p.change_1h,
  p.change_6h,
  p.change_24h,
  p.trending_score,
  p.holder_count,
  p.created_at,
  -- token0
  t0.address   AS token0_address,
  t0.symbol    AS token0_symbol,
  t0.name      AS token0_name,
  t0.decimals  AS token0_decimals,
  t0.logo_url  AS token0_logo,
  -- token1
  t1.address   AS token1_address,
  t1.symbol    AS token1_symbol,
  t1.name      AS token1_name,
  t1.decimals  AS token1_decimals,
  t1.logo_url  AS token1_logo,
  -- MCap（若有 total_supply）
  CASE WHEN t0.total_supply > 0
    THEN p.price_usd * (t0.total_supply / POWER(10, t0.decimals))
    ELSE 0
  END AS mcap_usd
FROM pools p
JOIN tokens t0 ON t0.address = p.token0
JOIN tokens t1 ON t1.address = p.token1;

-- ============================================================
-- 自动建分区函数（每月调用一次，例如 cron 触发）
-- ============================================================
CREATE OR REPLACE FUNCTION create_monthly_partitions(target_year INT, target_month INT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  start_date DATE := make_date(target_year, target_month, 1);
  end_date   DATE := start_date + INTERVAL '1 month';
  tbl_suffix TEXT := to_char(start_date, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS swaps_%s PARTITION OF swaps FOR VALUES FROM (%L) TO (%L)',
    tbl_suffix, start_date, end_date
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS price_snapshots_%s PARTITION OF price_snapshots FOR VALUES FROM (%L) TO (%L)',
    tbl_suffix, start_date, end_date
  );
END;
$$;
