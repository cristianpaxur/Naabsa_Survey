-- Add the two missing disposal quantities without changing saved values or Word.
-- Labels follow shifted Sludge rows; the source is the tank balance, not trucks.
do $migration$
declare
  rt record;
  previous public.report_specs%rowtype;
  corrected jsonb;
  additions constant jsonb := $fields${
    "sludge_disposed": {
      "sheet":"Sludge", "cell":"K24",
      "row_anchor":{"range":"B17:B30","expect":"TOTAL"},
      "type":"number", "decimals":3, "unit":"m³",
      "label":"Quantidade de sludge descartada — tanques", "section":"Sludge"
    },
    "retained_chief": {
      "sheet":"Sludge", "cell":"D34",
      "row_anchor":{"range":"B26:B40","expect":"Sludge retained aft actual disposal"},
      "type":"number", "decimals":3, "unit":"m³",
      "label":"Retido após descarga — comandante", "section":"Sludge"
    }
  }$fields$::jsonb;
  next_version integer;
  new_id uuid;
  moved record;
  attendance jsonb;
  comparison jsonb;
begin
  for rt in select * from public.report_types where slug = 'msc' for update loop
    for previous in
      select s.* from public.report_specs s
      where s.report_type_id = rt.id
        and jsonb_typeof(s.spec #> '{source,common,fields}') = 'object'
        and (s.id = rt.active_spec_id or exists (
          select 1 from public.reports r
          where r.report_type_id = rt.id and r.spec_id = s.id
            and r.status in ('draft','extracted','in_review','editing')
            and r.deleted_at is null
        ))
      order by s.version
    loop
      corrected := jsonb_set(previous.spec, '{source,common,fields}',
        additions || (previous.spec #> '{source,common,fields}'));
      attendance := corrected #> '{source,common,fields,last_attendance}';
      -- Summary B16 contains Yes/No in SABRINA and a date in CAROLINA.
      -- Preserve the source text/date without inferring historical quantities.
      if attendance->>'sheet' = 'Summary' and attendance->>'cell' = 'B16'
        and attendance->>'type' = 'enum'
        and attendance->'options' = '["Yes","No"]'::jsonb
      then
        attendance := (attendance - 'options') || '{"type":"string"}'::jsonb;
        if attendance->>'label' = 'Last attendance?' then
          attendance := jsonb_set(attendance, '{label}',
            to_jsonb('Último atendimento (data ou Yes/No)'::text));
        end if;
        corrected := jsonb_set(corrected,
          '{source,common,fields,last_attendance}', attendance);
      end if;
      comparison := corrected #> '{source,common,fields,sludge_difference_surveyor}';
      if comparison->>'sheet' = 'Sludge' and comparison->>'cell' = 'D40'
        and comparison->>'unit' = 'm³'
        and comparison->'row_anchor' = '{"range":"B37:B52","expect":"Difference btw logbook and FLM"}'::jsonb
      then
        comparison := comparison || '{"unit":"mt"}'::jsonb;
        if comparison->>'label' = 'Diferença de sludge — surveyor' then
          comparison := comparison || '{"label":"Diferença consumo/flowmeter — surveyor","section":"Flowmeter"}'::jsonb;
        end if;
        corrected := jsonb_set(corrected,
          '{source,common,fields,sludge_difference_surveyor}', comparison);
      end if;
      if corrected = previous.spec then continue; end if;
      select coalesce(max(version), 0) + 1 into next_version
        from public.report_specs where report_type_id = rt.id;
      corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
      insert into public.report_specs(report_type_id,version,spec)
        values(rt.id,next_version,corrected) returning id into new_id;
      if previous.id = rt.active_spec_id then
        update public.report_types set active_spec_id = new_id where id = rt.id;
        insert into public.audit_log(action,payload) values('msc_disposal_spec_added',
          jsonb_build_object('previous_spec_id',previous.id,'spec_id',new_id));
      end if;
      for moved in
        update public.reports set spec_id = new_id
        where report_type_id = rt.id and spec_id = previous.id
          and status in ('draft','extracted','in_review','editing')
          and deleted_at is null
        returning id
      loop
        insert into public.audit_log(report_id,action,payload)
          values(moved.id,'msc_disposal_report_spec_updated',
            jsonb_build_object('previous_spec_id',previous.id,'spec_id',new_id));
      end loop;
    end loop;
  end loop;
end;
$migration$;
