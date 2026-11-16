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
import { Modal } from '@carbon/react'
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
    <Modal
      open
      size="xs"
      danger={danger}
      modalHeading={options.title ?? 'Are you sure?'}
      primaryButtonText={options.confirmLabel ?? (danger ? 'Delete' : 'Confirm')}
      secondaryButtonText={options.cancelLabel ?? 'Cancel'}
      onRequestClose={() => { pending.resolve(false); setPending(null) }}
      onRequestSubmit={() => { pending.resolve(true); setPending(null) }}
      className="z-[60]"
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', danger ? 'text-[#da1e28]' : 'text-[#8a3800]')} />
        {options.body && (
          <div className="text-[13px] text-[var(--t-text-secondary)] leading-relaxed">
            {options.body}
          </div>
        )}
      </div>
    </Modal>
  )
}
