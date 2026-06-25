/**
 * Gera o relatorio Draft Survey como .docx NATIVO (lib `docx`), reproduzindo o
 * layout do modelo Word do cliente — so trocando os dados. O .docx abre no Word
 * identico ao modelo; o worker converte para PDF via LibreOffice.
 *
 * Entrada: dados efetivos + imagens (prints das abas + fotos) + variante.
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, PageNumber, AlignmentType, BorderStyle, WidthType, VerticalAlign,
  TabStopType, TabStopPosition, LeaderType, HeadingLevel, PageBreak,
  Bookmark, InternalHyperlink, TableLayoutType, LineRuleType,
} from 'docx';

/** Entrelinha confortável (~1.15) para o texto corrido — ar entre as linhas. */
const BODY_LINE = { line: 276, lineRule: LineRuleType.AUTO } as const;
import type { FieldValue } from '@naabsa/core';

const NAVY = '002060';
const GREY = '7F7F7F';
const SLAB = 'Rockwell';      // aprox. do GeoSlab703 do modelo
const SANS = 'Calibri';
const TITLE_FONT = 'Tahoma';
// Nome do surveyor que assina (1ª página). Fixo por ora; pode virar config/perfil.
const UNDERSIGNED_SURVEYOR = 'Mr. Wagner de Abreu';

type Data = Record<string, FieldValue>;
export interface DocxInput {
  data: Data;
  variant: 'loading' | 'discharge';
  logo: Buffer | null;
  coverPhoto?: Buffer | null;
  sheetImages: { initial?: Buffer | null; intermediate?: Buffer | null; final?: Buffer | null };
  phasePhotos: { initial?: Buffer[]; intermediate?: Buffer[]; final?: Buffer[] };
  acting: { intermediate?: string[][]; final?: string[][] };
  /** Páginas medidas por bookmark (2º passe). Ausente no 1º passe (números em branco). */
  tocPages?: Record<string, number>;
}

// ── helpers de formatação ────────────────────────────────────────────────────
const v = (x: FieldValue | undefined, fb = '—'): string => (x == null || x === '' ? fb : String(x));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function ord(d: number): string { return d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th'; }
function fmtDate(x: FieldValue | undefined): string {
  if (x == null) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x));
  if (!m) return String(x);
  return `${MONTHS[+m[2]! - 1]} ${+m[3]!}${ord(+m[3]!)}, ${+m[1]!}`;
}
function grp(n: number, dec: number): string {
  const neg = n < 0; const f = Math.abs(n).toFixed(dec); const [i, d] = f.split('.');
  return `${neg ? '-' : ''}${i!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${d ? '.' + d : ''}`;
}
const mt = (x: FieldValue | undefined): string => (typeof x === 'number' ? `${grp(x, 3)} MT` : v(x));
const ton = (x: FieldValue | undefined): string => (typeof x === 'number' ? `${grp(x, 0)} mt` : v(x));
const meters = (x: FieldValue | undefined): string => (typeof x === 'number' ? `${x.toFixed(2)} m` : v(x));
const num = (x: FieldValue | undefined, d: number): string => (typeof x === 'number' ? x.toFixed(d) : v(x));
function signedMt(x: FieldValue | undefined): string { return typeof x === 'number' ? `${x >= 0 ? '+' : '-'} ${grp(Math.abs(x), 3)} MT` : v(x); }
function signedPct(x: FieldValue | undefined): string { return typeof x === 'number' ? `${x >= 0 ? '+' : '-'} ${grp(Math.abs(x) * 100, 3)} %` : v(x); }

// Pares de variante (modelo: roxo = loading, verde = discharge).
const VARIANT = {
  loading: { verb: 'load', bl: 'bound to', done: 'loaded', official: 'Shore scale', officialFig: 'Shore Scale' },
  discharge: { verb: 'discharge', bl: 'loaded in', done: 'discharged', official: 'Bills of lading', officialFig: 'BsL' },
} as const;

// runs de conveniência (sz em half-points)
const run = (text: string, opts: { bold?: boolean; size?: number; font?: string; color?: string } = {}) =>
  new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, font: opts.font ?? SANS, color: opts.color });
const para = (children: TextRun[], opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacing?: number } = {}) =>
  new Paragraph({ children, alignment: opts.align, spacing: { after: opts.spacing ?? 120, ...BODY_LINE } });

