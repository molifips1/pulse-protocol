'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px',
            background: 'var(--live)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, color: 'white', fontSize: '15px',
          }}>P</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: 'var(--text)', letterSpacing: '-0.02em' }}>Pulse</span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 12px', flex: 1 }}>
        {[
          { href: '/', label: 'Markets', icon: '▦' },
          { href: '/bets', label: 'My Bets', icon: '◈' },
        ].map(item => {
          const active = path === item.href
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', borderRadius: '8px', marginBottom: '2px',
                background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
                fontSize: '14px', fontWeight: active ? '600' : '500',
                transition: 'all 0.15s',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: '13px', opacity: 0.8 }}>{item.icon}</span>
                {item.label}
                {active && <span style={{
                  marginLeft: 'auto', width: '5px', height: '5px',
                  borderRadius: '50%', background: 'var(--accent)',
                }} />}
              </div>
            </Link>
          )
        })}

        {/* Live count */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 12px', borderRadius: '8px', marginBottom: '2px',
          color: 'var(--muted)', fontSize: '14px', fontWeight: '500',
        }}>
          <span className="live-dot" />
          Live
          {liveCount > 0 && (
            <span style={{
              marginLeft: 'auto',
              background: 'rgba(255,45,85,0.15)', color: 'var(--live)',
              borderRadius: '6px', padding: '1px 7px', fontSize: '11px',
              fontFamily: 'var(--font-mono)', fontWeight: '600',
            }}>{liveCount}</span>
          )}
        </div>
      </nav>

      {/* Bottom */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 10px',
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: '8px',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: 'var(--green)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>Base Sepolia</span>
        </div>
      </div>
    </aside>
  )
}
