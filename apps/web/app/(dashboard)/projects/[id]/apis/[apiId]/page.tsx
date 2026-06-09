'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  apiRegistrationApi,
  flowApi,
  authConfigApi,
  headerMappingApi,
  messageFormatApi,
  datasetApi,
  fieldMappingApi,
  auditConfigApi,
  clientAppApi,
  screenApi,
} from '@/lib/api'
import {
  ApiRegistration,
  ApiHeaderMapping,
  MessageFormat,
  AuthScheme,
  OAuth2Flow,
  ApiKeyLocation,
  HeaderDirection,
  HeaderAction,
  HttpMethod,
  ApiType,
  AuthType,
  ApiStatus,
  RouteType,
  DiscriminatorSource,
  MessageFormatType,
} from '@/types'
import {
  ArrowLeft,
  Save,
  Trash2,
  Settings2,
  Shield,
  ArrowRightLeft,
  MessageSquare,
  Plus,
  X,
  ChevronDown,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Info,
  FileText,
  Edit3,
  Pencil,
  Search,
  Zap,
  Copy,
  Check,
  Workflow,
  Tag,
  Lock,
  SlidersHorizontal,
  Smartphone,
  Play,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { TestRequestModal } from '@/components/api/TestRequestModal'
import { confirmDialog } from '@/components/common/ConfirmDialog'
import { Combobox } from '@/components/ui/combobox'
import { useAutosave } from '@/lib/use-autosave'
import { EnvAwareInput } from '@/components/common/EnvAwareInput'

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
  DELETE: '#F87171',
  PATCH: '#A78BFA',
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: '#10B98118', color: '#34D399' },
  INACTIVE: { bg: '#8B92A518', color: '#8B92A5' },
  DRAFT: { bg: '#F59E0B18', color: '#FBBF24' },
  DEPRECATED: { bg: '#EF444418', color: '#F87171' },
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  DRAFT: 'Draft',
  DEPRECATED: 'Deprecated',
}

const TABS = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'auth', label: 'Authentication', icon: Shield },
  { id: 'headers', label: 'Headers', icon: ArrowRightLeft },
  { id: 'messages', label: 'Message Formats', icon: MessageSquare },
] as const

type TabId = (typeof TABS)[number]['id']

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const API_TYPES: { value: ApiType; label: string }[] = [
  { value: 'REST', label: 'REST API' },
  { value: 'MICROFLOW', label: 'Microflow' },
]
const ROUTE_TYPES: { value: RouteType; label: string; desc: string }[] = [
  { value: 'DEDICATED', label: 'Dedicated URL', desc: '1 URL = 1 Flow (default)' },
  { value: 'SHARED_ENDPOINT', label: 'Shared Endpoint', desc: '1 URL = multiple Message Formats, routed by field in body/header' },
]
const AUTH_TYPES: { value: AuthType; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'JWT', label: 'JWT' },
  { value: 'API_KEY', label: 'API Key' },
  { value: 'OAUTH2', label: 'OAuth 2.0' },
  { value: 'BASIC', label: 'Basic Auth' },
]
const API_STATUSES: { value: ApiStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'DEPRECATED', label: 'Deprecated' },
]

const AUTH_SCHEMES: { value: AuthScheme; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'JWT', label: 'JWT' },
  { value: 'API_KEY', label: 'API Key' },
  { value: 'OAUTH2', label: 'OAuth 2.0' },
  { value: 'BASIC', label: 'Basic Auth' },
  { value: 'CUSTOM', label: 'Custom' },
]

const JWT_ALGORITHMS = ['HS256', 'RS256', 'ES256']
const API_KEY_LOCATIONS: { value: ApiKeyLocation; label: string }[] = [
  { value: 'HEADER', label: 'Header' },
  { value: 'QUERY', label: 'Query Parameter' },
  { value: 'COOKIE', label: 'Cookie' },
]
const OAUTH2_FLOWS: { value: OAuth2Flow; label: string }[] = [
  { value: 'AUTHORIZATION_CODE', label: 'Authorization Code' },
  { value: 'CLIENT_CREDENTIALS', label: 'Client Credentials' },
  { value: 'IMPLICIT', label: 'Implicit' },
  { value: 'PASSWORD', label: 'Password' },
]
const HEADER_DIRECTIONS: { value: HeaderDirection; label: string; color: string }[] = [
  { value: 'REQUEST', label: 'Request', color: '#60A5FA' },
  { value: 'RESPONSE', label: 'Response', color: '#34D399' },
]
const HEADER_ACTIONS: { value: HeaderAction; label: string; color: string }[] = [
  { value: 'SET', label: 'SET', color: '#60A5FA' },
  { value: 'APPEND', label: 'APPEND', color: '#A78BFA' },
  { value: 'REMOVE', label: 'REMOVE', color: '#F87171' },
  { value: 'PASSTHROUGH', label: 'PASSTHROUGH', color: '#8B92A5' },
]
const DISCRIMINATOR_SOURCES: { value: DiscriminatorSource; label: string }[] = [
  { value: 'NONE', label: 'None' },
  { value: 'BODY', label: 'Body' },
  { value: 'HEADER', label: 'Header' },
]

const FORMAT_TYPES: { value: MessageFormatType; label: string; color: string }[] = [
  { value: 'STANDARD', label: 'Standard', color: '#8B92A5' },
  { value: 'MICROFLOW', label: 'Microflow', color: '#A78BFA' },
  { value: 'BATCH', label: 'Batch', color: '#F59E0B' },
  { value: 'NOTIFICATION', label: 'Notification', color: '#60A5FA' },
]

// Mirrors the FieldMapping page so admins see consistent options
// whether they edit the library entry or override per-format.
const USERNAME_SOURCES_OPTS: { value: string; label: string }[] = [
  { value: '',          label: '— inherit / none —' },
  { value: 'JWT_CLAIM', label: 'JWT token claim' },
  { value: 'HEADER',    label: 'Request header' },
  { value: 'BODY_PATH', label: 'Request body (JSONPath)' },
  { value: 'SESSION',   label: 'Orch session' },
  { value: 'STATIC',    label: 'Fixed value' },
]

// Common entity reference types used in enterprise systems.
// Free-form so admins can type their own — these are quick-pick.
const REF_TYPE_OPTS: { value: string; label: string }[] = [
  { value: '',         label: '— inherit / none —' },
  { value: 'PO',       label: 'PO' },
  { value: 'INV',      label: 'INV' },
  { value: 'CUSTOMER', label: 'CUSTOMER' },
  { value: 'CASE',     label: 'CASE' },
  { value: 'TICKET',   label: 'TICKET' },
  { value: 'FORM',     label: 'FORM' },
]

// ==================== HELPER COMPONENTS ====================

function SectionCard({
  title,
  sectionId,
  children,
  className,
  hint,
}: {
  title?: string
  sectionId?: string
  children: React.ReactNode
  className?: string
  /** Kept for prop compatibility but ignored — sections are always
   *  open now per admin feedback ("remove the collapse/expand feature"). */
  defaultOpen?: boolean
  hint?: string
}) {
  return (
    <div
      id={sectionId}
      className={cn('bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl overflow-hidden', className)}
      style={{ scrollMarginTop: 80 }}
    >
      {title && (
        <div className="px-5 py-3 border-b border-[var(--t-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--t-text)]">{title}</h3>
          {hint && <p className="text-[11px] text-[var(--t-text-muted)] mt-0.5">{hint}</p>}
        </div>
      )}
      <div className={cn(title ? 'p-5' : 'p-5')}>{children}</div>
    </div>
  )
}

// Small status pill that sits next to the Save button. Reflects the
// autosave hook's lifecycle: pending (typing), saving (debounce
// fired, request in-flight), saved (last save succeeded), error
// (last save threw — message in tooltip).
function AutosaveIndicator({
  status,
  error,
  savedAt,
}: {
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  error: string | null
  savedAt: number | null
}) {
  if (status === 'idle') return null
  let label = ''
  let cls = 'text-[var(--t-text-muted)] bg-transparent'
  let icon: React.ReactNode = null
  if (status === 'pending') {
    label = 'Unsaved changes…'
    cls = 'text-amber-400 bg-amber-500/10 border-amber-500/30'
  } else if (status === 'saving') {
    label = 'Saving…'
    cls = 'text-[#60A5FA] bg-[#3B82F6]/10 border-[#3B82F6]/30'
    icon = <Loader2 className="w-3 h-3 animate-spin" />
  } else if (status === 'saved') {
    label = savedAt ? `Saved · ${formatSavedAgo(savedAt)}` : 'Saved'
    cls = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    icon = <Check className="w-3 h-3" />
  } else if (status === 'error') {
    label = 'Autosave failed'
    cls = 'text-[#F87171] bg-[#EF4444]/10 border-[#EF4444]/30'
    icon = <AlertTriangle className="w-3 h-3" />
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border ${cls}`}
      title={error ?? undefined}
    >
      {icon}
      {label}
    </span>
  )
}

function formatSavedAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  return new Date(ts).toLocaleTimeString()
}

function FormField({ label, required, hint, children }: { label: React.ReactNode; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--t-text-secondary)] mb-1">
        {label} {required && <span className="text-[#F87171]">*</span>}
      </label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-[var(--t-text-muted)]">{hint}</p>}
    </div>
  )
}

function InputField({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  className,
}: {
  value: string | number
  onChange: (val: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        'w-full px-2.5 py-1.5 bg-[var(--t-input)] border border-[var(--t-border)] rounded-md text-sm text-[var(--t-text)]',
        'placeholder:text-[var(--t-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]',
        'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    />
  )
}

// Chip-style tag input. Value is a comma-separated string (so the form
// schema stays backward-compatible), but the UI renders each tag as a
// pill with an × button. Enter or comma commits the buffered token.
function TagChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
}) {
  const [buf, setBuf] = useState('')
  const tags = (value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const commit = (t: string) => {
    const clean = t.trim().replace(/,+$/, '')
    if (!clean) return
    if (tags.includes(clean)) { setBuf(''); return }
    onChange([...tags, clean].join(', '))
    setBuf('')
  }
  const remove = (idx: number) => {
    const next = tags.filter((_, i) => i !== idx)
    onChange(next.join(', '))
  }
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 min-h-[42px] px-2 py-1.5',
        'bg-[var(--t-input)] border border-[var(--t-border)] rounded-lg',
        'focus-within:ring-2 focus-within:ring-[#3B82F6]/20 focus-within:border-[#3B82F6]',
      )}
      onClick={(e) => {
        const input = (e.currentTarget as HTMLElement).querySelector('input')
        input?.focus()
      }}
    >
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[#3B82F6]/15 text-[#60A5FA] border border-[#3B82F6]/30"
        >
          {t}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); remove(i) }}
            className="-mr-1 hover:text-white"
            aria-label={`Remove ${t}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={buf}
        onChange={(e) => {
          const v = e.target.value
          // Auto-commit when user types a comma
          if (v.includes(',')) {
            const parts = v.split(',')
            parts.slice(0, -1).forEach(commit)
            setBuf(parts[parts.length - 1])
          } else {
            setBuf(v)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(buf)
          } else if (e.key === 'Backspace' && !buf && tags.length) {
            remove(tags.length - 1)
          }
        }}
        onBlur={() => commit(buf)}
        placeholder={tags.length ? '' : placeholder}
        className="flex-1 min-w-[100px] bg-transparent outline-none text-sm text-[var(--t-text)] placeholder:text-[var(--t-text-muted)]"
      />
    </div>
  )
}

// Drop-in shim: every existing SelectField call across this file
// (and there are dozens) now renders the new Combobox so we don't
// have to touch the call sites one-by-one. The native <select>
// looked dated and lacked search; Combobox already has both.
function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? 'Select…'}
    />
  )
}

function TextAreaField({
  value,
  onChange,
  placeholder,
  rows = 4,
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
      className="w-full px-2.5 py-1.5 bg-[var(--t-input)] border border-[var(--t-border)] rounded-md text-sm text-[var(--t-text)] placeholder:text-[var(--t-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6] transition-colors font-mono resize-y"
    />
  )
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  )
}

function MethodBadge({ method }: { method: string }) {
  const color = METHOD_COLORS[method] || '#64748B'
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-bold tracking-wider"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
    >
      {method}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.DRAFT
  return <Badge label={STATUS_LABELS[status] || status} bg={style.bg} color={style.color} />
}

function Spinner() {
  return <Loader2 className="w-5 h-5 animate-spin text-[#3B82F6]" />
}

function EmptyState({ message, icon: Icon }: { message: string; icon?: any }) {
  const IconComponent = Icon || Info
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <IconComponent className="w-10 h-10 text-[var(--t-text-muted)] mb-3" />
      <p className="text-base text-[var(--t-text-muted)]">{message}</p>
    </div>
  )
}

// ==================== TAB: GENERAL ====================

