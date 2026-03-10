import { redirect } from 'next/navigation'
import { DEFAULT_CHAIN } from '@/lib/chains'

export default function LegacyWatchlistPage() {
  redirect(`/${DEFAULT_CHAIN}/watchlist`)
}
