import { redirect } from 'next/navigation'
import { DEFAULT_CHAIN } from '@/lib/chains'

export default function LegacyGainersPage() {
  redirect(`/${DEFAULT_CHAIN}/gainers`)
}
