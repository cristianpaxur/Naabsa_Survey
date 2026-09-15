-- Corrige a unidade do percentual de diferença final no Draft Survey.
-- A planilha já entrega pontos percentuais: 0.362 significa 0.362%, não 36.2%.
-- Cria uma spec nova e só move relatórios ainda em andamento que usam a spec ativa anterior.
do $migration$
declare
  rt public.report_types%rowtype;
  previous public.report_specs%rowtype;
  corrected jsonb;
  validations jsonb;
  next_version integer;
  new_id uuid;
begin
  select * into rt from public.report_types where slug = 'draft_survey' for update;
  if not found or rt.active_spec_id is null then return; end if;

  select * into previous from public.report_specs where id = rt.active_spec_id;
  if not found or jsonb_typeof(previous.spec -> 'validations') <> 'array' then return; end if;

  select jsonb_agg(
    case
      when rule ->> 'field' = 'fin_fig_diff_pct'
        and rule ->> 'rule' = 'range'
        and rule ->> 'message' = 'Diferença final acima de 0,5% entre figuras — revisar antes de aprovar.'
        and rule -> 'min' in ('-0.05'::jsonb, '-0.005'::jsonb)
        and rule -> 'max' in ('0.05'::jsonb, '0.005'::jsonb)
      then rule || '{"min":-0.5,"max":0.5,"message":"Diferença final fora do limite de ±0,5% entre figuras — revisar antes de aprovar."}'::jsonb
      else rule
    end order by ord
  ) into validations
  from jsonb_array_elements(previous.spec -> 'validations') with ordinality as items(rule, ord);

  corrected := jsonb_set(previous.spec, '{validations}', coalesce(validations, '[]'::jsonb));
  if corrected = previous.spec then return; end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.report_specs where report_type_id = rt.id;
  corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
  insert into public.report_specs (report_type_id, version, spec)
    values (rt.id, next_version, corrected) returning id into new_id;
  update public.report_types set active_spec_id = new_id where id = rt.id;

  with updated as (
    update public.reports
      set spec_id = new_id
      where report_type_id = rt.id
        and spec_id = previous.id
        and status in ('draft', 'extracted', 'in_review', 'editing')
      returning id
  )
  insert into public.audit_log (report_id, action, payload)
    select id, 'report_spec_corrected', jsonb_build_object(
      'previous_spec_id', previous.id,
      'spec_id', new_id,
      'reason', 'percentual de diferença final usa pontos percentuais; limite corrigido para ±0,5%'
    ) from updated;

  insert into public.audit_log (action, payload) values ('spec_corrected', jsonb_build_object(
    'report_type', 'draft_survey',
    'previous_spec_id', previous.id,
    'spec_id', new_id,
    'version', next_version,
    'reason', 'percentual de diferença final usa pontos percentuais; limite corrigido para ±0,5%'
  ));
end;
$migration$;
