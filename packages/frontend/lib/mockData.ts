import type { Pool, Token } from '@dex/shared'

/* ── Deterministic hash for seed values ──────────────────── */
function seedHash(i: number, salt: number): number {
  let h = (i * 2654435761 + salt * 40503) >>> 0
  h = ((h ^ (h >> 16)) * 0x45d9f3b) >>> 0
  h = ((h ^ (h >> 16)) * 0x45d9f3b) >>> 0
  return (h ^ (h >> 16)) >>> 0
}

function seedFloat(i: number, salt: number): number {
  return (seedHash(i, salt) % 10000) / 10000
}

function seedRange(i: number, salt: number, min: number, max: number): number {
  return min + seedFloat(i, salt) * (max - min)
}

/* ── Token definitions ───────────────────────────────────── */
interface TokenDef {
  symbol: string
  name: string
  decimals: number
  priceMin: number
  priceMax: number
  logoUrl: string | null
}

function twLogo(addr: string): string {
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/${addr}/logo.png`
}

const TOKEN_DEFS: (TokenDef & { realAddr?: string })[] = [
  { symbol: 'BRETT',    name: 'Brett',           decimals: 18, priceMin: 0.08,   priceMax: 0.25,    realAddr: '0x532f27101965dd16442E59d40670FaF5eBB142E4', logoUrl: twLogo('0x532f27101965dd16442E59d40670FaF5eBB142E4') },
  { symbol: 'DEGEN',   name: 'Degen',            decimals: 18, priceMin: 0.003,  priceMax: 0.015,   realAddr: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', logoUrl: twLogo('0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed') },
  { symbol: 'TOSHI',   name: 'Toshi',            decimals: 18, priceMin: 0.0002, priceMax: 0.001,   realAddr: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', logoUrl: twLogo('0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4') },
  { symbol: 'AERO',    name: 'Aerodrome',        decimals: 18, priceMin: 0.5,    priceMax: 2.5,     realAddr: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', logoUrl: twLogo('0x940181a94A35A4569E4529A3CDfB74e38FD98631') },
  { symbol: 'VIRTUAL', name: 'Virtual Protocol', decimals: 18, priceMin: 0.4,    priceMax: 3.0,     realAddr: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', logoUrl: twLogo('0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b') },
  { symbol: 'HIGHER',  name: 'Higher',           decimals: 18, priceMin: 0.002,  priceMax: 0.02,    realAddr: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe', logoUrl: twLogo('0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe') },
  { symbol: 'MOCHI',   name: 'Mochi',            decimals: 18, priceMin: 0.00001,priceMax: 0.0005,  realAddr: '0xF6e932Ca12afa26665dC4dDE7e27be02A7c02e50', logoUrl: twLogo('0xF6e932Ca12afa26665dC4dDE7e27be02A7c02e50') },
  { symbol: 'BASED',   name: 'Based',            decimals: 18, priceMin: 0.001,  priceMax: 0.01,    logoUrl: null },
  { symbol: 'NORMIE',  name: 'Normie',           decimals: 18, priceMin: 0.01,   priceMax: 0.08,    realAddr: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', logoUrl: twLogo('0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842') },
  { symbol: 'DOGINME', name: 'doginme',          decimals: 18, priceMin: 0.001,  priceMax: 0.008,   realAddr: '0x6921B130D297cc43754afba22e5EAc0FBf8Db75b', logoUrl: twLogo('0x6921B130D297cc43754afba22e5EAc0FBf8Db75b') },
  { symbol: 'SKI',     name: 'Ski Mask Dog',     decimals: 18, priceMin: 0.0001, priceMax: 0.003,   logoUrl: null },
  { symbol: 'BALD',    name: 'Bald',             decimals: 18, priceMin: 0.0005, priceMax: 0.005,   logoUrl: null },
  { symbol: 'KEYCAT',  name: 'Keyboard Cat',     decimals: 18, priceMin: 0.001,  priceMax: 0.02,    realAddr: '0x9a26F5433671751C3276a065f57e5a02D2817973', logoUrl: twLogo('0x9a26F5433671751C3276a065f57e5a02D2817973') },
  { symbol: 'WELL',    name: 'Moonwell',         decimals: 18, priceMin: 0.01,   priceMax: 0.08,    realAddr: '0xA88594D404727625A9437C3f886C7643872296AE', logoUrl: twLogo('0xA88594D404727625A9437C3f886C7643872296AE') },
  { symbol: 'RSC',     name: 'ResearchCoin',     decimals: 18, priceMin: 0.02,   priceMax: 0.1,     logoUrl: null },
  { symbol: 'SPEC',    name: 'Spectral',         decimals: 18, priceMin: 2.0,    priceMax: 8.0,     logoUrl: null },
  { symbol: 'MORPHO',  name: 'Morpho',           decimals: 18, priceMin: 1.0,    priceMax: 5.0,     logoUrl: null },
  { symbol: 'EXTRA',   name: 'Extra Finance',    decimals: 18, priceMin: 0.05,   priceMax: 0.3,     logoUrl: null },
  { symbol: 'SEAM',    name: 'Seamless',         decimals: 18, priceMin: 0.5,    priceMax: 3.0,     realAddr: '0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85', logoUrl: twLogo('0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85') },
  { symbol: 'TYBG',    name: 'Base God',         decimals: 18, priceMin: 0.00005,priceMax: 0.001,   logoUrl: null },
  { symbol: 'MFER',    name: 'mfercoin',         decimals: 18, priceMin: 0.0001, priceMax: 0.002,   logoUrl: null },
  { symbol: 'BENJI',   name: 'Benji Bananas',    decimals: 18, priceMin: 0.0005, priceMax: 0.01,    logoUrl: null },
  { symbol: 'cbBTC',   name: 'Coinbase BTC',     decimals: 8,  priceMin: 90000,  priceMax: 105000,  logoUrl: null },
  { symbol: 'ANON',    name: 'Anon',             decimals: 18, priceMin: 0.001,  priceMax: 0.015,   logoUrl: null },
  { symbol: 'GODDOG',  name: 'God Dog',          decimals: 18, priceMin: 0.00001,priceMax: 0.0003,  logoUrl: null },
  { symbol: 'MIGGLES', name: 'Mr Miggles',       decimals: 18, priceMin: 0.0001, priceMax: 0.005,   logoUrl: null },
  { symbol: 'LUM',     name: 'Lumerin',          decimals: 18, priceMin: 0.005,  priceMax: 0.05,    logoUrl: null },
  { symbol: 'BMX',     name: 'BMX',              decimals: 18, priceMin: 0.1,    priceMax: 0.6,     logoUrl: null },
  { symbol: 'CLANKER', name: 'Clanker',          decimals: 18, priceMin: 0.001,  priceMax: 0.05,    logoUrl: null },
  { symbol: 'BASE',    name: 'Base Token',       decimals: 18, priceMin: 0.0005, priceMax: 0.008,   logoUrl: null },
  { symbol: 'ZORA',    name: 'Zora',             decimals: 18, priceMin: 0.1,    priceMax: 1.0,     logoUrl: null },
  { symbol: 'weirdo',  name: 'Weirdo',           decimals: 18, priceMin: 0.00001,priceMax: 0.0008,  logoUrl: null },
  { symbol: 'BNKR',    name: 'Bankr',            decimals: 18, priceMin: 0.0002, priceMax: 0.005,   logoUrl: null },
  { symbol: 'FREN',    name: 'Fren Pet',         decimals: 18, priceMin: 0.01,   priceMax: 0.08,    logoUrl: null },
  { symbol: 'FARCAST', name: 'Farcast',          decimals: 18, priceMin: 0.002,  priceMax: 0.03,    logoUrl: null },
  { symbol: 'AIX',     name: 'AIX Token',        decimals: 18, priceMin: 0.05,   priceMax: 0.4,     logoUrl: null },
  { symbol: 'PNDX',    name: 'PandaX',           decimals: 18, priceMin: 0.0001, priceMax: 0.003,   logoUrl: null },
  { symbol: 'CHAD',    name: 'Chad',             decimals: 18, priceMin: 0.0005, priceMax: 0.01,    logoUrl: null },
  { symbol: 'SNEK',    name: 'Snek',             decimals: 18, priceMin: 0.001,  priceMax: 0.02,    logoUrl: null },
  { symbol: 'BSWAP',   name: 'BaseSwap',         decimals: 18, priceMin: 0.05,   priceMax: 0.5,     realAddr: '0x78a087d713Be963Bf307b18F2Ff8122EF9A63ae9', logoUrl: twLogo('0x78a087d713Be963Bf307b18F2Ff8122EF9A63ae9') },
  { symbol: 'ROCKET',  name: 'RocketSwap',       decimals: 18, priceMin: 0.001,  priceMax: 0.015,   logoUrl: null },
  { symbol: 'BRTT',    name: 'Brett Token',      decimals: 18, priceMin: 0.0001, priceMax: 0.002,   logoUrl: null },
  { symbol: 'GLOOM',   name: 'Gloom',            decimals: 18, priceMin: 0.003,  priceMax: 0.05,    logoUrl: null },
  { symbol: 'CRASH',   name: 'Crash',            decimals: 18, priceMin: 0.0001, priceMax: 0.001,   logoUrl: null },
  { symbol: 'HOPPY',   name: 'Hoppy',            decimals: 18, priceMin: 0.00005,priceMax: 0.001,   logoUrl: null },
  { symbol: 'PILL',    name: 'Blue Pill',        decimals: 18, priceMin: 0.001,  priceMax: 0.02,    logoUrl: null },
  { symbol: 'DACKIE',  name: 'Dackieswap',       decimals: 18, priceMin: 0.001,  priceMax: 0.01,    logoUrl: null },
  { symbol: 'REBOOT',  name: 'Reboot',           decimals: 18, priceMin: 0.0002, priceMax: 0.004,   logoUrl: null },
  { symbol: 'OX',      name: 'OX Fun',           decimals: 18, priceMin: 0.001,  priceMax: 0.01,    logoUrl: null },
  { symbol: 'USDbC',   name: 'USD Base Coin',    decimals: 6,  priceMin: 0.998,  priceMax: 1.002,   logoUrl: null },
]

/* ── Quote tokens (real addresses) ───────────────────────── */
const WETH_ADDR  = '0x4200000000000000000000000000000000000006'
const USDC_ADDR  = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

const WETH_TOKEN: Token = {
  address: WETH_ADDR,
  symbol: 'WETH', name: 'Wrapped Ether',
  decimals: 18, total_supply: '0',
  logo_url: twLogo('0x4200000000000000000000000000000000000006'),
  coingecko_id: 'weth', is_verified: true,
  created_at: '2023-01-01T00:00:00Z',
}

const USDC_TOKEN: Token = {
  address: USDC_ADDR,
  symbol: 'USDC', name: 'USD Coin',
  decimals: 6, total_supply: '0',
  logo_url: twLogo('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  coingecko_id: 'usd-coin', is_verified: true,
  created_at: '2023-01-01T00:00:00Z',
}

/* ── Generate deterministic mock address ─────────────────── */
function mockAddr(i: number): string {
  const h = seedHash(i, 999).toString(16).padStart(8, '0')
  const h2 = seedHash(i, 888).toString(16).padStart(8, '0')
  const h3 = seedHash(i, 777).toString(16).padStart(8, '0')
  const h4 = seedHash(i, 666).toString(16).padStart(8, '0')
  const h5 = seedHash(i, 555).toString(16).padStart(8, '0')
  return `0x${h}${h2}${h3}${h4}${h5}`.slice(0, 42)
}

/* ── DEX type rotation ───────────────────────────────────── */
const DEXES = ['uniswap_v3', 'uniswap_v3', 'uniswap_v4', 'aerodrome'] as const
const FEE_TIERS = [500, 3000, 10000, null]

/* ── Build 50 pools ──────────────────────────────────────── */
const NOW = new Date('2026-02-27T12:00:00Z').getTime()

function buildPools(): Pool[] {
  const pools: Pool[] = []

  for (let i = 0; i < 50; i++) {
    const def = TOKEN_DEFS[i]
    const price = seedRange(i, 1, def.priceMin, def.priceMax)

    // Alternating quote token
    const quoteToken = i % 3 === 0 ? USDC_TOKEN : WETH_TOKEN

    // Token address — use real address if available for logo matching
    const tokenAddr = def.realAddr ?? mockAddr(i)
    const poolAddr  = mockAddr(i + 100)

    const baseToken: Token = {
      address:      tokenAddr,
      symbol:       def.symbol,
      name:         def.name,
      decimals:     def.decimals,
      total_supply: '1000000000000000000000000000',
      logo_url:     def.logoUrl,
      coingecko_id: null,
      is_verified:  seedFloat(i, 20) > 0.5,
      created_at:   new Date(NOW - seedRange(i, 30, 2 * 3600_000, 30 * 86400_000)).toISOString(),
    }

    // created_at: ranges from a few hours to a few days ago
    const ageMs     = seedRange(i, 2, 2 * 3600_000, 7 * 86400_000)
    const createdAt = new Date(NOW - ageMs).toISOString()

    // Changes: include positive, negative, and near-zero
    const change5m  = seedRange(i, 3, -10, 15) * (seedFloat(i, 31) > 0.3 ? 1 : -1)
    const change1h  = seedRange(i, 4, -20, 30) * (seedFloat(i, 41) > 0.35 ? 1 : -1)
    const change6h  = seedRange(i, 5, -30, 50) * (seedFloat(i, 51) > 0.4 ? 1 : -1)
    const change24h = seedRange(i, 6, -40, 80) * (seedFloat(i, 61) > 0.4 ? 1 : -1)

    // Volume & activity
    const vol24h   = seedRange(i, 7, 10_000, 5_000_000)
    const vol6h    = vol24h * seedRange(i, 8, 0.15, 0.4)
    const vol1h    = vol6h * seedRange(i, 9, 0.1, 0.3)
    const vol5m    = vol1h * seedRange(i, 10, 0.05, 0.2)

    const txns24h  = Math.round(seedRange(i, 11, 50, 10_000))
    const txns6h   = Math.round(txns24h * seedRange(i, 12, 0.15, 0.4))
    const txns1h   = Math.round(txns6h * seedRange(i, 13, 0.1, 0.3))
    const txns5m   = Math.round(txns1h * seedRange(i, 14, 0.05, 0.2))

    const buyRatio  = seedRange(i, 30, 0.4, 0.7)
    const buys24h   = Math.round(txns24h * buyRatio)
    const buys6h    = Math.round(txns6h * buyRatio)
    const buys1h    = Math.round(txns1h * buyRatio)
    const buys5m    = Math.round(txns5m * buyRatio)
    const sells24h  = txns24h - buys24h
    const sells6h   = txns6h - buys6h
    const sells1h   = txns1h - buys1h
    const sells5m   = txns5m - buys5m

    const makers24h = Math.round(seedRange(i, 15, 20, 3000))
    const makers6h  = Math.round(makers24h * seedRange(i, 16, 0.15, 0.4))
    const makers1h  = Math.round(makers6h * seedRange(i, 17, 0.1, 0.3))
    const makers5m  = Math.round(makers1h * seedRange(i, 18, 0.05, 0.2))

    const liquidity = seedRange(i, 19, 50_000, 10_000_000)
    const mcap      = seedRange(i, 21, 100_000, 500_000_000)

    const trendingScore = seedRange(i, 22, 0, 1000)
    const trending24h = trendingScore
    const trending6h  = parseFloat((trendingScore * seedRange(i, 31, 0.6, 1.4)).toFixed(2))
    const trending1h  = parseFloat((trendingScore * seedRange(i, 32, 0.4, 1.6)).toFixed(2))
    const trending5m  = parseFloat((trendingScore * seedRange(i, 33, 0.2, 2.0)).toFixed(2))

    const dex = DEXES[i % DEXES.length]
    const feeTier = dex === 'aerodrome' ? null : FEE_TIERS[i % FEE_TIERS.length]

    pools.push({
      address:        poolAddr,
      dex,
      fee_tier:       feeTier,
      price_usd:      price,
      liquidity_usd:  liquidity,
      volume_5m:      vol5m,
      volume_1h:      vol1h,
      volume_6h:      vol6h,
      volume_24h:     vol24h,
      txns_5m:        txns5m,
      txns_1h:        txns1h,
      txns_6h:        txns6h,
      txns_24h:       txns24h,
      buys_5m:        buys5m,
      buys_1h:        buys1h,
      buys_6h:        buys6h,
      buys_24h:       buys24h,
      sells_5m:       sells5m,
      sells_1h:       sells1h,
      sells_6h:       sells6h,
      sells_24h:      sells24h,
      makers_5m:      makers5m,
      makers_1h:      makers1h,
      makers_6h:      makers6h,
      makers_24h:     makers24h,
      change_5m:      parseFloat(change5m.toFixed(2)),
      change_1h:      parseFloat(change1h.toFixed(2)),
      change_6h:      parseFloat(change6h.toFixed(2)),
      change_24h:     parseFloat(change24h.toFixed(2)),
      trending_score: parseFloat(trendingScore.toFixed(2)),
      trending_5m:    trending5m,
      trending_1h:    trending1h,
      trending_6h:    trending6h,
      trending_24h:   trending24h,
      holder_count:   Math.round(seedRange(i, 23, 0, 5000)),
      created_at:     createdAt,
      updated_at:     new Date(NOW - seedRange(i, 24, 0, 600_000)).toISOString(),
      token0:         quoteToken,
      token1:         baseToken,
      mcap_usd:       mcap,
    })
  }

  return pools
}

export const MOCK_POOLS = buildPools()

/* ── Generate mock swaps for a pool ──────────────────────── */
export interface MockSwap {
  id: string
  tx_hash: string
  timestamp: string
  is_buy: boolean
  amount_usd: number
  amount0: number
  amount1: number
  price_usd: number
  sender: string | null
}

export function buildSwapsForPool(poolIdx: number, price: number, count = 50): MockSwap[] {
  const swaps: MockSwap[] = []
  for (let j = 0; j < count; j++) {
    const isBuy = seedFloat(poolIdx * 1000 + j, 50) > 0.45
    const amountUsd = seedRange(poolIdx * 1000 + j, 51, 20, 50_000)
    const amount0 = amountUsd / (price || 1)
    const amount1 = amountUsd / 3200 // approximate ETH price
    const ts = new Date(NOW - j * seedRange(poolIdx * 1000 + j, 52, 10_000, 300_000)).toISOString()
    const txH = seedHash(poolIdx * 1000 + j, 53).toString(16).padStart(8, '0')
    const txH2 = seedHash(poolIdx * 1000 + j, 54).toString(16).padStart(8, '0')
    const senderAddr = mockAddr(poolIdx * 1000 + j + 5000)

    swaps.push({
      id: `swap-${poolIdx}-${j}`,
      tx_hash: `0x${txH}${txH2}${'a'.repeat(48)}`.slice(0, 66),
      timestamp: ts,
      is_buy: isBuy,
      amount_usd: parseFloat(amountUsd.toFixed(2)),
      amount0: parseFloat(amount0.toFixed(6)),
      amount1: parseFloat(amount1.toFixed(6)),
      price_usd: price,
      sender: senderAddr,
    })
  }
  return swaps
}

export const MOCK_STATS = {
  volume_24h:   42_350_000,
  txns_24h:     156_420,
  latest_block: 28_456_789,
  block_ts:     new Date(NOW - 12_000).toISOString(),
}
