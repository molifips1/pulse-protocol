'use client'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Navbar() {
  const path = usePathname()
  const navLink = "font-mono text-sm transition-colors"
  const active = "text-white"
  const inactive = "text-pulse-muted hover:text-white"

  return (
    <nav className="border-b border-pulse-border bg-pulse-dark/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-pulse-red rounded-sm flex items-center justify-center">
              <span className="font-display text-white text-lg leading-none">P</span>
            </div>
            <span className="font-display text-xl tracking-widest text-white">PULSE</span>
          </Link>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/" className={`${navLink} ${path === '/' ? active : inactive}`}>Markets</Link>
            <Link href="/bets" className={`${navLink} ${path === '/bets' ? active : inactive}`}>My Bets</Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-1.5 text-xs font-mono">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-pulse-green inline-block" />
            <span className="text-pulse-green">BASE SEPOLIA</span>
          </div>
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
        </div>
      </div>
    </nav>
  )
}
