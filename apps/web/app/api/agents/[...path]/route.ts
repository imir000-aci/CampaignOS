import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const AGENT_API_URL = process.env['AGENT_API_URL'] ?? 'http://localhost:4000'

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const isSSE = path.at(-1) === 'stream'
  const upstreamUrl = `${AGENT_API_URL}/agents/${path.join('/')}`

  // Forward query params
  const qs = request.nextUrl.search
  const url = qs ? `${upstreamUrl}${qs}` : upstreamUrl

  let body: string | undefined
  if (!['GET', 'HEAD'].includes(request.method)) {
    body = await request.text()
  }

  const upstream = await fetch(url, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: request.signal,
  })

  if (isSSE) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive',
      },
    })
  }

  const data: unknown = await upstream.json()
  return NextResponse.json(data, { status: upstream.status })
}

export { handler as GET, handler as POST }
