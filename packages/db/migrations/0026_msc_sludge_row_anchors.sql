-- Use labels for stock Sludge sources in NEW reports only.
-- Deploy core/web/worker with row_anchor.aliases support before applying.
-- Existing reports, extracted values, overrides and documents stay frozen.
do $migration$
declare
  rt record;
  previous public.report_specs%rowtype;
  corrected jsonb;
  sources constant jsonb := $sources${
    "purifier_temp":{"cell":"K29","anchor":{"range":"H29:H40","expect":"Temperature (°C)"}},
    "purifier_flow":{"cell":"K30","anchor":{"range":"H29:H40","expect":"Flow setting by each purifier (1 x 1,1m3)"}},
    "purifier_bowl_freq":{"cell":"K31","anchor":{"range":"H29:H40","expect":"Bowl disch freq. in minutes (60;120)","aliases":["Bowl disch freq in minutes (60;120)"]}},
    "last_discharge_date":{"cell":"D27","anchor":{"range":"B26:B36","expect":"Sludge - Last Disposal Date"}},
    "last_discharge_quantity":{"cell":"D28","anchor":{"range":"B26:B36","expect":"Sludge - Last Disposal"}},
    "retained_after_last_discharge":{"cell":"D29","anchor":{"range":"B26:B36","expect":"Sludge Retained Aft Last Disposal"}},
    "sludge_generated_chief":{"cell":"D31","anchor":{"range":"B26:B36","expect":"Sludge Production"}},
    "consumption_chief":{"cell":"D32","anchor":{"range":"B26:B36","expect":"Log book Consumption"}},
    "sludge_rate_chief":{"cell":"D33","anchor":{"range":"B26:B36","expect":"Sludge Rate Production"}},
    "retained_surveyor":{"cell":"D37","anchor":{"range":"B37:B52","expect":"Sludge ROB at berthing"}},
    "sludge_generated_surveyor":{"cell":"D38","anchor":{"range":"B37:B52","expect":"Sludge Production"}},
    "consumption_surveyor":{"cell":"D39","anchor":{"range":"B37:B52","expect":"Log book Consumption"}},
    "sludge_difference_surveyor":{"cell":"D40","anchor":{"range":"B37:B52","expect":"Difference btw logbook and FLM"}},
    "sludge_rate_surveyor":{"cell":"D41","anchor":{"range":"B37:B52","expect":"Sludge Rate Production"}},
    "retained_after_discharge":{"cell":"D42","anchor":{"range":"B37:B52","expect":"Sludge retained"}}
  }$sources$::jsonb;
  field_name text;
  source_def jsonb;
  existing_anchor jsonb;
  next_version integer;
  new_id uuid;
begin
  for rt in select * from public.report_types where slug = 'msc' for update loop
    select * into previous from public.report_specs
      where id = rt.active_spec_id and report_type_id = rt.id;
    if not found then raise exception 'MSC active spec is missing'; end if;
    corrected := previous.spec;
    for field_name, source_def in select key, value from jsonb_each(sources) loop
      -- A different cell, sheet or anchor is an operator customization.
      if corrected #>> array['source','common','fields',field_name,'sheet'] is distinct from 'Sludge'
        or corrected #>> array['source','common','fields',field_name,'cell'] is distinct from source_def->>'cell'
      then continue; end if;
      existing_anchor := corrected #> array['source','common','fields',field_name,'row_anchor'];
      if existing_anchor is not null
        and existing_anchor <> source_def->'anchor'
        and existing_anchor <> ((source_def->'anchor') - 'aliases')
      then continue; end if;
      corrected := jsonb_set(corrected, array['source','common','fields',field_name,'row_anchor'], source_def->'anchor');
    end loop;
    if corrected = previous.spec then continue; end if;
    select coalesce(max(version), 0) + 1 into next_version
      from public.report_specs where report_type_id = rt.id;
    corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
    insert into public.report_specs(report_type_id,version,spec)
      values(rt.id,next_version,corrected) returning id into new_id;
    update public.report_types set active_spec_id = new_id where id = rt.id;
    insert into public.audit_log(action,payload) values('msc_sludge_sources_added',
      jsonb_build_object('previous_spec_id',previous.id,'spec_id',new_id,'version',next_version,
        'reason','018: match Sludge labels; existing reports preserved'));
  end loop;
end;
$migration$;