// célula de tabela "label : valor" (sem fundo, como o Word)
// Larguras absolutas (twips) — o LibreOffice não respeita % em tabela; DXA + FIXED sim.
const KV_COLS = [2000, 250, 7610] as const; // rótulo | ":" | valor (≈ largura útil A4)
function kvRow(label: string, value: string): TableRow {
  const cell = (children: Paragraph[], w: number) =>
    new TableCell({ children, width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: { top: 20, bottom: 20, left: 80, right: 80 } });
  return new TableRow({
    children: [
      cell([new Paragraph({ children: [run(label, { bold: true })] })], KV_COLS[0]),
      cell([new Paragraph({ children: [run(':', { bold: true })] })], KV_COLS[1]),
      cell([new Paragraph({ children: [run(value)] })], KV_COLS[2]),
    ],
  });
}
const THIN = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } as const;
const tableBorders = { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: THIN, insideVertical: THIN };
const NONE_B = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const;
/** Tabela sem linhas (alinhamento label:valor como o modelo Word). */
const tableNoBorders = { top: NONE_B, bottom: NONE_B, left: NONE_B, right: NONE_B, insideHorizontal: NONE_B, insideVertical: NONE_B };

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Lê largura/altura (px) de PNG ou JPEG direto do cabeçalho (sync, sem libs). */
function imageSize(buf: Buffer): { w: number; h: number } {
  // PNG: assinatura completa (8 bytes) + chunk IHDR ('IHDR') em offset 12.
  if (buf.length >= 24 && PNG_SIG.every((b, i) => buf[i] === b) &&
      buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1]!;
      if (marker === 0xff) { o++; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) }; // SOFn
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { o += 2; continue; }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  return { w: 100, h: 62 };
}

const imgType = (buf: Buffer): 'png' | 'jpg' =>
  buf.length >= 2 && buf[0] === 0x89 && buf[1] === 0x50 ? 'png' : 'jpg';

/** Imagem centralizada, largura fixa (mm) e altura pelo aspecto real. */
function img(buf: Buffer, widthMm: number): Paragraph {
  const { w, h } = imageSize(buf);
  const widthPx = Math.round(widthMm * 3.78);
  const heightPx = Math.round(widthPx * (w > 0 ? h / w : 0.62));
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [
    new ImageRun({ type: imgType(buf), data: buf, transformation: { width: widthPx, height: heightPx } }),
  ] });
}

