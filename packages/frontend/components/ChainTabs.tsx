'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { SUPPORTED_CHAINS, CHAINS, DEFAULT_CHAIN, type ChainSlug } from '@/lib/chains'

/** Extract chain segment from pathname */
function getActiveChain(pathname: string): string {
  const seg = pathname.split('/')[1] || ''
  if (seg === 'all') return 'all'
  if (SUPPORTED_CHAINS.includes(seg as ChainSlug)) return seg
  return DEFAULT_CHAIN
}

/** Derive page key from pathname: /base → 'allcoins', /base/new-pairs → 'new-pairs', etc. */
export function getPageKey(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean) // ['base', 'new-pairs'] or ['base']
  return parts[1] || 'allcoins'
}

/** Save the selected chain for a specific page */
export function savePageChain(pageKey: string, chain: string) {
  try { localStorage.setItem(`chain_${pageKey}`, chain) } catch {}
}

/** Load the stored chain for a specific page (or default) */
export function loadPageChain(pageKey: string): string {
  try {
    const stored = localStorage.getItem(`chain_${pageKey}`)
    if (stored && SUPPORTED_CHAINS.includes(stored as ChainSlug)) return stored
  } catch {}
  return DEFAULT_CHAIN
}

/** Build the target path preserving sub-routes (e.g. /base/gainers → /bsc/gainers) */
function buildPath(target: string, pathname: string): string {
  const rest = pathname.replace(/^\/[^/]+/, '') // strip first segment
  return `/${target}${rest}`
}

export function ChainTabs() {
  const pathname = usePathname()
  const active = getActiveChain(pathname)

  // Persist current chain on mount/navigation so sidebar nav links stay in sync
  useEffect(() => {
    const pageKey = getPageKey(pathname)
    if (SUPPORTED_CHAINS.includes(active as ChainSlug)) {
      savePageChain(pageKey, active)
    }
  }, [pathname, active])

  const tabs = [
    // { key: 'all', label: 'All Chains', icon: null }, // hidden until more chains added
    ...SUPPORTED_CHAINS.map(slug => ({
      key: slug,
      label: CHAINS[slug].shortName,
      icon: CHAINS[slug].icon,
    })),
  ]

  /** When user clicks a chain tab, persist it for this page */
  const handleChainClick = (chainKey: string) => {
    const pageKey = getPageKey(pathname)
    savePageChain(pageKey, chainKey)
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide mb-[-1px]">
      {tabs.map(tab => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={buildPath(tab.key, pathname)}
            onClick={() => handleChainClick(tab.key)}
            className={clsx(
              'relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'text-text'
                : 'text-sub hover:text-text'
            )}
          >
            {tab.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tab.icon} alt={tab.label} className={tab.key === 'base' ? 'w-4 h-4' : 'w-5 h-5'} />
            )}
            {tab.label}
            {/* Active underline */}
            {isActive && (
              <span className="absolute -bottom-[1px] left-2 right-2 h-[2px] bg-blue rounded-full" />
            )}
          </Link>
        )
      })}
    </div>
  )
}
