'use client'

import { useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectApi, apiRegistrationApi } from '@/lib/api'
import { Project, ApiRegistration } from '@/types'
import Link from 'next/link'
import { ImportOpenApiButton } from '@/components/api/ImportOpenApiButton'
import { FieldMappingsSection } from '@/components/project-rules/FieldMappingsSection'
import { AuditConfigsSection } from '@/components/project-rules/AuditConfigsSection'
import { ClientsSection } from '@/components/project-rules/ClientsSection'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  FolderKanban,
  Globe,
  Shield,
  Settings,
  Activity,
  RefreshCw,
  Loader2,
  ExternalLink,
  FileText,
  Code,
  SlidersHorizontal,
  Edit3,
  Eye,
  Workflow,
  MessageSquareText,
  Share2,
  Network,
  Tag,
  MonitorSmartphone,
  Smartphone,
  Building2,
  User,
  Mail,
  Palette,
  Image as ImageIcon,
  X,
  Copy,
  Check,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/common/ConfirmDialog'
import { SystemConfigPanel } from '@/components/settings/SystemConfigPanel'
import { Combobox } from '@/components/ui/combobox'
import { EnvAwareInput } from '@/components/common/EnvAwareInput'
import yaml from 'js-yaml'

// Swagger UI CSS
import 'swagger-ui-react/swagger-ui.css'

// Dynamic import for Swagger UI (client-only, heavy component)
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-secondary)', fontFamily: "'Prompt', sans-serif" }}>
      <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
      <p style={{ fontSize: 13 }}>Loading Swagger UI...</p>
    </div>
  ),
})

// ==================== CONSTANTS ====================

const FONT = "'Prompt', sans-serif"

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent-hover)',
}

const METHOD_COLORS: Record<string, string> = {
  GET: '#60A5FA',
  POST: '#10B981',
  PUT: '#F59E0B',
  DELETE: '#EF4444',
  PATCH: '#8B5CF6',
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: '#10B98118', color: '#34D399' },
  INACTIVE: { bg: '#5A617818', color: '#8B92A5' },
  DRAFT: { bg: '#F59E0B18', color: '#FBBF24' },
  DEPRECATED: { bg: '#EF444418', color: '#F87171' },
}

// Project page tabs — Field Mappings / Audit Configs / Clients are
// now features inside Message Format management (per admin feedback:
// "they belong under message format, not as project-level pages"),
// so they no longer appear here. The pages still exist at
// /orch/projects/{id}/{field-mappings,audit-configs,clients} for
// direct URL access if anyone has bookmarks.
type TabDef = { id: string; label: string; icon: any; href?: string }
const TABS: ReadonlyArray<TabDef> = [
  { id: 'apis',     label: 'APIs',        icon: Globe },
  { id: 'settings', label: 'Settings',    icon: Settings },
  { id: 'env',      label: 'Environment', icon: SlidersHorizontal },
  // 'Rules' folds Event Log Rules + Field Mappings + Audit Configs +
  // Clients into one tab — keeps the tab strip short while still
  // giving admins one stable home for project-level config primitives.
  { id: 'rules',    label: 'Rules',       icon: Shield },
  { id: 'openapi',  label: 'OpenAPI',     icon: Code },
] as const

type TabId = 'apis' | 'settings' | 'env' | 'rules' | 'openapi'

const AUTH_TYPE_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'JWT', label: 'JWT' },
  { value: 'API_KEY', label: 'API Key' },
  { value: 'OAUTH2', label: 'OAuth 2.0' },
  { value: 'BASIC', label: 'Basic Auth' },
]

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'DEPRECATED', label: 'Deprecated' },
]

// ==================== HELPER COMPONENTS ====================

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 500,
          color: THEME.text.secondary,
          marginBottom: 6,
          fontFamily: FONT,
        }}
      >
        {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
      </label>
      {children}
      {hint && (
        <p style={{ marginTop: 4, fontSize: 11, color: THEME.text.muted, fontFamily: FONT }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function InputField({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '8px 12px',
        backgroundColor: 'var(--t-input)',
        border: `1px solid ${THEME.border}`,
        borderRadius: 6,
        fontSize: 13,
        color: THEME.text.primary,
        fontFamily: FONT,
        outline: 'none',
        transition: 'border-color 0.15s',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
        boxSizing: 'border-box' as const,
      }}
      onFocus={(e) => (e.target.style.borderColor = THEME.accent)}
      onBlur={(e) => (e.target.style.borderColor = THEME.border)}
    />
  )
}

function TextareaField({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%',
        padding: '8px 12px',
        backgroundColor: 'var(--t-input)',
        border: `1px solid ${THEME.border}`,
        borderRadius: 6,
        fontSize: 13,
        color: THEME.text.primary,
        fontFamily: FONT,
        outline: 'none',
        resize: 'vertical' as const,
        transition: 'border-color 0.15s',
        boxSizing: 'border-box' as const,
      }}
      onFocus={(e) => (e.target.style.borderColor = THEME.accent)}
      onBlur={(e) => (e.target.style.borderColor = THEME.border)}
    />
  )
}

// Drop-in shim that points the local SelectField at the new
// Combobox. Same reason as the API detail page: drop the native
// <select>, get search + theme consistency for free without
// touching every call site.
function SelectField({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
}) {
  return <Combobox value={value} onChange={onChange} options={options} placeholder="Select…" />
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || { bg: '#5A617818', color: '#8B92A5' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
        fontFamily: FONT,
      }}
    >
      {status}
    </span>
  )
}

function MethodBadge({ method }: { method: string }) {
  const color = METHOD_COLORS[method] || '#64748B'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'monospace',
        backgroundColor: color + '18',
        color: color,
        minWidth: 52,
        letterSpacing: 0.5,
      }}
    >
      {method}
    </span>
  )
}

