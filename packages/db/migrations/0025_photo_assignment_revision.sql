-- A photo update in another session must invalidate an in-flight Word refresh.
alter table public.reports add column if not exists photo_assignment_revision integer not null default 0;

create or replace function public.bump_photo_assignment_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and
    row(new.slot_id,new.position,new.crop,new.processed_path,new.status,new.ai_suggested,new.removed_at)
      is not distinct from
    row(old.slot_id,old.position,old.crop,old.processed_path,old.status,old.ai_suggested,old.removed_at)
    then return new;
  end if;
  if TG_OP = 'DELETE' then
    update public.reports set photo_assignment_revision=photo_assignment_revision+1 where id=old.report_id;
    return old;
  end if;
  update public.reports set photo_assignment_revision=photo_assignment_revision+1 where id=new.report_id;
  return new;
end $$;
drop trigger if exists report_photo_assignment_revision on public.report_photos;
create trigger report_photo_assignment_revision after insert or update or delete on public.report_photos
for each row execute function public.bump_photo_assignment_revision();
