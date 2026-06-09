'use client'

/**
 * AuthGuard — client-side redirect to /login if no JWT.
 *
 * Why client-side: the access token lives in Zustand/localStorage
 * (auth-storage), which the Next.js middleware cannot read. The
 * middleware catches unauthenticated *API* calls (401s you saw in
 * the console) but can't stop a direct URL hit to /orch/dashboard.
 * This component fills that gap inside the dashboard layout.
 *
 * Hydration note: Zustand's `persist` rehydrates on mount, so on the
 * first render `accessToken` is null even for a signed-in user. We
 * gate on `hasHydrated` to avoid a spurious redirect that would eject
 * every page load. Until hydration completes, we render a small
 * centered spinner rather than the dashboard chrome so flashes of
 * unauthenticated content can't leak.
 */
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { Loader2 } from 'lucide-react'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Flag once the persisted store is readable on the client.
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (!accessToken) {
      // Preserve the intended destination so the login page can
      // bounce back after successful auth.
      const from = encodeURIComponent(pathname || '/dashboard')
      router.replace(`/login?from=${from}`)
    }
  }, [hydrated, accessToken, pathname, router])

  if (!hydrated || !accessToken) {
    return (
      <div
        style={{ backgroundColor: 'var(--t-bg)' }}
        className="min-h-screen flex items-center justify-center"
      >
        <div className="flex items-center gap-3 text-sm text-[var(--t-text-muted)]">
          <Loader2 className="w-5 h-5 animate-spin" />
          Checking session…
        </div>
      </div>
    )
  }

  return <>{children}</>
}
