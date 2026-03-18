'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import clsx from 'clsx'
import { useChain } from '@/contexts/ChainContext'
import { useSmartMoney, type SmartMoneyPeriod } from '@/hooks/useSmartMoney'
import type { SmartWallet } from '@/app/api/smart-money/route'
import { useFollowedWallets } from '@/hooks/useFollowedWallets'
import { fmtUsd, shortAddr } from '@/lib/formatters'
import { explorerLink, getChain } from '@/lib/chains'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ChainTabs } from '@/components/ChainTabs'
import dynamic from 'next/dynamic'
const CopyTradeModal = dynamic(() => import('@/components/CopyTradeModal').then(m => ({ default: m.CopyTradeModal })), { ssr: false })

/* ── Helpers ──────────────────────────────────────────── */
function addrToHue(address: string): number {
  let hash = 0
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

/** Format PnL percentage: +1,445.5% or +72.5K% */
function fmtPct(pct: number): string {
  const abs = Math.abs(pct)
  if (abs >= 100_000) return `${(abs / 1000).toFixed(0)}K%`
  if (abs >= 1000) return `${Math.round(abs).toLocaleString('en-US')}%`
  return `${abs.toFixed(1)}%`
}


type SortKey = 'score' | 'pnl' | 'winRate' | 'trades' | 'volume'
type FilterKey = 'smart' | 'freshWallet' | 'sniper' | 'myTracked'

const FILTER_KEYS: FilterKey[] = ['smart', 'freshWallet', 'sniper', 'myTracked']

const PERIODS: SmartMoneyPeriod[] = ['1d', '7d', '30d']
const PERIOD_LABELS: Record<SmartMoneyPeriod, string> = { '1d': '1D', '7d': '7D', '30d': '30D' }

/* ── Rank badge ──────────────────────────────────────── */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[18px] leading-none">🥇</span>
  if (rank === 2) return <span className="text-[18px] leading-none">🥈</span>
  if (rank === 3) return <span className="text-[18px] leading-none">🥉</span>
  return <span className="text-[14px] text-sub tabular">{rank}</span>
}

/* ── Wallet avatar ───────────────────────────────────── */
function WalletAvatar({ address, size = 44 }: { address: string; size?: number }) {
  const hue = addrToHue(address)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{
          width: size, height: size,
          fontSize: size * 0.35,
          background: `linear-gradient(135deg, hsl(${hue}, 65%, 50%), hsl(${(hue + 40) % 360}, 65%, 40%))`,
        }}
      >
        {address.slice(2, 4).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={`https://effigy.im/a/${address}.svg`}
      alt=""
      width={size}
      height={size}
      className="rounded-full flex-shrink-0 bg-border"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  )
}

/* ── Sort arrow ──────────────────────────────────────── */
function SortArrow({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="flex-shrink-0 ml-0.5">
      <path d="M5 1v0L1 5h8L5 1z" fill={active && !asc ? 'currentColor' : '#444'} />
      <path d="M5 13v0L1 9h8L5 13z" fill={active && asc ? 'currentColor' : '#444'} />
    </svg>
  )
}

/* ── Copy button ─────────────────────────────────────── */
function CopyBtn({ onCopy }: { onCopy: () => void }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCopy() }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors bg-yellow-500 text-white hover:bg-yellow-400"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M16 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M12 11v4M10 13h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      CopyTrade
    </button>
  )
}

