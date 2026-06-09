// Old standalone page now redirects to the unified Rules tab.
'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ProjectClientsRedirect() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => {
    router.replace(`/projects/${params.id}?tab=rules&section=clients`)
  }, [params.id, router])
  return null
}
