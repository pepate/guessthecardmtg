# Global Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, arcade-style global leaderboard (Supabase-backed) so players can publish a score under a name, see their projected rank, and browse global top lists; the local highscore becomes the device-based "Me" tab.

**Architecture:** Direct anonymous reads against a locked-down Postgres table (exposed via a read-only view that bypasses RLS); writes go through a `submit-score` Edge Function that validates plausibility, sanitizes the name, rate-limits per hashed IP, derives a country code, and inserts with the service role. The React client gains an isolated `src/leaderboard/` module (pure validation + utils, a thin Supabase client, a hook) plus three UI surfaces: a 3-tab start-screen leaderboard, a game-over post form, and a shared global list component.

**Tech Stack:** React 18 + Vite + TypeScript, Zustand, Vitest + Testing Library, Supabase (Postgres + Edge Functions/Deno), `@supabase/supabase-js`.

**Spec:** `docs/superpowers/specs/2026-05-30-global-leaderboard-design.md`

---

## File Structure

Client (`src/leaderboard/`):
- `types.ts` — `GlobalEntry`, `SubmitPayload` (pure types).
- `validation.ts` — `sanitizeName`, `validateScore`, `validateSubmission`, name constants.
- `flag.ts` — `countryToFlag` (ISO alpha-2 → emoji).
- `age.ts` — `formatAge` (epoch ms → German relative time).
- `client.ts` — `isLeaderboardEnabled`, `fetchTopScores`, `fetchProjectedRank`, `submitScore`.
- `useLeaderboard.ts` — React hook for one global pool's entries.

Client UI (`src/ui/`):
- `GlobalScoreList.tsx` — presentational global rows (rank · flag · name · correct · score · age) + optional pinned own row.
- `Leaderboard.tsx` — 3-tab area (All / Popular / Me) with top-5↔top-100 expand.
- `StartLeaderboard.tsx` — start-screen trigger button + modal overlay wrapping `Leaderboard`.
- `GameOverLeaderboard.tsx` — projected rank + name post form + post-submit highlighted/pinned result.
- `GameOver.tsx` — MODIFY: drop the local highscore list, render `GameOverLeaderboard`.
- `App.tsx` — MODIFY: render `StartLeaderboard` on the idle screen.

Config:
- `vite-env.d.ts` — MODIFY: type the two env vars.
- `.env.example` — CREATE.
- `package.json` — MODIFY: add `@supabase/supabase-js`.

Backend (`supabase/`):
- `supabase/migrations/0001_leaderboard.sql` — table, indexes, RLS, view, grant.
- `supabase/functions/submit-score/index.ts` — Edge Function.

Reused as-is:
- `src/state/highscores.ts` — `PoolKind`, `loadHighscores`, `HighscoreEntry`.
- `src/ui/HighscoreList.tsx` — renders the local entries for the "Me" tab.

---

## Task 1: Add dependency, env typing, and `.env.example`

**Files:**
- Modify: `package.json`
- Modify: `src/vite-env.d.ts`
- Create: `.env.example`

- [ ] **Step 1: Install the Supabase client**

Run: `npm install @supabase/supabase-js@^2`
Expected: `package.json` dependencies gains `@supabase/supabase-js`, install succeeds.

- [ ] **Step 2: Type the env vars**

Replace the contents of `src/vite-env.d.ts` with:

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Create `.env.example`**

Create `.env.example`:

```
# Supabase global leaderboard (publishable values — safe to ship in a static bundle).
# Leave unset to run the game with the leaderboard disabled.
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

- [ ] **Step 4: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/vite-env.d.ts .env.example
git commit -m "chore: add supabase-js dependency and env config"
```

---

## Task 2: Pure types and validation

**Files:**
- Create: `src/leaderboard/types.ts`
- Create: `src/leaderboard/validation.ts`
- Test: `src/leaderboard/validation.test.ts`

- [ ] **Step 1: Create the types**

Create `src/leaderboard/types.ts`:

```ts
import type { PoolKind } from '../state/highscores';

export interface GlobalEntry {
  id: string;
  name: string;
  score: number;
  correct: number;
  pool: PoolKind;
  /** ISO 3166-1 alpha-2 (uppercase), or null when unknown. */
  country: string | null;
  /** Epoch milliseconds. */
  createdAt: number;
}

export interface SubmitPayload {
  name: string;
  score: number;
  correct: number;
  pool: PoolKind;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/leaderboard/validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeName, validateScore, validateSubmission, NAME_MIN, NAME_MAX } from './validation';

describe('sanitizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeName('  Jo   hn  ')).toBe('Jo hn');
  });
  it('strips control characters', () => {
    expect(sanitizeName('Ab\u0000\u0007cd')).toBe('Abcd');
  });
  it('caps at NAME_MAX characters', () => {
    expect(sanitizeName('x'.repeat(40))).toBe('x'.repeat(NAME_MAX));
  });
  it('rejects names shorter than NAME_MIN', () => {
    expect(sanitizeName('ab')).toBeNull();
    expect(sanitizeName('   ')).toBeNull();
  });
  it('accepts a name exactly NAME_MIN long', () => {
    expect(sanitizeName('abc')).toBe('abc');
  });
});

describe('validateScore', () => {
  it('accepts a plausible score', () => {
    expect(validateScore(5000, 10)).toBe(true); // within 10*[100,1000]
  });
  it('rejects a score above the per-card max', () => {
    expect(validateScore(10001, 10)).toBe(false);
  });
  it('rejects a score below the per-card min', () => {
    expect(validateScore(999, 10)).toBe(false);
  });
  it('requires score 0 when correct is 0', () => {
    expect(validateScore(0, 0)).toBe(true);
    expect(validateScore(100, 0)).toBe(false);
  });
  it('rejects more than 40 correct', () => {
    expect(validateScore(4100, 41)).toBe(false);
  });
  it('rejects non-integers', () => {
    expect(validateScore(100.5, 1)).toBe(false);
    expect(validateScore(500, 1.5)).toBe(false);
  });
});

describe('validateSubmission', () => {
  it('accepts a well-formed submission', () => {
    expect(validateSubmission({ name: 'Alice', score: 5000, correct: 10, pool: 'popular' })).toBe(true);
  });
  it('rejects an unknown pool', () => {
    expect(validateSubmission({ name: 'Alice', score: 5000, correct: 10, pool: 'weird' })).toBe(false);
  });
  it('rejects a too-short name', () => {
    expect(validateSubmission({ name: 'al', score: 5000, correct: 10, pool: 'all' })).toBe(false);
  });
  it('rejects an implausible score', () => {
    expect(validateSubmission({ name: 'Alice', score: 999999, correct: 10, pool: 'all' })).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/leaderboard/validation.test.ts`
