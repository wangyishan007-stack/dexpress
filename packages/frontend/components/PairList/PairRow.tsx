import Link from 'next/link'
import clsx from 'clsx'
import type { Pool } from '@dex/shared'
import { fmtPrice, fmtUsd, fmtAge, fmtNum } from '../../lib/formatters'

/* ─── column layout (must match header) ─────────────────── */
const COLS = 'grid-cols-[36px_minmax(190px,2.5fr)_100px_60px_80px_90px_70px_68px_68px_68px_68px_90px_90px]'

// "报价"代币地址（小写）—— 这类代币作为 quote，另一边的 token 为主角
const QUOTE_TOKEN_ADDRS = new Set([
  '0x4200000000000000000000000000000000000006', // WETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
])

/* ─── helpers ─────────────────────────────────────────────── */
function PctCell({ v, className }: { v: number; className?: string }) {
  if (!v && v !== 0) return <span className={clsx('text-sub text-right tabular', className)}>—</span>
  const pos = v > 0
  const neg = v < 0
  return (
    <span className={clsx(
      'text-right tabular font-medium text-[11px] md:text-[12px]',
      pos && 'text-green',
      neg && 'text-red',
      !pos && !neg && 'text-sub',
      className
    )}>
      {pos ? '+' : ''}{v.toFixed(2)}%
    </span>
  )
}

// 地址哈希 → HSL 色相（固定饱和度/亮度）
function addrToHue(address: string): number {
  let h = 0
  for (let i = 2; i < address.length; i++) {
    h = (h * 31 + address.charCodeAt(i)) >>> 0
  }
  return h % 360
}

