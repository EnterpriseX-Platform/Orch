'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}

export function CustomSelect({ value, onChange, options, placeholder, className, style }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
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

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className={`relative ${className || ''}`} style={style}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 w-full cursor-pointer transition-colors"
        style={{
          padding: '6px 10px',
          background: 'var(--t-input)',
          border: '1px solid var(--t-border)',
          borderRadius: 8,
          fontSize: 13,
          color: selected ? 'var(--t-text)' : 'var(--t-text-muted)',
          outline: 'none',
          fontFamily: "'Prompt', sans-serif",
          textAlign: 'left',
        }}
      >
        <span className="truncate">{selected?.label || placeholder || 'Select...'}</span>
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
          style={{
            color: 'var(--t-text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 overflow-hidden"
          style={{
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className="w-full text-left transition-colors cursor-pointer"
              style={{
                padding: '7px 10px',
                fontSize: 13,
                color: option.value === value ? '#3B82F6' : 'var(--t-text)',
                background: option.value === value ? '#3B82F612' : 'transparent',
                fontFamily: "'Prompt', sans-serif",
                fontWeight: option.value === value ? 500 : 400,
                borderBottom: '1px solid var(--t-border-light)',
              }}
              onMouseEnter={(e) => {
                if (option.value !== value) {
                  e.currentTarget.style.background = 'var(--t-panel-hover)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = option.value === value ? '#3B82F612' : 'transparent'
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
