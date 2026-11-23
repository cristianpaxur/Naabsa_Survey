# Tarefas — 021

- [x] T-001 — Reproduzir o envio prematuro de comandos com teste de regressão.
- [x] T-002 — Consultar prontidão/permissão, reativar sessão ociosa e permitir nova conexão sem desmontar o iframe.
- [x] T-003 — Separar capa/Contents do corpo, reiniciar PAGE em 1 e preservar texto/rodapés.
- [x] T-004 — Adaptar documentos antigos com revisão imutável, CAS e proteção de lock.
- [x] T-005 — Concluir testes, build, inspeção do PDF e revisão independente.
- [ ] T-006 — Publicar e homologar edição, salvamento, reabertura e PDF no Collabora de destino.

Evidências locais em `.tmp_docx/numbering-20261123/`; insumos reais em produção não
foram alterados. A fonte `.tmp_report.docx` usada no ensaio legado permanece intacta.

## Validação local — 23/11/2026

- Editor e fluxo de aprovação: 41 testes relacionados passaram; suíte web completa:
  254 testes. Core: 258 na suíte inicial e 7 testes finais de numeração (dois casos
  adicionais de quebra legada e preservação do rodapé). Banco: 35 testes.
- Worker: 309 testes passaram e 7 integrações opcionais foram ignoradas. A execução
  inicial sem limitar paralelismo excedeu 5 s em sete testes MSC/BQS; a suíte inteira
  passou com `--maxWorkers=2 --minWorkers=1`, sem aumentar o timeout dos testes.
- Golden: 7 testes passaram. `pnpm lint`, `pnpm typecheck`, `pnpm check:specs` e
  `pnpm build` passaram. Build mantém o aviso já existente do Supabase no Edge Runtime.
- PDF pelo LibreOffice local: carga, descarga e adaptação do documento legado têm
  seis páginas, capa/Contents sem número, Background na página física 3 com número
  1, seguido de 2–4. Contatos e links do rodapé do Contents preservados. PAGEREF
  substituiu o valor de teste 99 pelos destinos corretos. Imagens das páginas
  renderizadas e `inspection.json` registram o resultado.
- Revisão independente: achados de quebra dupla do legado e perda de contatos
  corrigidos, testes de regressão incluídos, rechecagem sem achados abertos.
- Antes do push, um snapshot do índice Git isolou somente as correções deste pedido
  das alterações anteriores do checkout. Nesse conteúdo exato passaram 76 testes:
  41 do editor/aprovação, 7 de numeração, 21 do builder Draft e 7 golden.
- Publicação e sessão Collabora real permanecem pendentes; o conector EasyPanel
  disponível não listou o serviço Naabsa.
