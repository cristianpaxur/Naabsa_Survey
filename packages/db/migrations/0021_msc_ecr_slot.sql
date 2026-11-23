-- 017/F-004: add optional ECR without rewriting frozen field mappings.
-- Clone only specs referenced by an active type or an open report. Historical
-- specs and approved/generated documents remain immutable. Safe to rerun.
do $migration$
declare
  rt record;
  previous public.report_specs%rowtype;
  corrected jsonb;
  next_version integer;
  new_id uuid;
  moved record;
begin
  for rt in select * from public.report_types where slug = 'msc' for update loop
    for previous in
      select s.* from public.report_specs s
      where s.report_type_id = rt.id
        and jsonb_typeof(s.spec -> 'photo_slots') = 'array'
        and not exists (
          select 1 from jsonb_array_elements(case
            when jsonb_typeof(s.spec -> 'photo_slots') = 'array' then s.spec -> 'photo_slots'
            else '[]'::jsonb end) slot
          where slot ->> 'id' = 'ecr'
        )
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
      corrected := jsonb_set(previous.spec, '{photo_slots}',
        (previous.spec -> 'photo_slots') ||
        '[{"id":"ecr","label":"ECR (Engine Control Room)","aspect":"4:3","required":false}]'::jsonb);
      corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
      insert into public.report_specs(report_type_id, version, spec)
        values(rt.id, next_version, corrected) returning id into new_id;

      if previous.id = rt.active_spec_id then
        update public.report_types set active_spec_id = new_id where id = rt.id;
        insert into public.audit_log(action, payload) values('msc_ecr_spec_added',
          jsonb_build_object('previous_spec_id', previous.id, 'spec_id', new_id,
            'version', next_version, 'reason', '017: optional ECR photo slot'));
      end if;
      for moved in
        update public.reports set spec_id = new_id
        where report_type_id = rt.id and spec_id = previous.id
          and status in ('draft', 'extracted', 'in_review', 'editing')
          and deleted_at is null
        returning id
      loop
        insert into public.audit_log(report_id, action, payload)
          values(moved.id, 'msc_ecr_report_spec_updated',
            jsonb_build_object('previous_spec_id', previous.id, 'spec_id', new_id,
              'reason', '017: optional ECR; fields, photos and documents preserved'));
      end loop;
    end loop;
  end loop;
end;
$migration$;
