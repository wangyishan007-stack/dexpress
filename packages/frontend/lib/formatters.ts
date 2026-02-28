/** Coerce any input (string, null, bigint, undefined) to a finite float, or null */
function toNum(n: unknown): number | null {
  if (n === null || n === undefined) return null
  const v = typeof n === 'bigint' ? Number(n) : Number(n)
  return Number.isFinite(v) ? v : null
}

/** Format USD amounts (e.g. $1.23M, $456K) */
export function fmtUsd(n: unknown, compact = true): string {
  const v = toNum(n)
  if (v === null || v === 0) return '$0'
  if (compact) {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`
    if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000)         return `$${(v / 1_000).toFixed(1)}K`
  }
  if (v < 0.0001) return `$${v.toExponential(2)}`
  if (v < 1)      return `$${v.toPrecision(4)}`
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

/** Format token price with appropriate precision */
export function fmtPrice(n: unknown): string {
  const v = toNum(n)
  if (v === null || v === 0) return '$0'
  if (v >= 1000)   return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (v >= 1)      return `$${v.toFixed(2)}`
  if (v >= 0.0001) return `$${v.toFixed(6)}`
  if (v >= 1e-9)   return `$${v.toFixed(10)}`
  return `$${v.toExponential(4)}`
}

/** Format percentage change */
export function fmtPct(n: unknown): string {
  const v = toNum(n)
  if (v === null || v === 0) return '0%'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

/** Format large numbers (e.g. 1.2M) */
export function fmtNum(n: unknown): string {
  const v = toNum(n)
  if (v === null || v === 0) return '0'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString('en-US')
}

/** Format age from timestamp */
export function fmtAge(dateStr: string): string {
  const ms      = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours   = Math.floor(minutes / 60)
  const days    = Math.floor(hours / 24)

  if (days    > 0) return `${days}d`
  if (hours   > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

/** Shorten wallet address */
export function shortAddr(addr: string): string {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
