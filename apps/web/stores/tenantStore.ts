import { create } from 'zustand'
import { useAuthStore } from './authStore'

// Active tenant + its feature switches. The server is the source of truth:
// the tenant id lives in the `orch-tenant` cookie and is re-validated on
// every API call, so this store only mirrors it for the UI.

export interface TenantSummary {
  id: string
  slug: string
  name: string
  description?: string | null
  isActive: boolean
  role: string | null
  memberCount: number
  projectCount: number
}

export interface FeatureInfo {
  key: string
  label: string
}

interface TenantState {
  loaded: boolean
  tenants: TenantSummary[]
  current: { id: string; name: string; slug: string } | null
  role: string | null
  isSystemAdmin: boolean
  features: Record<string, boolean>
  featureCatalog: FeatureInfo[]
  load: () => Promise<void>
  switchTo: (tenantId: string) => Promise<void>
  isEnabled: (key: string | undefined) => boolean
}

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().accessToken
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const useTenantStore = create<TenantState>()((set, get) => ({
  loaded: false,
  tenants: [],
  current: null,
  role: null,
  isSystemAdmin: false,
  features: {},
  featureCatalog: [],

  load: async () => {
    try {
      const [listRes, curRes] = await Promise.all([
        fetch('/orch/api/tenants', { headers: authHeaders(), cache: 'no-store' }),
        fetch('/orch/api/tenants/current', { headers: authHeaders(), cache: 'no-store' }),
      ])
      const list = listRes.ok ? await listRes.json() : { data: [] }
      const cur = curRes.ok ? await curRes.json() : {}
      set({
        loaded: true,
        tenants: list.data ?? [],
        current: cur.tenant ?? null,
        role: cur.role ?? null,
        isSystemAdmin: !!cur.isSystemAdmin,
        features: cur.features ?? {},
        featureCatalog: cur.featureCatalog ?? [],
      })
    } catch {
      set({ loaded: true })
    }
  },

  switchTo: async (tenantId) => {
    const res = await fetch('/orch/api/tenants/current', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ tenantId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to switch tenant')
    }
    // Every page's data depends on the tenant — a full reload is the
    // simplest way to drop all cached queries and component state.
    window.location.reload()
  },

  isEnabled: (key) => !key || get().features[key] !== false,
}))

/** Sidebar/page path → feature key (mirrors TENANT_FEATURES in lib/tenant.ts). */
export const PATH_FEATURE: Array<[string, string]> = [
  ['/projects', 'projects'],
  ['/datasets', 'datasets'],
  ['/data-repository', 'dataRepository'],
  ['/flows', 'flows'],
  ['/workers', 'flows'],
  ['/logs', 'eventLogs'],
  ['/audit', 'audit'],
  ['/reports', 'analytics'],
  ['/monitor', 'monitor'],
]

export function featureForPath(pathname: string): string | undefined {
  const p = pathname.replace(/^\/orch/, '')
  return PATH_FEATURE.find(([prefix]) => p === prefix || p.startsWith(prefix + '/'))?.[1]
}
