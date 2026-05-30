# Global Leaderboard — Design

**Date:** 2026-05-30
**Status:** Approved design, pending implementation plan

## 1. Goal

Let players optionally publish their score to a global, online leaderboard
(arcade-style: opt-in, enter a name), backed by Supabase. The existing local
highscore stays in `localStorage` for internal use (e.g. "Share best score"),
but is no longer rendered as its own list.

## 2. Scope

In scope:
- Supabase project + `leaderboard` table + read-only view + `submit-score` Edge Function.
- Client integration (`@supabase/supabase-js`), submission + read APIs, graceful
  disable when unconfigured.
- Game-over: show the just-played result and its projected global placement; let
  the player post it under a name.
- Start screen: a single leaderboard area with three tabs (Global All Cards,
  Global Popular, Me), default top 5, expandable to top 100.
- Country flag derived server-side from IP (country code only, IP never stored).

Out of scope:
- User accounts / authentication.
- Competitive-grade anti-cheat (see §9).
- Moderation tooling beyond a basic profanity wordlist.

## 3. Architecture

Approach: **direct anon reads + Edge Function writes**.

- Reads go directly through the public anon key against a read-only view.
- Writes go through the `submit-score` Edge Function, which validates, sanitizes,
  rate-limits, derives country, and inserts using the service role.
- Row-Level Security blocks all direct anon access to the base table, so the only
  path onto the board is the validating function.

## 4. Data model

### Table `public.leaderboard`

| column | type | notes |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `name` | text | sanitized, 3–16 chars |
| `score` | int | total points, `>= 0` |
| `correct` | int | cards correct, `0..40` |
| `pool` | text | `CHECK (pool IN ('popular','all'))` |
| `country` | text | nullable, 2-letter ISO 3166-1 alpha-2 (uppercase) |
| `ip_hash` | text | SHA-256 of `ip + IP_HASH_SALT`; **never exposed** |
| `created_at` | timestamptz | default `now()` |

Index: `(pool, score DESC, created_at ASC)` for top-N per pool. Ranking order is
**score DESC, then created_at ASC** (older equal score ranks higher).

### View `public.leaderboard_top`

Exposes only `id, name, score, correct, pool, country, created_at`. `ip_hash` is
never selectable. Anon role is granted `SELECT` on the view only.

### RLS

- `leaderboard`: RLS enabled, **no** anon policies → no direct anon read/write.
- The Edge Function uses the service role (bypasses RLS) for inserts and for
  rate-limit count queries.

## 5. Edge Function `submit-score`

Input JSON: `{ name: string, score: number, correct: number, pool: 'popular' | 'all' }`.

Steps:
1. **Validate** (shared logic, see §6): `pool` valid; `correct` integer in `0..40`;
   `score` integer and within `correct × [100, 1000]`; `score === 0` iff `correct === 0`.
2. **Sanitize name**: trim, collapse internal whitespace, strip control chars, cap
   at 16; reject if fewer than 3 visible chars; basic profanity wordlist filter.
3. **Derive from IP** (the function already sees the IP):
   - `ip_hash = sha256(ip + IP_HASH_SALT)`.
   - `country`: 2-letter code from the platform geo header if present, else a free
     IP→country lookup; null if unavailable. The raw IP is used transiently and
     never stored.
4. **Rate-limit**: reject (HTTP 429) if the same `ip_hash` has more than ~5 inserts
   in the last 60 seconds.
5. **Insert** via service role.
6. **Respond**: `{ ok: true, id, rank }`, where `rank = 1 + count(score > inserted score)`
   for that pool. On rejection: `{ ok: false, reason }` with an appropriate status.

Secrets: `IP_HASH_SALT` (set via Supabase secrets); the service-role key is provided
automatically in the function environment.

## 6. Client (`src/leaderboard/`)

- New dependency: `@supabase/supabase-js`.
- `validation.ts` — pure `sanitizeName(raw): string | null` and
  `validateSubmission(payload): boolean`. Shared by client (instant UX feedback)
  and conceptually mirrored by the Edge Function. Unit-tested.
- `client.ts`:
  - `isLeaderboardEnabled(): boolean` — true only when both env vars are set.
  - `fetchTopScores(pool, limit): Promise<GlobalEntry[]>` — reads `leaderboard_top`.
  - `fetchProjectedRank(pool, score): Promise<{ rank: number; total: number }>` —
    count-based, works for any score (also outside the top list).
  - `submitScore(payload): Promise<{ ok: true; id; rank } | { ok: false; reason }>` —
    invokes the Edge Function.
- `useLeaderboard.ts` — hook managing entries / loading / error per pool and the
  expand (top 5 ↔ top 100) state.
