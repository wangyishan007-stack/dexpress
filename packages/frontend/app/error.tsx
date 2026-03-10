'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('error')

  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
      <div className="text-[48px] font-bold text-sub leading-none">Oops</div>
      <div className="text-[18px] text-text font-medium">{t('somethingWrong')}</div>
      <p className="text-[14px] text-sub text-center max-w-md">
        {t('unexpectedDesc')}
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-2 h-[40px] px-5 rounded-lg bg-blue text-[14px] font-medium text-white hover:bg-blue/90 transition-colors"
      >
        {t('tryAgain')}
      </button>
    </div>
  )
}
