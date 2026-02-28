'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { WatchlistPanel } from './WatchlistPanel'
import { SearchModal } from '../SearchModal'
import { useAuth } from '../../hooks/useAuth'
import { shortAddr } from '../../lib/formatters'

/* ── Nav icons ────────────────────────────────────────────── */
function IconAllCoins({ active }: { active?: boolean }) {
  const src = active ? '/branding/nav/all-coins-active.svg' : '/branding/nav/all-coins.svg'
  return <img src={src} className="h-6 w-6" alt="" />
}

function IconNewPairs({ active }: { active?: boolean }) {
  const src = active ? '/branding/nav/new-pairs-active.svg' : '/branding/nav/new-pairs.svg'
  return <img src={src} className="h-6 w-6" alt="" />
}

function IconGainers({ active }: { active?: boolean }) {
  const src = active ? '/branding/nav/gainers-active.svg' : '/branding/nav/gainers.svg'
  return <img src={src} className="h-6 w-6" alt="" />
}

function IconWatchlist({ active }: { active?: boolean }) {
  const src = active ? '/branding/nav/watchlist-active.svg' : '/branding/nav/watchlist.svg'
  return <img src={src} className="h-6 w-6" alt="" />
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/branding/logo.svg?v=1"
      alt="dex.express"
      className={className ?? 'w-[175px] h-[48px]'}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = '/branding/logo.png?v=1'
      }}
    />
  )
}

/* ── Nav items config ────────────────────────────────────── */
const NAV_ITEMS = [
  { href: '/',          label: 'All coins',       Icon: IconAllCoins  },
  { href: '/new-pairs', label: 'New Pairs',        Icon: IconNewPairs  },
  { href: '/gainers',   label: 'Gainers & Losers', Icon: IconGainers   },
  { href: '/watchlist', label: 'Watchlist',        Icon: IconWatchlist },
]

/* ── Mobile tab nav ──────────────────────────────────────── */
function MobileTabNav() {
  const pathname = usePathname()

  return (
    <nav className="flex md:hidden overflow-x-auto scrollbar-hide border-b border-border bg-bg flex-shrink-0">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 whitespace-nowrap text-[13px] transition-colors flex-shrink-0',
              active
                ? 'text-text font-bold border-b-2 border-blue'
                : 'text-sub'
            )}
          >
            <Icon active={active} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/* ── Toggle icon ─────────────────────────────────────────── */
function IconCollapse() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconExpand() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── User icon (for collapsed account) ───────────────────── */
function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2.5 14c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed'

