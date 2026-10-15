-- Add missing MSC quantity mappings without replacing customized definitions.
do $migration$
declare
  rt record;
  previous public.report_specs%rowtype;
  corrected jsonb;
  additions jsonb := $fields${
  "vrs_updated": {
    "sheet": "Time Log",
    "cell": "G32",
    "type": "string",
    "label": "VRS atualizado",
    "section": "Documentos"
  },
  "logbook_updated": {
    "sheet": "Time Log",
    "cell": "C33",
    "type": "string",
    "label": "Logbook atualizado",
    "section": "Documentos"
  },
  "grade_1_surveyor": {
    "sheet": "Qtt Sumary",
    "cell": "F11",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 1 — surveyor",
    "section": "Quantidades"
  },
  "grade_1_vrs": {
    "sheet": "Qtt Sumary",
    "cell": "F12",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 1 — VRS",
    "section": "Quantidades"
  },
  "grade_1_difference": {
    "sheet": "Qtt Sumary",
    "cell": "F13",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 1 — diferença",
    "section": "Quantidades"
  },
  "grade_1_percentage": {
    "sheet": "Qtt Sumary",
    "cell": "F14",
    "type": "number",
    "decimals": 2,
    "unit": "%",
    "label": "Grade 1 — percentual",
    "section": "Quantidades"
  },
  "grade_2_surveyor": {
    "sheet": "Qtt Sumary",
    "cell": "F16",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 2 — surveyor",
    "section": "Quantidades"
  },
  "grade_2_vrs": {
    "sheet": "Qtt Sumary",
    "cell": "F17",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 2 — VRS",
    "section": "Quantidades"
  },
  "grade_2_difference": {
    "sheet": "Qtt Sumary",
    "cell": "F18",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 2 — diferença",
    "section": "Quantidades"
  },
  "grade_2_percentage": {
    "sheet": "Qtt Sumary",
    "cell": "F19",
    "type": "number",
    "decimals": 2,
    "unit": "%",
    "label": "Grade 2 — percentual",
    "section": "Quantidades"
  },
  "grade_3_surveyor": {
    "sheet": "Qtt Sumary",
    "cell": "F21",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 3 — surveyor",
    "section": "Quantidades"
  },
  "grade_3_vrs": {
    "sheet": "Qtt Sumary",
    "cell": "F22",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 3 — VRS",
    "section": "Quantidades"
  },
  "grade_3_difference": {
    "sheet": "Qtt Sumary",
    "cell": "F23",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 3 — diferença",
    "section": "Quantidades"
  },
  "grade_3_percentage": {
    "sheet": "Qtt Sumary",
    "cell": "F24",
    "type": "number",
    "decimals": 2,
    "unit": "%",
    "label": "Grade 3 — percentual",
    "section": "Quantidades"
  },
  "grade_4_surveyor": {
    "sheet": "Qtt Sumary",
    "cell": "F26",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 4 — surveyor",
    "section": "Quantidades"
  },
  "grade_4_vrs": {
    "sheet": "Qtt Sumary",
    "cell": "F27",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 4 — VRS",
    "section": "Quantidades"
  },
  "grade_4_difference": {
    "sheet": "Qtt Sumary",
    "cell": "F28",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Grade 4 — diferença",
    "section": "Quantidades"
  },
  "grade_4_percentage": {
    "sheet": "Qtt Sumary",
    "cell": "F29",
    "type": "number",
    "decimals": 2,
    "unit": "%",
    "label": "Grade 4 — percentual",
    "section": "Quantidades"
  },
  "sludge_surveyor": {
    "sheet": "Qtt Sumary",
    "cell": "F31",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Sludge — surveyor",
    "section": "Sludge"
  },
  "sludge_berthing": {
    "sheet": "Qtt Sumary",
    "cell": "F32",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Sludge — berthing report",
    "section": "Sludge"
  },
  "sludge_difference": {
    "sheet": "Qtt Sumary",
    "cell": "F33",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Sludge — diferença",
    "section": "Sludge"
  },
  "sludge_percentage": {
    "sheet": "Qtt Sumary",
    "cell": "F34",
    "type": "number",
    "decimals": 2,
    "unit": "%",
    "label": "Sludge — percentual",
    "section": "Sludge"
  },
  "last_discharge_date": {
    "sheet": "Sludge",
    "cell": "D27",
    "type": "date",
    "format": "YYYY-MM-DD",
    "label": "Última descarga",
    "section": "Sludge"
  },
  "last_discharge_quantity": {
    "sheet": "Sludge",
    "cell": "D28",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Última descarga — quantidade",
    "section": "Sludge"
  },
  "retained_after_last_discharge": {
    "sheet": "Sludge",
    "cell": "D29",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Retido após última descarga",
    "section": "Sludge"
  },
  "sludge_generated_chief": {
    "sheet": "Sludge",
    "cell": "D31",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Sludge gerado — comandante",
    "section": "Sludge"
  },
  "consumption_chief": {
    "sheet": "Sludge",
    "cell": "D32",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Consumo — comandante",
    "section": "Sludge"
  },
  "sludge_rate_chief": {
    "sheet": "Sludge",
    "cell": "D33",
    "type": "number",
    "decimals": 3,
    "unit": "%",
    "label": "Taxa de sludge — comandante",
    "section": "Sludge"
  },
  "retained_surveyor": {
    "sheet": "Sludge",
    "cell": "D37",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Sludge ROB — surveyor",
    "section": "Sludge"
  },
  "sludge_generated_surveyor": {
    "sheet": "Sludge",
    "cell": "D38",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Sludge gerado — surveyor",
    "section": "Sludge"
  },
  "consumption_surveyor": {
    "sheet": "Sludge",
    "cell": "D39",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Consumo — surveyor",
    "section": "Sludge"
  },
  "sludge_difference_surveyor": {
    "sheet": "Sludge",
    "cell": "D40",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Diferença de sludge — surveyor",
    "section": "Sludge"
  },
  "sludge_rate_surveyor": {
    "sheet": "Sludge",
    "cell": "D41",
    "type": "number",
    "decimals": 3,
    "unit": "%",
    "label": "Taxa de sludge — surveyor",
    "section": "Sludge"
  },
  "retained_after_discharge": {
    "sheet": "Sludge",
    "cell": "D42",
    "type": "number",
    "decimals": 3,
    "unit": "m³",
    "label": "Retido após descarga",
    "section": "Sludge"
  },
  "flowmeter_logbook_total": {
    "sheet": "LOG Audit",
    "cell": "E36",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Total logbook",
    "section": "Flowmeter"
  },
  "flowmeter_total": {
    "sheet": "LOG Audit",
    "cell": "E37",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Total flowmeter",
    "section": "Flowmeter"
  },
  "flowmeter_difference": {
    "sheet": "LOG Audit",
    "cell": "E38",
    "type": "number",
    "decimals": 3,
    "unit": "mt",
    "label": "Diferença flowmeter",
    "section": "Flowmeter"
  },
  "flowmeter_accuracy": {
    "sheet": "LOG Audit",
    "cell": "E39",
    "type": "number",
    "decimals": 2,
    "unit": "%",
    "label": "Acurácia flowmeter",
    "section": "Flowmeter"
  }
}$fields$::jsonb;
  next_version integer;
  new_id uuid;
  moved record;
