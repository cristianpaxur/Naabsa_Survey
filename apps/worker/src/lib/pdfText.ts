import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Poppler is already installed in the worker image. Preserve page form feeds. */
export async function extractPdfText(pdf: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'naabsa-pdf-text-'));
  try {
    const path = join(dir, 'document.pdf');
    await writeFile(path, pdf);
    const { stdout } = await execFileAsync(
      process.env['PDFTOTEXT_PATH'] || 'pdftotext',
      ['-layout', '-enc', 'UTF-8', path, '-'],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