function GeneralTab({ apiData, apiId, projectId, activeSection = 'basics' }: { apiData: ApiRegistration; apiId: string; projectId: string; activeSection?: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    name: '',
    description: '',
    apiType: 'REST' as ApiType,
    routeType: 'DEDICATED' as RouteType,
    routingKey: '',
    autoDiscoverFormats: false,
    endpoint: '',
    method: 'GET' as HttpMethod,
    backendUrl: '',
    timeout: 30,
    retries: 3,
    authType: 'NONE' as AuthType,
    apiKey: '',
    apiKeyHeader: 'X-API-Key',
    flowId: '',
    dataCatalogId: '',
    rateLimitPerMin: 60,
    quotaPerDay: '' as number | '',
    quotaPerMonth: '' as number | '',
    version: '',
    tags: '',
    contactName: '',
    contactEmail: '',
    contactUrl: '',
    license: '',
    termsOfService: '',
    deprecated: false,
    status: 'DRAFT' as ApiStatus,
  })

  // Populate form
  useEffect(() => {
    if (apiData) {
      setForm({
        name: apiData.name || '',
        description: apiData.description || '',
        apiType: apiData.apiType || 'REST',
        routeType: apiData.routeType || 'DEDICATED',
        routingKey: apiData.routingKey || '',
        autoDiscoverFormats: apiData.autoDiscoverFormats ?? false,
        endpoint: apiData.endpoint || '',
        method: apiData.method || 'GET',
        backendUrl: apiData.backendUrl || '',
        timeout: apiData.timeout ?? 30,
        retries: apiData.retries ?? 3,
        authType: (apiData.authType as AuthType) || 'NONE',
        apiKey: apiData.apiKey || '',
        apiKeyHeader: apiData.apiKeyHeader || 'X-API-Key',
        flowId: apiData.flowId || '',
        dataCatalogId: apiData.dataCatalogId || '',
        rateLimitPerMin: apiData.rateLimitPerMin ?? 60,
        quotaPerDay: apiData.quotaPerDay ?? '',
        quotaPerMonth: apiData.quotaPerMonth ?? '',
        version: apiData.version || '',
        tags: Array.isArray(apiData.tags) ? apiData.tags.join(', ') : '',
        contactName: apiData.contactName || '',
        contactEmail: apiData.contactEmail || '',
        contactUrl: apiData.contactUrl || '',
        license: apiData.license || '',
        termsOfService: apiData.termsOfService || '',
        deprecated: apiData.deprecated || false,
        status: apiData.status || 'DRAFT',
      })
    }
  }, [apiData])

  // Fetch flows
  const { data: flowsData } = useQuery({
    queryKey: ['flows'],
    queryFn: () => flowApi.list({ limit: 500 }),
  })
  const flows = flowsData?.data || []

  // Fetch data catalogs
  const { data: datasetsData } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetApi.list({ limit: 500 }),
  })
  const datasets = datasetsData?.data || []

  // Update mutation. The toast is suppressed here because autosave
  // fires on every field change — a popup per keystroke would be
  // exhausting. Errors still surface via the autosave indicator.
  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRegistrationApi.update(apiId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-api', apiId] })
    },
  })

  // (Delete moved to the API list row on the project page — see
  //  ApisTab in projects/[id]/page.tsx.)

  // Normalise the form into the shape the API expects. Conditional
  // fields (routingKey, apiKey) come and go with their parent enum;
  // tags is a comma-separated UI string but an array on the wire;
  // quotas use '' for "no cap" but the server wants null.
  const buildPayload = (f: typeof form) => ({
    name: f.name,
    description: f.description || undefined,
    apiType: f.apiType,
    routeType: f.routeType,
    routingKey: f.routeType === 'SHARED_ENDPOINT' ? (f.routingKey || undefined) : null,
    autoDiscoverFormats: f.routeType === 'SHARED_ENDPOINT' ? f.autoDiscoverFormats : false,
    endpoint: f.endpoint,
    method: f.method,
    backendUrl: f.backendUrl,
    timeout: Number(f.timeout),
    retries: Number(f.retries),
    authType: f.authType,
    apiKey: f.authType === 'API_KEY' ? f.apiKey : undefined,
    apiKeyHeader: f.authType === 'API_KEY' ? f.apiKeyHeader : undefined,
    flowId: f.flowId || undefined,
    dataCatalogId: f.dataCatalogId || undefined,
    rateLimitPerMin: Number(f.rateLimitPerMin),
    quotaPerDay: f.quotaPerDay === '' ? null : Number(f.quotaPerDay),
    quotaPerMonth: f.quotaPerMonth === '' ? null : Number(f.quotaPerMonth),
    version: f.version || undefined,
    tags: f.tags ? f.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    contactName: f.contactName || undefined,
    contactEmail: f.contactEmail || undefined,
    contactUrl: f.contactUrl || undefined,
    license: f.license || undefined,
    termsOfService: f.termsOfService || undefined,
    deprecated: f.deprecated,
    status: f.status,
  })

  const autosave = useAutosave(form, {
    enabled: !!apiData,
    debounceMs: 800,
    validate: (f) => !!f.name && !!f.endpoint && !!f.backendUrl,
    save: async () => {
      await updateMutation.mutateAsync(buildPayload(form))
    },
  })

  const handleSave = () => {
    autosave.flush().catch(() => {/* error already in indicator */})
  }

  const set = (key: string, val: any) => setForm((prev) => ({ ...prev, [key]: val }))

  return (
    // Single-section panel — sidebar picks which SectionCard to
    // render. Form state stays in this component so values aren't
    // lost when switching sections.
    <div className="space-y-6">
      {/* API Info */}
      {activeSection === 'basics' && (
      <SectionCard title="API Information" sectionId="basics">
        <div className="space-y-4">
          <FormField label="API Name" required>
            <InputField value={form.name} onChange={(v) => set('name', v)} />
          </FormField>
          <FormField label="Description">
            <TextAreaField value={form.description} onChange={(v) => set('description', v)} rows={3} />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="API Type">
              <SelectField value={form.apiType} onChange={(v) => set('apiType', v)} options={API_TYPES} />
            </FormField>
            <FormField label="Status">
              <SelectField value={form.status} onChange={(v) => set('status', v as ApiStatus)} options={API_STATUSES} />
            </FormField>
          </div>
        </div>
      </SectionCard>
      )}

      {/* Route Type */}
      {activeSection === 'route-type' && (
      <SectionCard title="Route Type" sectionId="route-type">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ROUTE_TYPES.map(rt => (
              <button
                key={rt.value}
                type="button"
                onClick={() => set('routeType', rt.value)}
                className={cn(
                  'flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all',
                  form.routeType === rt.value
                    ? 'border-[#3B82F6] bg-[#3B82F610]'
                    : 'border-[var(--t-border)] bg-[var(--t-bg)] hover:border-[var(--t-text-muted)]'
                )}
              >
                <span className={cn(
                  'text-sm font-semibold',
                  form.routeType === rt.value ? 'text-[#60A5FA]' : 'text-[var(--t-text)]'
                )}>
                  {rt.label}
                </span>
                <span className="text-xs text-[var(--t-text-muted)] mt-1">{rt.desc}</span>
              </button>
            ))}
          </div>

          {form.routeType === 'SHARED_ENDPOINT' && (
            <div className="p-4 bg-[var(--t-bg)] border border-[#3B82F630] rounded-lg space-y-3">
              <FormField label="Routing Key (JSONPath)" required>
                <InputField
                  value={form.routingKey}
                  onChange={(v) => set('routingKey', v)}
                />
              </FormField>

              {/* Auto-Discovery Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--t-border-light)]">
                <div>
                  <div className="text-sm font-medium text-[var(--t-text)]">Auto-Discover Formats</div>
                </div>
                <button
                  type="button"
                  onClick={() => set('autoDiscoverFormats', !form.autoDiscoverFormats)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.autoDiscoverFormats ? 'bg-[#3B82F6]' : 'bg-[var(--t-border)]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.autoDiscoverFormats ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
      )}

      {/* Endpoint & Backend */}
      {activeSection === 'endpoint' && (
      <SectionCard title="Endpoint & Backend" sectionId="endpoint">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <FormField label="Method" required>
                <SelectField
                  value={form.method}
                  onChange={(v) => set('method', v)}
                  options={HTTP_METHODS.map((m) => ({ value: m, label: m }))}
                />
              </FormField>
            </div>
            <div className="md:col-span-3">
              <FormField label="Endpoint" required>
                <InputField value={form.endpoint} onChange={(v) => set('endpoint', v)} />
              </FormField>
            </div>
          </div>
          <FormField
            label="Backend URL"
            required
            hint="The URL the broker forwards matched requests to. Type ${env. to pick from the project's Environment keys."
          >
            <EnvAwareInput
              value={form.backendUrl}
              onChange={(v) => set('backendUrl', v)}
              placeholder="http://svc.namespace.svc.cluster.local:8080/path  or  ${env.backendUrl}"
              projectId={apiData?.projectId}
            />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Timeout (seconds)">
              <InputField type="number" value={form.timeout} onChange={(v) => set('timeout', v)} />
            </FormField>
            <FormField label="Retries">
              <InputField type="number" value={form.retries} onChange={(v) => set('retries', v)} />
            </FormField>
          </div>
        </div>
      </SectionCard>
      )}

      {/* Authentication */}
      {activeSection === 'auth' && (
      <SectionCard title="Backend Authentication" sectionId="auth" defaultOpen={false}>
        <div className="space-y-4">
          <FormField label="Auth Type">
            <SelectField value={form.authType} onChange={(v) => set('authType', v)} options={AUTH_TYPES} />
          </FormField>
          {form.authType === 'API_KEY' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="API Key">
                <InputField type="password" value={form.apiKey} onChange={(v) => set('apiKey', v)} />
              </FormField>
              <FormField label="Header Name">
                <InputField value={form.apiKeyHeader} onChange={(v) => set('apiKeyHeader', v)} />
              </FormField>
            </div>
          )}
        </div>
      </SectionCard>
      )}

      {/* Flow — execution path: which Flow Definition runs for this API */}
      {activeSection === 'flow' && (
      <SectionCard title="Flow" sectionId="flow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Flow"
            hint={form.routeType === 'SHARED_ENDPOINT'
              ? 'Fallback flow when a Message Format has no flow set'
              : undefined}
          >
            <Combobox
              options={flows.map((f: any) => ({ value: f.id, label: f.name, hint: f.id }))}
              value={form.flowId}
              onChange={(v) => set('flowId', v)}
              placeholder="-- No Flow connected --"
            />
          </FormField>
          <FormField label="Data Catalog">
            <Combobox
              options={[...datasets]
                .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'th'))
                .map((d: any) => ({ value: d.id, label: d.name, hint: d.category }))}
              value={form.dataCatalogId}
              onChange={(v) => set('dataCatalogId', v)}
              placeholder="-- No Data Catalog connected --"
            />
          </FormField>
        </div>
      </SectionCard>
      )}

      {/* Limits — throttling: rate limit + quotas */}
      {activeSection === 'limits' && (
      <SectionCard title="Limits" sectionId="limits">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Rate Limit (requests/min)">
            <InputField type="number" value={form.rateLimitPerMin} onChange={(v) => set('rateLimitPerMin', v)} />
          </FormField>
          <FormField label="Quota / Day">
            <InputField
              type="number"
              value={form.quotaPerDay}
              onChange={(v) => set('quotaPerDay', v === '' ? '' : Number(v))}
              placeholder="Unlimited"
            />
          </FormField>
          <FormField label="Quota / Month">
            <InputField
              type="number"
              value={form.quotaPerMonth}
              onChange={(v) => set('quotaPerMonth', v === '' ? '' : Number(v))}
              placeholder="Unlimited"
            />
          </FormField>
        </div>
      </SectionCard>
      )}

      {/* Additional Information */}
      {activeSection === 'metadata' && (
      <SectionCard title="Additional Information" sectionId="metadata" defaultOpen={false}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Version">
              <InputField value={form.version} onChange={(v) => set('version', v)} />
            </FormField>
            <FormField label="Tags" hint="Press Enter or comma to add a tag">
              <TagChipInput value={form.tags} onChange={(v) => set('tags', v)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Contact Name">
              <InputField value={form.contactName} onChange={(v) => set('contactName', v)} />
            </FormField>
            <FormField label="Contact Email">
              <InputField value={form.contactEmail} onChange={(v) => set('contactEmail', v)} />
            </FormField>
            <FormField label="Contact URL">
              <InputField value={form.contactUrl} onChange={(v) => set('contactUrl', v)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="License">
              <InputField value={form.license} onChange={(v) => set('license', v)} />
            </FormField>
            <FormField label="Terms of Service">
              <InputField value={form.termsOfService} onChange={(v) => set('termsOfService', v)} />
            </FormField>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.deprecated}
              onChange={(e) => set('deprecated', e.target.checked)}
              className="w-4 h-4 rounded border-[var(--t-border)] bg-[var(--t-input)] text-[#3B82F6] focus:ring-[#3B82F6]"
            />
            <span className="text-sm text-[var(--t-text-secondary)]">Deprecated</span>
          </div>
        </div>
      </SectionCard>
      )}

      {/* Autosave indicator is portaled into the page header slot
          (#api-detail-autosave-slot, see ProjectApiDetailPage)
          so the status is always visible at the top — admins
          asked for this because the previous bottom-of-form
          placement got buried as soon as the section grew. The
          unmount-flush in useAutosave handles save-on-navigate;
          there is no manual Save button. */}
      <AutosaveSlot status={autosave.status} error={autosave.error} savedAt={autosave.savedAt} />
    </div>
  )
}

// Renders nothing inline; portals the AutosaveIndicator into the
// header slot. Falls back to inline rendering if the slot is
// missing (e.g. during the initial mount before the parent's
// header is in the DOM) so the user still sees status.
function AutosaveSlot({
  status,
  error,
  savedAt,
}: {
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  error: string | null
  savedAt: number | null
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setTarget(document.getElementById('api-detail-autosave-slot'))
  }, [])
  const indicator = <AutosaveIndicator status={status} error={error} savedAt={savedAt} />
  if (!target) return null
  return createPortal(indicator, target)
}

// ==================== UNIFIED SIDEBAR ====================
// Single left rail covering everything that used to be split between
// the top tab strip (General/Auth/Headers/MessageFormats) and the
// in-General-tab section navigator. One nav, no top tabs — admins
// asked for this because the previous "tabs + sidebar" layout made
// it hard to tell where a setting lived.
//
// General sub-sections are anchor links into the long General page
// (existing scroll behaviour). Other tabs are buttons that swap the
// main content area via activeTab.

// One flat sidebar list. Each entry knows which "tab" (content panel)
// to switch to. General tab items also carry a `section` id that
// tells GeneralTab which SectionCard to render (panel-swap, not
// scroll-to-anchor — admins asked for click-to-show behaviour, same
// as Auth/Headers/Message Formats already do).

