/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development'

const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.0.2'],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "font-src 'self'",
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com ${isDev ? 'http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*' : ''}`,
              "object-src 'none'",
              "frame-src 'none'",
              "worker-src 'self'",
              "manifest-src 'self'",
              "media-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              ...(isDev ? [] : ['upgrade-insecure-requests']),
            ].join('; '),
          },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
