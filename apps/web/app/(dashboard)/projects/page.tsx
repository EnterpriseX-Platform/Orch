'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { projectApi } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Button, Tabs, TabList, Tab, Tag, Select, SelectItem,
  TableContainer, TableToolbar, TableToolbarContent, TableToolbarSearch,
  Table, TableHead, TableRow, TableHeader, TableBody, TableCell,
} from '@carbon/react'
import { Project } from '@/types'
import s from './carbon.module.css'

const statusConfig: Record<string, { dot: string; label: string; color: string }> = {
  ACTIVE: { dot: '#24a148', label: 'Active', color: '#24a148' },
  INACTIVE: { dot: 'var(--t-text-muted)', label: 'Inactive', color: 'var(--t-text-muted)' },
  DEPRECATED: { dot: '#da1e28', label: 'Deprecated', color: '#da1e28' },
}

const filterTabs = [
  { id: 'all', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'INACTIVE', label: 'Inactive' },
]

export default function ProjectsPage() {
  const router = useRouter()
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

  const statusTagType: Record<string, 'green' | 'gray' | 'red'> = { ACTIVE: 'green', INACTIVE: 'gray', DEPRECATED: 'red' }
  const filterIndex = Math.max(0, filterTabs.findIndex((t) => t.id === activeFilter))

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Projects</h1>
          <p className={s.subtitle}>Manage your API projects</p>
        </div>
        <div className={s.actions}>
          <Button kind="tertiary" size="sm" renderIcon={RefreshCw} onClick={() => refetch()}>
            Refresh
          </Button>
          <Button kind="primary" size="sm" renderIcon={Plus} onClick={() => router.push('/projects/new')}>
            Create project
          </Button>
        </div>
      </div>

      <div className={s.stats}>
        <div className={s.stat}><div className={s.statLabel}>Projects</div><div className={s.statValue}>{isLoading ? '–' : stats.total}</div></div>
        <div className={s.stat}><div className={s.statLabel}>Active</div><div className={s.statValue}>{isLoading ? '–' : stats.active}</div></div>
        <div className={s.stat}><div className={s.statLabel}>APIs</div><div className={s.statValue}>{isLoading ? '–' : stats.totalApis}</div></div>
      </div>

      <TableContainer>
        <TableToolbar aria-label="Projects toolbar">
          <TableToolbarContent className={s.toolbarContent}>
            <Tabs selectedIndex={filterIndex} onChange={({ selectedIndex }) => setActiveFilter(filterTabs[selectedIndex].id)}>
              <TabList aria-label="Filter by status" className={s.tabs}>
                {filterTabs.map((tab) => {
                  const count = tab.id === 'all' ? projects.length : projects.filter((p) => p.status === tab.id).length
                  return (
                    <Tab key={tab.id}>
                      {tab.label}<span className={s.tabCount}>{count}</span>
                    </Tab>
                  )
                })}
              </TabList>
            </Tabs>
            <TableToolbarSearch
              persistent
              placeholder="Search by name, slug or description"
              value={searchQuery}
              onChange={(e) => setSearchQuery(typeof e === 'string' ? e : (e?.target as HTMLInputElement)?.value ?? '')}
              aria-label="Search projects"
            />
            {projectGroups.length > 0 && (
              <Select id="projects-group-filter" labelText="Group" hideLabel size="lg" inline={false}
                className={s.groupSelect} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <SelectItem value="all" text="All groups" />
                {projectGroups.map((g) => <SelectItem key={g} value={g} text={g} />)}
                <SelectItem value="__ungrouped" text="Ungrouped" />
              </Select>
            )}
          </TableToolbarContent>
        </TableToolbar>

        <div className={s.scroll}>
          <Table size="md" aria-label="Projects">
            <TableHead>
              <TableRow>
                <TableHeader>Project</TableHeader>
                <TableHeader>Description</TableHeader>
                <TableHeader>Tags</TableHeader>
                <TableHeader>Agency</TableHeader>
                <TableHeader>Owner</TableHeader>
                <TableHeader className={s.num}>APIs</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && [1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>{[40, 60, 30, 30, 30, 10, 20].map((w, j) => <TableCell key={j}><div className={s.skeleton} style={{ width: `${w}%` }} /></TableCell>)}</TableRow>
              ))}
              {!isLoading && groupedProjects.map(({ group, projects: groupProjects }) => {
                const isCollapsed = collapsedGroups.has(group)
                return [
                  <TableRow key={`g-${group}`} className={s.groupRow}>
                    <TableCell colSpan={7}>
                      <Button kind="ghost" size="md" className={s.groupToggle} onClick={() => toggleGroup(group)} aria-expanded={!isCollapsed}>
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {group}<span className={s.tabCount}>{groupProjects.length}</span>
                      </Button>
                    </TableCell>
                  </TableRow>,
                  ...(isCollapsed ? [] : groupProjects.map((project) => {
                    const status = statusConfig[project.status] || statusConfig.INACTIVE
                    return (
                      <TableRow key={project.id}>
                        <TableCell>
                          <span className={s.swatch} style={{ background: project.themeColor || '#0f62fe' }} />
                          <Link href={`/projects/${project.id}`} className={s.name}>{project.name}</Link>
                          {project.slug && <span className={s.slug} style={{ marginLeft: 16 }}>{project.slug}</span>}
                        </TableCell>
                        <TableCell><span className={s.desc} title={project.description || ''}>{project.description || '—'}</span></TableCell>
                        <TableCell>
                          <div className={s.tags}>
                            {(project.tags || []).slice(0, 3).map((tag) => <Tag key={tag} type="gray" size="sm">{tag}</Tag>)}
                            {project.tags && project.tags.length > 3 && <span className={s.more}>+{project.tags.length - 3}</span>}
                          </div>
                        </TableCell>
                        <TableCell>{project.agency || '—'}</TableCell>
                        <TableCell>{project.owner || '—'}</TableCell>
                        <TableCell className={s.num}>{project._count?.apis || 0}</TableCell>
                        <TableCell><Tag type={statusTagType[project.status] || 'gray'} size="sm">{status.label}</Tag></TableCell>
                      </TableRow>
                    )
                  })),
                ]
              })}
            </TableBody>
          </Table>
        </div>

        {!isLoading && filteredProjects.length === 0 && (
          <div className={s.empty}>
            <h3 className={s.emptyTitle}>No projects found</h3>
            <p className={s.emptyText}>
              {projects.length === 0 ? 'Create your first project to get started.' : 'Change the search or filters to see more projects.'}
            </p>
            {projects.length === 0 && (
              <Button kind="primary" size="sm" renderIcon={Plus} onClick={() => router.push('/projects/new')}>Create project</Button>
            )}
          </div>
        )}
      </TableContainer>
    </div>
  )
}
