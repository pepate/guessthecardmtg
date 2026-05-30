-- Generalize custom_mode → mode. Add kind/slug. Unify card dealing. Rebuild the
-- leaderboard keyed purely by mode_id (existing scores wiped per product decision).

-- 1. Rename table + list view.
alter table public.custom_mode rename to mode;
drop view if exists public.custom_mode_list;

-- 2. Classify modes.
alter table public.mode add column kind text not null default 'custom'
  check (kind in ('builtin','custom','set'));
alter table public.mode add column slug text unique;

-- 3. Wipe + restructure the leaderboard around mode_id only.
-- Drop the dependent view first so the pool column can be removed.
drop view if exists public.leaderboard_top;
delete from public.leaderboard;
alter table public.leaderboard drop constraint if exists leaderboard_pool_check;
alter table public.leaderboard drop constraint if exists leaderboard_mode_id_check;
alter table public.leaderboard drop column if exists pool;
alter table public.leaderboard alter column mode_id set not null;
create view public.leaderboard_top as
  select id, name, score, correct, mode_id, country, created_at from public.leaderboard;
grant select on public.leaderboard_top to anon;

-- 4. mode_list view (replaces custom_mode_list), now exposing kind/slug.
create view public.mode_list as
  select m.id, m.name, m.filter, m.card_count, m.kind, m.slug, m.created_at,
         count(l.id) as entry_count
  from public.mode m left join public.leaderboard l on l.mode_id = m.id
  group by m.id;
grant select on public.mode_list to anon;

-- 5. count_filtered_cards: add the `popular` clause (omitted => no popularity filter).
create or replace function public.count_filtered_cards(p_filter jsonb)
returns int language plpgsql stable as $$
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
  where (p_filter->>'popular' is null or c.is_popular)
    and (p_filter->'cmc'->>'min' is null or c.cmc >= (p_filter->'cmc'->>'min')::real)
    and (p_filter->'cmc'->>'max' is null or c.cmc <= (p_filter->'cmc'->>'max')::real)
    and (p_filter->'edhrec'->>'min' is null or (c.edhrec_rank is not null and c.edhrec_rank >= (p_filter->'edhrec'->>'min')::int))
    and (p_filter->'edhrec'->>'max' is null or (c.edhrec_rank is not null and c.edhrec_rank <= (p_filter->'edhrec'->>'max')::int))
    and (p_filter->'year'->>'min' is null or (c.released_at is not null and c.released_at >= make_date((p_filter->'year'->>'min')::int, 1, 1)))
    and (p_filter->'year'->>'max' is null or (c.released_at is not null and c.released_at < make_date((p_filter->'year'->>'max')::int + 1, 1, 1)))
    and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
    and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
    and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
    and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
    and (v_ub = 'yes' or (coalesce(v_ub, 'no') = 'no' and not c.is_ub) or (v_ub = 'only' and c.is_ub))
    and (cardinality(v_colors) = 0 or (
      (case when v_match = 'all'
            then c.colors @> (select array_agg(x) from unnest(v_colors) x where x <> 'C')
            else c.colors && (select array_agg(x) from unnest(v_colors) x where x <> 'C') end)
      or ('C' = any(v_colors) and (c.colors is null or cardinality(c.colors) = 0))))
    and (cardinality(v_types) = 0 or exists (select 1 from unnest(v_types) t where c.type_line ilike '%' || t || '%'))
    and (cardinality(v_sets) = 0 or exists (select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.set_code = any(v_sets)))
    and (cardinality(v_rar) = 0 or exists (select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.rarity = any(v_rar)));
  return v_count;
end; $$;
grant execute on function public.count_filtered_cards(jsonb) to anon, authenticated;

-- 6. get_filtered_game_cards: the single dealer. Same selection as count, plus the
-- lateral art-join restricted to matching set/rarity printings. Replaces
-- get_game_cards and get_mode_game_cards.
create or replace function public.get_filtered_game_cards(p_filter jsonb, p_count int)
returns table (
  oracle_id uuid, name text, cmc real, colors text[], color_identity text[],
  type_line text, power text, toughness text, rarity text, set_code text,
  set_name text, image_normal text, image_art_crop text
) language plpgsql stable as $$
declare
  v_colors text[] := coalesce(array(select jsonb_array_elements_text(p_filter#>'{colors,values}')), '{}');
  v_match  text := coalesce(p_filter#>>'{colors,match}', 'any');
  v_types  text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'types')), '{}');
  v_sets   text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'sets')), '{}');
  v_rar    text[] := coalesce(array(select jsonb_array_elements_text(p_filter->'rarities')), '{}');
  v_ub     text := p_filter->>'ub';
begin
  return query
  select c.oracle_id, c.name, c.cmc, c.colors, c.color_identity,
         c.type_line, c.power, c.toughness,
         a.rarity, a.set_code, a.set_name, a.image_normal, a.image_art_crop
  from (
    select * from public.card c
    where (p_filter->>'popular' is null or c.is_popular)
      and (p_filter->'cmc'->>'min' is null or c.cmc >= (p_filter->'cmc'->>'min')::real)
      and (p_filter->'cmc'->>'max' is null or c.cmc <= (p_filter->'cmc'->>'max')::real)
      and (p_filter->'edhrec'->>'min' is null or (c.edhrec_rank is not null and c.edhrec_rank >= (p_filter->'edhrec'->>'min')::int))
      and (p_filter->'edhrec'->>'max' is null or (c.edhrec_rank is not null and c.edhrec_rank <= (p_filter->'edhrec'->>'max')::int))
      and (p_filter->'year'->>'min' is null or (c.released_at is not null and c.released_at >= make_date((p_filter->'year'->>'min')::int, 1, 1)))
      and (p_filter->'year'->>'max' is null or (c.released_at is not null and c.released_at < make_date((p_filter->'year'->>'max')::int + 1, 1, 1)))
      and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
      and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
      and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
      and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
      and (v_ub = 'yes' or (coalesce(v_ub, 'no') = 'no' and not c.is_ub) or (v_ub = 'only' and c.is_ub))
      and (cardinality(v_colors) = 0 or (
        (case when v_match = 'all'
              then c.colors @> (select array_agg(x) from unnest(v_colors) x where x <> 'C')
              else c.colors && (select array_agg(x) from unnest(v_colors) x where x <> 'C') end)
        or ('C' = any(v_colors) and (c.colors is null or cardinality(c.colors) = 0))))
      and (cardinality(v_types) = 0 or exists (select 1 from unnest(v_types) t where c.type_line ilike '%' || t || '%'))
      and (cardinality(v_sets) = 0 or exists (select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.set_code = any(v_sets)))
      and (cardinality(v_rar) = 0 or exists (select 1 from public.card_art a where a.oracle_id = c.oracle_id and a.rarity = any(v_rar)))
    order by random()
    limit least(greatest(p_count, 0), 500)
  ) c
  cross join lateral (
    select ca.rarity, ca.set_code, ca.set_name, ca.image_normal, ca.image_art_crop
    from public.card_art ca
    where ca.oracle_id = c.oracle_id
      and (cardinality(v_sets) = 0 or ca.set_code = any(v_sets))
      and (cardinality(v_rar) = 0 or ca.rarity = any(v_rar))
    order by random() limit 1
  ) a;
end; $$;
grant execute on function public.get_filtered_game_cards(jsonb, int) to anon, authenticated;

-- 7. Drop the superseded dealers.
drop function if exists public.get_game_cards(text, int, boolean);
drop function if exists public.get_mode_game_cards(uuid, int);
