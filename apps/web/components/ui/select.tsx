'use client'

// Thin wrappers that keep this module's old API but render IBM Carbon's
// <Select>. Callers own their visible label, so Carbon's label is hidden.

import { useId } from 'react'
import { Select as CarbonSelect, SelectItem } from '@carbon/react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  icon?: React.ReactNode
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /** Accessible name; defaults to the placeholder. */
  label?: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  size = 'sm',
  label,
}: SelectProps) {
  const id = useId()
  const hasValue = options.some((o) => o.value === value)
  return (
    <CarbonSelect
      id={id}
      labelText={label ?? placeholder}
      hideLabel
      size={size}
      value={hasValue ? value : ''}
      disabled={disabled}
      className={className}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
    >
      {!hasValue && <SelectItem value="" text={placeholder} disabled hidden />}
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value} text={o.label} disabled={o.disabled} />
      ))}
    </CarbonSelect>
  )
}

interface NativeSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[]
  selectSize?: 'sm' | 'md' | 'lg'
  label?: string
}

export function NativeSelect({ options, className, selectSize = 'sm', label, id, ...props }: NativeSelectProps) {
  const autoId = useId()
  return (
    <CarbonSelect
      id={id ?? autoId}
      labelText={label ?? (props['aria-label'] as string) ?? 'Select'}
      hideLabel
      size={selectSize}
      className={className}
      {...(props as any)}
    >
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value} text={o.label} disabled={o.disabled} />
      ))}
    </CarbonSelect>
  )
}
