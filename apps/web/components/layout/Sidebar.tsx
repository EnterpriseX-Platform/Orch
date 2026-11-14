'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useTenantStore, featureForPath } from '@/stores/tenantStore'
import {
  LayoutDashboard,
  Database,
  Workflow,
  FileText,
  ClipboardList,
  Settings,
  LucideIcon,
  Activity,
  FolderKanban,
  BarChart3,
} from 'lucide-react'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif';

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

function NavItem({ item, collapsed, isActive }: {
  item: NavItemType
  pathname: string
  collapsed: boolean
  isActive: boolean
}) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      style={{
        fontFamily: FONT,
        color: isActive ? '#161616' : '#525252',
        backgroundColor: isActive ? '#e0e0e0' : undefined,
        boxShadow: isActive ? 'inset 3px 0 0 #0f62fe' : undefined,
      }}
      className={cn(
        'group flex items-center gap-3 h-8 px-4 text-[14px] leading-[18px] hover:bg-[#e8e8e8] hover:!text-[#161616] transition-colors',
        isActive && 'font-semibold',
        collapsed && 'justify-center px-0'
      )}
      title={collapsed ? item.name : undefined}
    >
      <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#161616' : '#525252' }} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.name}</span>
          {item.count !== undefined && item.count > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#e0e0e0] group-aria-[current=page]:bg-white text-[11px] font-normal text-[#161616] tabular-nums flex items-center justify-center">
              {item.count}
            </span>
          )}
        </>
      )}
    </Link>
  )
}

function NavGroup({ title, collapsed, children }: { title: string; collapsed: boolean; children: React.ReactNode }) {
  return (
    <div className="pb-2">
      {collapsed ? (
        <div className="mx-3 my-2 h-px bg-[#e0e0e0]" />
      ) : (
        <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.32px] text-[#6f6f6f]">{title}</p>
      )}
      {children}
    </div>
  )
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname() || ''
  const tenantFeatures = useTenantStore((st) => st.features)
  // Hide menu entries whose feature is switched off for the active tenant.
  const visible = (item: NavItemType) => tenantFeatures[featureForPath(item.href) ?? ''] !== false

  // Fetch real counts from API
  const tenantLoaded = useTenantStore((st) => st.loaded)
  const { data: counts } = useQuery<CountsData>({
    queryKey: ['sidebar-counts', tenantFeatures],
    enabled: tenantLoaded,
    queryFn: async () => {
      // Skip counts for features the tenant has switched off (they'd 403).
      const count = (feature: string, url: string) =>
        tenantFeatures[feature] === false
          ? Promise.resolve({ total: 0 })
          : fetch(url).then(r => r.ok ? r.json() : { total: 0 })
      const [projectsRes, datasetsRes, flowsRes] = await Promise.allSettled([
        count('projects', '/orch/api/projects?limit=1'),
        count('datasets', '/orch/api/datasets?limit=1'),
        count('flows', '/orch/api/flows?limit=1'),
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

  const renderItems = (items: NavItemType[]) =>
    items.filter(visible).map((item) => {
      const isActive = [item.href, '/orch' + item.href].some(h => pathname === h || pathname.startsWith(h + '/'))
      return <NavItem key={item.name} item={item} pathname={pathname} collapsed={collapsed} isActive={isActive} />
    })

  return (
    <aside
      style={{ fontFamily: FONT, backgroundColor: '#ffffff', borderColor: '#e0e0e0' }}
      className={cn(
        'fixed top-12 bottom-0 left-0 z-40 border-r flex flex-col transition-[width] duration-150',
        collapsed ? 'w-12' : 'w-[216px]'
      )}
    >
      <nav className="flex-1 overflow-y-auto pb-4" aria-label="Main navigation">
        <NavGroup title="Workspace" collapsed={collapsed}>{renderItems(mainNav)}</NavGroup>
        <NavGroup title="Observability" collapsed={collapsed}>{renderItems(observabilityNav)}</NavGroup>
        <NavGroup title="System" collapsed={collapsed}>{renderItems(systemNav)}</NavGroup>
      </nav>
      {!collapsed && (
        <div className="px-4 h-10 flex items-center border-t text-[11px] text-[#6f6f6f]" style={{ borderColor: '#e0e0e0' }}>
          Orch · Service Mesh
        </div>
      )}
    </aside>
  )
}
