import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export type Locale = 'en' | 'zh' | 'ja' | 'ko' | 'id'

export const LOCALES: Locale[] = ['en', 'zh', 'ja', 'ko', 'id']
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

function isValidLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale)
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE
  const locale: Locale = isValidLocale(raw) ? raw : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default as Record<string, unknown>,
  }
})
