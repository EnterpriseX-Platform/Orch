import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'orch-secret-key'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash)

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, roles: user.roles },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Remove passwordHash from response
    const { passwordHash: _, ...userWithoutPassword } = user

    // Bearer token for apiClient + auth-token cookie for routes that
    // use raw fetch() (sidebar counts, data-repository, reports, etc).
    // Without the cookie those calls landed on the middleware empty-
    // handed and got 401 even with a valid login. SameSite=Lax keeps
    // it scoped to first-party requests; HttpOnly so client JS can't
    // exfiltrate; expiresIn matches accessToken (24h).
    const res = NextResponse.json({
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    })
    res.cookies.set('auth-token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24, // 24h
    })
    return res
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
