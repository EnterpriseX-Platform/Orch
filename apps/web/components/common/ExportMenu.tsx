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
        className="h-8 px-3 text-sm flex items-center gap-2 disabled:opacity-50 border border-[#0f62fe] text-[#0f62fe] bg-transparent hover:bg-[#0f62fe] hover:text-white"
      >
        <Download className="w-3.5 h-3.5" /> {label}
      </button>
      {open && !disabled && (
        <div className="absolute right-0 mt-1 z-50 min-w-[160px] border border-[#e0e0e0] bg-white overflow-hidden">
          <MenuItem
            icon={<FileDown className="w-3.5 h-3.5" />}
            onClick={() => { setOpen(false); exportData('csv', getInput('csv')) }}
          >
            CSV (.csv)
          </MenuItem>
          <MenuItem
            icon={<FileSpreadsheet className="w-3.5 h-3.5 text-[#24a148]" />}
            onClick={() => { setOpen(false); exportData('excel', getInput('excel')) }}
          >
            Excel (.xlsx)
          </MenuItem>
          <MenuItem
            icon={<FileText className="w-3.5 h-3.5 text-[#da1e28]" />}
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
      className="w-full h-10 px-4 text-sm flex items-center gap-2 text-[#161616] hover:bg-[#e8e8e8] text-left"
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}
