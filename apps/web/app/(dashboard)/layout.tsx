'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useTenantStore, featureForPath } from '@/stores/tenantStore'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header, Breadcrumb } from '@/components/layout/Header'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { ConfirmDialogHost } from '@/components/common/ConfirmDialog'


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname() || ''
  const { loaded, load, features, current } = useTenantStore()
  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])
  const feature = featureForPath(pathname)
  const blocked = !!feature && features[feature] === false

  return (
    <AuthGuard>
      <div className="min-h-screen flex" style={{ backgroundColor: 'var(--t-bg)' }}>
        <Header
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <Sidebar collapsed={sidebarCollapsed} />
        <div className={`flex-shrink-0 transition-[width] duration-150 ${sidebarCollapsed ? 'w-12' : 'w-[216px]'}`} />

        <main className="flex-1 min-w-0 flex flex-col pt-12" style={{ backgroundColor: 'var(--t-bg)' }}>
          <div className="flex-1 px-8 pt-4 pb-8 max-w-[1600px] w-full">
            <Breadcrumb />
            {blocked ? (
              <div className="max-w-xl mt-8 p-6 border" style={{ background: 'var(--t-panel)', borderColor: 'var(--t-border)' }}>
                <Lock className="w-5 h-5 mb-3" style={{ color: 'var(--t-text-muted)' }} />
                <h1 style={{ color: 'var(--t-text)' }}>Feature disabled</h1>
                <p className="mt-1 mb-4" style={{ color: 'var(--t-text-secondary)' }}>
                  This feature is not enabled for tenant {current?.name ?? ''}. Contact your tenant administrator.
                </p>
                <Link href="/dashboard" className="text-[#0f62fe] hover:underline">Back to Dashboard</Link>
              </div>
            ) : (
              children
            )}
          </div>
        </main>

        {/* Single host for confirmDialog() calls anywhere in the
            dashboard. Mounted once so any descendant can show a
            modern confirm modal with `await confirmDialog(...)`. */}
        <ConfirmDialogHost />
      </div>
    </AuthGuard>
  )
}
