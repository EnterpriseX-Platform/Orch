'use client'

/**
 * /orch/reports — Analytics.
 *
 * Renamed from "Reports" → "Feature Monitor" → "Analytics": the page
 * is about feature-usage analytics (who uses which screen/endpoint,
 * how often, when, and what breaks), not a generic report dump. Final
 * label landed on "Analytics" per admin feedback.
 *
 * Counterpart to /orch/monitor ("System Monitor", infra health). The
 * two are split in the sidebar under Observability (feature) vs
 * System (infra) so admins pick the right one for the question.
 *
 * Tabs:
 *   Features  — leaderboard: which screens are used most, by how many
 *               unique clients, split by action, with a sparkline trend
 *   Users     — who uses the product, which features each user touches
 *   Trends    — hourly usage chart, system split, activity timeline
 *   Health    — error-prone + slow features, 4xx/5xx breakdown
 *
 * Data backend: /api/reports/audit (aggregates audit_logs across all
 * systems). Four shapes: daily | user | errors | capacity.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutGrid, Users, AlertCircle, TrendingUp,
  Activity, CheckCircle, AlertTriangle, FileCheck, Download,
  Clock, RefreshCw, Globe, Search as SearchIcon, Zap, X,
  ChevronRight, Layers, BarChart3,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts'
import { useAuthStore } from '@/stores/authStore'
import { ExportMenu } from '@/components/common/ExportMenu'
import type { ExportColumn } from '@/lib/export'
import { ReportsFilters } from '@/components/reports/ReportsFilters'
import { LogDetailModal } from '@/components/logs/LogDetailModal'

type TabId = 'features' | 'users' | 'trends' | 'health' | 'access'
type Range = '1h' | '24h' | '7d' | '30d'

interface ReportData {
  total?: number
  summary?: { signoffCount?: number; submitCount?: number; exportCount?: number; errorCount?: number }
  byActionType?: Record<string, number>
  byScreen?: Array<{ screenCode: string; screenName?: string; count: number }>
  bySystem?: Record<string, number>
  hourly?: Array<{ hour: string; count: number }>
  users?: Array<{ user?: string; ip?: string; count: number; actions: Record<string, number> }>
  timeline?: Array<{
    id: string; timestamp: string; action: string; userIp?: string
    description?: string; changes?: { screenCode?: string; screenName?: string; actionType?: string }
  }>
  byEndpoint?: Array<{ endpoint: string; count: number; avgMs?: number; p95Ms?: number; maxMs?: number }>
  byStatusCode?: Record<string | number, number>
  recent?: Array<{
    id: string; timestamp: string; action: string; userIp?: string
    description?: string; changes?: { path?: string; statusCode?: number }
  }>
}

// Brand palette for chart categories. Kept distinct so a stacked bar
// with 5-6 series remains legible in both light and dark theme.
const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316']

// Action-type → colour (used in the leaderboard split bar). Keeps the
// same colour across all tabs so the legend is implicit.
const ACTION_COLOR: Record<string, string> = {
  SIGNOFF: '#EF4444',
  SUBMIT:  '#F59E0B',
  EXPORT:  '#3B82F6',
  CREATE:  '#10B981',
  UPDATE:  '#8B5CF6',
  DELETE:  '#F87171',
  UNKNOWN: '#64748B',
}

// HTTP method + status colours for the Access Logs tab (design-system palette).
const METHOD_COLOR: Record<string, string> = {
  GET: '#60A5FA', POST: '#10B981', PUT: '#F59E0B', DELETE: '#EF4444', PATCH: '#8B5CF6',
}
function statusColor(s?: number): string {
  if (!s) return '#64748B'
  if (s >= 500) return '#EF4444'
  if (s >= 400) return '#F59E0B'
  if (s >= 300) return '#3B82F6'
  return '#10B981'
}

export default function FeatureMonitorPage() {
  const [tab, setTab] = useState<TabId>('features')
  const [range, setRange] = useState<Range>('24h')
  const [system, setSystem] = useState('ALL')
  const [userFilter, setUserFilter] = useState('')
  const [screenFilter, setScreenFilter] = useState('')
  const token = useAuthStore((s) => s.accessToken)

  const fromISO = useMemo(() => {
    const h = range === '1h' ? 1 : range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30
    return new Date(Date.now() - h * 3600e3).toISOString()
  }, [range])

  // Fetch all four backend shapes in parallel; individual tabs pick the
  // slices they need. The endpoint is cheap enough that a single
  // fan-out beats per-tab-switch roundtrips for admin workloads.
  const fetchShape = (shape: 'daily' | 'user' | 'errors' | 'capacity') => async (): Promise<ReportData> => {
    const params = new URLSearchParams({ type: shape, from: fromISO })
    if (system !== 'ALL') params.set('system', system)
    if (userFilter.trim()) params.set('username', userFilter.trim())
    if (screenFilter.trim()) params.set('screenCode', screenFilter.trim())
    const r = await fetch(`/orch/api/reports/audit?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }

  const daily = useQuery<ReportData>({
    queryKey: ['fm-daily', range, system, userFilter, screenFilter],
    queryFn: fetchShape('daily'),
    enabled: !!token,
    refetchInterval: 60_000,
    placeholderData: (p) => p,
  })
  const userShape = useQuery<ReportData>({
    queryKey: ['fm-user', range, system, userFilter, screenFilter],
    queryFn: fetchShape('user'),
    enabled: !!token,
    placeholderData: (p) => p,
  })
  const errorsShape = useQuery<ReportData>({
    queryKey: ['fm-errors', range, system, userFilter, screenFilter],
    queryFn: fetchShape('errors'),
    enabled: !!token,
    placeholderData: (p) => p,
  })
  const capacity = useQuery<ReportData>({
    queryKey: ['fm-capacity', range, system, userFilter, screenFilter],
    queryFn: fetchShape('capacity'),
    enabled: !!token,
    placeholderData: (p) => p,
  })

  const isLoading = daily.isLoading
  const isFetching = daily.isFetching || userShape.isFetching || errorsShape.isFetching || capacity.isFetching
  const refetchAll = () => {
    daily.refetch(); userShape.refetch(); errorsShape.refetch(); capacity.refetch()
  }

  // Headline KPIs shown on every tab. Sourced from the daily shape
  // except error-rate which cross-references the errors shape.
  const kpi = useMemo(() => {
    const d = daily.data || {}
    const u = userShape.data?.users || []
    const totalActions = d.total ?? 0
    const uniqueUsers = u.length
    const featuresUsed = (d.byScreen || []).length
    const errCount = d.summary?.errorCount ?? 0
    const errRate = totalActions > 0 ? (errCount / totalActions) * 100 : 0
    const avgLatency = (() => {
      const eps = capacity.data?.byEndpoint || []
      if (!eps.length) return 0
      const weighted = eps.reduce((acc, e) => acc + (e.avgMs || 0) * e.count, 0)
      const total = eps.reduce((acc, e) => acc + e.count, 0)
      return total > 0 ? Math.round(weighted / total) : 0
    })()
    return { totalActions, uniqueUsers, featuresUsed, errRate, avgLatency }
  }, [daily.data, userShape.data, capacity.data])

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
    { id: 'features', label: 'Features', icon: LayoutGrid,  hint: 'Which screens/endpoints are used most' },
    { id: 'users',    label: 'Users',    icon: Users,       hint: 'Who is active and what they touch' },
    { id: 'trends',   label: 'Trends',   icon: TrendingUp,  hint: 'Usage over time' },
    { id: 'health',   label: 'Health',   icon: AlertCircle, hint: 'Error-prone & slow features' },
    { id: 'access',   label: 'Access Logs', icon: Globe,    hint: 'Raw API traffic (from Loki)' },
  ]

  return (
    <div className="p-6 space-y-4">
      {/* ───────── Header ───────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-6 h-6 text-[var(--t-accent)]" />
            <h1 className="text-2xl font-bold text-[var(--t-text)]">Analytics</h1>
          </div>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <ReportsFilters
            range={range} onRangeChange={setRange}
            system={system} onSystemChange={setSystem}
            systems={Object.keys(daily.data?.bySystem || {}).sort()}
            userFilter={userFilter} onUserFilterChange={setUserFilter}
            screenFilter={screenFilter} onScreenFilterChange={setScreenFilter}
          />
          <ExportMenu disabled={isFetching} getInput={() => buildExport(tab, { daily: daily.data, users: userShape.data, errors: errorsShape.data, capacity: capacity.data })} />
          <button
            onClick={refetchAll}
            disabled={isFetching}
            className="p-2 rounded-md bg-[var(--t-panel)] border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)] hover:border-[var(--t-accent)] disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ───────── KPI strip ─────────
           Five big numbers answering the recurring audit questions:
           How busy is the system? Who's active? How much of the
           feature surface is in use? Are things healthy? Are they fast? */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total actions"  value={kpi.totalActions.toLocaleString()} sub={`in ${rangeLabel(range)}`} icon={Activity} tone="blue" />
        <Kpi label="Active users"   value={kpi.uniqueUsers}                   sub="unique users/IPs"         icon={Users}    tone="violet" />
        <Kpi label="Features used"  value={kpi.featuresUsed}                  sub="screens touched"          icon={Layers}   tone="emerald" />
        <Kpi label="Error rate"     value={`${kpi.errRate.toFixed(1)}%`}      sub={`${daily.data?.summary?.errorCount ?? 0} errors`} icon={AlertTriangle} tone={kpi.errRate > 5 ? 'red' : 'amber'} />
        <Kpi label="Avg latency"    value={`${kpi.avgLatency}ms`}             sub="weighted by call count"   icon={Zap}      tone={kpi.avgLatency > 500 ? 'red' : 'cyan'} />
      </div>

      {/* ───────── Tab bar ───────── */}
      <div className="flex gap-0 border-b border-[var(--t-border)]">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`group flex flex-col items-start px-4 py-2.5 border-b-2 transition-colors ${
                active
                  ? 'border-[var(--t-accent)]'
                  : 'border-transparent hover:bg-[var(--t-panel-hover)]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-[var(--t-accent)]' : 'text-[var(--t-text-muted)]'}`} />
                <span className={`text-sm font-semibold ${active ? 'text-[var(--t-accent)]' : 'text-[var(--t-text)]'}`}>
                  {t.label}
                </span>
              </div>
              <span className="text-[10px] text-[var(--t-text-muted)] mt-0.5">{t.hint}</span>
            </button>
          )
        })}
      </div>

      {/* ───────── Body ───────── */}
      {isLoading ? (
        <div className="py-20 text-center text-[var(--t-text-muted)] text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
          Loading feature usage…
        </div>
      ) : (
        <>
          {tab === 'features' && <FeaturesTab data={daily.data || {}} />}
          {tab === 'users'    && <UsersTab data={userShape.data || {}} dailyData={daily.data || {}} />}
          {tab === 'trends'   && <TrendsTab data={daily.data || {}} />}
          {tab === 'health'   && <HealthTab errData={errorsShape.data || {}} capData={capacity.data || {}} />}
          {tab === 'access'   && <AccessLogsTab token={token} />}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//                   ACCESS LOGS TAB
// Per-request API traffic. NOT from the DB — sourced from Loki
// (broker access_log stdout → Promtail → Loki) via
// /api/reports/access-logs. Click a row to see request/response body.
// ═══════════════════════════════════════════════════════

function AccessLogsTab({ token }: { token: string | null }) {
  const [hours, setHours] = useState(24)
  const [pathFilter, setPathFilter] = useState('')
  const [selected, setSelected] = useState<any | null>(null)

  const q = useQuery<{ entries?: any[]; error?: string; detail?: string }>({
    queryKey: ['access-logs', hours, pathFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ hours: String(hours), limit: '300' })
      if (pathFilter) params.set('path', pathFilter)
      const r = await fetch(`/orch/api/reports/access-logs?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      return r.json()
    },
    enabled: !!token,
    refetchInterval: 30_000,
    placeholderData: (p) => p,
  })

  const entries = q.data?.entries || []
  const err = q.data?.error
  const fmt = (ts?: string) => {
    try { return ts ? new Date(ts).toLocaleString('th-TH') : '—' } catch { return ts || '—' }
  }
  const cols = '150px 64px 1fr 56px 70px 120px'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1" />
        <input
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          placeholder="Filter path…"
          className="px-2 py-1 rounded-md text-xs bg-[var(--t-input)] border border-[var(--t-border)] text-[var(--t-text)] w-44"
        />
        <select
          value={hours}
          onChange={(e) => setHours(parseInt(e.target.value))}
          className="px-2 py-1 rounded-md text-xs bg-[var(--t-panel)] border border-[var(--t-border)] text-[var(--t-text)]"
        >
          <option value={1}>1h</option>
          <option value={24}>24h</option>
          <option value={168}>7d</option>
        </select>
        <span className="text-[11px] text-[var(--t-text-muted)] w-16 text-right">{entries.length} rows</span>
      </div>

      {err && (
        <div className="text-xs rounded-md border border-[#F59E0B40] bg-[#F59E0B15] text-[#F59E0B] px-3 py-2">
          Loki query: {String(err)}{q.data?.detail ? ` · ${q.data.detail}` : ''}
        </div>
      )}

      <div className="rounded-lg border border-[var(--t-border)] overflow-hidden">
        <div
          className="grid gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--t-text-muted)] border-b border-[var(--t-border)] bg-[var(--t-panel)]"
          style={{ gridTemplateColumns: cols }}
        >
          <div>Time</div><div>Method</div><div>Path</div><div>Status</div><div>Duration</div><div>Client IP</div>
        </div>
        {entries.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-[var(--t-text-muted)]">
            {q.isFetching ? 'Loading…' : 'No access logs in this time range'}
          </div>
        ) : (
          entries.map((e: any, i: number) => (
            <div
              key={i}
              onClick={() => setSelected(e)}
              className="grid gap-2 px-3 py-1.5 text-xs items-center cursor-pointer border-b border-[var(--t-border)] hover:bg-[var(--t-panel-hover)]"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="text-[var(--t-text-muted)] truncate">{fmt(e.timestamp)}</div>
              <div className="font-semibold" style={{ color: METHOD_COLOR[e.method] || '#64748B' }}>{e.method || '—'}</div>
              <code className="text-[var(--t-text)] truncate" title={e.path}>{e.path || '—'}</code>
              <div className="font-semibold" style={{ color: statusColor(e.statusCode) }}>{e.statusCode ?? '—'}</div>
              <div className="text-[var(--t-text-muted)]">{e.duration != null ? `${e.duration}ms` : '—'}</div>
              <code className="text-[var(--t-text-muted)] truncate">{e.userIp || '—'}</code>
            </div>
          ))
        )}
      </div>

      {/* Detail — reuse the 4-tab API-log modal (Info / Request / Response / cURL)
          the old api_logs viewer used, so per-request access logs keep the rich
          drill-down testers relied on before the logging refactor. */}
      {selected && (
        <LogDetailModal
          log={{
            id: selected.requestId || selected.timestamp || '',
            requestId: selected.requestId || '—',
            timestamp: selected.timestamp || '',
            method: selected.method || 'GET',
            path: selected.path || '',
            statusCode: selected.statusCode ?? 0,
            duration: selected.duration ?? 0,
            userIp: selected.userIp,
            userAgent: selected.userAgent,
            requestBody: selected.requestBody,
            responseBody: selected.responseBody,
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//                     FEATURES TAB
// Feature leaderboard (the core of this page). Each row is one
// feature (screen/endpoint), with:
//   - usage count + share bar
//   - action-type split (mini segmented bar)
//   - last-used hint
// ═══════════════════════════════════════════════════════

function FeaturesTab({ data }: { data: ReportData }) {
  const screens = data.byScreen || []
  const total = screens.reduce((a, s) => a + s.count, 0)
  const maxCount = Math.max(...screens.map((s) => s.count), 1)
  const actionTypes = Object.keys(data.byActionType || {})
  const totalActionCount = Object.values(data.byActionType || {}).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="space-y-4">
      {/* Top 3 feature spotlight cards — glanceable "what's hot" */}
      {screens.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {screens.slice(0, 3).map((s, i) => {
            const pct = total > 0 ? (s.count / total) * 100 : 0
            return (
              <div
                key={s.screenCode}
                className="relative overflow-hidden rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)] p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--t-text-muted)]">
                    Rank #{i + 1}
                  </span>
                  <span className="text-[10px] text-[var(--t-accent)] font-semibold">{pct.toFixed(1)}%</span>
                </div>
                <p className="text-sm font-semibold text-[var(--t-text)] truncate mb-1" title={s.screenName || s.screenCode}>
                  {s.screenName || s.screenCode}
                </p>
                <code className="text-[10px] font-mono text-[var(--t-text-muted)] block truncate mb-2">{s.screenCode}</code>
                <p className="text-2xl font-bold text-[var(--t-accent)]">{s.count.toLocaleString()}</p>
                <p className="text-[11px] text-[var(--t-text-muted)]">interactions</p>
                {/* Accent bar that fills by rank position. */}
                <div
                  className="absolute bottom-0 left-0 h-1"
                  style={{ width: `${Math.max(10, pct * 2)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Action-type summary chips — one row explaining the action
          mix, since every leaderboard row below uses the same colours. */}
      {actionTypes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[var(--t-text-muted)]">Action mix:</span>
          {actionTypes.map((a) => {
            const count = data.byActionType?.[a] || 0
            const pct = (count / totalActionCount) * 100
            return (
              <span
                key={a}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--t-bg)] border border-[var(--t-border)]"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: ACTION_COLOR[a] || ACTION_COLOR.UNKNOWN }}
                />
                <span className="font-semibold text-[var(--t-text)]">{a}</span>
                <span className="text-[var(--t-text-muted)]">· {count} ({pct.toFixed(0)}%)</span>
              </span>
            )
          })}
        </div>
      )}

      {/* Feature leaderboard table */}
      <Panel title="Feature usage leaderboard" icon={LayoutGrid} hint={`${screens.length} features · ${total.toLocaleString()} interactions`}>
        {screens.length === 0 ? (
          <EmptyState hint="No feature usage recorded in this time range" />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--t-border)]">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-10">#</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider">Feature</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-44">Usage share</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-24">Count</th>
                </tr>
              </thead>
              <tbody>
                {screens.slice(0, 40).map((s, i) => {
                  const pct = total > 0 ? (s.count / total) * 100 : 0
                  const barWidth = (s.count / maxCount) * 100
                  return (
                    <tr key={s.screenCode} className="border-b border-[var(--t-border-light)] hover:bg-[var(--t-panel-hover)]">
                      <td className="px-3 py-2.5 text-xs text-[var(--t-text-muted)]">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-sm text-[var(--t-text)] font-medium truncate max-w-md">
                          {s.screenName || <span className="italic text-[var(--t-text-muted)]">(no name)</span>}
                        </p>
                        <code className="text-[10px] font-mono text-[var(--t-text-muted)]">{s.screenCode}</code>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-[var(--t-bg)] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${barWidth}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                          </div>
                          <span className="text-[11px] text-[var(--t-text-muted)] tabular-nums w-10 text-right">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold text-[var(--t-accent)] tabular-nums">
                        {s.count.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//                       USERS TAB
// ═══════════════════════════════════════════════════════

function UsersTab({ data, dailyData }: { data: ReportData; dailyData: ReportData }) {
  const users = data.users || []
  const timeline = data.timeline || []

  // Recent activity pagination (timeline holds up to ~100 events).
  const [tlPage, setTlPage] = useState(1)
  const TL_PER = 15
  const tlTotalPages = Math.max(1, Math.ceil(timeline.length / TL_PER))
  const tlPageClamped = Math.min(tlPage, tlTotalPages)
  const tlSlice = timeline.slice((tlPageClamped - 1) * TL_PER, tlPageClamped * TL_PER)

  // Actions-per-user for the right-side chart.
  const topUsers = users.slice(0, 10).map((u) => ({
    name: (u.user || u.ip || 'unknown').slice(0, 20),
    count: u.count,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top 10 users bar chart */}
        <Panel title="Most active users" icon={Users} className="lg:col-span-2">
          {topUsers.length === 0 ? (
            <EmptyState hint="No user activity in this range" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topUsers} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" horizontal={false} />
                <XAxis type="number" stroke="var(--t-text-muted)" fontSize={11} />
                <YAxis dataKey="name" type="category" stroke="var(--t-text-muted)" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', fontSize: 12 }} />
                <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Action-type pie (reuse daily) */}
        <Panel title="Action mix" icon={Activity}>
          {Object.keys(dailyData.byActionType || {}).length === 0 ? (
            <EmptyState hint="No actions" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={Object.entries(dailyData.byActionType || {}).map(([name, value]) => ({ name, value }))}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={(e) => `${e.name}`}
                >
                  {Object.keys(dailyData.byActionType || {}).map((a, i) => (
                    <Cell key={a} fill={ACTION_COLOR[a] || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* User drill-down table */}
      <Panel title="User activity breakdown" icon={Users} hint={`${users.length} users`}>
        {users.length === 0 ? <EmptyState hint="No user activity" /> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--t-border)]">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider">User</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider">Client IP</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-20">Total</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider">Action breakdown</th>
                </tr>
              </thead>
              <tbody>
                {users.slice(0, 50).map((u, i) => {
                  const max = Math.max(...Object.values(u.actions || {}), 1)
                  return (
                    <tr key={i} className="border-b border-[var(--t-border-light)] hover:bg-[var(--t-panel-hover)]">
                      <td className="px-3 py-2 text-sm text-[var(--t-text)]">{u.user || <span className="italic text-[var(--t-text-muted)]">anonymous</span>}</td>
                      <td className="px-3 py-2"><code className="text-xs font-mono text-[var(--t-text-secondary)]">{u.ip || '—'}</code></td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-[var(--t-accent)] tabular-nums">{u.count}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(u.actions || {}).map(([k, v]) => (
                            <span
                              key={k}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{
                                background: `${ACTION_COLOR[k] || ACTION_COLOR.UNKNOWN}20`,
                                color: ACTION_COLOR[k] || ACTION_COLOR.UNKNOWN,
                                border: `1px solid ${ACTION_COLOR[k] || ACTION_COLOR.UNKNOWN}35`,
                              }}
                            >
                              {k} {v}
                              <span
                                className="inline-block h-1 rounded-full"
                                style={{
                                  width: `${(v / max) * 40}px`,
                                  background: ACTION_COLOR[k] || ACTION_COLOR.UNKNOWN,
                                }}
                              />
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Recent timeline (compact) */}
      <Panel title="Recent activity" icon={Clock} hint={`${timeline.length} events`}>
        {timeline.length === 0 ? <EmptyState hint="No activity" /> : (
          <>
          <ul className="divide-y divide-[var(--t-border-light)]">
            {tlSlice.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 py-2 hover:bg-[var(--t-panel-hover)] px-2 -mx-2 rounded">
                <span className="text-[10px] text-[var(--t-text-muted)] tabular-nums w-28 shrink-0">
                  {new Date(ev.timestamp).toLocaleTimeString('th-TH')}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0"
                  style={{
                    background: `${ACTION_COLOR[ev.changes?.actionType || ev.action] || ACTION_COLOR.UNKNOWN}20`,
                    color: ACTION_COLOR[ev.changes?.actionType || ev.action] || ACTION_COLOR.UNKNOWN,
                  }}
                >
                  {ev.changes?.actionType || ev.action}
                </span>
                <span className="text-xs text-[var(--t-text)] truncate flex-1">
                  {ev.changes?.screenName || ev.description || ev.changes?.screenCode || '—'}
                </span>
                <code className="text-[10px] font-mono text-[var(--t-text-muted)] shrink-0">{ev.userIp}</code>
              </li>
            ))}
          </ul>
          {tlTotalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-xs">
              <button disabled={tlPageClamped <= 1} onClick={() => setTlPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)] disabled:opacity-40">‹ Previous</button>
              <span className="text-[var(--t-text-muted)]">Page {tlPageClamped} / {tlTotalPages} · {timeline.length} items</span>
              <button disabled={tlPageClamped >= tlTotalPages} onClick={() => setTlPage((p) => Math.min(tlTotalPages, p + 1))} className="px-2 py-1 rounded border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)] disabled:opacity-40">Next ›</button>
            </div>
          )}
          </>
        )}
      </Panel>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//                       TRENDS TAB
// ═══════════════════════════════════════════════════════

function TrendsTab({ data }: { data: ReportData }) {
  const hourly = (data.hourly || []).map((h) => ({
    hour: new Date(h.hour).toLocaleString('th-TH', { month: 'short', day: 'numeric', hour: '2-digit' }),
    count: h.count,
  }))
  const systemData = Object.entries(data.bySystem || {}).map(([name, value]) => ({ name, value }))

  return (
    <div className="space-y-4">
      <Panel title="Activity over time" icon={TrendingUp} hint="Hourly interaction volume">
        {hourly.length === 0 ? <EmptyState hint="No activity in this range" /> : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={hourly}>
              <defs>
                <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
              <XAxis dataKey="hour" stroke="var(--t-text-muted)" fontSize={10} />
              <YAxis stroke="var(--t-text-muted)" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)', fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} fill="url(#gradBlue)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Volume by system" icon={Globe}>
          {systemData.length === 0 ? <EmptyState hint="No data" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={systemData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.name}: ${e.value}`}>
                  {systemData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Headline counters" icon={Activity}>
          <div className="grid grid-cols-2 gap-3">
            <MiniCounter label="🔴 Sign-offs" value={data.summary?.signoffCount ?? 0} color="#EF4444" />
            <MiniCounter label="Submits" value={data.summary?.submitCount ?? 0} color="#F59E0B" />
            <MiniCounter label="Exports" value={data.summary?.exportCount ?? 0} color="#3B82F6" />
            <MiniCounter label="Errors"  value={data.summary?.errorCount  ?? 0} color="#EF4444" />
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//                       HEALTH TAB
// ═══════════════════════════════════════════════════════

function HealthTab({ errData, capData }: { errData: ReportData; capData: ReportData }) {
  const byStatus = Object.entries(errData.byStatusCode || {}).map(([code, count]) => ({
    code: String(code),
    count: Number(count),
    tone: Number(code) >= 500 ? '#EF4444' : '#F59E0B',
  }))
  const endpoints = (capData.byEndpoint || []).slice(0, 20)
  // Flag endpoints whose p95 > 1s or max > 3s as "slow".
  const slowEndpoints = endpoints.filter((e) => (e.p95Ms || 0) > 1000 || (e.maxMs || 0) > 3000)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Error breakdown by status code */}
        <Panel title="Errors by status code" icon={AlertCircle}>
          {byStatus.length === 0 ? <EmptyState hint="No errors — healthy!" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" horizontal={false} />
                <XAxis type="number" stroke="var(--t-text-muted)" fontSize={11} allowDecimals={false} />
                <YAxis dataKey="code" type="category" stroke="var(--t-text-muted)" fontSize={11} width={48} />
                <Tooltip contentStyle={{ background: 'var(--t-panel)', border: '1px solid var(--t-border)' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {byStatus.map((e, i) => <Cell key={i} fill={e.tone} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Top error endpoints */}
        <Panel title="Error-prone features" icon={AlertTriangle}>
          {(errData.byEndpoint || []).length === 0 ? <EmptyState hint="No errors in range" /> : (
            <ul className="divide-y divide-[var(--t-border-light)]">
              {(errData.byEndpoint || []).slice(0, 10).map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2">
                  <code className="text-xs font-mono text-[var(--t-text)] truncate flex-1">{e.endpoint}</code>
                  <span className="text-xs font-bold text-red-400 tabular-nums shrink-0">{e.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Latency table */}
      <Panel title="Feature latency" icon={Zap} hint={slowEndpoints.length ? `${slowEndpoints.length} slow` : 'All endpoints healthy'}>
        {endpoints.length === 0 ? <EmptyState hint="No capacity data" /> : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--t-border)]">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider">Endpoint</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-20">Calls</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-20">Avg</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-20">P95</th>
                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-20">Max</th>
                  <th className="text-center px-3 py-2 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider w-16">Health</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e, i) => {
                  const isSlow = (e.p95Ms || 0) > 1000 || (e.maxMs || 0) > 3000
                  return (
                    <tr key={i} className="border-b border-[var(--t-border-light)] hover:bg-[var(--t-panel-hover)]">
                      <td className="px-3 py-2"><code className="text-xs font-mono text-[var(--t-text)] truncate block max-w-md">{e.endpoint}</code></td>
                      <td className="px-3 py-2 text-right text-sm text-[var(--t-text)] tabular-nums">{e.count}</td>
                      <td className="px-3 py-2 text-right text-xs text-[var(--t-text-secondary)] tabular-nums">{e.avgMs ?? '—'}ms</td>
                      <td className={`px-3 py-2 text-right text-xs tabular-nums ${(e.p95Ms || 0) > 1000 ? 'text-red-400 font-semibold' : 'text-[var(--t-text-secondary)]'}`}>{e.p95Ms ?? '—'}ms</td>
                      <td className={`px-3 py-2 text-right text-xs tabular-nums ${(e.maxMs || 0) > 3000 ? 'text-red-400 font-semibold' : 'text-[var(--t-text-secondary)]'}`}>{e.maxMs ?? '—'}ms</td>
                      <td className="px-3 py-2 text-center">
                        {isSlow
                          ? <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="Slow" />
                          : <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Healthy" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//                    SHARED COMPONENTS
// ═══════════════════════════════════════════════════════

function RangePicker({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-[var(--t-border)] bg-[var(--t-panel)]">
      {(['1h', '24h', '7d', '30d'] as const).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === r
              ? 'bg-[var(--t-accent)] text-white'
              : 'text-[var(--t-text-muted)] hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)]'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

function rangeLabel(r: Range) {
  return { '1h': 'last hour', '24h': 'last 24h', '7d': 'last 7 days', '30d': 'last 30 days' }[r]
}

function FilterBar({
  userFilter, setUserFilter, screenFilter, setScreenFilter, system, setSystem, range,
}: {
  userFilter: string; setUserFilter: (v: string) => void
  screenFilter: string; setScreenFilter: (v: string) => void
  system: string; setSystem: (v: string) => void
  range: Range; setRange: (v: Range) => void
}) {
  const activeChips = [
    userFilter && { label: `User: ${userFilter}`,   clear: () => setUserFilter('') },
    screenFilter && { label: `Screen: ${screenFilter}`, clear: () => setScreenFilter('') },
    system !== 'ALL' && { label: `System: ${system}`, clear: () => setSystem('ALL') },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap p-2.5 rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)]">
      <SearchIcon className="w-3.5 h-3.5 text-[var(--t-text-muted)] ml-1" />
      <input
        value={userFilter}
        onChange={(e) => setUserFilter(e.target.value)}
        placeholder="Filter by user or IP"
        className="px-3 py-1.5 rounded-md bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text)] w-44 focus:border-[var(--t-accent)] outline-none"
      />
      <input
        value={screenFilter}
        onChange={(e) => setScreenFilter(e.target.value)}
        placeholder="Filter by screen code"
        className="px-3 py-1.5 rounded-md bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text)] w-60 focus:border-[var(--t-accent)] outline-none"
      />
      <span className="text-[var(--t-text-muted)]">·</span>
      <span className="text-[11px] text-[var(--t-text-muted)]">
        {rangeLabel(range)}
      </span>
      {activeChips.length > 0 && (
        <>
          <span className="text-[var(--t-text-muted)]">·</span>
          {activeChips.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--t-accent)]/15 text-[var(--t-accent)] border border-[var(--t-accent)]/30 text-[11px] font-semibold"
            >
              {c.label}
              <button onClick={c.clear} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </>
      )}
    </div>
  )
}

function Kpi({
  label, value, sub, icon: Icon, tone,
}: {
  label: string; value: string | number; sub: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  tone: 'blue' | 'violet' | 'emerald' | 'amber' | 'red' | 'cyan'
}) {
  const toneColor = {
    blue: '#3B82F6', violet: '#8B5CF6', emerald: '#10B981',
    amber: '#F59E0B', red: '#EF4444', cyan: '#06B6D4',
  }[tone]
  return (
    <div className="p-4 rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)] relative overflow-hidden">
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full blur-3xl opacity-20"
        style={{ background: toneColor }}
      />
      <div className="flex items-start justify-between relative">
        <div>
          <p className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider font-semibold mb-1">{label}</p>
          <p className="text-2xl font-bold text-[var(--t-text)]">{value}</p>
          <p className="text-[10px] text-[var(--t-text-muted)] mt-0.5">{sub}</p>
        </div>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: `${toneColor}15`, border: `1px solid ${toneColor}35` }}
        >
          <Icon className="w-4 h-4" style={{ color: toneColor }} />
        </div>
      </div>
    </div>
  )
}

function Panel({
  title, icon: Icon, hint, className, children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)] ${className || ''}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--t-border)]">
        <Icon className="w-4 h-4 text-[var(--t-accent)]" />
        <h3 className="text-sm font-semibold text-[var(--t-text)]">{title}</h3>
        {hint && <span className="text-[11px] text-[var(--t-text-muted)] ml-auto">{hint}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function EmptyState({ hint }: { hint: string }) {
  return <div className="py-10 text-center text-xs text-[var(--t-text-muted)] italic">{hint}</div>
}

function MiniCounter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="p-3 rounded-md border"
      style={{ background: `${color}10`, borderColor: `${color}35` }}
    >
      <p className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color }}>{value.toLocaleString()}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//                    EXPORT BUILDER
// ═══════════════════════════════════════════════════════

function buildExport(
  tab: TabId,
  shapes: {
    daily?: ReportData
    users?: ReportData
    errors?: ReportData
    capacity?: ReportData
  },
) {
  const filename = `feature-monitor-${tab}-${new Date().toISOString().slice(0, 19)}`
  const title = `Feature Monitor — ${tab[0].toUpperCase()}${tab.slice(1)}`

  if (tab === 'features') {
    const cols: ExportColumn<Record<string, unknown>>[] = [
      { key: 'screenCode', label: 'Screen Code', width: 180 },
      { key: 'screenName', label: 'Screen Name', width: 280 },
      { key: 'count', label: 'Uses', width: 80 },
    ]
    return { filename, title, columns: cols, rows: (shapes.daily?.byScreen || []) as unknown as Record<string, unknown>[] }
  }

  if (tab === 'users') {
    const cols: ExportColumn<Record<string, unknown>>[] = [
      { key: 'user', label: 'User', width: 160 },
      { key: 'ip',   label: 'IP',   width: 120 },
      { key: 'count', label: 'Total', width: 80 },
      { key: 'actions', label: 'Actions JSON', width: 260, format: (r) => JSON.stringify(r.actions) },
    ]
    return { filename, title, columns: cols, rows: (shapes.users?.users || []) as unknown as Record<string, unknown>[] }
  }

  if (tab === 'trends') {
    const cols: ExportColumn<Record<string, unknown>>[] = [
      { key: 'hour', label: 'Hour', width: 180 },
      { key: 'count', label: 'Interactions', width: 100 },
    ]
    return { filename, title, columns: cols, rows: (shapes.daily?.hourly || []) as unknown as Record<string, unknown>[] }
  }

  // health
  const cols: ExportColumn<Record<string, unknown>>[] = [
    { key: 'endpoint', label: 'Endpoint', width: 320 },
    { key: 'count', label: 'Calls', width: 80 },
    { key: 'avgMs', label: 'Avg (ms)', width: 80 },
    { key: 'p95Ms', label: 'P95 (ms)', width: 80 },
    { key: 'maxMs', label: 'Max (ms)', width: 80 },
  ]
  return { filename, title, columns: cols, rows: (shapes.capacity?.byEndpoint || []) as unknown as Record<string, unknown>[] }
}
