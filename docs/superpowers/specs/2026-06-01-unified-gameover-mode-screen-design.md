# Unified game-over / mode screen + login-gated leaderboard entry

**Date:** 2026-06-01
**Status:** Approved (brainstorming) — ready for implementation plan

## Problem

After a game ends, the app shows a bespoke game-over screen
(`GameOver` + `GameOverLeaderboard` + `GameOverOnboard`) that is visually and
structurally different from the mode-detail screen shown when a player taps a
mode on the start list (`RevealPicker`). Two screens drift apart and duplicate
intent (both show a per-mode leaderboard + the reveal-mode list).

Separately, the current flow **auto-posts** a leaderboard entry on the first
score submit (lazy anonymous sign-in) and asks for a name via an inline
onboarding overlay. We want the leaderboard entry to be created **only after the
player has an account** (a chosen display name), with the name set exclusively
in the profile / User Settings.

## Goals

1. After a game ends, show the **same screen** as tapping a mode — one shared
   screen, no drift — with the just-revealed card artwork kept on top.
2. Show the player their result as a **pinned "your run" row** at the rank they
   achieved (or would achieve).
3. A player **without a name** sees **LOGIN** in that row instead of a name.
   Tapping it opens User Settings, where they create an account (anonymous is
   fine — no email/Google required). The leaderboard entry is created **only
   once a name is saved**; the just-finished run is then auto-posted and the row
   shows rank + name.

## Definitions

- **"Logged in" / "account created"** = the player has a `display_name` in
  `profiles`. Email/Google linking is an optional sync extra, not required.
- The display name can be set **only in the profile** (`ProfilePanel`), which
  opens when the player taps LOGIN.

## Non-goals

- No change to scoring, reveal modes, or the submit-score edge function's
  JWT verification.
- No merging of anonymous accounts; no migration of old scores.
- No email/SMTP work.

## Architecture

### New component: `ModeDetail`
Extracted from `RevealPicker`. Renders the shared mode-detail body:
- Mode header (name), `FilterChips`, card-count line.
- `LEADERBOARD` / `RECENT GAMES` tabs with run rows (+ "More" paging).
- Reveal-mode list (per-reveal leader, share button), idle-hint behaviour.

Props:
- `modeId: string | null`
- `modeName: string`
- `filter: CustomFilter`
- `cardCount?: number`
- `pendingRun?: PendingRun` — present only in the game-over context.
- `onLogin?: () => void` — open User Settings (game-over context only).

`ModeDetail` must tolerate `modeId === null` (brand-new / unplayed mode): no
existing board, projected rank renders as `#1`, the pending run is the only row.

### `RevealPicker` (idle)
Becomes a thin wrapper that renders `ModeDetail` from its `CustomMode`
(`modeId = mode.id`, no `pendingRun`, no `onLogin`). Existing idle behaviour
unchanged.

### Game-over (in `App.tsx`)
On `phase === 'gameover'`:
- Keep `GameOverArtwork` (revealed card) on top.
- Render `ModeDetail` for the just-played mode, sourced from the game store
  (`currentModeId`, `currentModeName`, `currentModeFilter`, card count if
  available), with `pendingRun = { score, correct, cards, gameMode }` and
  `onLogin` wired to open the profile overlay (below).

### Deleted
`GameOver.tsx`, `GameOverLeaderboard.tsx`, `GameOverOnboard.tsx`. Their posting
logic moves into the `usePendingRun` hook.

### New hook: `usePendingRun`
Owns the result/posting lifecycle so `ModeDetail` stays presentational.

Input: the pending run (`score, correct, cards, gameMode`), `modeId`,
`modeFilter`.

Behaviour on mount (only when leaderboard enabled and `score > 0`):
1. Resolve the player's name from their profile (`getProfile().displayName`).
2. Fetch the **projected rank** (`fetchModeProjectedRank`); if `modeId` is null,
   project as `#1 of 1`.
3. **If a name exists → auto-post** (lazy-create the mode for unplayed
   sets/customs via `findExistingMode`/`createMode`, then `submitScore`); store
   the actual posted rank.
4. **If no name → `needsLogin = true`; do not post.** Hold the run data.

Exposes: `{ status, projectedRank, postedRank, postedId, needsLogin, postNow() }`.

- `postNow()` runs the same post path; called after a name is saved during the
  account-creation flow.
- Optimistic leader promotion for the just-played reveal mode (current
  `handlePosted` behaviour) is preserved so the reveal-mode row reflects the new
  score immediately.

## The "your run" row + LOGIN

In the `LEADERBOARD` tab the pending run is inserted as a **highlighted pinned
row** at its projected (pre-post) or actual (post) position. In `RECENT GAMES`
it appears at the top ("just now"). Row layout:

```
#<rank> · <flag> · <name | LOGIN> · <reveal label> · <score>
```

- **No name:** the name cell is an ember-styled **LOGIN** button → `onLogin`.
  Rank and score remain visible.
- **Name present:** the run auto-posts; the row shows the real name + rank and
  no LOGIN.

Reuse the existing pinned-row behaviour from `GlobalScoreList` where practical.

## LOGIN → User Settings → auto-post flow

1. Tapping LOGIN opens `ProfilePanel` as an **overlay** over the game-over
   screen (new App state, e.g. `gameOverProfileOpen`). This keeps the run in the
   store — no `reset()`, no phase change.
2. `ProfilePanel` gains an optional `onNameSaved` callback. When opened for
   account creation it must `ensureUserId()` first, because
   `handleNameSave` bails on `!uid` and a brand-new player has no anon session
   yet.
3. On a successful name save with `onNameSaved` present: close the overlay and
   call `usePendingRun.postNow()`. The pinned row now shows rank + name.

## Edge cases & reset

- **Home/Back** in game-over still `reset()`s to the menu. An unposted run
  (player declined LOGIN) is discarded by design.
- **Score 0 or leaderboard disabled:** render `ModeDetail` with no pending-run
  row and no LOGIN.
- **Unplayed mode (`modeId === null`):** board empty, pending run projects as
  `#1`; mode is lazy-created on post.

## Testing

- **Unit**
  - `usePendingRun`: name present → posts and exposes `postedRank`; no name →
    `needsLogin`, nothing posted; `postNow()` posts after name set.
  - `ModeDetail`: renders the pending row with LOGIN when nameless; with
    rank + name after posting; tolerates `modeId === null`.
  - Move/adapt existing `RevealPicker` tests onto `ModeDetail`; replace the
    `GameOver*` tests.
- **Browser smoke:** play a game → game-over shows the unified screen with the
  card on top → LOGIN opens User Settings → save a name → return shows the
  pinned row ranked with the name.

## Files (anticipated)

- New: `src/ui/ModeDetail.tsx`, `src/state/usePendingRun.ts` (or `src/leaderboard/usePendingRun.ts`).
- Changed: `src/ui/RevealPicker.tsx` (thin wrapper), `src/App.tsx` (game-over
  renders `ModeDetail` + profile overlay), `src/ui/ProfilePanel.tsx`
  (`onNameSaved` + `ensureUserId` on account creation).
- Deleted: `src/ui/GameOver.tsx`, `src/ui/GameOverLeaderboard.tsx`,
  `src/ui/GameOverOnboard.tsx`.
