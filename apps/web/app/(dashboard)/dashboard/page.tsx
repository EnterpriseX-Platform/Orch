'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useTenantStore } from '@/stores/tenantStore'
import {
  Globe,
  Database,
  Workflow,
  Activity,
  ArrowUpRight,
  FolderKanban,
  Zap,
  BarChart3,
  Plus,
  ChevronRight,
} from 'lucide-react'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif'

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  panelHover: 'var(--t-panel-hover)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentLight: 'var(--t-accent-light)',
  colors: {
    blue: '#0f62fe',
    emerald: '#24a148',
    purple: '#8a3ffc',
    amber: '#ba4e00',
    red: '#da1e28',
    cyan: '#1192e8',
  }
}

interface DashboardData {
  stats: {
    totalProjects: number
    activeProjects: number
    totalApis: number
    activeApis: number
    totalDatasets: number
    activeDatasets: number
    totalFlows: number
    activeFlows: number
    totalRequests: number
    requestsToday: number
    avgResponseTime: number
    errorRate: number
  }
  topApis: Array<{
    apiId: string
    apiName: string
    endpoint: string
    requestCount: number
    avgResponseTime: number
    errorRate: number
  }>
}

export default function DashboardPage() {
  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/orch/api/dashboard')
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      return res.json()
    },
  })

  // Hide what the active tenant has switched off (and don't call its API).
  const features = useTenantStore((st) => st.features)
  const tenantLoaded = useTenantStore((st) => st.loaded)
  const on = (key: string) => features[key] !== false

  const { data: recentProjects } = useQuery({
    queryKey: ['recent-projects'],
    enabled: tenantLoaded && on('projects'),
    queryFn: async () => {
      const res = await fetch('/orch/api/projects?limit=5&sortBy=updatedAt&sortOrder=desc')
      if (!res.ok) return { data: [] }
      return res.json()
    },
  })

  const { data: recentFlows } = useQuery({
    queryKey: ['recent-flows'],
    enabled: tenantLoaded && on('flows'),
    queryFn: async () => {
      const res = await fetch('/orch/api/flows?limit=5&sortBy=updatedAt&sortOrder=desc')
      if (!res.ok) return { data: [] }
      return res.json()
    },
  })

  // Stat cards mirror real DB counts — no fabricated "+12%" deltas.
  // The badge on the right shows the active subset of each total
  // (e.g. 3 / 3 active), or for Requests Today the 4xx/5xx error
  // rate. Trend arrow is dropped because we don't have a baseline
  // to compare against.
  const stats = [
    {
      label: 'Projects',
      value: dashboardData?.stats?.totalProjects?.toString() ?? '0',
      sub: `${dashboardData?.stats?.activeProjects ?? 0} active`,
      icon: FolderKanban,
      color: THEME.colors.blue,
      href: '/projects',
    },
    {
      label: 'APIs',
      value: dashboardData?.stats?.totalApis?.toString() ?? '0',
      sub: `${dashboardData?.stats?.activeApis ?? 0} active`,
      icon: Globe,
      color: THEME.colors.cyan,
      href: '/projects',
    },
    {
      label: 'Datasets',
      value: dashboardData?.stats?.totalDatasets?.toString() ?? '0',
      sub: `${dashboardData?.stats?.activeDatasets ?? 0} active`,
      icon: Database,
      color: THEME.colors.emerald,
      href: '/datasets',
    },
    {
      label: 'Flows',
      value: dashboardData?.stats?.totalFlows?.toString() ?? '0',
      sub: `${dashboardData?.stats?.activeFlows ?? 0} deployed`,
      icon: Workflow,
      color: THEME.colors.purple,
      href: '/flows',
    },
    {
      label: 'Requests Today',
      value: dashboardData?.stats?.requestsToday?.toLocaleString() ?? '0',
      sub: `${dashboardData?.stats?.avgResponseTime ?? 0}ms avg · ${dashboardData?.stats?.errorRate ?? 0}% err`,
      icon: Activity,
      color: THEME.colors.amber,
      href: '/logs',
    },
  ]

  // Live health from /api/monitor (was hard-coded "online" for every service).
  const { data: health } = useQuery<Record<string, { status?: string }> | null>({
    queryKey: ['dashboard-health'],
    enabled: tenantLoaded && on('monitor'),
    queryFn: async () => {
      const res = await fetch('/orch/api/monitor?type=health')
      if (!res.ok) return null
      const body = await res.json()
      return body?.health ?? null
    },
    refetchInterval: 30000,
    retry: 0,
  })
  const statusOf = (v?: { status?: string }) =>
    v?.status === 'online' || v?.status === 'connected' ? 'online'
      : v?.status === 'offline' || v?.status === 'error' || v?.status === 'disconnected' ? 'offline'
      : 'unknown'
  const systemServices = [
    { name: 'Orch Broker', status: statusOf(health?.gateway), port: '8047' },
    { name: 'PostgreSQL', status: statusOf(health?.database), port: '5447' },
    { name: 'Kafka', status: statusOf(health?.kafka), port: '9047' },
    { name: 'Web App', status: 'online', port: '3047' },
  ]
  const offlineCount = systemServices.filter((x) => x.status === 'offline').length
  const unknownCount = systemServices.filter((x) => x.status === 'unknown').length
  const statusSummary = !health
    ? { text: 'No status data', color: THEME.text.muted }
    : offlineCount > 0
      ? { text: `${offlineCount} service(s) offline`, color: '#da1e28' }
      : unknownCount > 0
        ? { text: `${unknownCount} service(s) unknown`, color: '#8a3800' }
        : { text: 'All services operational', color: '#24a148' }

  const featureOfHref: Record<string, string> = {
    '/projects': 'projects', '/datasets': 'datasets', '/flows': 'flows', '/logs': 'eventLogs',
  }
  const visibleStats = stats.filter((st) => on(featureOfHref[st.href] ?? ''))

  const quickActions = [
    { href: '/projects/new', icon: FolderKanban, label: 'New Project', desc: 'Create API project', color: THEME.colors.blue },
    { href: '/datasets/new', icon: Database, label: 'New Dataset', desc: 'Add data catalog', color: THEME.colors.emerald },
    { href: '/flows/builder', icon: Workflow, label: 'New Flow', desc: 'Build integration', color: THEME.colors.purple },
  ].filter((qa) => on(featureOfHref['/' + qa.href.split('/')[1]] ?? ''))

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary, letterSpacing: '-0.01em' }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginTop: 2 }}>Orch System Overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={{ background: THEME.accent, color: '#fff' }}
          >
            <Plus className="w-4 h-4" />
            Create Project
          </Link>
        </div>
      </div>

      {/* Stats Cards — every value is read straight from the DB
          via /api/dashboard. No fake delta arrows. */}
      <div
        className={`grid grid-cols-2 gap-px mb-6 border ${visibleStats.length % 2 === 1 ? '[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1' : ''} ${visibleStats.length === 5 ? 'xl:grid-cols-5' : visibleStats.length === 4 ? 'xl:grid-cols-4' : visibleStats.length === 3 ? 'sm:grid-cols-3' : ''}`}
        style={{ background: THEME.border, borderColor: THEME.border }}
      >
        {visibleStats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group block px-4 py-3 bg-[var(--t-panel)] hover:bg-[var(--t-panel-hover)] transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className="w-4 h-4" style={{ color: THEME.text.secondary }} />
              <span className="truncate" style={{ fontSize: 12, color: THEME.text.secondary }}>{stat.label}</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 300, color: THEME.text.primary, lineHeight: '36px' }}>
              {isLoading ? '—' : stat.value}
            </p>
            <p className="truncate" title={stat.sub} style={{ fontSize: 12, color: THEME.text.muted }}>{stat.sub}</p>
          </Link>
        ))}
      </div>

      {/* Main Content - 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column - 2/3 width */}
        <div className="lg:col-span-2 space-y-4">

          {on('projects') && (<>
{/* Recent Projects */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <div className="flex items-center gap-2.5">
                <div style={{
                  width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FolderKanban className="w-4 h-4" style={{ color: THEME.text.secondary }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }}>Recent Projects</h2>
                  <p style={{ fontSize: 11, color: THEME.text.muted }}>Recently updated projects</p>
                </div>
              </div>
              <Link href="/projects" className="flex items-center gap-1 text-[12px] font-medium" style={{ color: THEME.accentLight }}>
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div>
              {recentProjects?.data?.length > 0 ? recentProjects.data.slice(0, 5).map((project: any, i: number) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--t-panel-hover)]"
                  style={{ borderBottom: i < Math.min(recentProjects.data.length, 5) - 1 ? `1px solid ${THEME.borderLight}` : 'none' }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: project.status === 'ACTIVE' ? '#24a148' : 'var(--t-text-muted)',
                    flexShrink: 0,
                  }} />
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }} className="truncate">{project.name}</p>
                    <p style={{ fontSize: 11, color: THEME.text.muted }} className="truncate">{project.slug || project.pathPrefix || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {project._count?.apis > 0 && (
                      <span style={{ fontSize: 11, color: THEME.text.secondary, background: 'var(--t-input)', padding: '2px 8px', borderRadius: 6 }}>
                        {project._count.apis} APIs
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
                  </div>
                </Link>
              )) : (
                <div className="px-4 py-5 flex items-center justify-center gap-3">
                  <FolderKanban className="w-5 h-5" style={{ color: THEME.text.muted }} />
                  <p style={{ fontSize: 13, color: THEME.text.muted }}>No projects yet</p>
                  <Link href="/projects/new" className="inline-flex items-center gap-1 text-[13px]" style={{ color: THEME.accentLight }}>
                    <Plus className="w-3 h-3" /> Create First Project
                  </Link>
                </div>
              )}
            </div>
          </div>

          </>)}
          {on('flows') && (<>
{/* Recent Flows */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <div className="flex items-center gap-2.5">
                <div style={{
                  width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Workflow className="w-4 h-4" style={{ color: THEME.text.secondary }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }}>Recent Flows</h2>
                  <p style={{ fontSize: 11, color: THEME.text.muted }}>Recent flow integrations</p>
                </div>
              </div>
              <Link href="/flows" className="flex items-center gap-1 text-[12px] font-medium" style={{ color: THEME.accentLight }}>
                View All <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div>
              {recentFlows?.data?.length > 0 ? recentFlows.data.slice(0, 5).map((flow: any, i: number) => (
                <Link
                  key={flow.id}
                  href={`/flows/builder/${flow.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--t-panel-hover)]"
                  style={{ borderBottom: i < Math.min(recentFlows.data.length, 5) - 1 ? `1px solid ${THEME.borderLight}` : 'none' }}
                >
                  <Zap className="w-4 h-4 flex-shrink-0" style={{ color: THEME.text.secondary }} />
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }} className="truncate">{flow.name}</p>
                    <p style={{ fontSize: 11, color: THEME.text.muted }}>{flow.triggerType || 'SYNC'} • {flow.nodes?.length ?? 0} nodes</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="cds-tag" style={{
                      fontSize: 12, padding: '2px 8px', lineHeight: '16px',
                      background: flow.isActive ? '#a7f0ba' : '#e0e0e0',
                      color: flow.isActive ? '#0e6027' : '#161616',
                    }}>
                      {flow.isActive ? 'Deployed' : 'Draft'}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
                  </div>
                </Link>
              )) : (
                <div className="px-4 py-5 flex items-center justify-center gap-3">
                  <Workflow className="w-5 h-5" style={{ color: THEME.text.muted }} />
                  <p style={{ fontSize: 13, color: THEME.text.muted }}>No flows yet</p>
                  <Link href="/flows/builder" className="inline-flex items-center gap-1 text-[13px]" style={{ color: THEME.accentLight }}>
                    <Plus className="w-3 h-3" /> Create First Flow
                  </Link>
                </div>
              )}
            </div>
          </div>
          </>)}

          {/* Top APIs Performance */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <div className="flex items-center gap-2.5">
                <div style={{
                  width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BarChart3 className="w-4 h-4" style={{ color: THEME.text.secondary }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }}>Top APIs</h2>
                  <p style={{ fontSize: 11, color: THEME.text.muted }}>Most frequently called APIs</p>
                </div>
              </div>
              <Link href="/logs" className="flex items-center gap-1 text-[12px] font-medium" style={{ color: THEME.accentLight }}>
                View Logs <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#e0e0e0' }}>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>#</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>API Name</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>Requests</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>Avg Time</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>Error Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData?.topApis?.length ? dashboardData.topApis.slice(0, 5).map((api, index) => (
                    <tr key={api.apiId} className="hover:bg-[var(--t-panel-hover)] transition-colors" style={{ borderBottom: `1px solid ${THEME.borderLight}` }}>
                      <td className="px-4 py-2.5">
                        <span style={{ fontSize: 12, color: THEME.text.muted, fontWeight: 600 }}>#{index + 1}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p style={{ fontSize: 13, color: THEME.text.primary, fontWeight: 500 }}>{api.apiName}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span style={{ fontSize: 13, color: THEME.text.secondary, fontWeight: 600 }}>{api.requestCount.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span style={{ fontSize: 12, color: THEME.text.muted }}>{api.avgResponseTime}ms</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span style={{
                          fontSize: 12, padding: '2px 8px',
                          background: api.errorRate > 5 ? '#ffd7d9' : '#a7f0ba',
                          color: api.errorRate > 5 ? '#a2191f' : '#0e6027',
                        }} className="cds-tag">{api.errorRate}%</span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-5 text-center" style={{ fontSize: 13, color: THEME.text.muted }}>
                        No API calls this week
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right column - 1/3 width */}
        <div className="space-y-4">

          {/* Quick Actions */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}>
            <h3 className="px-4 h-12 flex items-center" style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, borderBottom: `1px solid ${THEME.border}` }}>Quick Actions</h3>
            <div>
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--t-panel-hover)] group border-b last:border-b-0"
                  style={{ borderColor: THEME.borderLight }}
                >
                  <div style={{
                    width: 20, height: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <action.icon className="w-4 h-4" style={{ color: THEME.text.secondary }} />
                  </div>
                  <div className="flex-1">
                    <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}
                       className="group-hover:text-[#0f62fe] transition-colors">{action.label}</p>
                    <p style={{ fontSize: 11, color: THEME.text.muted }}>{action.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4" style={{ color: THEME.text.muted }} />
                </Link>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}` }}>
            <div className="px-4 h-12 flex items-center justify-between" style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }}>System Status</h3>
                <p style={{ fontSize: 12, color: statusSummary.color }}>{statusSummary.text}</p>
              </div>
              <Link href="/monitor" className="text-[12px] flex items-center gap-1" style={{ color: THEME.accentLight }}>
                Monitor <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div>
              {systemServices.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between px-4 h-10 border-b last:border-b-0" style={{ borderColor: THEME.borderLight }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{
                      background: svc.status === 'online' ? '#24a148' : svc.status === 'offline' ? '#da1e28' : '#8d8d8d',
                    }} />
                    <span style={{ fontSize: 13, color: THEME.text.primary }}>{svc.name}</span>
                  </div>
                  <span className="flex items-center gap-3">
                    <span style={{ fontSize: 12, color: svc.status === 'offline' ? '#da1e28' : THEME.text.muted }}>
                      {svc.status === 'online' ? 'Online' : svc.status === 'offline' ? 'Offline' : 'Unknown'}
                    </span>
                    <span style={{ fontSize: 12, color: THEME.text.muted, fontFamily: 'var(--font-mono, monospace)' }}>:{svc.port}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
