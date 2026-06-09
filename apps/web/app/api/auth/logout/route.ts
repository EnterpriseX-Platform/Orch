import { NextRequest, NextResponse } from 'next/server'

export async function POST(_request: NextRequest) {
  const res = NextResponse.json({ success: true })
  // Clear the auth-token cookie set on login so server-side
  // middleware no longer accepts the user via cookie. Client-side
  // Zustand state is cleared by the page calling logout().
  res.cookies.set('auth-token', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  })
  return res
}
