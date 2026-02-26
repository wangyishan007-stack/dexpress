// ============================================================
// Base DEX Screener — Chain Constants & ABIs
// ============================================================

export const BASE_CHAIN_ID = 8453

// ─── Key Addresses (Base Mainnet) ─────────────────────────────

export const ADDRESSES = {
  WETH:  '0x4200000000000000000000000000000000000006',
  USDC:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDT:  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  DAI:   '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',

  // DEX Factories
  UNISWAP_V3_FACTORY: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  UNISWAP_V4_POOL_MANAGER: '0x7Da1D65F8B249183667cdE74C5CBD46dD38aa829',
  AERODROME_FACTORY:  '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',

  // Chainlink ETH/USD price feed
  CHAINLINK_ETH_USD: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
} as const

// Stablecoin addresses set (lowercase) for USD price routing
export const STABLECOINS = new Set([
  ADDRESSES.USDC.toLowerCase(),
  ADDRESSES.USDT.toLowerCase(),
  ADDRESSES.DAI.toLowerCase(),
])

export const WETH_LOWER = ADDRESSES.WETH.toLowerCase()

// ─── ABI Fragments ────────────────────────────────────────────

// Uniswap V3 Pool — Swap event
export const UNIV3_SWAP_EVENT = {
  type: 'event',
  name: 'Swap',
  inputs: [
    { name: 'sender',       type: 'address', indexed: true  },
    { name: 'recipient',    type: 'address', indexed: true  },
    { name: 'amount0',      type: 'int256',  indexed: false },
    { name: 'amount1',      type: 'int256',  indexed: false },
    { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
    { name: 'liquidity',    type: 'uint128', indexed: false },
    { name: 'tick',         type: 'int24',   indexed: false },
  ],
} as const

// Uniswap V3 Factory — PoolCreated event
export const UNIV3_POOL_CREATED_EVENT = {
  type: 'event',
  name: 'PoolCreated',
  inputs: [
    { name: 'token0',      type: 'address', indexed: true  },
    { name: 'token1',      type: 'address', indexed: true  },
    { name: 'fee',         type: 'uint24',  indexed: true  },
    { name: 'tickSpacing', type: 'int24',   indexed: false },
    { name: 'pool',        type: 'address', indexed: false },
  ],
} as const

// Aerodrome/Velodrome Factory — PairCreated event
export const AERODROME_PAIR_CREATED_EVENT = {
  type: 'event',
  name: 'PairCreated',
  inputs: [
    { name: 'token0',         type: 'address', indexed: true  },
    { name: 'token1',         type: 'address', indexed: true  },
    { name: 'stable',         type: 'bool',    indexed: true  },
    { name: 'pair',           type: 'address', indexed: false },
    { name: 'allPairsLength', type: 'uint256', indexed: false },
  ],
} as const

// Aerodrome Pool — Swap event (Uniswap V2-style)
export const AERODROME_SWAP_EVENT = {
  type: 'event',
  name: 'Swap',
  inputs: [
    { name: 'sender',     type: 'address', indexed: true  },
    { name: 'to',         type: 'address', indexed: true  },
    { name: 'amount0In',  type: 'uint256', indexed: false },
    { name: 'amount1In',  type: 'uint256', indexed: false },
    { name: 'amount0Out', type: 'uint256', indexed: false },
    { name: 'amount1Out', type: 'uint256', indexed: false },
  ],
} as const

// ERC-20 ABI (minimal)
export const ERC20_ABI = [
  { type: 'function', name: 'symbol',      inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'name',        inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'decimals',    inputs: [], outputs: [{ type: 'uint8'   }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

// Chainlink Aggregator ABI
export const CHAINLINK_ABI = [
  {
    type: 'function',
    name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId',         type: 'uint80'  },
      { name: 'answer',          type: 'int256'  },
      { name: 'startedAt',       type: 'uint256' },
      { name: 'updatedAt',       type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80'  },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
] as const

// Uniswap V3 Pool ABI (minimal)
export const UNIV3_POOL_ABI = [
  { type: 'function', name: 'token0',  inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'token1',  inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'fee',     inputs: [], outputs: [{ type: 'uint24'  }], stateMutability: 'view' },
  { type: 'function', name: 'liquidity', inputs: [], outputs: [{ type: 'uint128' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'slot0',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick',         type: 'int24'   },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked',    type: 'bool'  },
    ],
    stateMutability: 'view',
  },
] as const

// ─── Trending Score Weights ────────────────────────────────────

export const TRENDING_WEIGHTS = {
  txns_1h:      0.40,
  volume_1h:    0.30,
  new_wallets:  0.30,
} as const

// ─── Aggregation intervals ─────────────────────────────────────

export const WINDOWS = ['5m', '1h', '6h', '24h'] as const

export const WINDOW_TO_INTERVAL: Record<string, string> = {
  '5m':  '5 minutes',
  '1h':  '1 hour',
  '6h':  '6 hours',
  '24h': '24 hours',
}
