'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flowApi } from '@/lib/api'
import { toast } from 'sonner'
import { 
  Workflow, 
  Plus, 
  Search, 
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

const FONT = "'Prompt', sans-serif"

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent-hover)',
  colors: {
    blue: '#3B82F6',
    emerald: '#10B981',
    purple: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
    indigo: '#6366F1',
  }
}

const triggerLabels: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  http: { label: 'HTTP', color: '#10B981', bg: '#10B98115', icon: Zap },
  kafka_consumer: { label: 'Kafka', color: '#8B5CF6', bg: '#8B5CF615', icon: Layers },
  scheduler: { label: 'Scheduler', color: '#F59E0B', bg: '#F59E0B15', icon: Calendar },
  webhook: { label: 'Webhook', color: '#3B82F6', bg: '#3B82F615', icon: Webhook },
  message_queue: { label: 'Queue', color: '#14B8A6', bg: '#14B8A615', icon: MessageSquare },
}

const modeLabels: Record<string, { label: string; color: string; bg: string }> = {
  sync: { label: 'SYNC', color: '#3B82F6', bg: '#3B82F615' },
  async: { label: 'ASYNC', color: '#F59E0B', bg: '#F59E0B15' },
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
        <Link
          href="/flows/builder"
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
            whiteSpace: 'nowrap',
          }}
          className="hover:bg-[#2563EB]"
        >
          <Plus className="w-4 h-4" />
          Create Flow
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {filterTabs.map(tab => (
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
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search and View Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: THEME.text.muted }} />
          <input
            type="text"
            placeholder="Search flows by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 12px 6px 36px',
              background: 'var(--t-input)',
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              fontSize: 13,
              color: THEME.text.primary,
              outline: 'none',
            }}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 6,
            fontSize: 13,
            color: THEME.text.muted,
          }}>
            <Filter className="w-4 h-4" />
            <span>Filter</span>
          </button>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: 2,
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 6,
          }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '4px',
                borderRadius: 6,
                background: viewMode === 'list' ? THEME.accent : 'transparent',
                color: viewMode === 'list' ? '#FFFFFF' : THEME.text.muted,
              }}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '4px',
                borderRadius: 6,
                background: viewMode === 'grid' ? THEME.accent : 'transparent',
                color: viewMode === 'grid' ? '#FFFFFF' : THEME.text.muted,
              }}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
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
              className="hover:border-[#3B82F6] group"
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
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: THEME.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }} className="group-hover:text-[#3B82F6] transition-colors">
                    {flow.name}
                  </h3>
                  <span style={{
                    padding: '1px 5px',
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 6,
                    background: triggerConfig.bg,
                    color: triggerConfig.color,
                    border: `1px solid ${triggerConfig.color}30`,
                  }}>
                    {triggerConfig.label}
                  </span>
                  <span style={{
                    padding: '1px 5px',
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 6,
                    background: modeConfig.bg,
                    color: modeConfig.color,
                    border: `1px solid ${modeConfig.color}30`,
                  }}>
                    {modeConfig.label}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: THEME.text.muted, fontFamily: FONT }}>
                  {flow.description || 'No description'}
                </p>
              </div>

              {/* Stats */}
              <div className="hidden md:flex items-center gap-5">
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
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleActiveMutation.mutate({ id: flow.id, isActive: !flow.isActive })
                }}
                disabled={toggleActiveMutation.isPending}
                title={flow.isActive ? 'Click to deactivate' : 'Click to activate'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 500,
                  borderRadius: 6,
                  background: flow.isActive ? '#10B98115' : 'var(--t-panel-hover)',
                  border: `1px solid ${flow.isActive ? '#10B98130' : 'color-mix(in srgb, var(--t-text-muted) 19%, transparent)'}`,
                  color: flow.isActive ? '#10B981' : 'var(--t-text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  opacity: toggleActiveMutation.isPending ? 0.5 : 1,
                }}
                className="hover:opacity-80"
              >
                <span style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: flow.isActive ? '#10B981' : 'var(--t-text-muted)'
                }} />
                {flow.isActive ? 'Active' : 'Inactive'}
              </button>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link
                  href={`/flows/builder/${flow.id}`}
                  style={{
                    padding: 4,
                    color: THEME.text.muted,
                    borderRadius: 6,
                  }}
                  className="hover:text-[#3B82F6] hover:bg-[var(--t-panel-hover)]"
                  title="Edit Flow"
                >
                  <Edit className="w-4 h-4" />
                </Link>
                <button style={{
                  padding: 4,
                  color: THEME.text.muted,
                  borderRadius: 6,
                }} className="hover:text-[var(--t-text)] hover:bg-[var(--t-panel-hover)]">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
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
          <button
            onClick={() => {setSearchQuery(''); setActiveFilter('all')}}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: `${THEME.accent}10`,
              color: THEME.accent,
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
            }}
            className="hover:bg-[var(--t-panel-hover)]"
          >
            Clear Filters
          </button>
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