/* ── Spinner ─────────────────────────────────────────── */
function Spinner() {
  return (
    <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}


/* ── Stats cards (derived from wallets array) ─────── */
function StatsCards({ wallets, period, chain }: {
  wallets: SmartWallet[]
  period: SmartMoneyPeriod
  chain: string
}) {
  const t = useTranslations('smartMoney')

  const stats = useMemo(() => {
    const topEarner = wallets.find(w => w.realized_profit_usd > 0) ?? null
    const profitableWallets = wallets.filter(w => w.realized_profit_usd > 0)
    const totalPnl = profitableWallets.reduce((sum, w) => sum + w.realized_profit_usd, 0)
    // Aggregate profit per token, sort by total profit desc
    const tokenAgg = new Map<string, { profit: number; count: number }>()
    for (const w of wallets) {
      if (!w.token_symbol) continue
      const prev = tokenAgg.get(w.token_symbol) || { profit: 0, count: 0 }
      prev.profit += w.realized_profit_usd
      prev.count += 1
      tokenAgg.set(w.token_symbol, prev)
    }
    const trendingTokens = Array.from(tokenAgg.entries())
      .filter(([, v]) => v.profit > 0)
      .sort((a, b) => b[1].profit - a[1].profit)
      .slice(0, 3)

    return { topEarner, totalPnl, trendingTokens, totalWallets: wallets.length }
  }, [wallets])

  if (!wallets.length) return null

  const periodLabel = period === '1d' ? '1D' : period === '7d' ? '7D' : '30D'

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3 py-2 flex-shrink-0">
      {/* Card 1: Top Earner */}
      {stats.topEarner && (
        <Link href={`/${chain}/wallet/${stats.topEarner.address}?token=${stats.topEarner.token_address}`}
          className="flex items-start gap-3 border border-border rounded-lg p-3 md:p-4 hover:bg-surface/50 transition-colors">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="flex-shrink-0"><circle cx="13" cy="13" r="13" fill="#E9BA42" fillOpacity="0.1"/><path d="M15.7349 7C16.2072 7 16.6116 7.29125 16.778 7.70395H17.4955C17.6432 7.70395 17.7894 7.73303 17.9258 7.78955C18.0623 7.84606 18.1862 7.92889 18.2906 8.03331C18.3951 8.13773 18.4779 8.2617 18.5344 8.39813C18.5909 8.53456 18.62 8.68079 18.62 8.82846V10.5212C18.62 11.1326 18.4212 11.7273 18.0535 12.2158C17.6859 12.7042 17.1694 13.0599 16.582 13.2291C16.3198 13.8983 15.8844 14.4857 15.3203 14.9311C14.7563 15.3766 14.084 15.6641 13.3723 15.7641V16.2971H14.3944L14.4792 16.299C15.4901 16.3417 16.3095 17.148 16.3631 18.1784L16.3803 18.8303H9.25465V18.268C9.25465 17.7453 9.4623 17.244 9.83192 16.8744C10.2015 16.5048 10.7028 16.2971 11.2256 16.2971H12.2477V15.7645C11.5359 15.6644 10.8636 15.3768 10.2995 14.9313C9.7354 14.4858 9.2999 13.8983 9.03762 13.2291C8.45025 13.0598 7.93385 12.7041 7.5663 12.2157C7.19876 11.7272 7 11.1325 7 10.5212V8.82884C7 8.5306 7.11848 8.24457 7.32936 8.03368C7.54025 7.8228 7.82628 7.70432 8.12452 7.70432L8.84196 7.70395C8.92587 7.496 9.07002 7.31788 9.25589 7.19245C9.44177 7.06701 9.66089 7 9.88513 7H15.7349ZM8.76024 8.82846H8.12452V10.5212C8.12452 11.0569 8.37303 11.534 8.76137 11.8444L8.76062 11.7537L8.76024 8.82846ZM17.4955 8.82846H16.8594V11.7537L16.8586 11.844C17.0575 11.6856 17.2181 11.4844 17.3283 11.2553C17.4386 11.0262 17.4957 10.7751 17.4955 10.5209V8.82921V8.82846Z" fill="#E9BA42"/></svg>
          <div className="flex-1 min-w-0">
            <span className="text-[14px] text-sub">{t('topEarner')}</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[14px] text-text font-medium truncate">{shortAddr(stats.topEarner.address)}</span>
              <span className="text-green text-[14px] font-medium tabular">+{fmtUsd(stats.topEarner.realized_profit_usd)}</span>
            </div>
            <span className="text-[12px] text-green/70 mt-0.5 block">
              +{fmtPct(stats.topEarner.realized_profit_percentage)} {t('realizedProfit')}
            </span>
          </div>
        </Link>
      )}

      {/* Card 2: Trending Tokens */}
      <div className="flex items-start gap-3 border border-border rounded-lg p-3 md:p-4">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="flex-shrink-0"><circle cx="13" cy="13" r="13" fill="#EC512B" fillOpacity="0.1"/><path d="M16.6639 10.4717L15.5575 11.555C15.5575 11.555 15.5575 7.22169 11.8705 5.77673C11.8705 5.77673 11.5012 9.74844 9.65766 11.1934C7.81569 12.6384 4.12866 16.9717 11.5027 20.2217C11.5027 20.2217 7.81569 16.25 12.6091 13.3601C12.6091 13.3601 12.2398 14.805 14.0833 16.2484C15.9268 17.6934 14.0833 20.2202 14.0833 20.2202C14.0833 20.2202 22.9331 18.055 16.6639 10.4717Z" fill="#EC512B"/></svg>
        <div className="flex-1 min-w-0">
          <span className="text-[14px] text-sub">{t('trendingTokens')}</span>
          <div className="flex flex-col gap-1 mt-1.5">
            {stats.trendingTokens.length > 0 ? stats.trendingTokens.map(([symbol, { profit, count }]) => (
              <div key={symbol} className="flex items-center gap-2 text-[13px]">
                <span className="text-green font-medium">${symbol}</span>
                <span className="text-green/80 tabular">+{fmtUsd(profit)}</span>
                <span className="text-sub/60">·</span>
                <span className="text-sub text-[12px]">{count} {count === 1 ? 'wallet' : 'wallets'}</span>
              </div>
            )) : (
              <span className="text-[13px] text-sub">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Card 3: Overview */}
      <div className="flex items-start gap-3 border border-border rounded-lg p-3 md:p-4">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="flex-shrink-0"><circle cx="13" cy="13" r="13" fill="#6EDC78" fillOpacity="0.1"/><path d="M17.9298 11.1417C17.6042 10.8053 17.2527 10.4949 16.8786 10.2133C16.8249 10.1735 16.7839 10.1453 16.7363 10.1106C17.0484 10.0257 17.3258 9.84429 17.5288 9.59239C17.7318 9.3405 17.85 9.03094 17.8667 8.70787C17.8257 8.26745 17.6125 7.86103 17.2735 7.57687C16.9345 7.29272 16.4971 7.15378 16.0563 7.19025C15.844 7.19025 15.6334 7.22869 15.4348 7.30371C15.3638 7.3297 15.2952 7.36173 15.2296 7.39946C15.2077 7.40524 15.1847 7.40584 15.1626 7.40121C15.1404 7.39658 15.1196 7.38685 15.1018 7.37278C15.0022 7.22806 14.8836 7.09732 14.7493 6.98402C14.4483 6.70512 14.0531 6.55017 13.6427 6.55017C13.2324 6.55017 12.8372 6.70512 12.5362 6.98402C12.4048 7.09509 12.2885 7.22292 12.1904 7.36423C12.1737 7.38026 12.1534 7.39207 12.1312 7.39868C12.109 7.4053 12.0856 7.40652 12.0628 7.40225C11.995 7.36321 11.924 7.32992 11.8506 7.30272C11.6519 7.22808 11.4414 7.18965 11.2291 7.18925C10.7884 7.15312 10.3512 7.29221 10.0124 7.57636C9.6736 7.86051 9.46049 8.26679 9.41932 8.70707C9.42925 8.97957 9.51449 9.24399 9.66558 9.47098C9.81667 9.69797 10.0277 9.87865 10.2753 9.99298C10.2183 10.0316 10.1652 10.0708 10.1106 10.111C9.73512 10.3865 9.38395 10.6937 9.06101 11.0293C8.10593 11.9318 7.54506 13.1744 7.5 14.4877C7.5 18.0546 10.195 19.7508 13.4419 19.7508C14.7548 19.7873 16.0542 19.477 17.209 18.8513C18.6691 17.9933 19.5 16.5523 19.5 14.4877C19.4354 13.2097 18.8716 12.0081 17.9298 11.1417Z" fill="#6EDC78"/><path d="M13.2315 17.6019V11.8364H13.6009V17.6019H13.2315ZM14.2112 13.7395C14.1932 13.5578 14.1158 13.4167 13.9792 13.3161C13.8426 13.2155 13.6572 13.1652 13.4229 13.1652C13.2638 13.1652 13.1294 13.1877 13.0198 13.2327C12.9102 13.2763 12.8261 13.3371 12.7676 13.4152C12.7105 13.4932 12.682 13.5818 12.682 13.6809C12.679 13.7635 12.6962 13.8356 12.7338 13.8971C12.7728 13.9587 12.8261 14.012 12.8937 14.057C12.9613 14.1006 13.0393 14.1389 13.1279 14.1719C13.2165 14.2034 13.3111 14.2304 13.4117 14.253L13.8261 14.3521C14.0273 14.3971 14.2119 14.4572 14.3801 14.5322C14.5483 14.6073 14.6939 14.6996 14.817 14.8092C14.9401 14.9188 15.0355 15.048 15.103 15.1966C15.1721 15.3452 15.2074 15.5157 15.2089 15.7078C15.2074 15.9901 15.1353 16.2348 14.9927 16.442C14.8515 16.6477 14.6473 16.8076 14.3801 16.9217C14.1143 17.0343 13.7938 17.0906 13.4184 17.0906C13.0461 17.0906 12.7218 17.0336 12.4455 16.9195C12.1708 16.8054 11.956 16.6365 11.8014 16.4128C11.6483 16.1875 11.5679 15.909 11.5604 15.5772H12.5041C12.5146 15.7319 12.5589 15.861 12.6369 15.9646C12.7165 16.0667 12.8224 16.144 12.9545 16.1966C13.0881 16.2476 13.239 16.2731 13.4072 16.2731C13.5723 16.2731 13.7157 16.2491 13.8373 16.2011C13.9604 16.153 14.0558 16.0862 14.1233 16.0006C14.1909 15.915 14.2247 15.8167 14.2247 15.7056C14.2247 15.602 14.1939 15.5149 14.1324 15.4443C14.0723 15.3738 13.9837 15.3137 13.8666 15.2642C13.751 15.2146 13.6091 15.1696 13.441 15.129L12.9387 15.0029C12.5499 14.9083 12.2428 14.7604 12.0176 14.5593C11.7924 14.3581 11.6805 14.0871 11.682 13.7462C11.6805 13.467 11.7549 13.223 11.905 13.0143C12.0566 12.8056 12.2646 12.6427 12.5288 12.5256C12.7931 12.4085 13.0934 12.3499 13.4297 12.3499C13.772 12.3499 14.0708 12.4085 14.326 12.5256C14.5828 12.6427 14.7825 12.8056 14.9251 13.0143C15.0677 13.223 15.1413 13.4647 15.1458 13.7395H14.2112Z" fill="black"/></svg>
        <div className="flex-1 min-w-0">
          <span className="text-[14px] text-sub">{t('totalPnl')}</span>
          <div className="text-green text-[18px] font-bold tabular mt-1">
            +{fmtUsd(stats.totalPnl)}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[12px] text-sub/60">
              {stats.totalWallets} wallets · {periodLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Tab 1: Leaderboard
   ══════════════════════════════════════════════════════ */
interface CopyModalState {
  isOpen: boolean
  tokenAddress: string
  tokenSymbol: string
  walletAddress: string
  walletPnlPct: number
}

function LeaderboardTab() {
  const { chain } = useChain()
  const chainConfig = getChain(chain)
  const t = useTranslations('smartMoney')

  const [period, setPeriod] = useState<SmartMoneyPeriod>('7d')
  const [filter, setFilter] = useState<FilterKey>('smart')
  const [sortKey, setSortKey] = useState<SortKey>('pnl')
  const [sortAsc, setSortAsc] = useState(false)
  const [copyModal, setCopyModal] = useState<CopyModalState>({
    isOpen: false, tokenAddress: '', tokenSymbol: '', walletAddress: '', walletPnlPct: 0,
  })

  const { data: result, isLoading } = useSmartMoney(chain, period)
  const { isFollowing } = useFollowedWallets()
  const wallets = result?.wallets ?? []
  const unsupported = result?.unsupported ?? false

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  // Client-side filters
  const filtered = (() => {
    switch (filter) {
      case 'smart':
        // Profitable + at least a few trades
        return wallets.filter(w => w.realized_profit_percentage > 0 && w.count_of_trades >= 2)
      case 'freshWallet':
        // New wallets: few trades (< 10)
        return wallets.filter(w => w.count_of_trades < 10)
      case 'sniper':
        // High PnL% or very few trades with profit — got in early on new tokens
        return wallets.filter(w => w.realized_profit_percentage > 200 || (w.realized_profit_usd > 0 && w.count_of_trades <= 5))
      case 'myTracked':
        return wallets.filter(w => isFollowing(w.address))
      default:
        return wallets
    }
  })()

  const sorted = filtered.slice().sort((a, b) => {
    let diff = 0
    switch (sortKey) {
      case 'score':   diff = (a.smart_score ?? 0) - (b.smart_score ?? 0); break
      case 'pnl':     diff = a.realized_profit_usd - b.realized_profit_usd; break
      case 'winRate': diff = (a.win_rate ?? 0) - (b.win_rate ?? 0); break
      case 'trades':  diff = a.count_of_trades - b.count_of_trades; break
      case 'volume':  diff = (Number(a.total_usd_invested) + Number(a.total_sold_usd)) - (Number(b.total_usd_invested) + Number(b.total_sold_usd)); break
    }
    return sortAsc ? diff : -diff
  })

  if (isLoading) return <div className="flex items-center justify-center flex-1 text-sub"><Spinner /></div>
  if (unsupported) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-6">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-sub/40"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        <span className="text-text text-[15px] font-medium">Coming Soon</span>
        <span className="text-sub text-[13px]">Smart Money data for {chainConfig.shortName} is coming soon.</span>
      </div>
    )
  }

  const gridCols = '32px minmax(180px, 1.5fr) minmax(120px, 1fr) minmax(70px, 0.5fr) minmax(70px, 0.5fr) minmax(90px, 0.6fr) 80px'

  /* Filter bar */
  const filterBar = (
    <div className="flex items-center justify-between gap-2 py-2 md:py-2.5 flex-shrink-0">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {FILTER_KEYS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx(
              'flex items-center h-[30px] px-3 rounded text-[14px] font-medium transition-colors whitespace-nowrap flex-shrink-0',
              filter === f ? 'bg-border/60 text-text' : 'text-sub/70 hover:text-sub'
            )}>
            {t(f === 'smart' ? 'smartOnly' : f)}
          </button>
        ))}
      </div>
      {chain === 'base' && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={clsx(
                'flex items-center h-[30px] px-2.5 rounded-md text-[14px] font-medium transition-colors',
                period === p ? 'bg-blue/15 text-blue' : 'text-sub/70 hover:text-sub'
              )}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  if (!sorted.length) {
    const emptyMsg = filter === 'myTracked' ? t('noTracked') : t('noData')
    return (
      <div className="flex flex-col px-3 pt-2 md:px-5 gap-2 pb-4">
        <StatsCards wallets={wallets} period={period} chain={chain} />
        {filterBar}
        <div className="flex flex-col items-center justify-center border border-border rounded-lg gap-2 text-sub py-12">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fill="currentColor" opacity="0.3"/></svg>
          <span className="text-[14px]">{emptyMsg}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col px-3 pt-2 md:px-5 gap-2 pb-4">
      <StatsCards wallets={wallets} period={period} chain={chain} />
      {filterBar}

      <div className="flex flex-col border border-border rounded-lg overflow-x-auto">
      {/* Header */}
      <div className="grid gap-x-2 px-4 py-3 text-[12px] md:text-[14px] font-medium text-header border-b border-border sticky top-0 bg-surface z-10"
        style={{ gridTemplateColumns: gridCols, minWidth: 820 }}>
        <span>#</span>
        <span>{t('wallet')}</span>
        <button onClick={() => handleSort('pnl')} className="flex items-center gap-0.5 hover:text-text transition-colors">
          {t('pnl')} <SortArrow active={sortKey === 'pnl'} asc={sortAsc} />
        </button>
        <button onClick={() => handleSort('winRate')} className="flex items-center gap-0.5 hover:text-text transition-colors">
          Win Rate <SortArrow active={sortKey === 'winRate'} asc={sortAsc} />
        </button>
        <button onClick={() => handleSort('trades')} className="flex items-center gap-0.5 hover:text-text transition-colors">
          {t('trades')} <SortArrow active={sortKey === 'trades'} asc={sortAsc} />
        </button>
        <button onClick={() => handleSort('volume')} className="flex items-center gap-0.5 hover:text-text transition-colors">
          {t('volume')} <SortArrow active={sortKey === 'volume'} asc={sortAsc} />
        </button>
        <span />
      </div>

      {/* Rows */}
      {sorted.map((w, i) => {
        const pnl = w.realized_profit_usd
        const pnlPct = w.realized_profit_percentage
        const vol = Number(w.total_usd_invested) + Number(w.total_sold_usd)
        return (
          <Link key={w.address} href={`/${chain}/wallet/${w.address}?token=${w.token_address}`}
            className="grid gap-x-2 px-4 py-2.5 items-center border-b border-border hover:bg-surface/50 transition-colors cursor-pointer"
            style={{ gridTemplateColumns: gridCols, minWidth: 820 }}>
            <div className="flex items-center justify-center"><RankBadge rank={i + 1} /></div>

            <div className="flex items-center gap-3 min-w-0">
              <WalletAvatar address={w.address} size={32} />
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[13px] text-text truncate font-medium">
                    {shortAddr(w.address)}
                  </span>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(explorerLink(chain, 'address', w.address), '_blank') }} className="flex-shrink-0 text-sub hover:text-text transition-colors">
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M5.5 2.5H3.5C2.94772 2.5 2.5 2.94772 2.5 3.5V10.5C2.5 11.0523 2.94772 11.5 3.5 11.5H10.5C11.0523 11.5 11.5 11.0523 11.5 10.5V8.5M8.5 2.5H11.5V5.5M11.5 2.5L6.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                  </button>
                </div>
                {w.token_symbol && (
                  <span className="text-[11px] text-sub"><span className="text-green">${w.token_symbol}</span></span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className={clsx('text-[12px] tabular font-medium', pnl >= 0 ? 'text-green' : 'text-red')}>
                {pnl >= 0 ? '+' : '-'}{fmtUsd(Math.abs(pnl))}
              </span>
              <span className={clsx('text-[11px] tabular', pnlPct >= 0 ? 'text-green/70' : 'text-red/70')}>
                {pnlPct >= 0 ? '+' : '-'}{fmtPct(pnlPct)}
              </span>
            </div>

            <div className="text-[12px] tabular">
              {(w.win_rate ?? 0) > 0 ? (
                <span className={clsx('font-medium', w.win_rate >= 50 ? 'text-green' : 'text-red')}>
                  {w.win_rate}%
                </span>
              ) : (
                <span className="text-sub">—</span>
              )}
            </div>

            <div className="text-[12px] tabular text-text">
              {w.count_of_trades}
              {(w.token_count ?? 0) > 0 && (
                <div className="text-sub/50 text-[11px]">{w.token_count} tokens</div>
              )}
            </div>

            <span className={clsx('text-[12px] tabular', vol > 0 ? 'text-text' : 'text-sub')}>
              {fmtUsd(vol)}
            </span>

            <div className="flex justify-end" onClick={(e) => e.preventDefault()}>
              <CopyBtn onCopy={() => setCopyModal({
                isOpen: true,
                tokenAddress: w.token_address,
                tokenSymbol: w.token_symbol,
                walletAddress: w.address,
                walletPnlPct: w.realized_profit_percentage,
              })} />
            </div>
          </Link>
        )
      })}
      </div>

      {/* Copy Trade Modal */}
      <CopyTradeModal
        isOpen={copyModal.isOpen}
        onClose={() => setCopyModal(s => ({ ...s, isOpen: false }))}
        tokenAddress={copyModal.tokenAddress}
        tokenSymbol={copyModal.tokenSymbol}
        walletAddress={copyModal.walletAddress}
        walletPnlPct={copyModal.walletPnlPct}
        chain={chain}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Main page
   ══════════════════════════════════════════════════════ */
export default function SmartMoneyPage() {
  const t = useTranslations('smartMoney')
  const { chain } = useChain()

  return (
    <div className="flex-1 flex flex-col overflow-auto min-h-0">
      {/* Top bar */}
      <div className="px-3 pt-3 md:px-5 md:pt-4 flex-shrink-0">
        <div className="flex items-center justify-between border-b border-border">
          <ChainTabs />
          <div className="hidden md:block"><LanguageSwitcher /></div>
        </div>
      </div>

      <LeaderboardTab />
    </div>
  )
}
