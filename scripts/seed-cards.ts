/**
 * Seed the Supabase `card` + `card_art` tables from Scryfall's all-cards.json
 * bulk export. Run locally: `npm run seed:cards`.
 *
 * Requires env (see .env.example): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ALL_CARDS_PATH (defaults to ./all-cards.json).
 */
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { createClient } from '@supabase/supabase-js';
import {
  isEligiblePrinting,
  toCardFields,
  toArtFields,
  topPopularOracleIds,
  type RawCard,
  type CardFields,
  type ArtFields,
} from '../src/cards/seedFilter';

const POPULAR_COUNT = 1000;
const BATCH = 1000;
const SCRYFALL = 'https://api.scryfall.com';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const path = process.env.ALL_CARDS_PATH ?? './all-cards.json';
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(url, key, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch every Universes Beyond oracle_id from Scryfall (one-time, dev only). */
async function fetchUbOracleIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let next: string | null =
    `${SCRYFALL}/cards/search?q=is:ub&unique=cards&page=1`;
  while (next) {
    const res = await fetch(next, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Scryfall is:ub lookup failed: ${res.status}`);
    const json: { data?: { oracle_id?: string }[]; has_more?: boolean; next_page?: string } =
      await res.json();
    for (const c of json.data ?? []) if (c.oracle_id) ids.add(c.oracle_id);
    next = json.has_more ? (json.next_page ?? null) : null;
    await sleep(120); // respect Scryfall's rate limit
  }
  return ids;
}

async function insertBatched<T>(table: string, rows: T[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await db.from(table).insert(slice);
    if (error) throw new Error(`insert ${table} failed: ${error.message}`);
  }
}

async function main(): Promise<void> {
  console.log('Fetching Universes Beyond oracle ids from Scryfall…');
  const ubIds = await fetchUbOracleIds();
  console.log(`  ${ubIds.size} UB oracle ids`);

  const cards = new Map<string, CardFields>();
  const arts: ArtFields[] = [];

  console.log(`Streaming ${path}…`);
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path).pipe(parser()).pipe(streamArray());
    stream.on('data', ({ value }: { value: RawCard }) => {
      if (!isEligiblePrinting(value)) return;
      const oid = value.oracle_id!;
      if (!cards.has(oid)) cards.set(oid, toCardFields(value));
      arts.push(toArtFields(value));
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  const cardList = [...cards.values()];
  const popular = topPopularOracleIds(cardList, POPULAR_COUNT);
  for (const c of cardList) {
    c.is_popular = popular.has(c.oracle_id);
    c.is_ub = ubIds.has(c.oracle_id);
  }

  console.log(
    `Eligible: ${cardList.length} cards, ${arts.length} arts, ` +
      `${popular.size} popular, ${cardList.filter((c) => c.is_ub).length} UB`,
  );

  console.log('Resetting tables…');
  const reset = await db.rpc('reset_cards');
  if (reset.error) throw new Error(`reset_cards failed: ${reset.error.message}`);

  console.log('Inserting cards…');
  await insertBatched('card', cardList);
  console.log('Inserting arts…');
  await insertBatched('card_art', arts);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
