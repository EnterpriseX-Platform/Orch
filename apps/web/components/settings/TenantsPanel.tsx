'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, Plus, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Select, SelectItem, Tag, TextInput, Toggle } from '@carbon/react'
import { useAuthStore } from '@/stores/authStore'
import { useTenantStore } from '@/stores/tenantStore'

interface Feature { key: string; label: string; enabled: boolean }
interface Member {
  id: string
  userId: string
  role: string
  user: { username: string; email: string | null; firstName: string | null; lastName: string | null }
}

const ROLES = ['owner', 'admin', 'member'] as const

function useApi() {
  const token = useAuthStore((s) => s.accessToken)
  return useCallback(
    async (url: string, init: RequestInit = {}) => {
      const res = await fetch(`/orch/api${url}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {}),
        },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      return body
    },
    [token],
  )
}

const panel = { background: 'var(--t-panel)', borderColor: 'var(--t-border)' }
const muted = { color: 'var(--t-text-muted)' }

export function TenantsPanel() {
  const api = useApi()
  const { tenants, current, isSystemAdmin, load, role } = useTenantStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [features, setFeatures] = useState<Feature[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [newTenant, setNewTenant] = useState({ name: '', slug: '' })
  const [newMember, setNewMember] = useState({ username: '', role: 'member' })

  useEffect(() => {
    if (!selected && current) setSelected(current.id)
  }, [current, selected])

  const selectedTenant = tenants.find((t) => t.id === selected)
  const canManage = isSystemAdmin || selectedTenant?.role === 'owner' || selectedTenant?.role === 'admin'

  const loadDetail = useCallback(async () => {
    if (!selected) return
    try {
      const [f, m] = await Promise.all([api(`/tenants/${selected}/features`), api(`/tenants/${selected}/members`)])
      setFeatures(f.data)
      setMembers(m.data)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [api, selected])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const toggle = async (key: string, enabled: boolean) => {
    if (!selected) return
    setSavingKey(key)
    try {
      const r = await api(`/tenants/${selected}/features`, {
        method: 'PUT',
        body: JSON.stringify({ features: { [key]: enabled } }),
      })
      setFeatures(r.data)
      if (selected === current?.id) await load() // refresh sidebar/menu gating
      toast.success(enabled ? 'Feature enabled' : 'Feature disabled')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingKey(null)
    }
  }

  const createTenant = async () => {
    if (!newTenant.name.trim()) return toast.error('Tenant name is required')
    try {
      const r = await api('/tenants', {
        method: 'POST',
        body: JSON.stringify({ name: newTenant.name.trim(), slug: newTenant.slug.trim() || undefined }),
      })
      setNewTenant({ name: '', slug: '' })
      await load()
      setSelected(r.data.id)
      toast.success('Tenant created')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const addMember = async () => {
    if (!selected || !newMember.username.trim()) return toast.error('Username is required')
    try {
      await api(`/tenants/${selected}/members`, { method: 'POST', body: JSON.stringify(newMember) })
      setNewMember({ username: '', role: 'member' })
      await Promise.all([loadDetail(), load()])
      toast.success('Member saved')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const changeRole = async (username: string, r: string) => {
    try {
      await api(`/tenants/${selected}/members`, { method: 'POST', body: JSON.stringify({ username, role: r }) })
      await loadDetail()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const removeMember = async (userId: string) => {
    try {
      await api(`/tenants/${selected}/members?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
      await Promise.all([loadDetail(), load()])
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Tenant list */}
      <section className="border" style={panel}>
        <div className="px-4 h-10 flex items-center border-b" style={{ borderColor: 'var(--t-border)' }}>
          <h2 style={{ color: 'var(--t-text)' }}>Tenants</h2>
          <span className="ml-auto text-[12px]" style={muted}>{tenants.length}</span>
        </div>
        <ul>
          {tenants.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setSelected(t.id)}
                className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-[var(--t-panel-hover)]"
                style={{
                  background: t.id === selected ? 'var(--t-layer-selected)' : undefined,
                  boxShadow: t.id === selected ? 'inset 3px 0 0 #0f62fe' : undefined,
                }}
              >
                <Building2 className="w-4 h-4 flex-shrink-0" style={muted} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ color: 'var(--t-text)' }}>{t.name}</span>
                  <span className="block text-[11px] truncate" style={muted}>
                    {t.slug} · {t.memberCount} members · {t.projectCount} projects
                  </span>
                </span>
                {t.id === current?.id && <Tag type="blue" size="sm">Current</Tag>}
              </button>
            </li>
          ))}
        </ul>
        {isSystemAdmin && (
          <div className="p-4 border-t flex flex-col gap-2" style={{ borderColor: 'var(--t-border)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--t-text-secondary)' }}>New tenant</span>
            <TextInput id="tenant-new-name" labelText="Tenant name" hideLabel size="sm" placeholder="Tenant name" value={newTenant.name}
              onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })} />
            <TextInput id="tenant-new-slug" labelText="slug (optional)" hideLabel size="sm" placeholder="slug (optional)" value={newTenant.slug}
              onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })} />
            <Button kind="primary" size="sm" onClick={createTenant} renderIcon={Plus} className="self-start">
              Create
            </Button>
          </div>
        )}
      </section>

      {/* Detail */}
      <div className="flex flex-col gap-4 min-w-0">
        <section className="border" style={panel}>
          <div className="px-4 h-10 flex items-center border-b" style={{ borderColor: 'var(--t-border)' }}>
            <h2 style={{ color: 'var(--t-text)' }}>Features of {selectedTenant?.name ?? ''}</h2>
            {!canManage && <span className="ml-auto text-[12px]" style={muted}>Read-only ({role ?? 'member'})</span>}
          </div>
          <ul>
            {features.map((f) => (
              <li key={f.key} className="px-4 h-11 flex items-center gap-3 border-b last:border-0" style={{ borderColor: 'var(--t-border)' }}>
                <span className="flex-1" style={{ color: 'var(--t-text)' }}>{f.label}</span>
                <Toggle
                  id={`tenant-feature-${f.key}`}
                  size="sm"
                  labelText={f.label}
                  hideLabel
                  aria-label={`${f.label}: ${f.enabled ? 'On' : 'Off'}`}
                  labelA="Off"
                  labelB="On"
                  toggled={f.enabled}
                  disabled={!canManage || savingKey === f.key}
                  onToggle={() => toggle(f.key, !f.enabled)}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="border" style={panel}>
          <div className="px-4 h-10 flex items-center border-b" style={{ borderColor: 'var(--t-border)' }}>
            <h2 style={{ color: 'var(--t-text)' }}>Members</h2>
            <span className="ml-auto text-[12px]" style={muted}>{members.length}</span>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: 'var(--t-layer-selected)' }}>
                <th className="text-left px-4 h-8">User</th>
                <th className="text-left px-4 h-8">Email</th>
                <th className="text-left px-4 h-8 w-40">Role</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b" style={{ borderColor: 'var(--t-border)' }}>
                  <td className="px-4 h-10" style={{ color: 'var(--t-text)' }}>
                    {[m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.username}
                    <span className="ml-2 text-[11px]" style={muted}>@{m.user.username}</span>
                  </td>
                  <td className="px-4" style={{ color: 'var(--t-text-secondary)' }}>{m.user.email ?? '—'}</td>
                  <td className="px-4">
                    <Select
                      id={`tenant-member-role-${m.id}`}
                      labelText="Role"
                      hideLabel
                      size="sm"
                      value={m.role}
                      disabled={!canManage}
                      onChange={(e) => changeRole(m.user.username, e.target.value)}
                    >
                      {ROLES.map((r) => <SelectItem key={r} value={r} text={r} />)}
                    </Select>
                  </td>
                  <td className="px-2 text-right">
                    {canManage && (
                      <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={Trash2}
                        iconDescription="Remove from tenant" onClick={() => removeMember(m.userId)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canManage && (
            <div className="p-4 flex flex-wrap items-end gap-2">
              <div className="w-56">
                <TextInput id="tenant-new-member-username" labelText="username" hideLabel size="sm" placeholder="username" value={newMember.username}
                  onChange={(e) => setNewMember({ ...newMember, username: e.target.value })} />
              </div>
              <Select id="tenant-new-member-role" labelText="Role" hideLabel size="sm" value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}>
                {ROLES.map((r) => <SelectItem key={r} value={r} text={r} />)}
              </Select>
              <Button kind="primary" size="sm" onClick={addMember} renderIcon={UserPlus}>
                Add member
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
