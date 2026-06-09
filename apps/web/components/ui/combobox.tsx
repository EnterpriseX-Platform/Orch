'use client'

// Combobox — searchable dropdown that replaces native <select> for
// long-list cases (flow picker, queue picker, scheduler picker).
//
// Why not a third-party component:
//   * The app already pulls a heavy bundle; one more dropdown lib is
//     hard to justify.
//   * Native <select> looks dated (especially on macOS Safari) and
//     lacks search, which is the actual UX gap the user flagged.
//   * Keyboard-only nav + accessible labels are easy enough by hand.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS = "'Prompt', sans-serif"

export interface ComboboxOption {
  value: string
  label: string
  // Optional secondary text shown in muted color (e.g. ID, type).
  hint?: string
  // Disabled options are visible but unselectable.
  disabled?: boolean
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  // When true, lets the user type a value not in the list (free-form).
  // Off by default — most pickers want to constrain to known options.
  allowFreeText?: boolean
  disabled?: boolean
  className?: string
  // Lookup label for an arbitrary value (in case `value` is set to
  // something not currently in `options`, e.g. a flowId whose flow was
  // deleted). Defaults to the value itself.
  resolveLabel?: (value: string) => string | undefined
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  allowFreeText = false,
  disabled = false,
  className = '',
  resolveLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Position the popover via fixed-coords from the trigger's rect
  // so it escapes any ancestor `overflow: hidden` (SectionCard,
  // modal bodies, scrollable panels). null = closed / not yet
  // measured.
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const measure = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ left: r.left, top: r.bottom + 4, width: r.width })
  }

  // Close on outside click — has to also ignore clicks inside the
  // popover, which is portaled outside the wrapRef subtree now.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Re-measure on open + on scroll/resize so the popover stays
  // anchored as the page moves under it.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    measure()
    const handler = () => measure()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  // Auto-focus input when opening.
  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!query) return options
    const q = query.toLowerCase()
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.hint || '').toLowerCase().includes(q),
    )
  }, [options, query])

  const selectedLabel = useMemo(() => {
    const hit = options.find((o) => o.value === value)
    // Fall back to the raw value when an option with no label slips
    // in — never show a blank trigger when something is selected.
    if (hit) return hit.label || hit.value
    if (!value) return ''
    return resolveLabel?.(value) || value
  }, [options, value, resolveLabel])

  const select = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[highlight]
      if (opt && !opt.disabled) select(opt.value)
      else if (allowFreeText && query) select(query)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 hover:opacity-95 transition"
        style={{
          background: 'var(--t-input)',
          border: '1px solid var(--t-border)',
          color: value ? 'var(--t-text)' : 'var(--t-text-muted)',
          borderRadius: 6,
          padding: '6px 10px',
          // Match the rest of the form (sans-serif, text-sm) so the
          // trigger doesn't read as a different control.
          fontFamily: SANS,
          fontSize: 13,
          minHeight: 34,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {/* min-w-0 lets `truncate` actually clip; without it the
            flex item refuses to shrink below content width and the
            ellipsis never appears. */}
        <span className="truncate flex-1 min-w-0">{selectedLabel || placeholder}</span>
        {value && !disabled && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            className="hover:opacity-70"
            style={{ color: 'var(--t-text-muted)' }}
            title="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronsUpDown className="w-3.5 h-3.5" style={{ color: 'var(--t-text-muted)' }} />
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="shadow-xl"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 6,
            maxHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            // High enough to clear modals (z-50) and any other app
            // overlays that might sit above SectionCards.
            zIndex: 1000,
          }}
        >
          <div
            className="flex items-center gap-2 px-2 py-1.5"
            style={{ borderBottom: '1px solid var(--t-border-light)' }}
          >
            <Search className="w-3.5 h-3.5" style={{ color: 'var(--t-text-muted)' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search…"
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: 13, color: 'var(--t-text)', fontFamily: SANS }}
            />
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-center" style={{ fontSize: 11.5, color: 'var(--t-text-muted)' }}>
                {allowFreeText && query
                  ? <span>No match — Enter to use &ldquo;{query}&rdquo;</span>
                  : 'No matches'}
              </div>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.value === value
                const isHighlighted = i === highlight
                return (
                  <div
                    key={opt.value}
                    onClick={() => !opt.disabled && select(opt.value)}
                    onMouseEnter={() => setHighlight(i)}
                    className="flex items-center justify-between gap-2 px-3 py-2 transition"
                    style={{
                      background: isHighlighted ? 'var(--t-input)' : 'transparent',
                      opacity: opt.disabled ? 0.5 : 1,
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: 13, color: 'var(--t-text)', fontFamily: SANS }} className="truncate">
                        {opt.label}
                      </div>
                      {opt.hint && (
                        <div
                          style={{ fontSize: 11, color: 'var(--t-text-muted)', fontFamily: MONO }}
                          className="truncate"
                        >
                          {opt.hint}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--t-accent)' }} />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
