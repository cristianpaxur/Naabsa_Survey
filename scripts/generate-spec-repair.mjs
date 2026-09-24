import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const migrationPath = resolve(root, 'packages/db/migrations/0010_repair_specs.sql');
const corrupted = /Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â[€‚„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|\uFFFD/;

export function repairDictionary() {
  const sql = readFileSync(resolve(root, 'packages/db/migrations/0007_seed_real_specs.sql'), 'utf8');
  const pairs = {};
  function walk(old, current) {
    if (typeof old === 'string' && typeof current === 'string' && corrupted.test(old)) {
      if (corrupted.test(current)) throw new Error('Fonte da correção também contém texto corrompido.');
      pairs[old] = current;
    } else if (old && current && typeof old === 'object' && typeof current === 'object') {
      for (const key of Object.keys(old)) walk(old[key], current[key]);
    }
  }
  for (const slug of ['draft_survey', 'msc']) {
    const match = sql.match(new RegExp(`${slug}_spec := '([\\s\\S]*?)'::jsonb`));
    if (!match) throw new Error(`Spec histórico ${slug} não encontrado.`);
    const old = JSON.parse(match[1].replaceAll("''", "'"));
    const current = migrationRepairFixture(
      slug,
      JSON.parse(readFileSync(resolve(root, `tests/fixtures/specs/${slug}.v1.json`), 'utf8')),
    );
    walk(old, current);
  }
  return pairs;
}

/**
 * A migration 0010 é histórica e não pode mudar quando a fixture evolui.
 * Mantém somente os textos que aquela migration originalmente reparava; os
 * limites numéricos são tratados pela migration 0015, que cria uma nova spec.
 */
function migrationRepairFixture(slug, fixture) {
  if (slug === 'msc') {
    const historical = JSON.parse(JSON.stringify(fixture));
    historical._meta.notes = historical._meta.notes.map((note) =>
      note.startsWith('Planilha SABRINA tem 8 abas;')
        ? 'Planilha SABRINA tem 8 abas; só Summary/Time Log/Sludge/Qtt Sumary/LOG Audit estão no escopo da spec v1. LNG, VacuoAr, Vessel Ullage ficam em ignore_sheets (a tabela de Ullage é input do operador, não sai no relatório).'
        : note.startsWith('Foto slots:')
          ? 'Foto slots: vessel / engine_room / survey_attendance (mín. 1 cada, obrigatórios). Capa não tem slot dedicado — vem do slot vessel[0] se presente.'
          : note,
    );
    return historical;
  }
  if (slug !== 'draft_survey') return fixture;
  const historical = JSON.parse(JSON.stringify(fixture));
  historical._meta.notes = historical._meta.notes.map((note) =>
    note.startsWith('int_fig_diff_pct e fin_fig_diff_pct')
      ? "int_fig_diff_pct e fin_fig_diff_pct guardam fracao (0.0398); o builder multiplica por 100 para exibir '%'."
      : note.startsWith('DATAS E HORAS:')
        ? "DATAS (2026-06-23): os mirrors Capa!L7/L8/L9 são fórmulas dynamic-array LET que o ExcelJS NÃO avalia (result=Invalid Date → NaN). Lemos as datas direto das células-fonte avaliáveis Inicial!C7, Intermediario!C5, final!C5 (type=date → ISO; o builder formata em inglês 'Month Dth, YYYY'). Horas (M/N) seguem na Capa, que o ExcelJS avalia."
        : note,
  );
  historical.validations = historical.validations.map((rule) =>
    rule.field === 'fin_fig_diff_pct' && rule.rule === 'range'
      ? {
          ...rule,
          message:
            'Diferença final acima de 0,5% entre figuras — revisar antes de aprovar.',
        }
      : rule,
  );
  if (!historical.validations.some((rule) => rule.field === 'fin_fig_diff_pct')) {
    historical.validations.push({
      rule: 'range', field: 'fin_fig_diff_pct', min: -0.05, max: 0.05,
      level: 'warning',
      message: 'Diferença final acima de 0,5% entre figuras — revisar antes de aprovar.',
    });
  }
  return historical;
}

export function renderMigration() {
  const dictionary = JSON.stringify(repairDictionary());
  return `-- Gerado por scripts/generate-spec-repair.mjs. Não editar o SQL manualmente.
-- 015/C10/C11: corrige valores conhecidos, preserva customizações e relatórios históricos.
create or replace function public.repair_spec_text_015(value jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $repair$
declare result jsonb; text_value text;
  dictionary constant jsonb := $dictionary$${dictionary}$dictionary$::jsonb;
begin
  case jsonb_typeof(value)
    when 'object' then
      select coalesce(jsonb_object_agg(key, public.repair_spec_text_015(val)), '{}'::jsonb)
        into result from jsonb_each(value) as fields(key, val);
    when 'array' then
      select coalesce(jsonb_agg(public.repair_spec_text_015(val) order by ord), '[]'::jsonb)
        into result from jsonb_array_elements(value) with ordinality as items(val, ord);
    when 'string' then
      text_value := value #>> '{}';
      result := to_jsonb(coalesce(dictionary ->> text_value, text_value));
    else result := value;
  end case;
  return result;
end;
$repair$;
revoke all on function public.repair_spec_text_015(jsonb) from public, anon, authenticated;

do $migration$
declare rt record; previous public.report_specs%rowtype; corrected jsonb;
  validations jsonb; next_version integer; new_id uuid;
begin
  for rt in select * from public.report_types where slug in ('draft_survey', 'msc') for update loop
    select * into previous from public.report_specs where id = rt.active_spec_id;
    if not found then continue; end if;
    corrected := public.repair_spec_text_015(previous.spec);
    if rt.slug = 'draft_survey' and jsonb_typeof(corrected -> 'validations') = 'array' then
      select jsonb_agg(case
        when rule ->> 'field' = 'fin_fig_diff_pct' and rule ->> 'rule' = 'range'
          and rule -> 'min' = '-0.05'::jsonb and rule -> 'max' = '0.05'::jsonb
          and rule ->> 'message' = 'Diferença final acima de 0,5% entre figuras — revisar antes de aprovar.'
        then rule || '{"min":-0.005,"max":0.005}'::jsonb else rule end order by ord)
        into validations from jsonb_array_elements(corrected -> 'validations') with ordinality as items(rule, ord);
      corrected := jsonb_set(corrected, '{validations}', coalesce(validations, '[]'::jsonb));
    end if;
    if corrected = previous.spec then continue; end if;
    select coalesce(max(version), 0) + 1 into next_version from public.report_specs where report_type_id = rt.id;
    corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
    insert into public.report_specs (report_type_id, version, spec) values (rt.id, next_version, corrected) returning id into new_id;
    update public.report_types set active_spec_id = new_id where id = rt.id;
    insert into public.audit_log (action, payload) values ('spec_corrected', jsonb_build_object(
      'report_type', rt.slug, 'previous_spec_id', previous.id, 'spec_id', new_id, 'version', next_version,
      'reason', '015: correção de textos e limite percentual; relatórios existentes preservados'));
  end loop;
end;
$migration$;
drop function public.repair_spec_text_015(jsonb);
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const generated = renderMigration();
  if (process.argv.includes('--write')) {
    writeFileSync(migrationPath, generated, 'utf8');
    console.log('Migration corretiva gerada. Nenhum banco foi acessado.');
  } else {
    if (readFileSync(migrationPath, 'utf8').replaceAll('\r\n', '\n') !== generated) {
      throw new Error('Migration diverge das fontes. Execute node scripts/generate-spec-repair.mjs --write.');
    }
    console.log('Migration corretiva consistente com as fixtures.');
  }
}
