'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Redirect page: /registers/:id -> /projects/:projectId/apis/:id
 * API Registrations don't have a standalone page.
 * This route resolves the projectId and redirects to the correct project API detail page.
 */
export default function RegisterRedirectPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function resolve() {
      try {
        const res = await fetch(`/orch/api/registers/${id}`)
        if (!res.ok) {
          setError('API registration not found')
          return
        }
        const data = await res.json()
        const projectId = data.projectId
        if (projectId) {
          router.replace(`/projects/${projectId}/apis/${id}`)
        } else {
          setError('This API registration is not linked to a project yet')
        }
      } catch {
        setError('An error occurred while loading the data')
      }
    }
    resolve()
  }, [id, router])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-red-500 text-lg">{error}</p>
        <button
          onClick={() => router.push('/projects')}
          className="text-blue-500 hover:underline"
        >
          Back to Projects
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[50vh] gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      <span className="text-gray-500">Redirecting...</span>
    </div>
  )
}
