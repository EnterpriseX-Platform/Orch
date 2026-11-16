'use client'

/**
 * AuditDetailModal — full-screen detail view for one audit_logs row.
 *
 * Replaces the old inline-expand on /orch/audit. Admins complained the
 * diff table + raw JSON got cramped inside the expanded row. Modal
 * gives more vertical space and lets us group the content into tabs.
 *
 * Tabs:
 *   - Summary   : who/what/when metadata
 *   - Changes   : field-by-field Old → New diff (ChangeDiff rendered)
 *   - Raw JSON  : oldValues + newValues + changes side-by-side
 */
import { useState, type ReactNode } from 'react'
import { FileJson, Info, GitCompare } from 'lucide-react'
import { ComposedModal, ModalHeader, ModalBody, Tabs, TabList, Tab, Tag } from '@carbon/react'

export interface AuditDetailData {
  id: string
  timestamp: string
  action: string
  entityType: string
  entityId?: string
  userIp?: string
  description?: string
  oldValues?: unknown
  newValues?: unknown
  changes?: unknown
  user?: { id: string; username: string; firstName?: string; lastName?: string }
}

type TabId = 'summary' | 'changes' | 'raw'

function formatDateTime(ts: string) {
  try { return new Date(ts).toLocaleString('th-TH') } catch { return ts }
}

export function AuditDetailModal({
  log,
  onClose,
  renderDiff,
}: {
  log: AuditDetailData | null
  onClose: () => void
  /** Inject the existing ChangeDiff component so we don't re-implement the diff logic. */
  renderDiff: (log: AuditDetailData) => ReactNode
}) {
  const [tab, setTab] = useState<TabId>('summary')
  if (!log) return null

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<Record<string, unknown>> }> = [
    { id: 'summary', label: 'Summary', icon: Info },
    { id: 'changes', label: 'Changes', icon: GitCompare },
    { id: 'raw',     label: 'Raw JSON', icon: FileJson },
  ]

  const tabIndex = tabs.findIndex((t) => t.id === tab)

  return (
    <ComposedModal open onClose={onClose} size="lg">
      <ModalHeader closeModal={onClose}>
        <div className="flex items-center gap-3 min-w-0 pr-8">
          <Tag type="blue" size="sm">{log.action}</Tag>
          <span className="text-[11px] text-[var(--t-text-muted)]">on</span>
          <span className="text-xs font-semibold text-[var(--t-text)]">{log.entityType}</span>
          {log.entityId && (
            <code className="text-xs font-mono text-[var(--t-text-secondary)] truncate">
              · {log.entityId}
            </code>
          )}
          <span className="text-xs text-[var(--t-text-muted)] shrink-0">
            · {formatDateTime(log.timestamp)}
          </span>
        </div>
      </ModalHeader>
      <ModalBody>
        <Tabs
          selectedIndex={tabIndex}
          onChange={({ selectedIndex }) => setTab(tabs[selectedIndex].id)}
        >
          <TabList aria-label="Audit detail tabs">
            {tabs.map((t) => (
              <Tab key={t.id} renderIcon={t.icon}>{t.label}</Tab>
            ))}
          </TabList>
        </Tabs>
        {/* Body */}
        <div className="pt-4 text-sm">
          {tab === 'summary' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Action">
                <span className="text-xs text-[var(--t-text)]">{log.action}</span>
              </Field>
              <Field label="Timestamp">
                <span className="text-xs text-[var(--t-text)]">{formatDateTime(log.timestamp)}</span>
              </Field>
              <Field label="User">
                <span className="text-xs text-[var(--t-text)]">
                  {(log.changes as { username?: string } | undefined)?.username
                    || (log.user?.firstName
                      ? `${log.user.firstName} ${log.user.lastName || ''} (${log.user.username})`
                      : log.user?.username)
                    || 'system'}
                </span>
              </Field>
              <Field label="Client IP">
                <span className="text-xs text-[var(--t-text)]">{log.userIp || '—'}</span>
              </Field>
              <Field label="Entity Type">
                <span className="text-xs text-[var(--t-text)]">{log.entityType}</span>
              </Field>
              <Field label="Entity ID">
                <code className="text-xs font-mono text-[var(--t-text)] break-all">
                  {log.entityId || '—'}
                </code>
              </Field>
              {log.description && (
                <Field label="Description" full>
                  <p className="text-xs text-[var(--t-text-secondary)] break-words">{log.description}</p>
                </Field>
              )}
            </div>
          )}

          {tab === 'changes' && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-2 text-[12px] text-[#525252]">
                <div>Field</div>
                <div className="text-[#da1e28]">Old Value</div>
                <div className="text-[#24a148]">New Value</div>
              </div>
              <div className="space-y-1">{renderDiff(log)}</div>
            </div>
          )}

          {tab === 'raw' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Block label="Old Values" content={JSON.stringify(log.oldValues, null, 2)} />
              <Block label="New Values" content={JSON.stringify(log.newValues, null, 2)} />
              <div className="md:col-span-2">
                <Block label="Changes" content={JSON.stringify(log.changes, null, 2)} />
              </div>
            </div>
          )}
        </div>
      </ModalBody>
    </ComposedModal>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-[12px] text-[#525252] mb-0.5">{label}</p>
      {children}
    </div>
  )
}

function Block({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="text-[12px] text-[#525252] mb-1">{label}</p>
      <pre className="px-3 py-2 bg-[#f4f4f4] text-[#161616] text-xs font-mono whitespace-pre-wrap break-all max-h-[50vh] overflow-auto">
        {content || '(empty)'}
      </pre>
    </div>
  )
}