export async function buildReportDocx(input: DocxInput): Promise<Buffer> {
  const { data, logo } = input;
  const V = VARIANT[input.variant];
  const hasInter = data['intermediate_date'] != null;

  // Numeração de seções (igual ao modelo; sem Intermediate, desloca Final/Photo/Attach).
  const initNum = 4, interNum = 5;
  const finalNum = hasInter ? 6 : 5;
  const photoNum = hasInter ? 7 : 6;
  const attachNum = hasInter ? 8 : 7;
  const numTitle = (n: number, label: string) => `${n}. ${label}`;
  // Subseções de fotos (numeração condicional ao Intermediate).
  const photoSubs: { m: number; label: string; key: 'initial' | 'intermediate' | 'final' }[] = [
    { m: 1, label: 'Initial', key: 'initial' },
    ...(hasInter ? [{ m: 2, label: 'Intermediate', key: 'intermediate' as const }] : []),
    { m: hasInter ? 3 : 2, label: 'Final', key: 'final' },
  ];
  // Modelo do sumário (id de bookmark + rótulo + nível). Fonte única p/ Contents e corpo.
  const toc: { id: string; label: string; level: 1 | 2 }[] = [];
  const sec = (n: number, label: string) => toc.push({ id: `s${n}`, label: numTitle(n, label), level: 1 });
  const sub = (n: number, m: number, label: string) => toc.push({ id: `s${n}_${m}`, label: `${n}.${m} ${label}`, level: 2 });
  sec(1, 'Background');
  sec(2, "Ship's Particulars");
  sec(3, 'Draft Survey');
  for (const [n, label, on] of [[initNum, 'Initial', true], [interNum, 'Intermediate', hasInter], [finalNum, 'Final', true]] as const) {
    if (!on) continue;
    sec(n, label);
    sub(n, 1, 'Draft readings'); sub(n, 2, 'Sea water density');
    sub(n, 3, 'Ballast water and fresh water'); sub(n, 4, 'Fuel R.O.B.');
    sub(n, 5, `${label} Draft details`);
  }
  sec(photoNum, 'Photographic Report');
  for (const p of photoSubs) sub(photoNum, p.m, p.label);
  sec(attachNum, 'Attachment');

  // ── Cabeçalho (logo + tagline + régua) ──
  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [new TableRow({ children: [
          new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, borders: noBorders(), verticalAlign: VerticalAlign.BOTTOM, children: [
            logo
              ? new Paragraph({ children: [new ImageRun({ type: 'jpg', data: logo, transformation: { width: 150, height: 34 } })] })
              : new Paragraph({ children: [run('NAABSA', { bold: true, size: 32, color: 'BF2C30' })] }),
          ] }),
          new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, borders: noBorders(), verticalAlign: VerticalAlign.BOTTOM, children: [
            new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run('MARINE SURVEYORS & CONSULTANTS', { font: SLAB, color: NAVY, size: 22, bold: true })] }),
            new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run('Main Brazilian Ports', { font: SLAB, color: NAVY, size: 18 })] }),
          ] }),
        ] })],
      }),
    ],
  });

  // ── Rodapé (e-mail | url + nº de página) ──
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'auto' } },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [run('surveyors@naabsa.com.br | www.naabsa.com', { color: GREY, size: 16 }), new TextRun({ text: '\t', size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: SANS })],
    })],
  });

  const body: (Paragraph | Table)[] = [];

  // ── Capa: bloco de endereço (2 colunas) ──
  body.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders(), width: { size: 50, type: WidthType.PERCENTAGE }, children: ['433 Ana Costa Avenue', 'Suite 184 - Santos/Brazil', '11060-003'].map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(t, { size: 19 })] })) }),
      new TableCell({ borders: noBorders(), width: { size: 50, type: WidthType.PERCENTAGE }, children: ['Telephone: +55 13 33940655', 'email: surveyors@naabsa.com', 'www.naabsa.com'].map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(t, { size: 19 })] })) }),
    ] })],
  }));
  body.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  // ── Capa: títulos ──
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run('Survey Report', { bold: true, size: 36 })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run('Ref:' + v(data['ref']), { size: 22 })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run('Draft Survey', { bold: true, size: 56 })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(`“${v(data['vessel_name'], '')}”`, { bold: true, size: 44, font: TITLE_FONT })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(`Flag ${v(data['flag'])} – IMO ${v(data['imo'])}`, { size: 22 })] }));
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(`at ${v(data['port'])} Port/Brazil – ${fmtDate(data['final_date'])}`, { size: 22 })] }));
  if (input.coverPhoto) body.push(img(input.coverPhoto, 150));

  // ── PERSON / COMPANIES CONTACTED — pertence à CAPA (página 1) ──
  body.push(plainTitle('PERSON / COMPANIES CONTACTED'));
  body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders, rows: [
    personRow('Client', [v(data['client']), v(data['operator'])]),
    personRow('Undersigned Surveyor', ['NAABSA Marine Surveyors', v(data['surveyor_name'], UNDERSIGNED_SURVEYOR)]),
    personRow("Vessel’s Command", ['Master / Chief Officer', `${v(data['captain'])} / ${v(data['chief_officer'])}`]),
  ] }));

  // ── Capa termina aqui → quebra de página ──
  body.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Sumário (Contents) — clicável, com subseções e páginas medidas (2º passe) ──
  body.push(plainTitle('Contents'));
  const measured = input.tocPages ?? {};
  const hasMeasures = Object.keys(measured).length > 0;
  const pageOf = (id: string): string => {
    const p = measured[id];
    if (p == null && hasMeasures) console.warn(`[buildDocx] sumário: sem página medida para "${id}"`);
    return p != null ? String(p) : '';
  };
  for (const e of toc) body.push(contentsEntry(e.id, e.label, pageOf(e.id), e.level));

  // ── Fim da página do sumário → quebra ──
  body.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 1. Background ──
  body.push(sectionTitle('s1', numTitle(1, 'Background')));
  body.push(para([run('In compliance with the appointment survey from Messrs. '), run(v(data['client']).toUpperCase()), run(`, we attended the vessel to carry out the Draft Survey to ascertain the total quantity of cargo ${V.done} and to compare it with the ${V.official}.`)]));
  body.push(para([run('She called '), run(v(data['port'])), run(` Port to ${V.verb} a cargo of `), run(v(data['cargo'])), run(` in bulk ${V.bl} `), run(v(data['discharging_port'])), run('.')]));

  // ── 2. Ship's Particulars ──
  body.push(sectionTitle('s2', numTitle(2, "Ship's Particulars")));
  body.push(new Table({ width: { size: 9860, type: WidthType.DXA }, columnWidths: [...KV_COLS], layout: TableLayoutType.FIXED, borders: tableNoBorders, rows: [
    kvRow('Flag', v(data['flag'])), kvRow('Port registry', v(data['register_port'])), kvRow('Call sign', v(data['call_sign'])),
    kvRow('IMO number', v(data['imo'])), kvRow('Type', v(data['vessel_type'])), kvRow('Delivered', v(data['delivered'])),
    kvRow('LOA', meters(data['loa'])), kvRow('LBP', meters(data['lbp'])), kvRow('Depth moulded', meters(data['depth_moulded'])),
    kvRow('Breadth moulded', meters(data['breadth_moulded'])), kvRow('Net tonnage', ton(data['net_tonnage'])),
    kvRow('Gross tonnage', ton(data['gross_tonnage'])), kvRow('Summer DWT', ton(data['summer_dwt'])),
  ] }));

  // ── 3. Draft Survey (cabeçalho da parte de calados) ──
  body.push(sectionTitle('s3', numTitle(3, 'Draft Survey')));

  // ── 4/5/6. Fases ──
  // Initial lista as MESMAS partes citadas do Final (modelo aponta DS FINAL B49-B51):
  // as partes do atendimento são as mesmas. A narrativa do Initial usa só os nomes
  // (sem o bloco de "figures", que é exclusivo de Intermediate/Final).
  body.push(...phaseSection(initNum, 'Initial', 'init', data, V, input.sheetImages.initial, input.acting.final ?? []));
  if (hasInter) body.push(...phaseSection(interNum, 'Intermediate', 'int', data, V, input.sheetImages.intermediate, input.acting.intermediate ?? []));
  body.push(...phaseSection(finalNum, 'Final', 'fin', data, V, input.sheetImages.final, input.acting.final ?? []));

  // ── 7. Photographic Report (nova página) ──
  body.push(new Paragraph({ children: [new PageBreak()] }));
  body.push(sectionTitle(`s${photoNum}`, numTitle(photoNum, 'Photographic Report')));
  for (const p of photoSubs) {
    body.push(subTitle(`s${photoNum}_${p.m}`, `${photoNum}.${p.m} ${p.label}`));
    for (const ph of input.phasePhotos[p.key] ?? []) body.push(img(ph, 150));
  }

  // ── 8. Attachment ──
  body.push(sectionTitle(`s${attachNum}`, numTitle(attachNum, 'Attachment')));
  ['Draft Survey Certificates issued by undersigned surveyor', 'Draft Survey Certificate issued by vessel', 'Draft Survey Certificate issued by Terminal’s surveyor']
    .forEach((t) => body.push(para([run(t)])));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: SANS, size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: SANS, size: 26, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: SANS, size: 22, bold: true, color: NAVY }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1080, left: 1020, right: 1020 } } },
      headers: { default: header }, footers: { default: footer },
      children: body,
    }],
  });
  return Packer.toBuffer(doc) as unknown as Buffer;
}

