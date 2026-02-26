-- ============================================================
-- 简化版 schema（去除分区，用于本地快速测试）
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

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

CREATE TABLE IF NOT EXISTS pools (
  address        VARCHAR(42)    PRIMARY KEY,
  token0         VARCHAR(42)    NOT NULL REFERENCES tokens(address),
  token1         VARCHAR(42)    NOT NULL REFERENCES tokens(address),
  dex            VARCHAR(50)    NOT NULL,
  fee_tier       INTEGER,
  tick_spacing   INTEGER,
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
  change_5m      NUMERIC(10,4)  NOT NULL DEFAULT 0,
  change_1h      NUMERIC(10,4)  NOT NULL DEFAULT 0,
  change_6h      NUMERIC(10,4)  NOT NULL DEFAULT 0,
  change_24h     NUMERIC(10,4)  NOT NULL DEFAULT 0,
  trending_score NUMERIC(20,6)  NOT NULL DEFAULT 0,
  holder_count   INTEGER        NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 普通表（非分区），适合本地开发
CREATE TABLE IF NOT EXISTS swaps (
  id            BIGSERIAL      PRIMARY KEY,
  pool_address  VARCHAR(42)    NOT NULL,
  block_number  BIGINT         NOT NULL,
  tx_hash       VARCHAR(66)    NOT NULL,
  log_index     INTEGER        NOT NULL DEFAULT 0,
  timestamp     TIMESTAMPTZ    NOT NULL,
  sender        VARCHAR(42),
  recipient     VARCHAR(42),
  amount0       NUMERIC(78,18) NOT NULL DEFAULT 0,
  amount1       NUMERIC(78,18) NOT NULL DEFAULT 0,
  amount_usd    NUMERIC(30,6)  NOT NULL DEFAULT 0,
  price_usd     NUMERIC(36,18) NOT NULL DEFAULT 0,
  is_buy        BOOLEAN        NOT NULL DEFAULT true,
  UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_swaps_pool_time ON swaps(pool_address, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_timestamp ON swaps(timestamp DESC);

CREATE TABLE IF NOT EXISTS price_snapshots (
  pool_address  VARCHAR(42)    NOT NULL,
  timestamp     TIMESTAMPTZ    NOT NULL,
  open_usd      NUMERIC(36,18) NOT NULL,
  high_usd      NUMERIC(36,18) NOT NULL,
  low_usd       NUMERIC(36,18) NOT NULL,
  close_usd     NUMERIC(36,18) NOT NULL,
  volume_usd    NUMERIC(30,6)  NOT NULL DEFAULT 0,
  tx_count      INTEGER        NOT NULL DEFAULT 0,
  PRIMARY KEY (pool_address, timestamp)
);

CREATE TABLE IF NOT EXISTS trending_scores (
  pool_address  VARCHAR(42)   NOT NULL REFERENCES pools(address) ON DELETE CASCADE,
  win           VARCHAR(10)   NOT NULL,   -- renamed from 'window' (reserved word in PG16)
  score         NUMERIC(20,6) NOT NULL DEFAULT 0,
  volume_usd    NUMERIC(30,6) NOT NULL DEFAULT 0,
  tx_count      INTEGER       NOT NULL DEFAULT 0,
  price_change  NUMERIC(10,4) NOT NULL DEFAULT 0,
  new_wallets   INTEGER       NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pool_address, win)
);

CREATE TABLE IF NOT EXISTS token_holders (
  token_address VARCHAR(42)  NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
  holder_count  INTEGER      NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (token_address)
);

CREATE TABLE IF NOT EXISTS eth_prices (
  timestamp  TIMESTAMPTZ   NOT NULL PRIMARY KEY,
  price_usd  NUMERIC(20,6) NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO indexer_state (key, value) VALUES
  ('last_block_swaps',        '0'),
  ('last_block_pool_created', '0')
ON CONFLICT DO NOTHING;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_tokens_updated_at BEFORE UPDATE ON tokens FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_pools_updated_at BEFORE UPDATE ON pools FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
