'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { datasetApi } from '@/lib/api'
import { 
  Database, Plus, Search, Trash2, AlertCircle,
  ChevronRight, ChevronDown, Folder, FileJson, Check, X, Edit3, GripVertical, MoreVertical,
  FolderOpen, CornerDownRight, Home, MoreHorizontal, Plug
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { confirmDialog } from '@/components/common/ConfirmDialog'
import {
  DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragStartEvent, DragEndEvent, defaultDropAnimationSideEffects,
} from '@dnd-kit/core'
import { useSortable, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const FONT = "'Prompt', sans-serif"

// Dark Theme
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  borderAccent: '#2563EB50',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent-hover)',
  accentLight: 'var(--t-accent-light)',
  colors: { blue: '#8B92A5', emerald: '#059669', amber: '#F59E0B', red: '#DC2626', purple: '#7C3AED' }
}

interface DatasetData {
  id: string
  name: string
  category: string
  source: string
  status: string
  parentId: string | null
  createdAt: string
  children?: DatasetData[]
  _count?: { apis: number }
}

const categoryLabels: Record<string, string> = {
  transactional: 'Transactional',
  reserved: 'Reserved',
  transfer: 'Transfer',
  performance: 'Performance',
  expenditure: 'Expenditure',
  procurement: 'Procurement',
  // Operation success / completion category
  operation: 'Success',
  master_data: 'Master',
  other: 'Other',
}

const categoryColors: Record<string, string> = {
  transactional: '#64748B',
  reserved: '#64748B',
  transfer: '#7C3AED',
  performance: '#059669',
  expenditure: '#DC2626',
  procurement: '#06B6D4',
  operation: '#10B981',
  master_data: '#64748B',
  other: '#94A3B8',
}

const statusColors: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: '#05966915', text: '#059669' },
  DRAFT: { bg: '#60A5FA15', text: '#60A5FA' },
  ARCHIVED: { bg: '#94A3B815', text: '#94A3B8' },
  DEPRECATED: { bg: '#DC262615', text: '#DC2626' },
}

// Get path to root for breadcrumb
function getPathToRoot(datasetId: string, allDatasets: DatasetData[]): DatasetData[] {
  const path: DatasetData[] = []
  let current = allDatasets.find(d => d.id === datasetId)
  while (current) {
    path.unshift(current)
    current = allDatasets.find(d => d.id === current?.parentId)
  }
  return path
}

// Shared form input style
const formInputStyle = {
  padding: '4px 8px',
  background: 'var(--t-bg)',
  border: `1px solid var(--t-border)`,
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--t-text)',
  outline: 'none',
  transition: 'border-color 0.15s ease',
  height: 28,
  lineHeight: '20px',
}

// AutoComplete Input - suggests from existing values, allows free text
function AutoCompleteInput({ value, onChange, suggestions, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase()) && s !== value
  )
  const showDropdown = isOpen && filtered.length > 0

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true) }}
        onFocus={() => { setFocused(true); setIsOpen(true) }}
        onBlur={() => setFocused(false)}
        placeholder={placeholder || 'Source...'}
        style={formInputStyle}
        className={className}
      />
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: 'var(--t-panel)',
          border: '1.5px solid var(--t-border)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          maxHeight: 160,
          overflowY: 'auto',
          zIndex: 50,
        }}>
          {filtered.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => { onChange(source); setIsOpen(false) }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                fontSize: 13,
                color: 'var(--t-text)',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--t-border-light)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--t-panel-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {source}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Inline Add Form Component - Compact
