'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Button,
  TextInput,
  TextArea,
  Select,
  SelectItem,
  Tag as CarbonTag,
  PasswordInput,
} from '@carbon/react'
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
            fontSize: 14,
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

// ========== Page Component ==========

export default function NewProjectPage() {
  const router = useRouter()

  // ---- Section 1: General Information ----
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [themeColor, setThemeColor] = useState('#0f62fe')

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
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '4px 24px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap' as const,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ArrowLeft}
            iconDescription="Back"
            onClick={() => router.push('/projects')}
          />
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 600,
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
          <Button kind="secondary" size="sm" renderIcon={X} onClick={() => router.push('/projects')}>
            Cancel
          </Button>
          <Button
            kind="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            renderIcon={createMutation.isPending ? Loader2 : Save}
          >
            {createMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 60px', width: '100%', boxSizing: 'border-box' as const }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: General Information */}
          <SectionCard icon={FolderKanban} title="General Information">
            <TextInput
              id="project-name"
              labelText={<LabelText required>Project Name</LabelText>}
              placeholder="e.g. Customer Portal API"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />

            <TextInput
              id="project-slug"
              labelText={<LabelText required>Slug</LabelText>}
              placeholder="auto-generated-from-name"
              helperText="Auto-generated from name. Lowercase, hyphens only."
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

            <TextArea
              id="project-description"
              labelText="Description"
              placeholder="Describe what this project is about..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div>
              <TextInput
                id="project-image-url"
                labelText={
                  <LabelText>
                    <ImageIcon size={12} style={{ marginRight: 2 }} />
                    Image URL
                  </LabelText>
                }
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
                    style={{ maxWidth: 120, maxHeight: 80, objectFit: 'contain' }}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <input
                type="color"
                aria-label="Theme color picker"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                style={{
                  width: 40,
                  height: 40,
                  padding: 0,
                  border: `1px solid ${THEME.border}`,
                  cursor: 'pointer',
                  background: 'none',
                }}
              />
              <div style={{ width: 160 }}>
                <TextInput
                  id="project-theme-color"
                  labelText={
                    <LabelText>
                      <Palette size={12} style={{ marginRight: 2 }} />
                      Theme Color
                    </LabelText>
                  }
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  placeholder="#0f62fe"
                />
              </div>
              <div
                style={{
                  width: 20,
                  height: 20,
                  marginBottom: 10,
                  background: themeColor,
                  border: `1px solid ${THEME.border}`,
                  flexShrink: 0,
                }}
              />
            </div>
          </SectionCard>

          {/* Section 2: API Configuration */}
          <SectionCard icon={Globe} title="API Configuration">
            <TextInput
              id="project-base-url"
              type="url"
              labelText={<LabelText required>Base URL</LabelText>}
              placeholder="https://api.example.com"
              helperText="The root URL for all API endpoints in this project"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />

            <Select
              id="project-auth-type"
              labelText={
                <LabelText>
                  <Shield size={12} style={{ marginRight: 2 }} />
                  Auth Type
                </LabelText>
              }
              value={authType}
              onChange={(e) => setAuthType(e.target.value)}
            >
              <SelectItem value="NONE" text="None" />
              <SelectItem value="JWT" text="JWT" />
              <SelectItem value="API_KEY" text="API Key" />
              <SelectItem value="OAUTH2" text="OAuth2" />
              <SelectItem value="BASIC" text="Basic Auth" />
            </Select>

            {authType === 'API_KEY' && (
              <>
                <PasswordInput
                  id="project-api-key"
                  labelText="API Key"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <TextInput
                  id="project-api-key-header"
                  labelText="API Key Header"
                  placeholder="X-API-Key"
                  helperText="Header name used to send the API key"
                  value={apiKeyHeader}
                  onChange={(e) => setApiKeyHeader(e.target.value)}
                />
              </>
            )}

            <Select
              id="project-status"
              labelText="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              helperText={
                status === 'ACTIVE'
                  ? 'Project will be active immediately after creation'
                  : 'Project will be inactive and not accessible via API'
              }
            >
              <SelectItem value="ACTIVE" text="Active" />
              <SelectItem value="INACTIVE" text="Inactive" />
            </Select>
          </SectionCard>

          {/* Section 3: Organization */}
          <SectionCard icon={Building2} title="Organization">
            <TextInput
              id="project-group"
              labelText="Project Group"
              placeholder="e.g. Finance, Healthcare"
              value={projectGroup}
              onChange={(e) => setProjectGroup(e.target.value)}
            />

            <TextInput
              id="project-agency"
              labelText="Agency"
              placeholder="Agency or department name"
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {tags.map((tag) => (
                    <CarbonTag
                      key={tag}
                      type="blue"
                      size="sm"
                      filter
                      title="Remove tag"
                      onClose={() => removeTag(tag)}
                    >
                      {tag}
                    </CarbonTag>
                  ))}
                </div>
              )}
              <TextInput
                id="project-tags"
                labelText={
                  <LabelText>
                    <Tag size={12} style={{ marginRight: 2 }} />
                    Tags
                  </LabelText>
                }
                placeholder="Type and press Enter, or separate with commas"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onKeyDown={handleTagsKeyDown}
                onBlur={addTagsFromInput}
              />
            </div>
          </SectionCard>

          {/* Section 4: Contact Information */}
          <SectionCard icon={FileText} title="Contact Information">
            <TextInput
              id="project-owner"
              labelText={
                <LabelText>
                  <User size={12} style={{ marginRight: 2 }} />
                  Owner / Maintainer
                </LabelText>
              }
              placeholder="Full name of the project owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />

            <TextInput
              id="project-contact-email"
              type="email"
              labelText={
                <LabelText>
                  <Mail size={12} style={{ marginRight: 2 }} />
                  Contact Email
                </LabelText>
              }
              placeholder="email@example.com"
              helperText="Used for notifications and support contact"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
