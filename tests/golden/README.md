# tests/golden

Testes golden dos builders DOCX atuais por tipo e variante.

O `golden-pipeline.test.ts` extrai as planilhas reais de fixture, gera o DOCX e
valida o conteúdo contra snapshots. Para Draft Survey, também compara com o Word
aprovado as partes que definem o layout (seção/página, estilos, numeração,
cabeçalhos e rodapé) e impede a volta de marca-texto, cores de revisão,
instruções internas ou tags não preenchidas.

A renderização rasterizada do PDF permanece um aceite visual separado porque
depende do motor instalado (Microsoft Word ou LibreOffice).