function InlineAddForm({ parentId, parentName, parentCategory, allSources, allCategories, repoTables, onCancel, onSuccess }: {
  parentId: string | null
  parentName?: string
  repoTables?: { id: string; name: string; displayName?: string | null; category?: string | null }[]
  parentCategory?: string
  allSources: string[]
  allCategories: string[]
  onCancel: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [category, setCategory] = useState(parentCategory || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsSubmitting(true)
    try {
      await datasetApi.create({
        name: name.trim(),
        source: source.trim() || '',
        category: category.trim().toUpperCase().replace(/[\s-]/g, '_') || 'OTHER',
        status: 'ACTIVE',
        parentId,
        nameEn: name.trim(),
      })
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      onSuccess()
    } catch (err) {
      console.error('Failed to create:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--t-panel)',
      borderRadius: 8,
      border: `1.5px solid ${THEME.accent}50`,
      boxShadow: `0 0 0 1px ${THEME.accent}15, 0 2px 8px rgba(0,0,0,0.15)`,
    }}>
      {parentName && (
        <div style={{
          padding: '5px 12px',
          background: `${THEME.accent}15`,
          borderBottom: `1px solid ${THEME.accent}30`,
          fontSize: 11,
          fontWeight: 500,
          color: THEME.accent,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: '6px 6px 0 0',
        }}>
          <CornerDownRight className="w-2.5 h-2.5" />
          Under: <strong>{parentName}</strong>
        </div>
      )}
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 26,
          height: 22,
          background: `${THEME.accent}15`,
          border: `1.5px dashed ${THEME.accent}60`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Plus className="w-3 h-3" style={{ color: THEME.accent }} />
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', gap: 6 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name..."
            style={formInputStyle}
            className="focus:!border-blue-500"
            autoFocus
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={formInputStyle}
            className="focus:!border-blue-500"
          >
            <option value="">— Category —</option>
            {Object.entries(categoryLabels).map(([k, v]) => (
              <option key={k} value={k.toUpperCase()}>{v} — {k.toUpperCase()}</option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={formInputStyle}
            className="focus:!border-blue-500"
          >
            <option value="">— Source table —</option>
            {(repoTables ?? []).map((t) => (
              <option key={t.id} value={t.name}>{t.displayName ? `${t.name} — ${t.displayName}` : t.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            style={{
              padding: '5px 12px',
              background: THEME.accent,
              color: '#FFF',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              opacity: isSubmitting || !name.trim() ? 0.4 : 1,
              cursor: isSubmitting || !name.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Check className="w-3 h-3" />
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '5px 10px',
              background: 'transparent',
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              fontSize: 12,
              color: THEME.text.muted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            className="hover:border-red-400 hover:text-red-400"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </form>
  )
}

// Inline Edit Form Component
function InlineEditForm({ dataset, allSources, allCategories, repoTables, onCancel, onSuccess }: {
  repoTables?: { id: string; name: string; displayName?: string | null; category?: string | null }[]
  dataset: DatasetData
  allSources: string[]
  allCategories: string[]
  onCancel: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState(dataset.name)
  const [source, setSource] = useState(dataset.source)
  const [category, setCategory] = useState(dataset.category || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsSubmitting(true)
    try {
      await datasetApi.update(dataset.id, {
        name: name.trim(),
        source: source.trim(),
        category: category.trim().toUpperCase().replace(/[\s-]/g, '_') || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      onSuccess()
    } catch (err) {
      console.error('Failed to update:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--t-panel)',
      borderRadius: 8,
      border: `1.5px solid ${THEME.accent}50`,
      boxShadow: `0 0 0 1px ${THEME.accent}15, 0 2px 8px rgba(0,0,0,0.15)`,
    }}>
      <div style={{
        padding: '5px 12px',
        background: `${THEME.accent}15`,
        borderBottom: `1px solid ${THEME.accent}30`,
        borderRadius: '6px 6px 0 0',
        fontSize: 11,
        fontWeight: 500,
        color: THEME.accent,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <Edit3 className="w-2.5 h-2.5" />
        Edit: <strong>{dataset.name}</strong>
      </div>
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 26,
          height: 22,
          background: `${THEME.accent}15`,
          border: `1.5px solid ${THEME.accent}40`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Edit3 className="w-3 h-3" style={{ color: THEME.accent }} />
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', gap: 6 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name..."
            style={formInputStyle}
            className="focus:!border-blue-500"
            autoFocus
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={formInputStyle}
            className="focus:!border-blue-500"
          >
            <option value="">— Category —</option>
            {Object.entries(categoryLabels).map(([k, v]) => (
              <option key={k} value={k.toUpperCase()}>{v} — {k.toUpperCase()}</option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={formInputStyle}
            className="focus:!border-blue-500"
          >
            <option value="">— Source table —</option>
            {(repoTables ?? []).map((t) => (
              <option key={t.id} value={t.name}>{t.displayName ? `${t.name} — ${t.displayName}` : t.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            style={{
              padding: '5px 12px',
              background: THEME.accent,
              color: '#FFF',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              opacity: isSubmitting || !name.trim() ? 0.4 : 1,
              cursor: isSubmitting || !name.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Check className="w-3 h-3" />
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '5px 10px',
              background: 'transparent',
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              fontSize: 12,
              color: THEME.text.muted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            className="hover:border-red-400 hover:text-red-400"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </form>
  )
}

// Breadcrumb Path Component
function BreadcrumbPath({ path, onNodeClick }: { path: DatasetData[], onNodeClick?: (id: string) => void }) {
  if (path.length === 0) return null
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12,
      color: THEME.text.muted,
      marginBottom: 4,
    }}>
      <Home className="w-3 h-3" />
      {path.map((node, idx) => (
        <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronRight className="w-3 h-3" />
          <button
            onClick={() => onNodeClick?.(node.id)}
            style={{
              color: idx === path.length - 1 ? THEME.accent : THEME.text.muted,
              fontWeight: idx === path.length - 1 ? 600 : 400,
              cursor: onNodeClick ? 'pointer' : 'default',
            }}
            className={onNodeClick ? "hover:text-blue-400" : ""}
          >
            {node.name}
          </button>
        </div>
      ))}
    </div>
  )
}

// Draggable Tree Node Component - Enhanced
interface SortableTreeNodeProps {
  dataset: DatasetData
  level: number
  onDelete: (id: string) => void
  refresh: () => void
  allDatasets: DatasetData[]
  allSources: string[]
  allCategories: string[]
  repoTables?: { id: string; name: string; displayName?: string | null; category?: string | null }[]
  expandedNodes: Set<string>
  onToggleExpand: (id: string) => void
}

function SortableTreeNode({
  dataset,
  level,
  onDelete,
  refresh,
  allDatasets,
  allSources,
  allCategories,
  repoTables,
  expandedNodes,
  onToggleExpand,
}: SortableTreeNodeProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Click outside to close menu
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])
  const isExpanded = expandedNodes.has(dataset.id)
  
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dataset.id,
    data: { type: 'dataset', dataset, level }
  })

  const hasChildren = dataset.children && dataset.children.length > 0
  const statusColor = statusColors[dataset.status] || statusColors.DRAFT
  const categoryColor = categoryColors[dataset.category] || categoryColors.other

  const style = { 
    transform: CSS.Transform.toString(transform), 
    transition, 
    opacity: isDragging ? 0.5 : 1 
  }

  // Get breadcrumb path for this node
  const nodePath = useMemo(() => getPathToRoot(dataset.id, allDatasets).slice(0, -1), [dataset.id, allDatasets])

  return (
    <div ref={setNodeRef} style={style}>
      {/* Node Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        borderRadius: 8,
        marginLeft: level * 20,
        background: isDragging ? `${THEME.accent}10` : 'transparent',
        border: isDragging ? `1px solid ${THEME.accent}40` : '1px solid transparent',
        position: 'relative',
      }} className="hover:bg-[var(--t-panel-hover)] group">
        
        {/* Visual Connector Line */}
        {level > 0 && (
          <div style={{
            position: 'absolute',
            left: -10,
            top: 0,
            bottom: '50%',
            width: 10,
            borderLeft: `1px dashed ${THEME.border}`,
            borderBottom: `1px dashed ${THEME.border}`,
            borderBottomLeftRadius: 3,
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          {/* Kebab Menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
              style={{
                padding: 2,
                color: menuOpen ? THEME.accent : THEME.text.muted,
                borderRadius: 6,
                background: menuOpen ? `${THEME.accent}15` : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              className="hover:bg-[var(--t-panel-hover)]"
              title="Actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: THEME.panel,
                border: `1px solid ${THEME.border}`,
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                zIndex: 50,
                minWidth: 140,
                padding: 4,
                fontFamily: "'Prompt', sans-serif",
              }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setShowAddForm(true) }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: THEME.accent,
                    borderRadius: 6,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  className="hover:bg-[var(--t-panel-hover)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Child
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setShowEditForm(!showEditForm); setShowAddForm(false) }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#60A5FA',
                    borderRadius: 6,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  className="hover:bg-[var(--t-panel-hover)]"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </button>
                <div style={{ height: 1, background: THEME.border, margin: '2px 6px' }} />
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(dataset.id) }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#F87171',
                    borderRadius: 6,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  className="hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Expand/Collapse */}
          <button 
            onClick={() => hasChildren && onToggleExpand(dataset.id)} 
            style={{
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              color: THEME.text.muted,
              visibility: hasChildren ? 'visible' : 'hidden',
            }} 
            className="hover:bg-[var(--t-panel-hover)]"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {/* Icon + Drag Handle */}
          <div {...attributes} {...listeners} style={{
            width: 26,
            height: 22,
            background: hasChildren ? `${THEME.accent}15` : THEME.bg,
            border: `1px solid ${hasChildren ? `${THEME.accent}40` : THEME.border}`,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
          }} className="active:cursor-grabbing">
            {hasChildren ? (
              isExpanded ? 
                <FolderOpen className="w-3.5 h-3.5" style={{ color: THEME.accent }} /> :
                <Folder className="w-3.5 h-3.5" style={{ color: THEME.accent }} />
            ) : (
              <FileJson className="w-3.5 h-3.5" style={{ color: categoryColor }} />
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Breadcrumb for deep nesting */}
            {level > 2 && nodePath.length > 0 && (
              <BreadcrumbPath path={nodePath.slice(-2)} />
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 1 }}>
              <span style={{ 
                fontSize: 13,
                fontWeight: 600,
                color: THEME.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>{dataset.name}</span>
              <span style={{ 
                padding: '1px 6px', 
                borderRadius: 8, 
                fontSize: 11,
                fontWeight: 600,
                background: statusColor.bg,
                color: statusColor.text,
                border: `1px solid ${statusColor.text}30`,
              }}>{dataset.status}</span>
              {hasChildren && (
                <span style={{
                  padding: '1px 5px',
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 500,
                  background: THEME.bg,
                  color: THEME.text.muted,
                  border: `1px solid ${THEME.border}`,
                }}>
                  {dataset.children?.length}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: THEME.text.muted, minHeight: 16 }}>
              {dataset.source && dataset.source !== '-' && dataset.source !== '' && (
                <>
                  <span>{dataset.source}</span>
                  <span style={{ color: THEME.border }}>·</span>
                </>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Plug className="w-2.5 h-2.5" /> {dataset._count?.apis || 0} API
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Inline Edit Form */}
      {showEditForm && (
        <div style={{
          marginLeft: (level * 20) + 36,
          marginBottom: 8,
          marginRight: 8,
        }}>
          <InlineEditForm
            dataset={dataset}
            allSources={allSources}
            allCategories={allCategories}
            repoTables={repoTables}
            onCancel={() => setShowEditForm(false)}
            onSuccess={() => { setShowEditForm(false); refresh() }}
          />
        </div>
      )}

      {/* Inline Add Form at the end of row */}
      {showAddForm && (
        <div style={{
          marginLeft: (level * 20) + 36,
          marginBottom: 8,
          marginRight: 8,
        }}>
          <InlineAddForm
            parentId={dataset.id}
            parentName={dataset.name}
            parentCategory={dataset.category}
            allSources={allSources}
            allCategories={allCategories}
            repoTables={repoTables}
            onCancel={() => setShowAddForm(false)}
            onSuccess={() => { setShowAddForm(false); refresh() }}
          />
        </div>
      )}

      {/* Children with Connector */}
      {isExpanded && hasChildren && (
        <div style={{ marginTop: 2, position: 'relative' }}>
          {/* Vertical connector line */}
          <div style={{
            position: 'absolute',
            left: (level * 20) + 29,
            top: 0,
            bottom: 0,
            width: 1,
            borderLeft: `1px dashed ${THEME.border}`,
          }} />
          <SortableContext items={dataset.children?.map(c => c.id) || []} strategy={verticalListSortingStrategy}>
            {dataset.children?.map((child) => (
              <SortableTreeNode
                key={child.id}
                dataset={child}
                level={level + 1}
                onDelete={onDelete}
                refresh={refresh}
                allDatasets={allDatasets}
                allSources={allSources}
                allCategories={allCategories}
                repoTables={repoTables}
                expandedNodes={expandedNodes}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

// Flatten tree to array for sortable context
function flattenTree(items: DatasetData[]): DatasetData[] {
  const result: DatasetData[] = []
  for (const item of items) {
    result.push(item)
    if (item.children?.length) result.push(...flattenTree(item.children))
  }
  return result
}

// Expand all nodes utility
function getAllNodeIds(items: DatasetData[]): string[] {
  const ids: string[] = []
  for (const item of items) {
    ids.push(item.id)
    if (item.children?.length) ids.push(...getAllNodeIds(item.children))
  }
  return ids
}

export default function DatasetsClientPage() {
  const [searchText, setSearchText] = useState('')
  const [showRootAddForm, setShowRootAddForm] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetApi.list({ tree: true, limit: 100 }),
  })

  // Pull repo tables to populate the Source dropdown so admins
  // pick a real Data Repository table instead of typing a free
  // string. Falls back to {data: {tables: []}} on error.
  const { data: repoTablesResp } = useQuery({
    queryKey: ['repo-tables-for-datasets'],
    queryFn: async () => {
      const r = await fetch('/orch/api/data-repository/tables')
      if (!r.ok) return { data: { tables: [] } }
      return r.json()
    },
  })
  const repoTables: { id: string; name: string; displayName?: string | null; category?: string | null }[] = useMemo(() => {
    return (repoTablesResp?.data?.tables ?? repoTablesResp?.data ?? []) as any[]
  }, [repoTablesResp])

  const reorderMutation = useMutation({
    mutationFn: (data: { id: string; parentId: string | null; sortOrder: number }) => datasetApi.reorder(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['datasets'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => datasetApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const datasets = data?.data || []
  const flatDatasets = useMemo(() => flattenTree(datasets), [datasets])

  // Collect unique sources and categories for autocomplete
  const allSources = useMemo(() => {
    const sources = new Set<string>()
    flatDatasets.forEach(d => { if (d.source && d.source !== '-' && d.source !== '') sources.add(d.source) })
    return Array.from(sources).sort()
  }, [flatDatasets])

  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    flatDatasets.forEach(d => { if (d.category) cats.add(d.category) })
    return Array.from(cats).sort()
  }, [flatDatasets])

  // Auto-expand all on first load
  useMemo(() => {
    if (datasets.length > 0 && expandedNodes.size === 0) {
      setExpandedNodes(new Set(getAllNodeIds(datasets)))
    }
  }, [datasets])

  const filteredData = useMemo(() => {
    if (!searchText.trim()) return datasets
    const search = searchText.toLowerCase()
    const filterNode = (node: DatasetData): DatasetData | null => {
      const matches = node.name?.toLowerCase().includes(search) || node.source?.toLowerCase().includes(search)
      const filteredChildren = node.children?.map(filterNode).filter((n): n is DatasetData => n !== null)
      if (matches || (filteredChildren && filteredChildren.length > 0)) return { ...node, children: filteredChildren }
      return null
    }
    return datasets.map(filterNode).filter((n): n is DatasetData => n !== null)
  }, [datasets, searchText])

  const handleDelete = async (id: string) => {
    // Look up the friendly name from the cached tree so the confirm
    // dialog can show what's about to be deleted. Falls back to the
    // id if the row is missing for any reason.
    const findInTree = (nodes: DatasetData[]): DatasetData | null => {
      for (const n of nodes) {
        if (n.id === id) return n
        if (n.children) {
          const found = findInTree(n.children)
          if (found) return found
        }
      }
      return null
    }
    const target = findInTree(datasets)
    const ok = await confirmDialog({
      title: `Delete dataset "${target?.name ?? id}"?`,
      body: target?._count?.apis
        ? `${target._count.apis} API(s) reference this catalog. Their dataCatalogId will be cleared but the APIs themselves stay. This cannot be undone.`
        : 'This cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (ok) deleteMutation.mutate(id)
  }

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const draggedId = active.id as string
    const overId = over.id as string
    if (draggedId === overId) return

    const draggedItem = flatDatasets.find(d => d.id === draggedId)
    const overItem = flatDatasets.find(d => d.id === overId)
    if (!draggedItem || !overItem) return

    // Find siblings of the target (same parentId)
    const targetParentId = overItem.parentId
    const getSiblings = (pid: string | null, items: DatasetData[]): DatasetData[] => {
      if (pid === null) return items // root level = top-level tree items
      const parent = flatDatasets.find(d => d.id === pid)
      return parent?.children || []
    }
    const siblings = targetParentId === null ? datasets : getSiblings(targetParentId, datasets)
    const overIndex = siblings.findIndex(s => s.id === overId)
    const newSortOrder = overIndex >= 0 ? overIndex : siblings.length

    reorderMutation.mutate({ id: draggedId, parentId: targetParentId, sortOrder: newSortOrder })
  }

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleExpandAll = () => {
    setExpandedNodes(new Set(getAllNodeIds(datasets)))
  }

  const handleCollapseAll = () => {
    setExpandedNodes(new Set())
  }

  const activeDataset = activeId ? flatDatasets.find(d => d.id === activeId) : null

  // Count stats
  const stats = useMemo(() => {
    const total = flatDatasets.length
    const root = datasets.length
    const withChildren = flatDatasets.filter(d => d.children && d.children.length > 0).length
    return { total, root, withChildren }
  }, [flatDatasets, datasets])

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary }}>Data Catalogs</h1>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginTop: 1 }}>
            {stats.total} total • {stats.root} root • {stats.withChildren} with children
          </p>
        </div>
        <button 
          onClick={() => setShowRootAddForm(!showRootAddForm)} 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 14px',
            background: THEME.accent,
            color: '#FFFFFF',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          className="hover:bg-blue-500"
        >
          <Plus className="w-3.5 h-3.5" />
          + Add Root
        </button>
      </div>

      {/* Search & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
          <input 
            type="text" 
            placeholder="Search..."
            value={searchText} 
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 28px',
              background: 'var(--t-input)',
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: THEME.text.primary,
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={handleExpandAll}
            style={{
              padding: '4px 8px',
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              fontSize: 11,
              color: THEME.text.muted,
              cursor: 'pointer',
            }}
            className="hover:border-blue-300 hover:text-blue-400"
          >
            Expand
          </button>
          <button
            onClick={handleCollapseAll}
            style={{
              padding: '4px 8px',
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              fontSize: 11,
              color: THEME.text.muted,
              cursor: 'pointer',
            }}
            className="hover:border-blue-300 hover:text-blue-400"
          >
            Collapse
          </button>
        </div>
      </div>

      {/* Root Add Form */}
      {showRootAddForm && (
        <div style={{ marginBottom: 8 }}>
          <InlineAddForm
            parentId={null}
            allSources={allSources}
            allCategories={allCategories}
            repoTables={repoTables}
            onCancel={() => setShowRootAddForm(false)}
            onSuccess={() => { setShowRootAddForm(false); refetch() }}
          />
        </div>
      )}

      {/* Root Level Add Button */}
      {!showRootAddForm && (
        <div style={{ marginBottom: 8 }}>
          <button 
            onClick={() => setShowRootAddForm(true)} 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              background: 'transparent',
              border: `1px dashed ${THEME.border}`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: THEME.text.muted,
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.15s ease',
            }} 
            className="hover:border-blue-400 hover:text-blue-400 hover:bg-blue-500/10"
          >
            <Plus className="w-3.5 h-3.5" />
            + Add Root
          </button>
        </div>
      )}

      {/* Tree View with Drag and Drop */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: THEME.text.muted }}>
          <div style={{ 
            width: 20, 
            height: 20, 
            border: `2px solid ${THEME.border}`, 
            borderTopColor: THEME.accent, 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite', 
            margin: '0 auto 6px' 
          }} />
          <span style={{ fontSize: 13 }}>Loading...</span>
        </div>
      ) : filteredData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ 
            width: 36, 
            height: 30, 
            background: THEME.panel, 
            border: `1px solid ${THEME.border}`, 
            borderRadius: 8, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 8px' 
          }}>
            <Database className="w-4 h-4" style={{ color: THEME.text.muted }} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary, marginBottom: 1 }}>
            {searchText ? 'No results found' : 'No data catalogs yet'}
          </p>
          <p style={{ fontSize: 11, color: THEME.text.muted }}>
            {searchText ? 'Try adjusting your search' : 'Create your first dataset'}
          </p>
        </div>
      ) : (
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter} 
          onDragStart={handleDragStart} 
          onDragEnd={handleDragEnd}
        >
          <div style={{ 
            background: THEME.panel, 
            border: `1px solid ${THEME.border}`, 
            borderRadius: 6, 
            padding: 8,
          }}>
            <SortableContext items={flatDatasets.map(d => d.id)} strategy={verticalListSortingStrategy}>
              {filteredData.map((dataset) => (
                <SortableTreeNode
                  key={dataset.id}
                  dataset={dataset}
                  level={0}
                  onDelete={handleDelete}
                  refresh={refetch}
                  allDatasets={flatDatasets}
                  allSources={allSources}
                  allCategories={allCategories}
                  repoTables={repoTables}
                  expandedNodes={expandedNodes}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </SortableContext>
          </div>

          <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }) }}>
            {activeDataset ? (
              <div style={{ 
                background: THEME.panel, 
                border: `1px solid ${THEME.accent}50`, 
                borderRadius: 8, 
                padding: 8, 
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MoreVertical className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
                  <div style={{ 
                    width: 3, 
                    height: 20, 
                    borderRadius: 2, 
                    background: categoryColors[activeDataset.category] || categoryColors.other 
                  }} />
                  <Folder className="w-4 h-4" style={{ color: THEME.accent }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }}>{activeDataset.name}</span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
