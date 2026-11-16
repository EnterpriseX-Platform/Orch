'use client'

import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Settings } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useTenantStore } from '@/stores/tenantStore'

export function TenantSwitcher({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const dark = variant === 'dark'
  const { tenants, current, load, loaded, switchTo } = useTenantStore()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (!loaded || !current) return null

  const pick = async (id: string) => {
    if (id === current.id) return setOpen(false)
    setBusy(id)
    try {
      await switchTo(id)
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <div className="relative flex" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={dark
          ? 'h-12 px-4 flex items-center gap-2 text-[13px] text-white hover:bg-[#333333] transition-colors max-w-[260px]'
          : 'h-8 px-2 flex items-center gap-2 text-[13px] hover:bg-[var(--t-panel-hover)] transition-colors max-w-[220px]'}
        style={dark ? (open ? { backgroundColor: '#393939' } : undefined) : { color: 'var(--t-text)' }}
        title="Switch tenant"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: dark ? '#c6c6c6' : 'var(--t-text-muted)' }} />
        <span className="flex flex-col items-start min-w-0 leading-4">
          {dark && <span className="text-[11px] text-[#c6c6c6]">Tenant</span>}
          <span className="truncate max-w-[180px]">{current.name}</span>
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: dark ? '#c6c6c6' : 'var(--t-text-muted)' }} />
      </button>

      {open && (
        <div
          className={`absolute top-full w-72 border py-1 z-50 ${dark ? 'left-0' : 'right-0 mt-1'}`}
          style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)' }}
          role="listbox"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t-text-muted)' }}>
            Tenant
          </div>
          {tenants.map((t) => (
            <button
              key={t.id}
              role="option"
              aria-selected={t.id === current.id}
              onClick={() => pick(t.id)}
              disabled={!!busy}
              className="w-full flex items-center gap-2 px-3 h-9 text-left text-[13px] hover:bg-[var(--t-panel-hover)] disabled:opacity-60"
              style={{ color: 'var(--t-text)' }}
            >
              <span className="flex-1 min-w-0">
                <span className="block truncate">{t.name}</span>
                <span className="block text-[11px] truncate" style={{ color: 'var(--t-text-muted)' }}>
                  {t.projectCount} projects · {t.role ?? 'member'}
                </span>
              </span>
              {t.id === current.id && <Check className="w-4 h-4 text-[#0f62fe]" />}
              {busy === t.id && <span className="text-[11px]" style={{ color: 'var(--t-text-muted)' }}>…</span>}
            </button>
          ))}
          <div className="border-t mt-1 pt-1" style={{ borderColor: 'var(--t-border)' }}>
            <Link
              href="/settings?tab=tenants"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 h-9 text-[13px] text-[#0f62fe] hover:bg-[var(--t-panel-hover)]"
            >
              <Settings className="w-4 h-4" /> Manage tenants
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