Expected: FAIL — cannot resolve `./validation`.

- [ ] **Step 4: Write the implementation**

Create `src/leaderboard/validation.ts`:

```ts
export const NAME_MIN = 3;
export const NAME_MAX = 16;

const MAX_CORRECT = 40;
const MIN_PER_CARD = 100;
const MAX_PER_CARD = 1000;

/** Trim, collapse whitespace, strip control chars, cap length. Null if too short. */
export function sanitizeName(raw: string): string | null {
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = cleaned.slice(0, NAME_MAX).trim();
  return capped.length >= NAME_MIN ? capped : null;
}

/** Plausibility bounds derived from the time-attack scoring rules. */
export function validateScore(score: number, correct: number): boolean {
  if (!Number.isInteger(score) || !Number.isInteger(correct)) return false;
  if (correct < 0 || correct > MAX_CORRECT) return false;
  if (correct === 0) return score === 0;
  return score >= correct * MIN_PER_CARD && score <= correct * MAX_PER_CARD;
}

export function validateSubmission(p: {
  name: string;
  score: number;
  correct: number;
  pool: string;
}): boolean {
  if (p.pool !== 'popular' && p.pool !== 'all') return false;
  if (sanitizeName(p.name) === null) return false;
  return validateScore(p.score, p.correct);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/leaderboard/validation.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Commit**

```bash
git add src/leaderboard/types.ts src/leaderboard/validation.ts src/leaderboard/validation.test.ts
git commit -m "feat: add leaderboard types and submission validation"
```

---

## Task 3: Country-code → flag emoji

**Files:**
- Create: `src/leaderboard/flag.ts`
- Test: `src/leaderboard/flag.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/leaderboard/flag.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countryToFlag } from './flag';

