/**
 * Converte números digitados no formato brasileiro ou internacional.
 * Aceita, por exemplo, 280,54, 280.54, 1.234,56 e 1,234.56.
 */
export function parseLocalizedNumber(raw: string): number | null {
  const value = raw.trim();
  if (value === '') return null;
  if (!/^[+-]?[\d\s.,]+$/.test(value)) return null;

  const sign = value.startsWith('-') ? '-' : value.startsWith('+') ? '+' : '';
  const unsigned = sign ? value.slice(1) : value;
  const compact = unsigned.replace(/\s/g, '');
  if (compact.split(/[.,]/).some((part) => part === '')) return null;
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);

  let normalized: string;
  if (decimalIndex === -1) {
    normalized = compact;
  } else {
    const integerPart = compact.slice(0, decimalIndex).replace(/[.,]/g, '');
    const fractionPart = compact.slice(decimalIndex + 1).replace(/[.,]/g, '');
    normalized = `${integerPart}.${fractionPart}`;
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(`${sign}${normalized}`);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumberDraft(
  value: number | null,
  decimals?: number,
): string {
  if (value === null) return '';
  if (decimals === undefined) return String(value);
  return value.toFixed(decimals);
}
