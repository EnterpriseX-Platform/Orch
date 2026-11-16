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
import { Filter } from 'lucide-react'
import { Button, DismissibleTag } from '@carbon/react'

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
      <span className="text-[12px] text-[#525252]">
        Active filters
      </span>
      {active.map((f, i) => (
        <DismissibleTag
          key={i}
          size="sm"
          type="gray"
          text={`${f.label}: ${f.value}`}
          title={`Clear ${f.label}`}
          onClose={f.clear}
        />
      ))}
      {onClearAll && active.length > 1 && (
        <Button kind="ghost" size="sm" onClick={onClearAll} className="ml-1">
          Clear all
        </Button>
      )}
    </div>
  )
}
