'use client'

import { useEffect } from 'react'

/** Lock body scroll while the component is mounted (or while `active` is true) */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}
