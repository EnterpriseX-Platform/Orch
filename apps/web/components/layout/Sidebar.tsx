'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useTenantStore, featureForPath } from '@/stores/tenantStore'
import { SideNav, SideNavItems, SideNavLink, SideNavDivider, Tag } from '@carbon/react'
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
    // TOR 4.5.1 — physical tables managed by Orch with auto CRUD
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

  const isActive = (href: string) =>
    [href, '/orch' + href].some((h) => pathname === h || pathname.startsWith(h + '/'))

  const renderItems = (items: NavItemType[]) =>
    items.filter(visible).map((item) => (
      <SideNavLink
        key={item.name}
        as={Link}
        href={item.href}
        renderIcon={item.icon}
        isActive={isActive(item.href)}
        aria-current={isActive(item.href) ? 'page' : undefined}
      >
        <span className="flex items-center gap-2 w-full">
          <span className="flex-1 truncate">{item.name}</span>
          {item.count !== undefined && item.count > 0 && (
            <Tag size="sm" type="gray" className="!m-0">{item.count}</Tag>
          )}
        </span>
      </SideNavLink>
    ))

  const group = (title: string) =>
    collapsed ? <SideNavDivider /> : (
      <li className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.32px] text-[#6f6f6f]" aria-hidden>
        {title}
      </li>
    )

  // Carbon UI Shell side nav: fixed under the 48px header; collapses to a rail.
  return (
    <SideNav
      aria-label="Main navigation"
      expanded={!collapsed}
      isRail={collapsed}
      isFixedNav
      isChildOfHeader={false}
      className="!top-12"
    >
      <SideNavItems>
        {group('Workspace')}
        {renderItems(mainNav)}
        {group('Observability')}
        {renderItems(observabilityNav)}
        {group('System')}
        {renderItems(systemNav)}
      </SideNavItems>
    </SideNav>
  )
}