/* ── Sidebar ─────────────────────────────────────────────── */
export function Sidebar() {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const { ready, authenticated, user, login, logout } = useAuth()

  // Hydrate collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      if (stored === 'true') setCollapsed(true)
    } catch {}
    setHydrated(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch {}
      return next
    })
  }

  const displayAddr = user?.wallet?.address
    ? shortAddr(user.wallet.address)
    : user?.email?.address ?? null

  return (
    <>
      {/* ── Mobile top bar ──────────────────────────────────── */}
      <div className="flex md:hidden items-center justify-between h-[48px] px-3 bg-bg flex-shrink-0">
        <LogoMark className="h-[28px] w-auto" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center w-[36px] h-[36px] rounded-lg bg-border/40 text-sub hover:text-text transition-colors"
          >
            <IconSearch />
          </button>
          {ready && authenticated ? (
            <div className="flex items-center h-[36px] rounded-lg bg-border/40 overflow-hidden">
              <span
                className="flex items-center px-3 text-[13px] font-medium text-sub h-full"
                title={user?.wallet?.address || ''}
              >
                {displayAddr || 'Account'}
              </span>
              <button
                onClick={() => logout()}
                className="flex items-center justify-center w-[36px] h-full border-l border-border/60 text-sub hover:text-text transition-colors"
                title="Log out"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M6 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M10.5 11.5L14 8l-3.5-3.5M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => login()}
              disabled={!ready}
              className="flex items-center justify-center h-[36px] px-4 rounded-lg bg-blue text-[13px] font-medium text-white hover:bg-blue/90 transition-colors"
            >
              Log in
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile tab navigation ───────────────────────────── */}
      <MobileTabNav />

      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside
        className={clsx(
          'hidden md:flex flex-col justify-between border-r border-border bg-bg h-full flex-shrink-0 transition-[width] duration-200 overflow-hidden',
          hydrated && collapsed ? 'w-[72px]' : 'w-[239px]'
        )}
      >

        {/* ── Top section ─────────────────────────────────── */}
        <div className={clsx('flex flex-col gap-[16px]', collapsed ? 'px-[8px]' : 'px-[24px]')}>

          {/* Logo + toggle */}
          {collapsed ? (
            <div className="flex flex-col items-center pt-[20px] pb-[10px] gap-2">
              <img
                src="/branding/dex-logo.svg"
                alt="dex.express"
                className="w-[48px] h-[42px]"
              />
              <button
                onClick={toggleCollapsed}
                className="flex items-center justify-center w-[24px] h-[24px] rounded-md border border-border text-sub hover:text-text hover:bg-border/40 transition-colors"
                title="Expand sidebar"
              >
                <IconExpand />
              </button>
            </div>
          ) : (
            <div className="relative flex items-center pt-[20px] pb-[10px]">
              <LogoMark />
              <button
                onClick={toggleCollapsed}
                className="absolute -right-[24px] flex items-center justify-center w-[24px] h-[24px] rounded-l-md rounded-r-none border border-border bg-bg text-sub hover:text-text hover:bg-border/40 transition-colors z-10"
                title="Collapse sidebar"
              >
                <IconCollapse />
              </button>
            </div>
          )}

          {/* Search */}
          {collapsed ? (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-[40px] w-[40px] items-center justify-center rounded-lg bg-[#151515] border border-border cursor-pointer mx-auto"
              title="Search"
            >
              <span className="text-sub"><IconSearch /></span>
            </button>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-[40px] items-center gap-2 rounded-[8px] bg-[#151515] border border-border px-3 cursor-pointer w-full"
            >
              <span className="text-sub flex-shrink-0"><IconSearch /></span>
              <span className="text-[14px] text-sub">Search</span>
            </button>
          )}

          {/* Nav + Login */}
          <div className={clsx('flex flex-col', collapsed ? 'gap-[12px]' : 'gap-[20px]')}>

            {/* Nav items */}
            <nav className={clsx('flex flex-col', collapsed ? 'gap-[8px] items-center' : 'gap-[16px]')}>
              {NAV_ITEMS.map(({ href, label, Icon }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    className={clsx(
                      'flex items-center transition-colors',
                      collapsed
                        ? 'h-[44px] w-[44px] justify-center rounded-lg'
                        : 'h-[44px] gap-[16px] rounded-[12px] px-[8px] py-[12px] text-[16px] whitespace-nowrap',
                      active ? 'text-blue font-bold' : 'text-sub font-normal hover:text-text'
                    )}
                  >
                    <Icon active={active} />
                    {!collapsed && label}
                  </Link>
                )
              })}
            </nav>

            {/* Login / Account button */}
            {collapsed ? (
              // Collapsed state
              ready && authenticated ? (
                <button
                  onClick={() => logout()}
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-border text-sub hover:text-text hover:bg-border/40 transition-colors mx-auto"
                  title={`${displayAddr || 'Account'} — Log out`}
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <path d="M6 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M10.5 11.5L14 8l-3.5-3.5M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => login()}
                  disabled={!ready}
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-lg bg-blue text-white hover:bg-blue/90 transition-colors mx-auto"
                  title="Log in"
                >
                  <IconUser />
                </button>
              )
            ) : (
              // Expanded state
              ready && authenticated ? (
                <div className="flex h-[44px] w-full items-center rounded-lg border border-border overflow-hidden">
                  <div
                    className="flex flex-1 items-center justify-center gap-2 text-[14px] text-sub h-full min-w-0"
                    title={user?.wallet?.address || ''}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                      <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M2.5 14c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    <span className="truncate">{displayAddr || 'Account'}</span>
                  </div>
                  <button
                    onClick={() => logout()}
                    className="flex items-center justify-center w-[40px] h-full border-l border-border text-sub hover:text-text hover:bg-border/40 transition-colors flex-shrink-0"
                    title="Log out"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M10.5 11.5L14 8l-3.5-3.5M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => login()}
                  disabled={!ready}
                  className="flex h-[44px] w-full items-center justify-center rounded-lg bg-blue text-[16px] text-white hover:bg-blue/90 transition-colors"
                >
                  Log in
                </button>
              )
            )}

          </div>
        </div>

        {/* ── Watchlist panel (bottom) ─────────────────────── */}
        {!collapsed && <WatchlistPanel />}

      </aside>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
