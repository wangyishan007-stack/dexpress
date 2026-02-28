'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import type { TimeWindow } from '@dex/shared'
import { useAuth } from '../../hooks/useAuth'
import { FilterBar }            from '../../components/FilterBar'
import type { FilterMode }      from '../../components/FilterBar'
import { PairList }             from '../../components/PairList'
import { StatsBar }             from '../../components/StatsBar'
import { useWatchlist }         from '../../hooks/useWatchlist'
import { useLivePrices }        from '../../hooks/useMockPairs'
import { usePairWebSocket }     from '../../hooks/useWebSocket'
import { MOCK_POOLS }           from '../../lib/mockData'
import { ManageListsModal }    from '../../components/ManageListsModal'
import { AddPairModal }        from '../../components/AddPairModal'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../../lib/columnConfig'
import type { ScreenerConfig }    from '../../lib/columnConfig'

/* ── Icons ───────────────────────────────────────────────── */
function IconManage() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12.8515 8.14844L11.8125 7.36094C11.8234 7.25156 11.8344 7.13125 11.8344 7C11.8344 6.86875 11.8234 6.74844 11.8125 6.63906L12.8515 5.85156C13.1359 5.63281 13.2125 5.25 13.0265 4.92188L11.8672 2.96406C11.7359 2.73438 11.4844 2.59219 11.2219 2.59219C11.1344 2.59219 11.0578 2.60313 10.9703 2.63594L9.73436 3.11719C9.52655 2.975 9.3078 2.85469 9.08905 2.75625L8.90311 1.49844C8.84842 1.1375 8.54217 0.875 8.1703 0.875H5.82967C5.4578 0.875 5.15155 1.1375 5.09686 1.4875L4.92186 2.75625C4.70311 2.85469 4.4953 2.975 4.27655 3.11719L3.04061 2.63594C2.95311 2.60313 2.86561 2.59219 2.77811 2.59219C2.51561 2.59219 2.26405 2.72344 2.14374 2.95312L0.973424 4.92188C0.787487 5.22812 0.864049 5.63281 1.14842 5.85156L2.18749 6.63906C2.17655 6.77031 2.16561 6.89062 2.16561 7C2.16561 7.10938 2.16561 7.22969 2.18749 7.36094L1.14842 8.14844C0.864049 8.36719 0.787487 8.75 0.973424 9.07812L2.1328 11.0359C2.26405 11.2656 2.51561 11.4078 2.77811 11.4078C2.86561 11.4078 2.94217 11.3969 3.02967 11.3641L4.26561 10.8828C4.47342 11.025 4.69217 11.1453 4.91092 11.2438L5.09686 12.5016C5.14061 12.8516 5.4578 13.125 5.82967 13.125H8.1703C8.54217 13.125 8.84842 12.8625 8.90311 12.5125L9.08905 11.2438C9.3078 11.1453 9.51561 11.025 9.73436 10.8828L10.9703 11.3641C11.0578 11.3969 11.1453 11.4078 11.2328 11.4078C11.4953 11.4078 11.7469 11.2766 11.8672 11.0469L13.0375 9.06719C13.2125 8.75 13.1359 8.36719 12.8515 8.14844ZM9.62499 7C9.62499 8.44375 8.44374 9.625 6.99999 9.625C5.55624 9.625 4.37499 8.44375 4.37499 7C4.37499 5.55625 5.55624 4.375 6.99999 4.375C8.44374 4.375 9.62499 5.55625 9.62499 7Z" fill="currentColor"/>
    </svg>
  )
}

function IconAddPair() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 4v6M4 7h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconShare() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7v4.5a1 1 0 001 1h8a1 1 0 001-1V7M7 1.5v7M4.5 4L7 1.5 9.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── State 1: Not logged in ──────────────────────────────── */
function SignInState({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#555" strokeWidth="1.5" className="mb-4">
        <path d="M24 6l5.3 10.7 11.8 1.7-8.5 8.3 2 11.8L24 32.6l-10.6 5.9 2-11.8-8.5-8.3 11.8-1.7L24 6z"/>
      </svg>
      <h3 className="text-[16px] font-semibold text-text mb-2">Sign in to view your Watchlist</h3>
      <p className="text-[13px] text-sub mb-5">Track your favorite pairs across multiple watchlists.</p>
      <button
        onClick={onLogin}
        className="flex items-center justify-center gap-2 rounded-lg bg-blue px-6 py-2.5 text-[14px] font-medium text-white hover:bg-blue/90 transition-colors"
      >
        Log in
      </button>
    </div>
  )
}

