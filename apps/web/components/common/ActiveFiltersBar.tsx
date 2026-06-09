'use client'

/**
 * ActiveFiltersBar — compact "what's applied right now" chip row.
 *
 * Used on /orch/logs and /orch/audit so admins can tell at a glance
 * which filters are narrowing the result set (and kill any of them
 * with one click). Hidden entirely when nothing is filtered.
 *
 * Designed to slot into the existing filter-bar Card: no background,
 * just a thin row of chips.
 */
import { X, Filter } from 'lucide-react'

export interface ActiveFilter {
  label: string
  value: string
  clear: () => void
  /** Optional colour hint so the chip matches the upstream control
   *  (e.g. red for 5xx, blue for method GET). Defaults to accent. */
  color?: string
}

export function ActiveFiltersBar({
  filters,
  onClearAll,
}: {
  filters: ActiveFilter[]
  onClearAll?: () => void
}) {
  const active = filters.filter((f) => f.value && f.value !== 'all' && f.value !== 'ALL')
  if (active.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs py-2">
      <Filter className="w-3.5 h-3.5 text-[var(--t-text-muted)]" />
      <span className="text-[11px] text-[var(--t-text-muted)] font-semibold uppercase tracking-wider">
        Active filters
      </span>
      {active.map((f, i) => {
        const color = f.color || 'var(--t-accent)'
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border"
            style={{
              color,
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
            }}
          >
            <span className="text-[var(--t-text-muted)] font-normal">{f.label}:</span>
            <span>{f.value}</span>
            <button
              onClick={f.clear}
              className="hover:bg-black/20 rounded"
              title={`Clear ${f.label}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )
      })}
      {onClearAll && active.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-text)] underline underline-offset-2 ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
