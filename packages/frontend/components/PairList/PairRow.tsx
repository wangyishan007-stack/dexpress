import Link from 'next/link'
import clsx from 'clsx'
import type { Pool, TimeWindow } from '@dex/shared'
import { fmtPrice, fmtUsd, fmtAge, fmtNum } from '../../lib/formatters'
import { WatchToggle } from '../WatchToggle'
import { getVisibleColumns, buildGridCols, buildDataGridCols, DEFAULT_DATA_GRID } from '../../lib/columnConfig'
import type { ScreenerConfig, ColumnDef } from '../../lib/columnConfig'

// "报价"代币地址（小写）
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

function addrToHue(address: string): number {
  let h = 0
  for (let i = 2; i < address.length; i++) {
    h = (h * 31 + address.charCodeAt(i)) >>> 0
  }
  return h % 360
}

function TokenAvatar({ symbol, logoUrl, address, size = 22, rounded = 'full' }: { symbol: string; logoUrl: string | null; address: string; size?: number; rounded?: 'full' | 'md' }) {
  const hue = addrToHue(address)
  const rCls = rounded === 'md' ? 'rounded-md' : 'rounded-full'
  return (
    <div
      className={clsx('relative flex items-center justify-center overflow-hidden flex-shrink-0', rCls)}
      style={{ backgroundColor: `hsl(${hue},55%,20%)`, width: size, height: size }}
    >
      <span
        className="font-bold select-none"
        style={{ color: `hsl(${hue},70%,72%)`, fontSize: Math.max(9, size * 0.36) }}
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
          className={clsx('absolute inset-0 object-cover', rCls)}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
    </div>
  )
}

function DexBadge({ dex, extraPools = 0 }: { dex: string; extraPools?: number }) {
  const label =
    dex === 'uniswap_v3' ? 'V3' :
    dex === 'uniswap_v4' ? 'V4' :
    dex === 'aerodrome'  ? 'Aero' : 'DEX'
  const extraStr = extraPools > 0 ? ` +${extraPools}` : ''
  return (
    <span className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold text-sub border border-border whitespace-nowrap">
      {label}{extraStr}
    </span>
  )
}

function getBaseQuote(pair: Pool) {
  const t0IsQuote = QUOTE_TOKEN_ADDRS.has(pair.token0.address.toLowerCase())
  const t1IsQuote = QUOTE_TOKEN_ADDRS.has(pair.token1.address.toLowerCase())
  return t0IsQuote && !t1IsQuote
    ? [pair.token1, pair.token0] as const
    : [pair.token0, pair.token1] as const
}

/* ─── Cell renderer ──────────────────────────────────────── */
function renderCell(
  key: string,
  pair: Pool,
  timeWindow: TimeWindow,
  price: number,
  flash?: 'up' | 'down',
): React.ReactNode {
  const txns   = pair[`txns_${timeWindow}`   as keyof Pool] as number
  const volume = pair[`volume_${timeWindow}` as keyof Pool] as number
  const makers = pair[`makers_${timeWindow}` as keyof Pool] as number

  switch (key) {
    case 'price':
      return (
        <span className={clsx(
          'tabular font-mono',
          flash === 'up'   ? 'text-green' :
          flash === 'down' ? 'text-red'   : 'text-text'
        )}>
          {fmtPrice(price)}
        </span>
      )
    case 'age':
      return <span className="text-sub">{fmtAge(pair.created_at)}</span>
    case 'transactions':
      return <span className="tabular text-text">{fmtNum(txns)}</span>
    case 'volume':
      return <span className="tabular text-text">{fmtUsd(volume)}</span>
    case 'makers':
      return <span className="tabular text-sub">{makers ? fmtNum(makers) : '—'}</span>
    case '5m':
      return <PctCell v={pair.change_5m} />
    case '1h':
      return <PctCell v={pair.change_1h} />
    case '6h':
      return <PctCell v={pair.change_6h} />
    case '24h':
      return <PctCell v={pair.change_24h} />
    case 'liquidity':
      return <span className="tabular text-sub">{fmtUsd(pair.liquidity_usd)}</span>
    case 'mcap':
      return <span className="tabular text-sub">{pair.mcap_usd > 0 ? fmtUsd(pair.mcap_usd) : '—'}</span>
    default:
      return <span className="text-sub">—</span>
  }
}

