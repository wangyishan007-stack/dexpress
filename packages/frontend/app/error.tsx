'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
      <div className="text-[48px] font-bold text-sub leading-none">Oops</div>
      <div className="text-[18px] text-text font-medium">Something went wrong</div>
      <p className="text-[14px] text-sub text-center max-w-md">
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 h-[40px] px-5 rounded-lg bg-blue text-[14px] font-medium text-white hover:bg-blue/90 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