describe('countryToFlag', () => {
  it('converts a valid code to regional-indicator emoji', () => {
    expect(countryToFlag('DE')).toBe('\u{1F1E9}\u{1F1EA}');
  });
  it('is case-insensitive', () => {
    expect(countryToFlag('us')).toBe('\u{1F1FA}\u{1F1F8}');
  });
  it('returns empty string for null', () => {
    expect(countryToFlag(null)).toBe('');
  });
  it('returns empty string for malformed codes', () => {
    expect(countryToFlag('XYZ')).toBe('');
    expect(countryToFlag('1')).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/leaderboard/flag.test.ts`
Expected: FAIL — cannot resolve `./flag`.

- [ ] **Step 3: Write the implementation**

Create `src/leaderboard/flag.ts`:

```ts
const A = 0x1f1e6; // regional indicator 'A'

/** Render an ISO 3166-1 alpha-2 code as a flag emoji. Empty string if invalid. */
export function countryToFlag(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  const up = code.toUpperCase();
  return String.fromCodePoint(
    A + (up.charCodeAt(0) - 65),
    A + (up.charCodeAt(1) - 65),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/leaderboard/flag.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/flag.ts src/leaderboard/flag.test.ts
git commit -m "feat: add country-code to flag-emoji helper"
```

---

## Task 4: Relative age formatter

**Files:**
- Create: `src/leaderboard/age.ts`
- Test: `src/leaderboard/age.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/leaderboard/age.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatAge } from './age';

const NOW = 1_000_000_000_000;
const ago = (ms: number) => NOW - ms;
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

describe('formatAge', () => {
  it('shows "gerade eben" under a minute', () => {
    expect(formatAge(ago(30 * S), NOW)).toBe('gerade eben');
  });
  it('shows minutes', () => {
    expect(formatAge(ago(5 * M), NOW)).toBe('vor 5 Min.');
  });
  it('shows hours', () => {
    expect(formatAge(ago(3 * H), NOW)).toBe('vor 3 Std.');
  });
  it('shows days', () => {
    expect(formatAge(ago(2 * D), NOW)).toBe('vor 2 Tg.');
  });
  it('clamps a future timestamp to "gerade eben"', () => {
    expect(formatAge(NOW + 5 * S, NOW)).toBe('gerade eben');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/leaderboard/age.test.ts`
Expected: FAIL — cannot resolve `./age`.

- [ ] **Step 3: Write the implementation**

Create `src/leaderboard/age.ts`:

```ts
/** Short German relative time, e.g. "vor 3 Std.". */
export function formatAge(then: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return 'gerade eben';
  const m = Math.floor(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d < 7) return `vor ${d} Tg.`;
  const w = Math.floor(d / 7);
  if (w < 5) return `vor ${w} Wo.`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `vor ${mo} Mon.`;
  return `vor ${Math.floor(d / 365)} J.`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/leaderboard/age.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/age.ts src/leaderboard/age.test.ts
git commit -m "feat: add relative age formatter"
```

---

## Task 5: Supabase client wrapper

**Files:**
- Create: `src/leaderboard/client.ts`
- Test: `src/leaderboard/client.test.ts`

The Supabase query builder is chainable and awaitable. The test mocks
`@supabase/supabase-js` so `createClient` returns a fake whose `.from()` and
`.functions.invoke()` are controllable.

- [ ] **Step 1: Write the failing test**

Create `src/leaderboard/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const from = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from, functions: { invoke } })),
}));

/** A chainable query stub that resolves (when awaited) to `result`. */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'order', 'limit']) {
    q[m] = vi.fn(() => q);
  }
  (q as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return q;
}

async function importClient() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.resetModules();
  return import('./client');
}

beforeEach(() => {
  invoke.mockReset();
  from.mockReset();
  vi.unstubAllEnvs();
});

describe('isLeaderboardEnabled', () => {
  it('is false when env vars are missing', async () => {
    vi.resetModules();
    const { isLeaderboardEnabled } = await import('./client');
    expect(isLeaderboardEnabled()).toBe(false);
  });
  it('is true when env vars are present', async () => {
    const { isLeaderboardEnabled } = await importClient();
    expect(isLeaderboardEnabled()).toBe(true);
  });
});

describe('fetchTopScores', () => {
  it('maps rows to GlobalEntry with epoch createdAt', async () => {
    from.mockReturnValueOnce(
      query({
        data: [
          { id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', country: 'DE', created_at: '2026-01-01T00:00:00.000Z' },
        ],
        error: null,
      }),
    );
    const { fetchTopScores } = await importClient();
    const rows = await fetchTopScores('all', 5);
    expect(rows[0]).toEqual({
      id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', country: 'DE',
      createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
    });
  });
  it('throws on a query error', async () => {
    from.mockReturnValueOnce(query({ data: null, error: { message: 'boom' } }));
    const { fetchTopScores } = await importClient();
    await expect(fetchTopScores('all', 5)).rejects.toThrow('boom');
  });
});

describe('fetchProjectedRank', () => {
  it('returns count-of-higher + 1 and the total', async () => {
    from
      .mockReturnValueOnce(query({ count: 3, error: null })) // higher
      .mockReturnValueOnce(query({ count: 12, error: null })); // total
    const { fetchProjectedRank } = await importClient();
    expect(await fetchProjectedRank('popular', 500)).toEqual({ rank: 4, total: 12 });
  });
});

describe('submitScore', () => {
  it('returns ok with id and rank on success', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true, id: 'x', rank: 7 }, error: null });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 900, correct: 9, pool: 'all' })).toEqual({ ok: true, id: 'x', rank: 7 });
  });
  it('returns a reason on function error', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'rate-limited' } });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 900, correct: 9, pool: 'all' })).toEqual({ ok: false, reason: 'rate-limited' });
  });
  it('returns a reason when the function rejects the payload', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: false, reason: 'score' }, error: null });
    const { submitScore } = await importClient();
    expect(await submitScore({ name: 'Al', score: 1, correct: 9, pool: 'all' })).toEqual({ ok: false, reason: 'score' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/leaderboard/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Write the implementation**

Create `src/leaderboard/client.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry, SubmitPayload } from './types';

let cached: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  cached = url && key ? createClient(url, key) : null;
  return cached;
}

export function isLeaderboardEnabled(): boolean {
  return getClient() !== null;
}

interface Row {
  id: string;
  name: string;
  score: number;
  correct: number;
  pool: PoolKind;
  country: string | null;
  created_at: string;
}

function toEntry(r: Row): GlobalEntry {
  return {
    id: r.id,
    name: r.name,
    score: r.score,
    correct: r.correct,
    pool: r.pool,
    country: r.country,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function fetchTopScores(pool: PoolKind, limit = 5): Promise<GlobalEntry[]> {
  const c = getClient();
  if (!c) return [];
  const { data, error } = await c
    .from('leaderboard_top')
    .select('id,name,score,correct,pool,country,created_at')
    .eq('pool', pool)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toEntry);
}

export async function fetchProjectedRank(
  pool: PoolKind,
  score: number,
): Promise<{ rank: number; total: number }> {
  const c = getClient();
  if (!c) return { rank: 1, total: 0 };
  const higher = await c
    .from('leaderboard_top')
    .select('id', { count: 'exact', head: true })
    .eq('pool', pool)
    .gt('score', score);
  if (higher.error) throw new Error(higher.error.message);
  const all = await c
    .from('leaderboard_top')
    .select('id', { count: 'exact', head: true })
    .eq('pool', pool);
  if (all.error) throw new Error(all.error.message);
  return { rank: (higher.count ?? 0) + 1, total: all.count ?? 0 };
}

export type SubmitResult =
  | { ok: true; id: string; rank: number }
  | { ok: false; reason: string };

export async function submitScore(payload: SubmitPayload): Promise<SubmitResult> {
  const c = getClient();
  if (!c) return { ok: false, reason: 'disabled' };
  const { data, error } = await c.functions.invoke('submit-score', { body: payload });
  if (error) return { ok: false, reason: error.message };
  if (!data || data.ok !== true) return { ok: false, reason: data?.reason ?? 'rejected' };
  return { ok: true, id: data.id, rank: data.rank };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/leaderboard/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/client.ts src/leaderboard/client.test.ts
git commit -m "feat: add supabase leaderboard client"
```

---

## Task 6: Install the Supabase MCP and create the project

This task is infrastructure setup performed via the Supabase MCP server. It has no
unit test; verification is checking the project + keys exist.

- [ ] **Step 1: Install the Supabase MCP server**

Run (in a terminal, replacing the token with the user's access token):

```bash
claude mcp add supabase -- npx -y @supabase/mcp-server-supabase@latest --access-token sbp_XXXXXXXX
```

Expected: the MCP is registered. **A Claude Code restart is required** for the new
MCP tools to load. After restart, the Supabase MCP tools become available via
ToolSearch.

- [ ] **Step 2: Create the project**

Using the Supabase MCP, create a new project named `guessthecard` in an EU region
(e.g. `eu-central-1`) under the user's organization. Record the returned
**project ref**, **project URL** (`https://<ref>.supabase.co`), and the **anon
(publishable) key**.

- [ ] **Step 3: Put the keys into local env**

Create `.env` (NOT committed — it is already covered by the gitignore for env files;
verify with `git check-ignore .env`):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Run: `git check-ignore .env`
Expected: prints `.env` (i.e. it is ignored). If it prints nothing, add `.env` to
`.gitignore` and commit that change.

- [ ] **Step 4: No code commit** — credentials must not be committed.

---

## Task 7: Database schema, RLS, and read view

**Files:**
- Create: `supabase/migrations/0001_leaderboard.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_leaderboard.sql`:

```sql
-- Global leaderboard. The base table is locked down with RLS (no anon policies),
-- so anonymous clients cannot read or write it directly. Reads go through the
-- leaderboard_top VIEW, which is owned by postgres (the table owner) and therefore
-- bypasses the base table's RLS; we grant SELECT on the view to anon. Writes go
-- exclusively through the submit-score Edge Function using the service role.

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 16),
  score int not null check (score >= 0),
  correct int not null check (correct between 0 and 40),
  pool text not null check (pool in ('popular', 'all')),
  country text check (country ~ '^[A-Z]{2}$'),
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_pool_score_idx
  on public.leaderboard (pool, score desc, created_at asc);

create index if not exists leaderboard_ratelimit_idx
  on public.leaderboard (ip_hash, created_at desc);

alter table public.leaderboard enable row level security;
-- Intentionally NO policies: anon/authenticated cannot select/insert directly.

-- Public, read-only projection without ip_hash. NOT security_invoker, so it runs
-- as its owner (postgres = table owner) and bypasses RLS for reads.
create or replace view public.leaderboard_top as
  select id, name, score, correct, pool, country, created_at
  from public.leaderboard;

grant select on public.leaderboard_top to anon;
```

- [ ] **Step 2: Apply the migration**

Using the Supabase MCP, apply `supabase/migrations/0001_leaderboard.sql` to the
project (e.g. via the MCP "apply migration" tool, passing the SQL above).

- [ ] **Step 3: Verify the table and view exist**

Using the Supabase MCP, run:

```sql
select count(*) from public.leaderboard_top;
```

Expected: returns `0` (empty board, no error). A successful query proves the view
exists and anon-readable grant works.

- [ ] **Step 4: Verify direct base-table access is denied for anon**

Using `curl` against the REST API with the anon key:

```bash
curl -s "https://<ref>.supabase.co/rest/v1/leaderboard?select=*" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"
```

Expected: an empty array `[]` or a permission error — but crucially never any rows
even after data exists (RLS denies). The `leaderboard_top` endpoint, by contrast,
returns rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_leaderboard.sql
git commit -m "feat: add leaderboard table, RLS, and read view"
```

---

## Task 8: `submit-score` Edge Function

**Files:**
- Create: `supabase/functions/submit-score/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/submit-score/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NAME_MIN = 3;
const NAME_MAX = 16;
const MAX_CORRECT = 40;
const MIN_PER_CARD = 100;
const MAX_PER_CARD = 1000;
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60_000;
const BANNED = ['fuck', 'shit', 'nigger', 'cunt', 'bitch', 'asshole'];

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  const capped = cleaned.slice(0, NAME_MAX).trim();
  return capped.length >= NAME_MIN ? capped : null;
}

function validScore(score: unknown, correct: unknown): boolean {
  if (typeof score !== 'number' || typeof correct !== 'number') return false;
  if (!Number.isInteger(score) || !Number.isInteger(correct)) return false;
  if (correct < 0 || correct > MAX_CORRECT) return false;
  if (correct === 0) return score === 0;
  return score >= correct * MIN_PER_CARD && score <= correct * MAX_PER_CARD;
}

function isClean(name: string): boolean {
  const low = name.toLowerCase();
  return !BANNED.some((w) => low.includes(w));
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function lookupCountry(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipwho.is/${ip}?fields=country_code`);
    if (!res.ok) return null;
    const j = await res.json();
    const code = j?.country_code;
    return typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'bad-json' }, 400);
  }

  const pool = body.pool;
  if (pool !== 'popular' && pool !== 'all') return json({ ok: false, reason: 'pool' }, 400);

  const name = sanitizeName(body.name);
  if (!name) return json({ ok: false, reason: 'name' }, 400);
  if (!isClean(name)) return json({ ok: false, reason: 'name-blocked' }, 400);

  if (!validScore(body.score, body.correct)) return json({ ok: false, reason: 'score' }, 400);
  const score = body.score as number;
  const correct = body.correct as number;

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const salt = Deno.env.get('IP_HASH_SALT') ?? '';
  const ipHash = await sha256(ip + salt);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const recent = await supabase
    .from('leaderboard')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if ((recent.count ?? 0) >= RATE_MAX) return json({ ok: false, reason: 'rate-limited' }, 429);

  const country = await lookupCountry(ip);

  const inserted = await supabase
    .from('leaderboard')
    .insert({ name, score, correct, pool, country, ip_hash: ipHash })
    .select('id')
    .single();
  if (inserted.error) return json({ ok: false, reason: 'insert' }, 500);

  const higher = await supabase
    .from('leaderboard')
    .select('id', { count: 'exact', head: true })
    .eq('pool', pool)
    .gt('score', score);
  const rank = (higher.count ?? 0) + 1;

  return json({ ok: true, id: inserted.data.id, rank }, 200);
});
```

- [ ] **Step 2: Set the function secret**

Using the Supabase MCP (or `supabase secrets set`), set `IP_HASH_SALT` to a long
random string (e.g. output of `openssl rand -hex 32`). `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected automatically into the function runtime.

- [ ] **Step 3: Deploy the function**

Using the Supabase MCP "deploy edge function" tool, deploy `submit-score` from
`supabase/functions/submit-score/index.ts`.

- [ ] **Step 4: Verify a valid submission succeeds**

```bash
curl -s -X POST "https://<ref>.supabase.co/functions/v1/submit-score" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Tester","score":5000,"correct":10,"pool":"popular"}'
```

Expected: `{"ok":true,"id":"...","rank":1}`.

- [ ] **Step 5: Verify an implausible submission is rejected**

```bash
curl -s -X POST "https://<ref>.supabase.co/functions/v1/submit-score" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cheater","score":999999,"correct":10,"pool":"popular"}'
```

Expected: HTTP 400 with `{"ok":false,"reason":"score"}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/submit-score/index.ts
git commit -m "feat: add submit-score edge function"
```

---

## Task 9: `useLeaderboard` hook

**Files:**
- Create: `src/leaderboard/useLeaderboard.ts`
- Test: `src/leaderboard/useLeaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/leaderboard/useLeaderboard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLeaderboard } from './useLeaderboard';
import * as client from './client';
import type { GlobalEntry } from './types';

const entry: GlobalEntry = {
  id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', country: 'DE', createdAt: 0,
};

beforeEach(() => vi.restoreAllMocks());

describe('useLeaderboard', () => {
  it('loads entries for a pool', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    const { result } = renderHook(() => useLeaderboard('all', 5));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([entry]);
    expect(result.current.error).toBe(false);
  });

  it('sets error when the fetch rejects', async () => {
    vi.spyOn(client, 'fetchTopScores').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useLeaderboard('popular', 5));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/leaderboard/useLeaderboard.test.ts`
Expected: FAIL — cannot resolve `./useLeaderboard`.

- [ ] **Step 3: Write the implementation**

Create `src/leaderboard/useLeaderboard.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry } from './types';
import { fetchTopScores } from './client';

export function useLeaderboard(pool: PoolKind, limit: number) {
  const [entries, setEntries] = useState<GlobalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchTopScores(pool, limit)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pool, limit]);

  useEffect(() => reload(), [reload]);

  return { entries, loading, error, reload };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/leaderboard/useLeaderboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard/useLeaderboard.ts src/leaderboard/useLeaderboard.test.ts
git commit -m "feat: add useLeaderboard hook"
```

---

## Task 10: `GlobalScoreList` presentational component

**Files:**
- Create: `src/ui/GlobalScoreList.tsx`
- Test: `src/ui/GlobalScoreList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/ui/GlobalScoreList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlobalScoreList } from './GlobalScoreList';
import type { GlobalEntry } from '../leaderboard/types';

const NOW = 1_000_000_000_000;
function e(id: string, score: number): GlobalEntry {
  return { id, name: `P${id}`, score, correct: 9, pool: 'all', country: 'DE', createdAt: NOW };
}

describe('GlobalScoreList', () => {
  it('renders one row per entry with rank, name and score', () => {
    render(<GlobalScoreList entries={[e('1', 900), e('2', 800)]} now={NOW} />);
    expect(screen.getAllByTestId('global-entry')).toHaveLength(2);
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.getByText('900')).toBeInTheDocument();
  });

  it('shows an empty state when there are no entries', () => {
    render(<GlobalScoreList entries={[]} now={NOW} />);
    expect(screen.getByTestId('global-empty')).toBeInTheDocument();
  });

  it('renders a pinned own row separated from the list', () => {
    render(
      <GlobalScoreList
        entries={[e('1', 900)]}
        pinned={{ rank: 347, entry: e('me', 120) }}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('global-pinned')).toHaveTextContent('#347');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/ui/GlobalScoreList.test.tsx`
Expected: FAIL — cannot resolve `./GlobalScoreList`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/GlobalScoreList.tsx`:

```tsx
import type { GlobalEntry } from '../leaderboard/types';
import { countryToFlag } from '../leaderboard/flag';
import { formatAge } from '../leaderboard/age';

const GRID = '24px 20px 1fr auto auto';

function Row({
  rank,
  entry,
  now,
  highlight,
  testid,
}: {
  rank: number;
  entry: GlobalEntry;
  now: number;
  highlight: boolean;
  testid: string;
}) {
  return (
    <div
      data-testid={testid}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 8,
        alignItems: 'center',
        padding: '8px 10px',
        borderRadius: 8,
        background: highlight ? 'rgba(255,138,60,0.18)' : 'rgba(20,17,28,0.5)',
        border: `1px solid ${highlight ? 'var(--ember)' : 'var(--line)'}`,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{rank}</span>
      <span aria-hidden style={{ fontSize: 14 }}>{countryToFlag(entry.country)}</span>
      <span style={{ color: 'var(--ink-0)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.name}
      </span>
      <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{entry.correct}✓ · {formatAge(entry.createdAt, now)}</span>
      <span style={{ color: 'var(--ember-hot)', fontSize: 15, fontWeight: 700 }}>{entry.score}</span>
    </div>
  );
}

export function GlobalScoreList({
  entries,
  highlightId,
  pinned,
  now = Date.now(),
}: {
  entries: GlobalEntry[];
  highlightId?: string;
  pinned?: { rank: number; entry: GlobalEntry } | null;
  now?: number;
}) {
  if (entries.length === 0 && !pinned) {
    return (
      <p data-testid="global-empty" style={{ color: 'var(--ink-2)', fontSize: 13, textAlign: 'center', margin: 0 }}>
        Noch keine Einträge — sei der Erste!
      </p>
    );
  }

  return (
    <div data-testid="global-list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {entries.map((entry, i) => (
        <Row
          key={entry.id}
          rank={i + 1}
          entry={entry}
          now={now}
          highlight={entry.id === highlightId}
          testid="global-entry"
        />
      ))}
      {pinned && (
        <>
          <div aria-hidden style={{ textAlign: 'center', color: 'var(--ink-2)', fontSize: 14, padding: '2px 0' }}>
            …
          </div>
          <Row rank={pinned.rank} entry={pinned.entry} now={now} highlight testid="global-pinned" />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/ui/GlobalScoreList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/GlobalScoreList.tsx src/ui/GlobalScoreList.test.tsx
git commit -m "feat: add GlobalScoreList component"
```

---

## Task 11: `Leaderboard` 3-tab area

**Files:**
- Create: `src/ui/Leaderboard.tsx`
- Test: `src/ui/Leaderboard.test.tsx`

The "Me" tab reuses the existing `HighscoreList` with the local `loadHighscores()`
entries. The global tabs use `useLeaderboard`; an "Mehr anzeigen" button toggles the
fetch limit between 5 and 100.

- [ ] **Step 1: Write the failing test**

Create `src/ui/Leaderboard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Leaderboard } from './Leaderboard';
import * as client from '../leaderboard/client';
import type { GlobalEntry } from '../leaderboard/types';

const entry: GlobalEntry = { id: '1', name: 'Al', score: 900, correct: 9, pool: 'all', country: 'DE', createdAt: 0 };

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Leaderboard', () => {
  it('shows the global all-cards tab by default', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith('all', 5);
  });

  it('switches to the Me tab and shows the local store', async () => {
    vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
    localStorage.setItem(
      'guessthecard.highscores.v3',
      JSON.stringify([{ score: 500, correct: 5, date: 1, pool: 'all' }]),
    );
    render(<Leaderboard />);
    fireEvent.click(screen.getByRole('tab', { name: /me/i }));
    await waitFor(() => expect(screen.getByTestId('highscore-list')).toBeInTheDocument());
  });

  it('expands a global tab to the top 100', async () => {
    const spy = vi.spyOn(client, 'fetchTopScores').mockResolvedValue([entry]);
    render(<Leaderboard />);
    await waitFor(() => expect(screen.getByText('Al')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('leaderboard-expand'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('all', 100));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/ui/Leaderboard.test.tsx`
Expected: FAIL — cannot resolve `./Leaderboard`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/Leaderboard.tsx`:

```tsx
import { useState } from 'react';
import type { PoolKind } from '../state/highscores';
import { loadHighscores } from '../state/highscores';
import { useLeaderboard } from '../leaderboard/useLeaderboard';
import { GlobalScoreList } from './GlobalScoreList';
import { HighscoreList } from './HighscoreList';

type Tab = 'all' | 'popular' | 'me';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All Cards' },
  { key: 'popular', label: 'Popular' },
  { key: 'me', label: 'Me' },
];

function GlobalTab({ pool }: { pool: PoolKind }) {
  const [expanded, setExpanded] = useState(false);
  const { entries, loading, error } = useLeaderboard(pool, expanded ? 100 : 5);

  if (error) {
    return <p style={{ color: 'var(--ember-hot)', fontSize: 13, textAlign: 'center' }}>Leaderboard nicht erreichbar.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <GlobalScoreList entries={entries} />
      {!expanded && entries.length >= 5 && (
        <button
          className="ghost-btn"
          data-testid="leaderboard-expand"
          style={{ width: '100%' }}
          onClick={() => setExpanded(true)}
          disabled={loading}
        >
          Mehr anzeigen
        </button>
      )}
    </div>
  );
}

export function Leaderboard() {
  const [tab, setTab] = useState<Tab>('all');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 420 }}>
      <div role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'ember-btn' : 'ghost-btn'}
            style={{ padding: '8px 4px', fontSize: 12 }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'all' && <GlobalTab pool="all" />}
      {tab === 'popular' && <GlobalTab pool="popular" />}
      {tab === 'me' && <HighscoreList entries={loadHighscores()} />}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/ui/Leaderboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Leaderboard.tsx src/ui/Leaderboard.test.tsx
git commit -m "feat: add 3-tab leaderboard area"
```

---

## Task 12: Start-screen leaderboard button + overlay

**Files:**
- Create: `src/ui/StartLeaderboard.tsx`
- Modify: `src/App.tsx` (idle screen block)
- Test: `src/ui/StartLeaderboard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/ui/StartLeaderboard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StartLeaderboard } from './StartLeaderboard';
import * as client from '../leaderboard/client';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
});

