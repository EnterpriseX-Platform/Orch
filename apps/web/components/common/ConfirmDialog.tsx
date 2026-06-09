'use client'

/**
 * ConfirmDialog — modern replacement for `window.confirm()`. Mounts
 * a single host at the root of the dashboard and exposes a
 * `confirmDialog()` async function that callers can use just like
 * window.confirm(): `if (await confirmDialog({...})) deleteIt()`.
 *
 * Why not just call window.confirm()?
 *   - browser native dialog is unstyled, blocks the JS thread, and
 *     looks foreign on the dashboard.
 *   - it doesn't carry contextual info (item name, warning level).
 *   - it can't be themed with the rest of the admin UI.
 *
 * Usage:
 *   import { confirmDialog } from '@/components/common/ConfirmDialog'
 *   if (await confirmDialog({ title: 'Delete?', body: 'Cannot be undone.' })) {
 *     deleteMutation.mutate()
 *   }
 */
import * as React from 'react'
import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ConfirmOptions = {
  title?: string
  body?: React.ReactNode
  /** Yes-button label. Default: "Confirm" (or "Delete" when variant=danger). */
  confirmLabel?: string
  cancelLabel?: string
  /** Visual style: 'danger' renders red Confirm + warning icon. */
  variant?: 'default' | 'danger'
}

// Module-level resolver. The host component subscribes via a tiny
// emitter so any place in the app can call confirmDialog() without
// passing refs around.
type Pending = {
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

let activeListener: ((p: Pending | null) => void) | null = null

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    if (!activeListener) {
      // Host not mounted (SSR or pre-hydrate) — fall back to native
      // confirm so callers still get an answer rather than hanging.
      const text = `${options.title ?? ''}\n${typeof options.body === 'string' ? options.body : ''}`.trim()
      resolve(typeof window !== 'undefined' ? window.confirm(text) : false)
      return
    }
    activeListener({ options, resolve })
  })
}

/**
 * Mount once near the app root (e.g. dashboard layout). All
 * confirmDialog() calls from anywhere in the tree route through this
 * single host component.
 */
export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    activeListener = setPending
    return () => {
      activeListener = null
    }
  }, [])

  // Esc / Enter shortcuts so admins can keyboard their way through.
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pending.resolve(false)
        setPending(null)
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        pending.resolve(true)
        setPending(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  if (!pending) return null

  const { options } = pending
  const danger = options.variant === 'danger'
  const Icon = danger ? Trash2 : AlertTriangle

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={() => { pending.resolve(false); setPending(null) }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={cn(
          'w-full max-w-sm rounded-xl shadow-2xl overflow-hidden',
          'bg-[var(--t-panel)] border border-[var(--t-border)]',
          'animate-in zoom-in-95 fade-in duration-150',
        )}
      >
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div
            className={cn(
              'shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
              danger
                ? 'bg-red-500/15 text-red-400'
                : 'bg-amber-500/15 text-amber-400',
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--t-text)]">
              {options.title ?? 'Are you sure?'}
            </h2>
            {options.body && (
              <div className="mt-1 text-[13px] text-[var(--t-text-secondary)] leading-relaxed">
                {options.body}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 flex justify-end gap-2 border-t border-[var(--t-border-light)] bg-[var(--t-bg)]">
          <button
            type="button"
            onClick={() => { pending.resolve(false); setPending(null) }}
            className="px-3 py-1.5 text-sm rounded-md text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)] transition-colors"
          >
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => { pending.resolve(true); setPending(null) }}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md font-medium text-white transition-colors',
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[var(--t-accent)] hover:bg-[#2563EB]',
            )}
          >
            {options.confirmLabel ?? (danger ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
