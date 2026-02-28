// ============================================================
// Base DEX Screener — Shared Types
// ============================================================

export type Dex = 'uniswap_v3' | 'uniswap_v4' | 'aerodrome'
export type TimeWindow = '5m' | '1h' | '6h' | '24h'
export type SortField =
  | 'trending_score' | 'trending_5m' | 'trending_1h' | 'trending_6h' | 'trending_24h'
  | 'volume_5m' | 'volume_1h' | 'volume_6h' | 'volume_24h'
  | 'change_5m'  | 'change_1h'  | 'change_6h'  | 'change_24h'
  | 'txns_5m' | 'txns_1h' | 'txns_6h' | 'txns_24h'
  | 'buys_5m' | 'buys_1h' | 'buys_6h' | 'buys_24h'
  | 'sells_5m' | 'sells_1h' | 'sells_6h' | 'sells_24h'
  | 'liquidity_usd'
  | 'mcap_usd'
  | 'created_at'

export interface Token {
  address:      string
  symbol:       string
  name:         string
  decimals:     number
  total_supply: string    // BigInt as string
  logo_url:     string | null
  coingecko_id: string | null
  is_verified:  boolean
  created_at:   string
}

export interface Pool {
  address:       string
  dex:           Dex
  fee_tier:      number | null
  price_usd:     number
  liquidity_usd: number
  volume_5m:     number
  volume_1h:     number
  volume_6h:     number
  volume_24h:    number
  txns_5m:       number
  txns_1h:       number
  txns_6h:       number
  txns_24h:      number
  makers_5m:     number
  makers_1h:     number
  makers_6h:     number
  makers_24h:    number
  change_5m:     number
  change_1h:     number
  change_6h:     number
  change_24h:    number
  buys_5m:       number
  buys_1h:       number
  buys_6h:       number
  buys_24h:      number
  sells_5m:      number
  sells_1h:      number
  sells_6h:      number
  sells_24h:     number
  trending_score: number
  trending_5m:   number
  trending_1h:   number
  trending_6h:   number
  trending_24h:  number
  holder_count:  number
  created_at:    string
  updated_at:    string
  token0:        Token
  token1:        Token
  mcap_usd:      number
  // 同 pair 不同费率/DEX 的所有池（合并显示时使用）
  all_addresses?: string[]
  all_fee_tiers?: (number | null)[]
  all_dexes?:     string[]
}

export interface Swap {
  id:           string
  pool_address: string
  block_number: number
  tx_hash:      string
  timestamp:    string
  sender:       string | null
  recipient:    string | null
  amount0:      number
  amount1:      number
  amount_usd:   number
  price_usd:    number
  is_buy:       boolean
}

export interface PriceSnapshot {
  pool_address: string
  timestamp:    string
  open_usd:     number
  high_usd:     number
  low_usd:      number
  close_usd:    number
  volume_usd:   number
  tx_count:     number
}

export interface TrendingScore {
  pool_address:  string
  window:        TimeWindow
  score:         number
  volume_usd:    number
  tx_count:      number
  price_change:  number
  new_wallets:   number
  calculated_at: string
}

// ─── API Request / Response types ─────────────────────────────

export interface PairsQuery {
  sort?:    SortField
  order?:   'asc' | 'desc'
  filter?:  'trending' | 'new' | 'gainers' | 'losers' | 'top'
  window?:  TimeWindow
  limit?:   number
  offset?:  number
  search?:  string
}

export interface PairsResponse {
  pairs:  Pool[]
  total:  number
  limit:  number
  offset: number
}

export interface CandlesQuery {
  resolution: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  from:       number  // Unix timestamp
  to:         number
}

// ─── WebSocket message types ───────────────────────────────────

export type WsMessageType =
  | 'price_update'
  | 'new_swap'
  | 'new_pair'
  | 'subscribe'
  | 'unsubscribe'
  | 'pong'

export interface WsMessage<T = unknown> {
  type: WsMessageType
  data: T
  ts:   number
}

export interface PriceUpdateData {
  pool_address: string
  price_usd:    number
  change_1m:    number   // % change vs 1 min ago
}

export interface NewSwapData extends Swap {
  token0_symbol: string
  token1_symbol: string
}

export interface NewPairData extends Pool {}

// ─── Internal worker types ─────────────────────────────────────

export interface UniV3SwapEvent {
  address:       `0x${string}`
  blockNumber:   bigint
  transactionHash: `0x${string}`
  logIndex:      number
  blockTimestamp?: bigint
  args: {
    sender:       `0x${string}`
    recipient:    `0x${string}`
    amount0:      bigint
    amount1:      bigint
    sqrtPriceX96: bigint
    liquidity:    bigint
    tick:         number
  }
}

export interface AerodromeSwapEvent {
  address:       `0x${string}`
  blockNumber:   bigint
  transactionHash: `0x${string}`
  logIndex:      number
  args: {
    sender:      `0x${string}`
    to:          `0x${string}`
    amount0In:   bigint
    amount1In:   bigint
    amount0Out:  bigint
    amount1Out:  bigint
  }
}

export interface PoolCreatedEvent {
  address:   `0x${string}`    // factory address
  blockNumber: bigint
  args: {
    token0:      `0x${string}`
    token1:      `0x${string}`
    fee?:        number
    tickSpacing?: number
    pool?:       `0x${string}`   // uniswap v3
    pair?:       `0x${string}`   // aerodrome
    stable?:     boolean
  }
}

export interface TokenInfo {
  address:      string
  symbol:       string
  name:         string
  decimals:     number
  total_supply: bigint
}
