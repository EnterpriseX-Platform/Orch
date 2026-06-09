'use client'

import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ViewToggleProps {
  view: 'grid' | 'list'
  onChange: (view: 'grid' | 'list') => void
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center bg-[#1a1a1d] rounded-lg p-1 border border-[#27272a]">
      <button
        onClick={() => onChange('grid')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
          view === 'grid'
            ? 'bg-[#27272a] text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-300'
        )}
      >
        <LayoutGrid className="w-4 h-4" />
        <span>Grid</span>
      </button>
      <button
        onClick={() => onChange('list')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
          view === 'list'
            ? 'bg-[#27272a] text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-300'
        )}
      >
        <List className="w-4 h-4" />
        <span>List</span>
      </button>
    </div>
  )
}
