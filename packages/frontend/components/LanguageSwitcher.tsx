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
        className={`flex items-center gap-1.5 h-[36px] rounded-lg text-sub hover:text-text transition-colors text-[13px] ${
          iconOnly ? 'w-[36px] justify-center bg-border/40' : 'px-2.5'
        }`}
        title="Language"
      >
        <svg width="16" height="16" viewBox="0 0 1024 1024" fill="none" className="flex-shrink-0">
          <path d="M512 64c247.424 0 448 200.576 448 448S759.424 960 512 960 64 759.424 64 512 264.576 64 512 64z m340.6 625.504l-152.385-0.003c-26.47 67.398-67.875 134.461-124.049 201.152v0.01c120.416-20.257 221.81-96.56 276.435-201.159z m-529.541-0.003l-151.66 0.003c54.495 104.353 155.541 180.543 275.585 201.015v-0.011c-56.11-66.643-97.475-133.658-123.925-201.007z m316.473 0h-255.79c27.86 62.945 70.428 126.25 127.891 189.957 56.896-63.07 99.186-125.746 127.06-188.07l0.84-1.888zM303.73 390.5H147.62C134.892 428.685 128 469.538 128 512c0 42.463 6.892 83.316 19.619 121.501h156.91C293.521 592.616 288 551.613 288 510.5c0-39.47 5.09-78.84 15.235-118.1l0.495-1.9z m357.646 0H361.898C349.95 430.638 344 470.635 344 510.5c0 40.859 6.25 81.855 18.802 123h297.67c12.552-41.145 18.802-82.141 18.802-123 0-39.865-5.95-79.862-17.898-120z m215.005 0H719.544c10.475 39.89 15.73 79.893 15.73 120 0 41.113-5.522 82.116-16.528 123.001H876.38C889.108 595.316 896 554.463 896 512c0-42.462-6.892-83.315-19.619-121.5zM444.047 133.996l-0.4 0.07C325.07 155.368 225.388 231.11 171.4 334.496l150.491 0.004c25.937-67.18 66.713-134.027 122.157-200.505z m67.594 7.547l-1.391 1.536c-57.673 64.2-100.218 127.993-127.826 191.422H640.85c-27.828-63.935-70.832-128.24-129.209-192.958z m67.461-7.7l1.366 1.645C635.28 201.473 675.64 267.823 701.383 334.5l151.218-0.004c-54.179-103.749-154.371-179.66-273.499-200.654z" fill="currentColor" fillOpacity="0.65" />
        </svg>
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
