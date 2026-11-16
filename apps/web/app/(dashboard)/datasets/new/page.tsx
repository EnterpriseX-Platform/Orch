'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { datasetApi } from '@/lib/api'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button, InlineNotification, Select, SelectItem, TextArea, TextInput } from '@carbon/react'
import Link from 'next/link'

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


  return (
    <div className="min-h-screen bg-[var(--t-bg)] p-6">
      {/* Header */}
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link 
            href="/datasets"
            className="p-2 hover:bg-[var(--t-panel-hover)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--t-text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-xl font-normal text-[var(--t-text)]">Add New Dataset</h1>
            <p className="text-base text-[var(--t-text-muted)] mt-1">Create a new data catalog entry</p>
          </div>
        </div>

        {success && (
          <InlineNotification
            kind="success"
            lowContrast
            hideCloseButton
            title="Dataset created successfully!"
            subtitle="Redirecting to dataset list..."
            className="mb-6"
          />
        )}

        {error && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Error"
            subtitle={error}
            className="mb-6"
          />
        )}

        <form onSubmit={handleSubmit} className="bg-[var(--t-panel)] border border-[var(--t-border)] p-6 space-y-6">
          <TextInput
            id="dataset-name"
            labelText="Dataset Name *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Budget Expense 2024"
            required
          />

          <TextInput
            id="dataset-source"
            labelText="Data Source *"
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
            placeholder="e.g., SAP ERP, Oracle Database"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              id="dataset-category"
              labelText="Category *"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
            >
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value} text={cat.label} />
              ))}
            </Select>
            <Select
              id="dataset-status"
              labelText="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              {statuses.map((s) => (
                <SelectItem key={s.value} value={s.value} text={s.label} />
              ))}
            </Select>
          </div>

          <TextArea
            id="dataset-description"
            labelText="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Describe the dataset content and purpose..."
            rows={4}
          />

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-[var(--t-border)]">
            <Button kind="ghost" onClick={() => router.push('/datasets')}>
              Cancel
            </Button>
            <Button
              type="submit"
              kind="primary"
              disabled={isSubmitting || success}
              renderIcon={isSubmitting ? undefined : Plus}
            >
              {isSubmitting ? 'Creating...' : 'Add Dataset'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
