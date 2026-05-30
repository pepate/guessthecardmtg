-- Sets list (from Scryfall /sets) + per-card debut date. Enables the builder's
-- set-name autocomplete and a release-year filter. Public read; writes are
-- service-role only (seed script).
create table public.card_set (
  code        text primary key,
  name        text not null,
  released_at date,
  set_type    text,
  card_count  int
);
alter table public.card_set enable row level security;
create policy card_set_read on public.card_set for select using (true);
grant select on public.card_set to anon, authenticated;

-- A card's debut date = earliest release among its printings' sets. Stored
-- (not computed per-query) so the year filter stays index-friendly.
alter table public.card add column released_at date;
create index card_released_at_idx on public.card (released_at);

-- Recreate count_filtered_cards: + year range, + flipped UB default.
-- UB: omitted/'no' => exclude UB; 'yes' => include all; 'only' => UB only.
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
    and (p_filter->'year'->>'min' is null or (c.released_at is not null and c.released_at >= make_date((p_filter->'year'->>'min')::int, 1, 1)))
    and (p_filter->'year'->>'max' is null or (c.released_at is not null and c.released_at < make_date((p_filter->'year'->>'max')::int + 1, 1, 1)))
    and (p_filter->'power'->>'min' is null or (c.power ~ '^[0-9]+$' and c.power::int >= (p_filter->'power'->>'min')::int))
    and (p_filter->'power'->>'max' is null or (c.power ~ '^[0-9]+$' and c.power::int <= (p_filter->'power'->>'max')::int))
    and (p_filter->'toughness'->>'min' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int >= (p_filter->'toughness'->>'min')::int))
    and (p_filter->'toughness'->>'max' is null or (c.toughness ~ '^[0-9]+$' and c.toughness::int <= (p_filter->'toughness'->>'max')::int))
    and (v_ub = 'yes' or (coalesce(v_ub, 'no') = 'no' and not c.is_ub) or (v_ub = 'only' and c.is_ub))
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
    and (cardinality(v_types) = 0 or exists (
      select 1 from unnest(v_types) t where c.type_line ilike '%' || t || '%'
    ))
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

-- Recreate get_mode_game_cards with the same year + UB changes in the inner filter.
create or replace function public.get_mode_game_cards(p_mode_id uuid, p_count int)
returns table (
  oracle_id uuid, name text, cmc real, colors text[], color_identity text[],
  type_line text, power text, toughness text, rarity text, set_code text,
  set_name text, image_normal text, image_art_crop text
)
language plpgsql
stable
as $$
declare
  p_filter jsonb;
  v_colors text[];
  v_match text; v_types text[]; v_sets text[]; v_rar text[]; v_ub text;
begin
  select filter into p_filter from public.custom_mode where id = p_mode_id;
  if p_filter is null then return; end if;
  v_colors := coalesce(array(select jsonb_array_elements_text(p_filter#>'{colors,values}')), '{}');
  v_match  := coalesce(p_filter#>>'{colors,match}', 'any');
  v_types  := coalesce(array(select jsonb_array_elements_text(p_filter->'types')), '{}');
  v_sets   := coalesce(array(select jsonb_array_elements_text(p_filter->'sets')), '{}');
  v_rar    := coalesce(array(select jsonb_array_elements_text(p_filter->'rarities')), '{}');
  v_ub     := p_filter->>'ub';

  return query
  select c.oracle_id, c.name, c.cmc, c.colors, c.color_identity,
         c.type_line, c.power, c.toughness,
         a.rarity, a.set_code, a.set_name, a.image_normal, a.image_art_crop
  from (
    select * from public.card c
    where (p_filter->'cmc'->>'min' is null or c.cmc >= (p_filter->'cmc'->>'min')::real)
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
    order by random()
    limit 1
  ) a;
end;
$$;
grant execute on function public.get_mode_game_cards(uuid, int) to anon, authenticated;

-- Recompute each card's debut date from its printings. Idempotent; run after
-- card_set is (re)populated.
create or replace function public.backfill_card_released_at()
returns void
language sql
as $$
  update public.card c
  set released_at = sub.debut
  from (
    select a.oracle_id, min(s.released_at) as debut
    from public.card_art a
    join public.card_set s on s.code = a.set_code
    group by a.oracle_id
  ) sub
  where sub.oracle_id = c.oracle_id;
$$;
grant execute on function public.backfill_card_released_at() to service_role;
