'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
import { SUPPORTED_CHAINS, CHAINS, DEFAULT_CHAIN, type ChainSlug } from '@/lib/chains'

/** Extract chain slug from pathname like /base/pair/0x... → 'base' */
function getChainFromPath(pathname: string): ChainSlug {
  const seg = pathname.split('/')[1] || ''
  if (SUPPORTED_CHAINS.includes(seg as ChainSlug)) return seg as ChainSlug
  return DEFAULT_CHAIN
}

interface Props {
  collapsed?: boolean
}

export function ChainSelector({ collapsed = false }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const currentChain = getChainFromPath(pathname)
  const config = CHAINS[currentChain]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const switchChain = (slug: ChainSlug) => {
    if (slug === currentChain) { setOpen(false); return }
    // Replace the chain segment in the URL
    const rest = pathname.replace(/^\/[^/]+/, '')
    router.push(`/${slug}${rest}`)
    setOpen(false)
  }

  if (collapsed) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex h-[40px] w-[40px] items-center justify-center rounded-lg border border-border hover:bg-border/40 transition-colors mx-auto"
          title={config.name}
        >
          <img src={config.icon} alt={config.name} className="w-5 h-5" />
        </button>
        {open && (
          <div className="absolute left-full top-0 ml-2 z-50 min-w-[160px] rounded-xl border border-border bg-[#111] shadow-2xl py-1 overflow-hidden">
            {SUPPORTED_CHAINS.map((slug) => {
              const c = CHAINS[slug]
              const active = slug === currentChain
              return (
                <button
                  key={slug}
                  onClick={() => switchChain(slug)}
                  className={clsx(
                    'flex items-center gap-2.5 w-full px-3 h-[40px] text-[14px] transition-colors',
                    active ? 'text-text bg-border/20' : 'text-sub hover:text-text hover:bg-border/10'
                  )}
                >
                  <img src={c.icon} alt={c.name} className="w-5 h-5" />
                  <span>{c.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2.5 h-[40px] w-full rounded-lg border border-border px-3 hover:bg-border/40 transition-colors"
      >
        <img src={config.icon} alt={config.name} className="w-5 h-5" />
        <span className="text-[14px] text-text flex-1 text-left">{config.name}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={clsx('text-sub transition-transform', open && 'rotate-180')}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-full min-w-[160px] rounded-xl border border-border bg-[#111] shadow-2xl py-1 overflow-hidden">
          {SUPPORTED_CHAINS.map((slug) => {
            const c = CHAINS[slug]
            const active = slug === currentChain
            return (
              <button
                key={slug}
                onClick={() => switchChain(slug)}
                className={clsx(
                  'flex items-center gap-2.5 w-full px-3 h-[40px] text-[14px] transition-colors',
                  active ? 'text-text bg-border/20' : 'text-sub hover:text-text hover:bg-border/10'
                )}
              >
                <img src={c.icon} alt={c.name} className="w-5 h-5" />
                <span>{c.name}</span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-auto">
                    <path d="M3 7l3 3 5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