function UnifiedSidebar({
  activeTab,
  setActiveTab,
  activeSection,
  setActiveSection,
  formatsCount,
}: {
  activeTab: 'general' | 'auth' | 'headers' | 'messages'
  setActiveTab: (id: 'general' | 'auth' | 'headers' | 'messages') => void
  activeSection: string
  setActiveSection: (id: string) => void
  formatsCount: number
}) {
  // Single ordered list. The `section` field on a general-tab item
  // tells the page which SectionCard to render; the page swaps panels
  // (no scroll-to-anchor) so each click feels like switching tabs.
  const items: Array<{
    id: string
    label: string
    icon: any
    tab: 'general' | 'auth' | 'headers' | 'messages'
    section?: string
    badge?: number | null
  }> = [
    { id: 'basics',       label: 'Basics',             icon: Settings2,      tab: 'general',  section: 'basics' },
    { id: 'route-type',   label: 'Route Type',         icon: ArrowRightLeft, tab: 'general',  section: 'route-type' },
    { id: 'endpoint',     label: 'Endpoint & Backend', icon: ExternalLink,   tab: 'general',  section: 'endpoint' },
    { id: 'backend-auth', label: 'Backend Auth',       icon: Shield,         tab: 'general',  section: 'auth' },
    { id: 'flow',         label: 'Flow',               icon: Workflow,       tab: 'general',  section: 'flow' },
    { id: 'limits',       label: 'Limits',             icon: SlidersHorizontal, tab: 'general', section: 'limits' },
    { id: 'metadata',     label: 'Metadata',           icon: Tag,            tab: 'general',  section: 'metadata' },
    { id: 'inbound-auth', label: 'Inbound Auth',       icon: Lock,           tab: 'auth' },
    { id: 'headers',      label: 'Headers',            icon: FileText,       tab: 'headers' },
    { id: 'messages',     label: 'Message Formats',    icon: MessageSquare,  tab: 'messages', badge: formatsCount },
  ]

  const handleClick = (item: typeof items[number]) => {
    if (item.tab !== activeTab) setActiveTab(item.tab)
    if (item.section) setActiveSection(item.section)
  }

  return (
    <aside className="hidden lg:block sticky top-4 self-start z-10">
      <nav className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl p-3 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon
            // Highlight = the item whose (tab, section) the page is
            // currently showing. For the 7 General sub-sections we
            // compare against activeSection; for Auth/Headers/Formats
            // we just compare against activeTab.
            const isActive = item.section
              ? activeTab === 'general' && activeSection === item.section
              : activeTab === item.tab
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
                  isActive
                    ? 'bg-[#3B82F6]/15 text-[#60A5FA] font-semibold'
                    : 'text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)] hover:text-[var(--t-text)]',
                )}
              >
                <span className="flex items-center gap-2 truncate">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge != null && item.badge > 0 && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                    isActive ? 'bg-[#3B82F6]/20 text-[#60A5FA]' : 'bg-[var(--t-panel-hover)] text-[var(--t-text-muted)]',
                  )}>
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}

// ==================== TAB: AUTH CONFIG ====================

