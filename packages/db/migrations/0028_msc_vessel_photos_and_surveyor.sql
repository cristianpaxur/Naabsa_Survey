-- October 16 client policy: fixed NAABSA surveyor; Hull belongs to Vessel.
-- Copy immutable specs and consolidate assignments only on open reports.
-- Previous spec IDs and photo positions are audited for recovery. Saved data,
-- operator overrides, Word/PDF versions, photo crops and bitmaps are untouched.
-- Run this entire DO statement as the migration owner. The review guard is
-- temporarily restricted to exact, session-private Hull -> Vessel moves, then
-- restored in the same transaction. Other sessions retain the committed guard;
-- a failure rolls back specs, assignments, audit and the function together.
do $migration$
declare
  rt record;
  previous public.report_specs%rowtype;
  corrected jsonb;
  slots jsonb;
  next_version integer;
  new_id uuid;
  moved record;
  report record;
  photo record;
  next_position integer;
  assignments jsonb;
  original_photo_guard text;
  original_lock_timeout text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '5s', true);
  original_photo_guard := pg_get_functiondef('public.guard_photo_edits()'::regprocedure);
  create temporary table msc_vessel_photo_moves (
    photo_id uuid primary key,
    previous_row jsonb not null,
    next_position integer not null
  ) on commit drop;

  -- This is a structural rename, including previously assigned pending photos.
  -- Never change a report's lifecycle to satisfy the interactive review guard:
  -- doing so can invalidate or clear an operator's saved document.
  execute $definition$
    create or replace function public.guard_photo_edits() returns trigger
    language plpgsql set search_path = pg_catalog, public as $guard$
    begin
      if not exists (
        select 1 from pg_temp.msc_vessel_photo_moves plan
        join public.reports r on r.id = old.report_id
        join public.report_types rt on rt.id = r.report_type_id
        join public.report_specs rs on rs.id = r.spec_id
        where plan.photo_id = old.id
          and old.slot_id = 'hull' and old.removed_at is null
          and rt.slug = 'msc' and r.deleted_at is null
          and r.status in ('draft','extracted','in_review','editing')
          and rs.spec -> 'photo_slots' @> '[{"id":"vessel"}]'::jsonb
          and not (rs.spec -> 'photo_slots' @> '[{"id":"hull"}]'::jsonb)
          and plan.previous_row = to_jsonb(old)
          and to_jsonb(new) = plan.previous_row || jsonb_build_object(
            'slot_id','vessel','position',plan.next_position)
      ) then
        raise exception 'Alteração fora do plano de consolidação MSC.';
      end if;
      return new;
    end;
    $guard$;
  $definition$;

  for rt in select * from public.report_types where slug = 'msc' for update loop
    for previous in
      select s.* from public.report_specs s
      where s.report_type_id = rt.id
        and jsonb_typeof(s.spec -> 'photo_slots') = 'array'
        and (s.id = rt.active_spec_id or exists (
          select 1 from public.reports r
          where r.report_type_id = rt.id and r.spec_id = s.id
            and r.status in ('draft','extracted','in_review','editing')
            and r.deleted_at is null
        ))
      order by s.version
    loop
      select coalesce(jsonb_agg(case when slot->>'id' = 'vessel'
        and previous.spec -> 'photo_slots' @> '[{"id":"hull"}]'::jsonb
        then slot - 'max' else slot end order by ordinal), '[]'::jsonb)
      into slots from jsonb_array_elements(previous.spec -> 'photo_slots')
        with ordinality as entries(slot, ordinal)
      where slot->>'id' <> 'hull';
      if not (slots @> '[{"id":"vessel"}]'::jsonb) then
        slots := slots || '[{"id":"vessel","label":"Vessel","aspect":"4:3","required":false}]'::jsonb;
      end if;
      corrected := jsonb_set(previous.spec, '{photo_slots}', slots)
        #- '{source,common,fields,surveyors}';
      if corrected = previous.spec then continue; end if;
      select coalesce(max(version), 0) + 1 into next_version
        from public.report_specs where report_type_id = rt.id;
      corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
      insert into public.report_specs(report_type_id,version,spec)
        values(rt.id,next_version,corrected) returning id into new_id;
      if previous.id = rt.active_spec_id then
        update public.report_types set active_spec_id = new_id where id = rt.id;
        insert into public.audit_log(action,payload) values('msc_vessel_policy_spec_added',
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
          values(moved.id,'msc_vessel_policy_report_spec_updated',
            jsonb_build_object('previous_spec_id',previous.id,'spec_id',new_id));
      end loop;
    end loop;

    for report in
      select r.id from public.reports r
      where r.report_type_id = rt.id
        and r.status in ('draft','extracted','in_review','editing')
        and r.deleted_at is null
        and exists (select 1 from public.report_photos p
          where p.report_id = r.id and p.slot_id = 'hull' and p.removed_at is null)
      for update
    loop
      select coalesce(max(position), -1) + 1 into next_position
        from public.report_photos
        where report_id = report.id and slot_id = 'vessel' and removed_at is null;
      assignments := '[]'::jsonb;
      for photo in
        select * from public.report_photos
        where report_id = report.id and slot_id = 'hull' and removed_at is null
        order by position, id for update
      loop
        assignments := assignments || jsonb_build_array(jsonb_build_object(
          'photo_id',photo.id,'previous_slot','hull','previous_position',photo.position,
          'slot','vessel','position',next_position));
        insert into pg_temp.msc_vessel_photo_moves(photo_id,previous_row,next_position)
          values(photo.id,to_jsonb(photo),next_position);
        update public.report_photos set slot_id = 'vessel', position = next_position
          where id = photo.id;
        delete from pg_temp.msc_vessel_photo_moves where photo_id = photo.id;
        next_position := next_position + 1;
      end loop;
      insert into public.audit_log(report_id,action,payload)
        values(report.id,'msc_hull_photos_consolidated',
          jsonb_build_object('assignments',assignments));
    end loop;
  end loop;
  execute original_photo_guard;
  drop table pg_temp.msc_vessel_photo_moves;
  perform set_config('lock_timeout', original_lock_timeout, true);
end;
$migration$;
