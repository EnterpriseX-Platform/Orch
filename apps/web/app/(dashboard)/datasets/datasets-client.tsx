'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { datasetApi } from '@/lib/api'
import { 
  Database, Plus, AlertCircle,
  ChevronRight, ChevronDown, Folder, FileJson, Check, X, Edit3, GripVertical, MoreVertical,
  FolderOpen, CornerDownRight, Home, MoreHorizontal, Plug
} from 'lucide-react'
import Link from 'next/link'
import { Button, OverflowMenu, OverflowMenuItem, Search, Select, SelectItem, TextInput } from '@carbon/react'
import { cn } from '@/lib/utils'
import { confirmDialog } from '@/components/common/ConfirmDialog'
import {
  DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragStartEvent, DragEndEvent, defaultDropAnimationSideEffects,
} from '@dnd-kit/core'
import { useSortable, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif'

// Dark Theme
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  borderAccent: '#0353e950',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent-hover)',
  accentLight: 'var(--t-accent-light)',
  colors: { blue: '#8B92A5', emerald: '#198038', amber: '#ba4e00', red: '#da1e28', purple: '#6929c4' }
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
  transfer: '#6929c4',
  performance: '#198038',
  expenditure: '#da1e28',
  procurement: '#1192e8',
  operation_success: '#24a148',
  master_data: '#64748B',
  other: '#94A3B8',
}

