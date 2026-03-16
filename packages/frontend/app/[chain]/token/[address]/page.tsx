'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChain } from '@/contexts/ChainContext'
import { fetchPoolsByToken, searchPools, seedDetailCache } from '@/lib/dexscreener-client'
import { explorerLink, type ChainSlug } from '@/lib/chains'

const MAX_RETRIES = 3
const RETRY_DELAY = 3000 // 3s — GT rate limit is 30 req/min

export default function TokenRedirectPage({ params }: { params: { address: string } }) {
  const router = useRouter()
  const { chain } = useChain()
  const address = params.address
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      for (let i = 0; i < MAX_RETRIES; i++) {
        if (cancelled) return
        setAttempt(i + 1)

        try {
          // Primary: direct token → pools lookup
          let pools = await fetchPoolsByToken(address, chain as ChainSlug)

          // Fallback: search by address if direct lookup returns nothing
          if (pools.length === 0) {
            pools = await searchPools(address, chain as ChainSlug)
          }

          if (cancelled) return

          if (pools.length > 0) {
            seedDetailCache(pools[0], chain as ChainSlug)
            router.replace(`/${chain}/pair/${pools[0].address}`)
            return
          }
        } catch (e) {
          console.error(`[token-redirect] attempt ${i + 1} failed:`, e)
        }

        // Wait before retrying (skip wait on last attempt)
        if (i < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAY))
        }
      }

      if (!cancelled) setError(true)
    }

    resolve()
    return () => { cancelled = true }
  }, [address, chain, router])

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-text text-[15px] font-medium">No trading pair found for this token</p>
        <p className="text-sub text-[12px] font-mono">{address.slice(0, 10)}...{address.slice(-8)}</p>
        <div className="flex items-center gap-3">
          <a href={explorerLink(chain, 'token', address)} target="_blank" rel="noopener"
            className="text-blue text-[13px] hover:underline">
            View on Explorer
          </a>
          <span className="text-sub/40">·</span>
          <a href={`/${chain}`} className="text-blue text-[13px] hover:underline">
            Back to list
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <svg className="animate-spin text-sub" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <p className="text-sub text-[13px]">
        Finding trading pair...{attempt > 1 && ` (retry ${attempt}/${MAX_RETRIES})`}
      </p>
    </div>
  )
}
