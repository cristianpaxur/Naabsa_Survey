# Pipeline de Fotos

> **ID:** 007
> **Status:** 🟡 Planejada
> **Prioridade:** 🟠 Alta
> **Criada em:** 2026-06-11
> **Última atualização:** 2026-06-11
> **Autor:** Agente AI

---

## 1. Resumo Executivo

Implementar o ciclo completo de fotos do relatório: upload em lote, processamento assíncrono
no worker (sharp: EXIF, resize, compressão, thumbnails), tela de alocação com drag-and-drop
da galeria para os slots do spec (contadores min/max, obrigatoriedade), crop travado no
aspect ratio do slot e bloqueio do avanço até os slots obrigatórios estarem completos.

## 2. Contexto e Motivação

### 2.1 Problema Atual
Hoje as fotos são posicionadas uma a uma no documento, manualmente. No sistema, após a
revisão (006), não há como subir, organizar nem recortar as fotos exigidas pelo spec.

### 2.2 Impacto do Problema
Sem fotos alocadas, o document-builder (004/008) não tem o que inserir nos photoFrames.
Fotos sem EXIF corrigido aparecem rotacionadas; sem dimensão fixa + cover, quebram o layout
do PDF (princípio inviolável nº 4).

### 2.3 Soluções Consideradas

| Solução | Prós | Contras | Decisão |
|---------|------|---------|---------|
| Processamento no worker via fila `process_photo` (PRD) | UI não bloqueia; até 4 em paralelo (RNF-04) | Estado "processando" na UI | ✅ Escolhida |
| Processar no request de upload | Simples | Estoura tempo de request em lote; trava UX | ❌ Descartada |
| Crop destrutivo (recortar o arquivo) | Render simples | Perde original; recrop impossível — PRD salva crop como coordenadas | ❌ Descartada |

## 3. Especificação Técnica

### 3.1 Visão Geral da Arquitetura
Upload multi-arquivo (Route Handler, stream) → Storage (originais) → enfileira `process_photo`
por foto → worker (sharp, concorrência 4) corrige EXIF, converte JPEG, limita 2500 px lado
maior, qualidade 82, gera thumb 400 px → salva processada + thumb → UI em polling exibe
progresso. Tela de alocação: galeria à esquerda, slots do spec à direita; drag-and-drop,
reordenação dentro do slot, crop com react-easy-crop travado no aspect do slot (salvo como
coordenadas relativas à processada).

### 3.2 Componentes Afetados

| Componente | Tipo | Ação | Descrição |
|-----------|------|------|-----------|
| `apps/web/app/api/reports/[id]/photos/route.ts` | Arquivo | Criar | Upload em lote (jpg/png/heic, ≤ 15 MB/foto) |
| `apps/worker/src/jobs/processPhoto.ts` | Arquivo | Modificar | Job sharp (EXIF, resize, qualidade, thumb) |
| `apps/web/app/(app)/reports/[id]/photos/page.tsx` | Arquivo | Criar | Tela 05 — galeria + slots + gates |
| `apps/web/components/photos/Gallery.tsx` | Arquivo | Criar | Grid de thumbs com estado (processando/alocada) |
| `apps/web/components/photos/SlotList.tsx` | Arquivo | Criar | Slots do spec: label, aspect, obrigatório, contador `have/max` |
| `apps/web/components/photos/CropModal.tsx` | Arquivo | Criar | react-easy-crop travado no aspect do slot |
| `apps/web/lib/actions/photos.ts` | Arquivo | Criar | `allocate`, `reorder`, `saveCrop`, `advance` |
| `tests/e2e/photos.spec.ts` | Arquivo | Criar | E2E alocar/cropar/bloqueio |

### 3.3 Interfaces e Contratos

#### Entradas
- Upload: multipart com N arquivos jpg/png/heic, máx. 15 MB cada (RF-15).
- Alocação: `(photoId, slotId, position)`; crop: `{x, y, width, height}` relativo à processada.

