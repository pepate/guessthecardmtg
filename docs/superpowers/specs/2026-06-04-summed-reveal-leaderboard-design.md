# Summed-per-reveal leaderboard

Date: 2026-06-04

## Goal

Change a pool's leaderboard so a player's standing is the **sum of their best
score in each reveal mode**, not a single best run. This rewards playing every
reveal mode. The mode-detail screen, the in-game projected rank, the game-over
popup, and the Daily Set all follow the new scheme.

## Scoring model

For one pool (mode_id), each device keeps its best run per reveal mode (already
enforced by the DB: one row per `(mode_id, game_mode, device_id)`).

- **Player total** = Σ over reveal modes of `max(score)` that device has in that
  reveal. A device with rows in 3 reveals sums those 3 bests.
- **Leaderboard** ranks devices by total, descending. Tiebreak: older first
  (earliest `createdAt` among the device's runs).
- No reveal tag on leaderboard rows (the total spans reveals).

## Components

### 1. Aggregation — `src/leaderboard/boards.ts` (pure)
- `summedBoard(runs: Run[]): GlobalEntry[]` — group by `deviceId`; for each device
  sum the max score per `gameMode` (ignore runs with `gameMode === null`); produce
  one `GlobalEntry` whose `score` is the total, `gameModes` the reveals they have
  (highest-points first), `name`/`country`/`deviceId` from the device's best run,
  `createdAt` = earliest run's createdAt (for tiebreak). Sort: total desc, then
  createdAt asc, then deviceId for determinism.
- `ownBestPerReveal(runs, deviceId): Map<RevealMode, number>` — that device's best
  score per reveal (absent reveal ⇒ not in map; callers treat as 0).
- `summedRank(board: GlobalEntry[], deviceId): number | null` — 1-based index of the
  device in `summedBoard`, or null if absent.
- `projectedSummedRank(runs, deviceId, reveal, newScore): { total: number; rank: number }`
  — compute the device's totals as if a new run of `newScore` in `reveal` were
  applied (replaces that reveal's best only if higher); rank = count of OTHER
  devices whose existing total > the projected total, +1.
- Keep `comboBoard`, `revealLeaders`, `isRank1`, `pickAutoAdvance`, `deviceModeStanding`
  for the Daily single-reveal board and any other callers (unchanged).

### 2. Mode-detail — `src/ui/ModeDetail.tsx`
- **LEADERBOARD tab**: render `summedBoard(runs)` — one row per player ranked by
  total, **no reveal tag**. The pending run is inserted at its projected rank
  (from `projectedSummedRank`) with the projected total as its score.
- **RECENT tab**: unchanged (recent individual runs).
- **"Your standing" row** above the "Pick a reveal mode" section: the current
  device's **rank** (or "—") and **summed total** (0 if none).
- **Reveal list**: replace the per-reveal global leader with the device's **own
  best score** in that reveal; the row label is the **reveal mode's name**
  (`REVEAL_MODE_LABELS`), icon unchanged. Sort enabled reveals by own score desc,
  ties alphabetical by reveal label (0-point reveals fall to the bottom).
- Drop `fetchRevealLeaders` usage; the screen already loads `fetchModeRuns(modeId)`
  and derives everything from it. Need the current `deviceId` (`getUserId()`).

### 3. In-game projection — `src/leaderboard/usePendingRun.ts`
- Replace `fetchModeProjectedRank` (single-best) with the summed projection: load
  `fetchModeRuns(modeId)` + `getUserId()`, then `projectedSummedRank(...)` for the
  just-played run. Expose `projectedTotal` and `projectedRank` (pool total rank).
- After posting, recompute from a fresh `fetchModeRuns` so `postedRank`/total
  reflect the stored row (don't trust the edge function's single-best rank).

### 4. Game-over popup — `src/ui/GameResultModal.tsx` + `src/App.tsx`
- Show the single-run score large (as today), and beneath it the new **pool total**
  and **total rank** ("Rank #N").
- New **"Next mode"** button: visible only when the pool has an enabled reveal mode
  the device has **0** points in (and the game is not a Daily lock). Tapping it
  starts a new game in the same pool with that reveal (first 0-point reveal in the
  reveal-list sort order). Wire `onNextMode` in `App.tsx` (reuse `selectPool` with
  the chosen reveal). Keep existing Replay / Share / Close / Save-my-rank.

### 5. Daily Set — apply summed scheme + remove the 3-play cap
- The Daily Set is single-reveal, so its summed board equals its single-reveal best
  board (no visual change there). The real change: **unlimited plays**.
- `supabase/functions/submit-score/index.ts`: remove the daily-limit block (the
  `daily_set` lookup + 3-per-Berlin-day rejection). Keep the 5/60s rate limit.
  **Requires redeploy** (`supabase functions deploy submit-score`).
- `src/ui/DailySetModal.tsx`: remove "3/3 plays left today" and the
  play-disabled-when-0 state; Play is always enabled.
- `src/daily/client.ts`: drop `playsUsed` (and its query) from `DailyToday`.
- `src/App.tsx` / `src/ui/ModeDetail.tsx`: remove the `playsLeft`/`dailyPlaysLeft`
  gating around the Daily replay; daily replay is always allowed. "Next mode" stays
  hidden for Daily (locked single reveal).

## Edge cases
- Guest / no session / no runs: total 0, rank "—", every reveal shows 0; "Next mode"
  targets the first enabled reveal.
- Runs with `gameMode === null` (legacy/unknown): excluded from the summed total and
  the reveal list.
- Pool with one enabled reveal: summed total == that reveal's best (degenerate but
  correct); "Next mode" hidden once that reveal has points.

## Testing
- Pure (`boards.ts`): `summedBoard` (sum of per-reveal bests, tiebreak), 
  `ownBestPerReveal`, `summedRank`, `projectedSummedRank` (new score replaces only
  if higher; rank vs other devices), and the "next 0-point reveal" selection helper.
- `ModeDetail`: leaderboard tab shows summed totals without reveal tags; your-standing
  row; reveal list shows own best + reveal-name labels sorted by own score.
- `GameResultModal`: renders single-run + total + rank; "Next mode" shows only when a
  0-point reveal exists and fires `onNextMode`.
- `DailySetModal`: no plays-left UI; Play always enabled.
- Edge function: daily cap removed (manual verification + redeploy).

## Out of scope
- Cross-pool/global aggregation (rank is per-pool).
- Server-side aggregation RPC (done client-side from `fetchModeRuns`, ≤500 rows).
- Changing the per-(mode,reveal,device) storage model.
