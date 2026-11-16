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
import { Button, Select, SelectItem, Tag, TextInput } from '@carbon/react'

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

  const labelCls = 'text-[12px] text-[#525252] mb-1.5'

  return (
    <div ref={ref} className="relative" style={{ fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif' }}>
      <Button kind="tertiary" size="sm" onClick={() => setOpen((o) => !o)}>
        <Filter className="w-3.5 h-3.5 mr-2" />
        Filters
        {activeCount > 0 && (
          <Tag type="high-contrast" size="sm" className="ml-1.5 !my-0">{activeCount}</Tag>
        )}
        <ChevronDown className="w-3 h-3 ml-1.5" />
      </Button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 z-50 bg-white border border-[#e0e0e0] p-3 space-y-3">
          {/* Date range */}
          <div>
            <p className={labelCls}>Time range</p>
            <div className="grid grid-cols-4 gap-1">
              {RANGES.map((r) => {
                const active = range === r.value
                return (
                  <Button
                    key={r.value}
                    kind={active ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => onRangeChange(r.value)}
                    className="!px-2 !min-w-0 justify-center"
                  >
                    {r.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* System */}
          {systems.length > 0 && (
            <Select id="reports-filter-system" labelText="System" size="sm" value={system} onChange={(e) => onSystemChange(e.target.value)}>
              <SelectItem value="ALL" text="All Systems" />
              {systems.map((s) => (
                <SelectItem key={s} value={s} text={s} />
              ))}
            </Select>
          )}

          {/* User */}
          <TextInput
            id="reports-filter-user"
            labelText="User"
            size="sm"
            value={userFilter}
            onChange={(e) => onUserFilterChange(e.target.value)}
            placeholder="Filter by user name…"
          />

          {/* Screen / feature */}
          <TextInput
            id="reports-filter-screen"
            labelText="Screen / Feature"
            size="sm"
            value={screenFilter}
            onChange={(e) => onScreenFilterChange(e.target.value)}
            placeholder="Filter by screen name…"
          />

          {activeCount > 0 && (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={X}
              onClick={() => { onSystemChange('ALL'); onUserFilterChange(''); onScreenFilterChange('') }}
              className="w-full max-w-none"
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
