'use client'

/**
 * AuditFilters — single "Filters" dropdown for the Audit Trail page.
 *
 * Linear-style: one button (Filter icon + active-count badge) opens an
 * absolute-positioned dark panel with collapsible sections:
 *   - Action  (multi-select checkboxes → actionFilters)
 *   - Entity  (multi-select checkboxes → entityFilters)
 *   - User    (free-text → userFilter)
 *   - Date range (two datetime-local inputs + presets → dateFrom/dateTo)
 * Fully controlled — every value + onChange comes from the parent.
 *
 * Theme is the same var(--t-*) tokens used across audit/page.tsx so it
 * sits flush next to the Refresh / Export buttons.
 */

import { useEffect, useRef, useState } from 'react'
import { Filter, ChevronDown, ChevronRight, X } from 'lucide-react'

const FONT = "'Prompt', sans-serif"

// Option groups -------------------------------------------------------

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'CREATE', label: 'Created' },
  { value: 'UPDATE', label: 'Updated' },
  { value: 'DELETE', label: 'Deleted' },
  { value: 'LOGIN', label: 'Logins' },
]

const ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'dataset', label: 'Dataset' },
  { value: 'api', label: 'Api' },
  { value: 'flow', label: 'Flow' },
  { value: 'user', label: 'User' },
  { value: 'system', label: 'System' },
]

// datetime-local wants "YYYY-MM-DDTHH:mm" in *local* time. Date.toISOString
// is UTC, so build the local string by hand from the date parts.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

export interface AuditFiltersProps {
  /** Free-text search (shared with the page's search box). */
  searchText: string
  onSearchTextChange: (v: string) => void
  /** Multi-select action filters. [] = all. */
  actionFilters: string[]
  onActionFiltersChange: (v: string[]) => void
  /** Multi-select entity filters. [] = all. */
  entityFilters: string[]
  onEntityFiltersChange: (v: string[]) => void
  /** Free-text username filter. */
  userFilter: string
  onUserFilterChange: (v: string) => void
  /** Free-text client-IP filter. */
  ipFilter: string
  onIpFilterChange: (v: string) => void
  /** datetime-local value strings. '' = unset. */
  dateFrom: string
  onDateFromChange: (v: string) => void
  dateTo: string
  onDateToChange: (v: string) => void
  /** Reset every filter this panel owns. */
  onClearAll: () => void
}

// Small reusable collapsible section --------------------------------
function Section({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderTop: '1px solid var(--t-border-light)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: FONT,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          color: 'var(--t-text-muted)',
        }}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        <span>{title}</span>
        {count ? (
          <span
            style={{
              marginLeft: 'auto',
              padding: '0 6px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              background: 'var(--t-accent)',
              color: '#FFFFFF',
            }}
          >
            {count}
          </span>
        ) : null}
      </button>
      {open && <div style={{ padding: '0 12px 10px 12px' }}>{children}</div>}
    </div>
  )
}

