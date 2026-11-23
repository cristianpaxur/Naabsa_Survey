# 021 — Salvamento do editor e numeração do Draft Survey

Pedido de 23/11/2026: corrigir a falha “Tempo esgotado ao confirmar o salvamento”
mostrada com o Collabora em Viewing e iniciar a numeração após Contents.
O usuário confirmou que a terceira página física deve mostrar **1**.

- Confirmar prontidão e permissão da sessão atual antes de salvar. `iframe.load`
  não comprova `Document_Loaded`; comandos enviados antes da prontidão são
  ignorados pelo Collabora. Reativar sessões ociosas antes da consulta.
- Detectar somente leitura antes de enviar UpdateFields/Action_Save. Manter
  validação de origem/janela, recibo WOPI e bloqueio de respostas tardias.
- Falha de comunicação inicial permite tentar conexão no mesmo iframe. Reabertura
  continua explícita para sessão somente leitura ou salvamento ambíguo.
- Capa e Contents sem número; Background começa em nova página com número 1.
  Preservar geometria, textos, imagens, contatos e links dos rodapés.
- Aplicar aos novos Draft Surveys e adaptar o Word já editado ao abrir uma sessão
  sem lock, usando a publicação imutável e CAS existentes. Não reconstruir texto.
  Documentos de outros tipos e documentos com seções personalizadas permanecem
  intactos. Documentos aprovados permanecem intactos.
- Referências nativas PAGEREF acompanham a numeração reiniciada.

Referência do protocolo: [implementação oficial do Collabora](https://raw.githubusercontent.com/CollaboraOnline/online.mirror/main/browser/src/map/handler/Map.WOPI.js),
handlers `Get_Views`, `Grab_Focus` e gate `_appLoaded`.

A imagem comprova a mensagem e o modo Viewing; a causa específica da sessão em
produção requer reprodução no serviço publicado. Os testes locais verificam os
estados de prontidão/leitura e a paginação dos documentos.