function AuthTab({ apiId }: { apiId: string }) {
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    authScheme: 'NONE' as AuthScheme,
    jwtIssuer: '',
    jwtAudience: '',
    jwtAlgorithm: 'HS256',
    jwtClaims: '',
    apiKeyLocation: 'HEADER' as ApiKeyLocation,
    apiKeyName: '',
    apiKeyValue: '',
    oauth2Flow: 'AUTHORIZATION_CODE' as OAuth2Flow,
    oauth2AuthUrl: '',
    oauth2TokenUrl: '',
    oauth2Scopes: '',
    basicUsername: '',
    basicPassword: '',
    customAuthConfig: '',
  })

  // Fetch auth config
  const { data: authData, isLoading } = useQuery({
    queryKey: ['auth-config', apiId],
    queryFn: () => authConfigApi.get(apiId),
  })

  useEffect(() => {
    if (authData) {
      setForm({
        authScheme: authData.authScheme || 'NONE',
        jwtIssuer: authData.jwtIssuer || '',
        jwtAudience: authData.jwtAudience || '',
        jwtAlgorithm: authData.jwtAlgorithm || 'HS256',
        jwtClaims: authData.jwtClaims ? JSON.stringify(authData.jwtClaims, null, 2) : '',
        apiKeyLocation: authData.apiKeyLocation || 'HEADER',
        apiKeyName: authData.apiKeyName || '',
        apiKeyValue: authData.apiKeyValue || '',
        oauth2Flow: authData.oauth2Flow || 'AUTHORIZATION_CODE',
        oauth2AuthUrl: authData.oauth2AuthUrl || '',
        oauth2TokenUrl: authData.oauth2TokenUrl || '',
        oauth2Scopes: Array.isArray(authData.oauth2Scopes) ? authData.oauth2Scopes.join(', ') : '',
        basicUsername: authData.basicUsername || '',
        basicPassword: authData.basicPassword || '',
        customAuthConfig: authData.customAuthConfig ? JSON.stringify(authData.customAuthConfig, null, 2) : '',
      })
    }
  }, [authData])

  const upsertMutation = useMutation({
    mutationFn: (data: any) => authConfigApi.upsert(apiId, data),
    onSuccess: () => {
      toast.success('Auth Config saved successfully')
      queryClient.invalidateQueries({ queryKey: ['auth-config', apiId] })
    },
    onError: (err: any) => toast.error(`Save failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => authConfigApi.delete(apiId),
    onSuccess: () => {
      toast.success('Auth Config deleted successfully')
      setForm((prev) => ({ ...prev, authScheme: 'NONE' }))
      queryClient.invalidateQueries({ queryKey: ['auth-config', apiId] })
    },
    onError: (err: any) => toast.error(`Delete failed: ${err.message}`),
  })

  const handleSave = () => {
    const payload: any = { authScheme: form.authScheme }

    if (form.authScheme === 'JWT') {
      payload.jwtIssuer = form.jwtIssuer || undefined
      payload.jwtAudience = form.jwtAudience || undefined
      payload.jwtAlgorithm = form.jwtAlgorithm
      if (form.jwtClaims.trim()) {
        try {
          payload.jwtClaims = JSON.parse(form.jwtClaims)
        } catch {
          toast.error('JWT Claims must be valid JSON')
          return
        }
      }
    } else if (form.authScheme === 'API_KEY') {
      payload.apiKeyLocation = form.apiKeyLocation
      payload.apiKeyName = form.apiKeyName
      payload.apiKeyValue = form.apiKeyValue
    } else if (form.authScheme === 'OAUTH2') {
      payload.oauth2Flow = form.oauth2Flow
      payload.oauth2AuthUrl = form.oauth2AuthUrl || undefined
      payload.oauth2TokenUrl = form.oauth2TokenUrl || undefined
      payload.oauth2Scopes = form.oauth2Scopes
        ? form.oauth2Scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined
    } else if (form.authScheme === 'BASIC') {
      payload.basicUsername = form.basicUsername
      payload.basicPassword = form.basicPassword
    } else if (form.authScheme === 'CUSTOM') {
      if (form.customAuthConfig.trim()) {
        try {
          payload.customAuthConfig = JSON.parse(form.customAuthConfig)
        } catch {
          toast.error('Custom Auth Config must be valid JSON')
          return
        }
      }
    }

    upsertMutation.mutate(payload)
  }

  const set = (key: string, val: any) => setForm((prev) => ({ ...prev, [key]: val }))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Auth Scheme">
        <FormField label="Authentication Method">
          <SelectField value={form.authScheme} onChange={(v) => set('authScheme', v)} options={AUTH_SCHEMES} />
        </FormField>
      </SectionCard>

      {form.authScheme === 'NONE' && (
        <SectionCard>
          <div className="flex items-center gap-3 text-[var(--t-text-muted)]">
            <Shield className="w-5 h-5" />
            <span className="text-sm">No authentication configured</span>
          </div>
        </SectionCard>
      )}

      {form.authScheme === 'JWT' && (
        <SectionCard title="JWT Configuration">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Issuer">
                <InputField value={form.jwtIssuer} onChange={(v) => set('jwtIssuer', v)} />
              </FormField>
              <FormField label="Audience">
                <InputField value={form.jwtAudience} onChange={(v) => set('jwtAudience', v)} />
              </FormField>
            </div>
            <FormField label="Algorithm">
              <SelectField value={form.jwtAlgorithm} onChange={(v) => set('jwtAlgorithm', v)} options={JWT_ALGORITHMS.map((a) => ({ value: a, label: a }))} />
            </FormField>
            <FormField label="Claims (JSON)">
              <TextAreaField value={form.jwtClaims} onChange={(v) => set('jwtClaims', v)} placeholder='{"sub": "...", "roles": [...]}' rows={5} />
            </FormField>
          </div>
        </SectionCard>
      )}

      {form.authScheme === 'API_KEY' && (
        <SectionCard title="API Key Configuration">
          <div className="space-y-4">
            <FormField label="Location">
              <SelectField value={form.apiKeyLocation} onChange={(v) => set('apiKeyLocation', v)} options={API_KEY_LOCATIONS} />
            </FormField>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Key Name">
                <InputField value={form.apiKeyName} onChange={(v) => set('apiKeyName', v)} />
              </FormField>
              <FormField label="Key Value">
                <InputField type="password" value={form.apiKeyValue} onChange={(v) => set('apiKeyValue', v)} />
              </FormField>
            </div>
          </div>
        </SectionCard>
      )}

      {form.authScheme === 'OAUTH2' && (
        <SectionCard title="OAuth 2.0 Configuration">
          <div className="space-y-4">
            <FormField label="Flow">
              <SelectField value={form.oauth2Flow} onChange={(v) => set('oauth2Flow', v)} options={OAUTH2_FLOWS} />
            </FormField>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Authorization URL">
                <InputField value={form.oauth2AuthUrl} onChange={(v) => set('oauth2AuthUrl', v)} />
              </FormField>
              <FormField label="Token URL">
                <InputField value={form.oauth2TokenUrl} onChange={(v) => set('oauth2TokenUrl', v)} />
              </FormField>
            </div>
            <FormField label="Scopes">
              <InputField value={form.oauth2Scopes} onChange={(v) => set('oauth2Scopes', v)} />
            </FormField>
          </div>
        </SectionCard>
      )}

      {form.authScheme === 'BASIC' && (
        <SectionCard title="Basic Auth Configuration">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Username">
              <InputField value={form.basicUsername} onChange={(v) => set('basicUsername', v)} />
            </FormField>
            <FormField label="Password">
              <InputField type="password" value={form.basicPassword} onChange={(v) => set('basicPassword', v)} />
            </FormField>
          </div>
        </SectionCard>
      )}

      {form.authScheme === 'CUSTOM' && (
        <SectionCard title="Custom Auth Configuration">
          <FormField label="Config (JSON)">
            <TextAreaField value={form.customAuthConfig} onChange={(v) => set('customAuthConfig', v)} placeholder='{"type": "...", ...}' rows={8} />
          </FormField>
        </SectionCard>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          {authData && form.authScheme !== 'NONE' && (
            <button
              onClick={async () => {
                if (await confirmDialog({
                  title: 'Delete Auth Config?',
                  body: 'Backend authentication for this API will fall back to None.',
                  variant: 'danger',
                })) {
                  deleteMutation.mutate()
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#F87171] bg-[#EF444418] hover:bg-[#EF444430] transition-colors disabled:opacity-50"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete Auth Config
            </button>
          )}
        </div>
        {form.authScheme !== 'NONE' && (
          <button
            onClick={handleSave}
            disabled={upsertMutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: THEME.accent }}
          >
            {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        )}
      </div>
    </div>
  )
}

// ==================== TAB: HEADERS ====================

function HeadersTab({ apiId }: { apiId: string }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newHeader, setNewHeader] = useState({
    direction: 'REQUEST' as HeaderDirection,
    headerName: '',
    headerValue: '',
    action: 'SET' as HeaderAction,
    condition: '',
    order: 0,
  })

  // Fetch headers
  const { data: headers, isLoading } = useQuery({
    queryKey: ['headers', apiId],
    queryFn: () => headerMappingApi.list(apiId),
  })

  const headerList: ApiHeaderMapping[] = Array.isArray(headers) ? headers : []

  const createMutation = useMutation({
    mutationFn: (data: any) => headerMappingApi.create(apiId, data),
    onSuccess: () => {
      toast.success('Header Mapping added successfully')
      queryClient.invalidateQueries({ queryKey: ['headers', apiId] })
      setShowForm(false)
      setNewHeader({ direction: 'REQUEST', headerName: '', headerValue: '', action: 'SET', condition: '', order: 0 })
    },
    onError: (err: any) => toast.error(`Add failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (headerId: string) => headerMappingApi.delete(apiId, headerId),
    onSuccess: () => {
      toast.success('Header Mapping deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['headers', apiId] })
    },
    onError: (err: any) => toast.error(`Delete failed: ${err.message}`),
  })

  const handleAdd = () => {
    if (!newHeader.headerName) {
      toast.error('Please enter Header Name')
      return
    }
    createMutation.mutate({
      direction: newHeader.direction,
      headerName: newHeader.headerName,
      headerValue: newHeader.headerValue,
      action: newHeader.action,
      condition: newHeader.condition || undefined,
      order: Number(newHeader.order),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--t-text)]">Header Mappings</h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: THEME.accent }}
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? 'Cancel' : 'Add Header'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="mb-6 p-4 bg-[var(--t-input)] border border-[var(--t-border)] rounded-lg space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FormField label="Direction">
                <SelectField
                  value={newHeader.direction}
                  onChange={(v) => setNewHeader((prev) => ({ ...prev, direction: v as HeaderDirection }))}
                  options={HEADER_DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))}
                />
              </FormField>
              <FormField label="Header Name">
                <InputField
                  value={newHeader.headerName}
                  onChange={(v) => setNewHeader((prev) => ({ ...prev, headerName: v }))}

                />
              </FormField>
              <FormField label="Action">
                <SelectField
                  value={newHeader.action}
                  onChange={(v) => setNewHeader((prev) => ({ ...prev, action: v as HeaderAction }))}
                  options={HEADER_ACTIONS.map((a) => ({ value: a.value, label: a.label }))}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <FormField label="Header Value" hint="Supports ${variable} templates">
                  <InputField
                    value={newHeader.headerValue}
                    onChange={(v) => setNewHeader((prev) => ({ ...prev, headerValue: v }))}

                  />
                </FormField>
              </div>
              <FormField label="Condition (optional)">
                <InputField
                  value={newHeader.condition}
                  onChange={(v) => setNewHeader((prev) => ({ ...prev, condition: v }))}

                />
              </FormField>
              <FormField label="Order">
                <InputField
                  type="number"
                  value={newHeader.order}
                  onChange={(v) => setNewHeader((prev) => ({ ...prev, order: Number(v) }))}
                />
              </FormField>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleAdd}
                disabled={createMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: THEME.accent }}
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        {headerList.length === 0 ? (
          <EmptyState message="No Header Mappings yet" icon={ArrowRightLeft} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--t-border)]">
                  <th className="text-left py-2 px-3 text-sm font-medium text-[var(--t-text-muted)]">Direction</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-[var(--t-text-muted)]">Header Name</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-[var(--t-text-muted)]">Value</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-[var(--t-text-muted)]">Action</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-[var(--t-text-muted)]">Condition</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-[var(--t-text-muted)]">Order</th>
                  <th className="text-right py-2 px-3 text-sm font-medium text-[var(--t-text-muted)]"></th>
                </tr>
              </thead>
              <tbody>
                {headerList
                  .sort((a, b) => a.order - b.order)
                  .map((h) => {
                    const dirConfig = HEADER_DIRECTIONS.find((d) => d.value === h.direction)
                    const actConfig = HEADER_ACTIONS.find((a) => a.value === h.action)
                    return (
                      <tr key={h.id} className="border-b border-[var(--t-panel-hover)] hover:bg-[var(--t-panel-hover)]">
                        <td className="py-2.5 px-3">
                          <Badge
                            label={dirConfig?.label || h.direction}
                            bg={`${dirConfig?.color || '#64748B'}15`}
                            color={dirConfig?.color || '#64748B'}
                          />
                        </td>
                        <td className="py-2.5 px-3 font-mono text-sm text-[var(--t-text)]">{h.headerName}</td>
                        <td className="py-2.5 px-3 font-mono text-sm text-[var(--t-text-secondary)] max-w-[200px] truncate">{h.headerValue}</td>
                        <td className="py-2.5 px-3">
                          <Badge
                            label={actConfig?.label || h.action}
                            bg={`${actConfig?.color || '#64748B'}15`}
                            color={actConfig?.color || '#64748B'}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-sm text-[var(--t-text-muted)]">{h.condition || '-'}</td>
                        <td className="py-2.5 px-3 text-sm text-[var(--t-text-secondary)]">{h.order}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={async () => {
                              if (await confirmDialog({
                                title: 'Delete this Header Mapping?',
                                variant: 'danger',
                              })) {
                                deleteMutation.mutate(h.id)
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 text-[var(--t-text-muted)] hover:text-[#F87171] hover:bg-[#EF444418] rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ==================== TAB: MESSAGE FORMATS ====================

interface DetectedField {
  id: string
  fieldName: string
  fieldPath: string
  fieldType: string
  sensitive: boolean
  isNestedJson?: boolean
  depth: number
  parentPath?: string
}

interface FormatFormState {
  name: string
  description: string
  flowId: string
  formatType: MessageFormatType
  discriminatorSource: DiscriminatorSource
  discriminatorField: string
  discriminatorValue: string
  // Optional AND-rules layered on top of the primary discriminator.
  // Use when one body field is not enough to tell two formats apart
  // (e.g. same flowName, different action). Resolver requires the
  // primary discriminator AND every rule to match.
  matchRules: { source: 'BODY' | 'HEADER'; field: string; value: string }[]
  auditEnabled: boolean
  status: ApiStatus
  // Search keys
  refIdPath: string
  refNoPath: string
  userIdPath: string
  // Action Context — describes the server-side action.
  // Screen/Button context comes from the bound ScreenButton (Call Sites).
  code: string
  actionType: string
  actionLabel: string
  // Extraction
  pkXPath: string
  jsonSample: string
  extractedFields: DetectedField[]
  extractSelected: string[]
  auditSelected: string[]
  manualFields: { path: string; name: string; type: string }[]
  // Library refs (Phase 4) — pick a reusable FieldMapping/AuditConfig.
  // Empty string = no library; per-row fields above act as standalone
  // values. When set, per-row values become "overrides" — null on save
  // means "use library default", non-null means override.
  fieldMappingId: string
  auditConfigId: string
  isDefault: boolean
  // Override-only fields (mirror library shape, not in FieldMapping above)
  refType: string
  refNamePath: string
  usernameSource: string
  usernameField: string
  usernameStatic: string
  // Datasets touched (M:N), edited as multi-select id list
  dataCatalogIds: string[]
  // JSONPath strings to redact before audit; comma-edited
  maskPaths: string[]
}

const emptyFormState: FormatFormState = {
  name: '', description: '', flowId: '', formatType: 'STANDARD', discriminatorSource: 'NONE',
  discriminatorField: '', discriminatorValue: '', matchRules: [], auditEnabled: false, status: 'DRAFT',
  refIdPath: '', refNoPath: '', userIdPath: '',
  code: '', actionType: '', actionLabel: '',
  pkXPath: '', jsonSample: '', extractedFields: [], extractSelected: [], auditSelected: [],
  manualFields: [],
  fieldMappingId: '', auditConfigId: '', isDefault: false,
  refType: '', refNamePath: '', usernameSource: '', usernameField: '', usernameStatic: '',
  dataCatalogIds: [], maskPaths: [],
}

function FormatTypeBadge({ type }: { type: MessageFormatType }) {
  const cfg = FORMAT_TYPES.find(t => t.value === type) || FORMAT_TYPES[0]
  return <Badge label={cfg.label} bg={`${cfg.color}18`} color={cfg.color} />
}

// ─── Inherited values panel ─────────────────────────────────────
// Shown in the Mapping section when admin picks a Field Mapping
// library. Lists what values are inherited so they don't need to
// scroll back to the library page to check.
function InheritedFromLibrary({
  lib,
  onClear,
}: {
  lib: any
  onClear: () => void
}) {
  if (!lib) return null
  const rows: { k: string; v?: string | null }[] = [
    { k: 'Ref Type',     v: lib.refType },
    { k: 'Ref Name Path', v: lib.refNamePath },
    { k: 'REF_ID Path',   v: lib.refIdPath },
    { k: 'REF_NO Path',   v: lib.refNoPath },
    { k: 'USER_ID Path',  v: lib.userIdPath },
    { k: 'PK XPath',      v: lib.pkXPath },
    { k: 'Username Source', v: lib.usernameSource ? `${lib.usernameSource}${lib.usernameField ? ` · ${lib.usernameField}` : ''}${lib.usernameStatic ? ` · "${lib.usernameStatic}"` : ''}` : null },
  ]
  return (
    <div className="rounded-md border border-[#A78BFA38] bg-[#A78BFA0F] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-[#A78BFA]" />
          <span className="text-xs font-semibold text-[#A78BFA]">
            Inherited from library: {lib.name}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-text)] underline-offset-2 hover:underline"
        >
          unlink
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {rows.map(r => (
          <div key={r.k} className="flex items-baseline gap-2">
            <span className="text-[var(--t-text-muted)] shrink-0">{r.k}:</span>
            {r.v ? (
              <code className="font-mono text-[var(--t-text)] truncate">{r.v}</code>
            ) : (
              <span className="text-[var(--t-text-muted)] italic">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Match Rule cell ────────────────────────────────────────────
// Renders a human-readable "what request will this format match?"
// summary instead of dumping raw discriminator field/value pairs.
function MatchRuleCell({ fmt, sharedKey }: { fmt: MessageFormat; sharedKey?: string }) {
  if ((fmt as any).isDefault) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#F59E0B]">
        <span className="text-sm">⭐</span>
        <span>Catch-all (default fallback)</span>
      </span>
    )
  }
  // Shared endpoint with auto routingKey — show as `key = value`
  if (sharedKey && fmt.discriminatorValue) {
    return (
      <span className="text-xs font-mono text-[var(--t-text)]">
        <span className="text-[var(--t-text-muted)]">{sharedKey}</span>
        <span className="mx-1 text-[var(--t-text-muted)]">=</span>
        <span className="text-[#60A5FA]">{fmt.discriminatorValue}</span>
      </span>
    )
  }
  // Per-format discriminator (BODY/HEADER/NONE)
  if (fmt.discriminatorSource && fmt.discriminatorSource !== 'NONE' && fmt.discriminatorField) {
    const srcLabel = fmt.discriminatorSource === 'BODY' ? 'body' : 'header'
    return (
      <span className="text-xs">
        <span className="text-[var(--t-text-muted)]">{srcLabel}.</span>
        <span className="font-mono text-[var(--t-text)]">{fmt.discriminatorField}</span>
        {fmt.discriminatorValue && (
          <>
            <span className="mx-1 text-[var(--t-text-muted)]">=</span>
            <span className="font-mono text-[#60A5FA]">{fmt.discriminatorValue}</span>
          </>
        )}
      </span>
    )
  }
  return <span className="text-xs text-[var(--t-text-muted)] italic">no rule</span>
}

// ─── Audit cell ────────────────────────────────────────────
function AuditCell({ fmt }: { fmt: MessageFormat }) {
  if (!fmt.auditEnabled) {
    return <span className="text-xs text-[var(--t-text-muted)]">—</span>
  }
  const action = (fmt as any).actionType as string | undefined
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-[#34D399]">✓</span>
      {action ? (
        <span className="text-[11px] font-semibold text-[var(--t-text)]">{action}</span>
      ) : (
        <span className="text-[var(--t-text-muted)]">on</span>
      )}
    </span>
  )
}

// Reusable Th — matches the styling used by the audit-configs /
// field-mappings / clients tables so all admin tables look the same.
function FmtTh({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-muted)]', className)}>
      {children}
    </th>
  )
}

function FormatsTable({
  formats, routingKey, onEdit, onDelete, isDeleting,
}: {
  formats: MessageFormat[]
  routingKey?: string
  onEdit: (fmt: MessageFormat) => void
  onDelete: (fmt: MessageFormat) => void
  isDeleting: boolean
}) {
  return (
    <div className="rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
            <FmtTh>Format</FmtTh>
            <FmtTh>Match Rule</FmtTh>
            <FmtTh>Flow</FmtTh>
            <FmtTh>Audit</FmtTh>
            <FmtTh>Status</FmtTh>
            <FmtTh className="w-20 text-right">Actions</FmtTh>
          </tr>
        </thead>
        <tbody>
          {formats.map((fmt) => {
            const isDefault = Boolean((fmt as any).isDefault)
            return (
              <tr
                key={fmt.id}
                className="border-b border-[var(--t-border-light)] hover:bg-[var(--t-panel-hover)] cursor-pointer last:border-0"
                onClick={() => onEdit(fmt)}
              >
                <td className="px-4 py-2.5 align-top">
                  <div className="flex items-center gap-2">
                    {isDefault && <span title="Default fallback">⭐</span>}
                    <span className="font-medium text-[var(--t-text)] truncate max-w-[220px]">{fmt.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <FormatTypeBadge type={fmt.formatType || 'STANDARD'} />
                    {(fmt as any).code && (
                      <code className="text-[10px] font-mono text-[var(--t-text-muted)]">{(fmt as any).code}</code>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 align-top">
                  <MatchRuleCell fmt={fmt} sharedKey={routingKey} />
                </td>
                <td className="px-4 py-2.5 align-top">
                  {fmt.flow ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--t-text)]">
                      <Workflow className="w-3 h-3 text-[#A78BFA]" />
                      {fmt.flow.name}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--t-text-muted)]">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 align-top">
                  <AuditCell fmt={fmt} />
                </td>
                <td className="px-4 py-2.5 align-top">
                  <StatusBadge status={fmt.status} />
                </td>
                <td
                  className="px-4 py-2.5 align-top text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => onEdit(fmt)}
                      className="p-1 rounded hover:bg-[var(--t-panel-hover)]"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[var(--t-text-muted)]" />
                    </button>
                    <button
                      onClick={() => onDelete(fmt)}
                      disabled={isDeleting}
                      className="p-1 rounded hover:bg-red-500/10 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FormatForm({
  form, setForm, onDetectFields, isDetecting, isSharedEndpoint, routingKey, flows,
  formatId, projectId,
}: {
  form: FormatFormState
  setForm: React.Dispatch<React.SetStateAction<FormatFormState>>
  onDetectFields: () => void
  isDetecting: boolean
  isSharedEndpoint?: boolean
  routingKey?: string
  flows?: any[]
  /** When set (edit mode), the form fetches and lists ScreenButtons
   *  that already bind to this format under the Call Sites section.
   *  Create-mode renders a "save first" hint instead. */
  formatId?: string
  projectId?: string
}) {
  const set = (key: keyof FormatFormState, value: any) => setForm(prev => ({ ...prev, [key]: value }))
  const [newManual, setNewManual] = useState({ path: '', name: '', type: 'string' })

  // Pull library options for the two dropdowns (Field Mapping +
  // Audit Config). Cheap query, cached project-scoped.
  const { data: fmData } = useQuery({
    queryKey: ['field-mappings'],
    queryFn: () => fieldMappingApi.list(),
  })
  const { data: acData } = useQuery({
    queryKey: ['audit-configs'],
    queryFn: () => auditConfigApi.list(),
  })
  // Datasets pickable for the Datasets block in Advanced.
  // Fetched once, paginated up to 500 entries which is plenty for the
  // current scale (project-scoped via the API filter).
  // Fetch in tree mode + flatten in tree order so the dataset picker
  // mirrors the order admins see on /orch/datasets (parent before its
  // children, sortOrder respected, leading-number labels stay in
  // numeric order — '1) …' before '10) …' instead of string sort).
  const { data: dsData } = useQuery({
    queryKey: ['datasets-tree'],
    queryFn: () => datasetApi.list({ tree: true, limit: 500 }),
  })
  const fmLibs: any[] = (fmData as any)?.data ?? []
  const acLibs: any[] = (acData as any)?.data ?? []
  // Flatten the tree response so the picker is a single list yet still
  // shows parents before children. Each item gets a depth marker the
  // checkbox row can use to indent.
  const allDatasets: any[] = (() => {
    const root: any[] = (dsData as any)?.data ?? []
    const out: any[] = []
    const walk = (nodes: any[], depth = 0) => {
      const sorted = [...nodes].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      for (const n of sorted) {
        out.push({ ...n, _depth: depth })
        if (n.children?.length) walk(n.children, depth + 1)
      }
    }
    walk(root, 0)
    return out
  })()

  const toggleExtract = (fieldId: string) => {
    setForm(prev => ({
      ...prev,
      extractSelected: prev.extractSelected.includes(fieldId)
        ? prev.extractSelected.filter(id => id !== fieldId)
        : [...prev.extractSelected, fieldId],
    }))
  }
  const toggleAudit = (fieldId: string) => {
    setForm(prev => ({
      ...prev,
      auditSelected: prev.auditSelected.includes(fieldId)
        ? prev.auditSelected.filter(id => id !== fieldId)
        : [...prev.auditSelected, fieldId],
    }))
  }

  const addManualField = () => {
    if (!newManual.path || !newManual.name) return
    setForm(prev => ({
      ...prev,
      manualFields: [...prev.manualFields, { ...newManual }],
    }))
    setNewManual({ path: '', name: '', type: 'string' })
  }

  const removeManualField = (idx: number) => {
    setForm(prev => ({
      ...prev,
      manualFields: prev.manualFields.filter((_, i) => i !== idx),
    }))
  }

  // Build JSX once per section, then pick which to render below.
  // Inline conditional rendering keeps section state co-located with
  // form state — no prop-drilling section helpers needed.

  const usingFmLib = Boolean(form.fieldMappingId)
  const usingAcLib = Boolean(form.auditConfigId)

  // Single-page numbered form. Top-down read order matches the
  // questions admins ask themselves: ① what is it · ② when does it
  // match · ③ what runs · ④ should we audit · ⑤ where is it called.
  // Advanced settings (data extraction, search keys, library override)
  // hide behind a toggle so 80% of formats can be saved with ~5 inputs.

  return (
    <div className="space-y-6">
      {/* ─── General ─── */}
      <FormSection title="General">
        <FormRow label="Name" required>
          <InputField value={form.name} onChange={v => set('name', v)} />
        </FormRow>
        <FormRow label="Format Type">
          <div className="max-w-xs">
            <SelectField
              value={form.formatType}
              onChange={v => set('formatType', v)}
              options={FORMAT_TYPES.map(t => ({ value: t.value, label: t.label }))}
            />
          </div>
        </FormRow>
        <FormRow label="Description">
          <TextAreaField value={form.description} onChange={v => set('description', v)} rows={2} />
        </FormRow>
      </FormSection>

      {/* ─── Matching Rule ─── */}
      <FormSection title="Matching Rule">
        <FormRow label="Mode">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="match-mode"
                checked={!form.isDefault}
                onChange={() => set('isDefault', false)}
                className="w-3.5 h-3.5 text-[var(--t-accent)] focus:ring-[var(--t-accent)]"
              />
              <span className="text-sm text-[var(--t-text)]">Match by value</span>
              <span className="text-[11px] text-[var(--t-text-muted)]">— trigger only when a specific value appears in the request</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="match-mode"
                checked={form.isDefault}
                onChange={() => set('isDefault', true)}
                className="w-3.5 h-3.5 text-[var(--t-accent)] focus:ring-[var(--t-accent)]"
              />
              <span className="text-sm text-[var(--t-text)]">Default fallback</span>
              <span className="text-[11px] text-[var(--t-text-muted)]">— catch-all when no other format matches</span>
            </label>
          </div>
        </FormRow>

        {!form.isDefault && (
          <>
            {isSharedEndpoint && routingKey ? (
              <>
                <FormRow label="Source">
                  <span className="text-sm text-[var(--t-text-muted)]">
                    Request body field <code className="font-mono text-[var(--t-text)]">{routingKey}</code> (set at API level)
                  </span>
                </FormRow>
                <FormRow label="Match Value" required>
                  <div className="max-w-md">
                    <InputField
                      value={form.discriminatorValue}
                      onChange={v => {
                        set('discriminatorValue', v)
                        set('discriminatorSource', 'BODY')
                        set('discriminatorField', routingKey)
                      }}
                    />
                  </div>
                </FormRow>
              </>
            ) : (
              <>
                <FormRow label="Source">
                  <div className="max-w-xs">
                    <SelectField
                      value={form.discriminatorSource}
                      onChange={v => set('discriminatorSource', v)}
                      options={[
                        { value: 'NONE',   label: '— Select source —' },
                        { value: 'BODY',   label: 'Request body' },
                        { value: 'HEADER', label: 'Request header' },
                      ]}
                    />
                  </div>
                </FormRow>
                {form.discriminatorSource !== 'NONE' && (
                  <>
                    <FormRow label="Field">
                      <div className="max-w-md">
                        <InputField value={form.discriminatorField} onChange={v => set('discriminatorField', v)} />
                      </div>
                    </FormRow>
                    <FormRow label="Match Value">
                      <div className="max-w-md">
                        <InputField value={form.discriminatorValue} onChange={v => set('discriminatorValue', v)} />
                      </div>
                    </FormRow>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Helper preview — small muted line, not a banner */}
        <FormRow label=" ">
          <MatchPreviewInline form={form} routingKey={routingKey} />
        </FormRow>

        {/* Additional AND-rules. Shown for any non-NONE source —
            same field can carry multiple values (e.g. flowName AND
            action) without forcing the admin to invent compound
            discriminator strings. */}
        {form.discriminatorSource !== 'NONE' && (
          <FormRow label="Additional Rules">
            <div className="space-y-2">
              <div className="text-[11px] text-[var(--t-text-muted)]">
                Optional. Format matches only when every rule below also holds. Useful when the primary discriminator alone (e.g. <code className="font-mono">$.flowName</code>) is shared by multiple actions and a second field (e.g. <code className="font-mono">$.object.input_*.request.action</code>) is what tells them apart.
              </div>
              {form.matchRules.map((r, i) => (
                <div key={i} className="grid grid-cols-[110px_1fr_1fr_auto] gap-2">
                  <SelectField
                    value={r.source}
                    onChange={(v) => {
                      const next = [...form.matchRules]
                      next[i] = { ...next[i], source: v as 'BODY' | 'HEADER' }
                      set('matchRules', next)
                    }}
                    options={[
                      { value: 'BODY', label: 'Body' },
                      { value: 'HEADER', label: 'Header' },
                    ]}
                  />
                  <InputField
                    value={r.field}
                    onChange={(v) => {
                      const next = [...form.matchRules]
                      next[i] = { ...next[i], field: v }
                      set('matchRules', next)
                    }}
                  />
                  <InputField
                    value={r.value}
                    onChange={(v) => {
                      const next = [...form.matchRules]
                      next[i] = { ...next[i], value: v }
                      set('matchRules', next)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => set('matchRules', form.matchRules.filter((_, j) => j !== i))}
                    className="px-2 text-[var(--t-text-muted)] hover:text-[#F87171]"
                    title="Remove rule"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set('matchRules', [...form.matchRules, { source: 'BODY', field: '', value: '' }])}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-[#3B82F618] text-[#60A5FA] hover:bg-[#3B82F628]"
              >
                <Plus className="w-3.5 h-3.5" />
                Add rule
              </button>
            </div>
          </FormRow>
        )}

      </FormSection>

      {/* ─── Execution ─── */}
      <FormSection title="Execution">
        <FormRow label="Flow">
          {isSharedEndpoint && flows && flows.length > 0 ? (
            <div className="max-w-md">
              <SelectField
                value={form.flowId}
                onChange={v => set('flowId', v)}
                options={flows.map((f: any) => ({ value: f.id, label: f.name }))}
                placeholder="— Select flow —"
              />
            </div>
          ) : (
            <span className="text-sm text-[var(--t-text-muted)]">
              Configured at the API level (Dedicated endpoint).
            </span>
          )}
        </FormRow>
      </FormSection>

      {/* ─── Audit Trail ─── */}
      <FormSection title="Audit Trail">
        <FormRow label="Logging">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.auditEnabled}
              onChange={e => set('auditEnabled', e.target.checked)}
              className="w-4 h-4 rounded border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-accent)] focus:ring-[var(--t-accent)]"
            />
            <span className="text-sm text-[var(--t-text)]">Enable audit logging for this format</span>
          </label>
        </FormRow>

        {form.auditEnabled && (
          <>
            <FormRow label="Action Type">
              <div className="max-w-xs">
                <Combobox
                  value={form.actionType || ''}
                  onChange={(v) => set('actionType', v)}
                  placeholder="— Select —"
                  options={[
                    { value: 'READ', label: 'READ' },
                    { value: 'SEARCH', label: 'SEARCH' },
                    { value: 'CREATE', label: 'CREATE' },
                    { value: 'UPDATE', label: 'UPDATE' },
                    { value: 'DELETE', label: 'DELETE' },
                    { value: 'CLONE', label: 'CLONE' },
                    { value: 'SUBMIT', label: 'SUBMIT' },
                    { value: 'APPROVE', label: 'APPROVE' },
                    { value: 'REJECT', label: 'REJECT' },
                    { value: 'SIGNOFF', label: 'SIGNOFF' },
                    { value: 'EXPORT', label: 'EXPORT' },
                    { value: 'DOWNLOAD', label: 'DOWNLOAD' },
                    { value: 'COMMENT', label: 'COMMENT' },
                    { value: 'NOTIFY', label: 'NOTIFY' },
                    { value: 'OTHER', label: 'OTHER' },
                  ]}
                />
              </div>
            </FormRow>
            <FormRow label="Action Label">
              <div className="max-w-md">
                <InputField value={form.actionLabel || ''} onChange={v => set('actionLabel', v)} />
              </div>
            </FormRow>
          </>
        )}
      </FormSection>

      {/* ─── Bindings ─── */}
      <FormSection title="Bindings">
        <CallSitesSection formatId={formatId} projectId={projectId} />
      </FormSection>

      {/* Advanced blocks always rendered (no collapsible toggle —
          admins asked for everything visible at once). */}
      <div className="border-t border-[var(--t-border)] pt-4">
        <div className="space-y-6 pl-2 border-l-2 border-[var(--t-border-light)]">
            {/* Format Code + Status */}
            <AdvancedBlock title="Identifier">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Format Code">
                  <InputField value={form.code || ''} onChange={v => set('code', v)} />
                </FormField>
                <FormField label="Status">
                  <SelectField
                    value={form.status}
                    onChange={v => set('status', v as ApiStatus)}
                    options={API_STATUSES}
                  />
                </FormField>
              </div>
            </AdvancedBlock>

            {/* Library bindings */}
            <AdvancedBlock title="Library Bindings">
              <FormField label={
                <span className="flex items-center gap-2">
                  Field Mapping
                  <a
                    href={`/orch/projects/${projectId}/field-mappings`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[var(--t-accent)] hover:underline"
                  >
                    + New / Manage library
                  </a>
                </span>
              }>
                <SelectField
                  value={form.fieldMappingId}
                  onChange={v => set('fieldMappingId', v)}
                  placeholder="— None —"
                  options={fmLibs.map((fm: any) => ({ value: fm.id, label: `${fm.name}${fm.refType ? ` · ${fm.refType}` : ''}` }))}
                />
              </FormField>
              {usingFmLib && (
                <InheritedFromLibrary
                  lib={fmLibs.find((fm: any) => fm.id === form.fieldMappingId)}
                  onClear={() => set('fieldMappingId', '')}
                />
              )}

              <FormField label={
                <span className="flex items-center gap-2">
                  Audit Config
                  <a
                    href={`/orch/projects/${projectId}/audit-configs`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[var(--t-accent)] hover:underline"
                  >
                    + New / Manage library
                  </a>
                </span>
              }>
                <SelectField
                  value={form.auditConfigId}
                  onChange={v => set('auditConfigId', v)}
                  placeholder="— None —"
                  options={acLibs.map((ac: any) => ({ value: ac.id, label: `${ac.name}${ac.enabled === false ? ' (disabled)' : ''}` }))}
                />
              </FormField>
              {usingAcLib && (
                <div className="rounded-md border border-[#34D39938] bg-[#34D3990F] p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-[#34D399]" />
                    <span className="font-semibold text-[#34D399]">
                      Inherited: {acLibs.find((ac: any) => ac.id === form.auditConfigId)?.name}
                    </span>
                  </div>
                </div>
              )}
            </AdvancedBlock>

            {/* Datasets touched. Multi-select via simple
                checkbox list (avoids dragging in heavyweight combobox).
                Selecting a dataset means "this format reads/writes
                that catalog" — audit rows tag every selected id so
                /audit can filter "show all changes to dataset X". */}
            <AdvancedBlock title="Datasets">
              <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg)] max-h-48 overflow-y-auto p-1.5">
                {allDatasets.length === 0 ? (
                  <p className="text-[11px] text-[var(--t-text-muted)] italic px-2 py-1.5">No datasets yet — register one at /orch/datasets.</p>
                ) : (
                  allDatasets.map((ds: any) => {
                    const checked = form.dataCatalogIds.includes(ds.id)
                    const depth = ds._depth ?? 0
                    return (
                      <label
                        key={ds.id}
                        className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-[var(--t-panel-hover)] rounded"
                        style={{ paddingLeft: 8 + depth * 14 }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? form.dataCatalogIds.filter(id => id !== ds.id)
                              : [...form.dataCatalogIds, ds.id]
                            set('dataCatalogIds', next)
                          }}
                          className="w-3.5 h-3.5"
                        />
                        <span className="text-[var(--t-text)]">{ds.name}</span>
                        <span className="text-[10px] text-[var(--t-text-muted)] ml-auto">{ds.category}</span>
                      </label>
                    )
                  })
                )}
              </div>
              {form.dataCatalogIds.length > 0 && (
                <p className="text-[11px] text-[var(--t-text-muted)]">
                  {form.dataCatalogIds.length} dataset{form.dataCatalogIds.length === 1 ? '' : 's'} selected
                </p>
              )}
            </AdvancedBlock>

            {/* Field-level masking. JSONPath strings
                whose values get replaced with "***" before being
                written to audit_logs.newValues. Comma-separated for
                quick entry; rendered as chips when present. */}
            <AdvancedBlock title="Mask Paths" hint="JSONPath fields to redact before audit (PII, password, financial). Comma-separated.">
              <input
                type="text"
                value={form.maskPaths.join(', ')}
                onChange={e =>
                  set(
                    'maskPaths',
                    e.target.value
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="$.password, $.creditCard, $.id_card"
                className="w-full px-2.5 py-1.5 text-sm font-mono rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
              />
              {form.maskPaths.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {form.maskPaths.map(p => (
                    <code key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {p}
                    </code>
                  ))}
                </div>
              )}
            </AdvancedBlock>

            {/* Search keys / direct ref paths (only if no FM library) */}
            {!usingFmLib && (
              <AdvancedBlock title="Reference Paths" hint="Used for log search · per-format if no library is bound">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField label="Reference Type">
                    <Combobox
                      value={form.refType}
                      onChange={(v) => set('refType', v)}
                      options={REF_TYPE_OPTS as any}
                      placeholder="— Select —"
                    />
                  </FormField>
                  <FormField label="Reference Name Path">
                    <InputField value={form.refNamePath} onChange={v => set('refNamePath', v)} />
                  </FormField>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FormField label="REF_ID Path">
                    <InputField value={form.refIdPath} onChange={v => set('refIdPath', v)} />
                  </FormField>
                  <FormField label="REF_NO Path">
                    <InputField value={form.refNoPath} onChange={v => set('refNoPath', v)} />
                  </FormField>
                  <FormField label="USER_ID Path">
                    <InputField value={form.userIdPath} onChange={v => set('userIdPath', v)} />
                  </FormField>
                </div>
                <FormField label="PK XPath (Entity Primary Key)">
                  <InputField value={form.pkXPath} onChange={v => set('pkXPath', v)} />
                </FormField>
              </AdvancedBlock>
            )}

            {/* Username Extraction (only if no FM library) */}
            {!usingFmLib && (
              <AdvancedBlock title="Username Extraction" hint="How to identify who triggered the request">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FormField label="Source">
                    <Combobox
                      value={form.usernameSource}
                      onChange={(v) => set('usernameSource', v)}
                      options={USERNAME_SOURCES_OPTS as any}
                      placeholder="— Select —"
                    />
                  </FormField>
                  {form.usernameSource && form.usernameSource !== 'STATIC' && form.usernameSource !== 'SESSION' && (
                    <div className="md:col-span-2">
                      <FormField label={form.usernameSource === 'JWT_CLAIM' ? 'Claim name' : form.usernameSource === 'HEADER' ? 'Header name' : 'JSONPath'}>
                        <InputField value={form.usernameField} onChange={v => set('usernameField', v)} />
                      </FormField>
                    </div>
                  )}
                  {form.usernameSource === 'STATIC' && (
                    <div className="md:col-span-2">
                      <FormField label="Fixed Username">
                        <InputField value={form.usernameStatic} onChange={v => set('usernameStatic', v)} />
                      </FormField>
                    </div>
                  )}
                </div>
              </AdvancedBlock>
            )}

            {/* Field Extraction */}
            <AdvancedBlock title="Field Detection" hint="Paste a request sample to auto-detect fields for audit logging">
              <FormField label="JSON Sample">
                <TextAreaField
                  value={form.jsonSample}
                  onChange={v => set('jsonSample', v)}
                  rows={5}
                />
              </FormField>
              <button
                type="button"
                onClick={onDetectFields}
                disabled={isDetecting || !form.jsonSample.trim()}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: THEME.accent }}
              >
                {isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Auto-detect Fields
              </button>

              {form.extractedFields.length > 0 && (
                <div className="border border-[var(--t-border)] rounded-lg overflow-hidden">
                  <div className="bg-[var(--t-input)] px-3 py-2 flex items-center gap-2 text-xs font-semibold text-[var(--t-text-muted)] border-b border-[var(--t-border)]">
                    <span className="flex-1 min-w-0">Field / Path</span>
                    <span className="w-14 text-center shrink-0">Type</span>
                    <span className="w-12 text-center shrink-0">Extract</span>
                    <span className="w-12 text-center shrink-0">Audit</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {form.extractedFields.map(field => (
                      <div
                        key={field.id}
                        className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-panel-hover)] last:border-0 hover:bg-[var(--t-panel)]"
                        style={{ paddingLeft: `${12 + (field.depth || 0) * 16}px` }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={cn("text-sm truncate", field.isNestedJson ? "text-[#A78BFA] font-medium" : "text-[var(--t-text)]")}>
                            {field.depth > 0 && <span className="text-[#3A3F50] mr-1">{'└'}</span>}
                            {field.fieldName}
                            {field.isNestedJson && <span className="ml-1 text-[10px] text-[#A78BFA]">🔗</span>}
                            {field.sensitive && <span className="ml-1 text-[10px] text-[#F59E0B]">⚠</span>}
                          </div>
                          <div className="text-[10px] text-[var(--t-text-muted)] font-mono truncate" title={field.fieldPath}>{field.fieldPath}</div>
                        </div>
                        <span className="w-14 text-center text-xs text-[var(--t-text-secondary)] shrink-0">{field.fieldType}</span>
                        <span className="w-12 text-center shrink-0">
                          <input
                            type="checkbox"
                            checked={form.extractSelected.includes(field.id)}
                            onChange={() => toggleExtract(field.id)}
                            className="w-3.5 h-3.5 rounded border-[var(--t-border)] bg-[var(--t-input)] text-[#3B82F6] focus:ring-[#3B82F6]"
                          />
                        </span>
                        <span className="w-12 text-center shrink-0">
                          <input
                            type="checkbox"
                            checked={form.auditSelected.includes(field.id)}
                            onChange={() => toggleAudit(field.id)}
                            className="w-3.5 h-3.5 rounded border-[var(--t-border)] bg-[var(--t-input)] text-[#10B981] focus:ring-[#10B981]"
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {form.manualFields.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-[var(--t-text-muted)] uppercase tracking-wider">Manual Fields</span>
                  {form.manualFields.map((mf, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm py-1 px-2 bg-[var(--t-bg)] rounded-md">
                      <span className="text-[var(--t-text)] font-mono text-xs flex-1 truncate">{mf.path}</span>
                      <span className="text-[var(--t-text-secondary)]">{mf.name}</span>
                      <span className="text-[var(--t-text-muted)] text-xs">{mf.type}</span>
                      <button onClick={() => removeManualField(idx)} className="text-[#F87171] hover:text-[#EF4444]">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 pt-1">
                <div className="flex-1">
                  <FormField label="Add JSONPath">
                    <InputField value={newManual.path} onChange={v => setNewManual(p => ({ ...p, path: v }))} />
                  </FormField>
                </div>
                <div className="w-36">
                  <FormField label="Name">
                    <InputField value={newManual.name} onChange={v => setNewManual(p => ({ ...p, name: v }))} />
                  </FormField>
                </div>
                <div className="w-28">
                  <FormField label="Type">
                    <SelectField value={newManual.type} onChange={v => setNewManual(p => ({ ...p, type: v }))} options={[
                      { value: 'string', label: 'string' }, { value: 'number', label: 'number' },
                      { value: 'boolean', label: 'boolean' }, { value: 'json', label: 'json' },
                      { value: 'datetime', label: 'datetime' },
                    ]} />
                  </FormField>
                </div>
                <button
                  type="button"
                  onClick={addManualField}
                  disabled={!newManual.path || !newManual.name}
                  className="flex items-center gap-1 px-3 py-1.5 mb-[1px] rounded-md text-sm font-medium text-[#60A5FA] bg-[#3B82F618] hover:bg-[#3B82F630] transition-colors disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            </AdvancedBlock>
        </div>
      </div>
    </div>
  )
}

// ─── Formal section header used by FormatForm ─────────────────────
// Plain noun-phrase title with a thin border below it. Matches the
// pattern used by enterprise admin tools (no decorative icons /
// circles / colored cards). Each child uses <FormRow> for label-left,
// input-right alignment so the form scans as a structured spec sheet.
function FormSection({
  title, children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="border-b border-[var(--t-border-light)] pb-2 mb-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--t-text-secondary)]">
          {title}
        </h3>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  )
}

// ─── Two-column form row: label left, input right ────────────────
// Mirrors the layout used on the rest of the admin (Project Settings,
// API Information). 200px label gutter, input fills the rest.
function FormRow({
  label, required, children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-2 md:gap-4 md:items-start">
      <label className="text-xs font-medium text-[var(--t-text-secondary)] md:pt-1.5">
        {label !== ' ' && (
          <>
            {label}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </>
        )}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ─── Inline match preview — small muted helper text ──────────────
function MatchPreviewInline({
  form, routingKey,
}: {
  form: FormatFormState
  routingKey?: string
}) {
  let preview: React.ReactNode
  if (form.isDefault) {
    preview = <>Catch-all when no other format matches</>
  } else if (routingKey && form.discriminatorValue) {
    preview = <>body.<code className="font-mono">{routingKey}</code> = <code className="font-mono">{`"${form.discriminatorValue}"`}</code></>
  } else if (form.discriminatorSource && form.discriminatorSource !== 'NONE' && form.discriminatorField) {
    preview = (
      <>
        <code className="font-mono">{form.discriminatorSource.toLowerCase()}.{form.discriminatorField}</code>
        {form.discriminatorValue && <> = <code className="font-mono">{`"${form.discriminatorValue}"`}</code></>}
      </>
    )
  } else {
    preview = <span className="italic">Incomplete — please fill in the rule above</span>
  }
  return (
    <div className="text-[11px] text-[var(--t-text-muted)]">
      <span className="font-medium">Effective rule: </span>
      <span className="text-[var(--t-text)]">{preview}</span>
    </div>
  )
}

// ─── Advanced sub-block (used inside the Advanced collapsible) ───
function AdvancedBlock({
  title, hint, children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold text-[var(--t-text-muted)] uppercase tracking-wider">{title}</div>
        {hint && <div className="text-[11px] text-[var(--t-text-muted)] mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * Call Sites panel — list of ScreenButtons that trigger this
 * MessageFormat. Editable inline so admins don't need to navigate to
 * /projects/{id}/clients to bind a button. Cascading form: pick (or
 * create) Client → Screen → Button. Each binding can carry an optional
 * detection rule (REFERER / HEADER / BODY_PATH / QUERY) — that's the
 * "OR" leg of multi-rule matching.
 */
function CallSitesSection({ formatId, projectId }: { formatId?: string; projectId?: string }) {
  const qc = useQueryClient()
  const enabled = !!formatId
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['call-sites', formatId],
    queryFn: () => messageFormatApi.callSites(formatId!),
    enabled,
  })
  const sites: any[] = (data as any)?.data ?? []

  // Group by client → screen for nicer scanning
  const groups: Record<string, { client?: any; screens: Record<string, { screen: any; buttons: any[] }> }> = {}
  for (const b of sites) {
    const clientKey = b.screen?.client?.id ?? 'unknown'
    const screenKey = b.screen?.id ?? 'unknown'
    if (!groups[clientKey]) groups[clientKey] = { client: b.screen?.client, screens: {} }
    if (!groups[clientKey].screens[screenKey]) groups[clientKey].screens[screenKey] = { screen: b.screen, buttons: [] }
    groups[clientKey].screens[screenKey].buttons.push(b)
  }

  const removeBinding = useMutation({
    mutationFn: ({ screenId, buttonId }: { screenId: string; buttonId: string }) =>
      screenApi.buttons.delete(screenId, buttonId),
    onSuccess: () => {
      toast.success('Binding removed')
      qc.invalidateQueries({ queryKey: ['call-sites', formatId] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Remove failed'),
  })

  if (!enabled) {
    return (
      <p className="text-xs text-[var(--t-text-muted)] italic">
        Save the format first, then bind it to one or more buttons here.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-xs text-[var(--t-text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin inline mr-1" />Loading…
        </p>
      ) : sites.length === 0 ? (
        <p className="text-xs text-[var(--t-text-muted)] italic">
          No bindings yet — add one below to wire this format up to a button.
        </p>
      ) : (
        <div className="space-y-2">
          {Object.values(groups).map((g, i) => (
            <div key={i} className="rounded-md bg-[var(--t-panel)] border border-[var(--t-border)] overflow-hidden">
              <div className="px-3 py-1.5 bg-[var(--t-bg)] border-b border-[var(--t-border)] flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span className="text-xs font-semibold text-[var(--t-text)]">{g.client?.name ?? 'Unbound'}</span>
                {g.client?.appCode && <code className="text-[10px] font-mono text-[var(--t-text-muted)]">{g.client.appCode}</code>}
              </div>
              {Object.values(g.screens).map((s, j) => (
                <div key={j} className="px-3 py-2 border-b border-[var(--t-border-light)] last:border-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <code className="text-[10px] font-mono text-[var(--t-text-secondary)]">{s.screen?.code}</code>
                    <span className="text-xs text-[var(--t-text)]">{s.screen?.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.buttons.map((b: any) => (
                      <span
                        key={b.id}
                        className="group/btn inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-[var(--t-bg)] border border-[var(--t-border)]"
                        title={b.detectionSource ? `${b.detectionSource}: ${b.detectionField} = ${b.detectionValue}` : undefined}
                      >
                        {b.tabName && <span className="text-[var(--t-text-muted)]">{b.tabName} ·</span>}
                        <span className="text-[var(--t-text)]">{b.buttonLabel}</span>
                        {b.actionType && <code className="text-[9px] text-[var(--t-text-muted)]">{b.actionType}</code>}
                        {b.detectionSource && <span className="text-[9px] text-[#A78BFA]">⚡{b.detectionSource}</span>}
                        <button
                          type="button"
                          onClick={async () => {
                            if (await confirmDialog({
                              title: `Remove binding "${b.buttonLabel}"?`,
                              body: 'The button will keep existing but will no longer trigger this format.',
                              variant: 'danger',
                              confirmLabel: 'Remove',
                            })) {
                              removeBinding.mutate({ screenId: s.screen.id, buttonId: b.id })
                            }
                          }}
                          className="opacity-0 group-hover/btn:opacity-100 transition-opacity text-[var(--t-text-muted)] hover:text-[#F87171]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add binding — inline cascading form */}
      {showAdd ? (
        <AddBindingForm
          formatId={formatId!}
          projectId={projectId}
          onCancel={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            qc.invalidateQueries({ queryKey: ['call-sites', formatId] })
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[#3B82F618] text-[#60A5FA] hover:bg-[#3B82F628] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add binding
        </button>
      )}
    </div>
  )
}

/**
 * AddBindingForm — single text-input combobox per level. Admins type
 * the Client / Screen name directly; on submit we look up by name and
 * auto-create if it doesn't exist. No "+ New …" links to click. Uses
 * native <datalist> for dropdown suggestions of existing entries.
 */
function AddBindingForm({
  formatId, projectId, onCancel, onAdded,
}: {
  formatId: string
  projectId?: string
  onCancel: () => void
  onAdded: () => void
}) {
  const qc = useQueryClient()
  // Free-form names — resolved (or auto-created) on submit
  const [clientName, setClientName] = useState('')
  const [clientCode, setClientCode] = useState('')
  const [screenCode, setScreenCode] = useState('')
  const [screenName, setScreenName] = useState('')
  const [buttonLabel, setButtonLabel] = useState('')
  const [tabName, setTabName] = useState('')
  const [actionType, setActionType] = useState('')
  const [detectionSource, setDetectionSource] = useState('')
  const [detectionField, setDetectionField] = useState('')
  const [detectionValue, setDetectionValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Existing clients for suggestions
  const { data: clientsData } = useQuery({
    queryKey: ['clients', projectId],
    queryFn: () => clientAppApi.list(projectId!),
    enabled: !!projectId,
  })
  const clients: any[] = (clientsData as any)?.data ?? []

  // Resolved client (matched by name OR appCode)
  const matchedClient = clients.find(
    (c: any) => c.name === clientName || (c.appCode && c.appCode === clientName) || (clientCode && c.appCode === clientCode),
  )
  const clientId = matchedClient?.id ?? ''

  // Existing screens for the resolved client
  const { data: screensData } = useQuery({
    queryKey: ['screens', { clientId }],
    queryFn: () => screenApi.list({ clientId }),
    enabled: !!clientId,
  })
  const screens: any[] = (screensData as any)?.data ?? []

  // Resolved screen (by code under the chosen client)
  const matchedScreen = screens.find((s: any) => s.code === screenCode)

  // Submit pipeline: find-or-create client → find-or-create screen → create button
  async function submit() {
    if (!projectId) {
      toast.error('Missing project context')
      return
    }
    if (!clientName.trim()) {
      toast.error('Please enter a client name')
      return
    }
    if (!screenCode.trim()) {
      toast.error('Please enter a screen code')
      return
    }
    if (!buttonLabel.trim()) {
      toast.error('Please enter a button label')
      return
    }
    setSubmitting(true)
    try {
      // 1) Resolve client
      let cId = matchedClient?.id
      if (!cId) {
        const res: any = await clientAppApi.create(projectId, {
          name: clientName.trim(),
          appCode: clientCode.trim() || null,
        })
        cId = res?.data?.id
        if (!cId) throw new Error('Could not create client')
      }
      // 2) Resolve screen
      let sId = screens.find((s: any) => s.code === screenCode)?.id
      if (!sId) {
        const res: any = await screenApi.create({
          code: screenCode.trim(),
          name: screenName.trim() || screenCode.trim(),
          clientId: cId,
          projectId,
        })
        sId = res?.data?.id
        if (!sId) throw new Error('Could not create screen')
      }
      // 3) Create the binding
      await screenApi.buttons.create(sId, {
        buttonLabel: buttonLabel.trim(),
        tabName: tabName.trim() || null,
        actionType: actionType || null,
        messageFormatId: formatId,
        detectionSource: detectionSource || null,
        detectionField: detectionField.trim() || null,
        detectionValue: detectionValue.trim() || null,
      })
      qc.invalidateQueries({ queryKey: ['clients', projectId] })
      qc.invalidateQueries({ queryKey: ['screens', { clientId: cId }] })
      toast.success('Binding added')
      onAdded()
    } catch (e: any) {
      toast.error(e?.message ?? 'Add binding failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = clientName.trim() && screenCode.trim() && buttonLabel.trim() && !submitting

  return (
    <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg)] p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--t-text-secondary)] pb-2 border-b border-[var(--t-border-light)]">
        New binding
      </div>

      {/* Client */}
      <FormRow label="Client">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input
              type="text"
              list="clients-list"
              placeholder="Client name"
              value={clientName}
              onChange={e => {
                setClientName(e.target.value)
                // If user picks an existing client, prefill the code field too
                const m = clients.find((c: any) => c.name === e.target.value || c.appCode === e.target.value)
                if (m && m.appCode) setClientCode(m.appCode)
              }}
              className="w-full px-2.5 py-1.5 text-sm rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
            />
            <datalist id="clients-list">
              {clients.map((c: any) => (
                <option key={c.id} value={c.name}>{c.appCode}</option>
              ))}
            </datalist>
          </div>
          <input
            type="text"
            placeholder="App code (optional)"
            value={clientCode}
            onChange={e => setClientCode(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm font-mono rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        {!matchedClient && clientName.trim() && (
          <p className="text-[11px] text-[var(--t-text-muted)] mt-1">New client — will be created on save.</p>
        )}
      </FormRow>

      {/* Screen */}
      <FormRow label="Screen">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            list="screens-list"
            placeholder="Screen code"
            value={screenCode}
            onChange={e => {
              setScreenCode(e.target.value)
              const m = screens.find((s: any) => s.code === e.target.value)
              if (m) setScreenName(m.name || '')
            }}
            className="w-full px-2.5 py-1.5 text-sm font-mono rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
          />
          <datalist id="screens-list">
            {screens.map((s: any) => (
              <option key={s.id} value={s.code}>{s.name}</option>
            ))}
          </datalist>
          <input
            type="text"
            placeholder="Screen name"
            value={screenName}
            onChange={e => setScreenName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        {!matchedScreen && screenCode.trim() && clientName.trim() && (
          <p className="text-[11px] text-[var(--t-text-muted)] mt-1">New screen — will be created on save.</p>
        )}
      </FormRow>

      {/* Button */}
      <FormRow label="Button Label">
        <input
          type="text"
          value={buttonLabel}
          onChange={e => setButtonLabel(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
        />
      </FormRow>

      <FormRow label="Tab">
        <input
          type="text"
          value={tabName}
          onChange={e => setTabName(e.target.value)}
          className="w-full max-w-xs px-2.5 py-1.5 text-sm rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
        />
      </FormRow>

      <FormRow label="Action Type">
        <div className="max-w-xs">
          <Combobox
            value={actionType}
            onChange={(v) => setActionType(v)}
            placeholder="—"
            options={[
              { value: 'READ', label: 'READ' },
              { value: 'CREATE', label: 'CREATE' },
              { value: 'UPDATE', label: 'UPDATE' },
              { value: 'DELETE', label: 'DELETE' },
              { value: 'SUBMIT', label: 'SUBMIT' },
              { value: 'APPROVE', label: 'APPROVE' },
              { value: 'REJECT', label: 'REJECT' },
              { value: 'SIGNOFF', label: 'SIGNOFF' },
              { value: 'EXPORT', label: 'EXPORT' },
              { value: 'OTHER', label: 'OTHER' },
            ]}
          />
        </div>
      </FormRow>

      {/* Detection rule — collapsed unless needed */}
      <FormRow label="Detection Rule">
        <details>
          <summary className="cursor-pointer text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-text)] mb-2">
            Configure auto-matching (optional)
          </summary>
          <div className="grid grid-cols-3 gap-2">
            <Combobox
              value={detectionSource}
              onChange={(v) => setDetectionSource(v)}
              placeholder="— Source —"
              options={[
                { value: 'REFERER', label: 'Referer URL' },
                { value: 'HEADER', label: 'Request header' },
                { value: 'BODY_PATH', label: 'Body field (JSONPath)' },
                { value: 'QUERY', label: 'Query param' },
                { value: 'MANUAL', label: 'Manual' },
              ]}
            />
            {detectionSource && detectionSource !== 'MANUAL' && (
              <>
                <input
                  type="text"
                  placeholder={detectionSource === 'REFERER' ? 'Regex pattern' : 'Field / param'}
                  value={detectionField}
                  onChange={e => setDetectionField(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Expected value"
                  value={detectionValue}
                  onChange={e => setDetectionValue(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
                />
              </>
            )}
          </div>
        </details>
      </FormRow>

      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--t-border-light)]">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-[var(--t-text-secondary)] hover:text-[var(--t-text)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md bg-[var(--t-accent)] text-white disabled:opacity-50 hover:bg-[#2563EB]"
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Add binding
        </button>
      </div>
    </div>
  )
}

function MessageFormatsTab({ apiId, apiData }: { apiId: string; apiData?: ApiRegistration }) {
  const queryClient = useQueryClient()
  // Single modal state instead of (showForm, expandedId). When set
  // the modal is open in either create or edit mode; when null it's
  // closed. Replaces the previous inline-expand pattern per admin
  // feedback ("change collapse to modal like the other screens").
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)

  const isSharedEndpoint = apiData?.routeType === 'SHARED_ENDPOINT'
  const routingKey = apiData?.routingKey || ''

  const [newFormat, setNewFormat] = useState<FormatFormState>({ ...emptyFormState })
  const [editForm, setEditForm] = useState<FormatFormState>({ ...emptyFormState })

  // Fetch flows for shared endpoint flow selector
  const { data: flowsData } = useQuery({
    queryKey: ['flows'],
    queryFn: () => flowApi.list({ limit: 500 }),
    enabled: isSharedEndpoint,
  })
  const flows = flowsData?.data || []

  // Fetch message formats
  const { data: formatsData, isLoading } = useQuery({
    queryKey: ['message-formats', apiId],
    queryFn: () => messageFormatApi.list({ apiRegistrationId: apiId }),
  })

  const formats: MessageFormat[] = formatsData?.data || []

  const createMutation = useMutation({
    mutationFn: (data: any) => messageFormatApi.create(data),
    onSuccess: () => {
      toast.success('Message Format created successfully')
      queryClient.invalidateQueries({ queryKey: ['message-formats', apiId] })
      setModal(null)
      setNewFormat({ ...emptyFormState })
    },
    onError: (err: any) => toast.error(`Create failed: ${err.message}`),
  })

  // Format autosave runs per-field while the edit modal is open, so
  // the toast/close-modal side-effects move out of onSuccess and
  // into handleUpdate. Otherwise every keystroke would close the
  // modal mid-edit.
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => messageFormatApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-formats', apiId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => messageFormatApi.delete(id),
    onSuccess: () => {
      toast.success('Message Format deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['message-formats', apiId] })
    },
    onError: (err: any) => toast.error(`Delete failed: ${err.message}`),
  })

  const buildPayload = (form: FormatFormState) => {
    const extractFields = form.extractedFields.filter(f => form.extractSelected.includes(f.id))
    const auditFields = form.extractedFields.filter(f => form.auditSelected.includes(f.id))

    return {
      name: form.name,
      description: form.description || undefined,
      apiRegistrationId: apiId,
      flowId: form.flowId || null,
      formatType: form.formatType,
      discriminatorSource: form.discriminatorSource,
      discriminatorField: form.discriminatorField || undefined,
      discriminatorValue: form.discriminatorValue || undefined,
      matchRules: form.matchRules.filter(r => r.field.trim() && r.value.trim()).length > 0
        ? form.matchRules.filter(r => r.field.trim() && r.value.trim())
        : null,
      auditEnabled: form.auditEnabled,
      status: form.status,
      pkXPath: form.pkXPath || undefined,
      refIdPath: form.refIdPath || undefined,
      refNoPath: form.refNoPath || undefined,
      userIdPath: form.userIdPath || undefined,
      // Action Context — what this format does on the server.
      code: form.code || undefined,
      actionType: form.actionType || undefined,
      actionLabel: form.actionLabel || undefined,
      extractionConfig: (form.jsonSample || form.manualFields.length > 0) ? {
        jsonSample: form.jsonSample || undefined,
        deepParseEnabled: true,
        detectedFields: form.extractedFields,
        manualFields: form.manualFields,
      } : undefined,
      fieldMappings: extractFields.length > 0 || form.manualFields.length > 0 ? [
        ...extractFields.map(f => ({ fieldName: f.fieldName, fieldPath: f.fieldPath, fieldType: f.fieldType, sensitive: f.sensitive })),
        ...form.manualFields.map(f => ({ fieldName: f.name, fieldPath: f.path, fieldType: f.type, sensitive: false })),
      ] : undefined,
      auditFields: auditFields.length > 0 ? auditFields.map(f => ({
        fieldName: f.fieldName, fieldPath: f.fieldPath, fieldType: f.fieldType,
      })) : undefined,
      // Library refs + override fields (Phase 4)
      fieldMappingId: form.fieldMappingId || null,
      auditConfigId:  form.auditConfigId  || null,
      isDefault:      form.isDefault,
      refType:        form.refType        || null,
      refNamePath:    form.refNamePath    || null,
      usernameSource: form.usernameSource || null,
      usernameField:  form.usernameField  || null,
      usernameStatic: form.usernameStatic || null,
      // Masking + dataset links
      maskPaths:      form.maskPaths.length ? form.maskPaths : null,
      dataCatalogIds: form.dataCatalogIds,
    }
  }

  const handleCreate = () => {
    if (!newFormat.name) { toast.error('Please enter a name'); return }
    createMutation.mutate(buildPayload(newFormat))
  }

  const handleUpdate = async (id: string) => {
    if (!editForm.name) { toast.error('Please enter a name'); return }
    // Cancel any pending autosave so we don't double-save.
    const payload = buildPayload(editForm)
    delete (payload as any).apiRegistrationId
    try {
      await updateMutation.mutateAsync({ id, data: payload })
      toast.success('Message Format saved')
      setModal(null)
      setEditingId(null)
    } catch (e: any) {
      toast.error(`Update failed: ${e?.message ?? 'Unknown error'}`)
    }
  }

  // Per-field autosave for the edit modal. Only active when the
  // modal is open in edit mode and a row id is selected. Manual
  // Save button still works (handleUpdate flushes via mutateAsync
  // and closes the modal).
  const editAutosave = useAutosave(editForm, {
    enabled: !!editingId && modal?.mode === 'edit',
    debounceMs: 1000,
    validate: (f) => !!f.name,
    save: async () => {
      if (!editingId) return
      const payload = buildPayload(editForm)
      delete (payload as any).apiRegistrationId
      await updateMutation.mutateAsync({ id: editingId, data: payload })
    },
  })

  const handleDetectFields = async (formSetter: React.Dispatch<React.SetStateAction<FormatFormState>>, jsonSample: string) => {
    if (!jsonSample.trim()) return
    setIsDetecting(true)
    try {
      const result = await messageFormatApi.generateFields(jsonSample)
      const fields: DetectedField[] = (result as any).fields || []
      formSetter(prev => ({
        ...prev,
        extractedFields: fields,
        extractSelected: fields.map(f => f.id),
        auditSelected: [],
      }))
      toast.success(`Detected ${fields.length} fields`)
    } catch (err: any) {
      toast.error(`Detection failed: ${err.message}`)
    } finally {
      setIsDetecting(false)
    }
  }

  const startEdit = (fmt: MessageFormat) => {
    setEditingId(fmt.id)
    const ec = fmt.extractionConfig as any
    const fm = fmt.fieldMappings as any
    const af = fmt.auditFields as any
    setEditForm({
      name: fmt.name || '',
      description: fmt.description || '',
      flowId: fmt.flowId || '',
      formatType: fmt.formatType || 'STANDARD',
      discriminatorSource: fmt.discriminatorSource || 'NONE',
      discriminatorField: fmt.discriminatorField || '',
      discriminatorValue: fmt.discriminatorValue || '',
      matchRules: Array.isArray((fmt as any).matchRules) ? (fmt as any).matchRules : [],
      auditEnabled: fmt.auditEnabled || false,
      status: fmt.status || 'DRAFT',
      refIdPath: fmt.refIdPath || '',
      refNoPath: fmt.refNoPath || '',
      userIdPath: fmt.userIdPath || '',
      // Action Context — what this format does on the server.
      code: (fmt as any).code || '',
      actionType: (fmt as any).actionType || '',
      actionLabel: (fmt as any).actionLabel || '',
      pkXPath: fmt.pkXPath || '',
      jsonSample: ec?.jsonSample || '',
      extractedFields: ec?.detectedFields || [],
      extractSelected: Array.isArray(fm) ? fm.map((_: any, i: number) => ec?.detectedFields?.[i]?.id).filter(Boolean) : [],
      auditSelected: Array.isArray(af) ? af.map((_: any, i: number) => ec?.detectedFields?.find((d: any) => d.fieldPath === af[i]?.fieldPath)?.id).filter(Boolean) : [],
      manualFields: ec?.manualFields || [],
      // Library refs + override fields (Phase 4)
      fieldMappingId: (fmt as any).fieldMappingId || '',
      auditConfigId:  (fmt as any).auditConfigId  || '',
      isDefault:      Boolean((fmt as any).isDefault),
      refType:        (fmt as any).refType        || '',
      refNamePath:    (fmt as any).refNamePath    || '',
      usernameSource: (fmt as any).usernameSource || '',
      usernameField:  (fmt as any).usernameField  || '',
      usernameStatic: (fmt as any).usernameStatic || '',
      // Dataset links + masking
      dataCatalogIds: Array.isArray((fmt as any).dataCatalogs)
        ? (fmt as any).dataCatalogs.map((c: any) => c.id)
        : [],
      maskPaths: Array.isArray((fmt as any).maskPaths) ? (fmt as any).maskPaths : [],
    })
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Spinner /></div>
  }

  const openCreateModal = () => {
    setNewFormat({ ...emptyFormState })
    setModal({ mode: 'create' })
  }
  const openEditModal = (fmt: MessageFormat) => {
    startEdit(fmt)
    setModal({ mode: 'edit', id: fmt.id })
  }
  const closeModal = () => {
    setModal(null)
    setEditingId(null)
  }

  return (
    <div className="space-y-4">
      {/* Header — matches the audit-configs / clients / field-mappings
          pages (title left, primary action right, no card wrapper) */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--t-text)]">Message Formats</h2>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--t-accent)] hover:bg-[#2563EB]"
        >
          <Plus className="w-4 h-4" />
          New Format
        </button>
      </div>

      {/* Format table — same shape as audit-configs / api-keys: panel
          background + border, FmtTh header row, hover-able body rows.
          Default fallback sorts to the top, then ACTIVE → DRAFT → ... */}
      {formats.length === 0 ? (
        <EmptyState message="No Message Formats for this API" icon={FileText} />
      ) : (
        <FormatsTable
          formats={[...formats].sort((a, b) => {
            const aDef = (a as any).isDefault ? 1 : 0
            const bDef = (b as any).isDefault ? 1 : 0
            if (aDef !== bDef) return bDef - aDef
            const order = { ACTIVE: 0, DRAFT: 1, INACTIVE: 2, DEPRECATED: 3 } as Record<string, number>
            return (order[a.status] ?? 9) - (order[b.status] ?? 9)
          })}
          routingKey={routingKey}
          onEdit={openEditModal}
          onDelete={async (fmt) => {
            if (await confirmDialog({
              title: `Delete "${fmt.name}"?`,
              body: 'Bindings (ScreenButtons) will be unlinked but stay in place.',
              variant: 'danger',
            })) deleteMutation.mutate(fmt.id)
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}

      {/* Modal — replaces the old inline expand/edit pattern. Same
           FormatForm component, just hosted inside a full-screen
           dialog so admins aren't squinting at a row-expand. */}
      {modal && (
        <MessageFormatModal
          mode={modal.mode}
          formatId={modal.mode === 'edit' ? modal.id : undefined}
          projectId={apiData?.projectId}
          isSharedEndpoint={isSharedEndpoint}
          routingKey={routingKey}
          flows={flows}
          isDetecting={isDetecting}
          isSaving={modal.mode === 'create' ? createMutation.isPending : updateMutation.isPending}
          form={modal.mode === 'create' ? newFormat : editForm}
          setForm={modal.mode === 'create' ? setNewFormat : setEditForm}
          // Autosave only in edit mode — create mode would generate
          // empty drafts on every keystroke.
          autosaveStatus={modal.mode === 'edit' ? editAutosave.status : undefined}
          autosaveError={modal.mode === 'edit' ? editAutosave.error : null}
          autosaveSavedAt={modal.mode === 'edit' ? editAutosave.savedAt : null}
          onDetectFields={() =>
            handleDetectFields(
              modal.mode === 'create' ? setNewFormat : setEditForm,
              (modal.mode === 'create' ? newFormat : editForm).jsonSample,
            )
          }
          onClose={closeModal}
          onSave={() => {
            if (modal.mode === 'create') {
              handleCreate()
            } else {
              handleUpdate(modal.id)
            }
          }}
        />
      )}
    </div>
  )
}

// ==================== MESSAGE FORMAT MODAL ====================
// Hosts FormatForm + Save/Cancel actions in a full-screen dialog.
// Replaces the row-expand pattern that admins found cramped.

function MessageFormatModal({
  mode,
  formatId,
  projectId,
  form,
  setForm,
  onClose,
  onSave,
  onDetectFields,
  isDetecting,
  isSaving,
  isSharedEndpoint,
  routingKey,
  flows,
  autosaveStatus,
  autosaveError,
  autosaveSavedAt,
}: {
  mode: 'create' | 'edit'
  formatId?: string
  projectId?: string
  form: FormatFormState
  setForm: React.Dispatch<React.SetStateAction<FormatFormState>>
  onClose: () => void
  onSave: () => void
  onDetectFields: () => void
  isDetecting: boolean
  isSaving: boolean
  isSharedEndpoint?: boolean
  routingKey?: string
  flows?: any[]
  autosaveStatus?: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  autosaveError?: string | null
  autosaveSavedAt?: number | null
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)]">
          <h2 className="text-base font-semibold text-[var(--t-text)]">
            {mode === 'create' ? 'New Message Format' : 'Edit Message Format'}
            {form.name && <span className="ml-2 text-[var(--t-text-muted)] font-normal">— {form.name}</span>}
          </h2>
          {/* Top-row actions: edit mode shows the autosave indicator
              alone; create mode shows the primary Create button up
              here so admins don't have to scroll to commit a draft. */}
          <div className="flex items-center gap-2">
            {autosaveStatus && (
              <AutosaveIndicator status={autosaveStatus} error={autosaveError ?? null} savedAt={autosaveSavedAt ?? null} />
            )}
            {mode === 'create' && (
              <button
                onClick={onSave}
                disabled={isSaving || !form.name}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ background: 'var(--t-accent)' }}
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Create format
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[var(--t-panel-hover)] text-[var(--t-text-muted)]"
              title={mode === 'edit' ? 'Close (changes are autosaved)' : 'Cancel'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body — single-page numbered form (① to ⑤) with an Advanced
            collapsible at the bottom. No sidebar — the form reads
            top-down and admins answer questions in order. */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <FormatForm
            form={form}
            setForm={setForm}
            onDetectFields={onDetectFields}
            isDetecting={isDetecting}
            isSharedEndpoint={isSharedEndpoint}
            routingKey={routingKey}
            flows={flows}
            formatId={formatId}
            projectId={projectId}
          />
        </div>

        {/* No footer action row — actions live in the top header
            now (autosave indicator + Create button + close X). */}
      </div>
    </div>
  )
}

// ==================== MAIN PAGE ====================

export default function ProjectApiDetailPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const apiId = params.apiId as string

  const [activeTab, setActiveTab] = useState<TabId>('general')
  // When General is active, this picks which sub-section to render
  // (basics / route-type / endpoint / auth / flow / limits / metadata).
  // The sidebar updates this on click; default 'basics' so first
  // visit shows the most-edited section.
  const [activeSection, setActiveSection] = useState<string>('basics')
  const [testOpen, setTestOpen] = useState(false)

  // Fetch API data
  const {
    data: apiData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project-api', apiId],
    queryFn: () => apiRegistrationApi.getById(apiId),
    enabled: !!apiId,
  })

  // Fetch MessageFormat count so the tab badge can show the real number
  // (helps admins realise the Message Formats tab is where the per-screen
  //  config lives — especially for shared-endpoint APIs like example-microflow).
  const { data: formatsList } = useQuery({
    queryKey: ['mf-count', apiId],
    queryFn: () => messageFormatApi.list({ apiRegistrationId: apiId }),
    enabled: !!apiId,
  })
  const formatsCount = Array.isArray(formatsList)
    ? formatsList.length
    : Array.isArray((formatsList as { data?: unknown })?.data)
    ? (formatsList as { data: unknown[] }).data.length
    : 0

  // Loading state
  if (isLoading) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <span className="text-sm text-[var(--t-text-muted)]">Loading...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !apiData) {
    return (
      <div style={{ fontFamily: FONT }} className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-10 h-10 text-[#FBBF24]" />
          <p className="text-sm text-[var(--t-text-secondary)]">API not found or an error occurred</p>
          <Link href={`/projects/${projectId}`} className="text-sm text-[#3B82F6] hover:underline">
            Back to Project
          </Link>
        </div>
      </div>
    )
  }

  const api = apiData as ApiRegistration

  return (
    <div style={{ fontFamily: FONT }} className="w-full max-w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Link
              href={`/projects/${projectId}`}
              className="mt-0.5 p-1.5 text-[var(--t-text-muted)] hover:text-[#F1F5F9] hover:bg-[var(--t-panel-hover)] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-[var(--t-text)]">{api.name}</h1>
                <MethodBadge method={api.method} />
                <StatusBadge status={api.status} />
                {api.deprecated && (
                  <Badge label="Deprecated" bg="#EF444418" color="#F87171" />
                )}
              </div>
              <p className="text-sm text-[var(--t-text-muted)] mt-0.5 font-mono truncate">{api.endpoint}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Slot for the autosave indicator. GeneralTab portals
                its <AutosaveIndicator /> here so the status is
                always visible at the top of the page, not buried
                at the bottom of whatever section is open. */}
            <div id="api-detail-autosave-slot" className="flex items-center" />
            {/* Test button — fires a real request through the gateway so
                admins can validate their routing config without Postman.
                Theme-matched (uses --t-accent like the rest of the
                page's primary actions) instead of the green pill. */}
            <button
              onClick={() => setTestOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
              style={{ background: 'var(--t-accent)' }}
              title="Send a real request through the broker"
            >
              <Play className="w-3.5 h-3.5" /> Test request
            </button>
          </div>
        </div>
      </div>

      <TestRequestModal
        api={{ id: api.id, name: api.name, method: api.method, endpoint: api.endpoint }}
        open={testOpen}
        onClose={() => setTestOpen(false)}
      />

      {/* Top tab strip removed — UnifiedSidebar (left) is the only nav
           surface now. Click a Module to switch the main panel; the
           General Sections list under it acts as anchor links into the
           long General page. */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <UnifiedSidebar
          activeTab={activeTab as any}
          setActiveTab={setActiveTab as any}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          formatsCount={formatsCount}
        />
        <div>
          {activeTab === 'general' && <GeneralTab apiData={api} apiId={apiId} projectId={projectId} activeSection={activeSection} />}
          {activeTab === 'auth' && <AuthTab apiId={apiId} />}
          {activeTab === 'headers' && <HeadersTab apiId={apiId} />}
          {activeTab === 'messages' && <MessageFormatsTab apiId={apiId} apiData={api} />}
        </div>
      </div>
    </div>
  )
}
