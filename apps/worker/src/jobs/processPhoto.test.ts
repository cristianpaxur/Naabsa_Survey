import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { transformImage } from './processPhoto';

const MAX_EDGE = 2500;
const THUMB_EDGE = 400;

/** Cria um JPEG de teste com dimensões e orientação EXIF dadas. */
async function makeJpeg(
  width: number,
  height: number,
  orientation?: number,
): Promise<Buffer> {
  let img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 60, b: 30 },
    },
  });
  if (orientation) img = img.withMetadata({ orientation });
  return img.jpeg().toBuffer();
}

describe('transformImage (pipeline sharp do process_photo)', () => {
  it('reduz o lado maior para ≤ 2500 px sem ampliar imagens pequenas', async () => {
    const big = await makeJpeg(4000, 3000);
    const { processed, thumb } = await transformImage(big);

    const pMeta = await sharp(processed).metadata();
    expect(Math.max(pMeta.width ?? 0, pMeta.height ?? 0)).toBe(MAX_EDGE);
    expect(pMeta.format).toBe('jpeg');

    const tMeta = await sharp(thumb).metadata();
    expect(Math.max(tMeta.width ?? 0, tMeta.height ?? 0)).toBe(THUMB_EDGE);
  });

  it('não amplia imagem menor que 2500 px (processada mantém o tamanho)', async () => {
    const small = await makeJpeg(800, 600);
    const { processed } = await transformImage(small);
    const meta = await sharp(processed).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  for (const orientation of [6, 3, 8]) {
    it(`aplica EXIF orientation ${orientation} (lado maior orientado)`, async () => {
      // 6 = 90° CW, 3 = 180°, 8 = 270°. Imagem 1200x600 (paisagem).
      const src = await makeJpeg(1200, 600, orientation);
      const { processed } = await transformImage(src);
      const meta = await sharp(processed).metadata();
      // Após auto-orientação, 6/8 viram retrato (h > w); 3 segue paisagem.
      if (orientation === 6 || orientation === 8) {
        expect(meta.height).toBeGreaterThan(meta.width ?? 0);
      } else {
        expect(meta.width).toBeGreaterThan(meta.height ?? 0);
      }
      // EXIF de orientação foi consumido (não repete a rotação no render).
      expect(meta.orientation ?? 1).toBe(1);
    });
  }

  it('converte PNG para JPEG', async () => {
    const png = await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 4,
        background: { r: 10, g: 200, b: 90, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const { processed } = await transformImage(png);
    const meta = await sharp(processed).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('converte escala de cinza para sRGB (3 canais)', async () => {
    const gray = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: { r: 90, g: 90, b: 90 },
      },
    })
      .grayscale()
      .jpeg()
      .toBuffer();
    const { processed } = await transformImage(gray);
    const meta = await sharp(processed).metadata();
    expect(meta.space).toBe('srgb');
  });

  it('processa imagem quadrada grande limitando ambos os lados', async () => {
    const square = await makeJpeg(3200, 3200);
    const { processed } = await transformImage(square);
    const meta = await sharp(processed).metadata();
    expect(meta.width).toBe(MAX_EDGE);
    expect(meta.height).toBe(MAX_EDGE);
  });

  it('lança em buffer corrompido (vira erro recuperável no worker)', async () => {
    const garbage = Buffer.from('isto não é uma imagem', 'utf8');
    await expect(transformImage(garbage)).rejects.toThrow();
  });

  it('processa cada foto em < 10 s (RNF-03)', async () => {
    const big = await makeJpeg(4000, 3000);
    const start = Date.now();
    await transformImage(big);
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  it('processa 4 fotos em paralelo (smoke de concorrência — RNF-04)', async () => {
    const inputs = await Promise.all([
      makeJpeg(3000, 2000),
      makeJpeg(2800, 2100),
      makeJpeg(3200, 2400),
      makeJpeg(2600, 1800),
    ]);
    const results = await Promise.all(inputs.map((b) => transformImage(b)));
    expect(results).toHaveLength(4);
    for (const r of results) {
      const meta = await sharp(r.processed).metadata();
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(
        MAX_EDGE,
      );
    }
  });
});
