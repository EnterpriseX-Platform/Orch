'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiRegistrationApi, flowApi } from '@/lib/api'
import {
  ArrowLeft,
  Save,
  X,
  Globe,
  Shield,
  Link2,
  Info,
  Layers,
  FileText,
  CheckCircle2,
  Workflow,
  AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Combobox } from '@/components/ui/combobox'
import type {
  CreateApiInput,
  HttpMethod,
  AuthType,
  ApiType,
  ApiStatus,
  FlowIntegration,
  PaginatedResponse,
} from '@/types'

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

const methodColors: Record<string, string> = {
  GET: '#60A5FA',
  POST: '#10B981',
  PUT: '#F59E0B',
  DELETE: '#F87171',
  PATCH: '#A78BFA',
}

// ========== Reusable tiny components ==========

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${THEME.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon size={16} style={{ color: THEME.accent }} />
        <span
          style={{
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            color: THEME.text.primary,
            letterSpacing: '0.02em',
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label
      style={{
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: 500,
        color: THEME.text.secondary,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {children}
      {required && <span style={{ color: '#F87171' }}>*</span>}
    </label>
  )
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
}

const inputStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 13,
  padding: '6px 10px',
  border: `1px solid ${THEME.border}`,
  borderRadius: 6,
  outline: 'none',
  color: THEME.text.primary,
  background: 'var(--t-input)',
  width: '100%',
  transition: 'border-color 0.15s',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  paddingRight: 28,
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical' as const,
  minHeight: 60,
}

// ========== Page Component ==========

export default function ProjectNewApiRegistrationPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  // ---- Form state ----
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [apiType, setApiType] = useState<ApiType>('REST')
  const [endpoint, setEndpoint] = useState('')
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [backendUrl, setBackendUrl] = useState('')
  const [timeout, setTimeout_] = useState(30)
  const [retries, setRetries] = useState(3)

  // Auth
  const [authType, setAuthType] = useState<AuthType | 'inherit'>('inherit')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key')

  // Connections
  const [flowId, setFlowId] = useState('')
  const [dataCatalogId, setDataCatalogId] = useState('')
  const [rateLimitPerMin, setRateLimitPerMin] = useState(1000)

  // API Information
  const [version, setVersion] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactUrl, setContactUrl] = useState('')
  const [license_, setLicense] = useState('')
  const [termsOfService, setTermsOfService] = useState('')
  const [deprecated, setDeprecated] = useState(false)

  // Status
  const [status, setStatus] = useState<ApiStatus>('DRAFT')

  // ---- Data queries ----
  const { data: flowsData } = useQuery({
    queryKey: ['flows'],
    queryFn: () => flowApi.list({ limit: 200 }) as Promise<PaginatedResponse<FlowIntegration>>,
  })

  const flows = flowsData?.data ?? []

  // ---- Mutation ----
  const createMutation = useMutation({
    mutationFn: (data: CreateApiInput) => apiRegistrationApi.create(data),
    onSuccess: () => {
      toast.success('API Registration created successfully')
      router.push(`/projects/${projectId}`)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // ---- Tag helpers ----
  function handleTagsKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTagsFromInput()
    }
  }

  function addTagsFromInput() {
    const newTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !tags.includes(t))
    if (newTags.length > 0) {
      setTags([...tags, ...newTags])
    }
    setTagsInput('')
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  // ---- Submit ----
  function handleSubmit() {
    if (!name.trim()) {
      toast.error('Please enter API Name')
      return
    }
    if (!endpoint.trim()) {
      toast.error('Please enter Endpoint')
      return
    }
    if (!backendUrl.trim()) {
      toast.error('Please enter Backend URL')
      return
    }

    // Add any pending tags
    const finalTags = [...tags]
    if (tagsInput.trim()) {
      const extra = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t && !finalTags.includes(t))
      finalTags.push(...extra)
    }

    const payload: CreateApiInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      apiType,
      endpoint: endpoint.trim(),
      method,
      backendUrl: backendUrl.trim(),
      timeout,
      retries,
      projectId,
      authType: authType === 'inherit' ? undefined : authType,
      apiKey: authType === 'API_KEY' ? apiKey : undefined,
      apiKeyHeader: authType === 'API_KEY' ? apiKeyHeader : undefined,
      flowId: flowId || undefined,
      dataCatalogId: dataCatalogId.trim() || undefined,
      rateLimitPerMin,
      version: version.trim() || undefined,
      tags: finalTags.length > 0 ? finalTags : undefined,
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactUrl: contactUrl.trim() || undefined,
      license: license_.trim() || undefined,
      termsOfService: termsOfService.trim() || undefined,
      deprecated,
    }

    createMutation.mutate(payload)
  }

  // ---- Trigger labels ----
  const triggerLabels: Record<string, string> = {
    http: 'HTTP',
    kafka_consumer: 'Kafka Consumer',
    scheduler: 'Scheduler',
    webhook: 'Webhook',
    message_queue: 'Message Queue',
  }

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: THEME.bg }}>
      {/* Header */}
      <div
        style={{
          background: THEME.panel,
          borderBottom: `1px solid ${THEME.border}`,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href={`/projects/${projectId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              border: `1px solid ${THEME.border}`,
              color: THEME.text.secondary,
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}
          >
            <ArrowLeft size={14} />
          </Link>
          <div>
            <h1
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: THEME.text.primary,
                margin: 0,
              }}
            >
              New API Registration
            </h1>
            <p style={{ fontSize: 13, color: THEME.text.muted, margin: 0 }}>
              Create a new API Registration in this project
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            href={`/projects/${projectId}`}
            style={{
              fontFamily: FONT,
              fontSize: 13,
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${THEME.border}`,
              background: THEME.panel,
              color: THEME.text.secondary,
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <X size={12} />
            Cancel
          </Link>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            style={{
              fontFamily: FONT,
              fontSize: 13,
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: createMutation.isPending ? 'var(--t-text-muted)' : THEME.accent,
              color: '#fff',
              cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 500,
            }}
          >
            <Save size={12} />
            {createMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 24px 60px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: API Info */}
          <SectionCard icon={Globe} title="API Information">
            <FieldGroup>
              <Label required>API Name</Label>
              <input
                style={inputStyle}
                placeholder="e.g. Get Order Summary"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label>Description</Label>
              <textarea
                style={textareaStyle}
                placeholder="Describe what this API does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label required>API Type</Label>
              <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: `1px solid ${THEME.border}`, width: 'fit-content' }}>
                {(['REST', 'MICROFLOW'] as ApiType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setApiType(t)}
                    style={{
                      fontFamily: FONT,
                      fontSize: 13,
                      padding: '5px 16px',
                      border: 'none',
                      background: apiType === t ? THEME.accent : 'var(--t-input)',
                      color: apiType === t ? '#fff' : THEME.text.secondary,
                      cursor: 'pointer',
                      fontWeight: apiType === t ? 600 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </SectionCard>

          {/* Section 2: Endpoint & Backend */}
          <SectionCard icon={Link2} title="Endpoint & Backend">
            <FieldGroup>
              <Label required>Endpoint</Label>
              <input
                style={inputStyle}
                placeholder="/api/v1/orders/summary"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
              <span style={{ fontSize: 12, color: THEME.text.muted }}>
                Path to accept requests, e.g. /api/v1/...
              </span>
            </FieldGroup>

            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <FieldGroup>
                <Label required>Method</Label>
                <Combobox
                  value={method}
                  onChange={(v) => setMethod(v as HttpMethod)}
                  options={(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => ({ value: m, label: m }))}
                />
                <div style={{ marginTop: 2 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      color: methodColors[method],
                    }}
                  >
                    {method}
                  </span>
                </div>
              </FieldGroup>

              <FieldGroup>
                <Label required>Backend URL</Label>
                <input
                  style={inputStyle}
                  placeholder="https://backend-service.example.com/api/orders"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                />
                <span style={{ fontSize: 12, color: THEME.text.muted }}>
                  Destination URL to proxy requests to
                </span>
              </FieldGroup>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldGroup>
                <Label>Timeout (seconds)</Label>
                <input
                  type="number"
                  style={inputStyle}
                  value={timeout}
                  min={1}
                  max={300}
                  onChange={(e) => setTimeout_(Number(e.target.value))}
                />
              </FieldGroup>
              <FieldGroup>
                <Label>Retries</Label>
                <input
                  type="number"
                  style={inputStyle}
                  value={retries}
                  min={0}
                  max={10}
                  onChange={(e) => setRetries(Number(e.target.value))}
                />
              </FieldGroup>
            </div>
          </SectionCard>

          {/* Section 3: Authentication */}
          <SectionCard icon={Shield} title="Authentication">
            <FieldGroup>
              <Label>Authentication Type</Label>
              <Combobox
                value={authType}
                onChange={(v) => setAuthType(v as AuthType | 'inherit')}
                options={[
                  { value: 'inherit', label: 'Inherit from Project' },
                  { value: 'NONE', label: 'None' },
                  { value: 'JWT', label: 'JWT' },
                  { value: 'API_KEY', label: 'API Key' },
                  { value: 'OAUTH2', label: 'OAuth 2.0' },
                  { value: 'BASIC', label: 'Basic Auth' },
                ]}
              />
            </FieldGroup>

            {authType === 'inherit' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  background: '#3B82F618',
                  borderRadius: 6,
                  border: '1px solid #3B82F630',
                }}
              >
                <Info size={11} style={{ color: '#60A5FA' }} />
                <span style={{ fontSize: 12, color: '#93C5FD' }}>
                  Using authentication configuration from the project
                </span>
              </div>
            )}

            {authType === 'API_KEY' && (
              <>
                <FieldGroup>
                  <Label>API Key</Label>
                  <input
                    type="password"
                    style={inputStyle}
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </FieldGroup>
                <FieldGroup>
                  <Label>Header Name</Label>
                  <input
                    style={inputStyle}
                    placeholder="X-API-Key"
                    value={apiKeyHeader}
                    onChange={(e) => setApiKeyHeader(e.target.value)}
                  />
                </FieldGroup>
              </>
            )}

            {authType !== 'inherit' && authType !== 'NONE' && authType !== 'API_KEY' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  background: 'var(--t-input)',
                  borderRadius: 6,
                  border: `1px solid ${THEME.border}`,
                }}
              >
                <Info size={11} style={{ color: THEME.text.muted }} />
                <span style={{ fontSize: 12, color: THEME.text.muted }}>
                  Additional details can be configured on the API details page after creation
                </span>
              </div>
            )}
          </SectionCard>

          {/* Section 4: Connections */}
          <SectionCard icon={Workflow} title="Connections">
            <FieldGroup>
              <Label>Flow</Label>
              <Combobox
                value={flowId}
                onChange={(v) => setFlowId(v)}
                placeholder="-- No Flow connected --"
                options={flows.map((f) => ({
                  value: f.id,
                  label: f.name,
                  hint: triggerLabels[f.triggerType] ?? f.triggerType,
                }))}
              />
              <span style={{ fontSize: 12, color: THEME.text.muted }}>
                Select a Flow to execute when this API is called
              </span>
            </FieldGroup>

            <FieldGroup>
              <Label>Data Catalog ID</Label>
              <input
                style={inputStyle}
                placeholder="Leave blank if not connected"
                value={dataCatalogId}
                onChange={(e) => setDataCatalogId(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label>Rate Limit (requests/min)</Label>
              <input
                type="number"
                style={inputStyle}
                value={rateLimitPerMin}
                min={0}
                onChange={(e) => setRateLimitPerMin(Number(e.target.value))}
              />
            </FieldGroup>
          </SectionCard>

          {/* Section 5: Additional API Information */}
          <SectionCard icon={FileText} title="Additional API Information">
            <FieldGroup>
              <Label>Version</Label>
              <input
                style={inputStyle}
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label>Tags</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 12,
                          fontFamily: FONT,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: '#3B82F618',
                          color: '#60A5FA',
                          border: '1px solid #3B82F630',
                        }}
                      >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            color: '#60A5FA',
                          }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  style={inputStyle}
                  placeholder="Type and press Enter, or separate with commas"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  onKeyDown={handleTagsKeyDown}
                  onBlur={addTagsFromInput}
                />
              </div>
            </FieldGroup>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldGroup>
                <Label>Contact Name</Label>
                <input
                  style={inputStyle}
                  placeholder="Contact person name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </FieldGroup>
              <FieldGroup>
                <Label>Contact Email</Label>
                <input
                  type="email"
                  style={inputStyle}
                  placeholder="email@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </FieldGroup>
            </div>

            <FieldGroup>
              <Label>Contact URL</Label>
              <input
                style={inputStyle}
                placeholder="https://..."
                value={contactUrl}
                onChange={(e) => setContactUrl(e.target.value)}
              />
            </FieldGroup>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldGroup>
                <Label>License</Label>
                <input
                  style={inputStyle}
                  placeholder="e.g. MIT, Apache-2.0"
                  value={license_}
                  onChange={(e) => setLicense(e.target.value)}
                />
              </FieldGroup>
              <FieldGroup>
                <Label>Terms of Service</Label>
                <input
                  style={inputStyle}
                  placeholder="https://example.com/tos"
                  value={termsOfService}
                  onChange={(e) => setTermsOfService(e.target.value)}
                />
              </FieldGroup>
            </div>

            <FieldGroup>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="deprecated-checkbox"
                  checked={deprecated}
                  onChange={(e) => setDeprecated(e.target.checked)}
                  style={{ accentColor: THEME.accent, width: 14, height: 14 }}
                />
                <label
                  htmlFor="deprecated-checkbox"
                  style={{
                    fontFamily: FONT,
                    fontSize: 13,
                    color: THEME.text.secondary,
                    cursor: 'pointer',
                  }}
                >
                  Deprecated
                </label>
              </div>
            </FieldGroup>
          </SectionCard>

          {/* Section 6: Status */}
          <SectionCard icon={CheckCircle2} title="Status">
            <FieldGroup>
              <Label>Status</Label>
              <Combobox
                value={status}
                onChange={(v) => setStatus(v as ApiStatus)}
                options={[
                  { value: 'DRAFT', label: 'Draft' },
                  { value: 'ACTIVE', label: 'Active' },
                ]}
              />
              <span style={{ fontSize: 12, color: THEME.text.muted }}>
                {status === 'DRAFT'
                  ? 'API will not be active until the status is changed to Active'
                  : 'API will be active immediately after saving'}
              </span>
            </FieldGroup>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
