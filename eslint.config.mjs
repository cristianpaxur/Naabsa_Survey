// Config única de lint do monorepo Naabsa (ESLint flat config).
// Regra de fundação (PRD §7 / spec 001 RF-003): `packages/core` é TypeScript
// puro e NÃO pode importar Next.js, Supabase ou os apps (web/worker).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

const coreForbidden = {
  patterns: [
    {
      group: ['next', 'next/*', '@next/*'],
      message:
        'packages/core é TypeScript puro (PRD §7): proibido importar Next.js.',
    },
    {
      group: ['@supabase/*'],
      message:
        'packages/core é TypeScript puro (PRD §7): proibido importar Supabase.',
    },
    {
      group: [
        '@naabsa/web',
        '@naabsa/web/*',
        '@naabsa/worker',
        '@naabsa/worker/*',
        '**/apps/**',
      ],
      message:
        'packages/core não pode depender dos apps (web/worker) — dependência é só no sentido inverso (PRD §7).',
    },
  ],
};

export default tseslint.config(
  // Ignorados globais (node_modules e .git já são ignorados pelo ESLint).
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      '**/.pnpm-store/**',
      // Arquivo de tipos gerado pelo Next.js (não editar/lintar).
      '**/next-env.d.ts',
      // Tipos gerados do Supabase (não editar/lintar — regerados por CLI).
      '**/types/database.ts',
      // Handoff de design (código externo do Claude Design — não é nosso fonte).
      'design/**',
    ],
  },

  // Base recomendada para JS e TS (sem checagem por tipos — rápido no esqueleto).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Isolamento do core (RF-003 da spec 001).
  {
    files: ['packages/core/**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      'no-restricted-imports': ['error', coreForbidden],
    },
  },

  // Testes podem usar `any` (entradas malformadas, mocks).
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Desliga regras que conflitam com o Prettier (sempre por último).
  eslintConfigPrettier,
);
