import type { NextConfig } from 'next'

// Backend URL for the Next.js server-side rewrite proxy.
// Railway injects RAILWAY_SERVICE_GENESIS_BACKEND_URL at runtime (not build-time).
// Falls back to NEXT_PUBLIC_API_URL (local dev) then localhost.
const backendUrl =
  (process.env.RAILWAY_SERVICE_GENESIS_BACKEND_URL
    ? `https://${process.env.RAILWAY_SERVICE_GENESIS_BACKEND_URL}`
    : undefined) ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:8001'

const config: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
}

export default config