function SkeletonBlock({ height = 20, width = '100%' }: { height?: number; width?: string | number }) {
  return (
    <div
      style={{
        height,
        width,
        backgroundColor: THEME.borderLight,
        borderRadius: 8,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  )
}

// ==================== APIS TAB ====================

function ApiRow({
  api,
  projectId,
  isLast,
  indent,
  onDelete,
  deletingId,
}: {
  api: ApiRegistration
  projectId: string
  isLast: boolean
  indent?: boolean
  onDelete?: (api: ApiRegistration) => void
  deletingId?: string | null
}) {
  return (
    <Link
      key={api.id}
      href={`/projects/${projectId}/apis/${api.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: indent ? '10px 20px 10px 44px' : '14px 20px',
        borderBottom: isLast ? 'none' : `1px solid ${THEME.borderLight}`,
        textDecoration: 'none',
        transition: 'background-color 0.15s',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--t-panel-hover)'
        const arrow = e.currentTarget.querySelector('[data-arrow]') as HTMLElement
        if (arrow) arrow.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
        const arrow = e.currentTarget.querySelector('[data-arrow]') as HTMLElement
        if (arrow) arrow.style.opacity = '0'
      }}
    >
      <MethodBadge method={api.method} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: THEME.text.primary,
            fontFamily: FONT,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {api.name}
        </div>
        {!indent && (
          <div
            style={{
              fontSize: 12,
              color: THEME.text.muted,
              fontFamily: 'monospace',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {api.endpoint}
          </div>
        )}
        {!indent && api.description && (
          <div
            style={{
              fontSize: 11,
              color: THEME.text.secondary,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {api.description}
          </div>
        )}
      </div>

      {api._count?.apiLogs != null && api._count.apiLogs > 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: THEME.text.muted,
            fontFamily: FONT,
          }}
          title={`${api._count.apiLogs} requests`}
        >
          <Activity size={12} />
          {api._count.apiLogs.toLocaleString()}
        </span>
      )}

      {api._count?.messageFormats != null && api._count.messageFormats > 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: THEME.text.muted,
            fontFamily: FONT,
          }}
        >
          <MessageSquareText size={12} />
          {api._count.messageFormats}
        </span>
      )}

      <StatusBadge status={api.status} />

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            // The whole row is wrapped in a <Link>; without these
            // the click navigates to the detail page before our
            // confirm dialog opens.
            e.preventDefault()
            e.stopPropagation()
            onDelete(api)
          }}
          disabled={deletingId === api.id}
          title="Delete API"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: THEME.text.muted,
            cursor: deletingId === api.id ? 'not-allowed' : 'pointer',
            opacity: deletingId === api.id ? 0.5 : 0.6,
            transition: 'background-color 0.15s, color 0.15s, opacity 0.15s',
          }}
          onMouseEnter={(e) => {
            if (deletingId === api.id) return
            e.currentTarget.style.backgroundColor = '#EF444418'
            e.currentTarget.style.color = '#F87171'
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = THEME.text.muted
            e.currentTarget.style.opacity = deletingId === api.id ? '0.5' : '0.6'
          }}
        >
          {deletingId === api.id
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      )}

      <ExternalLink
        data-arrow
        className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{
          color: THEME.text.muted,
          opacity: 0,
          transition: 'opacity 0.15s',
        }}
      />
    </Link>
  )
}

function ApisTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
  const { data: apisData, isLoading } = useQuery({
    queryKey: ['project-apis', projectId],
    queryFn: () => apiRegistrationApi.list({ projectId, limit: 100 } as any),
  })

  const apis: ApiRegistration[] = apisData?.data || []

  // Inline-delete from the row, replacing the in-detail Delete API
  // button. Lets admins clean up duplicates without opening each one.
  const deleteApi = useMutation({
    mutationFn: (id: string) => apiRegistrationApi.delete(id),
    onSuccess: () => {
      toast.success('API deleted')
      queryClient.invalidateQueries({ queryKey: ['project-apis', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  })

  const handleDeleteApi = async (api: ApiRegistration) => {
    const ok = await confirmDialog({
      title: `Delete API "${api.name}"?`,
      body: `${api.method} ${api.endpoint}\n\nAPI logs survive but the registration, message formats, and bindings are gone. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete API',
    })
    if (ok) deleteApi.mutate(api.id)
  }

  // Group: shared endpoints together, dedicated APIs standalone
  const { sharedGroups, dedicatedApis, duplicateEndpoints } = useMemo(() => {
    const shared: ApiRegistration[] = []
    const dedicated: ApiRegistration[] = []
    for (const api of apis) {
      if ((api as any).routeType === 'SHARED_ENDPOINT') {
        shared.push(api)
      } else {
        dedicated.push(api)
      }
    }
    // Group shared by endpoint
    const groups = new Map<string, ApiRegistration[]>()
    for (const api of shared) {
      const key = `${api.method}:${api.endpoint}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(api)
    }
    // Detect dedicated APIs with duplicate endpoints
    const endpointCount = new Map<string, number>()
    for (const api of dedicated) {
      const key = `${api.method}:${api.endpoint}`
      endpointCount.set(key, (endpointCount.get(key) || 0) + 1)
    }
    const dupes = new Map<string, number>()
    for (const [key, count] of endpointCount) {
      if (count > 1) dupes.set(key, count)
    }
    return { sharedGroups: groups, dedicatedApis: dedicated, duplicateEndpoints: dupes }
  }, [apis])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 13, color: THEME.text.secondary, fontFamily: FONT }}>
          {apis.length} API{apis.length !== 1 ? 's' : ''} registered
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <ImportOpenApiButton projectId={projectId} />
          <Link
            href={`/projects/${projectId}/apis/new`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: THEME.accent,
              color: '#FFFFFF',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              fontFamily: FONT,
              textDecoration: 'none',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = THEME.accentHover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = THEME.accent)}
          >
            <Plus size={14} />
            Add API
          </Link>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height={64} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && apis.length === 0 && (
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            backgroundColor: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 12,
          }}
        >
          <Globe size={40} style={{ color: THEME.text.muted, margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 500, color: THEME.text.primary, fontFamily: FONT }}>
            No APIs yet
          </p>
          <p style={{ fontSize: 12, color: THEME.text.muted, marginTop: 4, fontFamily: FONT }}>
            Add your first API to this project
          </p>
        </div>
      )}

      {/* Shared Endpoint Groups */}
      {!isLoading && sharedGroups.size > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from(sharedGroups.entries()).map(([key, groupApis]) => {
            const [method, endpoint] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)]
            const totalFormats = groupApis.reduce((sum, a) => sum + (a._count?.messageFormats || 0), 0)
            return (
              <div
                key={key}
                style={{
                  backgroundColor: THEME.panel,
                  border: `1px solid #3B82F625`,
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {/* Group header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 20px',
                    borderBottom: `1px solid ${THEME.borderLight}`,
                    background: 'linear-gradient(135deg, #3B82F608, transparent)',
                  }}
                >
                  <Network size={15} style={{ color: '#60A5FA', flexShrink: 0 }} />
                  <MethodBadge method={method} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: THEME.text.muted,
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {endpoint}
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#60A5FA',
                      backgroundColor: '#3B82F615',
                      borderRadius: 6,
                      fontFamily: FONT,
                    }}
                  >
                    <Share2 size={11} />
                    Shared &middot; {groupApis.length} APIs
                  </span>
                  {totalFormats > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        color: THEME.text.muted,
                        fontFamily: FONT,
                      }}
                    >
                      <MessageSquareText size={12} />
                      {totalFormats}
                    </span>
                  )}
                </div>
                {/* Group items */}
                {groupApis.map((api, index) => (
                  <ApiRow
                    key={api.id}
                    api={api}
                    projectId={projectId}
                    isLast={index === groupApis.length - 1}
                    indent
                    onDelete={handleDeleteApi}
                    deletingId={deleteApi.isPending ? (deleteApi.variables as string | undefined) ?? null : null}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Dedicated API List — grouped by duplicate endpoints */}
      {!isLoading && dedicatedApis.length > 0 && (() => {
        // Separate into duplicate-endpoint groups and unique APIs
        const dupeGroups = new Map<string, ApiRegistration[]>()
        const uniqueApis: ApiRegistration[] = []
        for (const api of dedicatedApis) {
          const key = `${api.method}:${api.endpoint}`
          if (duplicateEndpoints.has(key)) {
            if (!dupeGroups.has(key)) dupeGroups.set(key, [])
            dupeGroups.get(key)!.push(api)
          } else {
            uniqueApis.push(api)
          }
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Duplicate endpoint groups with consolidation hint */}
            {Array.from(dupeGroups.entries()).map(([key, groupApis]) => {
              const [method, endpoint] = [key.split(':')[0], key.slice(key.indexOf(':') + 1)]
              return (
                <div
                  key={key}
                  style={{
                    backgroundColor: THEME.panel,
                    border: `1px solid #F59E0B25`,
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  {/* Duplicate group header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 20px',
                      borderBottom: `1px solid ${THEME.borderLight}`,
                      background: 'linear-gradient(135deg, #F59E0B08, transparent)',
                    }}
                  >
                    <MethodBadge method={method} />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: THEME.text.muted,
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {endpoint}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 500,
                        color: '#F59E0B',
                        backgroundColor: '#F59E0B15',
                        borderRadius: 6,
                        fontFamily: FONT,
                      }}
                    >
                      {groupApis.length} APIs share same URL
                    </span>
                  </div>
                  {groupApis.map((api, index) => (
                    <ApiRow
                      key={api.id}
                      api={api}
                      projectId={projectId}
                      isLast={index === groupApis.length - 1}
                      indent
                    />
                  ))}
                </div>
              )
            })}
            {/* Unique APIs */}
            {uniqueApis.length > 0 && (
              <div
                style={{
                  backgroundColor: THEME.panel,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {uniqueApis.map((api, index) => (
                  <ApiRow
                    key={api.id}
                    api={api}
                    projectId={projectId}
                    isLast={index === uniqueApis.length - 1}
                    onDelete={handleDeleteApi}
                    deletingId={deleteApi.isPending ? (deleteApi.variables as string | undefined) ?? null : null}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ==================== SETTINGS TAB ====================

function SettingsTab({ project }: { project: Project }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Pull every project once so the Project Group / Agency comboboxes
  // can suggest values that other projects already use. New entries
  // simply free-type and submit — the next project sees them too.
  const { data: allProjectsData } = useQuery({
    queryKey: ['projects', 'all-for-suggestions'],
    queryFn: () => projectApi.list({ limit: 500 }),
  })
  const allProjects: Project[] = (allProjectsData as any)?.data ?? []
  const projectGroupOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of allProjects) if (p.projectGroup) set.add(p.projectGroup)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th')).map(v => ({ value: v, label: v }))
  }, [allProjects])
  const agencyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of allProjects) if (p.agency) set.add(p.agency)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th')).map(v => ({ value: v, label: v }))
  }, [allProjects])

  const [form, setForm] = useState({
    name: project.name || '',
    slug: project.slug || '',
    description: project.description || '',
    image: project.image || '',
    themeColor: project.themeColor || '#60A5FA',
    baseUrl: project.baseUrl || '',
    proxyTargetUrl: project.proxyTargetUrl || '',
    authType: project.authType || 'NONE',
    apiKey: project.apiKey || '',
    apiKeyHeader: project.apiKeyHeader || '',
    projectGroup: project.projectGroup || '',
    agency: project.agency || '',
    tags: (project.tags || []).join(', '),
    owner: project.owner || '',
    contactEmail: project.contactEmail || '',
    status: project.status || 'ACTIVE',
  })

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const updateMutation = useMutation({
    mutationFn: (data: any) => projectApi.update(project.id, data),
    onSuccess: () => {
      toast.success('Project updated')
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => projectApi.delete(project.id),
    onSuccess: () => {
      toast.success('Project deleted')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      router.push('/projects')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSave = () => {
    const tagsArray = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    updateMutation.mutate({
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      image: form.image || undefined,
      themeColor: form.themeColor || undefined,
      baseUrl: form.baseUrl,
      proxyTargetUrl: form.proxyTargetUrl ? form.proxyTargetUrl : null,
      authType: form.authType,
      apiKey: form.authType === 'API_KEY' ? form.apiKey : undefined,
      apiKeyHeader: form.authType === 'API_KEY' ? form.apiKeyHeader : undefined,
      projectGroup: form.projectGroup || undefined,
      agency: form.agency || undefined,
      tags: tagsArray.length > 0 ? tagsArray : undefined,
      owner: form.owner || undefined,
      contactEmail: form.contactEmail || undefined,
      status: form.status,
    })
  }

  const handleDelete = async () => {
    if (await confirmDialog({
      title: 'Delete project?',
      body: 'This action cannot be undone — all APIs, formats and audit history will be removed.',
      variant: 'danger',
    })) {
      deleteMutation.mutate()
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--t-input)',
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    fontSize: 13,
    color: THEME.text.primary,
    fontFamily: FONT,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Basic Info */}
      <div
        style={{
          backgroundColor: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: THEME.text.primary,
            marginBottom: 20,
            fontFamily: FONT,
          }}
        >
          Basic Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label="Name" required>
            <InputField
              value={form.name}
              onChange={(v) => updateField('name', v)}
              placeholder="Project name"
            />
          </FormField>
          <FormField label="Slug" required>
            <InputField
              value={form.slug}
              onChange={(v) => updateField('slug', v)}
              placeholder="project-slug"
            />
          </FormField>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Description">
              <TextareaField
                value={form.description}
                onChange={(v) => updateField('description', v)}
                placeholder="Project description..."
                rows={3}
              />
            </FormField>
          </div>
          <FormField label="Image URL" hint="URL to project logo or icon">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ImageIcon size={14} style={{ color: THEME.text.muted, flexShrink: 0 }} />
              <InputField
                value={form.image}
                onChange={(v) => updateField('image', v)}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </FormField>
          <FormField label="Theme Color">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={form.themeColor}
                onChange={(e) => updateField('themeColor', e.target.value)}
                style={{
                  width: 32,
                  height: 32,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              />
              <InputField
                value={form.themeColor}
                onChange={(v) => updateField('themeColor', v)}
                placeholder="#60A5FA"
              />
            </div>
          </FormField>
        </div>
      </div>

      {/* Connection */}
      <div
        style={{
          backgroundColor: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: THEME.text.primary,
            marginBottom: 20,
            fontFamily: FONT,
          }}
        >
          Connection & Authentication
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Base URL" required hint="Public-facing URL — shown in UI, OpenAPI specs, and frontend integrations. Type ${env. to pick a key from this project's Environment tab.">
              <EnvAwareInput
                value={form.baseUrl}
                onChange={(v) => updateField('baseUrl', v)}
                placeholder="https://api.example.com/v1"
                projectId={project.id}
              />
            </FormField>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField
              label="Proxy Target URL"
              hint="Internal backend URL the broker forwards Level 2 requests to (e.g. cluster service DNS). Leave blank to fall back to Base URL. Type ${env. for autocomplete."
            >
              <EnvAwareInput
                value={form.proxyTargetUrl}
                onChange={(v) => updateField('proxyTargetUrl', v)}
                placeholder="http://my-svc.namespace.svc.cluster.local:8080/path  or  ${env.backendUrl}"
                projectId={project.id}
              />
            </FormField>
          </div>
          <FormField label="Auth Type">
            <SelectField
              value={form.authType}
              onChange={(v) => updateField('authType', v)}
              options={AUTH_TYPE_OPTIONS}
            />
          </FormField>
          <FormField label="Status">
            <SelectField
              value={form.status}
              onChange={(v) => updateField('status', v)}
              options={STATUS_OPTIONS}
            />
          </FormField>
          {form.authType === 'API_KEY' && (
            <>
              <FormField label="API Key">
                <InputField
                  value={form.apiKey}
                  onChange={(v) => updateField('apiKey', v)}
                  placeholder="Your API key"
                  type="password"
                />
              </FormField>
              <FormField label="API Key Header" hint="Header name for the API key">
                <InputField
                  value={form.apiKeyHeader}
                  onChange={(v) => updateField('apiKeyHeader', v)}
                  placeholder="X-API-Key"
                />
              </FormField>
            </>
          )}
        </div>
      </div>

      {/* Organization */}
      <div
        style={{
          backgroundColor: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: THEME.text.primary,
            marginBottom: 20,
            fontFamily: FONT,
          }}
        >
          Organization
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label="Project Group">
            <Combobox
              options={projectGroupOptions}
              value={form.projectGroup}
              onChange={(v) => updateField('projectGroup', v)}
              placeholder="Select or type a group"
              allowFreeText
            />
          </FormField>
          <FormField label="Agency">
            <Combobox
              options={agencyOptions}
              value={form.agency}
              onChange={(v) => updateField('agency', v)}
              placeholder="Select or type an agency"
              allowFreeText
            />
          </FormField>
          <FormField label="Tags" hint="Comma-separated list of tags">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag size={14} style={{ color: THEME.text.muted, flexShrink: 0 }} />
              <InputField
                value={form.tags}
                onChange={(v) => updateField('tags', v)}
                placeholder="api, backend, internal"
              />
            </div>
          </FormField>
          <FormField label="Owner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={14} style={{ color: THEME.text.muted, flexShrink: 0 }} />
              <InputField
                value={form.owner}
                onChange={(v) => updateField('owner', v)}
                placeholder="Owner name"
              />
            </div>
          </FormField>
          <FormField label="Contact Email">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={14} style={{ color: THEME.text.muted, flexShrink: 0 }} />
              <InputField
                value={form.contactEmail}
                onChange={(v) => updateField('contactEmail', v)}
                placeholder="contact@example.com"
                type="email"
              />
            </div>
          </FormField>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: '#EF444418',
            color: '#F87171',
            border: '1px solid #EF444430',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: FONT,
            cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: deleteMutation.isPending ? 0.5 : 1,
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!deleteMutation.isPending) e.currentTarget.style.backgroundColor = '#EF444425'
          }}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#EF444418')}
        >
          {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Delete Project
        </button>

        <button
          onClick={handleSave}
          disabled={updateMutation.isPending || !form.name || !form.slug || !form.baseUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 20px',
            backgroundColor: THEME.accent,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: FONT,
            cursor:
              updateMutation.isPending || !form.name || !form.slug || !form.baseUrl
                ? 'not-allowed'
                : 'pointer',
            opacity: updateMutation.isPending || !form.name || !form.slug || !form.baseUrl ? 0.5 : 1,
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!updateMutation.isPending) e.currentTarget.style.backgroundColor = THEME.accentHover
          }}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = THEME.accent)}
        >
          {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes
        </button>
      </div>
    </div>
  )
}

// ==================== ENVIRONMENT TAB ====================
//
// Per-project environment / config values. Reuses the global
// SystemConfigPanel — same UI, but scoped to the project so reads
// and writes go through ?projectId=<id>. Same conventions: keys
// support secret masking + history audit.

function EnvTab({ project }: { project: Project }) {
  return (
    <div>
      <SystemConfigPanel embedded projectScope={{ id: project.id, name: project.name }} />
    </div>
  )
}

// ==================== EVENT LOG RULES TAB ====================
//
// Each rule mirrors matching traffic into event_logs with a
// configurable capture level. Same body / header AND-rules as
// MessageFormat so admins reuse the same mental model.

interface EventPatternRow {
  id: string
  projectId: string | null
  name: string
  description: string | null
  pathPattern: string
  methodMatch: string
  bodyMatch: { source: 'BODY' | 'HEADER'; field: string; value: string }[] | null
  capture: 'SUMMARY' | 'FULL_BODY' | 'NONE'
  level: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// Form-side shape: never-null bodyMatch + description so the form
// inputs don't have to keep ??-coalescing every read. Translated
// back to the row shape (with nulls) on submit.
type DraftPattern = {
  name: string
  description: string
  pathPattern: string
  methodMatch: string
  bodyMatch: { source: 'BODY' | 'HEADER'; field: string; value: string }[]
  capture: 'SUMMARY' | 'FULL_BODY' | 'NONE'
  level: string
  enabled: boolean
}

const EMPTY_PATTERN: DraftPattern = {
  name: '',
  description: '',
  pathPattern: '',
  methodMatch: 'ANY',
  bodyMatch: [],
  capture: 'SUMMARY',
  level: 'info',
  enabled: true,
}

function EventLogTab({ project }: { project: Project }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<DraftPattern>(EMPTY_PATTERN)

  const { data, isLoading } = useQuery({
    queryKey: ['event-log-patterns', project.id],
    queryFn: async () => {
      const r = await fetch(`/orch/api/projects/${project.id}/event-log-patterns`)
      if (!r.ok) throw new Error(await r.text())
      return r.json() as Promise<{ data: EventPatternRow[] }>
    },
  })
  const rows = data?.data ?? []

  const createMut = useMutation({
    mutationFn: async (body: typeof EMPTY_PATTERN) => {
      const r = await fetch(`/orch/api/projects/${project.id}/event-log-patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    onSuccess: () => {
      toast.success('Rule added')
      qc.invalidateQueries({ queryKey: ['event-log-patterns', project.id] })
      setEditing(null)
      setDraft(EMPTY_PATTERN)
    },
    onError: (e: Error) => toast.error(`Add failed: ${e.message}`),
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<EventPatternRow> }) => {
      const r = await fetch(`/orch/api/projects/${project.id}/event-log-patterns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-log-patterns', project.id] })
      setEditing(null)
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/orch/api/projects/${project.id}/event-log-patterns/${id}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error(await r.text())
      return r.json()
    },
    onSuccess: () => {
      toast.success('Rule deleted')
      qc.invalidateQueries({ queryKey: ['event-log-patterns', project.id] })
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  })

  const startEdit = (row: EventPatternRow) => {
    setEditing(row.id)
    setDraft({
      name: row.name,
      description: row.description ?? '',
      pathPattern: row.pathPattern,
      methodMatch: row.methodMatch,
      bodyMatch: row.bodyMatch ?? [],
      capture: row.capture,
      level: row.level,
      enabled: row.enabled,
    })
  }

  const saveDraft = () => {
    if (!draft.name.trim() || !draft.pathPattern.trim()) {
      toast.error('Name and Path Pattern are required')
      return
    }
    const payload = { ...draft, bodyMatch: (draft.bodyMatch ?? []).filter(r => r.field.trim() && r.value.trim()) }
    if (editing === 'new') createMut.mutate(payload as any)
    else if (editing) updateMut.mutate({ id: editing, body: payload as any })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          onClick={() => { setEditing('new'); setDraft(EMPTY_PATTERN) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', backgroundColor: THEME.accent, color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add Rule
        </button>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => { setEditing(null); setDraft(EMPTY_PATTERN) }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl"
            style={{ backgroundColor: THEME.panel, border: `1px solid ${THEME.border}` }}
          >
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${THEME.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: THEME.text.primary, margin: 0 }}>
                {editing === 'new' ? 'Add Event Log Rule' : 'Edit Event Log Rule'}
              </h2>
              <button
                onClick={() => { setEditing(null); setDraft(EMPTY_PATTERN) }}
                style={{ padding: 4, border: 'none', background: 'transparent', color: THEME.text.muted, cursor: 'pointer' }}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <EventPatternForm
              draft={draft}
              setDraft={setDraft}
              onSave={saveDraft}
              onCancel={() => { setEditing(null); setDraft(EMPTY_PATTERN) }}
              saving={createMut.isPending || updateMut.isPending}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <SkeletonBlock height={64} />
      ) : rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', backgroundColor: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 12, color: THEME.text.muted }}>
          No rules yet. Add one to start capturing matching traffic.
        </div>
      ) : (
        <div style={{ backgroundColor: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 110px 110px auto',
                gap: 12,
                padding: '12px 16px',
                borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${THEME.borderLight}`,
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>{r.name}</div>
                <div style={{ fontSize: 11, color: THEME.text.muted, fontFamily: 'monospace', marginTop: 2 }}>
                  {r.methodMatch} {r.pathPattern}
                </div>
                {r.bodyMatch && r.bodyMatch.length > 0 && (
                  <div style={{ fontSize: 10, color: THEME.text.muted, marginTop: 2 }}>
                    + {r.bodyMatch.length} body rule{r.bodyMatch.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: r.capture === 'FULL_BODY' ? '#3B82F618' : r.capture === 'NONE' ? '#6B728018' : '#10B98118', color: r.capture === 'FULL_BODY' ? '#60A5FA' : r.capture === 'NONE' ? THEME.text.muted : '#34D399', textAlign: 'center' }}>
                {r.capture}
              </span>
              <span style={{ fontSize: 11, color: THEME.text.muted, textAlign: 'center' }}>level: {r.level}</span>
              <button
                onClick={() => updateMut.mutate({ id: r.id, body: { enabled: !r.enabled } })}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 6,
                  border: `1px solid ${r.enabled ? '#10B98140' : THEME.border}`,
                  background: r.enabled ? '#10B98115' : 'transparent',
                  color: r.enabled ? '#34D399' : THEME.text.muted,
                  cursor: 'pointer',
                }}
              >
                {r.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => startEdit(r)} style={{ padding: 6, border: 'none', background: 'transparent', color: THEME.text.muted, cursor: 'pointer' }} title="Edit">
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Delete rule "${r.name}"?`,
                      body: `${r.methodMatch} ${r.pathPattern}\n\nExisting event_logs rows are kept; only the rule itself is removed.`,
                      variant: 'danger',
                      confirmLabel: 'Delete',
                    })
                    if (ok) deleteMut.mutate(r.id)
                  }}
                  style={{ padding: 6, border: 'none', background: 'transparent', color: THEME.text.muted, cursor: 'pointer' }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EventPatternForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: DraftPattern
  setDraft: React.Dispatch<React.SetStateAction<DraftPattern>>
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const update = (k: keyof DraftPattern, v: any) => setDraft(prev => ({ ...prev, [k]: v }))
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Name" required>
          <InputField value={draft.name} onChange={(v) => update('name', v)} placeholder="e.g. Critical actions" />
        </FormField>
        <FormField label="Path Pattern" required hint="e.g. /my-api/microflow/* or /payments/:id">
          <InputField value={draft.pathPattern} onChange={(v) => update('pathPattern', v)} placeholder="/my-api/*" />
        </FormField>
        <FormField label="Method">
          <SelectField
            value={draft.methodMatch}
            onChange={(v) => update('methodMatch', v)}
            options={[
              { value: 'ANY', label: 'Any' },
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'PATCH', label: 'PATCH' },
              { value: 'DELETE', label: 'DELETE' },
            ]}
          />
        </FormField>
        <FormField label="Capture" hint="SUMMARY: method/path/status/duration · FULL_BODY: + bodies · NONE: pattern-match-only">
          <SelectField
            value={draft.capture}
            onChange={(v) => update('capture', v)}
            options={[
              { value: 'SUMMARY', label: 'Summary' },
              { value: 'FULL_BODY', label: 'Full body' },
              { value: 'NONE', label: 'None' },
            ]}
          />
        </FormField>
        <FormField label="Level">
          <SelectField
            value={draft.level}
            onChange={(v) => update('level', v)}
            options={[
              { value: 'info', label: 'info' },
              { value: 'warn', label: 'warn' },
              { value: 'error', label: 'error' },
              { value: 'debug', label: 'debug' },
            ]}
          />
        </FormField>
        <FormField label="Enabled">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.enabled} onChange={(e) => update('enabled', e.target.checked)} />
            <span style={{ fontSize: 13, color: THEME.text.secondary }}>{draft.enabled ? 'On' : 'Off'}</span>
          </label>
        </FormField>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Description">
            <InputField value={draft.description ?? ''} onChange={(v) => update('description', v)} placeholder="optional" />
          </FormField>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Body / Header AND-rules" hint="Optional. Pattern matches only when every rule below also holds. Same shape as MessageFormat matchRules.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {draft.bodyMatch.map((rule, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr auto', gap: 6 }}>
                  <SelectField
                    value={rule.source}
                    onChange={(v) => {
                      const next = [...draft.bodyMatch]
                      next[i] = { ...next[i], source: v as 'BODY' | 'HEADER' }
                      update('bodyMatch', next)
                    }}
                    options={[
                      { value: 'BODY', label: 'Body' },
                      { value: 'HEADER', label: 'Header' },
                    ]}
                  />
                  <InputField
                    value={rule.field}
                    onChange={(v) => {
                      const next = [...draft.bodyMatch]
                      next[i] = { ...next[i], field: v }
                      update('bodyMatch', next)
                    }}
                    placeholder="$.flowName or X-Header"
                  />
                  <InputField
                    value={rule.value}
                    onChange={(v) => {
                      const next = [...draft.bodyMatch]
                      next[i] = { ...next[i], value: v }
                      update('bodyMatch', next)
                    }}
                    placeholder="expected value"
                  />
                  <button
                    onClick={() => update('bodyMatch', draft.bodyMatch.filter((_, j) => j !== i))}
                    style={{ padding: 6, background: 'transparent', border: 'none', color: THEME.text.muted, cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => update('bodyMatch', [...draft.bodyMatch, { source: 'BODY' as const, field: '', value: '' }])}
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#3B82F618', color: '#60A5FA', border: 'none', cursor: 'pointer' }}
              >
                <Plus size={12} /> Add rule
              </button>
            </div>
          </FormField>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${THEME.border}`, background: 'transparent', color: THEME.text.secondary, cursor: 'pointer' }}>Cancel</button>
        <button onClick={onSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: THEME.accent, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save Rule'}
        </button>
      </div>
    </div>
  )
}

// ==================== RULES TAB ====================
// Folds the four config primitives (Event Log Rules, Field Mappings,
// Audit Configs, Clients) under one tab so the project page tab strip
// stays short. Each renders as its own section with an Add button —
// the inline Event Log editor + the dedicated library pages keep
// their existing modal-based editors.

function RulesTab({ project }: { project: Project }) {
  const [activeRule, setActiveRule] = useState<'eventlog' | 'fieldmap' | 'audit' | 'clients'>('eventlog')
  const sections = [
    { id: 'eventlog' as const, label: 'Access Log Rules', icon: Activity,  hint: 'Capture proxy traffic as access logs' },
    { id: 'fieldmap' as const, label: 'Field Mappings',  icon: Tag,       hint: '' },
    { id: 'audit'    as const, label: 'Audit Configs',   icon: Shield,    hint: '' },
    { id: 'clients'  as const, label: 'Clients',         icon: MonitorSmartphone, hint: 'Trusted client apps + IP whitelist' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-section selector — pills, not nested tabs, so it doesn't
          fight the main tab visually. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {sections.map((s) => {
          const Icon = s.icon
          const active = activeRule === s.id
          return (
            <button
              key={s.id}
              onClick={() => setActiveRule(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, fontSize: 13,
                fontWeight: active ? 600 : 400,
                border: `1px solid ${active ? THEME.accent : THEME.border}`,
                background: active ? `${THEME.accent}15` : THEME.panel,
                color: active ? THEME.accent : THEME.text.secondary,
                cursor: 'pointer',
              }}
            >
              <Icon size={14} /> {s.label}
            </button>
          )
        })}
      </div>
      <div>
        <p style={{ fontSize: 12, color: THEME.text.muted, marginBottom: 12 }}>
          {sections.find((s) => s.id === activeRule)?.hint}
        </p>
        {activeRule === 'eventlog' && <EventLogTab project={project} />}
        {activeRule === 'fieldmap' && <FieldMappingsSection projectId={project.id} />}
        {activeRule === 'audit'    && <AuditConfigsSection  projectId={project.id} />}
        {activeRule === 'clients'  && <ClientsSection       projectId={project.id} />}
      </div>
    </div>
  )
}

function RulesSubLink({ projectId, href, label, hint }: { projectId: string; href: string; label: string; hint: string }) {
  return (
    <div style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>
      <p style={{ fontSize: 13, color: THEME.text.secondary, marginBottom: 4 }}>{hint}</p>
      <p style={{ fontSize: 11, color: THEME.text.muted, marginBottom: 16 }}>The {label.toLowerCase()} library has its own dedicated page with Add modal + inline editing.</p>
      <Link
        href={`/projects/${projectId}/${href}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '10px 18px', backgroundColor: THEME.accent, color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none',
        }}
      >
        <ExternalLink size={14} /> Open {label}
      </Link>
    </div>
  )
}

// ==================== OPENAPI TAB ====================

function OpenApiTab({ project }: { project: Project }) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'preview' | 'yaml' | 'json'>('preview')

  const {
    data: rawResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['project-openapi', project.id],
    queryFn: () => projectApi.getOpenApiSpec(project.id),
  })

  // API returns { spec: {...}, updatedAt: "..." } — extract the actual spec
  const spec = rawResponse?.spec || rawResponse

  const regenerateMutation = useMutation({
    mutationFn: () => projectApi.regenerateOpenApiSpec(project.id),
    onSuccess: () => {
      toast.success('OpenAPI spec regenerated successfully')
      queryClient.invalidateQueries({ queryKey: ['project-openapi', project.id] })
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Convert spec to YAML string
  const specYaml = useMemo(() => {
    if (!spec) return ''
    try {
      return yaml.dump(spec, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false })
    } catch {
      return ''
    }
  }, [spec])

  const handleCopy = (format: 'yaml' | 'json' = 'yaml') => {
    if (spec) {
      const text = format === 'yaml' ? specYaml : JSON.stringify(spec, null, 2)
      navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`Copied ${format.toUpperCase()} to clipboard`)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = (format: 'yaml' | 'json' = 'yaml') => {
    if (spec) {
      const isYaml = format === 'yaml'
      const content = isYaml ? specYaml : JSON.stringify(spec, null, 2)
      const mimeType = isYaml ? 'application/x-yaml' : 'application/json'
      const ext = isYaml ? 'yaml' : 'json'
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.nameEn || project.name || 'openapi'}-spec.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Downloaded successfully')
    }
  }

  // Memoize spec for SwaggerUI to prevent re-renders
  const specForSwagger = useMemo(() => (spec ? { ...spec } : undefined), [spec])

  const hasSpec = spec && Object.keys(spec).length > 0

  // Count endpoints and methods
  const specStats = useMemo(() => {
    if (!spec?.paths) return { endpoints: 0, methods: {} as Record<string, number> }
    const methods: Record<string, number> = {}
    let endpoints = 0
    for (const path of Object.values(spec.paths) as any[]) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (path[method]) {
          methods[method.toUpperCase()] = (methods[method.toUpperCase()] || 0) + 1
          endpoints++
        }
      }
    }
    return { endpoints, methods }
  }, [spec])

  const btnBase = {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '6px 14px',
    backgroundColor: THEME.panel,
    color: THEME.text.secondary,
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: FONT,
    cursor: 'pointer' as const,
    transition: 'all 0.15s',
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SkeletonBlock height={40} />
        <SkeletonBlock height={300} />
      </div>
    )
  }

  if (!hasSpec) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: 'center',
          backgroundColor: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
        }}
      >
        <Code size={40} style={{ color: THEME.text.muted, margin: '0 auto 12px' }} />
        <p style={{ fontSize: 14, fontWeight: 500, color: THEME.text.primary, fontFamily: FONT }}>
          No OpenAPI Spec yet
        </p>
        <p
          style={{
            fontSize: 12,
            color: THEME.text.muted,
            marginTop: 4,
            marginBottom: 20,
            fontFamily: FONT,
          }}
        >
          Generate OpenAPI specification from registered APIs
        </p>
        <button
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 20px',
            backgroundColor: THEME.accent,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: FONT,
            cursor: regenerateMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: regenerateMutation.isPending ? 0.5 : 1,
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!regenerateMutation.isPending)
              e.currentTarget.style.backgroundColor = THEME.accentHover
          }}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = THEME.accent)}
        >
          {regenerateMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileText size={14} />
          )}
          Generate OpenAPI Spec
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header with stats */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Left: Info + Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, fontFamily: FONT }}>
            OpenAPI 3.0.3
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(specStats.methods).map(([method, count]) => (
              <span
                key={method}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 6,
                  backgroundColor: `${METHOD_COLORS[method] || '#8B92A5'}18`,
                  color: METHOD_COLORS[method] || 'var(--t-text-secondary)',
                  fontFamily: FONT,
                }}
              >
                {method} {count}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* View Toggle */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--t-input)',
              borderRadius: 8,
              border: `1px solid ${THEME.border}`,
              overflow: 'hidden',
            }}
          >
            {(['preview', 'yaml', 'json'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  ...btnBase,
                  border: 'none',
                  borderRadius: 0,
                  backgroundColor: viewMode === mode ? THEME.accent : 'transparent',
                  color: viewMode === mode ? '#fff' : THEME.text.muted,
                  padding: '5px 12px',
                }}
              >
                {mode === 'preview' && <Eye size={13} />}
                {mode === 'yaml' && <Code size={13} />}
                {mode === 'json' && <Code size={13} />}
                {mode === 'preview' ? 'Preview' : mode.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleCopy(viewMode === 'json' ? 'json' : 'yaml')}
            style={btnBase}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--t-panel-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = THEME.panel)}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={() => handleDownload(viewMode === 'json' ? 'json' : 'yaml')}
            style={btnBase}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--t-panel-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = THEME.panel)}
          >
            <Download size={13} />
          </button>

          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            style={{
              ...btnBase,
              cursor: regenerateMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: regenerateMutation.isPending ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!regenerateMutation.isPending) e.currentTarget.style.backgroundColor = 'var(--t-panel-hover)'
            }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = THEME.panel)}
          >
            {regenerateMutation.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Regenerate
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'preview' ? (
        /* Swagger UI Preview */
        <div
          className="swagger-ui-dark"
          style={{
            borderRadius: 12,
            overflow: 'hidden',
            border: `1px solid ${THEME.border}`,
          }}
        >
          <style>{`
            .swagger-ui-dark .swagger-ui {
              font-family: 'Prompt', sans-serif;
            }
            .swagger-ui-dark .swagger-ui .wrapper {
              padding: 20px;
              max-width: 100%;
            }
            /* Dark theme overrides */
            .swagger-ui-dark .swagger-ui,
            .swagger-ui-dark .swagger-ui .scheme-container {
              background: var(--t-input);
            }
            .swagger-ui-dark .swagger-ui .info .title,
            .swagger-ui-dark .swagger-ui .opblock-tag {
              color: var(--t-text);
              font-family: 'Prompt', sans-serif;
            }
            .swagger-ui-dark .swagger-ui .info .title small {
              background: #3B82F6;
            }
            .swagger-ui-dark .swagger-ui .info .description p,
            .swagger-ui-dark .swagger-ui .info .description,
            .swagger-ui-dark .swagger-ui .info li,
            .swagger-ui-dark .swagger-ui .info p,
            .swagger-ui-dark .swagger-ui .info table td,
            .swagger-ui-dark .swagger-ui .info table th {
              color: var(--t-text-secondary);
              font-family: 'Prompt', sans-serif;
            }
            .swagger-ui-dark .swagger-ui .info a {
              color: #60A5FA;
            }
            /* Operation blocks */
            .swagger-ui-dark .swagger-ui .opblock {
              border-radius: 8px;
              border-color: var(--t-border);
              background: var(--t-panel);
              margin-bottom: 8px;
            }
            .swagger-ui-dark .swagger-ui .opblock .opblock-summary {
              border-color: var(--t-border);
            }
            .swagger-ui-dark .swagger-ui .opblock .opblock-summary-method {
              border-radius: 6px;
              font-family: 'JetBrains Mono', monospace;
              font-size: 12px;
              font-weight: 700;
              min-width: 70px;
            }
            .swagger-ui-dark .swagger-ui .opblock .opblock-summary-path,
            .swagger-ui-dark .swagger-ui .opblock .opblock-summary-path__deprecated {
              color: var(--t-text);
              font-family: 'JetBrains Mono', monospace;
              font-size: 13px;
            }
            .swagger-ui-dark .swagger-ui .opblock .opblock-summary-description {
              color: var(--t-text-secondary);
              font-family: 'Prompt', sans-serif;
              font-size: 12px;
            }
            .swagger-ui-dark .swagger-ui .opblock .opblock-section-header {
              background: var(--t-panel-hover);
              border-color: var(--t-border);
            }
            .swagger-ui-dark .swagger-ui .opblock .opblock-section-header h4 {
              color: var(--t-text);
              font-family: 'Prompt', sans-serif;
            }
            .swagger-ui-dark .swagger-ui .opblock-body pre {
              background: var(--t-bg);
              color: var(--t-text);
              border-radius: 6px;
            }
            /* GET */
            .swagger-ui-dark .swagger-ui .opblock.opblock-get {
              border-color: #60A5FA30;
              background: #60A5FA08;
            }
            .swagger-ui-dark .swagger-ui .opblock.opblock-get .opblock-summary {
              border-color: #60A5FA20;
            }
            /* POST */
            .swagger-ui-dark .swagger-ui .opblock.opblock-post {
              border-color: #10B98130;
              background: #10B98108;
            }
            .swagger-ui-dark .swagger-ui .opblock.opblock-post .opblock-summary {
              border-color: #10B98120;
            }
            /* PUT */
            .swagger-ui-dark .swagger-ui .opblock.opblock-put {
              border-color: #F59E0B30;
              background: #F59E0B08;
            }
            .swagger-ui-dark .swagger-ui .opblock.opblock-put .opblock-summary {
              border-color: #F59E0B20;
            }
            /* DELETE */
            .swagger-ui-dark .swagger-ui .opblock.opblock-delete {
              border-color: #EF444430;
              background: #EF444408;
            }
            .swagger-ui-dark .swagger-ui .opblock.opblock-delete .opblock-summary {
              border-color: #EF444420;
            }
            /* PATCH */
            .swagger-ui-dark .swagger-ui .opblock.opblock-patch {
              border-color: #8B5CF630;
              background: #8B5CF608;
            }
            .swagger-ui-dark .swagger-ui .opblock.opblock-patch .opblock-summary {
              border-color: #8B5CF620;
            }
            /* Tables & Parameters */
            .swagger-ui-dark .swagger-ui table thead tr td,
            .swagger-ui-dark .swagger-ui table thead tr th,
            .swagger-ui-dark .swagger-ui .parameter__name,
            .swagger-ui-dark .swagger-ui .parameter__type,
            .swagger-ui-dark .swagger-ui .parameter__in {
              color: var(--t-text-secondary);
            }
            .swagger-ui-dark .swagger-ui .parameter__name.required::after {
              color: #EF4444;
            }
            .swagger-ui-dark .swagger-ui table tbody tr td {
              color: var(--t-text);
              border-color: var(--t-border);
            }
            /* Response */
            .swagger-ui-dark .swagger-ui .responses-inner h4,
            .swagger-ui-dark .swagger-ui .responses-inner h5,
            .swagger-ui-dark .swagger-ui .response-col_status {
              color: var(--t-text);
            }
            .swagger-ui-dark .swagger-ui .response-col_description__inner p {
              color: var(--t-text-secondary);
            }
            /* Models */
            .swagger-ui-dark .swagger-ui section.models {
              border-color: var(--t-border);
            }
            .swagger-ui-dark .swagger-ui section.models h4 {
              color: var(--t-text);
            }
            .swagger-ui-dark .swagger-ui .model-container {
              background: var(--t-panel);
            }
            .swagger-ui-dark .swagger-ui .model {
              color: var(--t-text-secondary);
            }
            /* Buttons & Inputs */
            .swagger-ui-dark .swagger-ui .btn {
              border-radius: 6px;
              font-family: 'Prompt', sans-serif;
            }
            .swagger-ui-dark .swagger-ui select {
              background: var(--t-panel);
              color: var(--t-text);
              border-color: var(--t-border);
              border-radius: 6px;
            }
            .swagger-ui-dark .swagger-ui input[type=text] {
              background: var(--t-bg);
              color: var(--t-text);
              border-color: var(--t-border);
              border-radius: 6px;
            }
            /* Scheme container */
            .swagger-ui-dark .swagger-ui .scheme-container {
              border-color: var(--t-border);
              box-shadow: none;
            }
            /* Auth */
            .swagger-ui-dark .swagger-ui .authorization__btn svg {
              fill: #60A5FA;
            }
            /* Tag section */
            .swagger-ui-dark .swagger-ui .opblock-tag-section {
              border-color: var(--t-border);
            }
            .swagger-ui-dark .swagger-ui .opblock-tag:hover {
              background: var(--t-panel-hover);
            }
            .swagger-ui-dark .swagger-ui .opblock-tag svg {
              fill: var(--t-text-muted);
            }
            /* Expand arrows */
            .swagger-ui-dark .swagger-ui .expand-operation svg {
              fill: var(--t-text-muted);
            }
            /* Server URL */
            .swagger-ui-dark .swagger-ui .servers > label select {
              background: var(--t-panel);
              color: var(--t-text);
              border-color: var(--t-border);
            }
            .swagger-ui-dark .swagger-ui .servers > label {
              color: var(--t-text-secondary);
            }
            /* Topbar hidden */
            .swagger-ui-dark .swagger-ui .topbar {
              display: none;
            }
            /* Scrollbar */
            .swagger-ui-dark ::-webkit-scrollbar {
              width: 6px;
              height: 6px;
            }
            .swagger-ui-dark ::-webkit-scrollbar-track {
              background: var(--t-input);
            }
            .swagger-ui-dark ::-webkit-scrollbar-thumb {
              background: var(--t-border);
              border-radius: 3px;
            }
          `}</style>
          {specForSwagger && (
            <SwaggerUI
              spec={specForSwagger}
              docExpansion="list"
              defaultModelsExpandDepth={1}
              tryItOutEnabled={false}
            />
          )}
        </div>
      ) : (
        /* YAML / JSON Code View */
        <div
          style={{
            backgroundColor: 'var(--t-input)',
            border: `1px solid ${THEME.border}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <pre
            style={{
              padding: 20,
              margin: 0,
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--t-text)',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
              overflowX: 'auto',
              maxHeight: 700,
              overflowY: 'auto',
            }}
          >
            <code>{viewMode === 'yaml' ? specYaml : JSON.stringify(spec, null, 2)}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

// ==================== MAIN PAGE ====================

export default function ProjectDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [activeTab, setActiveTab] = useState<TabId>('apis')

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: () => projectApi.getById(id),
    enabled: !!id,
  })

  // Loading state
  if (isLoading) {
    return (
      <div style={{ fontFamily: FONT }}>
        <div>
          <SkeletonBlock height={24} width={120} />
          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
            <SkeletonBlock height={48} width={48} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SkeletonBlock height={28} width={240} />
              <SkeletonBlock height={16} width={160} />
            </div>
          </div>
          <div style={{ marginTop: 32 }}>
            <SkeletonBlock height={300} />
          </div>
        </div>
      </div>
    )
  }

  // Not found
  if (!project) {
    return (
      <div
        style={{
          padding: 32,
          fontFamily: FONT,
          backgroundColor: THEME.bg,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <FolderKanban size={48} style={{ color: THEME.text.muted, margin: '0 auto 16px' }} />
          <p style={{ fontSize: 16, fontWeight: 500, color: THEME.text.primary }}>
            Project not found
          </p>
          <Link
            href="/projects"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 16,
              fontSize: 13,
              color: THEME.accent,
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={14} />
            Back to Projects
          </Link>
        </div>
      </div>
    )
  }

  const themeColor = project.themeColor || THEME.accent

  return (
    <div style={{ fontFamily: FONT }}>
      <div>
        {/* Back link */}
        <Link
          href="/projects"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: THEME.text.secondary,
            textDecoration: 'none',
            marginBottom: 20,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = THEME.text.primary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = THEME.text.secondary)}
        >
          <ArrowLeft size={14} />
          Back to Projects
        </Link>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 28,
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: themeColor + '20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FolderKanban size={24} style={{ color: themeColor }} />
          </div>

          {/* Title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: THEME.text.primary,
                  margin: 0,
                  fontFamily: FONT,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {project.name}
              </h1>
              <StatusBadge status={project.status} />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: THEME.text.muted,
                  fontFamily: 'monospace',
                  backgroundColor: THEME.borderLight,
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                {project.slug}
              </span>
              {project.baseUrl && (
                <span
                  style={{
                    fontSize: 12,
                    color: THEME.text.muted,
                    fontFamily: 'monospace',
                  }}
                >
                  {project.baseUrl}
                </span>
              )}
            </div>
            {project.description && (
              <p
                style={{
                  fontSize: 12,
                  color: THEME.text.secondary,
                  marginTop: 6,
                  lineHeight: 1.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: `1px solid ${THEME.border}`,
            marginBottom: 24,
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            // Link-tabs (with href) navigate to a sub-page rather than
            // toggling activeTab — used for the project-scoped library
            // pages (Field Mappings / Audit Configs / Clients) that live
            // at /orch/projects/<id>/<href>.
            const tabStyle = {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: isActive && !tab.href ? 600 : 400,
              color: isActive && !tab.href ? THEME.accent : THEME.text.secondary,
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: isActive && !tab.href ? `2px solid ${THEME.accent}` : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: FONT,
              transition: 'color 0.15s, border-color 0.15s',
              marginBottom: -1,
              textDecoration: 'none',
            } as const
            if (tab.href) {
              return (
                <Link
                  key={tab.id}
                  href={`/projects/${project.id}/${tab.href}`}
                  style={tabStyle}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </Link>
              )
            }
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                style={tabStyle}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = THEME.text.primary
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = THEME.text.secondary
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'apis' && <ApisTab projectId={id} />}
        {activeTab === 'settings' && <SettingsTab project={project} />}
        {activeTab === 'env' && <EnvTab project={project} />}
        {activeTab === 'rules' && <RulesTab project={project} />}
        {activeTab === 'openapi' && <OpenApiTab project={project} />}
      </div>
    </div>
  )
}
