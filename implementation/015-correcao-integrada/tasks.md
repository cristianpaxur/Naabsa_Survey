# Tarefas — 015

Autorizadas pelo usuário em 14/09/2026; critérios completos em `docs/project/repository-analysis.md`.

| ID | Tarefa | Estado |
|---|---|---|
| C01 | Configuração e saúde real | Implementado e testado localmente; segredo WOPI precisa ser configurado para produção |
| C02 | Salvamento antes de aprovação | Implementado; regressões de timeout, sessão e revisão passaram |
| C03 | Montagem idempotente | Implementado; testes de jobs antigos e publicação concorrente passaram |
| C04 | Recuperação de enqueue | Implementado; falhas e retentativas cobertas localmente |
| C05 | Revogação de acesso | Implementado; RLS SQL em memória e WOPI testados; aplicar 0009 e validar Auth real |
| C06 | Upload resiliente | Implementado; rede, timeout, envio parcial e lote de 25 arquivos testados |
| C07 | HEIC | Decoder e teste preparados; build da imagem e HEIC real pendentes |
| C08 | IA na revisão | Implementado; avisos, invalidação, falhas e retomada testados com modelo simulado |
| C09 | Classificação e decisão humana | Implementado; escolhas manuais, retomada e resultados antigos testados |
| C10 | Specs sem texto corrompido | Migration 0010 preparada/testada; depende de aplicação no ambiente |
| C11 | Regra percentual | Corrigido e testado; novos relatórios recebem regra via 0010 |
| C12 | Recuperação/organização de fotos | Implementado e testado localmente |
| C13 | Testes e CI | Suítes locais e workflow preparados; integração externa pendente |
| C14 | Funcionalidades e documentação | Atualizados; guias refletem arquitetura atual e recursos em preparação |
| C15 | Aceite completo | Pendente — ambiente isolado não identificado |

“Implementado” descreve o código local. Não significa migration aplicada, deploy feito
ou aceite da stack completa. Evidências e limites em [validation.md](validation.md).
