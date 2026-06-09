'use client'

import { Suspense } from 'react'
import { useParams } from 'next/navigation'
import FlowBuilder from './FlowBuilder'

function Loading() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-140px)]">
      <p className="text-[13px] text-[#888]">Loading...</p>
    </div>
  )
}

function FlowBuilderWithParams() {
  const params = useParams()
  // params.id is an array because of catch-all segments [[...id]]
  // /flows/builder → params.id = undefined
  // /flows/builder/abc123 → params.id = ['abc123']
  const flowId = params?.id?.[0] || null
  
  return <FlowBuilder flowId={flowId} />
}

export default function FlowBuilderPage() {
  return (
    <div className="-m-4 h-[calc(100vh-56px)] overflow-hidden">
      <Suspense fallback={<Loading />}>
        <FlowBuilderWithParams />
      </Suspense>
    </div>
  )
}
