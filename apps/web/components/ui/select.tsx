'use client'

import { Fragment } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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
}

const sizeStyles = {
  sm: {
    button: 'py-2 pl-3 pr-8 text-[12px]',
    icon: 'h-3.5 w-3.5',
    options: 'text-[12px]',
    optionPadding: 'py-2 pl-3 pr-8',
    checkIcon: 'h-3.5 w-3.5',
  },
  md: {
    button: 'py-2.5 pl-3.5 pr-9 text-[13px]',
    icon: 'h-4 w-4',
    options: 'text-[13px]',
    optionPadding: 'py-2.5 pl-3.5 pr-9',
    checkIcon: 'h-4 w-4',
  },
  lg: {
    button: 'py-3 pl-4 pr-10 text-[14px]',
    icon: 'h-4 w-4',
    options: 'text-[14px]',
    optionPadding: 'py-3 pl-4 pr-10',
    checkIcon: 'h-4 w-4',
  },
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  size = 'sm',
}: SelectProps) {
  const selectedOption = options.find((opt) => opt.value === value)
  const styles = sizeStyles[size]

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={cn('relative', className)}>
        <Listbox.Button
          style={{
            background: 'var(--t-input)',
            borderColor: 'var(--t-border)',
            color: 'var(--t-text)',
          }}
          className={cn(
            'relative w-full cursor-pointer rounded-lg border text-left font-medium',
            'hover:border-[#3B82F6]/50',
            'focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20',
            'transition-all duration-200',
            disabled && 'cursor-not-allowed opacity-60',
            styles.button
          )}
        >
          <span
            style={!selectedOption ? { color: 'var(--t-text-muted)' } : undefined}
            className={cn('block truncate', !selectedOption && 'font-normal')}
          >
            {selectedOption?.label || placeholder}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
            <ChevronUpDownIcon
              style={{ color: 'var(--t-text-muted)' }}
              className={cn('transition-colors', styles.icon)}
              aria-hidden="true"
            />
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-200"
          enterFrom="opacity-0 translate-y-1 scale-[0.97]"
          enterTo="opacity-100 translate-y-0 scale-100"
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0 scale-100"
          leaveTo="opacity-0 translate-y-1 scale-[0.97]"
        >
          <Listbox.Options
            style={{
              background: 'var(--t-panel)',
              borderColor: 'var(--t-border)',
            }}
            className={cn(
              'absolute z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-xl',
              'py-1.5 shadow-2xl',
              'border',
              'focus:outline-none',
              'scrollbar-thin scrollbar-track-transparent',
              styles.options
            )}
          >
            {options.map((option) => (
              <Listbox.Option
                key={option.value}
                className={({ active, selected }) =>
                  cn(
                    'relative cursor-pointer select-none transition-all duration-100 mx-1.5 rounded-lg',
                    styles.optionPadding,
                    active ? 'bg-[#3B82F6]/12' : '',
                    selected && 'font-semibold',
                    option.disabled && 'cursor-not-allowed opacity-40'
                  )
                }
                value={option.value}
                disabled={option.disabled}
              >
                {({ selected, active }) => (
                  <>
                    <span
                      style={{
                        color: selected ? '#60A5FA' : (active ? 'var(--t-text)' : 'var(--t-text-secondary)'),
                      }}
                      className={cn(
                        'block truncate transition-colors',
                        selected ? 'font-semibold' : 'font-normal'
                      )}
                    >
                      {option.label}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-[#3B82F6]">
                        <CheckIcon className={styles.checkIcon} aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  )
}

// Native select fallback for basic use cases
interface NativeSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[]
  selectSize?: 'sm' | 'md' | 'lg'
}

export function NativeSelect({
  options,
  className,
  selectSize = 'sm',
  ...props
}: NativeSelectProps) {
  const styles = sizeStyles[selectSize]

  return (
    <select
      style={{
        background: 'var(--t-input)',
        borderColor: 'var(--t-border)',
        color: 'var(--t-text)',
      }}
      className={cn(
        'w-full rounded-lg border cursor-pointer font-medium',
        'hover:border-[#3B82F6]/50',
        'focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20',
        'transition-all duration-200',
        styles.button,
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
