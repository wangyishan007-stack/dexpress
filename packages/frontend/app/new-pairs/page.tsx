import { redirect } from 'next/navigation'
import { DEFAULT_CHAIN } from '@/lib/chains'

export default function LegacyNewPairsPage() {
  redirect(`/${DEFAULT_CHAIN}/new-pairs`)
}
