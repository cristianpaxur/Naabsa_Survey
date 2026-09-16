-- Preserva a casa decimal dos campos de tonelagem do Draft Survey e remove
-- falsos positivos legados da IA que interpretavam 81.0 como 81 toneladas,
-- em vez da convenção da planilha de milhares de toneladas.
do $migration$
declare
  rt public.report_types%rowtype;
  previous public.report_specs%rowtype;
  corrected jsonb;
  next_version integer;
  new_id uuid;
begin
  select * into rt
    from public.report_types
    where slug = 'draft_survey'
    for update;
  if not found or rt.active_spec_id is null then return; end if;

  select * into previous
    from public.report_specs
    where id = rt.active_spec_id;
  if not found then return; end if;

  corrected := previous.spec;
  corrected := jsonb_set(
    corrected,
    '{source,common,fields,net_tonnage,decimals}',
    '1'::jsonb
  );
  corrected := jsonb_set(
    corrected,
    '{source,common,fields,gross_tonnage,decimals}',
    '1'::jsonb
  );
  corrected := jsonb_set(
    corrected,
    '{source,common,fields,summer_dwt,decimals}',
    '1'::jsonb
  );
  if corrected = previous.spec then return; end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.report_specs
    where report_type_id = rt.id;
  corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));

  insert into public.report_specs (report_type_id, version, spec)
    values (rt.id, next_version, corrected)
    returning id into new_id;
  update public.report_types
    set active_spec_id = new_id
    where id = rt.id;

  with updated as (
    update public.reports r
      set spec_id = new_id,
          extraction_issues = (
            select coalesce(jsonb_agg(issue order by ord), '[]'::jsonb)
            from jsonb_array_elements(coalesce(r.extraction_issues, '[]'::jsonb))
              with ordinality as items(issue, ord)
            where not (
              issue ->> 'origin' = 'ai'
              and issue ->> 'field' in ('net_tonnage', 'gross_tonnage', 'summer_dwt')
              and (
                issue ->> 'message' ilike '%milhar%'
                or issue ->> 'message' ilike '%truncad%'
              )
            )
          ),
          ai_review = case
            when r.ai_review is null then null
            else jsonb_set(r.ai_review, '{status}', '"stale"'::jsonb, true)
          end
      where r.report_type_id = rt.id
        and r.spec_id = previous.id
        and r.status in ('draft', 'extracted', 'in_review', 'editing')
      returning r.id
  )
  insert into public.audit_log (report_id, action, payload)
    select id, 'report_spec_corrected', jsonb_build_object(
      'previous_spec_id', previous.id,
      'spec_id', new_id,
      'reason', 'tonelagens preservam uma casa decimal e convenção de milhares na revisão por IA'
    ) from updated;

  insert into public.audit_log (action, payload)
    values ('spec_corrected', jsonb_build_object(
      'report_type', 'draft_survey',
      'previous_spec_id', previous.id,
      'spec_id', new_id,
      'version', next_version,
      'reason', 'tonelagens preservam uma casa decimal e convenção de milhares na revisão por IA'
    ));
end;
$migration$;
