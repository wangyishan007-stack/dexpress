import { useTranslations } from 'next-intl'
import Link from 'next/link'
import clsx from 'clsx'
import type { Pool, TimeWindow } from '@dex/shared'
import { fmtPrice, fmtUsd, fmtAge, fmtNum } from '../../lib/formatters'
import { WatchToggle } from '../WatchToggle'
import { TokenAvatar } from '../TokenAvatar'
import { getVisibleColumns, buildGridCols, buildDataGridCols, DEFAULT_DATA_GRID } from '../../lib/columnConfig'
import type { ScreenerConfig, ColumnDef } from '../../lib/columnConfig'
import { useChain } from '@/contexts/ChainContext'
import { isQuoteToken, getDexInfo, CHAINS, type ChainSlug } from '@/lib/chains'

/* ─── helpers ─────────────────────────────────────────────── */
function fmtPctValue(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e12) return `${v > 0 ? '+' : '-'}∞`
  if (abs >= 1e9)  return `${v > 0 ? '+' : ''}${(v / 1e9).toFixed(1)}B%`
  if (abs >= 1e6)  return `${v > 0 ? '+' : ''}${(v / 1e6).toFixed(1)}M%`
  if (abs >= 1e4)  return `${v > 0 ? '+' : ''}${(v / 1e3).toFixed(1)}K%`
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

function PctCell({ v, className }: { v: number; className?: string }) {
  if (!v && v !== 0) return <span className={clsx('text-sub text-right tabular', className)}>—</span>
  const pos = v > 0
  const neg = v < 0
  return (
    <span className={clsx(
      'text-right tabular font-medium text-[11px] md:text-[12px] truncate',
      pos && 'text-green',
      neg && 'text-red',
      !pos && !neg && 'text-sub',
      className
    )}>
      {fmtPctValue(v)}
    </span>
  )
}

// TokenAvatar imported from ../TokenAvatar

function DexBadge({ dex, extraPools = 0 }: { dex: string; extraPools?: number }) {
  const info = getDexInfo(dex)
  const extraStr = extraPools > 0 ? ` +${extraPools}` : ''
  return (
    <span className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold text-sub border border-border whitespace-nowrap">
      {info.shortLabel}{extraStr}
    </span>
  )
}

function getBaseQuote(pair: Pool, chain: import('@/lib/chains').ChainSlug) {
  const t0IsQuote = isQuoteToken(chain, pair.token0.address)
  const t1IsQuote = isQuoteToken(chain, pair.token1.address)
  return t0IsQuote && !t1IsQuote
    ? [pair.token1, pair.token0] as const
    : [pair.token0, pair.token1] as const
}

