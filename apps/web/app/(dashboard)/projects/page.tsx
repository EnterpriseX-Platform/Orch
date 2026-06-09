'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { projectApi } from '@/lib/api'
import Link from 'next/link'
import {
  Plus,
  Search,
  RefreshCw,
  FolderKanban,
  Activity,
  Globe,
  User,
  ExternalLink,
  Archive,
  ChevronDown,
  ChevronRight,
  Tag,
  Building2,
  Filter,
} from 'lucide-react'
import { Project } from '@/types'
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

const statusConfig: Record<string, { dot: string; label: string; color: string }> = {
  ACTIVE: { dot: '#34D399', label: 'Active', color: '#34D399' },
  INACTIVE: { dot: 'var(--t-text-muted)', label: 'Inactive', color: 'var(--t-text-muted)' },
  DEPRECATED: { dot: '#EF4444', label: 'Deprecated', color: '#EF4444' },
}

const filterTabs = [
  { id: 'all', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'INACTIVE', label: 'Inactive' },
]

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectApi.list({ limit: 200 }),
    retry: 0,
  })

  const projects: Project[] = data?.data || []

  const projectGroups = useMemo(() => {
    const groups = new Set<string>()
    projects.forEach((p) => {
      if (p.projectGroup) groups.add(p.projectGroup)
    })
    return Array.from(groups).sort()
  }, [projects])

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.nameEn || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.slug || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = activeFilter === 'all' || p.status === activeFilter
      const matchesGroup =
        groupFilter === 'all' ||
        (groupFilter === '__ungrouped' ? !p.projectGroup : p.projectGroup === groupFilter)
      return matchesSearch && matchesStatus && matchesGroup
    })
  }, [projects, searchQuery, activeFilter, groupFilter])

  const groupedProjects = useMemo(() => {
    const groups: Record<string, Project[]> = {}
    filteredProjects.forEach((p) => {
      const key = p.projectGroup || 'Ungrouped'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Ungrouped') return 1
      if (b === 'Ungrouped') return -1
      return a.localeCompare(b)
    })
    return sortedKeys.map((key) => ({ group: key, projects: groups[key] }))
  }, [filteredProjects])

  const stats = useMemo(() => {
    const total = projects.length
    const active = projects.filter((p) => p.status === 'ACTIVE').length
    const totalApis = projects.reduce((sum, p) => sum + (p._count?.apis || 0), 0)
    return { total, active, totalApis }
  }, [projects])

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div style={{ fontFamily: FONT, minHeight: '100%' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div style={{ width: 160, height: 18, background: THEME.border, borderRadius: 6, marginBottom: 6 }} />
            <div style={{ width: 240, height: 12, background: THEME.borderLight, borderRadius: 4 }} />
          </div>
          <div style={{ width: 160, height: 32, background: THEME.border, borderRadius: 4 }} />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ width: 28, height: 22, background: THEME.borderLight, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ width: 40, height: 20, background: THEME.border, borderRadius: 6, marginBottom: 4 }} />
              <div style={{ width: 60, height: 10, background: THEME.borderLight, borderRadius: 4 }} />
            </div>
          ))}
        </div>
        <div style={{ width: 180, height: 14, background: THEME.border, borderRadius: 6, marginBottom: 12 }} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ background: THEME.panel, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: 16 }}>
              <div className="flex items-center gap-3 mb-3">
                <div style={{ width: 36, height: 36, background: THEME.borderLight, borderRadius: 8, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: '70%', height: 14, background: THEME.border, borderRadius: 6, marginBottom: 4 }} />
                  <div style={{ width: '50%', height: 10, background: THEME.borderLight, borderRadius: 4 }} />
                </div>
              </div>
              <div style={{ width: '100%', height: 10, background: THEME.borderLight, borderRadius: 6, marginBottom: 8 }} />
              <div className="flex gap-2">
                <div style={{ width: 50, height: 18, background: THEME.borderLight, borderRadius: 4 }} />
                <div style={{ width: 60, height: 18, background: THEME.borderLight, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      {/* Title Row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary, marginBottom: 2 }}>
            Projects
          </h1>
          <p style={{ fontSize: 13, color: THEME.text.muted }}>
            Manage your API projects
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              color: THEME.text.muted,
              cursor: 'pointer',
            }}
            className="hover:text-[var(--t-text-secondary)] hover:border-[#3B82F6]/40"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <Link
            href="/projects/new"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: THEME.accent,
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              transition: 'all 0.15s ease',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
            className="hover:bg-blue-600 hover:shadow-md hover:shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            Create Project
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {filterTabs.map((tab) => {
          const count =
            tab.id === 'all'
              ? projects.length
              : projects.filter((p) => p.status === tab.id).length
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 6,
                border: activeFilter === tab.id ? 'none' : `1px solid ${THEME.border}`,
                background: activeFilter === tab.id ? THEME.accent : THEME.panel,
                color: activeFilter === tab.id ? '#FFFFFF' : THEME.text.muted,
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              {tab.label}
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontSize: 10,
                  background: activeFilter === tab.id ? 'rgba(255,255,255,0.2)' : 'var(--t-input)',
                  color: activeFilter === tab.id ? '#FFFFFF' : THEME.text.muted,
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search + Group Filter */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 max-w-md relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: THEME.text.muted }}
          />
          <input
            type="text"
            placeholder="Search projects by name, slug, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 12px 6px 36px',
              background: 'var(--t-input)',
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: THEME.text.primary,
              outline: 'none',
              fontFamily: FONT,
            }}
          />
        </div>
        {projectGroups.length > 0 && (
          <CustomSelect
            value={groupFilter}
            onChange={(v) => setGroupFilter(v)}
            options={[
              { value: 'all', label: 'All Groups' },
              ...projectGroups.map((g) => ({ value: g, label: g })),
              { value: '__ungrouped', label: 'Ungrouped' },
            ]}
            style={{ minWidth: 140 }}
          />
        )}
      </div>

      {/* Card Grid grouped by projectGroup */}
      {groupedProjects.map(({ group, projects: groupProjects }) => {
        const isCollapsed = collapsedGroups.has(group)

        return (
          <div key={group} style={{ marginBottom: 16 }}>
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                marginBottom: isCollapsed ? 0 : 8,
                width: '100%',
              }}
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
              )}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: THEME.text.primary,
                }}
              >
                {group}
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 500,
                  background: 'var(--t-input)',
                  color: THEME.text.muted,
                  border: `1px solid ${THEME.border}`,
                }}
              >
                {groupProjects.length}
              </span>
            </button>

            {/* Group Cards */}
            {!isCollapsed && (
              <div className="space-y-2">
                {groupProjects.map((project) => {
                  const status = statusConfig[project.status] || statusConfig.INACTIVE
                  const apiCount = project._count?.apis || 0
                  const themeColor = project.themeColor || THEME.accent

                  return (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        background: THEME.panel,
                        border: `1px solid ${THEME.border}`,
                        borderRadius: 10,
                        padding: '14px 18px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        textDecoration: 'none',
                      }}
                      className="hover:border-[#3B82F6]/50 hover:bg-[var(--t-panel-hover)] group"
                    >
                      {/* Icon */}
                      {project.image ? (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            overflow: 'hidden',
                            flexShrink: 0,
                            border: `1px solid ${THEME.border}`,
                          }}
                        >
                          <img
                            src={project.image}
                            alt={project.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            background: `${themeColor}15`,
                            border: `1px solid ${themeColor}25`,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              background: themeColor,
                            }}
                          />
                        </div>
                      )}

                      {/* Name + Slug */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: THEME.text.primary,
                            }}
                            className="group-hover:text-[#60A5FA] transition-colors truncate"
                          >
                            {project.name}
                          </h3>
                          <span style={{ fontSize: 12, color: THEME.text.muted }} className="truncate hidden sm:inline">
                            {project.slug}
                          </span>
                        </div>
                        {project.description && (
                          <p
                            style={{
                              fontSize: 12,
                              color: THEME.text.secondary,
                            }}
                            className="truncate"
                          >
                            {project.description}
                          </p>
                        )}
                      </div>

                      {/* Tags */}
                      <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
                        {project.tags &&
                          project.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                                padding: '2px 8px',
                                fontSize: 11,
                                fontWeight: 500,
                                borderRadius: 6,
                                background: 'var(--t-input)',
                                color: THEME.text.secondary,
                                border: `1px solid ${THEME.border}`,
                              }}
                            >
                              <Tag className="w-2.5 h-2.5" />
                              {tag}
                            </span>
                          ))}
                        {project.tags && project.tags.length > 3 && (
                          <span style={{ fontSize: 11, color: THEME.text.muted }}>
                            +{project.tags.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Agency badge */}
                      {project.agency && (
                        <span
                          className="hidden md:flex"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            fontSize: 11,
                            fontWeight: 500,
                            borderRadius: 6,
                            background: '#F59E0B12',
                            color: '#FBBF24',
                            border: '1px solid #F59E0B25',
                            flexShrink: 0,
                          }}
                        >
                          <Building2 className="w-3 h-3" />
                          {project.agency}
                        </span>
                      )}

                      {/* API count */}
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 6,
                          background: '#8B5CF612',
                          color: '#A78BFA',
                          border: '1px solid #8B5CF625',
                          flexShrink: 0,
                        }}
                      >
                        <Globe className="w-3 h-3" />
                        {apiCount} APIs
                      </span>

                      {/* Status */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 500,
                          borderRadius: 6,
                          background: `${status.color}12`,
                          border: `1px solid ${status.color}25`,
                          color: status.color,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: status.dot,
                          }}
                        />
                        {status.label}
                      </div>

                      {/* Owner */}
                      {project.owner && (
                        <div
                          className="hidden xl:flex items-center gap-1.5"
                          style={{ fontSize: 12, color: THEME.text.muted, flexShrink: 0 }}
                        >
                          <User className="w-3.5 h-3.5" />
                          {project.owner}
                        </div>
                      )}

                      {/* Arrow */}
                      <ExternalLink
                        className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        style={{ color: THEME.text.muted }}
                      />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Empty State */}
      {filteredProjects.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div
            style={{
              width: 48,
              height: 40,
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <FolderKanban className="w-6 h-6" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: THEME.text.primary, marginBottom: 2 }}>
            No projects found
          </h3>
          <p style={{ fontSize: 12, color: THEME.text.muted, marginBottom: 12 }}>
            {projects.length === 0
              ? 'Create your first project to get started'
              : 'Try adjusting your search or filters'}
          </p>
          {projects.length === 0 && (
            <Link
              href="/projects/new"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: THEME.accent,
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                textDecoration: 'none',
              }}
              className="hover:bg-blue-600"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
