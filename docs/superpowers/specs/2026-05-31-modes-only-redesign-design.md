# Modes-Only Redesign

**Date:** 2026-05-31
**Status:** Approved for planning

## Goal

Collapse the app from a multi-menu tree (Sets browser, Custom Modes submenu,
all/popular pools, local "me" board) into a single start screen: a list of
playable game modes plus one **Create Mode** button. Simplify the entry point,
make every mode a head-to-head target, and push players to keep chasing new
high scores instead of beating themselves repeatedly in one mode.

## Non-Goals

- No real accounts / cross-device login (anonymous device-ID only).
- No change to the reveal-mode rendering engines themselves.
- No change to the Time Attack scoring engine.

## Core Concepts

### Identity — anonymous device-ID

- On first load, generate a UUID and persist it as `localStorage['guessthecard.deviceid']`.
- Display name stays in `localStorage['guessthecard.playername']`, entered once
  and sent with every score submission.
- The leaderboard's dedup key is **`(mode_id, game_mode, device_id)`** — the
  best score per device wins; the displayed name is whatever that device last
  submitted.
- Existing rows (no device_id) are backfilled with `device_id = 'legacy:' || name`
  during migration, so no historical scores are lost.

### Leaderboard model — per `(mode, reveal_mode)`

This **reverses** the recent "one person, many badges" aggregation. Because
lockout, the reveal-mode picker, and deeplinks all operate per reveal_mode,
**each `(mode_id, game_mode)` pair is its own board**, listing distinct devices
by best score.

- The time-window scope filter (24h / 1 Week / All-Time) is retained.
- The "all" / "popular" pool filter is removed.
- The local "me" board is removed.

### Rank-1 lockout

- A device that is **rank 1** in a specific `(mode, reveal_mode)` board may not
  play that combo again.
- The picker greys out that reveal_mode with the message
  *"Lass auch anderen eine Chance."*
- Lockout is evaluated against the **All-Time** board (not the windowed view).

## Screens

### 1. Start screen

- A vertical list of mode cards: the 3 seeded modes + any user-created custom
  modes (from `mode_list` where `kind = 'custom'`).
- Each card shows the mode name and a compact best-score peek.
- **Sort order — by the player's standing:** modes where the device has *no*
  placement first → … → modes where the device is rank 1 last.
  - A mode has 6 reveal_modes, so the sort key is the device's **best rank
    across the mode's reveal_modes**. "No score in any reveal_mode" is treated
    as the best (top-of-list) position. Ties broken by mode name.
- A single **Create Mode** button at the bottom. It merges the former Sets
  picker and the attribute builder into one filter flow (sets + attribute
  filters in the same builder, governed by existing `validateFilter` rules).

### 2. Mode → reveal-mode picker

- Tapping a mode opens the reveal-mode selection: all 6 reveal_modes, each row
  showing that `(mode, reveal_mode)` board's **top-1 player + score**.
- Combos where the device is rank 1 are greyed out with the lockout message.
- Selecting any playable reveal_mode starts the game immediately.

### 3. Gameplay

- The HUD additionally displays the active **mode name** during play.

### 4. Game over

- Score submission as today (now carrying `device_id`).
- A **"Nächsten Highscore knacken"** button auto-advances to a new game:
  - Target selection: among all `(mode, reveal_mode)` combos where the device is
    **not** rank 1 **and** the board has **≥1 other player's** score, prefer the
    combo where the device has the **fewest / no points**.
  - If no combo qualifies, the button is hidden.

## Deeplinks

- URL shape: `?m=<modeId>&r=<reveal>` (query params on the existing SPA route).
- A **Share** button on each `(mode, reveal_mode)` board copies this URL.
- On open with both params present:
  1. Resolve the mode by id.
  2. If the display name is unset, prompt for it once.
  3. **Auto-start** the game with that mode + reveal_mode.
  - **Exception:** if the device is already rank 1 in that combo, do not
    auto-start — land on the picker with that reveal_mode locked.
