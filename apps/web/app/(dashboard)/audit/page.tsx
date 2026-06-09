'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '@/lib/api'
import { 
  ClipboardList, 
  Search, 
  Download, 
  Plus, 
  Pencil, 
  Trash2, 
  LogIn, 
  LogOut, 
  Eye,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
  FileJson,
  ArrowRight,
  RefreshCw,
  Filter,
  Shield,
  Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExportMenu } from '@/components/common/ExportMenu'
import { ActiveFiltersBar } from '@/components/common/ActiveFiltersBar'
import { AuditDetailModal } from '@/components/audit/AuditDetailModal'
import { AuditFilters } from '@/components/audit/AuditFilters'
import { Pagination } from '@/components/common/Pagination'

const FONT = "'Prompt', sans-serif"

// Dark Mode Theme
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  colors: {
    blue: '#3B82F6',
    emerald: '#10B981',
    purple: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
  }
}

interface AuditData {
  id: string
  timestamp: string
  action: string
  entityType: string
  entityId: string
  description?: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  // The gateway packs assorted resolver output (refType, refId,
  // refNo, formatName, screenCode, durationMs, statusCode, …) into
  // this JSON column. transactionKey lives here too — admins use it
  // to fold rows that share a business transaction.
  changes?: Record<string, any>
  user?: {
    id: string
    username: string
    firstName?: string
    lastName?: string
  }
  userIp?: string
}

const actionConfig: Record<string, { 
  bg: string; 
  text: string; 
  border: string;
  icon: React.ElementType 
}> = {
  CREATE: {
    bg: 'bg-emerald-950',
    text: 'text-emerald-400',
    border: 'border-emerald-800',
    icon: Plus
  },
  UPDATE: {
    bg: 'bg-blue-950',
    text: 'text-blue-400',
    border: 'border-blue-800',
    icon: Pencil
  },
  DELETE: {
    bg: 'bg-red-950',
    text: 'text-red-400',
    border: 'border-red-800',
    icon: Trash2
  },
  LOGIN: {
    bg: 'bg-violet-950',
    text: 'text-violet-400',
    border: 'border-violet-800',
    icon: LogIn
  },
  LOGOUT: {
    bg: 'bg-slate-800',
    text: 'text-slate-400',
    border: 'border-slate-700',
    icon: LogOut
  },
  VIEW: {
    bg: 'bg-cyan-950',
    text: 'text-cyan-400',
    border: 'border-cyan-800',
    icon: Eye
  },
  EXPORT: {
    bg: 'bg-amber-950',
    text: 'text-amber-400',
    border: 'border-amber-800',
    icon: Download
  },
  APPROVE: {
    bg: 'bg-emerald-950',
    text: 'text-emerald-400',
    border: 'border-emerald-800',
    icon: Shield
  },
}

const entityLabels: Record<string, string> = {
  dataset: 'Dataset',
  api: 'API',
  flow: 'Flow',
  user: 'User',
  system: 'System',
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  })
}

