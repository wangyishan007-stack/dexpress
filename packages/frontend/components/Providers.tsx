'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { WatchlistProvider } from '../hooks/useWatchlist'
import { FollowedWalletsProvider } from '../hooks/useFollowedWallets'
import { ToastProvider } from './Toast'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID

const BASE_CHAIN = {
  id: 8453,
  name: 'Base',
  network: 'base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet.base.org'] },
  },
}

const BSC_CHAIN = {
  id: 56,
  name: 'BNB Smart Chain',
  network: 'bsc',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://bsc-dataseed.binance.org'] },
  },
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Skip PrivyProvider when App ID is not configured
  if (!PRIVY_APP_ID) {
    return (
      <ToastProvider>
        <FollowedWalletsProvider><WatchlistProvider>{children}</WatchlistProvider></FollowedWalletsProvider>
      </ToastProvider>
    )
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          showWalletLoginFirst: true,
          logo: '/branding/logo.png',
          walletList: ['metamask', 'coinbase_wallet', 'wallet_connect'],
        },
        loginMethods: ['wallet', 'email'],
        defaultChain: BASE_CHAIN as any,
        supportedChains: [BASE_CHAIN as any, BSC_CHAIN as any],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <ToastProvider>
        <FollowedWalletsProvider>
          <WatchlistProvider>
            {children}
          </WatchlistProvider>
        </FollowedWalletsProvider>
      </ToastProvider>
    </PrivyProvider>
  )
}
