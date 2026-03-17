// Multi-chain configuration — single source of truth for all chain-specific constants

export type ChainSlug = 'base' | 'bsc' | 'solana'

export interface ChainExplorer {
  url: string
  name: string
  addressPath: string
  tokenPath: string
  txPath: string
}

export interface ChainConfig {
  slug: ChainSlug
  name: string
  shortName: string
  icon: string
  color: string
  chainType: 'evm' | 'svm'

  nativeCurrency: { symbol: string; name: string; decimals: number }
  wrappedNative: string
  stablecoins: Set<string>

  // External API identifiers
  geckoTerminalSlug: string
  goplusChainId: string
  moralisChain: string
  bubblemapsChain: string

  explorer: ChainExplorer

  rpcUrl: string
  trustWalletChain: string

  swapUrl: (tokenAddr: string, dex?: string) => string
  isValidAddress: (addr: string) => boolean

  subgraphId?: string
  dexes: string[]
}

export const CHAINS: Record<ChainSlug, ChainConfig> = {
  base: {
    slug: 'base',
    name: 'Base',
    shortName: 'Base',
    icon: '/branding/base-icon.svg',
    color: '#0052FF',
    chainType: 'evm',
    nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    wrappedNative: '0x4200000000000000000000000000000000000006',
    stablecoins: new Set([
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
      '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT
      '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
    ]),
    geckoTerminalSlug: 'base',
    goplusChainId: '8453',
    moralisChain: 'base',
    bubblemapsChain: 'base',
    explorer: {
      url: 'https://basescan.org',
      name: 'BaseScan',
      addressPath: '/address/',
      tokenPath: '/token/',
      txPath: '/tx/',
    },
    rpcUrl: 'https://mainnet.base.org',
    trustWalletChain: 'base',
    swapUrl: (addr, dex) =>
      dex === 'aerodrome'
        ? `https://aerodrome.finance/swap?from=eth&to=${addr}`
        : `https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${addr}`,
    isValidAddress: (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
    subgraphId: 'HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1',
    dexes: ['uniswap_v3', 'uniswap_v4', 'aerodrome'],
  },

  bsc: {
    slug: 'bsc',
    name: 'BNB Chain',
    shortName: 'BNB',
    icon: '/branding/bnb-icon.svg',
    color: '#F0B90B',
    chainType: 'evm',
    nativeCurrency: { symbol: 'BNB', name: 'BNB', decimals: 18 },
    wrappedNative: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    stablecoins: new Set([
      '0x55d398326f99059ff775485246999027b3197955', // USDT
      '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
      '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
    ]),
    geckoTerminalSlug: 'bsc',
    goplusChainId: '56',
    moralisChain: 'bsc',
    bubblemapsChain: 'bsc',
    explorer: {
      url: 'https://bscscan.com',
      name: 'BscScan',
      addressPath: '/address/',
      tokenPath: '/token/',
      txPath: '/tx/',
    },
    rpcUrl: 'https://bsc-dataseed.binance.org',
    trustWalletChain: 'binance',
    swapUrl: (addr) =>
      `https://pancakeswap.finance/swap?outputCurrency=${addr}&chain=bsc`,
    isValidAddress: (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr),
    subgraphId: undefined,
    dexes: ['pancakeswap_v3', 'pancakeswap_v2'],
  },

  solana: {
    slug: 'solana',
    name: 'Solana',
    shortName: 'SOL',
    icon: '/branding/solana-icon.svg',
    color: '#9945FF',
    chainType: 'svm',
    nativeCurrency: { symbol: 'SOL', name: 'Solana', decimals: 9 },
    wrappedNative: 'So11111111111111111111111111111111111111112',
    stablecoins: new Set([
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  // USDT
    ]),
    geckoTerminalSlug: 'solana',
    goplusChainId: 'solana',
    moralisChain: 'solana',
    bubblemapsChain: 'sol',
    explorer: {
      url: 'https://solscan.io',
      name: 'Solscan',
      addressPath: '/account/',
      tokenPath: '/token/',
      txPath: '/tx/',
    },
    rpcUrl: 'https://solana-rpc.publicnode.com',
    trustWalletChain: 'solana',
    swapUrl: (addr) => `https://jup.ag/swap/SOL-${addr}`,
    isValidAddress: (addr) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr),
    subgraphId: undefined,
    dexes: ['raydium', 'orca', 'meteora'],
  },
}

export const DEFAULT_CHAIN: ChainSlug = 'base'
export const SUPPORTED_CHAINS = Object.keys(CHAINS) as ChainSlug[]

export function getChain(slug: ChainSlug): ChainConfig {
  return CHAINS[slug] ?? CHAINS[DEFAULT_CHAIN]
}

export function explorerLink(chain: ChainSlug, type: 'address' | 'token' | 'tx', value: string): string {
  const c = getChain(chain)
  const path = type === 'address' ? c.explorer.addressPath
    : type === 'token' ? c.explorer.tokenPath
      : c.explorer.txPath
  return `${c.explorer.url}${path}${value}`
}

/** Normalize address for comparison: lowercase for EVM, unchanged for Solana (base58 is case-sensitive) */
export function normalizeAddr(chain: ChainSlug, addr: string): string {
  return getChain(chain).chainType === 'svm' ? addr : addr.toLowerCase()
}

/** Case-aware address equality */
export function addrEq(chain: ChainSlug, a: string, b: string): boolean {
  return normalizeAddr(chain, a) === normalizeAddr(chain, b)
}

export function isQuoteToken(chain: ChainSlug, address: string): boolean {
  const c = getChain(chain)
  // Solana addresses are case-sensitive (base58), EVM addresses are not
  if (c.chainType === 'svm') {
    return address === c.wrappedNative || c.stablecoins.has(address)
  }
  const lower = address.toLowerCase()
  return lower === c.wrappedNative.toLowerCase() || c.stablecoins.has(lower)
}

// ─── DEX display info ─────────────────────────────────────────

export interface DexInfo {
  label: string       // e.g. "Uniswap V3", "PancakeSwap V3"
  shortLabel: string  // e.g. "V3", "PCS V3", "Ray"
  icon: string | null // icon path, null = text-only badge
}

const DEX_REGISTRY: Record<string, DexInfo> = {
  // Base
  uniswap_v3:     { label: 'Uniswap V3',     shortLabel: 'V3',      icon: '/branding/uniswap-icon.svg' },
  uniswap_v4:     { label: 'Uniswap V4',     shortLabel: 'V4',      icon: '/branding/uniswap-icon.svg' },
  aerodrome:      { label: 'Aerodrome',       shortLabel: 'Aero',    icon: null },
  // BNB
  pancakeswap_v2: { label: 'PancakeSwap V2',  shortLabel: 'PCS V2',  icon: null },
  pancakeswap_v3: { label: 'PancakeSwap V3',  shortLabel: 'PCS V3',  icon: null },
  // Solana
  raydium:        { label: 'Raydium',         shortLabel: 'Ray',     icon: null },
  orca:           { label: 'Orca',            shortLabel: 'Orca',    icon: null },
  meteora:        { label: 'Meteora',         shortLabel: 'Met',     icon: null },
}

export function getDexInfo(dexId: string): DexInfo {
  return DEX_REGISTRY[dexId] ?? { label: dexId, shortLabel: dexId.slice(0, 6), icon: null }
}

export function trustWalletLogo(chain: ChainSlug, address: string): string {
  const c = getChain(chain)
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${c.trustWalletChain}/assets/${address}/logo.png`
}
