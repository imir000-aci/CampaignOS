import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import type { UserRole } from '@/types/auth'

interface MockUser {
  sub: string
  email: string
  password: string
  role: UserRole
  division_ids: string[]
}

const MOCK_USERS: MockUser[] = [
  {
    sub: 'user-admin-001',
    email: 'admin@albertsons.com',
    password: 'password',
    role: 'ADMIN',
    division_ids: ['div-001', 'div-002'],
  },
  {
    sub: 'user-manager-001',
    email: 'manager@albertsons.com',
    password: 'password',
    role: 'CAMPAIGN_MANAGER',
    division_ids: ['div-001'],
  },
  {
    sub: 'user-approver-001',
    email: 'approver@albertsons.com',
    password: 'password',
    role: 'CREATIVE_APPROVER',
    division_ids: ['div-001'],
  },
  {
    sub: 'user-analyst-001',
    email: 'analyst@albertsons.com',
    password: 'password',
    role: 'ANALYST',
    division_ids: ['div-001'],
  },
]

export async function POST(request: NextRequest) {
  const secret = process.env['MOCK_JWT_SECRET']
  if (!secret) {
    return NextResponse.json({ error: 'MOCK_JWT_SECRET not set' }, { status: 500 })
  }

  const body = (await request.json()) as { email?: string; password?: string }
  const user = MOCK_USERS.find(
    (u) => u.email === body.email && u.password === body.password,
  )

  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const key = new TextEncoder().encode(secret)
  const token = await new SignJWT({
    sub: user.sub,
    email: user.email,
    role: user.role,
    division_ids: user.division_ids,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .setJti(crypto.randomUUID())
    .sign(key)

  return NextResponse.json({
    token,
    user: { sub: user.sub, email: user.email, role: user.role, division_ids: user.division_ids },
  })
}