/* ─── Sparkline mini-chart ────────────────────────────────── */
function Sparkline({ data, width = 100, height = 30, positive }: {
  data: number[]
  width?: number
  height?: number
  positive: boolean
}) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const padY = 2
  const padX = 1
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const points = data
    .map((v, i) => {
      const x = padX + (i / (data.length - 1)) * innerW
      const y = padY + innerH - ((v - min) / range) * innerH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? '#2fe06b' : '#ff4466'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
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
    case 'chart':
      return <Sparkline data={pair.sparkline_data ?? []} positive={pair.change_24h >= 0} />
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
  const { chain } = useChain()
  const pairChain = (pair._chain as ChainSlug) || chain
  const price = livePrice ?? pair.price_usd
  const [base, quote] = getBaseQuote(pair, pairChain)

  return (
    <Link
      href={`/${pairChain}/pair/${pair.address}`}
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
            <span className="font-semibold text-text text-[13px] truncate" title={base.symbol}>${base.symbol}</span>
            <span className="text-sub text-[10px]">/ {quote.symbol}</span>
          </div>
          <div className="text-[10px] text-sub/70 truncate" title={base.name !== base.symbol ? base.name : pair.address}>
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

/* ─── Frozen Row (left panel — token info) ────────────────── */
interface FrozenProps {
  pair:       Pool
  rank:       number
  flash?:     'up' | 'down'
  showStar?:  boolean
  compact?:   boolean
}

export function PairRowFrozen({ pair, rank, flash, showStar = false, compact = false }: FrozenProps) {
  const { chain } = useChain()
  const pairChain = (pair._chain as ChainSlug) || chain
  const [base, quote] = getBaseQuote(pair, pairChain)
  const extraPools = pair.all_addresses ? pair.all_addresses.length - 1 : 0
  const chainIcon = pair._chain ? CHAINS[pairChain]?.icon : null

  return (
    <Link
      href={`/${pairChain}/pair/${pair.address}`}
      className={clsx(
        'flex items-center border-b border-border transition-colors group-hover:bg-surface/50 cursor-pointer',
        compact ? 'gap-1.5 h-[56px] px-2 text-[11px]' : 'gap-2 h-[70px] px-4 text-[12px]',
        flash === 'up'   && 'animate-flash-green',
        flash === 'down' && 'animate-flash-red'
      )}
    >
      {showStar && <WatchToggle address={pair.address} size={14} />}

      <span className={clsx('text-sub text-right flex-shrink-0', compact ? 'text-[10px] w-[24px]' : 'text-[11px] w-[36px]')}>#{rank}</span>

      {/* Chain icon — shown in "All Chains" mode */}
      {chainIcon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={chainIcon} alt="" className="w-[18px] h-[18px] rounded-sm flex-shrink-0" />
      )}
      <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={compact ? 24 : 30} rounded="md" />

      {!compact && <DexBadge dex={pair.dex} extraPools={extraPools} />}

      <div className="min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-semibold text-text truncate" title={base.symbol}>${base.symbol}</span>
          <span className={clsx('text-sub', compact ? 'text-[9px]' : 'text-[11px]')}>/ {quote.symbol}</span>
        </div>
        <div className={clsx('text-sub/70 truncate', compact ? 'text-[9px]' : 'text-[10px]')} title={base.name || base.symbol}>
          {base.name || base.symbol}
        </div>
      </div>
    </Link>
  )
}

/* ─── Data Row (right panel — scrollable columns) ─────────── */
interface DataProps {
  pair:          Pool
  livePrice?:    number
  flash?:        'up' | 'down'
  timeWindow:    TimeWindow
  columnConfig?: ScreenerConfig
  compact?:      boolean
}

export function PairRowData({ pair, livePrice, flash, timeWindow, columnConfig, compact = false }: DataProps) {
  const { chain } = useChain()
  const pairChain = (pair._chain as ChainSlug) || chain
  const price = livePrice ?? pair.price_usd
  const visCols = columnConfig ? getVisibleColumns(columnConfig) : undefined
  const gridTemplate = visCols ? buildDataGridCols(visCols) : DEFAULT_DATA_GRID

  return (
    <Link
      href={`/${pairChain}/pair/${pair.address}`}
      className={clsx(
        'block transition-colors group-hover:bg-surface/50 cursor-pointer',
        flash === 'up'   && 'animate-flash-green',
        flash === 'down' && 'animate-flash-red'
      )}
    >
      <div
        className={clsx('grid items-center gap-x-2 border-b border-border text-[12px]', compact ? 'h-[56px] px-2' : 'h-[70px] px-4')}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {visCols
          ? visCols.map(col => (
              <div key={col.key} className="text-right overflow-hidden truncate">{renderCell(col.key, pair, timeWindow, price, flash)}</div>
            ))
          : <>
              <div className="text-right overflow-hidden truncate">{renderCell('price', pair, timeWindow, price, flash)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('age', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('transactions', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('volume', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('makers', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('5m', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('1h', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('6h', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('24h', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('liquidity', pair, timeWindow, price)}</div>
              <div className="text-right overflow-hidden truncate">{renderCell('mcap', pair, timeWindow, price)}</div>
            </>
        }
      </div>
    </Link>
  )
}

/* ─── Frozen Header (left panel) ──────────────────────────── */
export function PairRowHeaderFrozen({ showStar = false, compact = false }: { showStar?: boolean; compact?: boolean }) {
  const tTable = useTranslations('table')
  return (
    <div className={clsx('flex items-center gap-2 py-3 border-b border-border bg-surface', compact ? 'px-2' : 'px-4')}>
      {showStar && <span className="w-[14px]" />}
      <span className={clsx('font-medium text-header text-right flex-shrink-0', compact ? 'text-[12px] w-[24px]' : 'text-[14px] w-[36px]')}>#</span>
      <span className={clsx('font-medium text-header', compact ? 'text-[12px]' : 'text-[14px]')}>{tTable('token')}</span>
    </div>
  )
}

/* ─── Data Header (right panel) ──────────────────────────── */
export function PairRowHeaderData({ columnConfig, compact = false }: { columnConfig?: ScreenerConfig; compact?: boolean }) {
  const t = useTranslations('table')
  const visCols = columnConfig ? getVisibleColumns(columnConfig) : undefined
  const gridTemplate = visCols ? buildDataGridCols(visCols) : DEFAULT_DATA_GRID

  return (
    <div
      className={clsx('grid items-center gap-x-2 py-3 border-b border-border bg-surface', compact ? 'px-2 text-[12px]' : 'px-4 text-[14px]')}
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
  const t = useTranslations('table')
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
      <TH>{t('token')}</TH>
      {visCols
        ? visCols.map(col => <TH key={col.key} right>{col.headerLabel}</TH>)
        : <>
            <TH right>{t('price')}</TH>
            <TH right>{t('age')}</TH>
            <TH right>{t('txns')}</TH>
            <TH right>{t('volume')}</TH>
            <TH right>{t('makers')}</TH>
            <TH right>5M</TH>
            <TH right>1H</TH>
            <TH right>6H</TH>
            <TH right>24H</TH>
            <TH right>{t('liquidity')}</TH>
            <TH right>{t('mcap')}</TH>
          </>
      }
    </div>
  )
}
