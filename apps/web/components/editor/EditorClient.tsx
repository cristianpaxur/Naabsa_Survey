'use client';

import './editor.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import type { TipTapDoc } from '@naabsa/core';
import { saveDocument } from '@/lib/actions/editor';
import type { ReportStatus } from '@/lib/state-machine';
import { PhotoFrame } from './nodes/photoFrame';
import { DataTable } from './nodes/dataTable';
import { LeaderLine } from './nodes/leaderLine';
import { SheetImage } from './nodes/sheetImage';
import { DataField } from './marks/dataField';
import { LockGuard } from './lockGuard';
import { Toolbar } from './Toolbar';
import { PreviewPanel } from './PreviewPanel';

const AUTOSAVE_MS = 2000;
const SNAPSHOT_MS = 5 * 60 * 1000; // ≤ 5 min de edição contínua (RF-24)
const RETRY_MS = 3000;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function EditorClient({
  reportId,
  vesselName,
  specLabel,
  initialDoc,
  initialStatus,
  initialView = 'edit',
}: {
  reportId: string;
  vesselName: string | null;
  specLabel: string;
  initialDoc: TipTapDoc;
  initialStatus: ReportStatus;
  /** 'preview' quando o relatório já foi aprovado/gerado (somente leitura). */
  initialView?: 'edit' | 'preview';
}) {
  const [view, setView] = useState<'edit' | 'preview'>(initialView);
  const [autoApprove, setAutoApprove] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef<number>(Date.now());

  const editor = useEditor({
    immediatelyRender: false, // App Router/SSR (TipTap v3)
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Underline é adicionado explicitamente abaixo (compat entre versões).
        underline: false,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      PhotoFrame,
      DataTable,
      LeaderLine,
      SheetImage,
      DataField,
      LockGuard,
    ],
    content: initialDoc,
    editorProps: {
      attributes: { class: 'ed-prosemirror', 'aria-label': 'Documento do relatório' },
    },
  });

  const doSave = useCallback(
    async (editorJson: TipTapDoc) => {
      const dueSnapshot = Date.now() - lastSnapshotRef.current >= SNAPSHOT_MS;
      setSaveState('saving');
      const res = await saveDocument(reportId, editorJson, dueSnapshot);
      if ('error' in res) {
        setSaveState('error');
        // Retry com backoff simples; a edição local é preservada.
        timerRef.current = setTimeout(() => {
          if (editor) void doSave(editor.getJSON() as unknown as TipTapDoc);
        }, RETRY_MS);
        return;
      }
      if (dueSnapshot) lastSnapshotRef.current = Date.now();
      setSaveState('saved');
      setSavedAt(Date.now());
    },
    [reportId, editor],
  );

  // Autosave com debounce a cada edição (RF-24).
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      setSaveState('saving');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void doSave(editor.getJSON() as unknown as TipTapDoc);
      }, AUTOSAVE_MS);
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, doSave]);

  // Atualiza o relógio do chip "Salvo · há Xs".
  useEffect(() => {
    if (saveState !== 'saved') return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [saveState]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /** Garante que o documento atual está persistido antes de abrir o preview. */
  const flushSave = useCallback(async () => {
    if (!editor) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    await doSave(editor.getJSON() as unknown as TipTapDoc);
  }, [editor, doSave]);

  async function openPreview(approveOnOpen: boolean) {
    await flushSave();
    setAutoApprove(approveOnOpen);
    setView('preview');
  }

  if (view === 'preview' && editor) {
    return (
      <PreviewPanel
        reportId={reportId}
        initialStatus={initialStatus}
        autoApprove={autoApprove}
        getDoc={() => editor.getJSON() as unknown as TipTapDoc}
        onBackToEdit={() => {
          setAutoApprove(false);
          setView('edit');
        }}
      />
    );
  }

  return (
    <div className="ed-shell">
      <header className="ed-header">
        <div className="ed-header__title">
          <h1>{vesselName ?? 'Relatório'}</h1>
          <span className="ed-header__spec">{specLabel}</span>
        </div>
        <div className="ed-header__actions">
          <SaveChip state={saveState} savedAt={savedAt} />
          <button
            className="ed-btn"
            onClick={() => void openPreview(false)}
            disabled={!editor}
          >
            Preview
          </button>
          <button
            className="ed-btn ed-btn--primary"
            onClick={() => void openPreview(true)}
            disabled={!editor}
          >
            Aprovar e gerar PDF
          </button>
        </div>
      </header>

      <Toolbar editor={editor} />

      <div className="ed-canvas-scroll">
        <div className="ed-paper">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function SaveChip({
  state,
  savedAt,
}: {
  state: SaveState;
  savedAt: number | null;
}) {
  if (state === 'saving') {
    return (
      <span className="ed-savechip ed-savechip--saving">
        <span className="ed-spinner" /> Salvando…
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="ed-savechip ed-savechip--error">
        Falha ao salvar — tentando…
      </span>
    );
  }
  if (state === 'saved' && savedAt) {
    const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
    const rel =
      secs < 3 ? 'agora' : secs < 60 ? `há ${secs} s` : `há ${Math.round(secs / 60)} min`;
    return <span className="ed-savechip ed-savechip--saved">✓ Salvo · {rel}</span>;
  }
  return <span className="ed-savechip ed-savechip--saved">Pronto para editar</span>;
}