/* ─── Mobile Row ─────────────────────────────────────────── */
interface PairRowProps {
  pair:          Pool
  livePrice?:    number
  flash?:        'up' | 'down'
  rank:          number
  timeWindow:    TimeWindow
  showStar?:     boolean
  columnConfig?: ScreenerConfig
}

export function PairRow({ pair, livePrice, flash, rank, showStar = false }: PairRowProps) {
  const price = livePrice ?? pair.price_usd
  const [base, quote] = getBaseQuote(pair)

  return (
    <Link
      href={`/pair/${pair.address}`}
      className={clsx(
        'block transition-colors hover:bg-surface/50 cursor-pointer',
        flash === 'up'   && 'animate-flash-green',
        flash === 'down' && 'animate-flash-red'
      )}
    >
      <div className="flex items-center gap-2.5 px-3 h-[64px] border-b border-border">
        {showStar && <WatchToggle address={pair.address} size={14} />}

        <span className="text-sub text-[11px] w-[22px] text-right flex-shrink-0">#{rank}</span>
        <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={28} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-text text-[13px] truncate">${base.symbol}</span>
            <span className="text-sub text-[10px]">/ {quote.symbol}</span>
          </div>
          <div className="text-[10px] text-sub/70 truncate">
            {base.name !== base.symbol ? base.name : pair.address.slice(0, 8) + '…'}
          </div>
        </div>

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

        <span className="tabular text-right text-sub text-[10px] w-[52px] flex-shrink-0">
          {pair.mcap_usd > 0 ? fmtUsd(pair.mcap_usd) : '—'}
        </span>
      </div>
    </Link>
  )
}

/* ─── Desktop Frozen Row (left panel — token info) ───────── */
interface FrozenProps {
  pair:       Pool
  rank:       number
  flash?:     'up' | 'down'
  showStar?:  boolean
}

export function PairRowFrozen({ pair, rank, flash, showStar = false }: FrozenProps) {
  const [base, quote] = getBaseQuote(pair)
  const extraPools = pair.all_addresses ? pair.all_addresses.length - 1 : 0

  return (
    <Link
      href={`/pair/${pair.address}`}
      className={clsx(
        'flex items-center gap-2 h-[70px] px-4 border-b border-border transition-colors hover:bg-surface/50 cursor-pointer text-[12px]',
        flash === 'up'   && 'animate-flash-green',
        flash === 'down' && 'animate-flash-red'
      )}
    >
      {showStar && <WatchToggle address={pair.address} size={14} />}

      <span className="text-sub text-right text-[11px] w-[36px] flex-shrink-0">#{rank}</span>

      <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={30} rounded="md" />

      <DexBadge dex={pair.dex} extraPools={extraPools} />

      <div className="min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-semibold text-text truncate">${base.symbol}</span>
          <span className="text-sub text-[11px]">/ {quote.symbol}</span>
        </div>
        <div className="text-[10px] text-sub/70 truncate">
          {base.name !== base.symbol ? base.name : pair.address.slice(0, 8) + '…'}
        </div>
      </div>
    </Link>
  )
}

/* ─── Desktop Data Row (right panel — scrollable columns) ── */
interface DataProps {
  pair:          Pool
  livePrice?:    number
  flash?:        'up' | 'down'
  timeWindow:    TimeWindow
  columnConfig?: ScreenerConfig
}

