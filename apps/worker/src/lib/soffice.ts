/**
 * LibreOffice headless: conversão docx→pdf e medição de páginas das seções.
 *
 * O sumário (Contents) é montado MANUALMENTE com números de página reais. Como
 * o LibreOffice headless não regenera campos TOC do .docx de forma confiável,
 * usamos um passo de MEDIÇÃO: uma macro Basic carrega o docx, percorre os
 * parágrafos com estilo Heading 1/2 e reporta a página de cada um (ViewCursor).
 * O builder então gera o Contents com esses números (2 passes; a altura do
 * Contents é idêntica nos dois passes, então a paginação não muda).
 *
 * Portabilidade: roda em Windows (dev) e Linux/container (prod). URLs file:// e
 * o registro do macro (script.xlc + Standard) são construídos de forma agnóstica
 * de SO. A medição degrada para [] em falha (sumário sem números, sem quebrar o PDF).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function findSoffice(): string {
  const cands = [
    process.env['SOFFICE_PATH'],
    'C:\\Program Files\\LibreOffice\\program\\soffice.com',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
  ].filter(Boolean) as string[];
  return cands.find((p) => existsSync(p)) ?? 'soffice';
}

const PROFILE_DIR = process.env['LO_PROFILE_DIR'] || join(process.cwd(), '.lo-profile');
/** file:// URL válido em Windows (C:\x → file:///C:/x) e Linux (/tmp/x → file:///tmp/x). */
function toFileUrl(p: string): string {
  const u = p.replace(/\\/g, '/');
  return 'file://' + (u.startsWith('/') ? u : '/' + u);
}
const profileUrl = () => toFileUrl(PROFILE_DIR);
const fileUrl = (p: string) => toFileUrl(p);

const MACRO = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">Sub ConvertDoc(sIn As String, sOut As String)
  Dim oDoc As Object
  Dim lArgs(0) As New com.sun.star.beans.PropertyValue
  lArgs(0).Name = "Hidden" : lArgs(0).Value = True
  oDoc = StarDesktop.loadComponentFromURL(sIn, "_blank", 0, lArgs())
  Dim sFilter As String
  If LCase(Right(sOut, 4)) = ".png" Then
    sFilter = "writer_png_Export"
  Else
    sFilter = "writer_pdf_Export"
  End If
  Dim eArgs(0) As New com.sun.star.beans.PropertyValue
  eArgs(0).Name = "FilterName" : eArgs(0).Value = sFilter
  oDoc.storeToURL(sOut, eArgs())
  oDoc.close(False)
End Sub

Sub MeasurePages(sIn As String, sOut As String)
  ' Reporta a página de cada BOOKMARK. Resiliente: falha → arquivo vazio → {}.
  On Error Resume Next
  Dim oDoc As Object, oBk As Object, oMark As Object, oVC As Object
  Dim s As String, i As Integer
  Dim lArgs(0) As New com.sun.star.beans.PropertyValue
  lArgs(0).Name = "Hidden" : lArgs(0).Value = False
  oDoc = StarDesktop.loadComponentFromURL(sIn, "_blank", 0, lArgs())
  Wait 1500
  oVC = oDoc.getCurrentController().getViewCursor()
  oBk = oDoc.getBookmarks()
  s = ""
  For i = 0 To oBk.Count - 1
    oMark = oBk.getByIndex(i)
    oVC.gotoRange(oMark.getAnchor().getStart(), False)
    s = s &amp; oMark.getName() &amp; Chr(9) &amp; oVC.getPage() &amp; Chr(10)
  Next i
  Dim iFile As Integer
  iFile = FreeFile
  Open ConvertFromURL(sOut) For Output As #iFile
  Print #iFile, s
  Close #iFile
  oDoc.close(False)
End Sub</script:module>`;

const SCRIPT_XLB = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">
<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" library:readonly="false" library:passwordprotected="false">
 <library:element library:name="Module1"/>
</library:library>`;

/** Registra a biblioteca Standard (defensivo; o LibreOffice também a cria no init). */
const SCRIPT_XLC = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:libraries PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "libraries.dtd">
<library:libraries xmlns:library="http://openoffice.org/2000/library" xmlns:xlink="http://www.w3.org/1999/xlink">
 <library:library library:name="Standard" xlink:href="$(USER)/basic/Standard/script.xlb/" xlink:type="simple" library:link="false"/>