const statusColors: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: '#a7f0ba', text: '#0e6027' },
  DRAFT: { bg: '#d0e2ff', text: '#0043ce' },
  ARCHIVED: { bg: '#e0e0e0', text: '#161616' },
  DEPRECATED: { bg: '#ffd7d9', text: '#a2191f' },
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
  borderRadius: 0,
  fontSize: 12,
  color: 'var(--t-text)',
  outline: 'none',
  transition: 'border-color 0.15s ease',
  height: 28,
  lineHeight: '20px',
  width: '100%',
  minWidth: 0,
  textOverflow: 'ellipsis',
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
          borderRadius: 0,
          boxShadow: 'none',
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
      borderRadius: 0,
      border: '1px solid #e0e0e0',
      boxShadow: 'none',
    }}>
      {parentName && (
        <div style={{
          padding: '5px 12px',
          background: '#e0e0e0',
          borderBottom: '1px solid #e0e0e0',
          fontSize: 11,
          fontWeight: 500,
          color: THEME.accent,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: 0,
        }}>
          <CornerDownRight className="w-2.5 h-2.5" />
          Under: <strong>{parentName}</strong>
        </div>
      )}
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 26,
          height: 22,
          background: '#e0e0e0',
          border: '1px dashed #8d8d8d',
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Plus className="w-3 h-3" style={{ color: THEME.accent }} />
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr) minmax(0,2fr)', gap: 6, minWidth: 0 }}>
          <TextInput
            id={`ds-add-${parentId ?? 'root'}` + '-name'}
            labelText="Name"
            hideLabel
            size="sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name..."
            autoFocus
          />
          <Select
            id={`ds-add-${parentId ?? 'root'}` + '-category'}
            labelText="Category"
            hideLabel
            size="sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <SelectItem value="" text="— Category —" />
            {Object.entries(categoryLabels).map(([k, v]) => (
              <SelectItem key={k} value={k.toUpperCase()} text={`${v} — ${k.toUpperCase()}`} />
            ))}
          </Select>
          <Select
            id={`ds-add-${parentId ?? 'root'}` + '-source'}
            labelText="Source table"
            hideLabel
            size="sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <SelectItem value="" text="— Source table —" />
            {(repoTables ?? []).map((t) => (
              <SelectItem key={t.id} value={t.name} text={t.displayName ? `${t.name} — ${t.displayName}` : t.name} />
            ))}
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Button
            type="submit"
            kind="primary"
            size="sm"
            disabled={isSubmitting || !name.trim()}
            renderIcon={Check}
          >
            Save
          </Button>
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            iconDescription="Cancel"
            renderIcon={X}
            onClick={onCancel}
          />
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
      borderRadius: 0,
      border: '1px solid #e0e0e0',
      boxShadow: 'none',
    }}>
      <div style={{
        padding: '5px 12px',
        background: '#e0e0e0',
        borderBottom: '1px solid #e0e0e0',
        borderRadius: 0,
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
          background: '#e0e0e0',
          border: '1px solid #e0e0e0',
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Edit3 className="w-3 h-3" style={{ color: THEME.accent }} />
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr) minmax(0,2fr)', gap: 6, minWidth: 0 }}>
          <TextInput
            id={`ds-edit-${dataset.id}` + '-name'}
            labelText="Name"
            hideLabel
            size="sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name..."
            autoFocus
          />
          <Select
            id={`ds-edit-${dataset.id}` + '-category'}
            labelText="Category"
            hideLabel
            size="sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <SelectItem value="" text="— Category —" />
            {Object.entries(categoryLabels).map(([k, v]) => (
              <SelectItem key={k} value={k.toUpperCase()} text={`${v} — ${k.toUpperCase()}`} />
            ))}
          </Select>
          <Select
            id={`ds-edit-${dataset.id}` + '-source'}
            labelText="Source table"
            hideLabel
            size="sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <SelectItem value="" text="— Source table —" />
            {(repoTables ?? []).map((t) => (
              <SelectItem key={t.id} value={t.name} text={t.displayName ? `${t.name} — ${t.displayName}` : t.name} />
            ))}
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Button
            type="submit"
            kind="primary"
            size="sm"
            disabled={isSubmitting || !name.trim()}
            renderIcon={Check}
          >
            Save
          </Button>
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            iconDescription="Cancel"
            renderIcon={X}
            onClick={onCancel}
          />
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
        borderRadius: 0,
        marginLeft: level * 20,
        background: isDragging ? '#e0e0e0' : 'transparent',
        border: isDragging ? '1px solid #e0e0e0' : '1px solid transparent',
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
          <div ref={menuRef} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <OverflowMenu
              size="sm"
              flipped={false}
              aria-label="Actions"
              iconDescription="Actions"
              renderIcon={MoreVertical}
            >
              <OverflowMenuItem
                itemText="Add Child"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(false); setShowAddForm(true) }}
              />
              <OverflowMenuItem
                itemText="Edit"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(false); setShowEditForm(!showEditForm); setShowAddForm(false) }}
              />
              <OverflowMenuItem
                itemText="Delete"
                isDelete
                hasDivider
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen(false); onDelete(dataset.id) }}
              />
            </OverflowMenu>
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
              borderRadius: 0,
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
            background: 'transparent',
            border: '1px solid #e0e0e0',
            borderRadius: 0,
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
                borderRadius: 0, 
                fontSize: 11,
                fontWeight: 600,
                background: statusColor.bg,
                color: statusColor.text,
                border: '1px solid #e0e0e0',
              }}>{dataset.status}</span>
              {hasChildren && (
                <span style={{
                  padding: '1px 5px',
                  borderRadius: 0,
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
          <h1 style={{ fontSize: 20, fontWeight: 400, color: THEME.text.primary }}>Data Catalogs</h1>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginTop: 1 }}>
            {stats.total} total • {stats.root} root • {stats.withChildren} with children
          </p>
        </div>
        <Button size="sm" kind="primary" renderIcon={Plus} onClick={() => setShowRootAddForm(!showRootAddForm)}>
          Add Root
        </Button>
      </div>

      {/* Search & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search
            id="datasets-search"
            size="sm"
            labelText="Search"
            placeholder="Search..."
            value={searchText}
            onChange={(e) => setSearchText(typeof e === 'string' ? e : e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Button size="sm" kind="tertiary" onClick={handleExpandAll}>
            Expand
          </Button>
          <Button size="sm" kind="tertiary" onClick={handleCollapseAll}>
            Collapse
          </Button>
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
          <Button kind="ghost" size="sm" renderIcon={Plus} onClick={() => setShowRootAddForm(true)} style={{ width: '100%', maxWidth: 'none' }}>
            Add Root
          </Button>
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
            borderRadius: 0, 
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
            borderRadius: 0, 
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
                border: '1px solid #e0e0e0', 
                borderRadius: 0, 
                padding: 8, 
                boxShadow: 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MoreVertical className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
                  <div style={{ 
                    width: 3, 
                    height: 20, 
                    borderRadius: 0, 
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
