import { describe, expect, it } from 'vitest';
import { fitPhotoSize, pairPhotos } from './msc-photo-layout';

describe('fitPhotoSize', () => {
  it.each([
    {
      orientation: 'landscape',
      source: { width: 800, height: 600 },
      expected: { width: 80, height: 60 },
    },
    {
      orientation: 'portrait',
      source: { width: 600, height: 800 },
      expected: { width: 45, height: 60 },
    },
    {
      orientation: 'wide landscape',
      source: { width: 1600, height: 600 },
      expected: { width: 80, height: 30 },
    },
    {
      orientation: 'square',
      source: { width: 600, height: 600 },
      expected: { width: 60, height: 60 },
    },
  ])(
    'fits a $orientation photo into both bounds without distortion',
    ({ source, expected }) => {
      expect(fitPhotoSize(source, { width: 80, height: 60 })).toEqual(expected);
    },
  );

  describe.each(['source', 'box'] as const)(
    'invalid %s dimensions',
    (target) => {
      it.each([
        0,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ])('rejects width %s', (invalidWidth) => {
        const source = { width: 800, height: 600 };
        const box = { width: 80, height: 60 };
        (target === 'source' ? source : box).width = invalidWidth;

        expect(() => fitPhotoSize(source, box)).toThrow(RangeError);
      });

      it.each([
        0,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ])('rejects height %s', (invalidHeight) => {
        const source = { width: 800, height: 600 };
        const box = { width: 80, height: 60 };
        (target === 'source' ? source : box).height = invalidHeight;

        expect(() => fitPhotoSize(source, box)).toThrow(RangeError);
      });
    },
  );
});

describe('pairPhotos', () => {
  it.each([
    { photos: [], expected: [] },
    { photos: ['a'], expected: [['a']] },
    { photos: ['a', 'b'], expected: [['a', 'b']] },
    { photos: ['a', 'b', 'c'], expected: [['a', 'b'], ['c']] },
    {
      photos: ['a', 'b', 'c', 'd', 'e', 'f'],
      expected: [
        ['a', 'b'],
        ['c', 'd'],
        ['e', 'f'],
      ],
    },
  ])('groups $photos into ordered pairs', ({ photos, expected }) => {
    expect(pairPhotos(photos)).toEqual(expected);
  });

  it('preserves photo identity without modifying a readonly list', () => {
    const photos = Object.freeze([
      { id: 'first' },
      { id: 'second' },
      { id: 'third' },
    ]);

    const rows = pairPhotos(photos);

    expect(rows[0]?.[0]).toBe(photos[0]);
    expect(rows[0]?.[1]).toBe(photos[1]);
    expect(rows[1]?.[0]).toBe(photos[2]);
    expect(photos).toEqual([
      { id: 'first' },
      { id: 'second' },
      { id: 'third' },
    ]);
  });
});
