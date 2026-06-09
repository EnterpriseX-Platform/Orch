// Old standalone page now redirects users to the unified Rules tab
// on the project detail page. The same Field Mappings editor lives
// inline there so the dedicated URL no longer carries unique UI.
'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ProjectFieldMappingsRedirect() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => {
    router.replace(`/projects/${params.id}?tab=rules&section=fieldmap`)
  }, [params.id, router])
  return null
}
