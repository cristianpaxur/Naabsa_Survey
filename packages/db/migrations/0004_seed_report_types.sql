-- 0004_seed_report_types.sql — seed dos 5 tipos de relatório (PRD §3.1).
-- Idempotente: on conflict (slug) do nothing.

insert into report_types (slug, name, variants) values
  ('draft_survey',    'Draft Survey',    array['loading','discharge']),
  ('bunker_surveyor', 'Bunker Surveyor', array['loading','discharge']),
  ('msc',             'MSC',             array[]::text[]),
  ('on_off_hire',     'On/Off-Hire',     array['on_hire','off_hire']),
  ('rob',             'ROB',             array[]::text[])
on conflict (slug) do nothing;
