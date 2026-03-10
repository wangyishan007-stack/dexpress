import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { DEFAULT_CHAIN } from '@/lib/chains'

export default async function NotFound() {
  const t = await getTranslations('error')

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
      <div className="text-[72px] font-bold text-sub leading-none">404</div>
      <div className="text-[18px] text-text font-medium">{t('notFound')}</div>
      <p className="text-[14px] text-sub text-center max-w-md">
        {t('notFoundDesc')}
      </p>
      <Link
        href={`/${DEFAULT_CHAIN}`}
        className="flex items-center gap-2 h-[40px] px-5 rounded-lg bg-blue text-[14px] font-medium text-white hover:bg-blue/90 transition-colors"
      >
        {t('backToAllCoins')}
      </Link>
    </div>
  )
}
