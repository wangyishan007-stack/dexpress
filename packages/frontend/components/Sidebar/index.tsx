'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { WatchlistPanel } from './WatchlistPanel'
import { SearchModal } from '../SearchModal'
import { useAuth } from '../../hooks/useAuth'
import { shortAddr } from '../../lib/formatters'
import { ChainSelector } from '../ChainSelector'
import { useTranslations } from 'next-intl'
import { SUPPORTED_CHAINS, DEFAULT_CHAIN, type ChainSlug } from '@/lib/chains'
import { loadPageChain } from '../ChainTabs'
import { LanguageSwitcher } from '../LanguageSwitcher'

/** Extract chain segment from pathname like /base/pair/0x... → 'base', /all → 'all' */
function getChainFromPath(pathname: string): string {
  const seg = pathname.split('/')[1] || ''
  if (seg === 'all') return 'all'
  if (SUPPORTED_CHAINS.includes(seg as ChainSlug)) return seg
  return DEFAULT_CHAIN
}

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
type NavKey = 'allCoins' | 'newPairs' | 'gainers' | 'watchlist'
const NAV_KEYS: { path: string; key: NavKey; pageKey: string; Icon: React.ComponentType<{ active?: boolean }> }[] = [
  { path: '',          key: 'allCoins',  pageKey: 'allcoins',  Icon: IconAllCoins  },
  { path: '/new-pairs', key: 'newPairs',  pageKey: 'new-pairs', Icon: IconNewPairs  },
  { path: '/gainers',   key: 'gainers',   pageKey: 'gainers',   Icon: IconGainers   },
  { path: '/watchlist', key: 'watchlist', pageKey: 'watchlist', Icon: IconWatchlist },
]

/** Build nav items with per-page chain from localStorage */
function buildNavItems(urlChain: string, perPage: boolean) {
  return NAV_KEYS.map(item => {
    // Watchlist is a top-level route (not chain-prefixed)
    if (item.key === 'watchlist') return { ...item, href: '/watchlist' }
    const chain = perPage ? loadPageChain(item.pageKey) : urlChain
    return {
      ...item,
      href: `/${chain}${item.path}`,
    }
  })
}

/* ── Mobile bottom tab bar ───────────────────────────────── */
function MobileTabNav() {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const chain = getChainFromPath(pathname)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const navItems = buildNavItems(chain, mounted)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-border bg-bg">
      {navItems.map(({ href, path, key, Icon }) => {
        const active = key === 'watchlist'
          ? pathname === '/watchlist'
          : path === ''
            ? pathname === `/${chain}`
            : pathname === `/${chain}${path}` || pathname.startsWith(`/${chain}${path}/`)
        return (
          <Link
            key={key}
            href={href}
            className={clsx(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors',
              active ? 'text-blue font-bold' : 'text-sub'
            )}
          >
            <Icon active={active} />
            {t(key)}
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
  const chain = getChainFromPath(pathname)
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const { ready, authenticated, user, login, logout } = useAuth()
  const tNav = useTranslations('nav')

  // Per-page chain nav: after hydration, each nav link uses its own stored chain
  const navItems = buildNavItems(chain, hydrated)

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
        <div className="flex items-center gap-2">
          <Link href={`/${chain}`}><LogoMark className="h-[28px] w-auto" /></Link>
          {/* <ChainSelector collapsed /> */}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center w-[36px] h-[36px] rounded-lg bg-border/40 text-sub hover:text-text transition-colors"
          >
            <IconSearch />
          </button>
          <LanguageSwitcher iconOnly />
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
              {tNav('login')}
            </button>
          )}
        </div>
      </div>

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
              <Link href={`/${chain}`}>
                <img
                  src="/branding/dex-logo.svg"
                  alt="dex.express"
                  className="w-[48px] h-[42px] cursor-pointer"
                />
              </Link>
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
              <Link href={`/${chain}`}><LogoMark /></Link>
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
              <span className="text-[14px] text-sub">{tNav('search')}</span>
            </button>
          )}

          {/* Chain selector — hidden, chain switching is done via ChainTabs */}
          {/* <ChainSelector collapsed={collapsed} /> */}

          {/* Nav + Login */}
          <div className={clsx('flex flex-col', collapsed ? 'gap-[12px]' : 'gap-[20px]')}>

            {/* Nav items */}
            <nav className={clsx('flex flex-col', collapsed ? 'gap-[8px] items-center' : 'gap-[16px]')}>
              {navItems.map(({ href, path, key, Icon }) => {
                // Active detection always uses URL chain, not per-page href
                const active = key === 'watchlist'
                  ? pathname === '/watchlist'
                  : path === ''
                    ? pathname === `/${chain}`
                    : pathname === `/${chain}${path}` || pathname.startsWith(`/${chain}${path}/`)
                const label = tNav(key)
                return (
                  <Link
                    key={key}
                    href={href}
                    title={collapsed ? label : undefined}
                    className={clsx(
                      'flex items-center transition-colors',
                      collapsed
                        ? 'h-[44px] w-[44px] justify-center rounded-lg'
                        : 'h-[44px] gap-[16px] rounded-[12px] px-[8px] py-[12px] text-[16px] whitespace-nowrap',
                      active ? 'text-blue font-bold' : 'text-sub font-normal hover:text-text hover:bg-border/20'
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
                  {tNav('login')}
                </button>
              )
            )}

            {/* Language switcher moved to ChainTabs row in page content */}

          </div>
        </div>

        {/* ── Watchlist panel (bottom) ─────────────────────── */}
        {!collapsed && <WatchlistPanel />}

      </aside>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── Mobile bottom tab bar (fixed) ───────────────────── */}
      <MobileTabNav />
    </>
  )
}
