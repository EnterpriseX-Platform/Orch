'use client'

import { useState, useRef, useEffect } from 'react'
import { TenantSwitcher } from './TenantSwitcher'
import { useTenantStore } from '@/stores/tenantStore'
import { useAuthStore } from '@/stores/authStore'
import { Header as CarbonHeader, HeaderMenuButton, HeaderName, HeaderGlobalBar, HeaderGlobalAction, SkipToContent, Theme } from '@carbon/react'
import { Bell, Search, Settings, HelpCircle, User, LogOut } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif';

interface UserProfile {
  id: string
  username: string
  email: string
  fullName: string | null
  avatar: string | null
  roles: string[]
}

interface HeaderProps {
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

// Breadcrumb mapping for known static segments
const breadcrumbMap: Record<string, string> = {
  'dashboard': 'Dashboard',
  'projects': 'Projects',
  'registers': 'API Registers',
  'datasets': 'Data Catalogs',
  'data-repository': 'Data Repository',
  'flows': 'Flows',
  'builder': 'Flow Builder',
  'logs': 'Event Logs',
  'audit': 'Audit Trail',
  'reports': 'Analytics',
  'monitor': 'System Monitor',
  'settings': 'System Settings',
  'system-config': 'System Configuration',
  'users': 'Users',
  'new': 'New',
  'apis': 'APIs',
  'field-mappings': 'Field Mappings',
  'audit-configs': 'Audit Configs',
  'clients': 'Clients',
  'api-keys': 'API Keys',
  'workers': 'Workers',
  'jobs': 'Jobs',
}

// Segments that are followed by a dynamic ID
const parentSegments = new Set(['projects', 'apis', 'flows', 'registers', 'datasets', 'builder'])

// Hook to resolve dynamic IDs to display names
function useBreadcrumbLabels(segments: string[]) {
  const resolvedLabels: Record<number, string> = {}
  const queriesToRun: { index: number; type: string; id: string }[] = []

  // Detect which segments are dynamic IDs based on the previous segment
  segments.forEach((segment, index) => {
    if (breadcrumbMap[segment]) return // Known static segment
    if (index === 0) return
    const prev = segments[index - 1]
    if (parentSegments.has(prev)) {
      queriesToRun.push({ index, type: prev, id: segment })
    }
  })

  // Fetch project name
  const projectQuery = queriesToRun.find(q => q.type === 'projects')
  const { data: projectData, isLoading: projectLoading } = useQuery<{ name: string }>({
    queryKey: ['breadcrumb-project', projectQuery?.id],
    queryFn: async () => {
      const res = await fetch(`/orch/api/projects/${projectQuery!.id}`)
      if (!res.ok) return { name: projectQuery!.id }
      return res.json()
    },
    enabled: !!projectQuery,
    staleTime: 5 * 60 * 1000,
  })
  if (projectQuery) {
    resolvedLabels[projectQuery.index] = projectData?.name || (projectLoading ? '...' : projectQuery.id.slice(0, 8))
  }

  // Fetch API name
  const apiQuery = queriesToRun.find(q => q.type === 'apis' || q.type === 'registers')
  const { data: apiData, isLoading: apiLoading } = useQuery<{ name: string }>({
    queryKey: ['breadcrumb-api', apiQuery?.id],
    queryFn: async () => {
      const res = await fetch(`/orch/api/registers/${apiQuery!.id}`)
      if (!res.ok) return { name: apiQuery!.id }
      return res.json()
    },
    enabled: !!apiQuery,
    staleTime: 5 * 60 * 1000,
  })
  if (apiQuery) {
    resolvedLabels[apiQuery.index] = apiData?.name || (apiLoading ? '...' : apiQuery.id.slice(0, 8))
  }

  // Fetch flow name
  const flowQuery = queriesToRun.find(q => q.type === 'flows' || q.type === 'builder')
  const { data: flowData, isLoading: flowLoading } = useQuery<{ name: string }>({
    queryKey: ['breadcrumb-flow', flowQuery?.id],
    queryFn: async () => {
      const res = await fetch(`/orch/api/flows/${flowQuery!.id}`)
      if (!res.ok) return { name: flowQuery!.id }
      return res.json()
    },
    enabled: !!flowQuery,
    staleTime: 5 * 60 * 1000,
  })
  if (flowQuery) {
    resolvedLabels[flowQuery.index] = flowData?.name || (flowLoading ? '...' : flowQuery.id.slice(0, 8))
  }

  return resolvedLabels
}

export function Breadcrumb() {
  const pathname = usePathname() || ''
  const segments = pathname.replace('/orch/', '').split('/').filter(Boolean)

  if (segments.length === 0) {
    segments.push('dashboard')
  }

  const resolvedLabels = useBreadcrumbLabels(segments)

  return (
    <nav style={{ fontFamily: FONT }} className="flex items-center gap-1 text-[12px] leading-4 min-w-0 mb-1">
      <Link
        href="/dashboard"
        className="text-[#0f62fe] hover:underline whitespace-nowrap"
      >
        Home
      </Link>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const href = '/' + segments.slice(0, index + 1).join('/')
        const label = resolvedLabels[index] || breadcrumbMap[segment] || segment

        return (
          <div key={segment + index} className="flex items-center gap-1.5 min-w-0">
            <span aria-hidden className="px-0.5" style={{ color: 'var(--t-text-muted)' }}>/</span>
            {isLast ? (
              <span style={{ color: 'var(--t-text)' }} className="truncate max-w-[240px]" title={label}>{label}</span>
            ) : (
              <Link
                href={href}
                className="text-[#0f62fe] hover:underline truncate max-w-[180px]"
                title={label}
              >
                {label}
              </Link>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export function Header({ sidebarCollapsed = false, onToggleSidebar }: HeaderProps) {
  const router = useRouter()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const { data: user } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const token = useAuthStore.getState().accessToken
      const res = await fetch('/orch/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error('Failed to fetch user')
      return res.json()
    },
  })

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await fetch('/orch/api/auth/logout', { method: 'POST' })
    useTenantStore.setState({ loaded: false, tenants: [], current: null, features: {} })
    router.push('/login')
  }

  const initial = (user?.fullName || user?.username || 'A').charAt(0).toUpperCase()

  return (
    <Theme theme="g100">
    <CarbonHeader aria-label="Orch Platform">
      <SkipToContent href="#main-content" />
      <HeaderMenuButton
        aria-label={sidebarCollapsed ? 'Open menu' : 'Close menu'}
        isActive={!sidebarCollapsed}
        isCollapsible
        onClick={onToggleSidebar}
      />
      <HeaderName as={Link} href="/dashboard" prefix="Orch">
        Platform
      </HeaderName>
      <div className="w-px my-3 bg-[#393939]" />
      <TenantSwitcher variant="dark" />

      {/* Right: search, notifications, user */}
      <HeaderGlobalBar>
        <div className="hidden md:flex items-center px-2">
          <div className="relative w-56 xl:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8d8d8d]" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full h-8 pl-9 pr-3 bg-[#262626] text-[13px] text-white placeholder:text-[#8d8d8d] border-0 border-b border-b-[#6f6f6f] focus:outline-none focus:border-b-white"
            />
          </div>
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <HeaderGlobalAction
            aria-label="Notifications"
            isActive={showNotifications}
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-3 right-3 w-2 h-2 bg-[#da1e28] rounded-full" />
          </HeaderGlobalAction>
          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 border-x border-b" style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)' }}>
              <div className="px-4 h-10 border-b flex items-center justify-between" style={{ borderColor: 'var(--t-border)' }}>
                <span className="font-semibold text-[13px]" style={{ color: 'var(--t-text)' }}>Notifications</span>
                <button className="text-[12px] text-[#0f62fe] hover:underline">Mark all read</button>
              </div>
              <div className="max-h-72 overflow-auto">
                {[
                  { color: '#da1e28', text: 'Pipeline "Data Sync" deployment failed', time: '2 minutes ago' },
                  { color: '#24a148', text: 'Flow "ETL Process" executed successfully', time: '15 minutes ago' },
                ].map((n) => (
                  <div key={n.text} className="px-4 py-3 border-b last:border-0 hover:bg-[var(--t-panel-hover)] cursor-pointer flex gap-3" style={{ borderColor: 'var(--t-border)' }}>
                    <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: n.color }} />
                    <div>
                      <p className="text-[13px]" style={{ color: 'var(--t-text)' }}>{n.text}</p>
                      <p className="text-[12px] mt-0.5" style={{ color: 'var(--t-text-muted)' }}>{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div className="relative" ref={userMenuRef}>
          <HeaderGlobalAction
            aria-label="User menu"
            isActive={showUserMenu}
            onClick={() => setShowUserMenu(!showUserMenu)}
            tooltipAlignment="end"
          >
            <span className="w-7 h-7 rounded-full bg-[#0f62fe] text-white text-[12px] font-semibold flex items-center justify-center">
              {initial}
            </span>
          </HeaderGlobalAction>
          {showUserMenu && (
            <div className="absolute right-0 top-12 w-60 border-x border-b" style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--t-border)' }}>
                <p className="font-semibold text-[14px]" style={{ color: 'var(--t-text)' }}>{user?.fullName || user?.username || 'Admin User'}</p>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--t-text-muted)' }}>{user?.email || 'admin@orch.io'}</p>
              </div>
              {[
                { icon: User, label: 'Profile', onClick: undefined },
                { icon: Settings, label: 'Settings', onClick: () => router.push('/settings') },
                { icon: HelpCircle, label: 'Help & Support', onClick: undefined },
              ].map((m) => (
                <button key={m.label} onClick={m.onClick}
                  className="w-full h-10 px-4 text-left text-[13px] flex items-center gap-3 hover:bg-[var(--t-panel-hover)]"
                  style={{ color: 'var(--t-text)' }}>
                  <m.icon className="w-4 h-4" style={{ color: 'var(--t-text-secondary)' }} /> {m.label}
                </button>
              ))}
              <button onClick={handleLogout}
                className="w-full h-10 px-4 text-left text-[13px] flex items-center gap-3 border-t text-[#da1e28] hover:bg-[#fff1f1]"
                style={{ borderColor: 'var(--t-border)' }}>
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </HeaderGlobalBar>
    </CarbonHeader>
    </Theme>
  )
}
