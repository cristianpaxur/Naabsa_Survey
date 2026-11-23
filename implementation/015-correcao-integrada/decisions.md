# Decisões

- 14/09/2026: aprovação do usuário cobre a implementação das correções descritas no plano. Não é necessária nova aprovação para editar código e preparar migrations corretivas.
- Preservar o diagnóstico original como fotografia do estado anterior; registrar resultados atuais neste diretório.
- Migrations novas, aditivas e versionadas; preparar correção dos specs sem reescrever associação de relatórios históricos.
- Validar operações externas em ambiente isolado, que foi solicitado ao usuário. Não inferir que as credenciais locais pertencem a homologação.
- O runner registra checksums e aplica migrations num lote transacional para impedir que uma falha intermediária deixe regras históricas de acesso reinstaladas.
- Testes SQL locais usam PGlite em memória; teste contra Supabase exige ambiente isolado explícito. PGlite não substitui validação das particularidades de Auth, Storage e pg-boss do serviço real.
- Salvamento ambíguo invalida a sessão do iframe. Nova tentativa exige remontagem explícita, com aviso para preservar texto não confirmado; resposta atrasada da janela anterior não confirma a nova.
- Retomadas da IA usam identidade do job/tentativa e publicação condicional. Duplicatas e tentativas obsoletas não substituem decisões atuais.
- A retenção de fotos/planilhas não remove versões do Word e snapshots aprovados. Coleta de versões órfãs fica para evolução própria, para preservar integridade dos documentos.
- Documentação corrente descreve Collabora e builders DOCX. PRD e implementações antigas permanecem como histórico dos requisitos e decisões anteriores.
