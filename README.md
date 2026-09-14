# Naabsa Survey

Aplicação interna para transformar planilhas de inspeção em relatórios: extração e revisão
dos dados, fotos opcionais, edição do Word no Collabora e aprovação de uma versão para PDF.
Os tipos disponíveis são **Draft Survey** (carga/descarga) e **MSC**. Os demais tipos,
o editor administrativo de modelos e o SSO Entra ID ainda dependem de implementação.

As correções da auditoria de setembro estão na [implementação 015](implementation/015-correcao-integrada/spec.md).
Consulte as [evidências de validação](implementation/015-correcao-integrada/validation.md)
e as [instruções para atualizar o ambiente](docs/CORRECOES_015.md) antes de publicar.

## Estrutura e funcionamento

- `apps/web`: Next.js 15 / React 19, telas, APIs e host WOPI.
- `apps/worker`: pg-boss, ExcelJS, Sharp/libheif, IA e LibreOffice.
- `packages/core`: extração e validação em TypeScript, sem dependência do Next.js.
- `packages/db`: schema Supabase, RLS, migrations e testes SQL.
- `tests/golden`: conteúdo dos documentos DOCX gerados pelos builders atuais.

O Supabase fornece Auth, Postgres e o bucket privado `reports`. O worker monta o DOCX
inicial; o Collabora edita esse arquivo via WOPI. Cada salvamento publica uma nova versão.
A aprovação fixa a versão usada pelo LibreOffice para gerar o PDF, preservando as edições.

## Desenvolvimento

Requer Node **22 ou superior** (desenvolvimento validado com 24), pnpm 11,
Supabase de testes e LibreOffice. O editor também requer Collabora.

```bash
pnpm install
pnpm --filter @naabsa/worker diagnose
pnpm --filter @naabsa/web dev
pnpm --filter @naabsa/worker dev
```

Execute web e worker em terminais separados. Preencha as variáveis da raiz conforme
[.env.example](.env.example). Scripts locais usam **ambiente do processo > `.env.local` > `.env`**.
Reinicie ambos depois de mudar a configuração. O diagnóstico informa presença e validade
das variáveis sem imprimir segredos nem chamar o provedor de IA.

Containers recebem variáveis da plataforma; o Compose usa `.env` e não carrega
`.env.local` automaticamente. Não copie credenciais de produção para o ambiente de testes.

## Verificação

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:golden
pnpm check:specs
pnpm build
```

Os testes padrão usam memória e mocks, incluindo SQL no PGlite. Não acessam Supabase
externo. O golden confere conteúdo DOCX; não certifica a aparência do PDF.
Os testes contra Supabase, navegador, HEIC e LibreOffice têm requisitos próprios,
descritos em [CORRECOES_015.md](docs/CORRECOES_015.md).

## Operação

O [Compose](docker-compose.yml) declara app, worker, Caddy e Collabora.
`GET /api/health` verifica que o app responde. Para um administrador ativo,
`GET /api/health/ready` verifica também worker/fila, bucket privado e discovery do Collabora.

- [Operação, filas e backup](docs/OPERACAO.md)
- [Deploy no EasyPanel](docs/DEPLOY_EASYPANEL.md)
- [Auditoria e plano C01–C15](docs/project/repository-analysis.md)
- [Histórico das implementações](implementation/README.md)
- [Requisitos originais](PRD.md) e [convenções](CLAUDE.md)