function noBorders() {
  const n = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const;
  return { top: n, bottom: n, left: n, right: n };
}
function sectionTitle(id: string, t: string): Paragraph {
  // HEADING_1 com bookmark → alvo de link do sumário. Estilo em Document.styles.
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 80 }, children: [new Bookmark({ id, children: [run(t, { bold: true, size: 26, color: NAVY })] })] });
}
/** Título simples (navy bold), NÃO entra no sumário (PERSON/COMPANIES, Contents). */
function plainTitle(t: string): Paragraph {
  return new Paragraph({ spacing: { before: 240, after: 80 }, children: [run(t, { bold: true, size: 26, color: NAVY })] });
}
/** Linha do sumário CLICÁVEL: rótulo … nº de página, link interno ao bookmark. */
function contentsEntry(id: string, label: string, page: string, level: 1 | 2): Paragraph {
  const linkRun = (text: string) => new InternalHyperlink({ anchor: id, children: [run(text, { size: 22, bold: level === 1, color: '151515' })] });
  return new Paragraph({
    spacing: { after: 60 },
    indent: level === 2 ? { left: 400 } : undefined,
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
    children: [linkRun(label), new TextRun({ text: '\t', size: 22 }), linkRun(page)],
  });
}
function subTitle(id: string, t: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 60 }, children: [new Bookmark({ id, children: [run(t, { bold: true, size: 22, color: NAVY })] })] });
}
function personRow(label: string, lines: string[]): TableRow {
  return new TableRow({ children: [
    new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 30, bottom: 30, left: 100, right: 80 }, children: [new Paragraph({ children: [run(label, { bold: true })] })] }),
    new TableCell({ width: { size: 62, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: { top: 30, bottom: 30, left: 100, right: 80 }, children: lines.map((l, i) => new Paragraph({ spacing: { after: 0 }, children: [run(l, { bold: i === 0 })] })) }),
  ] });
}

