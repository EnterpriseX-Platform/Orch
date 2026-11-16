'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  User as UserIcon,
  RefreshCw,
  UserCheck,
  Crown,
  Variable,
  Lock,
  Server,
  Database,
  Save,
  Shield,
  Settings,
  Activity,
  Cpu,
  HardDrive,
  Clock,
  Globe,
  Zap,
  Layers,
  MessageSquare,
  Wifi,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Checkbox,
  Modal,
  Search as CdsSearch,
  Tab,
  TabList,
  Tabs,
  Tag,
  TextInput,
} from '@carbon/react'
import { WorkersTab } from './WorkersTab'
import { TenantsPanel } from '@/components/settings/TenantsPanel'
import { Building2 } from 'lucide-react'
import { SystemConfigPanel } from '@/components/settings/SystemConfigPanel'
import { RetentionPanel } from '@/components/settings/RetentionPanel'
import { EncryptionPanel } from '@/components/settings/EncryptionPanel'
import { EncryptionKeyPanel } from '@/components/settings/EncryptionKeyPanel'
import { confirmDialog } from '@/components/common/ConfirmDialog'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif'

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent-hover)',
  accentLight: 'var(--t-accent-light)',
}

const ROLE_TAG_TYPES: Record<string, 'red' | 'blue' | 'gray' | 'green'> = {
  admin: 'red',
  user: 'blue',
  viewer: 'gray',
  operator: 'green',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  user: 'User',
  viewer: 'Viewer',
  operator: 'Operator',
}

// Types
interface User {
  id: string
  username: string
  email: string
  firstName?: string
  lastName?: string
  department?: string
  roles: string[]
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
}

interface EnvVar {
  id?: string
  key: string
  value: string
  description: string
  isSecret: boolean
}

interface OidcConfig {
  enabled: boolean
  provider: string
  clientId: string
  clientSecret: string
  issuerUrl: string
  redirectUri: string
  scope: string
  usernameClaim: string
  emailClaim: string
}

// Shape returned by /api/system/info — real values, not the old mock.
// Fields we cannot derive cheaply (memory%, CPU%, uptime, msg/s) are
// intentionally omitted rather than faked.
interface SystemStatus {
  database: {
    status: 'connected' | 'disconnected'
    type: string
    host: string | null
    port: number | null
    database: string | null
    version: string | null
  }
  kafka: {
    brokers: string[]
    configured: boolean
  }
  broker: {
    status: 'running' | 'stopped'
    url: string
    port: number | null
    version: string | null
    basePath: string
  }
  system: {
    version: string | null
    environment: string
    nodeVersion: string
    basePath: string
  }
  timestamp: string
}

const defaultOidc: OidcConfig = {
  enabled: false,
  provider: '',
  clientId: '',
  clientSecret: '',
  issuerUrl: '',
  redirectUri: '',
  scope: 'openid profile email',
  usernameClaim: 'preferred_username',
  emailClaim: 'email',
}

const tabs = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'tenants', label: 'Tenants', icon: Building2 },
  // "Environment" now renders the same SystemConfigPanel that was
  // previously at /orch/system-config — one source of truth for runtime
  // config with validation, history, project-scoped overrides, search.
  { id: 'env', label: 'Environment', icon: Variable },
  { id: 'retention', label: 'Retention', icon: Clock },
  // spec — column-level encryption manager (engine-aware)
  { id: 'encryption', label: 'Encryption', icon: Lock },
  { id: 'oidc', label: 'OIDC / SSO', icon: Lock },
  { id: 'system', label: 'System Info', icon: Server },
  { id: 'workers', label: 'Workers', icon: Cpu },
]

// System Status Component
function SystemStatusCard({ 
  title, 
  icon: Icon, 
  status, 
  statusColor,
  children 
}: { 
  title: string
  icon: any
  status?: string
  statusColor?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-[var(--t-panel)] rounded-none p-4 border border-[var(--t-border)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: THEME.text.muted }} />
          <span style={{ fontSize: 13 }} className="font-semibold text-[var(--t-text)]">{title}</span>
        </div>
        {status && (
          <Tag size="sm" type={statusColor === 'green' ? 'green' : 'red'}>
            {status}
          </Tag>
        )}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-[var(--t-text-muted)]">{label}</span>
      <span className="text-sm font-medium text-[var(--t-text)]">{value}</span>
    </div>
  )
}

