# Correção da galeria após publicação

Sintomas enviados pelo usuário: imagens quebradas e nomes/botões nativos repetidos
abaixo dos cartões.

Evidência: a página pública HTTPS de login injeta `SUPABASE_URL` com protocolo HTTP.
A galeria usava URLs assinadas desse endereço diretamente em `<img>`, dependendo de
o navegador aceitar conteúdo de outra origem/protocolo. A conexão para inspecionar
o navegador autenticado expirou; não foi possível obter o erro de rede da imagem.

Correções:

- Imagens e recorte usam `/api/reports/{id}/photos/{photoId}/image` na origem do app.
  A rota exige sessão, consulta a foto pela RLS, filtra relatório/remoção/processamento
  e só então baixa o objeto privado pelo servidor. Não aceita URL arbitrária.
- Resposta privada sem cache público; thumbnail ausente tenta a imagem processada.
- Ações de remover, desalocar, ordenar e tentar novamente ficam no próprio cartão.
  A lista duplicada abaixo da galeria foi removida; seleção recebe borda visível.
- Erro de imagem tem estado legível e opção de recarregar, sem repetição infinita.

Validação: 8 testes locais da listagem e rota de imagem passaram, incluindo negação
de acesso, isolamento de caminhos, ausência de redirecionamento HTTP e fallback.
Typecheck, lint focado e build de produção da web passaram. A verificação visual no ambiente publicado depende
do deploy desta versão; nenhuma foto ou configuração de produção foi alterada.

A mudança não exige migration. O HTTPS público do Supabase continua recomendado
para outros consumidores diretos do serviço; não foi alterado neste trabalho.
