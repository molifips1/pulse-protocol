'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Market } from '../lib/supabase'

const CATEGORY_ICONS: Record<string, string> = {
  fps: '🎯', irl: '📡', sports: '⚽', other: '🎲'
}

export function HeroTicker() {
  const [markets, setMarkets] = useState<Market[]>([])

  useEffect(() => {
    supabase
      .from('markets')
      .select('*')
      .eq('status', 'resolved')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setMarkets(data) })
  }, [])

  const items = markets.length > 0 ? markets : [
    { id: '1', title: 'xQc clutched the 1v4', outcome: 'yes', category: 'fps', total_yes_usdc: 1250 },
    { id: '2', title: 'Streamer hit the $1000 goal', outcome: 'yes', category: 'irl', total_yes_usdc: 890 },
    { id: '3', title: 'Team won the round', outcome: 'no', category: 'fps', total_yes_usdc: 450 },
  ]

  return (
    <div className="border-b border-pulse-border bg-pulse-card overflow-hidden">
      <div className="flex items-stretch">
        <div className="shrink-0 px-4 flex items-center bg-pulse-red">
          <span className="font-display text-white text-sm tracking-widest">RESULTS</span>
        </div>
        <div className="overflow-hidden flex-1">
          <div className="flex gap-8 animate-[scroll_20s_linear_infinite] whitespace-nowrap py-2 px-4"
               style={{ animation: 'scroll 25s linear infinite' }}>
            {[...items, ...items].map((m: any, i) => (
              <div key={i} className="inline-flex items-center gap-2 shrink-0 text-sm">
                <span>{CATEGORY_ICONS[m.category] || '🎲'}</span>
                <span className="text-white/70 font-mono">{m.title}</span>
                <span className={`font-mono font-semibold ${m.outcome === 'yes' ? 'text-pulse-green' : 'text-pulse-red'}`}>
                  → {m.outcome?.toUpperCase()}
                </span>
                <span className="text-pulse-muted font-mono text-xs">
                  ${(m.total_yes_usdc || 0).toFixed(0)} pool
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
