import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** HEIC usa HEVC; o Sharp pré-compilado suporta AVIF, mas não HEVC. */
export function isHeic(input: Buffer): boolean {
  return input.length >= 16 && input.toString('ascii', 4, 8) === 'ftyp' &&
    /heic|heix|hevc|hevx|mif1|msf1/.test(input.toString('ascii', 8, Math.min(input.length, 64)));
}

/** libheif aplica a orientação HEIF; PNG intermediário evita dupla rotação EXIF. */
export async function decodeHeic(input: Buffer): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'naabsa-heic-'));
  try {
    const source = join(directory, 'input.heic');
    const target = join(directory, 'output.png');
    await writeFile(source, input);
    try {
      await execute(process.env.HEIF_CONVERT_BIN || 'heif-convert', [source, target], {
        timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Conversor HEIC indisponível no worker. Instale libheif-examples ou envie JPG/PNG.');
      }
      throw new Error('Não foi possível converter esta foto HEIC. Verifique o arquivo ou envie JPG/PNG.');
    }
    const outputs = (await readdir(directory)).filter((name) => /^output(?:-\d+)?\.png$/.test(name)).sort();
    const first = outputs.includes('output.png') ? 'output.png' : outputs[0];
    if (!first) throw new Error('O conversor HEIC não gerou uma imagem.');
    return await readFile(join(directory, first));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
