'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useEffect, useState } from 'react'

export function TopBar() {
  const path = usePathname()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!isMobile) {
    return (
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 32px', height: '52px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
      </div>
    )
  }

  return (
    <nav style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', height: '56px',
    }}>
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '28px', height: '28px', background: 'var(--live)', borderRadius: '7px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 800, color: 'white', fontSize: '13px',
        }}>P</div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px', color: 'var(--text)' }}>Pulse</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {[{ href: '/', label: 'Markets' }, { href: '/bets', label: 'My Bets' }].map(item => (
          <Link key={item.href} href={item.href} style={{
            textDecoration: 'none', fontSize: '13px', fontWeight: '500',
            color: path === item.href ? 'var(--text)' : 'var(--muted)',
            padding: '4px 8px', borderRadius: '6px',
            background: path === item.href ? 'var(--surface-2)' : 'transparent',
          }}>{item.label}</Link>
        ))}
        <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
      </div>
    </nav>
  )
}
