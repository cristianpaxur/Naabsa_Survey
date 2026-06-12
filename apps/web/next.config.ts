import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lint é centralizado na raiz (eslint.config.mjs) — não duplicar no build.
  eslint: { ignoreDuringBuilds: true },
  // Erros de tipo continuam quebrando o build.
  typescript: { ignoreBuildErrors: false },
  // Compila o TypeScript-fonte dos pacotes do workspace.
  transpilePackages: ['@naabsa/core', '@naabsa/db'],
};

export default nextConfig;
