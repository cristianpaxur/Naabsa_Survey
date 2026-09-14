-- Fotos: decisões humanas prevalecem, remoção preserva blobs já referenciados.
alter table public.report_photos
  add column if not exists ai_status text not null default 'idle'
    check (ai_status in ('idle','pending','running','done','error')),
  add column if not exists ai_request_id uuid,
  add column if not exists ai_run_id uuid,
  add column if not exists ai_job_id uuid,
  add column if not exists ai_attempt integer not null default -1,
  add column if not exists ai_error text,
  add column if not exists removed_at timestamptz;
alter table public.reports add column if not exists photo_review_revision integer not null default 0;

create or replace function public.bump_photo_review_revision() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status or new.spec_id is distinct from old.spec_id then
    new.photo_review_revision := old.photo_review_revision + 1;
  end if;
  return new;
end $$;
drop trigger if exists reports_photo_review_revision on public.reports;
create trigger reports_photo_review_revision before update on public.reports
for each row execute function public.bump_photo_review_revision();

-- O lock serializa alocação/remoção com a saída da revisão.
create or replace function public.guard_photo_edits() returns trigger
language plpgsql set search_path = public as $$
declare stage text; selected_spec uuid; slot_max integer; slot_count integer;
begin
  select status, spec_id into stage, selected_spec from public.reports where id = new.report_id for update;
  if stage <> 'in_review' then
    raise exception 'Fotos só podem ser organizadas durante a revisão.';
  end if;
  if new.slot_id is not null and new.removed_at is null then
    if new.status <> 'done' then raise exception 'Aguarde o processamento da foto.'; end if;
    select (s->>'max')::integer into slot_max
      from public.report_specs rs, jsonb_array_elements(rs.spec->'photo_slots') s
      where rs.id=selected_spec and s->>'id'=new.slot_id;
    if not found then raise exception 'Slot inválido.'; end if;
    select count(*) into slot_count from public.report_photos
      where report_id=new.report_id and slot_id=new.slot_id and id<>new.id and removed_at is null;
    if slot_max is not null and slot_count>=slot_max then raise exception 'Slot cheio.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists report_photos_guard_edits on public.report_photos;
create trigger report_photos_guard_edits before update of slot_id, position, crop, ai_suggested, confirmed_by, removed_at
on public.report_photos for each row execute function public.guard_photo_edits();

-- Somente o worker pode publicar uma sugestão; operador confirma via RLS.
create or replace function public.apply_photo_suggestion(
  p_report_id uuid, p_photo_id uuid, p_request_id uuid, p_revision integer,
  p_slot_id text, p_flags text[]
) returns boolean language plpgsql security definer set search_path = public as $$
declare r public.reports%rowtype; max_photos integer; used integer; next_position integer;
begin
  select * into r from public.reports where id = p_report_id for update;
  if not found or r.status <> 'in_review' or r.photo_review_revision <> p_revision then return false; end if;
  if p_slot_id is not null then
    select (s->>'max')::integer into max_photos
    from public.report_specs rs, jsonb_array_elements(rs.spec->'photo_slots') s
    where rs.id = r.spec_id and s->>'id' = p_slot_id;
    if not found then p_slot_id := null;
    else
      select count(*), coalesce(max(position),-1)+1 into used, next_position from public.report_photos
      where report_id=p_report_id and slot_id=p_slot_id and removed_at is null;
      if max_photos is not null and used >= max_photos then p_slot_id := null; end if;
    end if;
  end if;
  update public.report_photos set slot_id=p_slot_id, position=coalesce(next_position,0),
    ai_suggested=(p_slot_id is not null), quality_flags=p_flags, ai_status='done', ai_error=null
  where id=p_photo_id and report_id=p_report_id and ai_request_id=p_request_id
    and ai_status='running' and confirmed_by is null and slot_id is null
    and removed_at is null and status='done';
  return found;
end $$;
revoke all on function public.apply_photo_suggestion(uuid,uuid,uuid,integer,text,text[]) from public, anon, authenticated;
grant execute on function public.apply_photo_suggestion(uuid,uuid,uuid,integer,text,text[]) to service_role;
