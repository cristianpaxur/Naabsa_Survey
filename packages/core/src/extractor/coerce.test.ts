import { describe, it, expect } from 'vitest';
import { coerceField, excelSerialToISO, type RawCellValue } from './coerce';
import type {
  StringFieldDef,
  NumberFieldDef,
  DateFieldDef,
  EnumFieldDef,
  BooleanFieldDef,
  TimeFieldDef,
} from '../types';

const base = { label: 'L', section: 'S', cell: 'B1' } as const;
const strField: StringFieldDef = { ...base, type: 'string' };
const numField: NumberFieldDef = { ...base, type: 'number' };
const num2: NumberFieldDef = { ...base, type: 'number', decimals: 2 };
const dateField: DateFieldDef = {
  ...base,
  type: 'date',
  format: 'DD/MMM/YYYY',
};
const enumField: EnumFieldDef = {
  ...base,
  type: 'enum',
  options: ['Carregamento', 'Descarga'],
};
const boolField: BooleanFieldDef = { ...base, type: 'boolean' };

describe('coerceField — vazios', () => {
  it.each<RawCellValue>([null, '', '   '])('%p → null', (raw) => {
    expect(coerceField(raw, strField).value).toBeNull();
    expect(coerceField(raw, numField).value).toBeNull();
  });
});

describe('coerceField — string', () => {
  it('apara espaços', () => {
    expect(coerceField('  MV Cabo Frio  ', strField).value).toBe(
      'MV Cabo Frio',
    );
  });
  it('número vira string', () => {
    expect(coerceField(123, strField).value).toBe('123');
  });
});

describe('coerceField — number (pt-BR)', () => {
  it('número nativo', () => {
    expect(coerceField(208450, numField).value).toBe(208450);
  });
  it('milhar pt-BR "208.450" → 208450', () => {
    expect(coerceField('208.450', numField).value).toBe(208450);
  });
  it('milhar + decimal "1.025,50" → 1025.5', () => {
    expect(coerceField('1.025,50', numField).value).toBe(1025.5);
  });
  it('decimal "12,5" → 12.5', () => {
    expect(coerceField('12,5', numField).value).toBe(12.5);
  });
  it('arredonda a decimals', () => {
    expect(coerceField('1,239', num2).value).toBe(1.24);
  });
  it('texto não numérico → erro', () => {
    const r = coerceField('abc', numField);
    expect(r.value).toBeNull();
    expect(r.error).toContain('não numérico');
  });
});

describe('coerceField — date', () => {
  it('serial Excel 44197 → 2021-01-01 (sistema 1900)', () => {
    expect(excelSerialToISO(44197)).toBe('2021-01-01');
    expect(coerceField(44197, dateField).value).toBe('2021-01-01');
  });
  it('serial sistema 1904 (42735 → 2021-01-01)', () => {
    expect(coerceField(42735, dateField, { date1904: true }).value).toBe(
      '2021-01-01',
    );
  });
  it('objeto Date → ISO (UTC, sem deslocamento)', () => {
    const d = new Date(Date.UTC(2026, 5, 6));
    expect(coerceField(d, dateField).value).toBe('2026-06-06');
  });
  it('string DD/MM/YYYY → ISO', () => {
    expect(coerceField('06/06/2026', dateField).value).toBe('2026-06-06');
  });
  it('string ISO → ISO', () => {
    expect(coerceField('2026-06-06', dateField).value).toBe('2026-06-06');
  });
  it('serial negativo → erro', () => {
    const r = coerceField(-5, dateField);
    expect(r.value).toBeNull();
    expect(r.error).toContain('inválido');
  });
  it('data textual inválida → erro', () => {
    expect(coerceField('32/13/2026', dateField).error).toBeDefined();
  });
  it('Invalid Date (fórmula não avaliada pelo ExcelJS) → vazio, nunca NaN-NaN-NaN', () => {
    const invalid = new Date(NaN);
    // como date e como string: ambos devem virar null (célula vazia), sem erro.
    expect(coerceField(invalid, dateField).value).toBeNull();
    const stringField = { ...dateField, type: 'string' as const };
    const r = coerceField(invalid, stringField);
    expect(r.value).toBeNull();
    expect(r.error).toBeUndefined();
  });
});

describe('coerceField — enum', () => {
  it('match exato', () => {
    expect(coerceField('Descarga', enumField).value).toBe('Descarga');
  });
  it('case-insensitive → opção canônica', () => {
    expect(coerceField('descarga', enumField).value).toBe('Descarga');
  });
  it('fora das opções → erro', () => {
    const r = coerceField('Transbordo', enumField);
    expect(r.error).toContain('fora das opções');
  });
});

describe('coerceField — boolean', () => {
  it('booleano nativo', () => {
    expect(coerceField(true, boolField).value).toBe(true);
  });
  it('"sim"/"não" pt-BR', () => {
    expect(coerceField('sim', boolField).value).toBe(true);
    expect(coerceField('Não', boolField).value).toBe(false);
  });
  it('1/0', () => {
    expect(coerceField(1, boolField).value).toBe(true);
    expect(coerceField(0, boolField).value).toBe(false);
  });
  it('inválido → erro', () => {
    expect(coerceField('talvez', boolField).error).toBeDefined();
  });
});

describe('coerceField — time (RF-011)', () => {
  const timeField: TimeFieldDef = { ...base, type: 'time' };

  it('fração de dia → HH:MM (09:00 = 0.375)', () => {
    expect(coerceField(0.375, timeField).value).toBe('09:00');
  });

  it('fração de dia → HH:MM (13:30 = 0.5625)', () => {
    expect(coerceField(0.5625, timeField).value).toBe('13:30');
  });

  it('serial datetime (parte inteira = data) usa só fração', () => {
    // 45123.375 = alguma data de 2023 + 09:00
    expect(coerceField(45123.375, timeField).value).toBe('09:00');
  });

  it('objeto Date → HH:MM via UTC', () => {
    const d = new Date(Date.UTC(2024, 5, 6, 9, 30, 0));
    expect(coerceField(d, timeField).value).toBe('09:30');
  });

  it('string "09:00" → passa direto', () => {
    expect(coerceField('09:00', timeField).value).toBe('09:00');
  });

  it('string com datetime "06/Jun/2024 14:15" → extrai HH:MM', () => {
    expect(coerceField('06/Jun/2024 14:15', timeField).value).toBe('14:15');
  });

  it('string sem hora válida → erro', () => {
    expect(coerceField('manhã', timeField).error).toBeDefined();
    expect(coerceField('manhã', timeField).value).toBeNull();
  });

  it('null → null (célula vazia)', () => {
    expect(coerceField(null, timeField).value).toBeNull();
  });
});
