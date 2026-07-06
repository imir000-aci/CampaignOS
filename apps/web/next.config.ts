import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  env: {
    AGENT_API_URL: process.env['AGENT_API_URL'] ?? 'http://localhost:4000',
  },
}

export default nextConfig
