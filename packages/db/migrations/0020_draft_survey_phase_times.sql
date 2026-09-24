-- Lê horários das abas de origem; os espelhos da Capa podem não ter cache no XLSX.
do $migration$
declare
  rt public.report_types%rowtype;
  previous public.report_specs%rowtype;
  corrected jsonb;
  next_version integer;
  new_id uuid;
  source record;
begin
  select * into rt from public.report_types where slug = 'draft_survey' for update;
  if not found or rt.active_spec_id is null then return; end if;
  select * into previous from public.report_specs where id = rt.active_spec_id;
  if not found then return; end if;

  corrected := previous.spec;
  for source in
    select * from (values
      ('initial_start', 'M7', 'Inicial', 'G7'),
      ('initial_end', 'N7', 'Inicial', 'H7'),
      ('intermediate_start', 'M8', 'Intermediario', 'G5'),
      ('intermediate_end', 'N8', 'Intermediario', 'H5'),
      ('final_start', 'M9', 'final', 'G5'),
      ('final_end', 'N9', 'final', 'H5')
    ) as fields(name, mirror_cell, source_sheet, source_cell)
  loop
    if corrected #>> array['source', 'common', 'fields', source.name, 'sheet'] = 'Capa'
      and corrected #>> array['source', 'common', 'fields', source.name, 'cell'] = source.mirror_cell then
      corrected := jsonb_set(corrected,
        array['source', 'common', 'fields', source.name, 'sheet'], to_jsonb(source.source_sheet));
      corrected := jsonb_set(corrected,
        array['source', 'common', 'fields', source.name, 'cell'], to_jsonb(source.source_cell));
    end if;
  end loop;
  if corrected = previous.spec then return; end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.report_specs where report_type_id = rt.id;
  corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
  insert into public.report_specs (report_type_id, version, spec)
    values (rt.id, next_version, corrected) returning id into new_id;
  update public.report_types set active_spec_id = new_id where id = rt.id;
  insert into public.audit_log (action, payload) values
    ('spec_corrected', jsonb_build_object(
      'report_type', 'draft_survey', 'previous_spec_id', previous.id,
      'spec_id', new_id, 'version', next_version,
      'reason', 'horários das fases lidos das abas de origem'));
end;
$migration$;
