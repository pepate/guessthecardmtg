-- Card catalogue seeded from Scryfall's bulk export. One row per guessable
-- card (`card`) and one per eligible printing/artwork (`card_art`).

create table public.card (
  oracle_id      uuid primary key,
  name           text not null,
  cmc            real,
  colors         text[],
  color_identity text[],
  type_line      text,
  power          text,
  toughness      text,
  edhrec_rank    int,
  is_popular     boolean not null default false,
  is_ub          boolean not null default false
);

create table public.card_art (
  id             bigserial primary key,
  oracle_id      uuid not null references public.card(oracle_id) on delete cascade,
  set_code       text,
  set_name       text,
  rarity         text,
  image_normal   text not null,
  image_art_crop text not null
);

create index card_is_popular_idx on public.card (is_popular);
create index card_art_oracle_idx on public.card_art (oracle_id);

-- Public, read-only access to card data.
alter table public.card enable row level security;
alter table public.card_art enable row level security;
create policy card_read on public.card for select using (true);
create policy card_art_read on public.card_art for select using (true);

-- Seed helper: wipe both tables so the seed script is idempotent. SECURITY
-- DEFINER so the service-role seed can truncate regardless of RLS.
create or replace function public.reset_cards()
returns void
language sql
security definer
set search_path = public
as $$
  truncate public.card_art, public.card restart identity cascade;
$$;

-- Game query: `p_count` random distinct cards (filtered to popular and/or
-- non-UB), each joined to one random artwork. Fresh on every call.
create or replace function public.get_game_cards(
  p_pool text,
  p_count int,
  p_exclude_ub boolean default false
)
returns table (
  oracle_id uuid,
  name text,
  cmc real,
  colors text[],
  color_identity text[],
  type_line text,
  power text,
  toughness text,
  rarity text,
  set_code text,
  set_name text,
  image_normal text,
  image_art_crop text
)
language sql
stable
as $$
  select c.oracle_id, c.name, c.cmc, c.colors, c.color_identity,
         c.type_line, c.power, c.toughness,
         a.rarity, a.set_code, a.set_name, a.image_normal, a.image_art_crop
  from (
    select *
    from public.card
    where (p_pool <> 'popular' or is_popular)
      and (not p_exclude_ub or not is_ub)
    order by random()
    limit greatest(p_count, 0)
  ) c
  cross join lateral (
    select ca.rarity, ca.set_code, ca.set_name, ca.image_normal, ca.image_art_crop
    from public.card_art ca
    where ca.oracle_id = c.oracle_id
    order by random()
    limit 1
  ) a;
$$;

grant execute on function public.get_game_cards(text, int, boolean) to anon, authenticated;
