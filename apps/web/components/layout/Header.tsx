'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell, Plus, Search, ChevronDown, Settings, HelpCircle, User, LogOut, Menu, ChevronRight, Sun, Moon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useThemeStore } from '@/stores/themeStore'

const FONT = "'Prompt', sans-serif";

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
  'logs': 'API Logs',
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

function Breadcrumb() {
  const pathname = usePathname() || ''
  const segments = pathname.replace('/orch/', '').split('/').filter(Boolean)

  if (segments.length === 0) {
    segments.push('dashboard')
  }

  const resolvedLabels = useBreadcrumbLabels(segments)

  return (
    <nav style={{ fontFamily: FONT }} className="flex items-center gap-1.5 text-[13px] min-w-0">
      <Link
        href="/dashboard"
        style={{ color: 'var(--t-text-muted)' }}
        className="hover:!text-[#60A5FA] transition-colors whitespace-nowrap"
      >
        Home
      </Link>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const href = '/' + segments.slice(0, index + 1).join('/')
        const label = resolvedLabels[index] || breadcrumbMap[segment] || segment

        return (
          <div key={segment + index} className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--t-border)' }} />
            {isLast ? (
              <span style={{ color: 'var(--t-text)' }} className="font-medium truncate max-w-[200px]" title={label}>{label}</span>
            ) : (
              <Link
                href={href}
                style={{ color: 'var(--t-text-muted)' }}
                className="hover:!text-[#60A5FA] transition-colors truncate max-w-[180px]"
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
  const { mode, toggle: toggleTheme } = useThemeStore()
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)

  const { data: user } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const res = await fetch('/orch/api/auth/me')
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
    router.push('/login')
  }

  return (
    <header
      style={{ fontFamily: FONT, backgroundColor: 'var(--t-header)', borderColor: 'var(--t-border-light)' }}
      className="h-14 border-b flex items-center px-4 sticky top-0 z-20 transition-colors"
    >
      {/* Left: Toggle + Breadcrumb */}
      <div className="flex items-center gap-4">
        {/* Sidebar Toggle */}
        <button
          onClick={onToggleSidebar}
          style={{ color: 'var(--t-text-muted)' }}
          className="h-8 w-8 flex items-center justify-center hover:text-[#60A5FA] rounded-lg transition-colors"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Breadcrumb */}
        <Breadcrumb />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Search */}
        <div className="hidden sm:block w-48 md:w-64">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--t-text-muted)' }} />
            <input
              type="text"
              placeholder="Search..."
              style={{
                backgroundColor: 'var(--t-input)',
                borderColor: 'var(--t-border)',
                color: 'var(--t-text)',
              }}
              className="w-full h-8 pl-9 pr-4 border rounded-lg text-[13px] placeholder:text-[var(--t-text-muted)] focus:outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20 transition-all"
            />
          </div>
        </div>

        {/* New Button */}
        <button
          style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)', color: 'var(--t-text-secondary)' }}
          className="h-8 px-3 border hover:border-[#3B82F6] hover:text-[#60A5FA] text-[13px] font-medium rounded-lg flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          style={{ color: 'var(--t-text-muted)' }}
          className="h-8 w-8 flex items-center justify-center hover:text-[#60A5FA] rounded-lg transition-colors"
          title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            style={{ color: 'var(--t-text-muted)' }}
            className="relative h-8 w-8 flex items-center justify-center hover:text-[#60A5FA] rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[var(--t-header)]"></span>
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)' }} className="absolute right-0 top-full mt-2 w-72 border rounded-lg shadow-xl py-2" >
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--t-border)' }}>
                <span className="font-medium text-[13px]" style={{ color: 'var(--t-text)' }}>Notifications</span>
                <button className="text-[11px] text-[#60A5FA] hover:text-[#3B82F6]">Mark all read</button>
              </div>
              <div className="max-h-60 overflow-auto">
                <div className="px-3 py-2.5 hover:bg-[var(--t-panel-hover)] cursor-pointer border-b last:border-0" style={{ borderColor: 'var(--t-border)' }}>
                  <div className="flex gap-2">
                    <div className="w-1.5 h-1.5 bg-[#60A5FA] rounded-full mt-1.5 flex-shrink-0"></div>
                    <div>
                      <p className="text-[12px]" style={{ color: 'var(--t-text)' }}>Pipeline &quot;Data Sync&quot; deployment failed</p>
                      <p className="text-[11px] mt-1" style={{ color: 'var(--t-text-muted)' }}>2 minutes ago</p>
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2.5 hover:bg-[var(--t-panel-hover)] cursor-pointer border-b last:border-0" style={{ borderColor: 'var(--t-border)' }}>
                  <div className="flex gap-2">
                    <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full mt-1.5 flex-shrink-0"></div>
                    <div>
                      <p className="text-[12px]" style={{ color: 'var(--t-text)' }}>Flow &quot;ETL Process&quot; executed successfully</p>
                      <p className="text-[11px] mt-1" style={{ color: 'var(--t-text-muted)' }}>15 minutes ago</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--t-border)' }}>
                <button className="text-[12px] text-[#60A5FA] hover:text-[#3B82F6]">View all notifications</button>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{ color: 'var(--t-text-muted)' }}
            className="flex items-center gap-2 h-8 px-2 hover:text-[#60A5FA] rounded-lg transition-colors"
          >
            <div style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)' }} className="w-7 h-7 rounded-full border flex items-center justify-center text-[#60A5FA] text-xs font-medium">
              {user?.fullName?.charAt(0) || user?.username?.charAt(0) || 'A'}
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* User Dropdown */}
          {showUserMenu && (
            <div style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-border)' }} className="absolute right-0 top-full mt-2 w-52 border rounded-lg shadow-xl py-2">
              <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--t-border)' }}>
                <p className="font-medium text-[13px]" style={{ color: 'var(--t-text)' }}>{user?.fullName || user?.username || 'Admin User'}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--t-text-muted)' }}>{user?.email || 'admin@orch'}</p>
              </div>
              <div className="py-1">
                <button style={{ color: 'var(--t-text-secondary)' }} className="w-full px-3 py-2 text-left text-[13px] hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors">
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button
                  onClick={() => router.push('/settings')}
                  style={{ color: 'var(--t-text-secondary)' }}
                  className="w-full px-3 py-2 text-left text-[13px] hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button style={{ color: 'var(--t-text-secondary)' }} className="w-full px-3 py-2 text-left text-[13px] hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)] flex items-center gap-2 transition-colors">
                  <HelpCircle className="w-4 h-4" />
                  Help & Support
                </button>
              </div>
              <div className="border-t py-1 mt-1" style={{ borderColor: 'var(--t-border)' }}>
                <button
                  onClick={handleLogout}
                  className="w-full px-3 py-2 text-left text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
