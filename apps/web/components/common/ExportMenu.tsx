'use client'

import { useState, useRef, useEffect } from 'react'
import { Download, FileSpreadsheet, FileText, FileDown } from 'lucide-react'
import { exportData, type ExportInput } from '@/lib/export'

/**
 * Drop-in "Export" button with CSV / Excel / PDF choices.
 *
 * Pass a thunk (`getInput`) instead of the ExportInput directly so the
 * data is only materialised when the user actually picks a format —
 * avoids serialising rows every re-render of the parent.
 */
export function ExportMenu<T>({
  getInput,
  disabled,
  label = 'Export',
}: {
  getInput: (format: 'csv' | 'excel' | 'pdf') => ExportInput<T>
  disabled?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="px-3 py-1.5 rounded text-xs bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text)] flex items-center gap-1.5 disabled:opacity-50 hover:bg-[var(--t-panel-hover)]"
      >
        <Download className="w-3.5 h-3.5" /> {label}
      </button>
      {open && !disabled && (
        <div className="absolute right-0 mt-1 z-50 min-w-[160px] rounded-md border border-[var(--t-border)] bg-[var(--t-panel)] shadow-lg overflow-hidden">
          <MenuItem
            icon={<FileDown className="w-3.5 h-3.5" />}
            onClick={() => { setOpen(false); exportData('csv', getInput('csv')) }}
          >
            CSV (.csv)
          </MenuItem>
          <MenuItem
            icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
            onClick={() => { setOpen(false); exportData('excel', getInput('excel')) }}
          >
            Excel (.xlsx)
          </MenuItem>
          <MenuItem
            icon={<FileText className="w-3.5 h-3.5 text-red-500" />}
            onClick={() => { setOpen(false); exportData('pdf', getInput('pdf')) }}
          >
            PDF (.pdf)
          </MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-2 text-xs flex items-center gap-2 text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] text-left"
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}
