'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flowApi } from '@/lib/api'
import { toast } from 'sonner'
import { 
  Workflow, 
  Plus, 
  Zap, 
  Layers, 
  Calendar, 
  Webhook, 
  MessageSquare,
  MoreHorizontal,
  Filter,
  LayoutGrid,
  List,
  Activity,
  ArrowUpRight,
  Edit,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import Link from 'next/link'
import {
  Button,
  ContentSwitcher,
  Switch,
  Search as CarbonSearch,
  Tag,
} from '@carbon/react'
import { cn } from '@/lib/utils'

interface FlowData {
  id: string
  name: string
  description?: string
  triggerType: 'http' | 'kafka_consumer' | 'scheduler' | 'webhook' | 'message_queue'
  executionMode: 'sync' | 'async'
  isActive: boolean
  createdAt: string
  nodes?: any[]
  edges?: any[]
  _count?: { apis: number }
}

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif'

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent-hover)',
  colors: {
    blue: '#0f62fe',
    emerald: '#24a148',
    purple: '#8a3ffc',
    amber: '#ba4e00',
    red: '#da1e28',
    indigo: '#6366F1',
  }
}

type TagType = 'green' | 'purple' | 'warm-gray' | 'blue' | 'teal'

const triggerLabels: Record<string, { label: string; color: string; bg: string; icon: any; tag: TagType }> = {
  http: { label: 'HTTP', color: '#24a148', bg: '#24a14815', icon: Zap, tag: 'green' },
  kafka_consumer: { label: 'Kafka', color: '#8a3ffc', bg: '#8a3ffc15', icon: Layers, tag: 'purple' },
  scheduler: { label: 'Scheduler', color: '#ba4e00', bg: '#ba4e0015', icon: Calendar, tag: 'warm-gray' },
  webhook: { label: 'Webhook', color: '#0f62fe', bg: '#0f62fe15', icon: Webhook, tag: 'blue' },
  message_queue: { label: 'Queue', color: '#14B8A6', bg: '#14B8A615', icon: MessageSquare, tag: 'teal' },
}

const modeLabels: Record<string, { label: string; color: string; bg: string; tag: TagType }> = {
  sync: { label: 'SYNC', color: '#0f62fe', bg: '#0f62fe15', tag: 'blue' },
  async: { label: 'ASYNC', color: '#ba4e00', bg: '#ba4e0015', tag: 'warm-gray' },
}

const filterTabs = [
  { id: 'all', label: 'All Flows' },
  { id: 'active', label: 'Active' },
  { id: 'sync', label: 'Sync' },
  { id: 'async', label: 'Async' },
]