describe('StartLeaderboard', () => {
  it('opens the overlay when the button is clicked', async () => {
    render(<StartLeaderboard />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-leaderboard'));
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
  });

  it('closes the overlay with the close button', async () => {
    render(<StartLeaderboard />);
    fireEvent.click(screen.getByTestId('open-leaderboard'));
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('close-leaderboard'));
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/ui/StartLeaderboard.test.tsx`
Expected: FAIL — cannot resolve `./StartLeaderboard`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/StartLeaderboard.tsx`:

```tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Leaderboard } from './Leaderboard';

export function StartLeaderboard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="ghost-btn"
        data-testid="open-leaderboard"
        style={{ width: '100%' }}
        onClick={() => setOpen(true)}
      >
        Leaderboard
      </button>

      {open && (
        <motion.div
          key="leaderboard-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20,
            background: 'rgba(7,6,10,0.92)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
            padding: '24px 22px calc(24px + env(safe-area-inset-bottom))',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 420 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, textTransform: 'uppercase', fontSize: 13, color: 'var(--ink-2)' }}>
              Leaderboard
            </span>
            <button
              type="button"
              className="ghost-btn"
              data-testid="close-leaderboard"
              style={{ padding: '6px 14px' }}
              onClick={() => setOpen(false)}
            >
              Schließen
            </button>
          </div>
          <Leaderboard />
        </motion.div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/ui/StartLeaderboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render it on the idle screen**

In `src/App.tsx`, add the import near the other UI imports:

```tsx
import { StartLeaderboard } from './ui/StartLeaderboard';
```

Then, inside the idle `motion.div` that wraps `PoolSelect` (the block keyed
`"idle"` with className `"bottom-sheet"`), render `StartLeaderboard` directly after
`<PoolSelect />`:

```tsx
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bottom-sheet"
            >
              <PoolSelect />
              <StartLeaderboard />
            </motion.div>
```

- [ ] **Step 6: Verify typecheck and tests pass**

Run: `npm run typecheck && npm test -- src/ui/StartLeaderboard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/StartLeaderboard.tsx src/ui/StartLeaderboard.test.tsx src/App.tsx
git commit -m "feat: add start-screen leaderboard overlay"
```

---

## Task 13: Game-over post form (`GameOverLeaderboard`)

**Files:**
- Create: `src/ui/GameOverLeaderboard.tsx`
- Test: `src/ui/GameOverLeaderboard.test.tsx`

Behavior: on mount, fetch the projected rank for `(pool, score)`. Show a name input
(prefilled from `localStorage['guessthecard.playername']`, editable, min 3 / max 16)
and a post button. On submit, call `submitScore`; on success, save the name, show a
confirmation, and render the global top list for the pool with the player pinned
(`pinned` when the returned rank is outside the visible slice). Disable resubmission.
When the leaderboard is disabled, render nothing.

- [ ] **Step 1: Write the failing test**

Create `src/ui/GameOverLeaderboard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GameOverLeaderboard } from './GameOverLeaderboard';
import * as client from '../leaderboard/client';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(client, 'isLeaderboardEnabled').mockReturnValue(true);
  vi.spyOn(client, 'fetchProjectedRank').mockResolvedValue({ rank: 4, total: 20 });
  vi.spyOn(client, 'fetchTopScores').mockResolvedValue([]);
});

describe('GameOverLeaderboard', () => {
  it('renders nothing when the leaderboard is disabled', () => {
    vi.spyOn(client, 'isLeaderboardEnabled').mockReturnValue(true).mockReturnValue(false);
    const { container } = render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the projected rank', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    await waitFor(() => expect(screen.getByTestId('projected-rank')).toHaveTextContent('#4'));
  });

  it('disables the post button when the name is too short', async () => {
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'ab' } });
    expect(screen.getByTestId('post-btn')).toBeDisabled();
  });

  it('submits and shows a confirmation, persisting the name', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: true, id: 'x', rank: 4 });
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    await waitFor(() => expect(screen.getByTestId('post-confirm')).toBeInTheDocument());
    expect(localStorage.getItem('guessthecard.playername')).toBe('Alice');
    expect(client.submitScore).toHaveBeenCalledWith({ name: 'Alice', score: 5000, correct: 10, pool: 'popular' });
  });

  it('shows an error message when submission fails', async () => {
    vi.spyOn(client, 'submitScore').mockResolvedValue({ ok: false, reason: 'rate-limited' });
    render(<GameOverLeaderboard score={5000} correct={10} pool="popular" />);
    await waitFor(() => screen.getByTestId('name-input'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByTestId('post-btn'));
    await waitFor(() => expect(screen.getByTestId('post-error')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/ui/GameOverLeaderboard.test.tsx`
Expected: FAIL — cannot resolve `./GameOverLeaderboard`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/GameOverLeaderboard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry } from '../leaderboard/types';
import { sanitizeName, NAME_MAX } from '../leaderboard/validation';
import {
  isLeaderboardEnabled,
  fetchProjectedRank,
  fetchTopScores,
  submitScore,
} from '../leaderboard/client';

const NAME_KEY = 'guessthecard.playername';
const VISIBLE = 5;

export function GameOverLeaderboard({
  score,
  correct,
  pool,
}: {
  score: number;
  correct: number;
  pool: PoolKind;
}) {
  const enabled = isLeaderboardEnabled();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [projected, setProjected] = useState<{ rank: number; total: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [posted, setPosted] = useState<{ rank: number; id: string; name: string } | null>(null);
  const [top, setTop] = useState<GlobalEntry[]>([]);

  useEffect(() => {
    if (!enabled || score <= 0) return;
    let cancelled = false;
    fetchProjectedRank(pool, score)
      .then((r) => !cancelled && setProjected(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, pool, score]);

  if (!enabled || score <= 0) return null;

  const valid = sanitizeName(name) !== null;

  async function post() {
    const clean = sanitizeName(name);
    if (!clean) return;
    setStatus('sending');
    const res = await submitScore({ name: clean, score, correct, pool });
    if (!res.ok) {
      setStatus('error');
      return;
    }
    localStorage.setItem(NAME_KEY, clean);
    const list = await fetchTopScores(pool, VISIBLE).catch(() => []);
    setTop(list);
    setPosted({ rank: res.rank, id: res.id, name: clean });
    setStatus('done');
  }

  const ownInTop = posted && top.some((e) => e.id === posted.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 420 }}>
      {projected && (
        <div
          data-testid="projected-rank"
          style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--ink-2)', letterSpacing: 1 }}
        >
          Du wärst auf Platz <span style={{ color: 'var(--ember-hot)' }}>#{projected.rank}</span> von {projected.total + 1}
        </div>
      )}

      {status !== 'done' ? (
        <>
          <input
            data-testid="name-input"
            value={name}
            maxLength={NAME_MAX}
            placeholder="Dein Name"
            onChange={(ev) => setName(ev.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--line-strong)',
              background: 'rgba(20,17,28,0.6)',
              color: 'var(--ink-0)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
            }}
          />
          <button
            className="ember-btn"
            data-testid="post-btn"
            style={{ width: '100%' }}
            disabled={!valid || status === 'sending'}
            onClick={post}
          >
            {status === 'sending' ? 'Wird gepostet…' : 'Aufs Online-Board posten'}
          </button>
          {status === 'error' && (
            <p data-testid="post-error" style={{ color: 'var(--ember-hot)', fontSize: 12, textAlign: 'center', margin: 0 }}>
              Posten fehlgeschlagen — bitte erneut versuchen.
            </p>
          )}
        </>
      ) : (
        <div data-testid="post-confirm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ color: 'var(--ink-0)', fontSize: 13, textAlign: 'center', margin: 0 }}>
            Gepostet! Du bist auf Platz <span style={{ color: 'var(--ember-hot)' }}>#{posted?.rank}</span>.
          </p>
          {/* Lazy import avoided: GlobalScoreList is imported below. */}
          <GlobalBoardPreview
            top={top}
            posted={posted}
            ownInTop={!!ownInTop}
            score={score}
            correct={correct}
            pool={pool}
          />
        </div>
      )}
    </div>
  );
}

import { GlobalScoreList } from './GlobalScoreList';

function GlobalBoardPreview({
  top,
  posted,
  ownInTop,
  score,
  correct,
  pool,
}: {
  top: GlobalEntry[];
  posted: { rank: number; id: string; name: string } | null;
  ownInTop: boolean;
  score: number;
  correct: number;
  pool: PoolKind;
}) {
  const pinned =
    posted && !ownInTop
      ? {
          rank: posted.rank,
          entry: {
            id: posted.id,
            name: posted.name,
            score,
            correct,
            pool,
            country: null,
            createdAt: Date.now(),
          } satisfies GlobalEntry,
        }
      : null;
  return <GlobalScoreList entries={top} highlightId={posted?.id} pinned={pinned} />;
}
```

> Note: keep the `import { GlobalScoreList }` line at the top of the file with the
> other imports when writing it — it is shown lower here only for readability. All
> imports must sit at module top per ES module rules.

- [ ] **Step 4: Move the `GlobalScoreList` import to the top**

Ensure the final file has all imports grouped at the top:

```tsx
import { useEffect, useState } from 'react';
import type { PoolKind } from '../state/highscores';
import type { GlobalEntry } from '../leaderboard/types';
import { sanitizeName, NAME_MAX } from '../leaderboard/validation';
import {
  isLeaderboardEnabled,
  fetchProjectedRank,
  fetchTopScores,
  submitScore,
} from '../leaderboard/client';
import { GlobalScoreList } from './GlobalScoreList';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/ui/GameOverLeaderboard.test.tsx`
Expected: PASS (all five cases).

- [ ] **Step 6: Commit**

```bash
git add src/ui/GameOverLeaderboard.tsx src/ui/GameOverLeaderboard.test.tsx
git commit -m "feat: add game-over score posting"
```

---

## Task 14: Rework `GameOver` to drop the local list

**Files:**
- Modify: `src/ui/GameOver.tsx`

Remove the local `HighscoreList` from game-over; render `GameOverLeaderboard`
between the score block and the action buttons. Keep the share/play-again/menu
buttons and the "New record" framing (which still reads from the store's local
highscores).

- [ ] **Step 1: Update the imports**

In `src/ui/GameOver.tsx`, replace:

```tsx
import { HighscoreList } from './HighscoreList';
```

with:

```tsx
import { GameOverLeaderboard } from './GameOverLeaderboard';
```

- [ ] **Step 2: Remove the local highscore selector usage for the list**

The `highscores` selector is still used for the `best`/`isBest` "New record"
framing — keep that line:

```tsx
  const highscores = useGameStore((s) => s.highscores);
```

- [ ] **Step 3: Replace the HighscoreList block**

Replace this block:

```tsx
      <div style={{ width: '100%', maxWidth: 420 }}>
        <HighscoreList
          entries={highscores}
          highlight={(e) => e.score === totalScore && e.correct === correctCount}
        />
      </div>
```

with:

```tsx
      <GameOverLeaderboard score={totalScore} correct={correctCount} pool={poolKind} />
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS. (If `highscores` is now unused, remove its selector line and the
unused `best`/`isBest` only if they become unused — `best`/`isBest` should remain.)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS. Existing `highscores.test.ts` and other suites stay green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/GameOver.tsx
git commit -m "feat: show online leaderboard on game-over instead of local list"
```

---

## Task 15: Build, full test, and real-render verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `tsc -b` + `vite build` succeed with no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 3: Start the dev server with env configured**

Ensure `.env` (from Task 6) is present, then start the preview dev server
(`preview_start`). The leaderboard features must be enabled (env present).

- [ ] **Step 4: Verify the start-screen leaderboard renders**

Open the app, click "Leaderboard", switch across the All / Popular / Me tabs.
Capture a `preview_screenshot` of the open overlay. Confirm: three tabs, global
rows render with flag/name/correct/score/age, "Me" shows local entries, "Mehr
anzeigen" expands.

- [ ] **Step 5: Verify the game-over post flow end-to-end**

Play a quick game (or use the dev shortcut), reach game-over, confirm the projected
rank shows, enter a name (≥3 chars), post, and confirm the success state + the
player's row appears/pins. Capture a `preview_screenshot`. Verify via
`preview_network` that the `submit-score` function call returned `{ ok: true }`.

- [ ] **Step 6: Verify graceful disable**

Temporarily rename `.env`, restart the dev server, and confirm the game still runs,
the game-over screen shows only the result (no post form), and the start-screen
"Leaderboard" button's global tabs show the empty/disabled state without errors in
`preview_console_logs`. Restore `.env` afterward.

- [ ] **Step 7: Commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test: verify leaderboard rendering and post flow"
```

---

## Task 16: GitHub Pages deployment configuration

**Files:**
- Inspect/modify: the GitHub Actions workflow that builds Pages (if present under `.github/workflows/`)

- [ ] **Step 1: Locate the Pages build workflow**

Run: `ls .github/workflows 2>/dev/null && grep -rl "vite build\|npm run build" .github/workflows 2>/dev/null`
Expected: identifies the workflow file (or confirms none exists yet).

- [ ] **Step 2: Inject the env vars at build time**

In the build step of the Pages workflow, expose the two public values as build env
(set them as repository **Variables**, not secrets, since they ship in the bundle):

```yaml
      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
```

If no Pages workflow exists, document in the PR description that the deployer must
set these two repository variables and inject them at build; do not fabricate a new
deploy pipeline here.

- [ ] **Step 3: Add the repository variables**

In the GitHub repo settings → Secrets and variables → Actions → Variables, add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the project's values.

- [ ] **Step 4: Commit (if the workflow was modified)**

```bash
git add .github/workflows
git commit -m "ci: inject supabase env into pages build"
```

---

## Self-Review Notes

- **Spec coverage:** §4 data model → Task 7. §5 Edge Function (validation, sanitize,
  ip_hash, country, rate-limit, rank) → Task 8. §6 client (`isLeaderboardEnabled`,
  `fetchTopScores`, `fetchProjectedRank`, `submitScore`, validation, types) → Tasks
  2–5. "Me" = local store → Task 11 (reuses `HighscoreList` + `loadHighscores`). §7
  game-over (no local list, projected rank, post form, highlight/pin) → Tasks 13–14;
  start-screen 3 tabs + top5→top100 → Tasks 11–12; row columns (flag/name/correct/
  score/age) → Task 10. §8 graceful degradation → Tasks 13 (disabled returns null),
  15 step 6. §9 privacy (hashed IP, country only, no HMAC) → Task 8. §10 testing →
  per-task tests + Task 15. §11 deployment → Tasks 6, 16.
- **Pinning identity:** own-row pinning is implemented only at game-over using the
  just-posted `id`/`rank` (Task 13), matching the spec's "no persistent device
  identity" decision; start-screen global tabs do not pin.
- **Type consistency:** `PoolKind` imported from `src/state/highscores.ts`
  everywhere; `GlobalEntry`/`SubmitPayload` from `src/leaderboard/types.ts`;
  `submitScore` returns the `SubmitResult` union used by Task 13; `fetchTopScores`
  signature `(pool, limit)` matches calls in Tasks 9/11/13.
- **Validation parity:** the client `validation.ts` (Task 2) and the Edge Function
  (Task 8) intentionally duplicate the same constants/bounds; they must stay in sync
  if scoring rules change.