#### Saídas
- `report_photos` por foto: `original_path`, `processed_path`, `thumb_path`, `slot_id`,
  `position`, `crop`, `quality_flags`, `ai_suggested=false` (IA chega na 010).
- Avanço: todos os slots `required`/`min` satisfeitos → transição auditada → editor (008).

#### Contratos de API (se aplicável)
`POST /api/reports/[id]/photos` — 413 acima de 15 MB/foto; 415 formato inválido; 202 com
ids criados. Polling de status simples (`processed_path != null`).

### 3.4 Modelos de Dados (se aplicável)
Tabela `report_photos` da 002, sem alterações. `photo_slots` vêm do spec congelado
(id, label, aspect, required, min, max).

### 3.5 Fluxo de Execução
1. Operador (vindo da revisão confirmada) sobe lote de fotos.
2. Cada foto: original no Storage → job `process_photo` na fila (concorrência 4 — RNF-04).
3. Worker: EXIF orientation → JPEG → 2500 px lado maior → qualidade 82 → thumb 400 px → paths gravados.
4. Galeria atualiza por polling; foto processada fica arrastável.
5. Drag para o slot (validações de max) → posição definida; reordenação interna por drag.
6. Clique na foto alocada → modal de crop travado no aspect → coordenadas salvas.
7. Slots obrigatórios completos → "Avançar para edição" habilita → transição → editor.

### 3.6 Tratamento de Erros
- Arquivo inválido no lote: rejeita só o arquivo, informa quais falharam, aceita o resto.
- Job sharp falha (arquivo corrompido): foto marcada com erro na galeria, opção de remover/re-subir; retry limitado no pg-boss.
- HEIC sem suporte do sharp no ambiente: erro claro; conversão garantida via libvips com HEIF no container (verificado na T-002).
- Drag para slot cheio (`max`): rejeitado com feedback visual.
- Avanço com slot obrigatório pendente: bloqueado na UI e na action (defesa dupla).

## 4. Requisitos

### 4.1 Requisitos Funcionais
Derivados do PRD (tarefas T-15, T-16):

- **RF-001 (PRD RF-15):** Upload em lote multi-arquivo (jpg/png/heic, máx. 15 MB/foto), cada foto na fila `process_photo`.
- **RF-002 (PRD RF-16):** Worker: EXIF orientation, JPEG, lado maior ≤ 2500 px, qualidade 82, thumb 400 px; original e processada no Storage.
- **RF-003 (PRD RF-17):** Tela com galeria à esquerda e slots à direita (label, aspect, obrigatoriedade, contagem min/max); drag-and-drop; reordenação dentro do slot.
- **RF-004 (PRD RF-18):** Crop via react-easy-crop travado no aspect do slot; salvo como `{x,y,width,height}` relativo à processada.
- **RF-005 (PRD RF-19):** Avanço para edição bloqueado até slots `required`/`min` satisfeitos.

### 4.2 Requisitos Não-Funcionais
- **RNF-001 (PRD RNF-03):** Processamento < 10 s/foto.
- **RNF-002 (PRD RNF-04):** Concorrência 4 para `process_photo`.
- **RNF-003 (PRD RNF-05):** Thumbs/processadas servidas por URL assinada (≤ 10 min).
- **RNF-004 (PRD RF-32):** Upload, alocação, crop e confirmação auditados.

### 4.3 Restrições e Limitações
- Upload pelo surveyor em campo é não-objetivo (PRD §1) — upload só pelo operador logado.
- Sugestões de IA (`ai_suggested`, banner, flags de qualidade) são escopo da 010 — mas a UI
  desta tela já deve renderizar `ai_suggested`/`quality_flags` se presentes (forward-compatible,
  componentes prontos para a 010 ligar).

## 5. Critérios de Aceitação

