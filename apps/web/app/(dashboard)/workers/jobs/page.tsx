'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Briefcase,
  RefreshCw,
  Eye,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  RotateCw,
  Ban,
} from 'lucide-react'

const FONT = "'Prompt', sans-serif"

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  colors: {
    blue: '#3B82F6',
    emerald: '#10B981',
    purple: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
    slate: '#64748B',
  }
}

interface WorkerJob {
  id: string
  requestId: string
  flowId: string
  nodeId: string
  nodeType: string
  queueName: string
  priority: number
  status: string
  inputData: any
  outputData: any
  config: any
  maxRetries: number
  retryCount: number
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

interface JobsResponse {
  data: WorkerJob[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const statusConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  PENDING:    { color: '#64748B', icon: Clock,        label: 'Pending' },
  QUEUED:     { color: '#3B82F6', icon: Clock,        label: 'Queued' },
  PROCESSING: { color: '#F59E0B', icon: Loader2,      label: 'Processing' },
  SUCCESS:    { color: '#10B981', icon: CheckCircle2, label: 'Success' },
  FAILED:     { color: '#EF4444', icon: XCircle,      label: 'Failed' },
  RETRYING:   { color: '#F59E0B', icon: RotateCw,     label: 'Retrying' },
  CANCELLED:  { color: '#64748B', icon: Ban,          label: 'Cancelled' },
}

export default function WorkerJobsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [selectedJob, setSelectedJob] = useState<WorkerJob | null>(null)
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useQuery<JobsResponse>({
    queryKey: ['worker-jobs', statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetch(`/orch/api/worker-jobs?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const jobs = data?.data || []

  const stats = useMemo(() => {
    const total = jobs.length
    const success = jobs.filter(j => j.status === 'SUCCESS').length
    const failed = jobs.filter(j => j.status === 'FAILED').length
    const processing = jobs.filter(j => j.status === 'PROCESSING' || j.status === 'QUEUED').length
    const retrying = jobs.filter(j => j.status === 'RETRYING').length
    const pending = jobs.filter(j => j.status === 'PENDING').length
    return { total, success, failed, processing, retrying, pending }
  }, [jobs])

  const filterTabs = [
    { id: 'ALL',        label: 'All Jobs',   count: stats.total },
    { id: 'SUCCESS',    label: 'Success',    count: stats.success },
    { id: 'FAILED',     label: 'Failed',     count: stats.failed },
    { id: 'PROCESSING', label: 'Processing', count: stats.processing },
    { id: 'RETRYING',   label: 'Retrying',   count: stats.retrying },
    { id: 'PENDING',    label: 'Pending',    count: stats.pending },
  ]

  const statCards = [
    { icon: Briefcase,    label: 'Total Jobs',  value: stats.total,      color: THEME.colors.blue },
    { icon: CheckCircle2, label: 'Success',     value: stats.success,    color: THEME.colors.emerald },
    { icon: XCircle,      label: 'Failed',      value: stats.failed,     color: THEME.colors.red },
    { icon: Loader2,      label: 'Processing',  value: stats.processing, color: THEME.colors.amber },
    { icon: RotateCw,     label: 'Retrying',    value: stats.retrying,   color: THEME.colors.purple },
    { icon: Clock,        label: 'Pending',     value: stats.pending,    color: THEME.colors.slate },
  ]

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary }}>Worker Jobs</h1>
          <p style={{ fontSize: 13, color: THEME.text.muted, marginTop: 2 }}>
            Manage and monitor the status of async jobs from the worker
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => refetch()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: THEME.text.secondary,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            className="hover:border-[#3B82F6] hover:text-[#3B82F6]"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards - same pattern as Audit page */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 10,
              padding: '10px',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div style={{
                width: 26,
                height: 22,
                background: `${stat.color}12`,
                border: `1px solid ${stat.color}35`,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
              </div>
              <span style={{ fontSize: 11, color: THEME.text.muted }}>live</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: THEME.text.primary }}>{stat.value.toLocaleString()}</p>
            <p style={{ fontSize: 11, color: THEME.text.muted }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs - same pattern as Audit page */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
      }}>
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setPage(1) }}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 6,
                border: statusFilter === tab.id ? 'none' : `1px solid ${THEME.border}`,
                background: statusFilter === tab.id ? THEME.accent : 'var(--t-input)',
                color: statusFilter === tab.id ? '#FFFFFF' : THEME.text.secondary,
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              {tab.label}
              <span style={{
                padding: '1px 5px',
                borderRadius: 10,
                fontSize: 11,
                background: statusFilter === tab.id ? 'rgba(255,255,255,0.2)' : THEME.panel,
                color: statusFilter === tab.id ? '#FFFFFF' : THEME.text.muted,
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Jobs Table */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', fontFamily: FONT }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${THEME.border}`, background: 'var(--t-input)' }}>
              {['Status', 'Node Type', 'Queue', 'Retry', 'Job ID', 'Created', ''].map((h) => (
                <th key={h} style={{
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  color: THEME.text.muted,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: THEME.text.muted }}>
                  Loading...
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: THEME.text.muted }}>
                  No jobs
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const cfg = statusConfig[job.status] || statusConfig.PENDING
                const Icon = cfg.icon
                return (
                  <tr
                    key={job.id}
                    style={{ borderTop: `1px solid ${THEME.borderLight}` }}
                    className="hover:bg-[var(--t-panel-hover)]"
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 6,
                        background: `${cfg.color}15`,
                        color: cfg.color,
                        border: `1px solid ${cfg.color}30`,
                      }}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: THEME.text.primary }}>{job.nodeType}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: THEME.text.secondary }}>
                      {job.queueName}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: THEME.text.muted }}>
                      {job.retryCount}/{job.maxRetries}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <code style={{
                        fontSize: 11,
                        color: THEME.text.muted,
                        background: 'var(--t-input)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}>
                        {job.id.slice(0, 12)}...
                      </code>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: THEME.text.muted }}>
                      {new Date(job.createdAt).toLocaleString('th-TH')}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <button
                        onClick={() => setSelectedJob(job)}
                        style={{
                          padding: '4px 8px',
                          border: `1px solid ${THEME.border}`,
                          borderRadius: 6,
                          background: 'transparent',
                          color: THEME.text.secondary,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                        }}
                        className="hover:border-[#3B82F6] hover:text-[#3B82F6]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
          fontSize: 13,
        }}>
          <span style={{ color: THEME.text.muted }}>
            Showing {jobs.length} of {data.total} jobs
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              style={{
                padding: '6px 14px',
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                background: THEME.panel,
                color: THEME.text.secondary,
                fontSize: 12,
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <span style={{ padding: '6px 14px', color: THEME.text.muted }}>
              Page {page}/{data.totalPages}
            </span>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{
                padding: '6px 14px',
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                background: THEME.panel,
                color: THEME.text.secondary,
                fontSize: 12,
                cursor: page >= data.totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= data.totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedJob && (
        <div
          onClick={() => setSelectedJob(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 800,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 10,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              fontFamily: FONT,
            }}
          >
            {/* Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: `1px solid ${THEME.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: THEME.text.primary }}>Job Details</h2>
              <button
                onClick={() => setSelectedJob(null)}
                style={{
                  padding: 4,
                  background: 'transparent',
                  border: 'none',
                  color: THEME.text.muted,
                  cursor: 'pointer',
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 14px', fontSize: 13, marginBottom: 14 }}>
                <div style={{ color: THEME.text.muted }}>Job ID:</div>
                <code style={{ fontSize: 12, color: THEME.text.primary }}>{selectedJob.id}</code>

                <div style={{ color: THEME.text.muted }}>Status:</div>
                <div>
                  {(() => {
                    const cfg = statusConfig[selectedJob.status] || statusConfig.PENDING
                    const Icon = cfg.icon
                    return (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 6,
                        background: `${cfg.color}15`,
                        color: cfg.color,
                        border: `1px solid ${cfg.color}30`,
                      }}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    )
                  })()}
                </div>

                <div style={{ color: THEME.text.muted }}>Node:</div>
                <div style={{ color: THEME.text.primary }}>
                  {selectedJob.nodeType} <span style={{ color: THEME.text.muted }}>({selectedJob.nodeId})</span>
                </div>

                <div style={{ color: THEME.text.muted }}>Queue:</div>
                <div style={{ color: THEME.text.primary }}>
                  {selectedJob.queueName} <span style={{ color: THEME.text.muted }}>priority {selectedJob.priority}</span>
                </div>

                <div style={{ color: THEME.text.muted }}>Flow:</div>
                <code style={{ fontSize: 12, color: THEME.text.primary }}>{selectedJob.flowId}</code>

                <div style={{ color: THEME.text.muted }}>Retry:</div>
                <div style={{ color: THEME.text.primary }}>{selectedJob.retryCount}/{selectedJob.maxRetries}</div>

                <div style={{ color: THEME.text.muted }}>Created:</div>
                <div style={{ color: THEME.text.primary }}>{new Date(selectedJob.createdAt).toLocaleString('th-TH')}</div>

                {selectedJob.startedAt && (
                  <>
                    <div style={{ color: THEME.text.muted }}>Started:</div>
                    <div style={{ color: THEME.text.primary }}>{new Date(selectedJob.startedAt).toLocaleString('th-TH')}</div>
                  </>
                )}

                {selectedJob.completedAt && (
                  <>
                    <div style={{ color: THEME.text.muted }}>Completed:</div>
                    <div style={{ color: THEME.text.primary }}>{new Date(selectedJob.completedAt).toLocaleString('th-TH')}</div>
                  </>
                )}
              </div>

              {selectedJob.errorMessage && (
                <div style={{
                  padding: 10,
                  border: `1px solid #EF444430`,
                  background: '#EF444408',
                  borderRadius: 6,
                  color: '#EF4444',
                  fontSize: 13,
                  marginBottom: 12,
                }}>
                  <strong>Error:</strong> {selectedJob.errorMessage}
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: THEME.text.muted, marginBottom: 6 }}>
                  INPUT DATA
                </div>
                <pre style={{
                  padding: 10,
                  background: 'var(--t-input)',
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: THEME.text.primary,
                  maxHeight: 240,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                }}>
                  {JSON.stringify(selectedJob.inputData, null, 2)}
                </pre>
              </div>

              {selectedJob.outputData && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: THEME.text.muted, marginBottom: 6 }}>
                    OUTPUT DATA
                  </div>
                  <pre style={{
                    padding: 10,
                    background: 'var(--t-input)',
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 6,
                    fontSize: 12,
                    color: THEME.text.primary,
                    maxHeight: 240,
                    overflow: 'auto',
                    fontFamily: 'monospace',
                  }}>
                    {JSON.stringify(selectedJob.outputData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
