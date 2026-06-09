import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date formatting utilities
export function formatDate(date: string | Date, format: 'short' | 'long' | 'full' = 'long'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: format === 'short' ? 'short' : 'long',
    day: 'numeric',
  }
  
  if (format === 'full') {
    options.hour = '2-digit'
    options.minute = '2-digit'
    options.second = '2-digit'
  }
  
  return d.toLocaleDateString('th-TH', options)
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'Just now'
}

// Number formatting
export function formatNumber(num: number): string {
  return num.toLocaleString('th-TH')
}

export function formatCurrency(amount: number, currency: string = 'THB'): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
  }).format(amount)
}

// Status/badge utilities
export function getStatusColor(status: string): { bg: string; text: string; border: string } {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    // General status
    ACTIVE: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
    INACTIVE: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' },
    DRAFT: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
    DEPRECATED: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
    ARCHIVED: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200' },
    
    // HTTP Status
    SUCCESS: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
    FAILED: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
    PENDING: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
    RUNNING: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
    PARTIAL: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
    
    // Audit Actions
    CREATE: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
    UPDATE: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
    AUDIT_DELETE: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
    LOGIN: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
    LOGOUT: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' },
    VIEW: { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200' },
    EXPORT: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
  }
  
  return colors[status.toUpperCase()] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    // Status
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    DRAFT: 'Draft',
    DEPRECATED: 'Deprecated',
    ARCHIVED: 'Archived',

    // Data Categories
    transactional: 'Transactional',
    reserved: 'Reserved',
    transfer: 'Transfer',
    performance: 'Performance Result',
    expenditure: 'Expenditure',
    procurement: 'Procurement',
    master_data: 'Master Data',
    other: 'Other',

    // Flow Types
    audit_trail: 'Audit Trail',
    event_stream: 'Event Stream (Kafka)',
    data_transform: 'Data Transform',
    webhook: 'Webhook',
    notification: 'Notification',
    custom: 'Custom',

    // HTTP Methods
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    PATCH: 'PATCH',
    HTTP_DELETE: 'DELETE',

    // Auth Types
    NONE: 'None',
    JWT: 'JWT',
    API_KEY: 'API Key',
    OAUTH2: 'OAuth2',

    // Audit Actions
    CREATE: 'Create',
    UPDATE: 'Update',
    AUDIT_DELETE: 'Delete',
    LOGIN: 'Login',
    LOGOUT: 'Logout',
    VIEW: 'View',
    EXPORT: 'Export',
    APPROVE: 'Approve',
    REJECT: 'Reject',
  }
  
  return labels[status] || status
}

// Validation utilities
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

// File utilities
export function downloadFile(content: string | Blob, filename: string, type: string = 'text/plain'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

// Truncate text
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// Debounce function
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Group by utility
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const groupKey = String(item[key])
    result[groupKey] = result[groupKey] || []
    result[groupKey].push(item)
    return result
  }, {} as Record<string, T[]>)
}

// Deep clone
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Safe JSON parse
export function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

// Format bytes
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// Format duration
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(0)
  return `${minutes}m ${seconds}s`
}
