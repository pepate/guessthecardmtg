-- Custom modes: a user-built filter saved as canonical jsonb. Each mode has its
-- own leaderboard (via leaderboard.mode_id). Writes happen only through the
-- create-mode edge function (service role); reads are public.
create table public.custom_mode (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  filter      jsonb not null,
  filter_hash text not null unique,
  card_count  int  not null,
  created_at  timestamptz not null default now()
);
alter table public.custom_mode enable row level security;
create policy custom_mode_read on public.custom_mode for select using (true);

-- Per-mode leaderboard: reuse the existing locked-down table + submit-score path.
alter table public.leaderboard add column mode_id uuid references public.custom_mode(id);
alter table public.leaderboard drop constraint leaderboard_pool_check;
alter table public.leaderboard add constraint leaderboard_pool_check
  check (pool in ('popular', 'all', 'custom'));
alter table public.leaderboard add constraint leaderboard_mode_id_check
  check ((pool = 'custom') = (mode_id is not null));
create index leaderboard_mode_score_idx
  on public.leaderboard (mode_id, score desc, created_at asc);

-- Recreate the public read view to expose mode_id.
drop view public.leaderboard_top;
create view public.leaderboard_top as
  select id, name, score, correct, pool, mode_id, country, created_at
  from public.leaderboard;
grant select on public.leaderboard_top to anon;

-- Landing list: every mode + its leaderboard entry count, for popularity sort.
create view public.custom_mode_list as
  select m.id, m.name, m.filter, m.card_count, m.created_at,
         count(l.id) as entry_count
  from public.custom_mode m
  left join public.leaderboard l on l.mode_id = m.id
  group by m.id;
grant select on public.custom_mode_list to anon;

-- Count cards matching a filter. Used for the live builder preview and the >=100
-- creation gate. Values are read out of jsonb and bound as typed locals; column
-- identifiers are fixed here (no dynamic identifier concatenation).
create or replace function public.count_filtered_cards(p_filter jsonb)
returns int
language plpgsql
stable
as $$
declare
  v_count int;
  v_colors text[] := coalesce(array(select jsonb_array_elements_text(p_filter#>'{colors,values}')), '{}');
  v_match  text := coalesce(p_filter#>>'{colors,match}', 'any');
  v_types  text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'types')), '{}');
  v_sets   text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'sets')), '{}');
  v_rar    text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'rarities')), '{}');
  v_ub     text := p_filter->>'ub';
begin
  select count(*) into v_count
  from public.card c
  where (p_filter->'cmc'->>'min' is null or c.cmc >= (p_filter->'cmc'->>'min')::real)
    and (p_filter->'cmc'->>'max' is null or c.cmc <= (p_filter->'cmc'->>'max')::real)
    and (p_filter->'edhrec'->>'min' is null or (c.edhrec_rank is not null and c.edhrec_rank >= (p_filter->'edhrec'->>'min')::int))
    and (p_filter->'edhrec'->>'max' is null or (c.edhrec_rank is not null and c.edhrec_rank <= (p_filter->'edhrec'->>'max')::int))
    -- Power/Toughness: guarded numeric cast; non-numeric (* / 1+*) excluded from ranges.
    and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
    and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
    and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
    and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
    -- UB
    and (v_ub is null or v_ub = 'yes'
         or (v_ub = 'no' and not c.is_ub)
         or (v_ub = 'only' and c.is_ub))
    -- Colors: 'any' => overlap, 'all' => contains. Colorless 'C' => empty colors[].
    and (
      cardinality(v_colors) = 0
      or (
        (case when v_match = 'all'
              then c.colors @> (select array_agg(x) from unnest(v_colors) x where x <> 'C')
              else c.colors && (select array_agg(x) from unnest(v_colors) x where x <> 'C')
         end)
        or ('C' = any(v_colors) and (c.colors is null or cardinality(c.colors) = 0))
      )
    )
    -- Types: OR of substring matches on type_line.
    and (cardinality(v_types) = 0 or exists (
      select 1 from unnest(v_types) t where c.type_line ilike '%' || t || '%'
    ))
    -- Sets / rarity live on printings (card_art).
    and (cardinality(v_sets) = 0 or exists (
      select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.set_code = any(v_sets)
    ))
    and (cardinality(v_rar) = 0 or exists (
      select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.rarity = any(v_rar)
    ));
  return v_count;
end;
$$;
grant execute on function public.count_filtered_cards(jsonb) to anon, authenticated;
