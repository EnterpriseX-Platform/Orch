'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  X,
  FolderKanban,
  Globe,
  Shield,
  User,
  Mail,
  FileText,
  Loader2,
  Palette,
  Tag,
  Building2,
  Image as ImageIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { projectApi } from '@/lib/api'
import { CustomSelect } from '@/components/ui/CustomSelect'

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

const generateSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

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
            fontSize: 14,
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
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235A6178' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
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

export default function NewProjectPage() {
  const router = useRouter()

  // ---- Section 1: General Information ----
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [themeColor, setThemeColor] = useState('#60A5FA')

  // ---- Section 2: API Configuration ----
  const [baseUrl, setBaseUrl] = useState('')
  const [authType, setAuthType] = useState('NONE')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyHeader, setApiKeyHeader] = useState('X-API-Key')
  const [status, setStatus] = useState('ACTIVE')

  // ---- Section 3: Organization ----
  const [projectGroup, setProjectGroup] = useState('')
  const [agency, setAgency] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // ---- Section 4: Contact Information ----
  const [owner, setOwner] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // ---- Mutation ----
  const createMutation = useMutation({
    mutationFn: (data: any) => projectApi.create(data),
    onSuccess: () => {
      toast.success('Project created successfully')
      router.push('/projects')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create project')
    },
  })

  // ---- Name change handler (auto-generate slug) ----
  function handleNameChange(value: string) {
    setName(value)
    if (!slugManuallyEdited) {
      setSlug(generateSlug(value))
    }
  }

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

  // ---- Image URL validation ----
  function isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  // ---- Submit ----
  function handleSubmit() {
    if (!name.trim()) {
      toast.error('Project name is required')
      return
    }
    if (!slug.trim()) {
      toast.error('Slug is required')
      return
    }
    if (!baseUrl.trim()) {
      toast.error('Base URL is required')
      return
    }
    if (!isValidUrl(baseUrl.trim())) {
      toast.error('Base URL must be a valid URL')
      return
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      toast.error('Contact email must be a valid email format')
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

    const payload: any = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      themeColor,
      baseUrl: baseUrl.trim(),
      authType,
      apiKey: authType === 'API_KEY' ? apiKey : undefined,
      apiKeyHeader: authType === 'API_KEY' ? apiKeyHeader : undefined,
      status,
      projectGroup: projectGroup.trim() || undefined,
      agency: agency.trim() || undefined,
      tags: finalTags.length > 0 ? finalTags : undefined,
      owner: owner.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
    }

    createMutation.mutate(payload)
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
          flexWrap: 'wrap' as const,
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <Link
            href="/projects"
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
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={14} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: THEME.text.primary,
                margin: 0,
                whiteSpace: 'nowrap' as const,
              }}
            >
              Create New Project
            </h1>
            <p style={{ fontSize: 12, color: THEME.text.muted, margin: 0 }}>
              Set up a new project with API configuration and metadata
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Link
            href="/projects"
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
              fontWeight: 500,
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
              fontWeight: 600,
            }}
          >
            {createMutation.isPending ? (
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Save size={12} />
            )}
            {createMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Body */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 60px', width: '100%', boxSizing: 'border-box' as const }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: General Information */}
          <SectionCard icon={FolderKanban} title="General Information">
            <FieldGroup>
              <Label required>Project Name</Label>
              <input
                style={inputStyle}
                placeholder="e.g. Customer Portal API"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label required>Slug</Label>
              <input
                style={inputStyle}
                placeholder="auto-generated-from-name"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugManuallyEdited(true)
                }}
                onBlur={() => {
                  if (!slug.trim()) {
                    setSlugManuallyEdited(false)
                    setSlug(generateSlug(name))
                  }
                }}
              />
              <span style={{ fontSize: 12, color: THEME.text.muted }}>
                Auto-generated from name. Lowercase, hyphens only.
              </span>
            </FieldGroup>

            <FieldGroup>
              <Label>Description</Label>
              <textarea
                style={textareaStyle}
                placeholder="Describe what this project is about..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label>
                <ImageIcon size={12} style={{ marginRight: 2 }} />
                Image URL
              </Label>
              <input
                style={inputStyle}
                placeholder="https://example.com/logo.png"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
              {imageUrl.trim() && isValidUrl(imageUrl.trim()) && (
                <div
                  style={{
                    marginTop: 4,
                    padding: 8,
                    background: THEME.borderLight,
                    borderRadius: 6,
                    border: `1px solid ${THEME.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl.trim()}
                    alt="Project preview"
                    style={{
                      maxWidth: 120,
                      maxHeight: 80,
                      borderRadius: 4,
                      objectFit: 'contain',
                    }}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              )}
            </FieldGroup>

            <FieldGroup>
              <Label>
                <Palette size={12} style={{ marginRight: 2 }} />
                Theme Color
              </Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  style={{
                    width: 32,
                    height: 28,
                    padding: 0,
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: 'none',
                  }}
                />
                <input
                  style={{ ...inputStyle, width: 120 }}
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  placeholder="#60A5FA"
                />
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: themeColor,
                    border: `1px solid ${THEME.border}`,
                    flexShrink: 0,
                  }}
                />
              </div>
            </FieldGroup>
          </SectionCard>

          {/* Section 2: API Configuration */}
          <SectionCard icon={Globe} title="API Configuration">
            <FieldGroup>
              <Label required>Base URL</Label>
              <input
                type="url"
                style={inputStyle}
                placeholder="https://api.example.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <span style={{ fontSize: 12, color: THEME.text.muted }}>
                The root URL for all API endpoints in this project
              </span>
            </FieldGroup>

            <FieldGroup>
              <Label>
                <Shield size={12} style={{ marginRight: 2 }} />
                Auth Type
              </Label>
              <CustomSelect
                value={authType}
                onChange={(v) => setAuthType(v)}
                options={[
                  { value: 'NONE', label: 'None' },
                  { value: 'JWT', label: 'JWT' },
                  { value: 'API_KEY', label: 'API Key' },
                  { value: 'OAUTH2', label: 'OAuth2' },
                  { value: 'BASIC', label: 'Basic Auth' },
                ]}
              />
            </FieldGroup>

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
                  <Label>API Key Header</Label>
                  <input
                    style={inputStyle}
                    placeholder="X-API-Key"
                    value={apiKeyHeader}
                    onChange={(e) => setApiKeyHeader(e.target.value)}
                  />
                  <span style={{ fontSize: 12, color: THEME.text.muted }}>
                    Header name used to send the API key
                  </span>
                </FieldGroup>
              </>
            )}

            <FieldGroup>
              <Label>Status</Label>
              <CustomSelect
                value={status}
                onChange={(v) => setStatus(v)}
                options={[
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'INACTIVE', label: 'Inactive' },
                ]}
              />
              <span style={{ fontSize: 12, color: THEME.text.muted }}>
                {status === 'ACTIVE'
                  ? 'Project will be active immediately after creation'
                  : 'Project will be inactive and not accessible via API'}
              </span>
            </FieldGroup>
          </SectionCard>

          {/* Section 3: Organization */}
          <SectionCard icon={Building2} title="Organization">
            <FieldGroup>
              <Label>Project Group</Label>
              <input
                style={inputStyle}
                placeholder="e.g. Finance, Healthcare"
                value={projectGroup}
                onChange={(e) => setProjectGroup(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label>Agency</Label>
              <input
                style={inputStyle}
                placeholder="Agency or department name"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label>
                <Tag size={12} style={{ marginRight: 2 }} />
                Tags
              </Label>
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
                          fontSize: 11,
                          fontFamily: FONT,
                          padding: '2px 8px',
                          borderRadius: 4,
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
                          <X size={12} />
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
          </SectionCard>

          {/* Section 4: Contact Information */}
          <SectionCard icon={FileText} title="Contact Information">
            <FieldGroup>
              <Label>
                <User size={12} style={{ marginRight: 2 }} />
                Owner / Maintainer
              </Label>
              <input
                style={inputStyle}
                placeholder="Full name of the project owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </FieldGroup>

            <FieldGroup>
              <Label>
                <Mail size={12} style={{ marginRight: 2 }} />
                Contact Email
              </Label>
              <input
                type="email"
                style={inputStyle}
                placeholder="email@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
              <span style={{ fontSize: 11, color: THEME.text.muted }}>
                Used for notifications and support contact
              </span>
            </FieldGroup>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
