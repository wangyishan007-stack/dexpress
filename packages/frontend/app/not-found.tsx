import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
      <div className="text-[72px] font-bold text-sub leading-none">404</div>
      <div className="text-[18px] text-text font-medium">Page not found</div>
      <p className="text-[14px] text-sub text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link
        href="/"
        className="flex items-center gap-2 h-[40px] px-5 rounded-lg bg-blue text-[14px] font-medium text-white hover:bg-blue/90 transition-colors"
      >
        Back to All Coins
      </Link>
    </div>
  )
}
