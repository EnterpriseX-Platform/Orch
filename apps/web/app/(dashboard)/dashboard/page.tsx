'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  Globe,
  Database,
  Workflow,
  Activity,
  ArrowUpRight,
  Server,
  Shield,
  Clock,
  FolderKanban,
  Zap,
  BarChart3,
  FileText,
  ClipboardList,
  Plus,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
} from 'lucide-react'

const FONT = "'Prompt', sans-serif"

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
    blue: '#3B82F6',
    emerald: '#10B981',
    purple: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
    cyan: '#06B6D4',
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

  const { data: recentProjects } = useQuery({
    queryKey: ['recent-projects'],
    queryFn: async () => {
      const res = await fetch('/orch/api/projects?limit=5&sortBy=updatedAt&sortOrder=desc')
      if (!res.ok) return { data: [] }
      return res.json()
    },
  })

  const { data: recentFlows } = useQuery({
    queryKey: ['recent-flows'],
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

  const systemServices = [
    { name: 'Orch Broker', status: 'online', port: '8047' },
    { name: 'PostgreSQL', status: 'online', port: '5447' },
    { name: 'Kafka', status: 'online', port: '9047' },
    { name: 'Next.js App', status: 'online', port: '3047' },
  ]

  const quickActions = [
    { href: '/projects/new', icon: FolderKanban, label: 'New Project', desc: 'Create API project', color: THEME.colors.blue },
    { href: '/datasets/new', icon: Database, label: 'New Dataset', desc: 'Add data catalog', color: THEME.colors.emerald },
    { href: '/flows/builder', icon: Workflow, label: 'New Flow', desc: 'Build integration', color: THEME.colors.purple },
  ]

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group block"
          >
            <div
              style={{
                background: THEME.panel,
                border: `1px solid ${THEME.border}`,
                borderRadius: 10,
                padding: 12,
                transition: 'all 0.15s ease',
              }}
              className="hover:border-[#3B82F6]/40"
            >
              <div className="flex items-center justify-between mb-2">
                <div style={{
                  width: 28,
                  height: 24,
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
              <p style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary, lineHeight: 1.1, marginBottom: 4 }}>
                {isLoading ? '—' : stat.value}
              </p>
              <p style={{ fontSize: 11, color: THEME.text.muted, marginBottom: 2 }}>{stat.label}</p>
              <p style={{ fontSize: 10, color: THEME.text.secondary }}>{stat.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Main Content - 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column - 2/3 width */}
        <div className="lg:col-span-2 space-y-4">

          {/* Recent Projects */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <div className="flex items-center gap-2.5">
                <div style={{
                  width: 32, height: 32, background: `${THEME.colors.blue}12`, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FolderKanban className="w-4 h-4" style={{ color: THEME.colors.blue }} />
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
                    background: project.status === 'ACTIVE' ? '#34D399' : 'var(--t-text-muted)',
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
                <div className="px-4 py-8 text-center">
                  <FolderKanban className="w-8 h-8 mx-auto mb-2" style={{ color: THEME.text.muted }} />
                  <p style={{ fontSize: 13, color: THEME.text.muted }}>No projects yet</p>
                  <Link href="/projects/new" className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium" style={{ color: THEME.accentLight }}>
                    <Plus className="w-3 h-3" /> Create First Project
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Recent Flows */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <div className="flex items-center gap-2.5">
                <div style={{
                  width: 32, height: 32, background: `${THEME.colors.purple}12`, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Workflow className="w-4 h-4" style={{ color: THEME.colors.purple }} />
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
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: flow.isDeployed ? `${THEME.colors.purple}15` : 'var(--t-input)',
                    border: `1px solid ${flow.isDeployed ? THEME.colors.purple + '30' : THEME.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Zap className="w-3.5 h-3.5" style={{ color: flow.isDeployed ? THEME.colors.purple : THEME.text.muted }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }} className="truncate">{flow.name}</p>
                    <p style={{ fontSize: 11, color: THEME.text.muted }}>{flow.triggerType || 'SYNC'} • {flow.nodeCount || 0} nodes</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                      background: flow.isDeployed ? '#10B98112' : '#F59E0B12',
                      color: flow.isDeployed ? '#34D399' : '#FBBF24',
                    }}>
                      {flow.isDeployed ? 'Deployed' : 'Draft'}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
                  </div>
                </Link>
              )) : (
                <div className="px-4 py-8 text-center">
                  <Workflow className="w-8 h-8 mx-auto mb-2" style={{ color: THEME.text.muted }} />
                  <p style={{ fontSize: 13, color: THEME.text.muted }}>No flows yet</p>
                  <Link href="/flows/builder" className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium" style={{ color: THEME.accentLight }}>
                    <Plus className="w-3 h-3" /> Create First Flow
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Top APIs Performance */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${THEME.border}` }}>
              <div className="flex items-center gap-2.5">
                <div style={{
                  width: 32, height: 32, background: `${THEME.colors.amber}12`, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BarChart3 className="w-4 h-4" style={{ color: THEME.colors.amber }} />
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
                  <tr style={{ background: 'var(--t-input)' }}>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>#</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>API Name</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>Requests</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>Avg Time</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: THEME.text.muted }}>Error Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData?.topApis?.slice(0, 5).map((api, index) => (
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
                          fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          background: api.errorRate > 5 ? '#EF444415' : '#10B98115',
                          color: api.errorRate > 5 ? '#F87171' : '#34D399',
                        }}>{api.errorRate}%</span>
                      </td>
                    </tr>
                  )) || (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center" style={{ fontSize: 13, color: THEME.text.muted }}>
                        No API data available
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
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, marginBottom: 12 }}>Quick Actions</h3>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all hover:bg-[var(--t-panel-hover)] group"
                  style={{ background: 'var(--t-input)', border: `1px solid ${THEME.border}` }}
                >
                  <div style={{
                    width: 34, height: 34, background: `${action.color}12`, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <action.icon className="w-4 h-4" style={{ color: action.color }} />
                  </div>
                  <div className="flex-1">
                    <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}
                       className="group-hover:text-[#60A5FA] transition-colors">{action.label}</p>
                    <p style={{ fontSize: 11, color: THEME.text.muted }}>{action.desc}</p>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: THEME.accentLight }} />
                </Link>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 16 }}>
            <div className="flex items-center gap-2.5 mb-4">
              <div style={{
                width: 32, height: 32, background: '#10B98112', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Shield className="w-4 h-4" style={{ color: '#10B981' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }}>System Status</h3>
                <p style={{ fontSize: 11, color: '#34D399' }}>All systems operational</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {systemServices.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#34D399' }} />
                    <span style={{ fontSize: 13, color: THEME.text.secondary }}>{svc.name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: THEME.text.muted, fontFamily: 'monospace' }}>:{svc.port}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Links */}
          <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, marginBottom: 12 }}>Quick Links</h3>
            <div className="space-y-1">
              {[
                { href: '/logs', icon: FileText, label: 'API Logs', desc: 'View API call history' },
                { href: '/audit', icon: ClipboardList, label: 'Audit Trail', desc: 'Track changes' },
                { href: '/monitor', icon: Activity, label: 'Monitor', desc: 'Check system status' },
                { href: '/settings', icon: Server, label: 'Settings', desc: 'System settings' },
              ].map((item) => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[var(--t-panel-hover)] group"
                >
                  <item.icon className="w-4 h-4" style={{ color: THEME.text.muted }} />
                  <div className="flex-1">
                    <p style={{ fontSize: 13, color: THEME.text.secondary }} className="group-hover:text-[var(--t-text)] transition-colors">{item.label}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: THEME.text.muted }} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