function phaseSection(num: number, title: string, x: 'init' | 'int' | 'fin', data: Data, V: (typeof VARIANT)[keyof typeof VARIANT], image: Buffer | null | undefined, acting: string[][]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const fp = x === 'int' ? 'int' : x === 'fin' ? 'fin' : null;
  const dateField = x === 'init' ? 'initial_date' : x === 'int' ? 'intermediate_date' : 'final_date';
  const startF = x === 'init' ? 'initial_start' : x === 'int' ? 'intermediate_start' : 'final_start';
  const endF = x === 'init' ? 'initial_end' : x === 'int' ? 'intermediate_end' : 'final_end';
  const partyRoles = acting.slice(1).map((r) => String(r[0] ?? '').trim().toLowerCase()).filter(Boolean);
  const parties = partyRoles.length ? `, ${partyRoles.join(', ')}` : '';

  out.push(sectionTitle(`s${num}`, `${num}. ${title}`));
  if (x === 'init') {
    out.push(para([run(`The initial Draft Survey was carried out on ${fmtDate(data[dateField])}, upon berthing at ${v(data['terminal'])} Terminal, shed ${v(data['shed'])} from ${v(data[startF])}h up to ${v(data[endF])}h local time jointly with ship's command${parties} and the undersigned surveyor.`)]));
  } else {
    out.push(para([run(`The ${title.toLowerCase()} Draft Survey was carried out on ${fmtDate(data[dateField])}, from ${v(data[startF])} up to ${v(data[endF])} h local time jointly with ship's command${parties} and the undersigned surveyor to ascertain the total quantity of the cargo ${V.done} being the following figures disclosed:`)]));
    // figures
    if (fp) {
      out.push(leader(`${V.officialFig} figures (Official)`, mt(data[`${fp}_fig_shore_scale`])));
      out.push(leader("NAABSA's surveyor figures", mt(data[`${fp}_fig_naabsa`])));
      out.push(leader('Difference as per our figures', `${signedMt(data[`${fp}_fig_diff_mt`])} or ${signedPct(data[`${fp}_fig_diff_pct`])}`));
      out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      out.push(leader("Vessel's figures", mt(data[`${fp}_fig_vessel`])));
      // figures por parte (acting-as): coluna J = índice 8 do range. Guard de bounds/NaN.
      acting.slice(1).forEach((r) => {
        const role = String(r[0] ?? '').trim();
        if (!role) return;
        const n = r.length > 8 ? Number(r[8]) : NaN;
        const label = `${role.replace(/\s+surveyor$/i, '')}'s figures`.replace(/''s/, "'s");
        out.push(leader(label, Number.isFinite(n) ? mt(n) : '—'));
      });
    }
  }
  // 4.1 Draft readings (bold lead-in numerado, com bookmark) + tabela
  const sides = sideLabel(data['berthing_side']);
  out.push(new Paragraph({ spacing: { after: 100, ...BODY_LINE }, children: [new Bookmark({ id: `s${num}_1`, children: [run(`${num}.1 Draft readings: `, { bold: true })] }), run(`${sides.berthed} from shore, alongside vessel and ${sides.opposite} from boat.`)] }));
  out.push(draftReadingsTable(x, data));
  out.push(new Paragraph({ spacing: { after: 60 }, children: [] })); // respiro após a tabela
  // 6.2/6.3 (Final) usam o MESMO texto de 4.2/4.3 e 5.2/5.3 (pedido do cliente).
  out.push(subLead(`s${num}_2`, `${num}.2 Sea water density: `, "A seawater sample was collected in way of the midship draft mark, on the sea side. The vessel's hydrometer was considered the official instrument for all readings."));
  out.push(subLead(`s${num}_3`, `${num}.3 Ballast water and fresh water: `, 'All ballast water tanks were gauged individually, and the volumes were calculated by applying the applicable trim and list corrections. The fresh water quantity was provided by the Chief Officer'));
  out.push(subLead(`s${num}_4`, `${num}.4 Fuel R.O.B.: `, x === 'init' ? 'According to the logbook – FWE.' : 'Declared by Ch/Eng at time of survey.'));
  out.push(subTitle(`s${num}_5`, `${num}.5 ${title} Draft details`));
  if (image) out.push(img(image, 165));
  return out;
}

