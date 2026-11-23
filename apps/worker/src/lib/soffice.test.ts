import { beforeEach, describe, expect, it, vi } from 'vitest';

const conversionUrlMock = vi.hoisted(() => vi.fn());
const collaboraConvertMock = vi.hoisted(() => vi.fn());

vi.mock('./collaboraConversion', () => ({
  collaboraConversionUrl: conversionUrlMock,
  convertDocxToPdfWithCollabora: collaboraConvertMock,
}));

import { convertDocxToPdf } from './soffice';

beforeEach(() => {
  conversionUrlMock.mockReset();
  collaboraConvertMock.mockReset();
});

describe('convertDocxToPdf', () => {
  it('usa o Collabora configurado para manter a paginação igual à do editor', async () => {
    const docx = Buffer.from('DOCX');
    const pdf = Buffer.from('%PDF-collabora');
    const endpoint = 'http://collabora:9980/cool/convert-to/pdf';
    conversionUrlMock.mockReturnValue(endpoint);
    collaboraConvertMock.mockResolvedValue(pdf);

    await expect(convertDocxToPdf(docx)).resolves.toEqual(pdf);
    expect(collaboraConvertMock).toHaveBeenCalledWith(docx, endpoint);
  });
});