- `mine.ts` — tracks this device's posted entries in `localStorage`
  (`{ id, name, score, correct, pool, country, created_at }[]`). Appended on each
  successful submit. Powers the "Me" tab and own-row pinning.
- Config: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key is publishable;
  shipping it in the static bundle is standard). When unset, all global features
  hide and the game still works offline.

### Types

```ts
interface GlobalEntry {
  id: string;
  name: string;
  score: number;
  correct: number;
  pool: 'popular' | 'all';
  country: string | null; // ISO alpha-2, uppercase
  createdAt: number;       // epoch ms
}
```

## 7. UI

### Shared presentational `GlobalScoreList`

A row shows: rank `#`, flag (emoji from `country`, omitted if null), name, correct
count, score, and **relative age** of the entry (e.g. "vor 3 Std."). Supports a
`highlightId` for the player's freshly posted row.

Display rules (used everywhere the global board appears):
- Default shows **top 5** (start screen, collapsed) or the relevant slice.
- Expandable to **top 100** ("Mehr anzeigen").
- If the viewer's own best entry for the current pool (from `mine.ts`) ranks
  **outside** the visible range, pin that row at the bottom separated by a small
  gap/ellipsis (e.g. `… · #347 · YOU`).

Flag rendering: convert the 2-letter code to regional-indicator emoji client-side.

### Game-over screen (`GameOver.tsx`)

Local top-5 list is **removed** here. New layout:
1. Result (correct count + animated score) — unchanged.
2. **Projected global placement** for the played pool: "Du wärst auf Platz #X von N"
   (via `fetchProjectedRank`).
3. **Post form**: name input (autofocus, prefilled from last-used name in
   `localStorage`, editable, min 3 / max 16) + "Aufs Online-Board posten" button.
   Inline validation feedback using `sanitizeName`/`validateSubmission`.
4. After a successful post: confirmation + a `GlobalScoreList` slice for that pool
   with the new row highlighted; the post form is disabled for this run, and the
   name is saved for next time.
5. Errors (network / rejected / rate-limited) show inline and never block "Play
   again" / "Back to menu".
6. When the leaderboard is disabled/offline: steps 2–4 are skipped; only the result
   shows. The local highscore is still saved internally as today.

### Start screen

A single **leaderboard area** with three tabs:
1. **Global All Cards** — global board for the `all` pool.
2. **Global Popular** — global board for the `popular` pool.
3. **Me** — this device's posted scores (from `mine.ts`), each with flag + current
   global rank for its pool. Empty state when nothing posted yet.

Collapsed by default to top 5; tapping/expanding reveals up to top 100. The
leaderboards are **not** shown side by side — one area, switched by tab. Opened as
an overlay toggled by `useState` in `App.tsx` (no new game phase). The local
highscore is not shown as its own list anywhere.

## 8. Error handling & graceful degradation

- No env config → `isLeaderboardEnabled()` false → all global UI hidden; local
  highscore + share still work.
- Read failure → tab shows an inline error with retry; rest of the screen works.
- Submit failure → inline message, retry allowed, game-over actions unaffected.
- Country lookup failure → `country` null → row renders without a flag.

## 9. Security & privacy

- Anti-cheat is **light** by design: the score is computed client-side and cannot
  be fully verified server-side without re-simulating the game. The Edge Function
  raises the bar by rejecting implausible values, sanitizing names, rate-limiting,
  and blocking direct table inserts via RLS. This is acceptable for a casual board.
- A purely client-side HMAC is intentionally **not** used: the secret would ship in
  the public bundle and provide no real protection.
- Privacy: the raw IP is processed only transiently (to derive a salted hash and a
  coarse country code) and is never stored. Only the country code and a salted hash
  are persisted. No accounts, no tracking.

## 10. Testing

- Unit: `sanitizeName` / `validateSubmission` (bounds, min-3, max-16, control chars,
  whitespace, profanity).
- Client: mocked supabase — `fetchTopScores` mapping, `fetchProjectedRank`,
  `submitScore` success/error paths, `mine.ts` persistence.
- UI: mocked client — game-over post flow (projected rank → submit → highlighted
  row, name persisted), start-screen tab switching and top-5↔top-100 expansion,
  own-row pinning when outside the visible range, graceful disable when
  unconfigured.
- Existing local-highscore unit tests remain valid (logic unchanged).
- Real-render verification: a preview screenshot of the new UI before declaring it
  done (not just mocked tests).

## 11. Deployment

- Supabase project, table, view, RLS, and Edge Function are created via the
  Supabase MCP server (installing the MCP updates the Claude config and likely
  needs a Claude Code restart to load — flag this at that step).
- Edge Function secret: `IP_HASH_SALT`.
- Static site (GitHub Pages): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set
  as repo variables and injected at build. Add a `.env.example` documenting both.
