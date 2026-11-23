import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { isEffectivelyBlank, measurePageInk } from './documentLayoutQa';

describe('documentLayoutQa', () => {
  it('detects a genuinely blank page', async () => {
    const page = await sharp({
      create: { width: 612, height: 792, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    expect(isEffectivelyBlank(await measurePageInk(page))).toBe(true);
  });

  it('accepts a sparse but legitimate attachment page', async () => {
    const width = 306;
    const height = 396;
    const pixels = Buffer.alloc(width * height * 3, 255);
    for (const [top, lineHeight] of [
      [48, 3],
      [65, 3],
    ] as const) {
      for (let y = top; y < top + lineHeight; y += 1) {
        for (let x = 24; x < 282; x += 1) {
          const offset = (y * width + x) * 3;
          pixels[offset] = 0;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
        }
      }
    }
    const page = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    expect(isEffectivelyBlank(await measurePageInk(page))).toBe(false);
  });

  it('accepts a page dominated by a photograph', async () => {
    const page = await sharp({
      create: { width: 612, height: 792, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 500,
              height: 500,
              channels: 3,
              background: '#557799',
            },
          })
            .png()
            .toBuffer(),
          left: 56,
          top: 140,
        },
      ])
      .png()
      .toBuffer();
    expect(isEffectivelyBlank(await measurePageInk(page))).toBe(false);
  });
});
