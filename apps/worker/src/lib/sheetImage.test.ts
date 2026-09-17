import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('sheet image print styling', () => {
  it('keeps spreadsheet gridlines out of every phase print', async () => {
    const source = await readFile(new URL('./sheetImage.ts', import.meta.url), 'utf8');

    expect(source).toMatch(/showGridLines:\s*false/);
    expect(source).not.toMatch(/showGridLines:\s*true/);
  });
});