// A single checkbox row -------------------------------------------------
function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 0',
        cursor: 'pointer',
        fontSize: 13,
        color: checked ? 'var(--t-text)' : 'var(--t-text-secondary)',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${checked ? 'var(--t-accent)' : 'var(--t-border)'}`,
          background: checked ? 'var(--t-accent)' : 'var(--t-input)',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.5"
              stroke="#FFFFFF"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span>{label}</span>
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--t-input)',
  border: '1px solid var(--t-border)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--t-text)',
  outline: 'none',
  fontFamily: FONT,
  colorScheme: 'dark',
}

export function AuditFilters({
  searchText,
  onSearchTextChange,
  actionFilters,
  onActionFiltersChange,
  entityFilters,
  onEntityFiltersChange,
  userFilter,
  onUserFilterChange,
  ipFilter,
  onIpFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onClearAll,
}: AuditFiltersProps) {
  const [open, setOpen] = useState(false)
  // Local search that filters the option lists below (a nicety; does not
  // touch the page's free-text search, which has its own input up top).
  const [optionQuery, setOptionQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Count of distinct active filter dimensions for the badge.
  const activeCount =
    (actionFilters.length > 0 ? 1 : 0) +
    (entityFilters.length > 0 ? 1 : 0) +
    (userFilter ? 1 : 0) +
    (ipFilter ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    (searchText ? 1 : 0)

  const toggle = (arr: string[], v: string): string[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  const q = optionQuery.trim().toLowerCase()
  const actionOpts = q
    ? ACTION_OPTIONS.filter((o) => o.label.toLowerCase().includes(q))
    : ACTION_OPTIONS
  const entityOpts = q
    ? ENTITY_OPTIONS.filter((o) => o.label.toLowerCase().includes(q))
    : ENTITY_OPTIONS

  // Preset shortcut: set dateFrom = now - X, dateTo = now (local strings).
  const applyPreset = (ms: number) => {
    const now = new Date()
    const from = new Date(now.getTime() - ms)
    onDateFromChange(toLocalInputValue(from))
    onDateToChange(toLocalInputValue(now))
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          background: open || activeCount > 0 ? 'var(--t-input)' : 'var(--t-panel)',
          border: `1px solid ${open ? 'var(--t-accent)' : 'var(--t-border)'}`,
          borderRadius: 8,
          fontSize: 13,
          color: activeCount > 0 ? 'var(--t-text)' : 'var(--t-text-secondary)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontFamily: FONT,
        }}
        className="hover:border-[#3B82F6] hover:text-[#3B82F6]"
      >
        <Filter className="w-4 h-4" />
        Filters
        {activeCount > 0 && (
          <span
            style={{
              padding: '0 6px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 700,
              background: 'var(--t-accent)',
              color: '#FFFFFF',
            }}
          >
            {activeCount}
          </span>
        )}
        <ChevronDown
          className="w-3.5 h-3.5"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            width: 300,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
            fontFamily: FONT,
            overflow: 'hidden',
          }}
        >
          {/* Option search */}
          <div style={{ padding: 10 }}>
            <input
              type="text"
              placeholder="Filter options..."
              value={optionQuery}
              onChange={(e) => setOptionQuery(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Action */}
          <Section title="Action" count={actionFilters.length} defaultOpen={false}>
            {actionOpts.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No matches</p>
            ) : (
              actionOpts.map((o) => (
                <CheckRow
                  key={o.value}
                  label={o.label}
                  checked={actionFilters.includes(o.value)}
                  onToggle={() => onActionFiltersChange(toggle(actionFilters, o.value))}
                />
              ))
            )}
          </Section>

          {/* Entity */}
          <Section title="Entity" count={entityFilters.length} defaultOpen={false}>
            {entityOpts.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No matches</p>
            ) : (
              entityOpts.map((o) => (
                <CheckRow
                  key={o.value}
                  label={o.label}
                  checked={entityFilters.includes(o.value)}
                  onToggle={() => onEntityFiltersChange(toggle(entityFilters, o.value))}
                />
              ))
            )}
          </Section>

          {/* Username */}
          <Section title="Username" count={userFilter ? 1 : 0}>
            <input
              type="text"
              placeholder="e.g. user1@example.com"
              value={userFilter}
              onChange={(e) => onUserFilterChange(e.target.value)}
              style={inputStyle}
            />
          </Section>

          {/* Client IP */}
          <Section title="Client IP" count={ipFilter ? 1 : 0}>
            <input
              type="text"
              placeholder="e.g. 10.0.0.99"
              value={ipFilter}
              onChange={(e) => onIpFilterChange(e.target.value)}
              style={inputStyle}
            />
          </Section>

          {/* Date range */}
          <Section title="Date range" count={dateFrom || dateTo ? 1 : 0}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', display: 'block', marginBottom: 3 }}>
                  From
                </label>
                <input
                  type="datetime-local"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', display: 'block', marginBottom: 3 }}>
                  To
                </label>
                <input
                  type="datetime-local"
                  value={dateTo}
                  onChange={(e) => onDateToChange(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: 'Last 24h', ms: 86400000 },
                  { label: 'Last 7d', ms: 7 * 86400000 },
                  { label: 'Last 30d', ms: 30 * 86400000 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.ms)}
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 500,
                      borderRadius: 6,
                      background: 'var(--t-input)',
                      border: '1px solid var(--t-border)',
                      color: 'var(--t-text-secondary)',
                      cursor: 'pointer',
                      fontFamily: FONT,
                    }}
                    className="hover:border-[#3B82F6] hover:text-[#3B82F6]"
                  >
                    {p.label}
                  </button>
                ))}
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      onDateFromChange('')
                      onDateToChange('')
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 500,
                      borderRadius: 6,
                      background: 'transparent',
                      border: '1px solid var(--t-border)',
                      color: 'var(--t-text-muted)',
                      cursor: 'pointer',
                      fontFamily: FONT,
                    }}
                  >
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
            </div>
          </Section>

          {/* Clear all */}
          <div
            style={{
              borderTop: '1px solid var(--t-border-light)',
              padding: '8px 12px',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={onClearAll}
              style={{
                fontSize: 12,
                color: 'var(--t-text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
                fontFamily: FONT,
              }}
              className="hover:text-[var(--t-text)]"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
