# Validação — 015

Data: 14/09/2026. Correções locais autorizadas pelo usuário após o diagnóstico.
Os 242 testes da auditoria pertencem ao código anterior e não são evidência desta versão.

## Evidências locais

| Verificação | Resultado |
|---|---|
| `pnpm lint` | Aprovado na integração final. |
| `pnpm typecheck` | Aprovado nos quatro pacotes, após concluir o build. |
| `pnpm build` | Aprovado: core, db e produção Next.js. Nenhum deploy executado. |
| `pnpm test` | Exit 0 na rodada integrada final: 365 aprovados, 2 opt-in ignorados. |
| Core / Vitest | 137 testes passaram, incluindo limites percentuais e extração real. |
| Banco / Vitest + PGlite | 20 testes passaram: migrations completas, rollback/checksum, RLS/revogação, specs históricas, editor, fotos e revisão IA. |
| Web / Vitest | 122 testes passaram: salvamento, recibos, WOPI, permissões, upload, fotos, revisão e readiness. |
| Worker / Vitest | 86 testes passaram; 2 testes opt-in (HEIC e LibreOffice) ignorados na suíte padrão. |
| `pnpm test:golden` | 3 testes passaram (Draft carga/descarga e MSC), usando os builders DOCX atuais e planilhas reais. |
| LibreOffice real, opt-in | 1 teste passou em 33,8 s; DOCX atual convertido para PDF de 5 páginas. |
| Inspeção do PDF com pypdf | Confirmados `MV LOCAL VALIDATION`, `São Luís` e `ação` no texto extraído. Não houve comparação visual de layout. |
| `pnpm check:specs` | Migration corretiva consistente com as fixtures; nenhuma alteração na migration histórica 0007. |
| E2E preparado | Playwright `--list`: 15 casos em 5 arquivos; TypeScript estrito dos arquivos E2E e lint passaram. Nenhum caso executado contra o ambiente. |
| Varredura UTF-8 estrita | 305 arquivos textuais inspecionados; zero arquivos com bytes UTF-8 inválidos. Textos históricos corrompidos continuam preservados como histórico. |
| Diagnóstico de ambiente | IA ativa, provedor OpenAI, modelo GPT-5.5, chave presente; nenhuma chamada paga. Worker configurado. Segredo WOPI local tem menos de 32 caracteres: diagnóstico exit 1 e produção bloqueada até corrigir a configuração. |

Total de testes padrão: **365 aprovados**, além dos 3 golden e da conversão real.
Lint, tipos e build também aprovados. Execute build e typecheck em sequência:
o Next recria `.next/types` durante o build e uma verificação concorrente pode observar
esses arquivos temporariamente ausentes. Não foi necessário alterar a configuração
de tipos para concluir os checks.

Uma execução integrada inicial revelou lentidão no teste do handler do worker:
ele importava DOCX/ExcelJS/Sharp/Playwright sem necessidade. O teste passou em 463 ms
após isolar esses módulos, preservando o handler real e sem aumentar o timeout.
Durante a atualização das fixtures RLS também foram corrigidos erros de nulabilidade;
testes não foram removidos do typecheck para obter aprovação.

## Revisão independente

- Revisão de acesso/editor encontrou uma corrida: resposta de save A após timeout
  poderia confirmar save B. Corrigida por invalidação da sessão e novo iframe explícito,
  com aviso para preservar texto. Regressões incluem timeout, aborto, resposta antiga e
  bloqueio de tentativa concorrente. O iframe fica sem interação durante o salvamento.
- Revisão de IA/fotos encontrou retomada perdida após queda e conflito entre upload
  individual e limite de 20 requisições/min. Corrigidos com identidade de job/tentativa,
  publicação condicional e espera automática por `Retry-After`. Lote simulado de 25 fotos
  concluiu com os 25 IDs preservados.

## O que ainda precisa do ambiente

- Aplicar migrations 0009–0013 e confirmar Auth/RLS/Postgres/pg-boss reais.
- Iniciar a stack de homologação, testar readiness autenticada e editor Collabora/WOPI.
- Editar texto no canvas, aprovar e conferir exatamente esse texto no PDF baixado.
- Executar IA no provedor real (sucesso, erro, timeout e custo) e confirmar sugestões.
- Construir a imagem do worker e testar HEIC/HEVC real com orientação. Docker CLI existe,
  mas o daemon estava indisponível; Docker Desktop não foi iniciado.
- Rodar E2E completo e a integração Supabase. A listagem de casos não equivale a execução.
- Executar workflow no GitHub depois de publicar a revisão; arquivo de CI preparado localmente.

O PGlite reproduz SQL e RLS com schema Auth mínimo em memória. Não reproduz serviços
Supabase, permissões administrativas do banco hospedado, rede, Storage ou pg-boss.
O teste do LibreOffice local não certifica fontes, layout e codecs da imagem Linux.

Não foram alterados valores dos arquivos `.env` existentes, executadas migrations
externas, feitas chamadas pagas de IA ou publicado deploy. A pasta preexistente
`supabase/` foi preservada. Procedimento para concluir o aceite em
[CORRECOES_015.md](../../docs/CORRECOES_015.md).
