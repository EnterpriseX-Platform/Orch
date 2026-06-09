'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { datasetApi } from '@/lib/api'
import { ArrowLeft, Database, Plus, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const categories = [
  { value: 'transactional', label: 'Transactional', color: 'blue' },
  { value: 'reserved', label: 'Reserved', color: 'amber' },
  { value: 'transfer', label: 'Transfer', color: 'purple' },
  { value: 'performance', label: 'Performance Result', color: 'emerald' },
  { value: 'expenditure', label: 'Expenditure', color: 'red' },
  { value: 'procurement', label: 'Procurement', color: 'cyan' },
  // Operation success / completion category
  { value: 'operation', label: 'Operation Success', color: 'emerald' },
  { value: 'master_data', label: 'Master Data', color: 'slate' },
  { value: 'other', label: 'Other', color: 'gray' },
]

const statuses = [
  { value: 'ACTIVE', label: 'Active', color: 'emerald' },
  { value: 'DRAFT', label: 'Draft', color: 'amber' },
  { value: 'ARCHIVED', label: 'Archived', color: 'slate' },
]

export default function NewDatasetPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    source: '',
    category: 'other',
    description: '',
    status: 'ACTIVE',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    
    try {
      if (!formData.name.trim()) {
        throw new Error('Dataset name is required')
      }
      if (!formData.source.trim()) {
        throw new Error('Data source is required')
      }

      const apiData = {
        name: formData.name.trim(),
        source: formData.source.trim(),
        description: formData.description.trim() || undefined,
        category: formData.category.toUpperCase().replace(/-/g, '_'),
        status: formData.status,
        nameEn: formData.name.trim(),
        dataOwner: formData.source.trim(),
        updateFrequency: 'DAILY',
        isPublic: true,
      }

      console.log('Submitting dataset:', apiData)
      
      const result = await datasetApi.create(apiData)
      console.log('Created dataset:', result)
      
      setSuccess(true)
      
      setTimeout(() => {
        router.push('/datasets')
      }, 1000)
    } catch (err: any) {
      console.error('Failed to create dataset:', err)
      if (err.details && Array.isArray(err.details)) {
        const messages = err.details.map((d: any) => `${d.path.join('.')}: ${d.message}`).join(', ')
        setError(`Validation error: ${messages}`)
      } else {
        setError(err.message || 'Failed to create dataset. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedCategory = categories.find(c => c.value === formData.category)
  const selectedStatus = statuses.find(s => s.value === formData.status)

  return (
    <div className="min-h-screen bg-[var(--t-bg)] p-6">
      {/* Header */}
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link 
            href="/datasets"
            className="p-2 hover:bg-[var(--t-panel-hover)] rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--t-text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-[var(--t-text)]">Add New Dataset</h1>
            <p className="text-base text-[var(--t-text-muted)] mt-1">Create a new data catalog entry</p>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#34d399]" />
            <div>
              <p className="font-medium text-[#34d399]">Dataset created successfully!</p>
              <p className="text-base text-[#10b981]/70">Redirecting to dataset list...</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[#f87171]" />
            <div>
              <p className="font-medium text-[#f87171]">Error</p>
              <p className="text-base text-[#f87171]/70">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl p-6 space-y-6">
          {/* Dataset Name */}
          <div>
            <label className="block text-base font-medium text-[var(--t-text-secondary)] mb-2">
              Dataset Name <span className="text-[#ef4444]">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Transactional 2024"
              className="w-full px-4 py-2.5 bg-[var(--t-bg)] border border-[var(--t-border)] rounded-lg text-[var(--t-text)] placeholder:text-[var(--t-text-muted)]/60 focus:outline-none focus:border-[#3b82f6] transition-colors"
              required
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-base font-medium text-[var(--t-text-secondary)] mb-2">
              Data Source <span className="text-[#ef4444]">*</span>
            </label>
            <input
              type="text"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="e.g., SAP ERP, Oracle Database"
              className="w-full px-4 py-2.5 bg-[var(--t-bg)] border border-[var(--t-border)] rounded-lg text-[var(--t-text)] placeholder:text-[var(--t-text-muted)]/60 focus:outline-none focus:border-[#3b82f6] transition-colors"
              required
            />
          </div>

          {/* Category & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-medium text-[var(--t-text-secondary)] mb-2">
                Category <span className="text-[#ef4444]">*</span>
              </label>
              <div className="relative">
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[var(--t-bg)] border border-[var(--t-border)] rounded-lg text-[var(--t-text)] focus:outline-none focus:border-[#3b82f6] appearance-none cursor-pointer"
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-text-muted)] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-base font-medium text-[var(--t-text-secondary)] mb-2">
                Status
              </label>
              <div className="relative">
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[var(--t-bg)] border border-[var(--t-border)] rounded-lg text-[var(--t-text)] focus:outline-none focus:border-[#3b82f6] appearance-none cursor-pointer"
                >
                  {statuses.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-text-muted)] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-base font-medium text-[var(--t-text-secondary)] mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the dataset content and purpose..."
              rows={4}
              className="w-full px-4 py-2.5 bg-[var(--t-bg)] border border-[var(--t-border)] rounded-lg text-[var(--t-text)] placeholder:text-[var(--t-text-muted)]/60 focus:outline-none focus:border-[#3b82f6] transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-[var(--t-border)]">
            <Link
              href="/datasets"
              className="px-4 py-2 text-[var(--t-text-secondary)] hover:text-[var(--t-text)] font-medium transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || success}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#3b82f6]/20"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add Dataset
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
