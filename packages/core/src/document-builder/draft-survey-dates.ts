import type { FieldValue } from '../types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function ordinal(day: number): string {
  if (day === 1 || day === 21 || day === 31) return 'st';
  if (day === 2 || day === 22) return 'nd';
  if (day === 3 || day === 23) return 'rd';
  return 'th';
}

/** Formata a data ISO do Draft Survey em inglês. */
export function formatDraftSurveyDate(value: FieldValue | undefined): string {
  if (value == null) return '—';
  const date = String(value);
  const match = ISO_DATE.exec(date);
  if (!match) return date;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  return month ? `${month} ${day}${ordinal(day)}, ${match[1]}` : date;
}

function minutesSinceMidnight(value: FieldValue | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** A planilha fornece uma data por fase e dois horários locais. */
export function formatDraftSurveyEndTimeSuffix(
  startDate: FieldValue | undefined,
  startTime: FieldValue | undefined,
  endTime: FieldValue | undefined,
): string {
  const sameDaySuffix = ' local time';
  if (typeof startDate !== 'string' || !ISO_DATE.test(startDate))
    return sameDaySuffix;
  const start = minutesSinceMidnight(startTime);
  const end = minutesSinceMidnight(endTime);
  if (start == null || end == null || end >= start) return sameDaySuffix;

  // O Date normaliza algumas datas inválidas. Confere o dia antes de avançar.
  const date = new Date(`${startDate}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    !date.toISOString().startsWith(`${startDate}T`)
  ) {
    return sameDaySuffix;
  }
  date.setUTCDate(date.getUTCDate() + 1);
  const endDate = date.toISOString().split('T')[0];
  return ` on ${formatDraftSurveyDate(endDate)} (local time)`;
}
