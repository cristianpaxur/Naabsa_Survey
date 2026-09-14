# Plano de execução

Referência: C01–C15 do diagnóstico aprovado. Cada responsável executa e testa suas tarefas, com integração e revisão final.

- Editor: C02/C03/C04; actions, WOPI, montagem e PDF; migration 0011.
- Fotos: C06/C07/C09/C12; upload, worker, galeria, classificação; migration 0012.
- Configuração/IA: C01/C08; ambiente, saúde, revisão; migration 0013.
- Integração: C05/C10/C11/C13/C14/C15; acesso, specs, testes, CI e documentação; migrations 0009/0010.

Arquivos compartilhados (`queue.ts`, `generatePdf.ts`, `worker/index.ts`, manifests) exigem coordenação de trechos. Preservar alterações preexistentes e a pasta não versionada `supabase/`.

Validação: regressões focadas por tarefa, lint, tipos, suíte de unidade, golden de DOCX atual, build e smoke local sem serviços reais. E2E/DB/IA externos apenas no ambiente de teste identificado. Registrar resultados e limitações em `validation.md`.
