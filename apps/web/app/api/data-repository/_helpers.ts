// Internal helpers for /api/data-repository/* — these wrap our existing
// /api/repo/* logic in the {success, data, error} envelope the ported
// reference UI expects. Keeps the new page identical to the reference
// platform's DataRepository.tsx by minimising adapter layers.
import { NextResponse } from 'next/server'

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init)
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status })
}

export function notImplemented(name: string) {
  return NextResponse.json(
    { success: false, error: `${name} not implemented yet` },
    { status: 501 },
  )
}
