'use client'

import { FileSpreadsheet, FileText, FileDown } from 'lucide-react'
import { MenuButton, MenuItem } from '@carbon/react'
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
  return (
    <MenuButton label={label} kind="tertiary" size="sm" disabled={disabled} menuAlignment="bottom-end">
      <MenuItem label="CSV (.csv)" renderIcon={FileDown} onClick={() => exportData('csv', getInput('csv'))} />
      <MenuItem label="Excel (.xlsx)" renderIcon={FileSpreadsheet} onClick={() => exportData('excel', getInput('excel'))} />
      <MenuItem label="PDF (.pdf)" renderIcon={FileText} onClick={() => exportData('pdf', getInput('pdf'))} />
    </MenuButton>
  )
}
