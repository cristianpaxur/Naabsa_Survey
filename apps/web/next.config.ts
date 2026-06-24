import path from 'node:path';
import type { NextConfig } from 'next';

// Headers de segurança (010/T-010, RNF-05). CSP/HSTS só em produção para não
// quebrar o HMR do dev. CSP permite inline styles/scripts (Next + estilos inline
// do app) e conexões https (Supabase); imagens de blob/data (previews/fotos).
const isProd = process.env.NODE_ENV === 'production';
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProd
    ? [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "img-src 'self' data: blob: https:",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline'",
            "connect-src 'self' https:",
            "font-src 'self' data:",
            "frame-ancestors 'self'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Imagem Docker mínima: empacota só o necessário para rodar (apps/web/server.js).
  output: 'standalone',
  // Em monorepo, rastrear dependências a partir da raiz (este arquivo está em apps/web).
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  // Lint é centralizado na raiz (eslint.config.mjs) — não duplicar no build.
  eslint: { ignoreDuringBuilds: true },
  // Erros de tipo continuam quebrando o build.
  typescript: { ignoreBuildErrors: false },
  // Compila o TypeScript-fonte dos pacotes do workspace.
  transpilePackages: ['@naabsa/core', '@naabsa/db'],
};

export default nextConfig;
