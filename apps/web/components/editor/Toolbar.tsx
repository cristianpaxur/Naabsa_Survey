'use client';

import { useState } from 'react';
import type { Editor } from '@tiptap/react';

/**
 * Toolbar do editor (008/T-004, RF-21). Tudo em pt-BR. Opera sobre a instância
 * do TipTap: bloco (parágrafo/títulos), B/I/U, alinhamento, listas, tabela,
 * desfazer/refazer e localizar.
 */
export function Toolbar({ editor }: { editor: Editor | null }) {
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');

  if (!editor) return null;

  const blockValue = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p';

  function setBlock(value: string) {
    const chain = editor!.chain().focus();
    if (value === 'p') chain.setParagraph().run();
    else {
      const level = Number(value.replace('h', '')) as 1 | 2 | 3;
      chain.toggleHeading({ level }).run();
    }
  }

  /** Localiza a primeira ocorrência do texto e seleciona (RF-21 "Localizar"). */
  function runFind() {
    const q = query.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    let foundFrom: number | null = null;
    editor!.state.doc.descendants((node, pos) => {
      if (foundFrom !== null) return false;
      if (node.isText && node.text) {
        const idx = node.text.toLowerCase().indexOf(lower);
        if (idx >= 0) foundFrom = pos + idx;
      }
      return true;
    });
    if (foundFrom !== null) {
      editor!
        .chain()
        .focus()
        .setTextSelection({ from: foundFrom, to: foundFrom + q.length })
        .scrollIntoView()
        .run();
    }
  }

  return (
    <div className="ed-toolbar" role="toolbar" aria-label="Ferramentas de edição">
      <div className="ed-toolbar__group">
        <span className="ed-tool" style={{ cursor: 'default' }}>
          <select
            aria-label="Estilo do bloco"
            value={blockValue}
            onChange={(e) => setBlock(e.target.value)}
          >
            <option value="p">Parágrafo</option>
            <option value="h1">Título 1</option>
            <option value="h2">Título 2</option>
            <option value="h3">Título 3</option>
          </select>
        </span>
      </div>

      <div className="ed-toolbar__group">
        <ToolBtn
          label="N"
          title="Negrito"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          style={{ fontWeight: 800 }}
        />
        <ToolBtn
          label="I"
          title="Itálico"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          style={{ fontStyle: 'italic' }}
        />
        <ToolBtn
          label="S"
          title="Sublinhado"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          style={{ textDecoration: 'underline' }}
        />
      </div>

      <div className="ed-toolbar__group">
        <ToolBtn
          label="⬅"
          title="Alinhar à esquerda"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        />
        <ToolBtn
          label="⬌"
          title="Centralizar"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        />
        <ToolBtn
          label="➡"
          title="Alinhar à direita"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        />
      </div>

      <div className="ed-toolbar__group">
        <ToolBtn
          label="• Lista"
          title="Lista com marcadores"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolBtn
          label="1. Lista"
          title="Lista numerada"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
      </div>

      <div className="ed-toolbar__group">
        <ToolBtn
          label="Tabela"
          title="Inserir tabela 3×3"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        />
      </div>

      <div className="ed-toolbar__group">
        <ToolBtn
          label="↶"
          title="Desfazer"
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolBtn
          label="↷"
          title="Refazer"
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>

      <div className="ed-toolbar__group">
        {finding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runFind();
            }}
            style={{ display: 'flex', gap: 4, alignItems: 'center' }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Localizar…"
              aria-label="Localizar texto"
              style={{
                height: 30,
                border: '1px solid var(--borda)',
                borderRadius: 7,
                padding: '0 8px',
                fontSize: 13,
              }}
            />
            <ToolBtn label="Ir" title="Localizar" onClick={runFind} />
            <ToolBtn
              label="✕"
              title="Fechar busca"
              onClick={() => {
                setFinding(false);
                setQuery('');
              }}
            />
          </form>
        ) : (
          <ToolBtn
            label="Localizar…"
            title="Localizar texto"
            onClick={() => setFinding(true)}
          />
        )}
      </div>
    </div>
  );
}

function ToolBtn({
  label,
  title,
  active,
  onClick,
  style,
}: {
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={`ed-tool${active ? ' ed-tool--active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active ?? undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={style}
    >
      {label}
    </button>
  );
}
