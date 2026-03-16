import { getChain, type ChainSlug } from './chains'

/* ── Types ─────────────────────────────────────────────── */

export interface FollowedWallet {
  address: string
  chain: ChainSlug
  followedAt: string // ISO
}

export interface FollowedWalletsState {
  version: 1
  wallets: FollowedWallet[]
}

export interface MoralisErc20Transfer {
  transaction_hash: string
  address: string          // token contract
  from_address: string
  to_address: string
  value: string            // raw (wei)
  value_decimal: string | null
  token_name: string
  token_symbol: string
  token_decimals: string
  token_logo: string | null
  block_timestamp: string
  block_number: string
}

export interface DetectedSwap {
  txHash: string
  walletAddress: string
  timestamp: string
  blockNumber: string
  transactionType: 'buy' | 'sell' | string
  tokenSold: {
    address: string
    symbol: string
    name: string
    amount: string
    usdAmount: number
    logo: string | null
  }
  tokenBought: {
    address: string
    symbol: string
    name: string
    amount: string
    usdAmount: number
    logo: string | null
  }
  totalValueUsd: number
  pairLabel: string
  exchangeLogo: string | null
  chain: ChainSlug
}

/* ── Constants ─────────────────────────────────────────── */

export const MAX_FOLLOWED_WALLETS = 20
export const STORAGE_KEY = 'followed_wallets_v1'
export const POLL_INTERVAL_MS = 120_000

/* ── Swap detection ────────────────────────────────────── */

/**
 * Groups ERC20 transfers by transaction hash.
 * If a wallet both sent and received tokens in the same tx → it's a swap.
 */
export function detectSwapsFromTransfers(
  transfers: MoralisErc20Transfer[],
  walletAddress: string,
  chain: ChainSlug,
): DetectedSwap[] {
  const byTx = new Map<string, MoralisErc20Transfer[]>()
  for (const t of transfers) {
    const list = byTx.get(t.transaction_hash) || []
    list.push(t)
    byTx.set(t.transaction_hash, list)
  }

  const walletLower = walletAddress.toLowerCase()
  const swaps: DetectedSwap[] = []

  for (const [txHash, txTransfers] of byTx) {
    const sent = txTransfers.filter(t => t.from_address.toLowerCase() === walletLower)
    const received = txTransfers.filter(t => t.to_address.toLowerCase() === walletLower)

    if (sent.length >= 1 && received.length >= 1) {
      const s = sent[0]
      const r = received[0]

      swaps.push({
        txHash,
        walletAddress,
        timestamp: s.block_timestamp,
        blockNumber: s.block_number,
        transactionType: '',
        tokenSold: {
          address: s.address,
          symbol: s.token_symbol || '???',
          name: s.token_name || '',
          amount: s.value_decimal || formatRawValue(s.value, s.token_decimals),
          usdAmount: 0,
          logo: s.token_logo,
        },
        tokenBought: {
          address: r.address,
          symbol: r.token_symbol || '???',
          name: r.token_name || '',
          amount: r.value_decimal || formatRawValue(r.value, r.token_decimals),
          usdAmount: 0,
          logo: r.token_logo,
        },
        totalValueUsd: 0,
        pairLabel: '',
        exchangeLogo: null,
        chain,
      })
    }
  }

  return swaps.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

/** Fallback: convert raw value to human readable using decimals */
function formatRawValue(value: string, decimals: string): string {
  try {
    const d = parseInt(decimals, 10)
    if (!d || d <= 0) return value
    const n = BigInt(value)
    const divisor = BigInt(10) ** BigInt(d)
    const whole = n / divisor
    const frac = n % divisor
    const fracStr = frac.toString().padStart(d, '0').slice(0, 4)
    return `${whole}.${fracStr}`
  } catch {
    return value
  }
}

/* ── Build DEX swap URL ────────────────────────────────── */

export function buildSwapUrl(swap: DetectedSwap): string {
  const chainConfig = getChain(swap.chain)
  return chainConfig.swapUrl(swap.tokenBought.address)
}