- Malformed / unknown `m` or `r` → fall back to the start screen.

## Seeded modes

Seeded via migration into the `mode` table as `kind = 'custom'` rows, each with
a stable `filter_hash` (so they appear in `mode_list` alongside user-created
modes and dedupe naturally if a user later builds the same filter):

| Name           | Filter                                          |
|----------------|-------------------------------------------------|
| Top 100 EDHRec | `{ edhrec: { max: 100 } }`                       |
| Top 1000 EDHRec| `{ edhrec: { max: 1000 } }`                      |
| Simic          | `{ colors: { values: ['U','G'], match: 'all' } }`|

**Note on Simic:** the `get_filtered_game_cards` RPC matches a card's *colors*,
not its EDH *color identity*. So this Simic pool means "cards that are literally
both blue and green," which is narrower than commander {U,G} identity. Accepted
as-is; no RPC change.

## Data / Backend Changes

1. **Migration `0009`:**
   - Add `device_id text` to `leaderboard`; backfill `'legacy:' || name`.
   - Drop the `(mode_id, coalesce(game_mode,''), name)` unique index from `0008`.
   - Add unique index on `(mode_id, coalesce(game_mode,''), device_id)`.
   - Seed the 3 modes (idempotent on `filter_hash`).
2. **Edge function `submit-score`:** accept and store `device_id`; dedup by
   `(mode_id, game_mode, device_id)` keeping best; reject submissions to a combo
   where the device is already rank 1 (server-side enforcement of lockout).
3. **Leaderboard read path:** per `(mode, reveal_mode)` board with the existing
   time-window filter; drop the by-person aggregation.

## Frontend Changes (high level)

- `state/gameStore.ts` — phases gain a "picker" step; deeplink bootstrap on load;
  post-game auto-advance target resolution.
- Identity helper — generate/read `device_id`.
- New start-screen mode list (replaces current start UI); remove Sets browser,
  Custom Mode submenu, all/popular toggle, local me board.
- Reveal-mode picker component with per-combo top-1 and lockout.
- `leaderboard/client.ts` — per-combo fetch, standing/rank helpers, "fewest
  points" target query; drop `aggregate.ts` badge logic.
- HUD shows mode name. Share button + URL param parsing.

## Error Handling

- Card DB unconfigured / RPC error → existing error phase, unchanged.
- Deeplink with bad params → start screen.
- Rank-1 device attempting a locked combo (via stale UI or direct deeplink) →
  server rejects with a clear reason; client shows the lockout message.
- Name still required before any submission (existing validation).

## Testing

- Unit: identity helper, standing/sort key, lockout predicate, auto-advance
  target selection, deeplink param parse/serialize.
- Component: start-screen sort order, picker lockout greying, game-over
  auto-advance button visibility.
- Backend: migration dup-collapse + index swap (preview row counts first);
  edge-function dedup-by-device + rank-1 rejection.
- E2E (Playwright): seeded mode → pick reveal → play → game over →
  auto-advance; deeplink open → auto-start; rank-1 lockout path.

## Open Questions (resolved)

- **A. Legacy rows:** backfill `device_id = 'legacy:' || name`. *(resolved)*
- **B. Mode sort key:** best rank across the mode's reveal_modes; no score = top.
  *(resolved)*
- **C. Simic semantics:** literal U+G card colors, no RPC change. *(resolved)*

## Suggested Implementation Phases

1. **Identity + data:** device-ID helper, migration 0009 (column, index swap,
   seed), `submit-score` device_id + server lockout.
2. **Board model:** per-combo leaderboard read path; remove aggregation,
   all/popular, local-me.
3. **Screens:** start-screen mode list + sort, reveal-mode picker + lockout,
   HUD mode name, Create Mode merged builder.
4. **Deeplinks + auto-advance:** URL params, share button, deeplink bootstrap,
   post-game "Nächsten Highscore knacken".