// Format a value for display in diffs
function formatDiffValue(val: any): string {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

// Check if a value is an object/array (needs wrapping display)
function isComplexValue(val: any): boolean {
  return val !== null && val !== undefined && typeof val === 'object'
}

// Array Change Item Component
function ArrayChangeItem({ item, depth = 0 }: { item: any; depth?: number }) {
  const actionColors: Record<string, { bg: string; text: string; border: string }> = {
    added: { bg: '#10B98115', text: '#10B981', border: '#10B98130' },
    modified: { bg: '#F59E0B15', text: '#F59E0B', border: '#F59E0B30' },
    removed: { bg: '#EF444415', text: '#EF4444', border: '#EF444430' },
  }
  const colors = actionColors[item.action] || actionColors.modified

  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      padding: 10,
      marginBottom: 6,
      background: colors.bg,
      marginLeft: depth * 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          background: colors.bg,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          textTransform: 'uppercase',
        }}>
          {item.action}
        </span>
        <span style={{ fontSize: 12, color: THEME.text.muted }}>
          {item.key !== undefined ? `Key: ${item.key}` : `Index: ${item.index ?? '?'}`}
          {item.keyField ? ` (${item.keyField})` : ''}
        </span>
      </div>

      {item.action === 'added' && item.newItem !== undefined && (
        <pre style={{
          fontSize: 12,
          color: '#10B981',
          background: '#10B98110',
          padding: 8,
          borderRadius: 6,
          overflow: 'auto',
          maxHeight: 120,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {typeof item.newItem === 'object' ? JSON.stringify(item.newItem, null, 2) : String(item.newItem)}
        </pre>
      )}

      {item.action === 'removed' && item.oldItem !== undefined && (
        <pre style={{
          fontSize: 12,
          color: '#EF4444',
          background: '#EF444410',
          padding: 8,
          borderRadius: 6,
          overflow: 'auto',
          maxHeight: 120,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {typeof item.oldItem === 'object' ? JSON.stringify(item.oldItem, null, 2) : String(item.oldItem)}
        </pre>
      )}

      {item.action === 'modified' && item.fieldChanges && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          {Object.entries(item.fieldChanges).map(([field, change]: [string, any]) => {
            // Highlight only fields that ACTUALLY changed (old !== new); unchanged
            // fields recede to grey so the eye lands on what was modified.
            const changed = JSON.stringify(change?.old ?? null) !== JSON.stringify(change?.new ?? null)
            return (
            <div key={field} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 13,
              padding: '1px 0',
            }}>
              <div style={{ color: changed ? THEME.text.primary : THEME.text.secondary, fontWeight: changed ? 600 : 400 }}>
                {field}
              </div>
              <div style={{
                color: changed ? '#F87171' : THEME.text.secondary,
                opacity: changed ? 1 : 0.5,
                whiteSpace: isComplexValue(change.old) ? 'pre-wrap' : 'nowrap',
                wordBreak: isComplexValue(change.old) ? 'break-word' : undefined,
                overflow: 'hidden',
                textOverflow: isComplexValue(change.old) ? undefined : 'ellipsis',
                maxHeight: 80,
                overflowY: 'auto',
              }}>
                {formatDiffValue(change.old)}
              </div>
              <div style={{
                color: changed ? '#10B981' : THEME.text.secondary,
                opacity: changed ? 1 : 0.5,
                whiteSpace: isComplexValue(change.new) ? 'pre-wrap' : 'nowrap',
                wordBreak: isComplexValue(change.new) ? 'break-word' : undefined,
                overflow: 'hidden',
                textOverflow: isComplexValue(change.new) ? undefined : 'ellipsis',
                maxHeight: 80,
                overflowY: 'auto',
              }}>
                {formatDiffValue(change.new)}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {item.action === 'modified' && !item.fieldChanges && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          {item.oldItem !== undefined && (
            <pre style={{
              fontSize: 12,
              color: '#EF4444',
              background: '#EF444410',
              padding: 6,
              borderRadius: 4,
              overflow: 'auto',
              maxHeight: 80,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {typeof item.oldItem === 'object' ? JSON.stringify(item.oldItem, null, 2) : String(item.oldItem)}
            </pre>
          )}
          {item.newItem !== undefined && (
            <pre style={{
              fontSize: 12,
              color: '#10B981',
              background: '#10B98110',
              padding: 6,
              borderRadius: 4,
              overflow: 'auto',
              maxHeight: 80,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {typeof item.newItem === 'object' ? JSON.stringify(item.newItem, null, 2) : String(item.newItem)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// Diff Viewer Component
function ChangeDiff({ oldValues, newValues, changes }: {
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  changes?: Record<string, { old: any; new: any }>
}) {
  if (!changes && (!oldValues || !newValues)) {
    return <p style={{ fontSize: 14, color: THEME.text.muted }}>No detailed changes available</p>
  }

  const diffEntries = changes
    ? Object.entries(changes)
    : Object.entries(newValues || {}).filter(([key]) => oldValues?.[key] !== newValues?.[key])

  if (diffEntries.length === 0) {
    return <p style={{ fontSize: 14, color: THEME.text.muted }}>No changes detected</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {diffEntries.map(([key, value]) => {
        // Handle arrayChanges specially
        if (key === 'arrayChanges' && Array.isArray(value)) {
          return (
            <div key={key}>
              <div style={{ color: THEME.text.secondary, fontWeight: 500, fontSize: 14, marginBottom: 6 }}>
                Array Changes
              </div>
              {(value as any[]).map((item, idx) => (
                <ArrayChangeItem key={idx} item={item} />
              ))}
            </div>
          )
        }

        // value can be null/undefined if the record was written with a
        // sparse changes object. Guard so we don't crash on `.old`.
        const oldVal = changes ? (value && (value as any).old) : oldValues?.[key]
        const newVal = changes ? (value && (value as any).new) : newValues?.[key]
        const oldIsComplex = isComplexValue(oldVal)
        const newIsComplex = isComplexValue(newVal)
        // Highlight only fields that ACTUALLY changed (old !== new); unchanged
        // fields recede to grey so the eye lands on what was modified.
        const changed = JSON.stringify(oldVal ?? null) !== JSON.stringify(newVal ?? null)

        return (
          <div key={key} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 14,
            padding: '2px 0',
          }}>
            <div style={{ color: changed ? THEME.text.primary : THEME.text.secondary, fontWeight: changed ? 600 : 500 }}>
              {key}
            </div>
            <div style={{
              color: changed ? '#F87171' : THEME.text.secondary,
              opacity: changed ? 1 : 0.5,
              fontFamily: FONT,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: oldIsComplex ? undefined : 'ellipsis',
              whiteSpace: oldIsComplex ? 'pre-wrap' : 'nowrap',
              wordBreak: oldIsComplex ? 'break-word' : undefined,
              maxHeight: oldIsComplex ? 120 : undefined,
              overflowY: oldIsComplex ? 'auto' : undefined,
            }}>
              {formatDiffValue(oldVal)}
            </div>
            <div style={{
              color: changed ? '#10B981' : THEME.text.secondary,
              opacity: changed ? 1 : 0.5,
              fontFamily: FONT,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: newIsComplex ? undefined : 'ellipsis',
              whiteSpace: newIsComplex ? 'pre-wrap' : 'nowrap',
              wordBreak: newIsComplex ? 'break-word' : undefined,
              maxHeight: newIsComplex ? 120 : undefined,
              overflowY: newIsComplex ? 'auto' : undefined,
            }}>
              {formatDiffValue(newVal)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Value Display Component
function ValueDisplay({ value }: { value: any }) {
  if (value === null || value === undefined) return <span style={{ color: THEME.text.muted }}>-</span>
  if (typeof value === 'boolean') return <span style={{ color: THEME.accent }}>{value ? 'true' : 'false'}</span>
  if (typeof value === 'number') return <span style={{ color: THEME.colors.amber }}>{value}</span>
  if (typeof value === 'object') return (
    <code style={{ 
      fontSize: 13,
      color: THEME.text.secondary,
      background: THEME.bg,
      padding: '2px 8px', 
      borderRadius: 6,
      maxWidth: 200,
      display: 'inline-block',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }}>
      {JSON.stringify(value).slice(0, 50)}...
    </code>
  )
  return <span style={{ color: THEME.text.primary, maxWidth: 200, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(value)}</span>
}

export default function AuditPage() {
  const [searchText, setSearchText] = useState('')
  // Action is now a multi-select (Created/Updated/Deleted/Logins) applied
  // CLIENT-SIDE. [] = no action filter. The server `action` param is gone.
  const [actionFilters, setActionFilters] = useState<string[]>([])
  // Transaction grouping (Sprint: audit-transaction-key)
  // - txKeyFilter: when set, list is filtered to rows that share this txKey
  // - groupByTx:   when on, rows are folded into one card per txKey
  const [txKeyFilter, setTxKeyFilter] = useState('')
  const [groupByTx, setGroupByTx] = useState(false)
  // spec — filter by DataCatalog id (set via clicking a dataset
  // chip on a row). Empty = no filter.
  const [datasetFilter, setDatasetFilter] = useState('')
  // Secondary filter dimensions admins asked for: which entity type
  // was touched (api/dataset/flow/user/system) and which user did it.
  // Client-side — entity is multi-select ([] = all); user is free-text.
  const [entityFilters, setEntityFilters] = useState<string[]>([])
  const [userFilter, setUserFilter] = useState('')
  const [ipFilter, setIpFilter] = useState('')
  // Detail view was an inline row-expand; moved to a modal so the
  // changes diff + raw JSON have room to breathe. Same state shape,
  // different renderer at the bottom of the page.
  const [selectedLog, setSelectedLog] = useState<AuditData | null>(null)
  // Custom timestamp range, replacing the old time-preset select. Stored
  // as datetime-local value strings ('' = unset); converted to ISO for
  // the server `from`/`to` params in the query below.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const clearAllFilters = () => {
    setSearchText('')
    setActionFilters([])
    setEntityFilters([])
    setUserFilter('')
    setIpFilter('')
    setDateFrom('')
    setDateTo('')
  }

  // Server-side timestamp range. datetime-local strings are local time;
  // new Date(local).toISOString() converts to the UTC the API expects.
  const from = dateFrom ? new Date(dateFrom).toISOString() : undefined
  const to = dateTo ? new Date(dateTo).toISOString() : undefined

  const { data, isLoading, refetch } = useQuery({
    // from/to/page/pageSize drive the server fetch. action/entity/user are
    // client-side so they don't belong here (harmless if added).
    queryKey: ['audit', from, to, page, pageSize],
    queryFn: () =>
      auditApi.list({
        page,
        limit: pageSize,
        from,
        to,
      }),
  })

  const totalPages = data?.totalPages || 1

  // Reset to page 1 whenever the server-side range changes, so we never land
  // on a now-out-of-range page after narrowing the result set.
  useEffect(() => {
    setPage(1)
  }, [from, to])

  const auditLogs = data?.data || []

  const filteredData = useMemo(() => {
    return auditLogs.filter((log: AuditData) => {
      // Search now also covers transactionKey so admins can paste a
      // "FY|AGC" string into the search bar and find the transaction
      // they're chasing without leaving the page.
      const txKey = (log.changes?.transactionKey as string | undefined) ?? ''
      const matchesSearch =
        log.description?.toLowerCase().includes(searchText.toLowerCase()) ||
        log.user?.username?.toLowerCase().includes(searchText.toLowerCase()) ||
        log.entityType?.toLowerCase().includes(searchText.toLowerCase()) ||
        log.entityId?.toLowerCase().includes(searchText.toLowerCase()) ||
        txKey.toLowerCase().includes(searchText.toLowerCase())
      if (!matchesSearch) return false
      // Action multi-select — [] = all. Exact match on the enum value.
      if (actionFilters.length > 0 && !actionFilters.includes(log.action)) return false
      // Entity multi-select — [] = all. Case-insensitive because the
      // stored entityType varies (e.g. 'AGENCY', 'api', 'Dataset').
      if (
        entityFilters.length > 0 &&
        !entityFilters.some((e) => e.toLowerCase() === (log.entityType || '').toLowerCase())
      ) {
        return false
      }
      if (userFilter) {
        const u = userFilter.toLowerCase()
        const matchesUser =
          log.user?.username?.toLowerCase().includes(u) ||
          (log.changes?.username as string | undefined)?.toLowerCase().includes(u) ||
          log.user?.firstName?.toLowerCase().includes(u) ||
          log.user?.lastName?.toLowerCase().includes(u)
        if (!matchesUser) return false
      }
      // Separate client-IP filter (own column in the Filters panel).
      if (ipFilter && !log.userIp?.includes(ipFilter)) return false
      // txKey filter — set by clicking the txKey chip on a row
      if (txKeyFilter && txKey !== txKeyFilter) return false
      // dataset filter — set by clicking a dataset chip on a row
      if (datasetFilter) {
        const ids: string[] = ((log.changes?.dataCatalogs ?? []) as any[]).map(c => c?.id).filter(Boolean)
        if (!ids.includes(datasetFilter)) return false
      }
      return true
    })
  }, [auditLogs, searchText, actionFilters, entityFilters, userFilter, ipFilter, txKeyFilter, datasetFilter])

  // Group rows by transactionKey for the "Group by transaction" view.
  // Rows without a txKey become their own single-row group keyed by
  // log.id so they still render somewhere instead of being silently
  // dropped from the toggle.
  const grouped = useMemo(() => {
    if (!groupByTx) return null
    const map = new Map<string, AuditData[]>()
    for (const log of filteredData) {
      // transactionKey is usually null on microflow audits, which made every
      // row its own group (folding looked broken). Fall back to the business
      // record key: the id/code/year fields in newValues (excluding the per-
      // actor user fields), scoped by screen — so repeated saves of the same
      // record fold together. No hardcoded field names (pattern-based).
      const k = (() => {
        const c = (log.changes || {}) as Record<string, any>
        if (c.transactionKey) return c.transactionKey as string
        const nv = (log.newValues || {}) as Record<string, unknown>
        const parts = Object.keys(nv)
          .filter((f) => /(_id|code|year)$/i.test(f) && !/user|name/i.test(f))
          .sort()
          .map((f) => `${f}=${String(nv[f])}`)
        if (parts.length) return `${c.formatName || log.entityType || ''}|${parts.join('&')}`
        if (c.formatName) return `fmt:${c.formatName}`
        return log.entityId || `__row:${log.id}`
      })()
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(log)
    }
    // Newest first by max timestamp in group
    return Array.from(map.entries())
      .map(([key, rows]) => ({
        key,
        rows: rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
        latest: rows.reduce((acc, r) => r.timestamp > acc ? r.timestamp : acc, ''),
      }))
      .sort((a, b) => b.latest.localeCompare(a.latest))
  }, [groupByTx, filteredData])

  const stats = useMemo(() => {
    const total = auditLogs.length
    const create = auditLogs.filter((l: AuditData) => l.action === 'CREATE').length
    const update = auditLogs.filter((l: AuditData) => l.action === 'UPDATE').length
    const del = auditLogs.filter((l: AuditData) => l.action === 'DELETE').length
    const login = auditLogs.filter((l: AuditData) => l.action === 'LOGIN').length
    const view = auditLogs.filter((l: AuditData) => l.action === 'VIEW').length
    
    return { total, create, update, del, login, view }
  }, [auditLogs])

  // openLog opens the detail modal for a row. Named this way so the
  // onClick below reads like an imperative "open this log".
  const openLog = (log: AuditData) => setSelectedLog(log)

  const statCards = [
    { icon: Activity, label: 'Total Activities', value: stats.total, color: THEME.accent },
    { icon: Plus, label: 'Created', value: stats.create, color: THEME.colors.emerald },
    { icon: Pencil, label: 'Updated', value: stats.update, color: THEME.colors.blue },
    { icon: Trash2, label: 'Deleted', value: stats.del, color: THEME.colors.red },
    { icon: LogIn, label: 'Logins', value: stats.login, color: THEME.colors.purple },
    { icon: Eye, label: 'Views', value: stats.view, color: THEME.colors.blue },
  ]

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary }}>Audit Trail</h1>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginTop: 2 }}>Track all system activities and data changes</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1, minWidth: 0 }}>
          {/* Toolbar moved up next to Refresh: search + Filters dropdown + group-by */}
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160, maxWidth: 300 }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: THEME.text.muted }} />
            <input
              type="text"
              placeholder="Search user, entity, transactionKey…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: '100%', padding: '6px 12px 6px 34px', background: 'var(--t-input)', border: `1px solid ${THEME.border}`, borderRadius: 8, fontSize: 13, color: THEME.text.primary, outline: 'none' }}
            />
          </div>
          <AuditFilters
            searchText={searchText}
            onSearchTextChange={setSearchText}
            actionFilters={actionFilters}
            onActionFiltersChange={setActionFilters}
            entityFilters={entityFilters}
            onEntityFiltersChange={setEntityFilters}
            userFilter={userFilter}
            onUserFilterChange={setUserFilter}
            ipFilter={ipFilter}
            onIpFilterChange={setIpFilter}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            onClearAll={clearAllFilters}
          />
          <button
            onClick={() => setGroupByTx(v => !v)}
            title="Group rows by transactionKey"
            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8, background: groupByTx ? THEME.accent : 'var(--t-input)', color: groupByTx ? '#FFFFFF' : THEME.text.secondary, border: groupByTx ? 'none' : `1px solid ${THEME.border}`, whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            {groupByTx ? '⌥ Grouped' : '⌥ Group by Transaction'}
          </button>
          <button
            onClick={() => refetch()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: THEME.text.secondary,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            className="hover:border-[#3B82F6] hover:text-[#3B82F6]"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <ExportMenu
            disabled={!filteredData.length}
            getInput={() => ({
              filename: `audit-log-${new Date().toISOString().slice(0, 19)}`,
              sheetName: 'Audit',
              title: 'Audit Trail',
              meta: {
                'Date from': dateFrom || '(any)',
                'Date to': dateTo || '(any)',
                Action: actionFilters.length ? actionFilters.join(', ') : 'ALL',
                Entity: entityFilters.length ? entityFilters.join(', ') : 'ALL',
                Search: searchText || '(none)',
                Count: String(filteredData.length),
              },
              columns: [
                { key: 'timestamp', label: 'Time', width: 150, format: (r: AuditData) => new Date(r.timestamp).toLocaleString('th-TH') },
                { key: 'action', label: 'Action', width: 80 },
                { key: 'entityType', label: 'Entity Type', width: 100 },
                { key: 'entityId', label: 'Entity ID', width: 200 },
                { key: 'user.username', label: 'User', width: 80 },
                { key: 'userIp', label: 'IP', width: 100 },
                { key: 'description', label: 'Description', width: 300 },
              ],
              rows: filteredData,
            })}
          />
        </div>
      </div>

      {/* Stats Cards - Compact */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {statCards.map((stat) => (
          <div 
            key={stat.label}
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 10,
              padding: '10px',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div style={{
                width: 26,
                height: 22,
                background: `${stat.color}12`,
                border: `1px solid ${stat.color}35`,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
              </div>
              <span style={{ fontSize: 11, color: THEME.text.muted }}>{dateFrom || dateTo ? 'range' : 'all time'}</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: THEME.text.primary }}>{stat.value.toLocaleString()}</p>
            <p style={{ fontSize: 11, color: THEME.text.muted }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Active filter chips (self-hide when none). Search + Filters dropdown
          + Group-by toggle now live in the page header next to Refresh. */}
      <div style={{ marginBottom: 12 }}>
        <ActiveFiltersBar
          onClearAll={() => { clearAllFilters(); setTxKeyFilter(''); setDatasetFilter('') }}
          filters={[
            { label: 'Action', value: actionFilters.join(', '), clear: () => setActionFilters([]) },
            { label: 'Entity', value: entityFilters.join(', '), clear: () => setEntityFilters([]) },
            { label: 'Username', value: userFilter, clear: () => setUserFilter('') },
            { label: 'IP', value: ipFilter, clear: () => setIpFilter('') },
            { label: 'Search', value: searchText, clear: () => setSearchText('') },
            {
              label: 'Date',
              value: dateFrom || dateTo
                ? `${dateFrom ? dateFrom.replace('T', ' ') : '…'} → ${dateTo ? dateTo.replace('T', ' ') : '…'}`
                : '',
              clear: () => { setDateFrom(''); setDateTo('') },
            },
            { label: 'Transaction', value: txKeyFilter, clear: () => setTxKeyFilter('') },
            { label: 'Dataset', value: datasetFilter, clear: () => setDatasetFilter('') },
          ]}
        />
      </div>

      {/* Audit Table */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px 160px 130px 1fr 140px 90px 110px',
          gap: 16,
          padding: '8px 16px',
          background: 'var(--t-panel-hover)',
          borderBottom: `2px solid ${THEME.accent}`,
          fontSize: 11,
          fontWeight: 700,
          color: THEME.text.secondary,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}>
          <div>Action</div>
          <div>User</div>
          <div>Entity</div>
          <div>Description</div>
          <div>Transaction</div>
          <div>Time</div>
          <div style={{ textAlign: 'right' }}>IP</div>
        </div>

        {/* Table Body */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.text.muted }}>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span style={{ fontSize: 14 }}>Loading audit logs...</span>
            </div>
          </div>
        ) : filteredData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{
              width: 48,
              height: 40,
              background: THEME.bg,
              border: `1px solid ${THEME.border}`,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <ClipboardList className="w-6 h-6" style={{ color: THEME.text.muted }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, marginBottom: 2 }}>No audit logs found</p>
            <p style={{ fontSize: 12, color: THEME.text.muted }}>Try adjusting your filters or search query</p>
          </div>
        ) : groupByTx && grouped ? (
          /* Group-by-transaction view — each group renders a header
             with the txKey + row count, then the rows folded under
             it. The flat table layout below remains the source of
             truth for individual row markup; here we just skip the
             top-level grid and stack groups instead. */
          <div>
            {grouped.map(({ key, rows }) => (
              <div key={key} style={{ borderBottom: `1px solid ${THEME.border}` }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    background: 'var(--t-bg)',
                    borderBottom: `1px solid ${THEME.border}`,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ color: THEME.text.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transaction</span>
                  <code
                    onClick={() => setTxKeyFilter(txKeyFilter === key ? '' : key)}
                    title="Click to apply filter to this transaction"
                    style={{
                      fontFamily: FONT,
                      fontSize: 12,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'var(--t-input)',
                      color: THEME.text.primary,
                      border: `1px solid ${THEME.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    {key.startsWith('__row:') ? '— no key —' : key}
                  </code>
                  <span style={{ color: THEME.text.muted, fontWeight: 400 }}>
                    · {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                  </span>
                  <span style={{ marginLeft: 'auto', color: THEME.text.muted, fontWeight: 400 }}>
                    latest {formatTimestamp(rows[0].timestamp)}
                  </span>
                </div>
                {rows.map((log: AuditData) => {
                  const config = actionConfig[log.action] || actionConfig.VIEW
                  const Icon = config.icon
                  return (
                    <div
                      key={log.id}
                      onClick={() => openLog(log)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 16px 8px 32px',
                        cursor: 'pointer',
                        borderBottom: `1px solid ${THEME.borderLight}`,
                      }}
                      className="hover:bg-[var(--t-panel-hover)]"
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--t-bg)', border: `1px solid ${THEME.border}`,
                      }}>
                        <Icon className="w-3 h-3" style={{ color: THEME.text.secondary }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: THEME.text.secondary, minWidth: 60 }}>
                        {log.action}
                      </span>
                      <span style={{ fontSize: 12, color: THEME.text.primary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.description || `${log.action} ${log.entityType}`}
                      </span>
                      <span style={{ fontSize: 12, color: THEME.text.muted }}>
                        {log.changes?.username || log.user?.username || 'system'}
                      </span>
                      <span style={{ fontSize: 12, color: THEME.text.muted }}>
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div>
            {filteredData.map((log: AuditData) => {
              const config = actionConfig[log.action] || actionConfig.VIEW
              const Icon = config.icon
              const isExpanded = false // inline expand replaced by modal
              const hasChanges = log.changes || (log.oldValues && log.newValues)

              return (
                <div key={log.id}>
                  {/* Main Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 160px 130px 1fr 140px 90px 110px',
                      gap: 16,
                      padding: '10px 16px',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: isExpanded ? THEME.bg : 'transparent',
                      borderBottom: `1px solid ${THEME.border}`,
                      transition: 'background 0.15s ease',
                    }}
                    className="hover:bg-[var(--t-panel-hover)]"
                    onClick={() => openLog(log)}
                  >
                    {/* Expand and action icons removed per user feedback —
                        the action is already conveyed by the Action
                        column's coloured pill. */}

                    {/* Action */}
                    <div>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        background: cn(config.bg).includes('emerald') ? '#05966912' :
                                   cn(config.bg).includes('blue') ? '#3B82F612' :
                                   cn(config.bg).includes('red') ? '#DC262612' :
                                   cn(config.bg).includes('violet') ? '#7C3AED12' :
                                   cn(config.bg).includes('cyan') ? '#06B6D412' :
                                   cn(config.bg).includes('slate') ? '#64748B12' :
                                   cn(config.bg).includes('amber') ? '#F59E0B12' : 'var(--t-panel-hover)',
                        color: cn(config.text).includes('emerald') ? '#059669' :
                               cn(config.text).includes('blue') ? '#3B82F6' :
                               cn(config.text).includes('red') ? '#DC2626' :
                               cn(config.text).includes('violet') ? '#7C3AED' :
                               cn(config.text).includes('cyan') ? '#06B6D4' :
                               cn(config.text).includes('slate') ? '#64748B' :
                               cn(config.text).includes('amber') ? '#F59E0B' : '#64748B',
                        border: `1px solid ${
                          cn(config.border).includes('emerald') ? '#05966930' :
                          cn(config.border).includes('blue') ? '#3B82F630' :
                          cn(config.border).includes('red') ? '#DC262630' :
                          cn(config.border).includes('violet') ? '#7C3AED30' :
                          cn(config.border).includes('cyan') ? '#06B6D430' :
                          cn(config.border).includes('slate') ? '#64748B30' :
                          cn(config.border).includes('amber') ? '#F59E0B30' : 'var(--t-border)'
                        }`,
                      }}>
                        {log.action}
                      </span>
                    </div>

                    {/* User — single-line: small avatar + username.
                        The full name (firstName lastName) added a
                        second line that visually doubled the row
                        height for no real signal — admin shows up as
                        "admin / Admin User", which is the same info. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{
                        width: 22,
                        height: 22,
                        background: 'var(--t-panel)',
                        border: '1px solid var(--t-border)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#60A5FA',
                        fontSize: 11,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {(log.changes?.username || log.user?.username)?.charAt(0)?.toUpperCase() || 'S'}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: THEME.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.changes?.username || log.user?.username || 'System'}
                      </span>
                    </div>

                    {/* Entity — label only (entityId removed per user
                        feedback; row click already opens the full
                        detail with the id). */}
                    <div>
                      <span style={{
                        padding: '2px 8px',
                        background: 'var(--t-input)',
                        border: `1px solid ${THEME.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                        color: THEME.text.secondary,
                      }}>
                        {entityLabels[log.entityType] || log.entityType}
                      </span>
                    </div>

                    {/* Description — collapse middle-dot separators
                        when an empty field leaves a "· ·" artefact in
                        the stored string. */}
                    <div>
                      <p style={{ fontSize: 13, color: THEME.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(log.description ? log.description.replace(/\s·\s·\s/g, ' · ').replace(/^\s*·\s*|\s*·\s*$/g, '').trim() : `${log.action} ${log.entityType}`)}
                      </p>
                      {/* Dataset chips (spec). Click to filter
                          all audits to that dataset. */}
                      {(log.changes?.dataCatalogs as any[] | undefined)?.length ? (
                        <div className="flex flex-wrap gap-1 mt-1" onClick={e => e.stopPropagation()}>
                          {(log.changes!.dataCatalogs as any[]).slice(0, 3).map((c: any) => (
                            <button
                              key={c.id}
                              onClick={() => setDatasetFilter(datasetFilter === c.id ? '' : c.id)}
                              title={`${c.name} · ${c.category}`}
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 3,
                                background: datasetFilter === c.id ? THEME.accent : 'var(--t-bg)',
                                color: datasetFilter === c.id ? '#FFFFFF' : THEME.text.muted,
                                border: `1px solid ${THEME.border}`,
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {/* "Click to view changes" hint removed — the
                          entire row is already clickable to open the
                          changes panel. */}
                    </div>

                    {/* Transaction (txKey chip) — clickable filter.
                        Same key = same business transaction. */}
                    <div onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const k = log.changes?.transactionKey as string | undefined
                        if (!k) return <span style={{ fontSize: 12, color: THEME.text.muted }}>—</span>
                        const active = txKeyFilter === k
                        return (
                          <button
                            onClick={() => setTxKeyFilter(active ? '' : k)}
                            title={active ? 'Clear filter' : `Filter to txKey: ${k}`}
                            style={{
                              fontFamily: FONT,
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 4,
                              maxWidth: 150,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              background: active ? THEME.accent : 'var(--t-input)',
                              color: active ? '#FFFFFF' : THEME.text.secondary,
                              border: active ? 'none' : `1px solid ${THEME.border}`,
                              cursor: 'pointer',
                            }}
                          >
                            {k}
                          </button>
                        )
                      })()}
                    </div>

                    {/* Time */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: THEME.text.secondary }}>
                        <Clock className="w-3.5 h-3.5" />
                        {formatTimestamp(log.timestamp)}
                      </div>
                    </div>

                    {/* IP */}
                    <div style={{ textAlign: 'right' }}>
                      <code style={{ fontSize: 12, color: THEME.text.muted, fontFamily: FONT }}>
                        {log.userIp || '-'}
                      </code>
                    </div>
                  </div>

                  {/* Expand detail moved to AuditDetailModal */}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && (
        <div style={{ marginTop: 16 }}>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={data?.total}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </div>
      )}

      {/* Full-screen detail modal. renderDiff reuses the existing
          ChangeDiff component so the same diff renderer works both
          in the (now removed) inline expander and the modal. */}
      <AuditDetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        renderDiff={(l) => {
          // ChangeDiff expects typed records; our modal keeps the values
          // as `unknown` so it works for arbitrary shapes. Cast at the
          // boundary — ChangeDiff itself handles null/undefined.
          return (
            <ChangeDiff
              oldValues={l.oldValues as Record<string, any> | undefined}
              newValues={l.newValues as Record<string, any> | undefined}
              changes={
                // Broker writes the real field-by-field diff under
                // `changes.fieldChanges`; the rest of `changes` is
                // metadata (transactionKey, dataCatalogs, …) used by the
                // list view. Fall back to undefined so ChangeDiff diffs
                // old/new for legacy rows.
                ((l.changes as any)?.fieldChanges as Record<string, { old: any; new: any }> | undefined)
              }
            />
          )
        }}
      />
    </div>
  )
}
