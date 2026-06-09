// Old standalone page now redirects to the unified Rules tab.
'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ProjectAuditConfigsRedirect() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => {
    router.replace(`/projects/${params.id}?tab=rules&section=audit`)
  }, [params.id, router])
  return null
}