function subLead(id: string, label: string, txt: string): Paragraph {
  return new Paragraph({ spacing: { after: 120, ...BODY_LINE }, children: [new Bookmark({ id, children: [run(label, { bold: true })] }), run(txt)] });
}
function leader(label: string, value: string): Paragraph {
  return new Paragraph({ spacing: { after: 40 }, tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }], children: [run(label, { size: 21 }), new TextRun({ text: '\t', size: 21 }), run(value, { size: 21 })] });
}
function sideLabel(b: FieldValue | undefined): { berthed: string; opposite: string } {
  const s = String(b ?? '').toLowerCase();
  if (s.startsWith('star')) return { berthed: 'Starboard side', opposite: 'Port side' };
  if (s.startsWith('port')) return { berthed: 'Port side', opposite: 'Starboard side' };
  return { berthed: v(b), opposite: '—' };
}
function draftReadingsTable(x: 'init' | 'int' | 'fin', data: Data): Table {
  const heelLabel = x === 'init' ? 'Heel' : 'List';
  const heelField = x === 'init' ? 'init_heel' : x === 'int' ? 'int_list' : 'fin_list';
  const heelSide = x === 'init' ? 'init_heel_side' : x === 'int' ? 'int_list_side' : 'fin_list_side';
  const heelVal = data[heelField] != null ? `${num(data[heelField], 2)}° ${v(data[heelSide], '')}`.trim() : '—';
  const deflVal = data[`${x}_deflection`] != null ? `${num(data[`${x}_deflection`], 1)} cm ${v(data[`${x}_deflection_type`], '')}`.trim() : '—';
  // Células vazias (espaçador entre os 2 blocos + 4ª linha) ficam SEM borda — só os
  // dados formam grade. Padding generoso (era 0,5pt) e alinhamento vertical central.
  const c = (t: string, bold = false) => new TableCell({ borders: t === '' ? tableNoBorders : tableBorders, margins: { top: 50, bottom: 50, left: 90, right: 90 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ spacing: { after: 0 }, children: [run(t, { size: 18, bold })] })] });
  const head = new TableRow({ children: [c('Draft Mark', true), c('Means', true), c('Mean corrected', true), c('', false), c('', false), c('', false)] });
  const r1 = new TableRow({ children: [c('Fwd'), c(num(data[`${x}_fwd_mean`], 3)), c(num(data[`${x}_fwd_corr`], 4)), c(''), c('Trim obs', true), c(`${num(data[`${x}_trim_obs`], 4)} m`)] });
  const r2 = new TableRow({ children: [c('Ms'), c(num(data[`${x}_mid_mean`], 3)), c(num(data[`${x}_mid_corr`], 4)), c(''), c('Trim correct', true), c(`${num(data[`${x}_trim_corr`], 4)} m`)] });
  const r3 = new TableRow({ children: [c('Aft'), c(num(data[`${x}_aft_mean`], 3)), c(num(data[`${x}_aft_corr`], 4)), c(''), c(heelLabel, true), c(heelVal)] });
  const r4 = new TableRow({ children: [c(''), c(''), c(''), c(''), c('Deflection', true), c(deflVal)] });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableNoBorders, rows: [head, r1, r2, r3, r4] });
}
