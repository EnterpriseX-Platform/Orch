'use client'

/**
 * ReportsFilters — Linear-style "Filters" dropdown for /orch/reports.
 *
 * Mirrors the AuditFilters / EventLogFilters pattern (a single Filters button
 * that opens a panel) so the Analytics page is visually consistent with the
 * audit and event-log screens. Drives the page's existing filter state
 * (range / system / userFilter / screenFilter) — the report API already reads
 * those params, so this is purely the control surface.
 */
import { useEffect, useRef, useState } from 'react'
import { Filter, ChevronDown, X } from 'lucide-react'

type Range = '1h' | '24h' | '7d' | '30d'

const RANGES: { value: Range; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

export function ReportsFilters({
  range, onRangeChange,
  system, onSystemChange, systems,
  userFilter, onUserFilterChange,
  screenFilter, onScreenFilterChange,
}: {
  range: Range
  onRangeChange: (v: Range) => void
  system: string
  onSystemChange: (v: string) => void
  systems: string[]
  userFilter: string
  onUserFilterChange: (v: string) => void
  screenFilter: string
  onScreenFilterChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const activeCount =
    (system !== 'ALL' ? 1 : 0) + (userFilter.trim() ? 1 : 0) + (screenFilter.trim() ? 1 : 0)

  const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-[var(--t-text-muted)] mb-1.5'
  const inputCls =
    'w-full px-2 py-1 rounded text-xs bg-[var(--t-input)] border border-[var(--t-border)] text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none'

  return (
    <div ref={ref} className="relative" style={{ fontFamily: "'Prompt', sans-serif" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-[var(--t-panel)] border border-[var(--t-border)] text-[var(--t-text)] hover:border-[var(--t-accent)]"
      >
        <Filter className="w-3.5 h-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-0.5 px-1.5 rounded-full bg-[var(--t-accent)] text-white text-[10px] font-bold leading-4">
            {activeCount}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 z-50 rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)] shadow-xl p-3 space-y-3">
          {/* Date range */}
          <div>
            <p className={labelCls}>Time range</p>
            <div className="grid grid-cols-4 gap-1">
              {RANGES.map((r) => {
                const active = range === r.value
                return (
                  <button
                    key={r.value}
                    onClick={() => onRangeChange(r.value)}
                    className={`px-2 py-1 rounded text-[11px] border ${
                      active
                        ? 'border-[var(--t-accent)] text-[var(--t-accent)] bg-[var(--t-accent)]/10'
                        : 'border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]'
                    }`}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* System */}
          {systems.length > 0 && (
            <div>
              <p className={labelCls}>System</p>
              <select value={system} onChange={(e) => onSystemChange(e.target.value)} className={inputCls}>
                <option value="ALL">All Systems</option>
                {systems.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {/* User */}
          <div>
            <p className={labelCls}>User</p>
            <input
              value={userFilter}
              onChange={(e) => onUserFilterChange(e.target.value)}
              placeholder="Filter by username…"
              className={inputCls}
            />
          </div>

          {/* Screen / feature */}
          <div>
            <p className={labelCls}>Screen / Feature</p>
            <input
              value={screenFilter}
              onChange={(e) => onScreenFilterChange(e.target.value)}
              placeholder="Filter by screen name…"
              className={inputCls}
            />
          </div>

          {activeCount > 0 && (
            <button
              onClick={() => { onSystemChange('ALL'); onUserFilterChange(''); onScreenFilterChange('') }}
              className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-text)] border border-[var(--t-border)]"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
