# 015 — Correção integrada dos fluxos existentes

Status: implementação autorizada pelo usuário em 14/09/2026 ("pode fazer as alterações").

Contrato aprovado: [diagnóstico e plano](../../docs/project/repository-analysis.md), seções 3, 5 e 6. Esta especificação registra o plano aprovado sem ampliar funcionalidades.

Objetivo: corrigir configuração, IA, fotos, integridade dos documentos, autorização, specs e cobertura de testes. Fotos permanecem opcionais; decisões humanas prevalecem sobre IA; documentos aprovados não são reconstruídos silenciosamente.

Critérios de aceite: C01–C15 do plano. Código e testes locais podem ser concluídos separadamente da aplicação de migrations e do aceite com serviços reais. Não executar deploy nem modificar dados reais para testar. Integrações dependem de ambiente isolado identificado.

Fora do escopo: implementar SSO Entra e tipos sem insumos aprovados; C14 esclarece suas pendências. Não alterar secrets existentes, custo de IA ou documentos históricos automaticamente.
