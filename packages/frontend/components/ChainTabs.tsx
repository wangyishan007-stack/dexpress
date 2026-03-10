'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { SUPPORTED_CHAINS, CHAINS, type ChainSlug } from '@/lib/chains'

/** Extract chain segment or 'all' from pathname */
function getActiveChain(pathname: string): string {
  const seg = pathname.split('/')[1] || ''
  if (seg === 'all') return 'all'
  if (SUPPORTED_CHAINS.includes(seg as ChainSlug)) return seg
  return 'all'
}

/** Build the target path preserving sub-routes (e.g. /base/gainers → /bsc/gainers) */
function buildPath(target: string, pathname: string): string {
  const rest = pathname.replace(/^\/[^/]+/, '') // strip first segment
  return `/${target}${rest}`
}

export function ChainTabs() {
  const pathname = usePathname()
  const active = getActiveChain(pathname)

  const tabs = [
    { key: 'all', label: 'All Chains', icon: null },
    ...SUPPORTED_CHAINS.map(slug => ({
      key: slug,
      label: CHAINS[slug].shortName,
      icon: CHAINS[slug].icon,
    })),
  ]

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
      {tabs.map(tab => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={buildPath(tab.key, pathname)}
            className={clsx(
              'relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'text-text'
                : 'text-sub hover:text-text'
            )}
          >
            {tab.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tab.icon} alt={tab.label} className="w-4 h-4" />
            )}
            {tab.label}
            {/* Active underline */}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-sub rounded-full" />
            )}
          </Link>
        )
      })}
    </div>
  )
}
