// ==========================================
// useAutosave — debounced per-field autosave hook
// ==========================================
//
// Watches a flat form object, computes the diff against the last
// successfully-saved snapshot, and fires an async `save` callback
// after `debounceMs` of quiet edits. Intended for forms where
// admins want every field change to land on the server without
// remembering to hit Save.
//
// What it sends: `Partial<T>` — only the keys that changed since
// the last save. The caller decides how to PATCH that to the
// backend.
//
// What it does NOT do: validation. Callers pass `validate(form)`
// to gate saves (e.g. don't save when required fields are blank).

import { useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export function useAutosave<T extends Record<string, any>>(
  form: T,
  opts: {
    /**
     * Enable saving. Typical pattern: false until the form is
     * populated from the server, then true. Prevents an autosave
     * from clobbering DB defaults with the empty initial state.
     */
    enabled: boolean
    /** Async save. Resolve = success. Throw = surface as 'error'. */
    save: (patch: Partial<T>) => Promise<void>
    /** Debounce window between the last edit and the save. */
    debounceMs?: number
    /**
     * Optional validator. Returning false halts the save; status
     * stays at 'pending' so the indicator still tells the admin
     * something is unsaved.
     */
    validate?: (form: T) => boolean
  },
) {
  const lastSavedRef = useRef<T | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formRef = useRef(form)
  formRef.current = form
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Initialise baseline as soon as the form is enabled. Ignores
  // subsequent enable toggles to keep the diff anchored to the
  // first server-loaded snapshot.
  useEffect(() => {
    if (opts.enabled && lastSavedRef.current === null) {
      lastSavedRef.current = form
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled])

  useEffect(() => {
    if (!opts.enabled || lastSavedRef.current === null) return

    // Shallow diff — only the keys that drifted from the last save.
    const baseline = lastSavedRef.current
    const patch: Partial<T> = {}
    for (const k in form) {
      if (form[k] !== baseline[k]) (patch as any)[k] = form[k]
    }
    if (Object.keys(patch).length === 0) return

    // Validation — skip the save but mark pending so the user sees
    // "unsaved changes" while they fix the invalid field.
    if (opts.validate && !opts.validate(form)) {
      setStatus('pending')
      return
    }

    setStatus('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setStatus('saving')
      try {
        await opts.save(patch)
        // Re-snapshot from the live form, not the patch — captures
        // any edits that happened during the in-flight save so the
        // next diff doesn't double-send them.
        lastSavedRef.current = { ...formRef.current }
        setStatus('saved')
        setSavedAt(Date.now())
        setError(null)
      } catch (e: any) {
        setStatus('error')
        setError(e?.message ?? 'Autosave failed')
      }
    }, opts.debounceMs ?? 800)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, opts.enabled])

  // Best-effort flush on unmount: if the form had drifted but the
  // debounce hadn't fired, send the latest snapshot before the
  // component goes away. The save itself isn't awaited (unmount
  // can't be async), so this is a "fire as you leave" guarantee
  // rather than a strict one — but it covers the common case of
  // tab switch / route change where the user expects their last
  // edits to land.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (!opts.enabled || lastSavedRef.current === null) return
      const baseline = lastSavedRef.current
      const f = formRef.current
      const patch: Partial<T> = {}
      for (const k in f) {
        if (f[k] !== baseline[k]) (patch as any)[k] = f[k]
      }
      if (Object.keys(patch).length === 0) return
      if (opts.validate && !opts.validate(f)) return
      // Fire-and-forget — promise rejection is logged but otherwise
      // ignored; we're already on the way out.
      opts.save(patch).catch((e) => {
        console.warn('[useAutosave] flush-on-unmount failed:', e)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Force-flush whatever's pending — useful for "Save now" buttons. */
  const flush = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (lastSavedRef.current === null) return
    const baseline = lastSavedRef.current
    const patch: Partial<T> = {}
    for (const k in form) {
      if (form[k] !== baseline[k]) (patch as any)[k] = form[k]
    }
    if (Object.keys(patch).length === 0) return
    setStatus('saving')
    try {
      await opts.save(patch)
      lastSavedRef.current = { ...form }
      setStatus('saved')
      setSavedAt(Date.now())
      setError(null)
    } catch (e: any) {
      setStatus('error')
      setError(e?.message ?? 'Autosave failed')
    }
  }

  return { status, error, savedAt, flush }
}
