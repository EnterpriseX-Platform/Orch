'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { eventLogsApi } from '@/lib/api'
import {
  Search,
  Clock,
  AlertTriangle,
  XCircle,
  Terminal,
  Activity,
  Info as InfoIcon,
  Bug,
  GitBranch,
  RefreshCw,
} from 'lucide-react'
import { ExportMenu } from '@/components/common/ExportMenu'
import { ActiveFiltersBar } from '@/components/common/ActiveFiltersBar'
import { EventLogDetailModal } from '@/components/logs/EventLogDetailModal'
import { EventLogFilters } from '@/components/logs/EventLogFilters'
import { Pagination } from '@/components/common/Pagination'
import { eventDisplay, eventKindColor } from '@/lib/event-logs'

interface EventLogData {
  id: string
  timestamp: string
  createdAt?: string
  eventType: string
  level: string // info | warn | error | debug
  message?: string | null
  data?: unknown
  flowId?: string | null
  flowName?: string | null
  requestId: string
  userId?: string | null
  userIp?: string | null
}

const FONT = "'Prompt', sans-serif"

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
}

// Level palette — solid fill + white text so the severity reads at a
// glance (mirrors the HTTP-status palette the api_logs screen used).
const LEVEL_HEX: Record<string, { bg: string; text: string; dot: string }> = {
  info:  { bg: '#3B82F6', text: '#FFFFFF', dot: '#60A5FA' },
  warn:  { bg: '#F59E0B', text: '#FFFFFF', dot: '#FBBF24' },
  error: { bg: '#EF4444', text: '#FFFFFF', dot: '#F87171' },
  debug: { bg: '#64748B', text: '#FFFFFF', dot: '#94A3B8' },
}

function levelKey(level: string): 'info' | 'warn' | 'error' | 'debug' {
  const l = (level || '').toLowerCase()
  if (l === 'warn' || l === 'warning') return 'warn'
  if (l === 'error' || l === 'fatal') return 'error'
  if (l === 'debug' || l === 'trace') return 'debug'
  return 'info'
}