export function PairRowData({ pair, livePrice, flash, timeWindow, columnConfig }: DataProps) {
  const price = livePrice ?? pair.price_usd
  const visCols = columnConfig ? getVisibleColumns(columnConfig) : undefined
  const gridTemplate = visCols ? buildDataGridCols(visCols) : DEFAULT_DATA_GRID

  return (
    <Link
      href={`/pair/${pair.address}`}
      className={clsx(
        'block transition-colors hover:bg-surface/50 cursor-pointer',
        flash === 'up'   && 'animate-flash-green',
        flash === 'down' && 'animate-flash-red'
      )}
    >
      <div
        className="grid items-center gap-x-2 h-[70px] px-4 border-b border-border text-[12px]"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {visCols
          ? visCols.map(col => (
              <div key={col.key} className="text-right">{renderCell(col.key, pair, timeWindow, price, flash)}</div>
            ))
          : <>
              <div className="text-right">{renderCell('price', pair, timeWindow, price, flash)}</div>
              <div className="text-right">{renderCell('age', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('transactions', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('volume', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('makers', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('5m', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('1h', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('6h', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('24h', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('liquidity', pair, timeWindow, price)}</div>
              <div className="text-right">{renderCell('mcap', pair, timeWindow, price)}</div>
            </>
        }
      </div>
    </Link>
  )
}

/* ─── Desktop Frozen Header (left panel) ─────────────────── */
export function PairRowHeaderFrozen({ showStar = false }: { showStar?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
      {showStar && <span className="w-[14px]" />}
      <span className="text-[14px] font-medium text-header text-right w-[36px] flex-shrink-0">#</span>
      <span className="text-[14px] font-medium text-header">Token</span>
    </div>
  )
}

/* ─── Desktop Data Header (right panel) ──────────────────── */
export function PairRowHeaderData({ columnConfig }: { columnConfig?: ScreenerConfig }) {
  const visCols = columnConfig ? getVisibleColumns(columnConfig) : undefined
  const gridTemplate = visCols ? buildDataGridCols(visCols) : DEFAULT_DATA_GRID

  return (
    <div
      className="grid items-center gap-x-2 px-4 py-3 border-b border-border bg-surface text-[14px]"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {visCols
        ? visCols.map(col => (
            <span key={col.key} className="font-medium text-header text-right">{col.headerLabel}</span>
          ))
        : <>
            <span className="font-medium text-header text-right">Price</span>
            <span className="font-medium text-header text-right">Age</span>
            <span className="font-medium text-header text-right">Txns</span>
            <span className="font-medium text-header text-right">Volume</span>
            <span className="font-medium text-header text-right">Makers</span>
            <span className="font-medium text-header text-right">5M</span>
            <span className="font-medium text-header text-right">1H</span>
            <span className="font-medium text-header text-right">6H</span>
            <span className="font-medium text-header text-right">24H</span>
            <span className="font-medium text-header text-right">Liquidity</span>
            <span className="font-medium text-header text-right">MCap</span>
          </>
      }
    </div>
  )
}

/* ─── Full-width Header (used for loading/empty states) ──── */
const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <span className={clsx('text-[14px] font-medium text-header', right && 'text-right')}>
    {children}
  </span>
)

export function PairRowHeader({ showStar = false, columnConfig }: { showStar?: boolean; columnConfig?: ScreenerConfig }) {
  const visCols = columnConfig ? getVisibleColumns(columnConfig) : undefined
  const gridTemplate = visCols
    ? buildGridCols(visCols, showStar)
    : undefined

  return (
    <div
      className={clsx(
        'hidden md:grid items-center gap-x-2 border-b border-border bg-surface px-4 py-3 sticky top-0 z-10',
        !gridTemplate && (showStar
          ? 'grid-cols-[28px_36px_1fr_100px_60px_80px_90px_70px_68px_68px_68px_68px_90px_90px]'
          : 'grid-cols-[36px_1fr_100px_60px_80px_90px_70px_68px_68px_68px_68px_90px_90px]')
      )}
      style={gridTemplate ? { gridTemplateColumns: gridTemplate } : undefined}
    >
      {showStar && <span />}
      <TH right>#</TH>
      <TH>Token</TH>
      {visCols
        ? visCols.map(col => <TH key={col.key} right>{col.headerLabel}</TH>)
        : <>
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
          </>
      }
    </div>
  )
}
