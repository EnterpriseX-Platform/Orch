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
  FileText,
  CheckCircle2,
  Workflow,
} from 'lucide-react'
import { toast } from 'sonner'
import { Combobox } from '@/components/ui/combobox'
import {
  Button,
  TextInput,
  TextArea,
  NumberInput,
  Select,
  SelectItem,
  Checkbox,
  ContentSwitcher,
  Switch,
  Tag,
  InlineNotification,
  PasswordInput,
} from '@carbon/react'
import type {
  CreateApiInput,
  HttpMethod,
  AuthType,
  ApiType,
  ApiStatus,
  FlowIntegration,
  PaginatedResponse,
} from '@/types'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif'

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent-hover)',
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
        borderRadius: 0,
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

function LabelText({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {children}
      {required && <span style={{ color: '#da1e28' }}>*</span>}
    </span>
  )
}

const methodTagType: Record<string, 'blue' | 'green' | 'warm-gray' | 'red' | 'purple'> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'warm-gray',
  DELETE: 'red',
  PATCH: 'purple',
}

const API_TYPES: ApiType[] = ['REST', 'MICROFLOW']
const numVal = (v: number | string) => Number(v)


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
          flexWrap: 'wrap',
          gap: 12,
          position: 'sticky',
          top: 48,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ArrowLeft}
            iconDescription="Back"
            onClick={() => router.push(`/projects/${projectId}`)}
          />
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: THEME.text.primary, margin: 0 }}>
              New API Registration
            </h1>
            <p style={{ fontSize: 13, color: THEME.text.muted, margin: 0 }}>
              Create a new API Registration in this project
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button kind="secondary" size="sm" renderIcon={X} onClick={() => router.push(`/projects/${projectId}`)}>
            Cancel
          </Button>
          <Button
            kind="primary"
            size="sm"
            renderIcon={Save}
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 24px 60px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: API Info */}
          <SectionCard icon={Globe} title="API Information">
            <TextInput
              id="api-name"
              labelText={<LabelText required>API Name</LabelText>}
              placeholder="e.g. Get Budget Summary"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <TextArea
              id="api-description"
              labelText="Description"
              rows={3}
              placeholder="Describe what this API does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div>
              <div className="cds--label">
                <LabelText required>API Type</LabelText>
              </div>
              <div style={{ width: 280, maxWidth: '100%' }}>
                <ContentSwitcher
                  size="sm"
                  selectedIndex={Math.max(0, API_TYPES.indexOf(apiType))}
                  onChange={({ name: n }) => setApiType(n as ApiType)}
                >
                  {API_TYPES.map((t) => (
                    <Switch key={t} name={t} text={t} />
                  ))}
                </ContentSwitcher>
              </div>
            </div>
          </SectionCard>

          {/* Section 2: Endpoint & Backend */}
          <SectionCard icon={Link2} title="Endpoint & Backend">
            <TextInput
              id="api-endpoint"
              labelText={<LabelText required>Endpoint</LabelText>}
              placeholder="/budget/summary"
              helperText="Path after /orch/api/v1 — e.g. /budget/summary is called as /orch/api/v1/budget/summary"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 12 }}>
              <div>
                <Select
                  id="api-method"
                  labelText={<LabelText required>Method</LabelText>}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as HttpMethod)}
                >
                  {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => (
                    <SelectItem key={m} value={m} text={m} />
                  ))}
                </Select>
                <div style={{ marginTop: 4 }}>
                  <Tag type={methodTagType[method] ?? 'gray'} size="sm">
                    {method}
                  </Tag>
                </div>
              </div>

              <TextInput
                id="api-backend-url"
                labelText={<LabelText required>Backend URL</LabelText>}
                placeholder="https://backend-service.example.com/api/budget"
                helperText="Destination URL to proxy requests to"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
              <NumberInput
                id="api-timeout"
                label="Timeout (seconds)"
                value={timeout}
                min={1}
                max={300}
                onChange={(_e, { value }) => setTimeout_(numVal(value))}
              />
              <NumberInput
                id="api-retries"
                label="Retries"
                value={retries}
                min={0}
                max={10}
                onChange={(_e, { value }) => setRetries(numVal(value))}
              />
            </div>
          </SectionCard>

          {/* Section 3: Authentication */}
          <SectionCard icon={Shield} title="Authentication">
            <Select
              id="api-auth-type"
              labelText="Authentication Type"
              value={authType}
              onChange={(e) => setAuthType(e.target.value as AuthType | 'inherit')}
            >
              <SelectItem value="inherit" text="Inherit from Project" />
              <SelectItem value="NONE" text="None" />
              <SelectItem value="JWT" text="JWT" />
              <SelectItem value="API_KEY" text="API Key" />
              <SelectItem value="OAUTH2" text="OAuth 2.0" />
              <SelectItem value="BASIC" text="Basic Auth" />
            </Select>

            {authType === 'inherit' && (
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title=""
                subtitle="Using authentication configuration from the project"
              />
            )}

            {authType === 'API_KEY' && (
              <>
                <PasswordInput
                  id="api-key"
                  labelText="API Key"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <TextInput
                  id="api-key-header"
                  labelText="Header Name"
                  placeholder="X-API-Key"
                  value={apiKeyHeader}
                  onChange={(e) => setApiKeyHeader(e.target.value)}
                />
              </>
            )}

            {authType !== 'inherit' && authType !== 'NONE' && authType !== 'API_KEY' && (
              <InlineNotification
                kind="info"
                lowContrast
                hideCloseButton
                title=""
                subtitle="Additional details can be configured on the API details page after creation"
              />
            )}
          </SectionCard>

          {/* Section 4: Connections */}
          <SectionCard icon={Workflow} title="Connections">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="cds--label">Flow</div>
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
              <div className="cds--form__helper-text">Select a Flow to execute when this API is called</div>
            </div>

            <TextInput
              id="api-data-catalog-id"
              labelText="Data Catalog ID"
              placeholder="Leave blank if not connected"
              value={dataCatalogId}
              onChange={(e) => setDataCatalogId(e.target.value)}
            />

            <NumberInput
              id="api-rate-limit"
              label="Rate Limit (requests/min)"
              value={rateLimitPerMin}
              min={0}
              onChange={(_e, { value }) => setRateLimitPerMin(numVal(value))}
            />
          </SectionCard>

          {/* Section 5: Additional API Information */}
          <SectionCard icon={FileText} title="Additional API Information">
            <TextInput
              id="api-version"
              labelText="Version"
              placeholder="1.0.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {tags.map((tag) => (
                    <Tag key={tag} type="blue" size="sm" filter title="Remove tag" onClose={() => removeTag(tag)}>
                      {tag}
                    </Tag>
                  ))}
                </div>
              )}
              <TextInput
                id="api-tags"
                labelText="Tags"
                placeholder="Type and press Enter, or separate with commas"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onKeyDown={handleTagsKeyDown}
                onBlur={addTagsFromInput}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
              <TextInput
                id="api-contact-name"
                labelText="Contact Name"
                placeholder="Contact person name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
              <TextInput
                id="api-contact-email"
                type="email"
                labelText="Contact Email"
                placeholder="email@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>

            <TextInput
              id="api-contact-url"
              labelText="Contact URL"
              placeholder="https://..."
              value={contactUrl}
              onChange={(e) => setContactUrl(e.target.value)}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
              <TextInput
                id="api-license"
                labelText="License"
                placeholder="e.g. MIT, Apache-2.0"
                value={license_}
                onChange={(e) => setLicense(e.target.value)}
              />
              <TextInput
                id="api-tos"
                labelText="Terms of Service"
                placeholder="https://example.com/tos"
                value={termsOfService}
                onChange={(e) => setTermsOfService(e.target.value)}
              />
            </div>

            <Checkbox
              id="deprecated-checkbox"
              labelText="Deprecated"
              checked={deprecated}
              onChange={(_e, { checked }) => setDeprecated(checked)}
            />
          </SectionCard>

          {/* Section 6: Status */}
          <SectionCard icon={CheckCircle2} title="Status">
            <Select
              id="api-status"
              labelText="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ApiStatus)}
              helperText={
                status === 'DRAFT'
                  ? 'API will not be active until the status is changed to Active'
                  : 'API will be active immediately after saving'
              }
            >
              <SelectItem value="DRAFT" text="Draft" />
              <SelectItem value="ACTIVE" text="Active" />
            </Select>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
