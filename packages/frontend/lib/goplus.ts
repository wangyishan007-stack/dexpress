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
    const chainId = getChain(chain).goplusChainId
    const res = await fetch(
      `${GOPLUS_BASE}/token_security/${chainId}?contract_addresses=${tokenAddress}`,
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.result
    if (!result) return null

    // GoPlus returns results keyed by lowercase address
    const key = Object.keys(result)[0]
    return key ? result[key] : null
  } catch (e) {
    console.error('[GoPlus] fetch error:', e)
    return null
  }
}
