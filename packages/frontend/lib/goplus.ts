/**
 * GoPlus Security API client
 * Free, no API key required.
 * Endpoint: GET /api/v1/token_security/{chainId}?contract_addresses={address}
 */

const GOPLUS_BASE = 'https://api.gopluslabs.io/api/v1'
const BASE_CHAIN_ID = '8453'

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
  is_contract: number
  balance: string
  percent: string
  is_locked: number
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

export async function fetchTokenSecurity(tokenAddress: string): Promise<GoPlusResult | null> {
  try {
    const res = await fetch(
      `${GOPLUS_BASE}/token_security/${BASE_CHAIN_ID}?contract_addresses=${tokenAddress}`,
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
