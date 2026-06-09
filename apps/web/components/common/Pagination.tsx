'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

const FONT = "'Prompt', sans-serif"

// Dark Mode Theme — mirrors the tokens used across the dashboard pages
// (audit/page.tsx, logs/page.tsx) so this bar looks native on both.
const THEME = {
  panel: 'var(--t-panel)',
  input: 'var(--t-input)',
  border: 'var(--t-border)',
  accent: 'var(--t-accent)',
  text: {
    secondary: 'var(--t-text-secondary)',
    muted: 'var(--t-text-muted)',
  },
}

export interface PaginationProps {
  /** Current page (1-based). */
  page: number
  /** Total number of pages (>= 1). */
  totalPages: number
  /** Total row count, shown as "· N total" when provided. */
  total?: number
  /** Called with the next page number when the user navigates. */
  onPageChange: (page: number) => void
  /** Current page size (rows per page). */
  pageSize: number
  /** Called with the next page size when the user changes it. */
  onPageSizeChange: (pageSize: number) => void
  /** Page-size choices. Defaults to [25, 50, 100]. */
  pageSizeOptions?: number[]
}

/**
 * Build a compact list of page tokens: always the first and last page, the
 * current page and its immediate neighbours, with '…' standing in for any
 * gaps. e.g. for page 6 of 20: 1 … 5 6 7 … 20.
 */
function buildPageTokens(page: number, totalPages: number): (number | 'ellipsis')[] {
  // Few enough pages to show them all without ellipses.
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const tokens: (number | 'ellipsis')[] = []
  const pushed = new Set<number>()
  const candidates = [1, page - 1, page, page + 1, totalPages]

  let prev = 0
  for (const raw of candidates) {
    const p = Math.min(Math.max(raw, 1), totalPages)
    if (pushed.has(p)) continue
    if (p - prev > 1) tokens.push('ellipsis')
    tokens.push(p)
    pushed.add(p)
    prev = p
  }
  return tokens
}

/**
 * Controlled pagination bar (page navigation + page-size selector).
 *
 * Always renders — even when totalPages <= 1 — so the page-size control stays
 * visible. Styled with the same var(--t-*) tokens the dashboard pages use.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages)
  const canPrev = page > 1
  const canNext = page < safeTotalPages
  const tokens = buildPageTokens(page, safeTotalPages)

  // Base style for the Prev / Next arrow buttons. `enabled` drives the
  // muted-color + not-allowed + dimmed disabled treatment.
  const arrowStyle = (enabled: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    background: THEME.panel,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    fontSize: 13,
    fontFamily: FONT,
    color: enabled ? THEME.text.secondary : THEME.text.muted,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  })

  // Numbered page button. The current page is highlighted with the accent.
  const numberStyle = (active: boolean): React.CSSProperties => ({
    minWidth: 32,
    padding: '6px 8px',
    background: active ? THEME.accent : THEME.panel,
    border: `1px solid ${active ? THEME.accent : THEME.border}`,
    borderRadius: 6,
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: active ? 600 : 400,
    color: active ? '#FFFFFF' : THEME.text.secondary,
    cursor: active ? 'default' : 'pointer',
    textAlign: 'center',
  })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      {/* Left: page summary + page-size selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <p style={{ fontSize: 13, color: THEME.text.muted, fontFamily: FONT, margin: 0 }}>
          Page {page} of {safeTotalPages}
          {total != null ? ` · ${total.toLocaleString()} total` : ''}
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{
              padding: '5px 8px',
              background: THEME.input,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              fontSize: 13,
              fontFamily: FONT,
              color: THEME.text.secondary,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: THEME.text.muted, fontFamily: FONT }}>per page</span>
        </label>
      </div>

      {/* Right: prev / page numbers / next */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          style={arrowStyle(canPrev)}
          disabled={!canPrev}
          onClick={() => canPrev && onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        {tokens.map((token, i) =>
          token === 'ellipsis' ? (
            <span
              key={`ellipsis-${i}`}
              style={{ padding: '0 4px', fontSize: 13, color: THEME.text.muted, fontFamily: FONT }}
            >
              …
            </span>
          ) : (
            <button
              key={token}
              type="button"
              style={numberStyle(token === page)}
              disabled={token === page}
              onClick={() => token !== page && onPageChange(token)}
              aria-current={token === page ? 'page' : undefined}
            >
              {token}
            </button>
          ),
        )}

        <button
          type="button"
          style={arrowStyle(canNext)}
          disabled={!canNext}
          onClick={() => canNext && onPageChange(page + 1)}
          aria-label="Next page"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
