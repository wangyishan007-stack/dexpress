/* ── Mock data for Pair Detail tabs ─────────────────────── */

export interface TopTrader {
  rank: number
  maker: string
  bought: number
  sold: number
  pnl: number
  unrealized: number
  balance: number
  txns: number
}

export interface Holder {
  rank: number
  address: string
  percentage: number
  amount: number
  value: number
  txns: number
}

export interface LiquidityProvider {
  rank: number
  address: string
  percentage: number
  amount: number
  txns: number
}

export const MOCK_TOP_TRADERS: TopTrader[] = [
  { rank: 1,  maker: '0x7a16fF8270133F063aAb6C9977183D9e72835428', bought: 284320, sold: 192100, pnl: 92220,  unrealized: 41800, balance: 133500, txns: 87 },
  { rank: 2,  maker: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', bought: 198500, sold: 245300, pnl: -46800, unrealized: 0,     balance: 0,      txns: 124 },
  { rank: 3,  maker: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', bought: 175400, sold: 112000, pnl: 63400,  unrealized: 28900, balance: 92300,  txns: 56 },
  { rank: 4,  maker: '0x28C6c06298d514Db089934071355E5743bf21d60', bought: 156800, sold: 178200, pnl: -21400, unrealized: 0,     balance: 0,      txns: 203 },
  { rank: 5,  maker: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', bought: 134200, sold: 89700,  pnl: 44500,  unrealized: 18200, balance: 62700,  txns: 43 },
  { rank: 6,  maker: '0x56Eddb7aa87536c09CCc2793473599fD21A8b17F', bought: 112900, sold: 134600, pnl: -21700, unrealized: 0,     balance: 0,      txns: 98 },
  { rank: 7,  maker: '0x8894E0a0c962CB723c1ef8a1B83d024A3e3aDA62', bought: 98700,  sold: 67400,  pnl: 31300,  unrealized: 12400, balance: 43700,  txns: 31 },
  { rank: 8,  maker: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', bought: 87600,  sold: 102300, pnl: -14700, unrealized: 0,     balance: 0,      txns: 67 },
  { rank: 9,  maker: '0x1DB3439a222C519ab44bb1144fC28167b4Fa6EE6', bought: 76200,  sold: 52800,  pnl: 23400,  unrealized: 9800,  balance: 33200,  txns: 28 },
  { rank: 10, maker: '0xC098B2a3Aa256D2140208C3de6543aAEf5cd3A94', bought: 64300,  sold: 78900,  pnl: -14600, unrealized: 0,     balance: 0,      txns: 55 },
  { rank: 11, maker: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', bought: 54800,  sold: 38200,  pnl: 16600,  unrealized: 7200,  balance: 23800,  txns: 19 },
  { rank: 12, maker: '0xF977814e90dA44bFA03b6295A0616a897441aceC', bought: 48200,  sold: 56700,  pnl: -8500,  unrealized: 0,     balance: 0,      txns: 41 },
]

export const MOCK_HOLDERS: Holder[] = [
  { rank: 1,  address: '0x7a16fF8270133F063aAb6C9977183D9e72835428', percentage: 14.2, amount: 142000000, value: 284000, txns: 87 },
  { rank: 2,  address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', percentage: 8.7,  amount: 87000000,  value: 174000, txns: 56 },
  { rank: 3,  address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', percentage: 6.3,  amount: 63000000,  value: 126000, txns: 43 },
  { rank: 4,  address: '0x8894E0a0c962CB723c1ef8a1B83d024A3e3aDA62', percentage: 4.8,  amount: 48000000,  value: 96000,  txns: 31 },
  { rank: 5,  address: '0x1DB3439a222C519ab44bb1144fC28167b4Fa6EE6', percentage: 3.5,  amount: 35000000,  value: 70000,  txns: 28 },
  { rank: 6,  address: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503', percentage: 2.9,  amount: 29000000,  value: 58000,  txns: 19 },
  { rank: 7,  address: '0xC098B2a3Aa256D2140208C3de6543aAEf5cd3A94', percentage: 2.4,  amount: 24000000,  value: 48000,  txns: 55 },
  { rank: 8,  address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', percentage: 1.8,  amount: 18000000,  value: 36000,  txns: 124 },
  { rank: 9,  address: '0xF977814e90dA44bFA03b6295A0616a897441aceC', percentage: 1.5,  amount: 15000000,  value: 30000,  txns: 41 },
  { rank: 10, address: '0x56Eddb7aa87536c09CCc2793473599fD21A8b17F', percentage: 1.2,  amount: 12000000,  value: 24000,  txns: 98 },
]

export const MOCK_LIQUIDITY_PROVIDERS: LiquidityProvider[] = [
  { rank: 1,  address: '0x28C6c06298d514Db089934071355E5743bf21d60', percentage: 22.4, amount: 448000, txns: 12 },
  { rank: 2,  address: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', percentage: 15.8, amount: 316000, txns: 8 },
  { rank: 3,  address: '0x7a16fF8270133F063aAb6C9977183D9e72835428', percentage: 11.3, amount: 226000, txns: 5 },
  { rank: 4,  address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', percentage: 8.6,  amount: 172000, txns: 3 },
  { rank: 5,  address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', percentage: 6.2,  amount: 124000, txns: 4 },
  { rank: 6,  address: '0x56Eddb7aa87536c09CCc2793473599fD21A8b17F', percentage: 4.9,  amount: 98000,  txns: 6 },
  { rank: 7,  address: '0x8894E0a0c962CB723c1ef8a1B83d024A3e3aDA62', percentage: 3.7,  amount: 74000,  txns: 2 },
  { rank: 8,  address: '0x1DB3439a222C519ab44bb1144fC28167b4Fa6EE6', percentage: 2.5,  amount: 50000,  txns: 3 },
]
