'use client'

import { StatStrip } from '@/components/common/StatStrip'

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
import {
  Button,
  ContentSwitcher,
  Switch,
  Tag,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@carbon/react'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif'

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  colors: {
    blue: '#0f62fe',
    emerald: '#24a148',
    purple: '#8a3ffc',
    amber: '#ba4e00',
    red: '#da1e28',
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

const statusConfig: Record<string, { color: string; icon: React.ElementType; label: string; tag: 'gray' | 'blue' | 'warm-gray' | 'green' | 'red' | 'purple' }> = {
  PENDING:    { color: '#64748B', icon: Clock,        label: 'Pending', tag: 'gray' },
  QUEUED:     { color: '#0f62fe', icon: Clock,        label: 'Queued', tag: 'blue' },
  PROCESSING: { color: '#ba4e00', icon: Loader2,      label: 'Processing', tag: 'warm-gray' },
  SUCCESS:    { color: '#24a148', icon: CheckCircle2, label: 'Success', tag: 'green' },
  FAILED:     { color: '#da1e28', icon: XCircle,      label: 'Failed', tag: 'red' },
  RETRYING:   { color: '#ba4e00', icon: RotateCw,     label: 'Retrying', tag: 'purple' },
  CANCELLED:  { color: '#64748B', icon: Ban,          label: 'Cancelled', tag: 'gray' },
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
            Manage and track async jobs from workers
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button kind="tertiary" size="sm" renderIcon={RefreshCw} onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards - same pattern as Audit page */}
      <StatStrip className="mb-4" items={statCards.map((st) => ({ label: st.label, value: st.value.toLocaleString(), icon: st.icon }))} />

      {/* Filter tabs - same pattern as Audit page */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
      }}>
        <div style={{ overflowX: 'auto' }}>
          <ContentSwitcher
            size="sm"
            selectedIndex={Math.max(0, filterTabs.findIndex((t) => t.id === statusFilter))}
            onChange={({ index }: { index?: number }) => { setStatusFilter(filterTabs[index ?? 0].id); setPage(1) }}
            style={{ minWidth: 820 }}
          >
            {filterTabs.map((tab) => (
              <Switch key={tab.id} name={tab.id} text={`${tab.label} (${tab.count})`} />
            ))}
          </ContentSwitcher>
        </div>
      </div>

      {/* Jobs Table */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
        <Table size="md" useZebraStyles={false}>
          <TableHead>
            <TableRow>
              {['Status', 'Node Type', 'Queue', 'Retry', 'Job ID', 'Created', ''].map((h) => (
                <TableHeader key={h || 'actions'}>{h}</TableHeader>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} style={{ padding: 32, textAlign: 'center', color: THEME.text.muted }}>
                  Loading...
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} style={{ padding: 32, textAlign: 'center', color: THEME.text.muted }}>
                  No jobs
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const cfg = statusConfig[job.status] || statusConfig.PENDING
                const Icon = cfg.icon
                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Tag size="sm" type={cfg.tag} renderIcon={Icon}>{cfg.label}</Tag>
                    </TableCell>
                    <TableCell>{job.nodeType}</TableCell>
                    <TableCell>{job.queueName}</TableCell>
                    <TableCell>{job.retryCount}/{job.maxRetries}</TableCell>
                    <TableCell>
                      <code style={{ fontSize: 11 }}>{job.id.slice(0, 12)}...</code>
                    </TableCell>
                    <TableCell>{new Date(job.createdAt).toLocaleString('th-TH')}</TableCell>
                    <TableCell>
                      <Button kind="ghost" size="sm" renderIcon={Eye} onClick={() => setSelectedJob(job)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        </div>
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
            <Button kind="tertiary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span style={{ padding: '6px 14px', color: THEME.text.muted }}>
              Page {page}/{data.totalPages}
            </span>
            <Button kind="tertiary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
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
              <Button kind="ghost" size="sm" hasIconOnly renderIcon={X} iconDescription="Close" onClick={() => setSelectedJob(null)} />
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
                      <Tag size="sm" type={cfg.tag} renderIcon={Icon}>{cfg.label}</Tag>
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
                  border: `1px solid #da1e2830`,
                  background: '#da1e2808',
                  borderRadius: 6,
                  color: '#da1e28',
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
