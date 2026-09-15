# Plano — MSC funcional

1. Atualizar o contrato de extração MSC e as regras do modelo antes de mexer no layout.
2. Corrigir o editor numérico para editar localmente e persistir no blur ou Enter.
3. Ajustar fotos e slots, mantendo decisão humana acima da sugestão da IA.
4. Reescrever o conteúdo MSC em uma única ordem, usada tanto pelo índice quanto pelo corpo.
5. Validar a montagem DOCX/PDF com fixtures e testes de interface, builder e job.

Riscos: valores de tonelagem usam convenção regional e precisam de testes de formatação; a disponibilidade de fotos e PDF em produção depende de Storage, fila e LibreOffice, que não serão modificados nem acionados neste escopo local.

Arquivos principais previstos: `tests/fixtures/specs/msc.v1.json`, `apps/web/components/review/FieldRow.tsx`, componentes e ações de fotos, `apps/worker/src/lib/buildDocxMsc.ts`, `apps/worker/src/jobs/generatePdf.ts` e testes correspondentes.