export default function LogsPage() {
  const [searchText, setSearchText] = useState('')
  const [levelFilters, setLevelFilters] = useState<string[]>([]) // [] = all
  const [eventTypeFilters, setEventTypeFilters] = useState<string[]>([]) // [] = all
  const [dateFrom, setDateFrom] = useState('') // datetime-local string, '' = unset
  const [dateTo, setDateTo] = useState('') // datetime-local string, '' = unset
  const [userFilter, setUserFilter] = useState('')
  const [ipFilter, setIpFilter] = useState('')
  const [selectedLog, setSelectedLog] = useState<EventLogData | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['event-logs', page, pageSize],
    queryFn: () => eventLogsApi.list({ page, limit: pageSize }),
  })

  const logs: EventLogData[] = data?.data || []
  const totalPages = data?.totalPages || 1
  const total = data?.total

  // Client-side filters narrow the current server page; reset to page 1 when
  // any of them changes so we don't sit on a page that's now empty.
  useEffect(() => {
    setPage(1)
  }, [searchText, levelFilters, eventTypeFilters, userFilter, ipFilter, dateFrom, dateTo])

  const clearAllFilters = () => {
    setLevelFilters([])
    setEventTypeFilters([])
    setSearchText('')
    setUserFilter('')
    setIpFilter('')
    setDateFrom('')
    setDateTo('')
  }

  // Distinct event types present in the current page — drive the type filter.
  // Without the 'ALL' sentinel: EventLogFilters multi-selects raw values.
  const eventTypes = useMemo(() => {
    const set = new Set<string>()
    logs.forEach((l) => l.eventType && set.add(l.eventType))
    return Array.from(set).sort()
  }, [logs])

  const filteredLogs = useMemo(() => {
    // datetime-local strings are local time; new Date(str) parses them as
    // local, matching toLocalInputValue in EventLogFilters. '' = unbounded.
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null
    const toTs = dateTo ? new Date(dateTo).getTime() : null

    return logs.filter((log) => {
      const q = searchText.toLowerCase()
      const matchesSearch =
        !q ||
        log.eventType?.toLowerCase().includes(q) ||
        log.message?.toLowerCase().includes(q) ||
        log.flowName?.toLowerCase().includes(q) ||
        log.requestId?.toLowerCase().includes(q) ||
        log.userIp?.includes(searchText)

      if (!matchesSearch) return false
      if (eventTypeFilters.length && !eventTypeFilters.includes(log.eventType)) return false
      if (levelFilters.length && !levelFilters.includes(levelKey(log.level))) return false
      // Username filter — match the event's userId or any username embedded in
      // its captured data (e.g. the microflow request's user_name).
      if (userFilter) {
        const u = userFilter.toLowerCase()
        const hay = `${log.userId || ''} ${JSON.stringify(log.data || {})}`.toLowerCase()
        if (!hay.includes(u)) return false
      }
      // Separate client-IP filter.
      if (ipFilter && !log.userIp?.includes(ipFilter)) return false

      // Date range — compare against the log's timestamp (fall back to
      // createdAt, mirroring the table's `timestamp || createdAt`).
      if (fromTs !== null || toTs !== null) {
        const raw = log.timestamp || log.createdAt
        const ts = raw ? new Date(raw).getTime() : NaN
        if (Number.isNaN(ts)) return false
        if (fromTs !== null && ts < fromTs) return false
        if (toTs !== null && ts > toTs) return false
      }
      return true
    })
  }, [logs, searchText, levelFilters, eventTypeFilters, userFilter, ipFilter, dateFrom, dateTo])

  const stats = useMemo(() => {
    const total = logs.length
    const info = logs.filter((l) => levelKey(l.level) === 'info').length
    const warn = logs.filter((l) => levelKey(l.level) === 'warn').length
    const error = logs.filter((l) => levelKey(l.level) === 'error').length
    const debug = logs.filter((l) => levelKey(l.level) === 'debug').length
    return { total, info, warn, error, debug }
  }, [logs])

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      {/* Header — title left; search + Filters + Refresh + Export grouped right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary }}>Event Logs</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1, minWidth: 0 }}>
          {/* Free-text search */}
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160, maxWidth: 300 }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: THEME.text.muted }} />
            <input
              type="text"
              placeholder="Search event type, message, flow, request id…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: '100%', padding: '6px 12px 6px 34px', background: 'var(--t-input)', border: `1px solid ${THEME.border}`, borderRadius: 8, fontSize: 13, color: THEME.text.primary, outline: 'none' }}
            />
          </div>
          <EventLogFilters
            searchText={searchText}
            onSearchTextChange={setSearchText}
            eventTypes={eventTypes}
            eventTypeFilters={eventTypeFilters}
            onEventTypeFiltersChange={setEventTypeFilters}
            levelFilters={levelFilters}
            onLevelFiltersChange={setLevelFilters}
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
            disabled={!filteredLogs.length}
            getInput={() => ({
              filename: `event-logs-${new Date().toISOString().slice(0, 19)}`,
              sheetName: 'Event Logs',
              title: 'Event Logs',
              meta: {
                'Date from': dateFrom || '(any)',
                'Date to': dateTo || '(any)',
                Level: levelFilters.length ? levelFilters.join(', ') : '(all)',
                'Event type': eventTypeFilters.length ? eventTypeFilters.join(', ') : '(all)',
                Search: searchText || '(none)',
                Count: String(filteredLogs.length),
              },
              columns: [
                { key: 'timestamp', label: 'Time', width: 150, format: (r: EventLogData) => new Date(r.timestamp).toLocaleString('th-TH') },
                { key: 'level', label: 'Level', width: 70 },
                { key: 'eventType', label: 'Event Type', width: 180 },
                { key: 'message', label: 'Message', width: 280 },
                { key: 'flowName', label: 'Flow', width: 160 },
                { key: 'requestId', label: 'Request ID', width: 200 },
              ],
              rows: filteredLogs,
            })}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {[
          { icon: Activity, label: 'Total', value: stats.total.toString(), color: '#8B92A5' },
          { icon: InfoIcon, label: 'Info', value: stats.info.toString(), color: '#3B82F6' },
          { icon: AlertTriangle, label: 'Warn', value: stats.warn.toString(), color: '#F59E0B' },
          { icon: XCircle, label: 'Error', value: stats.error.toString(), color: '#EF4444' },
          { icon: Bug, label: 'Debug', value: stats.debug.toString(), color: '#64748B' },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: '10px',
          }}>
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
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: THEME.text.primary }}>{stat.value}</p>
            <p style={{ fontSize: 11, color: THEME.text.muted }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Active-filter chips — thin bare row; self-hides when empty */}
      <div style={{ marginBottom: 12 }}>
        <ActiveFiltersBar
          onClearAll={clearAllFilters}
          filters={[
            {
              label: 'Event Type',
              value: eventTypeFilters.join(', '),
              clear: () => setEventTypeFilters([]),
            },
            {
              label: 'Level',
              value: levelFilters.join(', '),
              clear: () => setLevelFilters([]),
              color: levelFilters.length === 1 ? LEVEL_HEX[levelFilters[0] as keyof typeof LEVEL_HEX]?.bg : undefined,
            },
            { label: 'Search', value: searchText, clear: () => setSearchText('') },
            {
              label: 'Date',
              value: dateFrom || dateTo ? `${dateFrom || '…'} → ${dateTo || '…'}` : '',
              clear: () => {
                setDateFrom('')
                setDateTo('')
              },
            },
          ]}
        />
      </div>

      {/* Logs Table */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 150px 1fr 110px 150px 120px',
          gap: 16,
          padding: '8px 16px',
          background: 'var(--t-panel-hover)',
          borderBottom: `2px solid ${THEME.accent}`,
          fontSize: 11,
          fontWeight: 700,
          color: THEME.text.secondary,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}>
          <div>Level</div>
          <div>Event Type</div>
          <div>Message / Flow</div>
          <div>Client IP</div>
          <div>Timestamp</div>
          <div>Request ID</div>
        </div>

        {/* Table Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3" style={{ color: THEME.text.muted }}>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span style={{ fontSize: 13 }}>Loading events...</span>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{
              width: 48,
              height: 40,
              background: THEME.bg,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <Terminal className="w-6 h-6" style={{ color: THEME.text.muted }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, marginBottom: 2 }}>No events found</p>
            <p style={{ fontSize: 12, color: THEME.text.muted }}>
              No events have been recorded yet
            </p>
          </div>
        ) : (
          <div>
            {filteredLogs.map((log) => {
              const lk = levelKey(log.level)
              const lvl = LEVEL_HEX[lk]

              return (
                <div
                  key={log.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 150px 1fr 110px 150px 120px',
                    gap: 16,
                    padding: '5px 16px',
                    alignItems: 'center',
                    borderBottom: `1px solid ${THEME.borderLight}`,
                    cursor: 'pointer',
                  }}
                  className="hover:bg-[var(--t-panel-hover)] group"
                  onClick={() => setSelectedLog(log)}
                >
                  {/* Level */}
                  <div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '2px 8px', borderRadius: 4,
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                      background: lvl.bg, color: lvl.text,
                    }}>
                      {lk}
                    </span>
                  </div>

                  {/* Event Type — friendly kind badge + the flow / operation name */}
                  <div style={{ minWidth: 0 }}>
                    {(() => {
                      const ev = eventDisplay(log)
                      const c = eventKindColor(ev.kind)
                      return (
                        <>
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                            padding: '1px 6px', borderRadius: 4,
                            background: c + '1F', color: c, whiteSpace: 'nowrap',
                          }}>
                            {ev.kind}
                          </span>
                          {ev.name && (
                            <div className="truncate" style={{
                              fontSize: 11, color: THEME.text.muted,
                              fontFamily: 'ui-monospace, monospace', marginTop: 2,
                            }}>
                              {ev.name}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>

                  {/* Message / Flow — message + API (app + path) context for flow/proxy events */}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: THEME.text.primary, fontWeight: 500 }} className="truncate">
                      {log.message || <span style={{ color: THEME.text.muted }}>—</span>}
                    </p>
                    {(() => {
                      const ev = eventDisplay(log)
                      const api = ev.api || log.flowName
                      if (!api && !ev.path) return null
                      return (
                        <p style={{ fontSize: 11, color: THEME.text.muted, display: 'flex', alignItems: 'center', gap: 4 }} className="truncate">
                          <GitBranch className="w-3 h-3 shrink-0" />
                          <span className="truncate">{api}{ev.path ? ` · ${ev.path}` : ''}</span>
                        </p>
                      )
                    })()}
                  </div>

                  {/* Client IP */}
                  <div className="min-w-0">
                    <code style={{ fontSize: 11, color: THEME.text.muted, fontFamily: 'ui-monospace, monospace' }} className="truncate block">
                      {log.userIp || '—'}
                    </code>
                  </div>

                  {/* Timestamp — full date-time (requested over the relative "x ago") */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1" style={{ fontSize: 11, color: THEME.text.secondary }}>
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {log.timestamp || log.createdAt
                          ? new Date(log.timestamp || log.createdAt || '').toLocaleString('th-TH')
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Request ID */}
                  <div>
                    <code style={{
                      fontSize: 11,
                      color: THEME.text.secondary,
                      fontFamily: 'ui-monospace, monospace',
                      background: 'var(--t-input)',
                      padding: '2px 4px',
                      borderRadius: 6,
                    }}>
                      {log.requestId?.slice(0, 12)}…
                    </code>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </div>
      )}

      {/* Detail modal */}
      <EventLogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  )
}