// Responsive Container Component
function ResponsiveGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ${className}`}>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('users')
  // Deep link: /settings?tab=tenants (used by the tenant switcher)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && tabs.some((x) => x.id === t)) setActiveTab(t)
  }, [])
  
  // Users state
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Env Vars State
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [newEnvKey, setNewEnvKey] = useState('')
  const [newEnvValue, setNewEnvValue] = useState('')
  const [showAddEnv, setShowAddEnv] = useState(false)
  const [hasEnvChanges, setHasEnvChanges] = useState(false)
  
  // OIDC State
  const [oidc, setOidc] = useState<OidcConfig>(defaultOidc)
  const [hasOidcChanges, setHasOidcChanges] = useState(false)

  // Fetch users
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await apiClient.get('/users')
      return (response as any).data || []
    },
  })

  // Fetch real system info — hits /api/system/info which reads from
  // DATABASE_URL, system_configs (broker URL, kafka bootstrap) and
  // probes the broker's /health. No more hardcoded "localhost:5447"
  // pretending to be the production cluster.
  const { data: systemStatus } = useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: async () => {
      const r = await fetch('/orch/api/system/info')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    refetchInterval: 30000,
  })

  // Filter users
  const filteredUsers = useMemo(() => {
    return (users || []).filter((user: User) => {
      const matchesSearch = 
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFilter = 
        activeFilter === 'all' || 
        (activeFilter === 'active' && user.isActive) ||
        (activeFilter === 'inactive' && !user.isActive)
      return matchesSearch && matchesFilter
    })
  }, [users, searchQuery, activeFilter])

  // Stats
  const stats = useMemo(() => {
    const total = users?.length || 0
    const active = users?.filter((u: User) => u.isActive).length || 0
    const admin = users?.filter((u: User) => u.roles.includes('admin')).length || 0
    return { total, active, admin }
  }, [users])

  // User Mutations
  const createMutation = useMutation({
    mutationFn: async (data: Partial<User>) => {
      const response = await apiClient.post('/users', data)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created successfully')
      setIsCreateOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create user')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<User> }) => {
      const response = await apiClient.put(`/users/${id}`, data)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated successfully')
      setEditingUser(null)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update user')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/users/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete user')
    },
  })

  // Env Handlers
  const addEnvVar = () => {
    if (!newEnvKey.trim()) return
    setEnvVars([...envVars, { 
      key: newEnvKey.trim(), 
      value: newEnvValue, 
      description: '',
      isSecret: newEnvKey.toLowerCase().includes('secret') || newEnvKey.toLowerCase().includes('password')
    }])
    setNewEnvKey('')
    setNewEnvValue('')
    setShowAddEnv(false)
    setHasEnvChanges(true)
  }

  const updateEnvVar = (index: number, field: keyof EnvVar, value: string | boolean) => {
    const updated = [...envVars]
    updated[index] = { ...updated[index], [field]: value }
    setEnvVars(updated)
    setHasEnvChanges(true)
  }

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
    setHasEnvChanges(true)
  }

  // Save handlers
  const handleSaveEnv = () => {
    toast.success('Environment variables saved')
    setHasEnvChanges(false)
  }

  const handleSaveOidc = () => {
    toast.success('OIDC configuration saved')
    setHasOidcChanges(false)
  }

  const filterTabs = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'inactive', label: 'Inactive' },
  ]

  return (
    <div style={{ fontFamily: FONT }} className="w-full max-w-full">
      {/* Header */}
      <div className="mb-5">
        <h1 style={{ fontSize: 20 }} className="font-normal text-[var(--t-text)]">System Settings</h1>
        <p style={{ fontSize: 12 }} className="text-[var(--t-text-muted)] mt-1">
          Manage users, environment variables, OIDC, and system configuration
        </p>
      </div>

      {/* Tabs - Responsive */}
      <div className="mb-4 min-w-0">
        <Tabs
          selectedIndex={Math.max(0, tabs.findIndex((t) => t.id === activeTab))}
          onChange={({ selectedIndex }) => setActiveTab(tabs[selectedIndex].id)}
        >
          <TabList aria-label="System settings sections" contained={false}>
            {tabs.map(tab => (
              <Tab key={tab.id} renderIcon={tab.icon}>
                {tab.label}
              </Tab>
            ))}
          </TabList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            {/* Top row: Add User button */}
            <div className="flex items-center justify-end mb-4">
              <Button kind="primary" size="sm" onClick={() => setIsCreateOpen(true)} renderIcon={Plus}>
                Add User
              </Button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 mb-4">
              {filterTabs.map(tab => (
                <Button
                  key={tab.id}
                  kind={activeFilter === tab.id ? 'secondary' : 'ghost'}
                  size="sm"
                  isSelected={activeFilter === tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 max-w-md">
                <CdsSearch
                  id="settings-user-search"
                  size="md"
                  labelText="Search users"
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {isLoadingUsers ? (
              <div className="text-center py-10 text-[var(--t-text-muted)]" style={{ fontSize: 13 }}>
                Loading users...
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((user: User) => (
                  <div
                    key={user.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: THEME.panel,
                      border: `1px solid ${THEME.border}`,
                      borderRadius: 0,
                      transition: 'all 0.15s ease',
                    }}
                    className="hover:bg-[#e8e8e8] group"
                  >
                    {/* Avatar Icon Box */}
                    <UserIcon className="w-4 h-4 shrink-0" style={{ color: '#525252' }} />

                    {/* Main Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: THEME.text.primary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }} className="group-hover:text-[#0f62fe] transition-colors">
                          {user.firstName} {user.lastName}
                        </h3>
                        {user.roles.map(role => (
                          <Tag key={role} size="sm" type={ROLE_TAG_TYPES[role] || ROLE_TAG_TYPES.user}>
                            {ROLE_LABELS[role] || role}
                          </Tag>
                        ))}
                      </div>
                      <p style={{ fontSize: 12, color: '#525252' }}>
                        {user.username} · {user.email}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="hidden md:flex items-center gap-5">
                      {user.department && (
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>{user.department}</p>
                          <p style={{ fontSize: 12, color: '#525252' }}>Dept</p>
                        </div>
                      )}
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>{user.roles.length}</p>
                        <p style={{ fontSize: 12, color: '#525252' }}>Roles</p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <Tag size="sm" type={user.isActive ? 'green' : 'gray'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Tag>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        kind="ghost"
                        size="sm"
                        hasIconOnly
                        renderIcon={Edit2}
                        iconDescription="Edit user"
                        onClick={() => setEditingUser(user)}
                      />
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        hasIconOnly
                        renderIcon={Trash2}
                        iconDescription="Delete user"
                        onClick={async () => {
                          if (await confirmDialog({
                            title: 'Delete user?',
                            body: `Permanently remove ${user.username}.`,
                            variant: 'danger',
                          })) deleteMutation.mutate(user.id)
                        }}
                      />
                    </div>
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-[var(--t-text-muted)]" style={{ fontSize: 13 }}>
                    No users found
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Environment Tab — SystemConfigPanel embedded. The legacy
             env-vars form was replaced by the richer system_configs
             editor (search, categories, history, secret mask, seed,
             reload-cache). Old form is kept only as back-compat for
             the /api/env-config endpoint. */}
        {activeTab === 'env' && (
          <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-none p-4 md:p-5">
            <SystemConfigPanel embedded />
          </div>
        )}

        {/* Retention Tab — cleanup policy for audit/log/event tables */}
        {activeTab === 'retention' && (
          <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-none p-4 md:p-5">
            <RetentionPanel />
          </div>
        )}

        {/* Encryption Tab — spec column-level encryption manager.
            Engine-aware: pgcrypto on Postgres, TDE on Oracle. */}
        {activeTab === 'encryption' && (
          <div className="space-y-4">
            {/* App-level AES-GCM key manager (Data Repository column encryption). */}
            <EncryptionKeyPanel />
            <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-none p-4 md:p-5">
              <EncryptionPanel />
            </div>
          </div>
        )}

        {/* OIDC Tab */}
        {activeTab === 'oidc' && (
          <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-none p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-semibold text-[var(--t-text)]">OIDC / SSO Authentication</h2>
              {hasOidcChanges && (
                <Button kind="primary" size="sm" onClick={handleSaveOidc} renderIcon={Save}>
                  Save Changes
                </Button>
              )}
            </div>

            <div className={`
              p-4 rounded-none border mb-5
              ${oidc.enabled ? 'bg-[var(--t-panel-hover)] border-[#0f62fe]' : 'bg-[var(--t-bg)] border-[var(--t-border)]'}
            `}>
              <Checkbox
                id="oidc-enabled"
                checked={oidc.enabled}
                onChange={(e) => { setOidc({ ...oidc, enabled: e.target.checked }); setHasOidcChanges(true) }}
                labelText="Enable OIDC Authentication"
                helperText="Allow users to login via external identity provider"
              />
            </div>

            {oidc.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <TextInput
                    id="oidc-provider"
                    labelText="Provider Name"
                    value={oidc.provider}
                    onChange={(e) => { setOidc({ ...oidc, provider: e.target.value }); setHasOidcChanges(true) }}
                    placeholder="e.g., Keycloak"
                  />
                </div>
                <div>
                  <TextInput
                    id="oidc-clientId"
                    labelText="Client ID"
                    value={oidc.clientId}
                    onChange={(e) => { setOidc({ ...oidc, clientId: e.target.value }); setHasOidcChanges(true) }}
                    placeholder="your-client-id"
                  />
                </div>

                <div className="md:col-span-2">
                  <TextInput
                    id="oidc-clientSecret"
                    labelText="Client Secret" type="password"
                    value={oidc.clientSecret}
                    onChange={(e) => { setOidc({ ...oidc, clientSecret: e.target.value }); setHasOidcChanges(true) }}
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <TextInput
                    id="oidc-issuerUrl"
                    labelText="Issuer URL"
                    value={oidc.issuerUrl}
                    onChange={(e) => { setOidc({ ...oidc, issuerUrl: e.target.value }); setHasOidcChanges(true) }}
                    placeholder="https://auth.example.com"
                  />
                </div>
                <div>
                  <TextInput
                    id="oidc-redirectUri"
                    labelText="Redirect URI"
                    value={oidc.redirectUri}
                    onChange={(e) => { setOidc({ ...oidc, redirectUri: e.target.value }); setHasOidcChanges(true) }}
                    placeholder="https://app.com/callback"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Info Tab */}
        {activeTab === 'system' && (
          <div>
            <h2 style={{ fontSize: 14 }} className="font-semibold text-[var(--t-text)] mb-4">System Information</h2>
            
            {/* Detailed Status Cards */}
            <ResponsiveGrid>
              {/* Database — real host/port parsed from DATABASE_URL server-side */}
              <SystemStatusCard
                title="Database"
                icon={Database}
                status={systemStatus?.database.status === 'connected' ? 'Connected' : 'Disconnected'}
                statusColor={systemStatus?.database.status === 'connected' ? 'green' : 'red'}
              >
                <InfoRow label="Type" value={systemStatus?.database.type || 'PostgreSQL'} />
                <InfoRow label="Host" value={systemStatus?.database.host || '—'} />
                <InfoRow label="Port" value={systemStatus?.database.port ?? '—'} />
                <InfoRow label="Database" value={systemStatus?.database.database || '—'} />
                <InfoRow label="Version" value={systemStatus?.database.version || '—'} />
              </SystemStatusCard>

              {/* Kafka — brokers from system_configs, no fake topic/msg-rate */}
              <SystemStatusCard
                title="Message Queue (Kafka)"
                icon={MessageSquare}
                status={systemStatus?.kafka.configured ? 'Configured' : 'Not configured'}
                statusColor={systemStatus?.kafka.configured ? 'green' : 'red'}
              >
                <InfoRow
                  label="Brokers"
                  value={systemStatus?.kafka.brokers.join(', ') || '—'}
                />
                <InfoRow
                  label="Count"
                  value={systemStatus?.kafka.brokers.length ?? 0}
                />
                <p className="text-xs text-[var(--t-text-muted)] mt-2">
                  Topic and throughput stats are surfaced in the{' '}
                  <a href="/orch/monitor" className="text-[var(--t-accent)] hover:underline">System Monitor</a>.
                </p>
              </SystemStatusCard>

              {/* Orch Broker — real URL + version from /health */}
              <SystemStatusCard
                title="Orch Broker"
                icon={Globe}
                status={systemStatus?.broker.status === 'running' ? 'Running' : 'Stopped'}
                statusColor={systemStatus?.broker.status === 'running' ? 'green' : 'red'}
              >
                <InfoRow label="URL" value={systemStatus?.broker.url || '—'} />
                <InfoRow label="Port" value={systemStatus?.broker.port ?? '—'} />
                <InfoRow label="Version" value={systemStatus?.broker.version || '—'} />
                <InfoRow label="Base Path" value={systemStatus?.broker.basePath || '/orch'} />
              </SystemStatusCard>

              {/* Application — process-level values only; no invented uptime */}
              <SystemStatusCard
                title="Application"
                icon={Layers}
              >
                <InfoRow label="App Version" value={systemStatus?.system.version || '—'} />
                <InfoRow label="Environment" value={systemStatus?.system.environment || 'production'} />
                <InfoRow label="Node" value={systemStatus?.system.nodeVersion || '—'} />
                <InfoRow label="Base Path" value={systemStatus?.system.basePath || '/orch'} />
              </SystemStatusCard>
            </ResponsiveGrid>

            {/* Honest disclaimer — the previous tab invented uptime /
                 memory / CPU / topic-count numbers. Those need a real
                 metrics pipeline, which lives in System Monitor, not
                 here. */}
            <p className="text-xs text-[var(--t-text-muted)] mt-3">
              Workers, queue throughput, CPU and memory stats live in the{' '}
              <a href="/orch/monitor" className="text-[var(--t-accent)] hover:underline">System Monitor</a>{' '}
              tab. This page shows configuration only.
            </p>
          </div>
        )}

        {activeTab === 'tenants' && <TenantsPanel />}

        {/* Workers Tab */}
        {activeTab === 'workers' && (
          <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-none p-4 md:p-5">
            <WorkersTab />
          </div>
        )}
      </div>

      {/* User Modal */}
      {(isCreateOpen || editingUser) && (
        <UserModal
          user={editingUser}
          onClose={() => { setIsCreateOpen(false); setEditingUser(null) }}
          onSubmit={(data) => {
            if (editingUser) {
              updateMutation.mutate({ id: editingUser.id, data })
            } else {
              createMutation.mutate(data)
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

// User Modal Component
interface UserModalProps {
  user?: User | null
  onClose: () => void
  onSubmit: (data: any) => void
  isLoading: boolean
}

function UserModal({ user, onClose, onSubmit, isLoading }: UserModalProps) {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    department: user?.department || '',
    password: '',
    roles: user?.roles || ['user'],
    isActive: user?.isActive ?? true,
  })

  const formRef = useRef<HTMLFormElement>(null)
  const availableRoles = ['admin', 'user', 'viewer', 'operator']

  const toggleRole = (role: string) => {
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role]
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: any = { ...formData }
    if (!data.password && user) delete data.password
    onSubmit(data)
  }

  return (
    <Modal
      open
      size="sm"
      modalHeading={user ? 'Edit User' : 'Create New User'}
      primaryButtonText={isLoading ? 'Saving...' : (user ? 'Update' : 'Create')}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isLoading}
      onRequestClose={onClose}
      onRequestSubmit={() => formRef.current?.requestSubmit()}
    >
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <TextInput
              id="user-username"
              labelText="Username *"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
            <TextInput
              id="user-email"
              labelText="Email *"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <TextInput
              id="user-first-name"
              labelText="First Name"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            />
            <TextInput
              id="user-last-name"
              labelText="Last Name"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            />
          </div>

          <div className="mb-3">
            <TextInput
              id="user-department"
              labelText="Department"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            />
          </div>

          <div className="mb-4">
            <TextInput
              id="user-password"
              labelText={`Password ${user ? '(leave blank to keep current)' : '*'}`}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required={!user}
            />
          </div>

          <fieldset className="mb-4">
            <legend className="cds--label">Roles</legend>
            <div className="flex flex-wrap gap-x-4">
              {availableRoles.map((role) => (
                <Checkbox
                  key={role}
                  id={`user-role-${role}`}
                  labelText={ROLE_LABELS[role]}
                  checked={formData.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
              ))}
            </div>
          </fieldset>

          <Checkbox
            id="user-active"
            labelText="Active"
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          />
        </form>
    </Modal>
  )
}