/* ── State 2: Logged in but empty ────────────────────────── */
function EmptyWatchlistState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#555" strokeWidth="1.5" className="mb-4">
        <path d="M24 6l5.3 10.7 11.8 1.7-8.5 8.3 2 11.8L24 32.6l-10.6 5.9 2-11.8-8.5-8.3 11.8-1.7L24 6z"/>
      </svg>
      <h3 className="text-[16px] font-semibold text-text mb-2">Your watchlist is empty</h3>
      <p className="text-[13px] text-sub mb-5">Star any pair to add it here for quick access.</p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-lg bg-blue px-6 py-2.5 text-[14px] font-medium text-white hover:bg-blue/90 transition-colors"
      >
        Go add pairs
      </Link>
    </div>
  )
}

/* ── Page heading — desktop only (mobile uses tab nav) ──── */
function WatchlistHeader({ lists, activeListId, onSwitch, onManage }: {
  lists: { id: string; name: string }[]
  activeListId: string
  onSwitch: (id: string) => void
  onManage?: () => void
}) {
  return (
    <div className="hidden md:block mb-4">
      <div className="flex items-center justify-between border-b border-border pb-0">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
          {lists.map(list => (
            <button
              key={list.id}
              onClick={() => onSwitch(list.id)}
              className={`pb-3 text-[14px] md:text-[16px] font-bold whitespace-nowrap transition-colors ${
                list.id === activeListId
                  ? 'text-text border-b-2 border-blue'
                  : 'text-sub hover:text-text'
              }`}
            >
              {list.name}
            </button>
          ))}
        </div>
        <button
          onClick={onManage}
          className="flex items-center gap-2 text-sub hover:text-text transition-colors pb-3 flex-shrink-0 ml-4"
        >
          <IconManage />
          <span className="text-[13px] md:text-[14px]">Manage list</span>
        </button>
      </div>
    </div>
  )
}

