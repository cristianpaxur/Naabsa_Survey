import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
