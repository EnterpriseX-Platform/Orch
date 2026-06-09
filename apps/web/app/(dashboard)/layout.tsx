'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { ConfirmDialogHost } from '@/components/common/ConfirmDialog'

const FONT = "'Prompt', sans-serif";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <AuthGuard>
      <div className="min-h-screen flex" style={{ fontFamily: FONT, backgroundColor: 'var(--t-bg)' }}>
        <Sidebar collapsed={sidebarCollapsed} />
        <div className={`flex-shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'w-16' : 'w-52'}`} />

        <main className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--t-bg)' }}>
          <Header
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <div className="flex-1 overflow-auto p-4">
            {children}
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
