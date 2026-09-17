-- Ignora integralmente os campos de diferença calculados pela planilha e
-- exibe as tonelagens com três casas decimais, inclusive em relatórios abertos.
do $migration$
declare
  rt public.report_types%rowtype;
  previous public.report_specs%rowtype;
  corrected jsonb;
  validations jsonb;
  next_version integer;
  new_id uuid;
  created_spec boolean := false;
  changed_reports integer := 0;
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
  corrected := jsonb_set(corrected, '{source,common,fields,net_tonnage,decimals}', '3'::jsonb);
  corrected := jsonb_set(corrected, '{source,common,fields,gross_tonnage,decimals}', '3'::jsonb);
  corrected := jsonb_set(corrected, '{source,common,fields,summer_dwt,decimals}', '3'::jsonb);
  corrected := jsonb_set(corrected, '{source,common,fields,int_fig_diff_mt,ai_review}', 'false'::jsonb);
  corrected := jsonb_set(corrected, '{source,common,fields,int_fig_diff_pct,ai_review}', 'false'::jsonb);
  corrected := jsonb_set(corrected, '{source,common,fields,fin_fig_diff_mt,ai_review}', 'false'::jsonb);
  corrected := jsonb_set(corrected, '{source,common,fields,fin_fig_diff_pct,ai_review}', 'false'::jsonb);

  select jsonb_agg(rule order by ord) into validations
  from jsonb_array_elements(coalesce(corrected -> 'validations', '[]'::jsonb))
    with ordinality as items(rule, ord)
  where coalesce(rule ->> 'field', '') not in (
      'int_fig_diff_mt',
      'int_fig_diff_pct',
      'fin_fig_diff_mt',
      'fin_fig_diff_pct'
    )
    and coalesce(rule ->> 'left', '') not in (
      'int_fig_diff_mt',
      'int_fig_diff_pct',
      'fin_fig_diff_mt',
      'fin_fig_diff_pct'
    );
  corrected := jsonb_set(
    corrected,
    '{validations}',
    coalesce(validations, '[]'::jsonb)
  );

  if corrected <> previous.spec then
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
    created_spec := true;
  else
    new_id := previous.id;
    next_version := previous.version;
  end if;

  with candidates as (
    select r.id, r.spec_id as previous_spec_id
    from public.reports r
    where r.report_type_id = rt.id
      and r.status in ('draft', 'extracted', 'in_review', 'editing')
      and (
        r.spec_id <> new_id
        or exists (
          select 1
          from jsonb_array_elements(coalesce(r.extraction_issues, '[]'::jsonb)) issue
          where issue ->> 'field' in (
            'int_fig_diff_mt',
            'int_fig_diff_pct',
            'fin_fig_diff_mt',
            'fin_fig_diff_pct'
          )
        )
      )
  ), updated as (
    update public.reports r
      set spec_id = new_id,
          extraction_issues = (
            select coalesce(jsonb_agg(issue order by ord), '[]'::jsonb)
            from jsonb_array_elements(coalesce(r.extraction_issues, '[]'::jsonb))
              with ordinality as items(issue, ord)
            where issue ->> 'field' not in (
              'int_fig_diff_mt',
              'int_fig_diff_pct',
              'fin_fig_diff_mt',
              'fin_fig_diff_pct'
            )
          )
      from candidates c
      where r.id = c.id
      returning r.id, c.previous_spec_id
  )
  insert into public.audit_log (report_id, action, payload)
    select id, 'report_spec_corrected', jsonb_build_object(
      'previous_spec_id', previous_spec_id,
      'spec_id', new_id,
      'reason', 'diferenças calculadas ignoradas e tonelagens exibidas com três casas decimais'
    ) from updated;
  get diagnostics changed_reports = row_count;

  if created_spec or changed_reports > 0 then
    insert into public.audit_log (action, payload)
      values ('spec_corrected', jsonb_build_object(
        'report_type', 'draft_survey',
        'previous_spec_id', previous.id,
        'spec_id', new_id,
        'version', next_version,
        'reports_updated', changed_reports,
        'reason', 'diferenças calculadas ignoradas e tonelagens exibidas com três casas decimais'
      ));
  end if;
end;
$migration$;
