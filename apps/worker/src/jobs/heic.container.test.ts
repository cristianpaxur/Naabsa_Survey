import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { transformImage } from './processPhoto';

// Execute dentro da imagem final com HEIC_FIXTURE apontando para uma foto real.
// Sem fixture, não declara como comprovado o suporte a HEVC no runtime.
describe.skipIf(!process.env.HEIC_FIXTURE)('HEIC real no runtime do worker', () => {
  it('gera JPEG sRGB e thumb com dimensões limitadas', async () => {
    const input = await readFile(process.env.HEIC_FIXTURE!);
    const result = await transformImage(input);
    const processed = await sharp(result.processed).metadata();
    const thumb = await sharp(result.thumb).metadata();
    expect(processed.format).toBe('jpeg');
    expect(processed.space).toBe('srgb');
    expect(Math.max(processed.width!, processed.height!)).toBeLessThanOrEqual(2500);
    expect(Math.max(thumb.width!, thumb.height!)).toBeLessThanOrEqual(400);
    expect(processed.orientation ?? 1).toBe(1);
    if (process.env.HEIC_EXPECT_PORTRAIT === '1') expect(processed.height).toBeGreaterThan(processed.width!);
  }, 60000);
});