</library:libraries>`;

let installed = false;

// Serializa todas as chamadas ao LibreOffice deste módulo: elas compartilham o
// MESMO perfil (-env:UserInstallation) com a macro instalada, e dois processos
// soffice concorrentes sobre o mesmo perfil corrompem/travam. generate_pdf e
// preview_pdf são filas distintas (poderiam rodar juntas) → mutex em processo.
let loChain: Promise<unknown> = Promise.resolve();
/** Serializa qualquer chamada ao LibreOffice do worker (exportado p/ sheetImage.ts
 *  usar o MESMO mutex — render_sheets (Calc) não pode rodar junto com generate_pdf). */
export function withLoLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = loChain.then(fn, fn);
  loChain = next.then(() => undefined, () => undefined);
  return next;
}

function run(soffice: string, args: string[], timeoutMs = 60000): Promise<void> {
  return withLoLock(() => new Promise<void>((res, rej) => {
    const p = spawn(soffice, args, { windowsHide: process.platform === 'win32' });
    let err = '';
    const t = setTimeout(() => { p.kill(); rej(new Error('soffice timeout')); }, timeoutMs);
    p.stderr.on('data', (d) => (err += d));
    p.on('error', rej);
    p.on('close', (c) => { clearTimeout(t); if (c === 0) res(); else rej(new Error(`soffice exit ${c}: ${err}`)); });
  }));
}

async function ensureMacro(soffice: string): Promise<void> {
  if (installed) return;
  const basicDir = join(PROFILE_DIR, 'user', 'basic');
  const stdDir = join(basicDir, 'Standard');
  if (!existsSync(stdDir)) {
    // Inicializa o perfil (cria a árvore user/) com uma conversão trivial.
    const dir = await mkdtemp(join(tmpdir(), 'lo-init-'));
    try {
      writeFileSync(join(dir, 'd.txt'), 'init');
      await run(soffice, ['--headless', '--norestore', `-env:UserInstallation=${profileUrl()}`, '--convert-to', 'pdf', '--outdir', dir, join(dir, 'd.txt')], 90000);
    } catch (e) {
      // Não fatal: escrevemos script.xlc/.xlb abaixo de qualquer forma.
      console.warn('[soffice] init do perfil falhou (seguindo):', e instanceof Error ? e.message : e);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  mkdirSync(stdDir, { recursive: true });
  writeFileSync(join(basicDir, 'script.xlc'), SCRIPT_XLC, 'utf-8');
  writeFileSync(join(stdDir, 'script.xlb'), SCRIPT_XLB, 'utf-8');
  writeFileSync(join(stdDir, 'Module1.xba'), MACRO, 'utf-8');
  installed = true;
}

async function callMacro(sub: string, inPath: string, outPath: string, timeoutMs: number): Promise<void> {
  const soffice = findSoffice();
  await ensureMacro(soffice);
  const macro = `macro:///Standard.Module1.${sub}("${fileUrl(inPath)}","${fileUrl(outPath)}")`;
  await run(soffice, ['--headless', '--norestore', '--invisible', `-env:UserInstallation=${profileUrl()}`, macro], timeoutMs);
}

async function convert(docx: Buffer, ext: 'pdf' | 'png', timeoutMs: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'lo-conv-'));
  try {
    const inPath = join(dir, 'r.docx');
    const outPath = join(dir, `r.${ext}`);
    writeFileSync(inPath, docx);
    await callMacro('ConvertDoc', inPath, outPath, timeoutMs);
    if (!existsSync(outPath)) throw new Error(`${ext} não gerado pela macro`);
    const out = await readFile(outPath);
    if (out.length === 0) throw new Error(`${ext} gerado vazio`);
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Converte um .docx (buffer) para PDF. */
export const convertDocxToPdf = (docx: Buffer) => convert(docx, 'pdf', 120000);
/** 1ª página em PNG (debug). */
export const convertDocxFirstPagePng = (docx: Buffer) => convert(docx, 'png', 90000);

/**
 * Mede a página de cada BOOKMARK do docx (para montar o sumário com nº de página).
 * Retorna {bookmarkName → página}. Degrada para {} em qualquer falha — o sumário
 * sai sem números, sem quebrar o PDF.
 */
export async function measureBookmarkPages(docx: Buffer): Promise<Record<string, number>> {
  const dir = await mkdtemp(join(tmpdir(), 'lo-meas-'));
  try {
    const inPath = join(dir, 'r.docx');
    const outPath = join(dir, 'pages.txt');
    writeFileSync(inPath, docx);
    await callMacro('MeasurePages', inPath, outPath, 90000);
    const txt = existsSync(outPath) ? await readFile(outPath, 'utf-8') : '';
    const out: Record<string, number> = {};
    for (const line of txt.split(/\r?\n/)) {
      const tab = line.indexOf('\t');
      if (tab < 0) continue;
      const name = line.slice(0, tab);
      const page = parseInt(line.slice(tab + 1), 10);
      if (name && Number.isFinite(page)) out[name] = page;
    }
    return out;
  } catch (e) {
    console.warn('[soffice] medição de páginas falhou (sumário sem números):', e instanceof Error ? e.message : e);
    return {};
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
