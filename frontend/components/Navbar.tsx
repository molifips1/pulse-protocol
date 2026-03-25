'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export function Navbar() {
  const path = usePathname()

  return (
    <nav style={{
      background: '#111827',
      borderBottom: '1px solid #1F2937',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '0 20px',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '24px',
      }}>
        {/* Left: Logo + Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px',
              background: '#DC2626',
              borderRadius: '6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: '900', color: 'white', fontSize: '14px'
            }}>P</div>
            <span style={{ color: 'white', fontWeight: '700', fontSize: '16px', letterSpacing: '0.05em' }}>
              PULSE
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {[
              { href: '/', label: 'Markets' },
              { href: '/bets', label: 'My Bets' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: path === item.href ? 'white' : '#6B7280',
                background: path === item.href ? '#1F2937' : 'transparent',
                transition: 'all 0.15s',
              }}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: Network + Wallet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 10px',
            background: '#0D1117',
            border: '1px solid #1F2937',
            borderRadius: '8px',
          }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: '#34D399', display: 'inline-block'
            }} />
            <span style={{ color: '#34D399', fontSize: '12px', fontFamily: 'monospace', fontWeight: '600' }}>
              Base Sepolia
            </span>
          </div>

          <ConnectButton
            showBalance={false}
            chainStatus="none"
            accountStatus="avatar"
          />
        </div>
      </div>
    </nav>
  )
}