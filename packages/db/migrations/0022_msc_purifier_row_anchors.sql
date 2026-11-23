-- 017/T-006: activate label-based purifier sources for new reports only.
-- Must run after the worker/core supports row_anchor; existing reports stay frozen.
do $migration$
declare
  rt record;
  previous public.report_specs%rowtype;
  corrected jsonb;
  anchors constant jsonb := '{
    "purifier_temp": {"range":"H29:H40","expect":"Temperature (°C)"},
    "purifier_flow": {"range":"H29:H40","expect":"Flow setting by each purifier (1 x 1,1m3)"},
    "purifier_bowl_freq": {"range":"H29:H40","expect":"Bowl disch freq. in minutes (60;120)"}
  }'::jsonb;
  field_name text;
  anchor jsonb;
  next_version integer;
  new_id uuid;
begin
  for rt in select * from public.report_types where slug = 'msc' for update loop
    select * into previous from public.report_specs
      where id = rt.active_spec_id and report_type_id = rt.id;
    if not found then raise exception 'MSC active spec is missing'; end if;
    corrected := previous.spec;
    for field_name, anchor in select key, value from jsonb_each(anchors) loop
      if corrected #>> array['source','common','fields',field_name,'sheet'] is distinct from 'Sludge'
        or corrected #>> array['source','common','fields',field_name,'cell'] is distinct from
          (case field_name when 'purifier_temp' then 'K29' when 'purifier_flow' then 'K30' else 'K31' end)
      then raise exception 'Unrecognized MSC source for %; review before migration', field_name; end if;
      if corrected #> array['source','common','fields',field_name,'row_anchor'] is not null
        and corrected #> array['source','common','fields',field_name,'row_anchor'] <> anchor
      then raise exception 'Custom row anchor for %; review before migration', field_name; end if;
      corrected := jsonb_set(corrected, array['source','common','fields',field_name,'row_anchor'], anchor);
    end loop;
    if corrected = previous.spec then continue; end if;
    select coalesce(max(version), 0) + 1 into next_version
      from public.report_specs where report_type_id = rt.id;
    corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
    insert into public.report_specs(report_type_id, version, spec)
      values(rt.id, next_version, corrected) returning id into new_id;
    update public.report_types set active_spec_id = new_id where id = rt.id;
    insert into public.audit_log(action, payload) values('msc_purifier_sources_added',
      jsonb_build_object('previous_spec_id', previous.id, 'spec_id', new_id,
        'version', next_version, 'reason', '017: match purifier labels; existing reports preserved'));
  end loop;
end;
$migration$;
