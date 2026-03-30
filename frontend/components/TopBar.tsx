'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export function TopBar() {
  const path = usePathname()

  return (
    <>
      {/* Mobile navbar — visible below lg */}
      <nav style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '56px',
      }} className="lg:hidden">
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', background: '#EF4444', borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '800', color: 'white', fontSize: '13px',
          }}>P</div>
          <span style={{ color: '#111827', fontWeight: '700', fontSize: '15px' }}>Pulse</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {[
            { href: '/', label: 'Markets' },
            { href: '/bets', label: 'My Bets' },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              textDecoration: 'none', fontSize: '14px', fontWeight: '500',
              color: path === item.href ? '#111827' : '#6B7280',
              borderBottom: path === item.href ? '2px solid #6366F1' : '2px solid transparent',
              paddingBottom: '2px',
            }}>
              {item.label}
            </Link>
          ))}
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
        </div>
      </nav>

      {/* Desktop top bar — visible from lg, inside the main content area */}
      <div style={{
        borderBottom: '1px solid #E5E7EB',
        padding: '0 32px',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        background: '#FFFFFF',
        flexShrink: 0,
      }} className="hidden lg:flex">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 10px', background: '#ECFDF5', border: '1px solid #D1FAE5', borderRadius: '8px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
            <span style={{ color: '#065F46', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>Base Sepolia</span>
          </div>
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
        </div>
      </div>
    </>
  )
}
