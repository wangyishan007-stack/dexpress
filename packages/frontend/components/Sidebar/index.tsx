'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

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

function LogoMark() {
  return (
    <img
      src="/branding/logo.svg?v=1"
      alt="dex.express"
      className="w-[175px] h-[48px]"
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

/* ── Sidebar ─────────────────────────────────────────────── */
export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-[239px] flex-shrink-0 flex-col justify-between border-r border-border bg-bg">

      {/* ── Top section ─────────────────────────────────── */}
      <div className="flex flex-col gap-[16px] px-[24px]">

        {/* Logo */}
        <div className="flex items-center pt-[20px] pb-[14px]">
          <LogoMark />
        </div>

        {/* Search */}
        <label className="flex h-[40px] items-center gap-2 rounded-[8px] bg-[#151515] border border-border px-3 cursor-text">
          <span className="text-sub flex-shrink-0"><IconSearch /></span>
          <input
            placeholder="Search"
            className="flex-1 bg-transparent text-[14px] text-text placeholder-sub outline-none min-w-0"
          />
        </label>

        {/* Nav + Login */}
        <div className="flex flex-col gap-[20px]">

          {/* Nav items */}
          <nav className="flex flex-col gap-[16px]">
            {NAV_ITEMS.map(({ href, label, Icon }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    'flex h-[44px] items-center gap-[16px] rounded-[12px] px-[8px] py-[12px] text-[16px] whitespace-nowrap transition-colors',
                    active ? 'text-blue font-bold' : 'text-sub font-normal hover:text-text'
                  )}
                >
                  <Icon active={active} />
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Login button */}
          <button className="flex h-[44px] w-full items-center justify-center rounded-[8px] bg-blue text-[16px] text-white hover:bg-blue/90 transition-colors">
            Log in
          </button>

        </div>
      </div>

      {/* ── Watchlist panel (bottom) ─────────────────────── */}
      <div className="border-t border-border p-[24px] flex flex-col gap-[8px]">
        <button className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-[14px] text-text font-medium">Watchlist</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="#999" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1L5.5 10M1 5.5L10 5.5" stroke="#999" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
        <p className="text-[12px] text-sub/60">Nothing in this list yet...</p>
      </div>

    </aside>
  )
}
