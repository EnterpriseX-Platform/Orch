import DatasetsClientPage from './datasets-client'

// Force dynamic rendering to prevent hydration issues
export const dynamic = 'force-dynamic'

export default function DatasetsPage() {
  return <DatasetsClientPage />
}