/* ── Share Watchlist Modal ──────────────────────────────────── */
function ShareWatchlistModal({ listId, onClose }: { listId: string; onClose: () => void }) {
  const [allowed, setAllowed] = useState(false)
  const [copied, setCopied]   = useState(false)

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/watchlist/${listId}`

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-[480px] mx-4 rounded-xl border border-border bg-[#111] shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[16px] font-bold text-text">Share Watchlist</h2>
          <button onClick={onClose} className="w-[28px] h-[28px] flex items-center justify-center rounded-md text-sub hover:text-text hover:bg-border/40 transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-4">
          {/* Checkbox */}
          <label
            className="flex items-center gap-3 rounded-lg border border-border px-4 py-3.5 cursor-pointer select-none hover:bg-border/20 transition-colors"
            onClick={() => setAllowed(a => !a)}
          >
            <div className={`w-[20px] h-[20px] rounded flex-shrink-0 flex items-center justify-center border transition-colors ${allowed ? 'bg-blue border-blue' : 'border-sub/40 bg-transparent'}`}>
              {allowed && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
            </div>
            <span className="text-[14px] text-text">Allow anyone with link to view this watchlist</span>
          </label>

          {/* Link + Copy button (shown only when allowed) */}
          {allowed && (
            <div className="flex flex-col rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3">
                <span className="font-mono text-[13px] text-sub break-all">{shareUrl}</span>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 py-3 bg-blue text-[14px] font-medium text-white hover:bg-blue/90 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="5" width="7" height="7" rx="1.5"/>
                  <path d="M9 5V3.5A1.5 1.5 0 007.5 2h-4A1.5 1.5 0 002 3.5v4A1.5 1.5 0 003.5 9H5"/>
                </svg>
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
export default function WatchlistPage() {
  const { ready, authenticated, login } = useAuth()
  const { lists, activeList, activeListId, setActiveList, isWatched } = useWatchlist()
  const [filter, setFilter]               = useState<FilterMode>('trending')
  const [dataWindow, setDataWindow]       = useState<TimeWindow>('24h')
  const [trendingWindow, setTrendingWindow] = useState<TimeWindow>('6h')
  const [sort, setSort]                   = useState('trending_6h')
  const [order, setOrder]   = useState<'asc' | 'desc'>('desc')
  const [manageOpen, setManageOpen] = useState(false)
  const [addPairOpen, setAddPairOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [screenerConfig, setScreenerConfig] = useState<ScreenerConfig>(DEFAULT_CONFIG)
  useEffect(() => { setScreenerConfig(loadConfig('watchlist')) }, [])

  const handleScreenerConfigChange = useCallback((config: ScreenerConfig) => {
    setScreenerConfig(config)
    saveConfig(config, 'watchlist')
  }, [])

  const watchedPairs = useMemo(
    () => MOCK_POOLS.filter(p => isWatched(p.address)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeList.pairIds]
  )

  const sortedPairs = useMemo(() => {
    const s = sort || 'trending_score'
    return [...watchedPairs].sort((a, b) => {
      const aVal = (a as any)[s] ?? 0
      const bVal = (b as any)[s] ?? 0
      const aNum = typeof aVal === 'string' ? new Date(aVal).getTime() : Number(aVal)
      const bNum = typeof bVal === 'string' ? new Date(bVal).getTime() : Number(bVal)
      return order === 'desc' ? bNum - aNum : aNum - bNum
    })
  }, [watchedPairs, sort, order])

  const { prices, flashing, handlePriceUpdate } = useLivePrices(sortedPairs)
  usePairWebSocket(sortedPairs.map(p => p.address), handlePriceUpdate)

  /* Loading state — avoid flash of sign-in UI */
  if (!ready) return null

  /* State 1: Not logged in */
  if (!authenticated) {
    const defaultLists = [{ id: 'main', name: 'Main Watchlist' }]
    return (
      <div className="flex flex-col h-full px-3 pt-3 md:px-5 md:pt-4 pb-0">
        <WatchlistHeader lists={defaultLists} activeListId="main" onSwitch={() => {}} />
        <SignInState onLogin={() => login()} />
      </div>
    )
  }

  /* State 2: Logged in but empty */
  if (activeList.pairIds.length === 0) {
    return (
      <div className="flex flex-col h-full px-3 pt-3 md:px-5 md:pt-4 pb-0">
        <WatchlistHeader lists={lists} activeListId={activeListId} onSwitch={setActiveList} onManage={() => setManageOpen(true)} />
        <EmptyWatchlistState />
        {manageOpen && <ManageListsModal onClose={() => setManageOpen(false)} />}
      </div>
    )
  }

  /* State 3: Logged in with pairs */
  return (
    <div className="flex flex-col h-full px-3 pt-3 md:px-5 md:pt-4 pb-0">
      <WatchlistHeader lists={lists} activeListId={activeListId} onSwitch={setActiveList} onManage={() => setManageOpen(true)} />

      <StatsBar showBlock={false} />

      <FilterBar
        filter={filter}
        dataWindow={dataWindow}
        trendingWindow={trendingWindow}
        onFilter={setFilter}
        onDataWindow={setDataWindow}
        onTrendingWindow={setTrendingWindow}
        sort={sort}
        order={order}
        onSort={setSort}
        onOrder={setOrder}
        screenerConfig={screenerConfig}
        onScreenerConfigChange={handleScreenerConfigChange}
      />

      <PairList
        pairs={sortedPairs}
        hasMore={false}
        onLoadMore={() => {}}
        isValidating={false}
        livePrices={prices}
        flashing={flashing}
        timeWindow={dataWindow}
        showStar
        autoHeight
        columnConfig={screenerConfig}
      />

      {/* Bottom action buttons */}
      <div className="flex items-center justify-center gap-3 py-4 flex-shrink-0">
        <button
          onClick={() => setAddPairOpen(true)}
          className="flex items-center gap-2 h-[40px] px-5 rounded-[8px] border border-border text-[14px] text-sub hover:text-text transition-colors"
        >
          <IconAddPair />
          Add pair
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-2 h-[40px] px-5 rounded-[8px] border border-border text-[14px] text-sub hover:text-text transition-colors"
        >
          <IconShare />
          Share this watchlist
        </button>
      </div>

      {manageOpen && <ManageListsModal onClose={() => setManageOpen(false)} />}
      <AddPairModal open={addPairOpen} onClose={() => setAddPairOpen(false)} />
      {shareOpen && <ShareWatchlistModal listId={activeListId} onClose={() => setShareOpen(false)} />}
    </div>
  )
}