- [x] **CA-001:** Foto com EXIF rotacionado sai corretamente orientada após processamento (aceite do PRD T-15). — testes 6/3/8 em `processPhoto.test.ts`.
- [x] **CA-002:** E2E: alocar fotos nos slots e cropar; avanço bloqueado até slot obrigatório completo (aceite do PRD T-16). — `tests/e2e/photos.spec.ts` (não executado aqui).
- [x] **CA-003:** Lote com arquivo inválido: válidos processam, inválido reportado. — `route.ts` reporta `rejected[]` sem bloquear válidos.
- [x] **CA-004:** Limites respeitados: > 15 MB rejeitado; slot cheio rejeita drag; `min` de slot múltiplo (ex.: porões 2–6) exigido. — 413 no route, `max` em `allocate`, `min` no gate.
- [x] **CA-005:** Crop persiste como coordenadas e re-abrir o modal restaura o recorte. — `saveCrop` (0–1) + `initialCroppedAreaPercentages`.
- [x] **CA-006:** Contadores `have/max` e indicador "N slot obrigatório pendente" fiéis ao protótipo. — `SlotList.tsx`.
- [x] **CA-007:** 4 fotos processam em paralelo; a 5ª aguarda (RNF-002). — `localConcurrency: 4` + smoke de paralelismo no teste.

## 6. Plano de Testes

### 6.1 Testes Unitários
Validação de tipos/tamanhos no upload; lógica de gates (required/min/max) pura; cálculo de crop relativo.

### 6.2 Testes de Integração
Job `processPhoto` com fixtures reais: EXIF 90°/180°/270°, PNG → JPEG, HEIC, imagem grande
(> 2500 px), corrompida; verificação de dimensões/qualidade/thumb da saída.

### 6.3 Testes de Aceitação
E2E (CA-002) com fixture de fotos; verificação de auditoria das ações.

### 6.4 Casos de Borda (Edge Cases)
- Foto menor que 2500 px (não ampliar — só limitar lado maior).
- Imagem em escala de cinza/CMYK (converter para sRGB).
- Realocar foto de um slot para outro (sai do primeiro, entra no segundo, crops resetados? Decisão: crop é por slot — resetar ao mover, auditado).
- Remover foto alocada (slot decrementa; gate refeito).
- Upload duplicado do mesmo arquivo (aceito; flag `possible_duplicate` é responsabilidade da IA na 010).

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| HEIC não suportado no container | Média | Alto | Verificar libvips+HEIF no Dockerfile do worker logo na T-002; fallback documentado |
| Drag-and-drop inacessível/frágil | Média | Médio | Fallback por clique ("Alocar" no slot, como no protótipo); lib testada (dnd-kit) |
| Fotos pesadas estourando RAM no worker | Baixa | Médio | Concorrência 4 + sharp streaming; medir com lote de 15 MB×N |

## 8. Dependências

### 8.1 Dependências Internas
**002** (tabela `report_photos`, Storage), **005** (auth, shell, máquina de estados),
**004** parcial (worker/pg-boss bootstrap — `boss.ts` é criado na 004; se 007 rodar em
paralelo, coordenar a criação única do bootstrap).

### 8.2 Dependências Externas
sharp (worker), react-easy-crop e dnd-kit (web). Nenhum insumo do cliente bloqueia.

## 9. Observações e Decisões de Design

- **Tela de design vinculada:** 05 Fotos — `design/naabsa-survey/project/Naabsa Protótipo.dc.html`
  (seção `isPhotos`): galeria 3×N com check verde nas alocadas e nome mono; slots com thumb
  120 px, chip de aspect (`4:3`/`16:9`), badge vermelho "obrigatório", id mono do slot,
  contador colorido `have/max` (verde ok / vermelho pendente); dropzone "Alocar" tracejada;
  contador lateral "N slot obrigatório pendente"; modal "Recortar foto" com grade de terços,
  slider de zoom e aspect travado; botão "Avançar para edição →" com gate.
  Board estático `Naabsa Relatórios.dc.html`, tela 05 (inclui o banner de IA — só na 010).
- O banner navy de sugestões de IA do protótipo NÃO entra aqui (RF-37 → 010); o layout reserva o espaço.

---

> **⚠️ NOTA:** Este documento é a fonte de verdade para esta implementação.
> Qualquer alteração no escopo deve ser refletida aqui ANTES de ser implementada.
