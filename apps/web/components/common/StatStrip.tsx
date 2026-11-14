'use client'

import Link from 'next/link'
import type { ComponentType, CSSProperties, ReactNode } from 'react'

// One stat row used by every list/overview page so they all read the same:
// joined tiles (1px gutters), small grey label with icon, light 28px number.
// `color` only tints the icon — it carries meaning (error = red), not decoration.

export interface StatItem {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>
  color?: string
  href?: string
}

export function StatStrip({ items, className = '' }: { items: StatItem[]; className?: string }) {
  // Column count that divides the item count, so no row ends in an empty cell.
  const n = items.length
  const cols =
    n % 3 === 0 ? 'sm:grid-cols-3' + (n === 6 ? ' xl:grid-cols-6' : '')
    : n === 4 ? 'xl:grid-cols-4'
    : n === 5 ? 'xl:grid-cols-5'
    : n === 2 ? 'sm:grid-cols-2' : ''
  return (
    <div
      className={`grid grid-cols-2 ${cols} gap-px border ${n % 2 === 1 && n % 3 !== 0 ? '[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1' : ''} ${className}`}
      style={{ background: 'var(--t-border)', borderColor: 'var(--t-border)' }}
    >
      {items.map((s) => {
        const body = (
          <>
            <div className="flex items-center gap-2 mb-1 min-w-0">
              {s.icon && <s.icon className="w-4 h-4 flex-shrink-0" style={{ color: s.color ?? 'var(--t-text-secondary)' }} />}
              <span className="truncate text-[12px]" style={{ color: 'var(--t-text-secondary)' }}>{s.label}</span>
            </div>
            <p className="tabular-nums" style={{ fontSize: 28, fontWeight: 300, lineHeight: '36px', color: 'var(--t-text)' }}>
              {s.value}
            </p>
            {s.sub != null && (
              <p className="truncate text-[12px]" style={{ color: 'var(--t-text-muted)' }}>{s.sub}</p>
            )}
          </>
        )
        const cls = 'block px-4 py-3 bg-[var(--t-panel)] min-w-0'
        return s.href ? (
          <Link key={s.label} href={s.href} className={cls + ' hover:bg-[var(--t-panel-hover)] transition-colors'}>{body}</Link>
        ) : (
          <div key={s.label} className={cls}>{body}</div>
        )
      })}
    </div>
  )
}