begin
  for rt in select * from public.report_types where slug = 'msc' for update loop
    for previous in
      select s.* from public.report_specs s
      where s.report_type_id = rt.id
        and jsonb_typeof(s.spec #> ARRAY['source','common','fields']) = 'object'
        and exists (select 1 from jsonb_object_keys(additions) as needed(key)
          where not ((s.spec #> ARRAY['source','common','fields']) ? needed.key))
        and (s.id = rt.active_spec_id or exists (
          select 1 from public.reports r
          where r.report_type_id = rt.id and r.spec_id = s.id
            and r.status in ('draft', 'extracted', 'in_review', 'editing')
            and r.deleted_at is null
        ))
      order by s.version
    loop
      select coalesce(max(version), 0) + 1 into next_version
        from public.report_specs where report_type_id = rt.id;
      corrected := jsonb_set(previous.spec, '{source,common,fields}',
        additions || (previous.spec #> '{source,common,fields}'));
      corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
      insert into public.report_specs(report_type_id, version, spec)
        values(rt.id, next_version, corrected) returning id into new_id;
      if previous.id = rt.active_spec_id then
        update public.report_types set active_spec_id = new_id where id = rt.id;
        insert into public.audit_log(action, payload) values('msc_quantity_spec_added',
          jsonb_build_object('previous_spec_id', previous.id, 'spec_id', new_id));
      end if;
      for moved in
        update public.reports set spec_id = new_id
        where report_type_id = rt.id and spec_id = previous.id
          and status in ('draft', 'extracted', 'in_review', 'editing')
          and deleted_at is null
        returning id
      loop
        insert into public.audit_log(report_id, action, payload)
          values(moved.id, 'msc_quantity_report_spec_updated',
            jsonb_build_object('previous_spec_id', previous.id, 'spec_id', new_id));
      end loop;
    end loop;
  end loop;
end;
$migration$;
