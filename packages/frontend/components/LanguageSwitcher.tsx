'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from 'next-intl'
import type { Locale } from '../i18n'

interface LangOption {
  locale: Locale
  flag: string
  label: string
}

const LANGUAGES: LangOption[] = [
  { locale: 'en', flag: '🇺🇸', label: 'English' },
  { locale: 'zh', flag: '🇨🇳', label: '中文' },
  { locale: 'ja', flag: '🇯🇵', label: '日本語' },
  { locale: 'ko', flag: '🇰🇷', label: '한국어' },
  { locale: 'id', flag: '🇮🇩', label: 'Indonesia' },
]

const LOCALE_COOKIE = 'NEXT_LOCALE'
const DROPDOWN_HEIGHT = 5 * 40 // approx 5 items × 40px each

function setLocaleCookie(locale: Locale) {
  const expires = new Date()
  expires.setFullYear(expires.getFullYear() + 1)
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
}

interface Props {
  /** When true, show only the flag icon (no label) */
  iconOnly?: boolean
}

export function LanguageSwitcher({ iconOnly }: Props) {
  const locale = useLocale() as Locale
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  const current = LANGUAGES.find((l) => l.locale === locale) ?? LANGUAGES[0]

  useEffect(() => { setMounted(true) }, [])

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < DROPDOWN_HEIGHT && rect.top > DROPDOWN_HEIGHT

    if (openUp) {
      setDropdownStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        zIndex: 9999,
      })
    } else {
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        zIndex: 9999,
      })
    }
  }, [])

  useEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function handleScroll() { if (open) updatePosition() }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, updatePosition])

  function handleSelect(lang: LangOption) {
    if (lang.locale === locale) { setOpen(false); return }
    setLocaleCookie(lang.locale)
    setOpen(false)
    window.location.reload()
  }

  const dropdown = open && mounted ? createPortal(
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="min-w-[140px] rounded-lg border border-border bg-bg shadow-lg py-1"
    >
      {LANGUAGES.map((lang) => (
        <button
          key={lang.locale}
          onClick={() => handleSelect(lang)}
          className={`flex items-center gap-2 w-full px-3 py-2 text-[13px] hover:bg-border/40 transition-colors ${
            lang.locale === locale ? 'text-blue font-medium' : 'text-text'
          }`}
        >
          <span>{lang.flag}</span>
          <span>{lang.label}</span>
          {lang.locale === locale && (
            <svg className="ml-auto" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      ))}
    </div>,
    document.body
  ) : null

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 h-[36px] rounded-lg bg-border/40 text-sub hover:text-text transition-colors text-[13px] ${
          iconOnly ? 'w-[36px] justify-center' : 'px-2.5'
        }`}
        title="Language"
      >
        <span>{current.flag}</span>
        {!iconOnly && <span className="hidden md:inline">{current.label}</span>}
        {!iconOnly && (
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {dropdown}
    </div>
  )
}