export default function FlowsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [activeFilter, setActiveFilter] = useState('all')
  
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: () => flowApi.list(),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      flowApi.update(id, { isActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success(variables.isActive ? 'Flow activated' : 'Flow deactivated')
    },
    onError: () => {
      toast.error('Failed to update status')
    },
  })

  const flows = data?.data || []

  const filteredFlows = useMemo(() => {
    return flows.filter((flow: FlowData) => {
      const matchesSearch = flow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        flow.description?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFilter = activeFilter === 'all' || 
        (activeFilter === 'active' && flow.isActive) ||
        (activeFilter === 'inactive' && !flow.isActive) ||
        (activeFilter === 'sync' && flow.executionMode === 'sync') ||
        (activeFilter === 'async' && flow.executionMode === 'async')
      return matchesSearch && matchesFilter
    })
  }, [flows, searchQuery, activeFilter])

  const activeCount = flows.filter((f: FlowData) => f.isActive).length
  const httpCount = flows.filter((f: FlowData) => f.triggerType === 'http').length
  const kafkaCount = flows.filter((f: FlowData) => f.triggerType === 'kafka_consumer').length
  const schedulerCount = flows.filter((f: FlowData) => f.triggerType === 'scheduler').length

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      {/* Title Row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary, marginBottom: 2 }}>Gateway Flows</h1>
          <p style={{ fontSize: 13, color: THEME.text.muted }}>Manage Gateway Flows for Sync or Async processing</p>
        </div>
        <Button as={Link} href="/flows/builder" kind="primary" size="sm" renderIcon={Plus}>
          Create Flow
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="mb-4" style={{ maxWidth: 480 }}>
        <ContentSwitcher
          size="sm"
          selectedIndex={Math.max(0, filterTabs.findIndex(t => t.id === activeFilter))}
          onChange={({ index }: { index?: number }) => setActiveFilter(filterTabs[index ?? 0].id)}
        >
          {filterTabs.map(tab => (
            <Switch key={tab.id} name={tab.id} text={tab.label} />
          ))}
        </ContentSwitcher>
      </div>

      {/* Search and View Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 max-w-md">
          <CarbonSearch
            size="sm"
            labelText="Search flows"
            placeholder="Search flows by name or description..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button kind="tertiary" size="sm" renderIcon={Filter}>
            Filter
          </Button>
          <div className="flex items-center">
            <Button
              kind={viewMode === 'list' ? 'primary' : 'ghost'}
              size="sm"
              hasIconOnly
              renderIcon={List}
              iconDescription="List view"
              onClick={() => setViewMode('list')}
            />
            <Button
              kind={viewMode === 'grid' ? 'primary' : 'ghost'}
              size="sm"
              hasIconOnly
              renderIcon={LayoutGrid}
              iconDescription="Grid view"
              onClick={() => setViewMode('grid')}
            />
          </div>
        </div>
      </div>

      {/* Flow List */}
      <div className="space-y-2">
        {filteredFlows.map((flow: FlowData) => {
          const triggerConfig = triggerLabels[flow.triggerType] || triggerLabels.http
          const TriggerIcon = triggerConfig.icon
          const modeConfig = modeLabels[flow.executionMode] || modeLabels.sync
          
          return (
            <div
              key={flow.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: THEME.panel,
                border: `1px solid ${THEME.border}`,
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="hover:border-[#0f62fe] group"
            >
              {/* Icon */}
              <div style={{
                width: 36,
                height: 28,
                background: THEME.bg,
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Workflow className="w-4 h-4" style={{ color: 'var(--t-text-secondary)' }} />
              </div>

              {/* Main Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2 mb-0.5 min-w-0">
                  <h3 style={{
                    minWidth: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: THEME.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }} className="group-hover:text-[#0f62fe] transition-colors">
                    {flow.name}
                  </h3>
                  <Tag size="sm" type={triggerConfig.tag}>{triggerConfig.label}</Tag>
                  <Tag size="sm" type={modeConfig.tag}>{modeConfig.label}</Tag>
                </div>
                <p style={{ fontSize: 11, color: THEME.text.muted, fontFamily: FONT }}>
                  {flow.description || 'No description'}
                </p>
              </div>

              {/* Stats */}
              <div className="hidden xl:flex items-center gap-5">
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>{(flow.nodes || []).length}</p>
                  <p style={{ fontSize: 11, color: THEME.text.muted }}>Nodes</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>{(flow.edges || []).length}</p>
                  <p style={{ fontSize: 11, color: THEME.text.muted }}>Edges</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>{flow._count?.apis || 0}</p>
                  <p style={{ fontSize: 11, color: THEME.text.muted }}>Linked APIs</p>
                </div>
              </div>

              {/* Status Badge (clickable toggle) */}
              <Tag
                as="button"
                size="sm"
                type={flow.isActive ? 'green' : 'gray'}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleActiveMutation.mutate({ id: flow.id, isActive: !flow.isActive })
                }}
                disabled={toggleActiveMutation.isPending}
                title={flow.isActive ? 'Click to deactivate' : 'Click to activate'}
                style={{ cursor: 'pointer', opacity: toggleActiveMutation.isPending ? 0.5 : 1 }}
              >
                {flow.isActive ? 'Active' : 'Inactive'}
              </Tag>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  as={Link}
                  href={`/flows/builder/${flow.id}`}
                  kind="ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={Edit}
                  iconDescription="Edit Flow"
                />
                <Button kind="ghost" size="sm" hasIconOnly renderIcon={MoreHorizontal} iconDescription="More actions" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {filteredFlows.length === 0 && !isLoading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{
            width: 48,
            height: 40,
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Workflow className="w-6 h-6" style={{ color: THEME.text.muted }} />
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, marginBottom: 2 }}>No flows found</h3>
          <p style={{ fontSize: 12, color: THEME.text.muted, marginBottom: 12 }}>Try adjusting your search or filters</p>
          <Button kind="tertiary" size="sm" onClick={() => {setSearchQuery(''); setActiveFilter('all')}}>
            Clear Filters
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{
            width: 48,
            height: 40,
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Workflow className="w-6 h-6 animate-pulse" style={{ color: THEME.text.muted }} />
          </div>
          <p style={{ fontSize: 12, color: THEME.text.muted }}>Loading flows...</p>
        </div>
      )}
    </div>
  )
}