// Token 头像：Logo 优先，404 时退回地址色相 identicon
function TokenAvatar({ symbol, logoUrl, address, size = 22 }: { symbol: string; logoUrl: string | null; address: string; size?: number }) {
  const hue = addrToHue(address)
  return (
    <div
      className="relative flex items-center justify-center rounded-full overflow-hidden"
      style={{ backgroundColor: `hsl(${hue},55%,20%)`, width: size, height: size }}
    >
      <span
        className="text-[9px] font-bold select-none"
        style={{ color: `hsl(${hue},70%,72%)` }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </span>
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={symbol}
          width={size}
          height={size}
          className="absolute inset-0 rounded-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
    </div>
  )
}

// DEX 徽标：只显示 "V3" / "V4" / "Aero"，多池时附加 "+N"
function DexBadge({
  dex,
  extraPools = 0,
}: {
  dex: string
  extraPools?: number
}) {
  const label =
    dex === 'uniswap_v3' ? 'V3' :
    dex === 'uniswap_v4' ? 'V4' :
    dex === 'aerodrome'  ? 'Aero' : 'DEX'
  // Dot color per DEX
  const dotColor =
    dex === 'aerodrome' ? '#f97316' : '#2744FF'  // orange for Aero, blue for Uni
  const extraStr = extraPools > 0 ? ` +${extraPools}` : ''
  return (
    <span className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold text-sub border border-border whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
      {label}{extraStr}
    </span>
  )
}

/* ─── Row ─────────────────────────────────────────────────── */
interface Props {
  pair:       Pool
  livePrice?: number
  flash?:     'up' | 'down'
  rank:       number
}

export function PairRow({ pair, livePrice, flash, rank }: Props) {
  const price = livePrice ?? pair.price_usd

  // 优先将非稳定币 / 非 WETH 的 token 作为主角（base）
  const t0IsQuote = QUOTE_TOKEN_ADDRS.has(pair.token0.address.toLowerCase())
  const t1IsQuote = QUOTE_TOKEN_ADDRS.has(pair.token1.address.toLowerCase())
  const [base, quote] = t0IsQuote && !t1IsQuote
    ? [pair.token1, pair.token0]
    : [pair.token0, pair.token1]

  // 计算有多少个额外的合并池
  const extraPools = pair.all_addresses ? pair.all_addresses.length - 1 : 0

  return (
    <Link
      href={`/pair/${pair.address}`}
      className={clsx(
        'block transition-colors hover:bg-surface/50 cursor-pointer',
        flash === 'up'   && 'animate-flash-green',
        flash === 'down' && 'animate-flash-red'
      )}
    >
      {/* ── Mobile card ───────────────────────────────────── */}
      <div className="flex md:hidden items-center gap-2.5 px-3 h-[64px] border-b border-muted">
        {/* Rank */}
        <span className="text-sub text-[11px] w-[22px] text-right flex-shrink-0">#{rank}</span>

        {/* Single avatar */}
        <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={28} />

        {/* Name + symbol */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-text text-[13px] truncate">{base.symbol}</span>
            <span className="text-sub text-[10px]">/ {quote.symbol}</span>
          </div>
          <div className="text-[10px] text-sub/70 truncate">
            {base.name !== base.symbol ? base.name : pair.address.slice(0, 8) + '…'}
          </div>
        </div>

        {/* Price */}
        <div className="flex flex-col items-end flex-shrink-0">
          <span className={clsx(
            'tabular font-mono text-[12px]',
            flash === 'up'   ? 'text-green' :
            flash === 'down' ? 'text-red'   : 'text-text'
          )}>
            {fmtPrice(price)}
          </span>
          <PctCell v={pair.change_24h} className="text-[10px]" />
        </div>

        {/* MCap */}
        <span className="tabular text-right text-sub text-[10px] w-[52px] flex-shrink-0">
          {pair.mcap_usd > 0 ? fmtUsd(pair.mcap_usd) : '—'}
        </span>
      </div>

      {/* ── Desktop grid ──────────────────────────────────── */}
      <div className={clsx(
        `hidden md:grid ${COLS} items-center gap-x-2`,
        'border-b border-muted h-[70px] px-4 text-[12px]'
      )}>
        {/* # Rank */}
        <span className="text-sub text-right text-[11px]">#{rank}</span>

        {/* Token column */}
        <div className="flex min-w-0 items-center gap-2">
          {/* Overlapping token avatars */}
          <div className="relative flex-shrink-0 w-[34px] h-[22px]">
            <div className="absolute left-0 top-0 z-10 ring-1 ring-bg rounded-full">
              <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} />
            </div>
            <div className="absolute left-[13px] top-0 z-0 ring-1 ring-bg rounded-full">
              <TokenAvatar symbol={quote.symbol} logoUrl={quote.logo_url} address={quote.address} />
            </div>
          </div>

          {/* DEX + 费率 + 多池标记 */}
          <DexBadge dex={pair.dex} extraPools={extraPools} />

          {/* Symbols */}
          <div className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-semibold text-text truncate">{base.symbol}</span>
              <span className="text-sub text-[11px]">/ {quote.symbol}</span>
            </div>
            <div className="text-[10px] text-sub/70 truncate">
              {base.name !== base.symbol ? base.name : pair.address.slice(0, 8) + '…'}
            </div>
          </div>
        </div>

        {/* Price */}
        <span className={clsx(
          'tabular font-mono text-right',
          flash === 'up'   ? 'text-green' :
          flash === 'down' ? 'text-red'   : 'text-text'
        )}>
          {fmtPrice(price)}
        </span>

        {/* Age */}
        <span className="text-sub text-right">{fmtAge(pair.created_at)}</span>

        {/* Txns */}
        <span className="tabular text-right text-text">{fmtNum(pair.txns_1h)}</span>

        {/* Volume */}
        <span className="tabular text-right text-text">{fmtUsd(pair.volume_1h)}</span>

        {/* Makers */}
        <span className="tabular text-right text-sub">{pair.holder_count ? fmtNum(pair.holder_count) : '—'}</span>

        {/* 5M / 1H / 6H / 24H */}
        <PctCell v={pair.change_5m}  />
        <PctCell v={pair.change_1h}  />
        <PctCell v={pair.change_6h}  />
        <PctCell v={pair.change_24h} />

        {/* Liquidity */}
        <span className="tabular text-right text-sub">{fmtUsd(pair.liquidity_usd)}</span>

        {/* MCap */}
        <span className="tabular text-right text-sub">{pair.mcap_usd > 0 ? fmtUsd(pair.mcap_usd) : '—'}</span>
      </div>
    </Link>
  )
}

/* ─── Header ─────────────────────────────────────────────── */
const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <span className={clsx('text-[14px] font-medium text-header', right && 'text-right')}>
    {children}
  </span>
)

export function PairRowHeader() {
  return (
    <div className={`hidden md:grid ${COLS} items-center gap-x-2 border-b border-muted bg-surface px-4 py-3 sticky top-0 z-10`}>
      <TH right>#</TH>
      <TH>Token</TH>
      <TH right>Price</TH>
      <TH right>Age</TH>
      <TH right>Txns</TH>
      <TH right>Volume</TH>
      <TH right>Makers</TH>
      <TH right>5M</TH>
      <TH right>1H</TH>
      <TH right>6H</TH>
      <TH right>24H</TH>
      <TH right>Liquidity</TH>
      <TH right>MCap</TH>
    </div>
  )
}
