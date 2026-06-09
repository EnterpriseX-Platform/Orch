'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/ThemeProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  // Auto-recover from stale-chunk errors after a deploy. When a new build ships,
  // an already-open SPA session can try to import a JS chunk that no longer
  // exists on the server → ChunkLoadError → blank/frozen screen. Reload ONCE
  // (guarded by sessionStorage so it never loops) to pull the fresh build.
  useEffect(() => {
    const KEY = 'orch-chunk-reloaded'
    const isChunkErr = (m: string) =>
      /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(m)
    const onErr = (e: ErrorEvent | PromiseRejectionEvent) => {
      const msg = String(
        (e as PromiseRejectionEvent)?.reason?.message ||
        (e as PromiseRejectionEvent)?.reason ||
        (e as ErrorEvent)?.message || '',
      )
      if (isChunkErr(msg) && !sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
      }
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onErr)
    const t = window.setTimeout(() => sessionStorage.removeItem(KEY), 5000)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onErr)
      window.clearTimeout(t)
    }
  }, [])

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
            retry: 1, // Only 1 retry instead of default 3
            retryDelay: 1000, // 1 second between retries
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children}
      </ThemeProvider>
      <Toaster position="top-right" richColors style={{ zIndex: 9999 }} />
    </QueryClientProvider>
  )
}
