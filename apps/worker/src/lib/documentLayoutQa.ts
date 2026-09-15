/**
 * Gate visual do DOCX já convertido em PDF.
 *
 * A checagem determinística detecta páginas sem conteúdo útil. Quando a IA está
 * habilitada, uma contact sheet de todas as páginas também é revisada para
 * identificar imagens cortadas, sobreposição e quebras claramente acidentais.
 * Falha/timeout da IA nunca bloqueia o fluxo.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { callLLM, isAiEnabled, parseJsonFromText } from './llm';

const RENDER_DPI = 72;
const BLANK_BODY_INK_RATIO = 0.001;
const BLANK_FULL_INK_RATIO = 0.012;
const MAX_AI_PAGES = 20;

export interface PageInkMeasurement {
  fullInkRatio: number;
  bodyInkRatio: number;
}

export interface DocumentLayoutQaResult {
  ok: boolean;
  pageCount: number;
  blankPages: number[];
  aiRequestedSmallerPhotos: boolean;
  aiIssues: string[];
}

interface AiLayoutResponse {
  ok?: boolean;
  needs_smaller_photos?: boolean;
  issues?: unknown;
}

function findPdftoppm(): string {
  const configured = process.env['PDFTOPPM_PATH'];
  if (configured) return configured;
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
          'C:\\Program Files\\poppler\\bin\\pdftoppm.exe',
        ]
      : ['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm'];
  return candidates.find(existsSync) ?? 'pdftoppm';
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: process.env,
      windowsHide: process.platform === 'win32',
    });
    let output = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('pdftoppm timeout'));
    }, 60_000);
    proc.stdout.on('data', (chunk) => (output += chunk.toString()));
    proc.stderr.on('data', (chunk) => (output += chunk.toString()));
    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(new Error(`pdftoppm saiu com ${code}: ${output.slice(0, 400)}`));
    });
  });
}

export async function measurePageInk(png: Buffer): Promise<PageInkMeasurement> {
  const { data, info } = await sharp(png)
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bodyTop = Math.floor(info.height * 0.1);
  const bodyBottom = Math.ceil(info.height * 0.92);
  let fullInk = 0;
  let bodyInk = 0;
  let bodyPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const brightness =
        (data[offset]! + data[offset + 1]! + data[offset + 2]!) / 3;
      const ink = brightness < 245;
      if (ink) fullInk += 1;
      if (y >= bodyTop && y < bodyBottom) {
        bodyPixels += 1;
        if (ink) bodyInk += 1;
      }
    }
  }
  return {
    fullInkRatio: fullInk / (info.width * info.height),
    bodyInkRatio: bodyInk / bodyPixels,
  };
}

export function isEffectivelyBlank(measurement: PageInkMeasurement): boolean {
  return (
    measurement.bodyInkRatio < BLANK_BODY_INK_RATIO &&
    measurement.fullInkRatio < BLANK_FULL_INK_RATIO
  );
}

async function renderPdfPages(
  pdf: Buffer,
): Promise<{ dir: string; pages: Buffer[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'naabsa-layout-qa-'));
  try {
    const pdfPath = join(dir, 'document.pdf');
    await writeFile(pdfPath, pdf);
    await run(
      findPdftoppm(),
      ['-png', '-r', String(RENDER_DPI), pdfPath, join(dir, 'page')],
      dir,
    );
    const names = (await readdir(dir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort(
        (a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]),
      );
    if (names.length === 0) throw new Error('pdftoppm não gerou páginas');
    return {
      dir,
      pages: await Promise.all(names.map((name) => readFile(join(dir, name)))),
    };
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function makeContactSheet(pages: Buffer[]): Promise<Buffer> {
  const selected = pages.slice(0, MAX_AI_PAGES);
  const columns = selected.length <= 8 ? 2 : 4;
  const thumbWidth = 280;
  const gap = 12;
  const thumbs = await Promise.all(
    selected.map((page) =>
      sharp(page).resize({ width: thumbWidth }).png().toBuffer(),
    ),
  );
  const metadata = await Promise.all(
    thumbs.map((thumb) => sharp(thumb).metadata()),
  );
  const thumbHeight = Math.max(...metadata.map((item) => item.height ?? 396));
  const rows = Math.ceil(thumbs.length / columns);
  return sharp({
    create: {
      width: columns * thumbWidth + (columns + 1) * gap,
      height: rows * thumbHeight + (rows + 1) * gap,
      channels: 3,
      background: '#d9d9d9',
    },
  })
    .composite(
      thumbs.map((input, index) => ({
        input,
        left: gap + (index % columns) * (thumbWidth + gap),
        top: gap + Math.floor(index / columns) * (thumbHeight + gap),
      })),
    )
    .jpeg({ quality: 78 })
    .toBuffer();
}

async function reviewWithAi(
  pages: Buffer[],
  reportId: string,
): Promise<{ needsSmallerPhotos: boolean; issues: string[] } | null> {
  if (!isAiEnabled() || pages.length > MAX_AI_PAGES) return null;
  const contactSheet = await makeContactSheet(pages);
  const text = await callLLM({
    purpose: 'document_layout_review',
    reportId,
    system:
      'Você revisa paginação de relatórios marítimos. Responda somente JSON válido, sem markdown.',
    content: [
      {
        type: 'text',
        text:
          'As miniaturas estão em ordem, da esquerda para a direita e de cima para baixo. ' +
          'Marque needs_smaller_photos=true somente se houver fotografia cortada, sobreposição, ' +
          'título órfão provocado por fotografia ou página acidentalmente vazia. Não marque como ' +
          'erro uma página de sumário ou anexo apenas por ela ter bastante espaço em branco. ' +
          'Formato: {"ok":boolean,"needs_smaller_photos":boolean,"issues":["descrição curta"]}.',
      },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: contactSheet.toString('base64'),
        },
      },
    ],
    maxTokens: 500,
  });
  const parsed = parseJsonFromText<AiLayoutResponse>(text);
  if (!parsed) return null;
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues
        .filter((issue): issue is string => typeof issue === 'string')
        .slice(0, 10)
    : [];
  return {
    needsSmallerPhotos: parsed.needs_smaller_photos === true,
    issues,
  };
}

export async function validateDocumentLayout(
  pdf: Buffer,
  reportId: string,
): Promise<DocumentLayoutQaResult> {
  const rendered = await renderPdfPages(pdf);
  try {
    const measurements = await Promise.all(rendered.pages.map(measurePageInk));
    const blankPages = measurements
      .map((measurement, index) =>
        isEffectivelyBlank(measurement) ? index + 1 : 0,
      )
      .filter((page) => page > 0);
    const ai = await reviewWithAi(rendered.pages, reportId);
    return {
      ok: blankPages.length === 0 && !ai?.needsSmallerPhotos,
      pageCount: rendered.pages.length,
      blankPages,
      aiRequestedSmallerPhotos: ai?.needsSmallerPhotos ?? false,
      aiIssues: ai?.issues ?? [],
    };
  } finally {
    await rm(rendered.dir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}
