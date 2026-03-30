'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useEffect, useState } from 'react'

export function Sidebar() {
  const path = usePathname()
  const [liveCount, setLiveCount] = useState(0)

  useEffect(() => {
    fetch('/api/live-streamers')
      .then(r => r.json())
      .then(d => setLiveCount((d.streamers || []).length))
      .catch(() => {})
  }, [])

  const navItems = [
    { href: '/', label: 'Markets', icon: '◈' },
    { href: '/bets', label: 'My Bets', icon: '◎' },
  ]

  return (
    <aside style={{
      width: '240px',
      flexShrink: 0,
      borderRight: '1px solid #E5E7EB',
      background: '#F7F8FA',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      height: '100vh',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 8px' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px',
            background: '#EF4444',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '800', color: 'white', fontSize: '15px',
          }}>P</div>
          <span style={{ color: '#111827', fontWeight: '700', fontSize: '16px' }}>Pulse</span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 12px', flex: 1 }}>
        {navItems.map(item => {
          const active = path === item.href
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px', textDecoration: 'none',
              marginBottom: '2px',
              background: active ? '#FFFFFF' : 'transparent',
              color: active ? '#111827' : '#6B7280',
              fontWeight: active ? '600' : '500',
              fontSize: '14px',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: '16px', opacity: 0.7 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}

        {/* Live count */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 12px', borderRadius: '8px',
          color: '#6B7280', fontSize: '14px', fontWeight: '500',
        }}>
          <span
            className="live-dot"
            style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', display: 'inline-block', flexShrink: 0 }}
          />
          Live
          {liveCount > 0 && (
            <span style={{
              marginLeft: 'auto', background: '#FEE2E2', color: '#DC2626',
              borderRadius: '9999px', padding: '1px 7px', fontSize: '12px', fontWeight: '600',
            }}>{liveCount}</span>
          )}
        </div>
      </nav>

      {/* Bottom: chain + wallet */}
      <div style={{ padding: '16px', borderTop: '1px solid #E5E7EB' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 10px', background: '#ECFDF5', border: '1px solid #D1FAE5',
          borderRadius: '8px', marginBottom: '10px',
        }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          <span style={{ color: '#065F46', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>Base Sepolia</span>
        </div>
        <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
      </div>
    </aside>
  )
}
