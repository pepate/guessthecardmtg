-- Reveal-mode toggles: one row per implemented mode; the app reads enabled rows
-- at game start and rotates only through them (falls back to blur/scanner/mosaic).
create table if not exists reveal_mode (
  key         text primary key,
  enabled     boolean not null default true,
  sort_order  int not null default 0,
  label       text
);

alter table reveal_mode enable row level security;

drop policy if exists "reveal_mode public read" on reveal_mode;
create policy "reveal_mode public read" on reveal_mode
  for select to anon using (true);

insert into reveal_mode (key, enabled, sort_order, label) values
  ('blur',       true, 0, 'Blur'),
  ('scanner',    true, 1, 'Scanner'),
  ('mosaic',     true, 2, 'Mosaic'),
  ('zoom',       true, 3, 'Zoom'),
  ('silhouette', true, 4, 'Silhouette'),
  ('spotlight',  true, 5, 'Spotlight')
on conflict (key) do nothing;
