const path = require('path');

const PRODUCTION_BACKEND_ORIGIN = 'https://easybarber-backend.onrender.com';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),

  async headers() {
    const getOrigin = (value, fallback) => {
      try {
        return new URL(value || fallback).origin;
      } catch {
        return fallback;
      }
    };

    // Extrair somente a origem (scheme+host+port) das URLs permitidas para o CSP
    const apiOrigin = getOrigin(
      process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL,
      'http://localhost:5000'
    );
    const supabaseOrigin = getOrigin(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      'https://beiovtfhdpybinkxtqlb.supabase.co'
    );
    // wss:// para Supabase Realtime
    const supabaseWssOrigin = supabaseOrigin.replace(/^https:/, 'wss:');

    const isProd = process.env.NODE_ENV === 'production';

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // unsafe-eval apenas em dev (Next.js HMR)
              `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              `connect-src 'self' ${apiOrigin} ${PRODUCTION_BACKEND_ORIGIN} ${supabaseOrigin} ${supabaseWssOrigin}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
