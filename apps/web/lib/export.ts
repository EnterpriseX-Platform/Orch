/**
 * export.ts — shared export helpers (CSV / Excel / PDF).
 *
 * Used by /logs, /audit, /reports so every list in the app has the
 * same download UX. The formats:
 *   - CSV   : minimal, spreadsheet-friendly, no formatting
 *   - Excel : sheet name + column widths, still plain data
 *   - PDF   : landscape table with header bar + filters footer
 *
 * All three accept a common shape:
 *   { filename, sheetName?, columns, rows, title?, meta? }
 */
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ExportColumn<T = Record<string, unknown>> {
  key: string
  label: string
  width?: number // px (Excel col width = /7), chars in PDF
  format?: (row: T) => string | number
}

export interface ExportInput<T = Record<string, unknown>> {
  /** File name WITHOUT extension; extension added per format. */
  filename: string
  /** Excel sheet name (default: 'Data'). Max 31 chars. */
  sheetName?: string
  columns: ExportColumn<T>[]
  rows: T[]
  /** Optional PDF title. Defaults to filename. */
  title?: string
  /** key:value pairs printed in PDF header (filter summary). */
  meta?: Record<string, string>
}

function cellValue<T>(row: T, col: ExportColumn<T>): string | number {
  if (col.format) return col.format(row)
  // Dot-path support, e.g. "user.name"
  const parts = col.key.split('.')
  let v: unknown = row
  for (const p of parts) {
    if (v && typeof v === 'object' && p in (v as object)) {
      v = (v as Record<string, unknown>)[p]
    } else {
      v = undefined
      break
    }
  }
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- CSV ----------
export function exportCSV<T>(input: ExportInput<T>) {
  const { filename, columns, rows } = input
  const esc = (s: string | number) => {
    const str = String(s)
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }
  const lines = [
    columns.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => esc(cellValue(r, c))).join(',')),
  ]
  // UTF-8 BOM so Excel opens Thai correctly
  const content = '\uFEFF' + lines.join('\n')
  downloadBlob(`${filename}.csv`, new Blob([content], { type: 'text/csv;charset=utf-8' }))
}

// ---------- Excel ----------
export function exportExcel<T>(input: ExportInput<T>) {
  const { filename, columns, rows, sheetName = 'Data' } = input
  const header = columns.map((c) => c.label)
  const body = rows.map((r) => columns.map((c) => cellValue(r, c)))
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])
  // Column widths (chars)
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.label.length + 2, c.width ? c.width / 7 : 14) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob(`${filename}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

// ---------- PDF ----------
export function exportPDF<T>(input: ExportInput<T>) {
  const { filename, columns, rows, title, meta } = input
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // Header
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title || filename, 14, 14)

  if (meta && Object.keys(meta).length) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const metaLines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`)
    doc.text(metaLines.join('  ·  '), 14, 20)
  }
  doc.setFontSize(8)
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 14, 14, { align: 'right' })

  autoTable(doc, {
    startY: 26,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => String(cellValue(r, c)))),
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  })

  doc.save(`${filename}.pdf`)
}

/** One-call helper that routes to the right format. */
export function exportData<T>(format: 'csv' | 'excel' | 'pdf', input: ExportInput<T>) {
  if (format === 'csv')   return exportCSV(input)
  if (format === 'excel') return exportExcel(input)
  if (format === 'pdf')   return exportPDF(input)
}
