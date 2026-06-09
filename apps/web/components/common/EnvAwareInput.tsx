'use client'

// EnvAwareInput — text input that suggests project Environment keys
// when the admin types `${env.` somewhere in the value. Click a key
// to splice "<key>}" into the input at the cursor.
//
// The component is intentionally a drop-in replacement for the
// raw <input> in our admin forms: same value/onChange contract,
// extra `projectId` so the suggestion list can be project-scoped.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface EnvAwareInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
  className?: string
  /** Project id whose Environment-tab keys feed the suggestions. */
  projectId?: string | null
}

export function EnvAwareInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  className,
  projectId,
}: EnvAwareInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [trigger, setTrigger] = useState<{ start: number; partial: string } | null>(null)

  const { data: configRows } = useQuery({
    queryKey: ['project-envs', projectId],
    queryFn: async () => {
      const params = new URLSearchParams({ projectId: projectId! })
      const res = await fetch(`/orch/api/admin/system-config?${params}`)
      if (!res.ok) return { data: [] as { key: string }[] }
      return res.json() as Promise<{ data: { key: string }[] }>
    },
    enabled: !!projectId,
    staleTime: 30_000,
  })
  const allKeys = useMemo(
    () => (configRows?.data ?? []).map(r => r.key).sort((a, b) => a.localeCompare(b)),
    [configRows],
  )

  // Detect `${env.<partial>` immediately to the left of the cursor.
  // Only opens the popover when the user is actively inside the
  // placeholder; typing freeform text leaves the input alone.
  const detectTrigger = (text: string, cursor: number) => {
    const before = text.slice(0, cursor)
    const m = before.match(/\$\{env\.([\w.-]*)$/)
    if (!m) return null
    const partial = m[1]
    const start = before.length - m[0].length + '${env.'.length
    return { start, partial }
  }

  const recomputeTrigger = () => {
    const el = inputRef.current
    if (!el) return
    const t = detectTrigger(el.value, el.selectionStart ?? el.value.length)
    setTrigger(t)
    setOpen(!!t)
  }

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const filtered = useMemo(() => {
    if (!trigger) return allKeys
    const partial = trigger.partial.toLowerCase()
    if (!partial) return allKeys
    return allKeys.filter(k => k.toLowerCase().includes(partial))
  }, [allKeys, trigger])

  const insertKey = (key: string) => {
    if (!trigger) return
    const text = value
    const cursor = inputRef.current?.selectionStart ?? text.length
    // Replace the partial fragment between trigger.start and cursor
    // with `<key>}`. The closing brace lets the user keep typing
    // immediately after — e.g. `${env.foo}/path`.
    const next = text.slice(0, trigger.start) + key + '}' + text.slice(cursor)
    onChange(next)
    setOpen(false)
    setTrigger(null)
    // Restore cursor right after the inserted `}` so the admin can
    // type the rest of the URL without re-positioning.
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = trigger.start + key.length + 1
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          // Defer so the input value has settled before we sniff
          // for the trigger.
          requestAnimationFrame(recomputeTrigger)
        }}
        onKeyUp={recomputeTrigger}
        onClick={recomputeTrigger}
        placeholder={placeholder}
        disabled={disabled}
        className={
          className ??
          'w-full px-2.5 py-1.5 bg-[var(--t-input)] border border-[var(--t-border)] rounded-md text-sm text-[var(--t-text)] placeholder:text-[var(--t-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6] transition-colors disabled:opacity-50'
        }
      />
      {open && trigger && (
        <div className="absolute z-50 mt-1 w-full max-w-md max-h-56 overflow-auto rounded-md border border-[var(--t-border)] bg-[var(--t-panel)] shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--t-text-muted)]">
              {projectId
                ? `No env key matches "${trigger.partial}". Add one in the Environment tab.`
                : 'Set a project to see env suggestions.'}
            </div>
          ) : (
            <ul className="py-1">
              {filtered.slice(0, 30).map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertKey(k)}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-[var(--t-panel-hover)] text-[var(--t-text)]"
                  >
                    <span className="text-[var(--t-text-muted)]">$&#123;env.</span>
                    {k}
                    <span className="text-[var(--t-text-muted)]">&#125;</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
