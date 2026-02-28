'use client'

import { usePrivy, useLogin, useLogout } from '@privy-io/react-auth'

const HAS_PRIVY = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID

const NOOP = () => {}
const FALLBACK = {
  ready: false,
  authenticated: false,
  user: null,
  login: NOOP,
  logout: NOOP,
} as const

/**
 * Wraps Privy hooks with a safe fallback when NEXT_PUBLIC_PRIVY_APP_ID
 * is not configured. Prevents "missing provider" errors during dev.
 */
export function useAuth() {
  if (!HAS_PRIVY) {
    return FALLBACK
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { ready, authenticated, user } = usePrivy()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { login } = useLogin()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { logout } = useLogout()

  return { ready, authenticated, user, login, logout }
}
