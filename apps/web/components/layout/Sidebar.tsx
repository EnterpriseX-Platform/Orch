'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Database,
  Globe,
  Workflow,
  FileText,
  ClipboardList,
  Settings,
  SlidersHorizontal,
  Layers,
  LucideIcon,
  Activity,
  FolderKanban,
  Briefcase,
  Key,
  BarChart3,
} from 'lucide-react'

const FONT = "'Prompt', sans-serif";

interface NavItemType {
  name: string
  href: string
  icon: LucideIcon
  count?: number
}

interface CountsData {
  projects: number
  datasets: number
  flows: number
}

const systemNav: NavItemType[] = [
  // "System Monitor" (vs. "Feature Monitor" under Observability) — this is
  // the infra/health view: broker/db/kafka status, worker jobs, nodes.
  { name: 'System Monitor', href: '/monitor', icon: Activity },
  // System Settings consolidates Users / Environment (was /system-config) /
  // OIDC / System Info / Workers — single place for admin config.
  { name: 'System Settings', href: '/settings', icon: Settings },
]

interface SidebarProps {
  collapsed?: boolean
}

function NavItem({ item, pathname, collapsed, isActive }: {
  item: NavItemType
  pathname: string
  collapsed: boolean
  isActive: boolean
}) {
  return (
    <Link
      href={item.href}
      style={isActive ? { fontFamily: FONT } : { fontFamily: FONT, color: 'var(--t-text-secondary)' }}
      className={cn(
        'group flex items-center gap-3 px-3 py-1.5 rounded-lg text-[13px] transition-all duration-200 relative',
        isActive
          ? 'bg-gradient-to-r from-[#3B82F6]/20 to-[#3B82F6]/10 text-[#60A5FA] font-semibold border border-[#3B82F6]/35 shadow-[0_0_12px_rgba(59,130,246,0.15)] ml-0'
          : 'hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] border border-transparent ml-0',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? item.name : undefined}
    >
      <item.icon className={cn(
        'w-4 h-4 flex-shrink-0',
        isActive ? 'text-[#60A5FA]' : ''
      )} style={isActive ? undefined : { color: 'var(--t-text-muted)' }} />
      {!collapsed && (
        <>
          <span className={cn(
            "flex-1 truncate font-medium",
            isActive && "text-[#60A5FA]"
          )}>{item.name}</span>
          {item.count !== undefined && item.count > 0 && (
            <span className={cn(
              "px-1.5 py-0.5 text-[11px] rounded font-semibold",
              isActive
                ? "bg-[#3B82F6]/20 text-[#60A5FA]"
                : ""
            )} style={isActive ? undefined : { backgroundColor: 'var(--t-panel)', color: 'var(--t-text-muted)' }}>
              {item.count}
            </span>
          )}
        </>
      )}
    </Link>
  )
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname() || ''

  // Fetch real counts from API
  const { data: counts } = useQuery<CountsData>({
    queryKey: ['sidebar-counts'],
    queryFn: async () => {
      const [projectsRes, datasetsRes, flowsRes] = await Promise.allSettled([
        fetch('/orch/api/projects?limit=1').then(r => r.ok ? r.json() : { total: 0 }),
        fetch('/orch/api/datasets?limit=1').then(r => r.ok ? r.json() : { total: 0 }),
        fetch('/orch/api/flows?limit=1').then(r => r.ok ? r.json() : { total: 0 }),
      ])

      return {
        projects: projectsRes.status === 'fulfilled' ? (projectsRes.value.total || 0) : 0,
        datasets: datasetsRes.status === 'fulfilled' ? (datasetsRes.value.total || 0) : 0,
        flows: flowsRes.status === 'fulfilled' ? (flowsRes.value.total || 0) : 0,
      }
    },
    retry: 0,
    refetchInterval: 30000,
  })

  // Three-tier sidebar for admin users.
  //   Main         — primary resource CRUD (project/dataset/flow)
  //   Observability — what happened? (logs, audit, reports)
  //   System        — how is it running? (monitor + settings)
  // Worker Jobs previously top-level — now a sub-tab inside /monitor
  // so admins only see one "system health" entry point.
  const mainNav: NavItemType[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: FolderKanban, count: counts?.projects },
    { name: 'Data Catalogs', href: '/datasets', icon: Database, count: counts?.datasets },
    // spec — physical tables managed by Orch with auto CRUD
    // + per-column encryption (engine-aware DDL).
    { name: 'Data Repository', href: '/data-repository', icon: Database },
    { name: 'Flows', href: '/flows', icon: Workflow, count: counts?.flows },
  ]
  // Library entries are project-scoped — accessed via the project
  // page's secondary nav, not from the global sidebar. Keeping this
  // commented as documentation; the imports of Tag/Shield/Monitor*
  // remain for the project page nav buttons.
  // const libraryNav: NavItemType[] = [
  //   { name: 'Field Mappings', href: '/projects/{id}/field-mappings', icon: Tag },
  //   { name: 'Audit Configs',  href: '/projects/{id}/audit-configs',  icon: Shield },
  //   { name: 'Clients',        href: '/projects/{id}/clients',        icon: MonitorSmartphone },
  // ]
  const observabilityNav: NavItemType[] = [
    { name: 'Event Logs', href: '/logs', icon: FileText },
    { name: 'Audit', href: '/audit', icon: ClipboardList },
    // "Analytics" — tracks feature usage (who uses which screens/APIs
    // and how often) vs. /orch/monitor which tracks infra health.
    // Renamed from "Feature Monitor" per admin feedback: shorter,
    // less jargon-y, and matches the product analytics mental model.
    { name: 'Analytics', href: '/reports', icon: BarChart3 },
  ]

  return (
    <aside
      style={{ fontFamily: FONT, backgroundColor: 'var(--t-sidebar)', borderColor: 'var(--t-border-light)' }}
      className={cn(
        'fixed top-0 left-0 z-40 h-full border-r flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-52'
      )}
    >
      {/* Logo - Orch */}
      <div className={cn(
        'h-14 flex items-center gap-3',
        collapsed ? 'justify-center px-2' : 'px-4'
      )}>
        <div className="w-8 h-8 bg-gradient-to-br from-[#3B82F6] to-[#60A5FA] rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-500/20">
          <Layers className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="flex items-center gap-1">
            <span style={{ color: 'var(--t-text)' }} className="font-bold text-base tracking-tight">Orch</span>
            <span className="px-1.5 py-0.5 text-[10px] bg-[#3B82F6]/15 text-[#60A5FA] rounded font-semibold ml-1 border border-[#3B82F6]/30">βeta</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto">
        {/* Main Section */}
        <div className="space-y-0">
          {!collapsed && (
            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t-text-muted)' }}>
              Main Menu
            </p>
          )}
          {mainNav.map((item) => {
            const isActive = pathname === '/orch' + item.href || pathname.startsWith(`/orch${item.href}/`)
            return (
              <NavItem
                key={item.name}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                isActive={isActive}
              />
            )
          })}
        </div>

        {/* Observability Section */}
        <div className="mt-2 space-y-0">
          {!collapsed && (
            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t-text-muted)' }}>
              Observability
            </p>
          )}
          {observabilityNav.map((item) => {
            const isActive = pathname === '/orch' + item.href || pathname.startsWith(`/orch${item.href}/`)
            return (
              <NavItem
                key={item.name}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                isActive={isActive}
              />
            )
          })}
        </div>

        {/* System Section */}
        <div className="mt-2 space-y-0">
          {!collapsed && (
            <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t-text-muted)' }}>
              System
            </p>
          )}
          {systemNav.map((item) => {
            const isActive = pathname === '/orch' + item.href || pathname.startsWith(`/orch${item.href}/`)
            return (
              <NavItem
                key={item.name}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                isActive={isActive}
              />
            )
          })}
        </div>
      </nav>
    </aside>
  )
}
