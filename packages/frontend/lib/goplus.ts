/**
 * GoPlus Security API client
 * Free, no API key required.
 * Endpoint: GET /api/v1/token_security/{chainId}?contract_addresses={address}
 */

import { getChain, DEFAULT_CHAIN, type ChainSlug } from './chains'

const GOPLUS_BASE = 'https://api.gopluslabs.io/api/v1'

export interface GoPlusHolder {
  address: string
  tag: string
  is_contract: number
  balance: string
  percent: string
  is_locked: number
}

export interface GoPlusLpHolder {
  address: string
  tag: string
  value: string
  is_contract: number
  balance: string
  percent: string
  is_locked: number
  NFT_list?: { NFT_id: string; amount: string; in_effect: string; NFT_percentage: string; value: string }[]
  locked_detail?: { amount: string; end_time: string; opt_time: string }[]
}

export interface GoPlusResult {
  token_name: string
  token_symbol: string
  total_supply: string
  holder_count: string

  is_honeypot: string
  is_open_source: string
  is_mintable: string
  is_proxy: string
  is_blacklisted: string
  is_whitelisted: string
  is_anti_whale: string
  is_in_dex: string

  buy_tax: string
  sell_tax: string
  slippage_modifiable: string
  transfer_pausable: string
  trading_cooldown: string
  cannot_buy: string
  cannot_sell_all: string
  external_call: string
  selfdestruct: string
  hidden_owner: string
  owner_change_balance: string
  personal_slippage_modifiable: string
  anti_whale_modifiable: string

  owner_address: string
  owner_balance: string
  owner_percent: string
  creator_address: string
  creator_balance: string
  creator_percent: string

  lp_holder_count: string
  lp_total_supply: string
  lp_holders: GoPlusLpHolder[]
  holders: GoPlusHolder[]

  honeypot_with_same_creator: number
}

export async function fetchTokenSecurity(tokenAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<GoPlusResult | null> {
  try {
    const chainConfig = getChain(chain)
    const isSolana = chainConfig.chainType === 'svm'

    // Solana uses a different endpoint path: /api/v1/solana/token_security
    const url = isSolana
      ? `${GOPLUS_BASE}/solana/token_security?contract_addresses=${tokenAddress}`
      : `${GOPLUS_BASE}/token_security/${chainConfig.goplusChainId}?contract_addresses=${tokenAddress}`

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.result
    if (!result) return null

    // GoPlus returns results keyed by address
    const key = Object.keys(result)[0]
    if (!key) return null
    const raw = result[key]

    // Solana response has different field structure — normalize to GoPlusResult
    if (isSolana) return normalizeSolanaResult(raw)
    return raw
  } catch (e) {
    console.error('[GoPlus] fetch error:', e)
    return null
  }
}

/** Map Solana GoPlus response to our GoPlusResult interface */
function normalizeSolanaResult(s: any): GoPlusResult {
  const meta = s.metadata || {}
  return {
    token_name:    meta.name || '',
    token_symbol:  meta.symbol || '',
    total_supply:  String(s.total_supply || '0'),
    holder_count:  String(s.holder_count || '0'),

    // Solana uses object { status: '0'|'1', authority: [] } instead of flat string
    is_honeypot:          '0', // Solana doesn't have honeypot detection
    is_open_source:       '1', // Solana programs are generally verifiable
    is_mintable:          s.mintable?.status || '0',
    is_proxy:             '0',
    is_blacklisted:       '0',
    is_whitelisted:       '0',
    is_anti_whale:        '0',
    is_in_dex:            '1',

    buy_tax:              '0',
    sell_tax:             '0',
    slippage_modifiable:  '0',
    transfer_pausable:    s.freezable?.status || '0',
    trading_cooldown:     '0',
    cannot_buy:           '0',
    cannot_sell_all:      '0',
    external_call:        '0',
    selfdestruct:         s.closable?.status || '0',
    hidden_owner:         '0',
    owner_change_balance: s.balance_mutable_authority?.status || '0',
    personal_slippage_modifiable: '0',
    anti_whale_modifiable: '0',

    owner_address:   '',
    owner_balance:   '0',
    owner_percent:   '0',
    creator_address: '',
    creator_balance: '0',
    creator_percent: '0',

    lp_holder_count: String(s.lp_holders?.length || '0'),
    lp_total_supply: '0',
    lp_holders:      Array.isArray(s.lp_holders) ? s.lp_holders : [],
    holders:         Array.isArray(s.holders) ? s.holders : [],

    honeypot_with_same_creator: 0,
  }
}
