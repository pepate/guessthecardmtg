# Game-over identity flow + leaderboard data-model refactor

Date: 2026-05-31

## Goal

Tighten the identity model so a player's name and home country live **only** on
their profile, fix a state bug that re-prompts logged-in players for a name, give
brand-new players a proper game-over onboarding overlay, and make the "Random"
button actually random.

## Scope (what's still open)

1. Random button → genuinely random mode + reveal.
2. State-check fix → logged-in players are never re-prompted for a name.
3. Game-over onboarding overlay for players without a name yet.
4. Leaderboard data-model refactor → store only a profile reference; move name +
   country to the profile; drop per-row `name`, `country`, `ip_hash`.
5. Editable home-country dropdown in the profile.

---

## 1. Random button (fully random)

**Now:** the "Random game" FAB calls `fetchAutoAdvanceTarget` — the deterministic
"next highscore to chase" — so it always launches the same game.

**Change:**
- New `startRandomGame()` in `src/modes/quickStart.ts`: pick a uniformly random
  mode from `listModes()`, `setRevealChoice('random')` (the store already resolves
  `'random'` to a random *enabled* reveal mode), then `selectPool(...)`.
- `StartModes` "Random game" FAB calls `startRandomGame()`; it shows whenever any
  mode exists (no longer gated on `nextTarget`). Mobile two-tap reveal kept.
- Remove the now-unused `nextTarget` state + `fetchAutoAdvanceTarget` wiring from
  `StartModes`. (`fetchAutoAdvanceTarget`/`pickAutoAdvance` may stay exported but
  unused; remove only the StartModes import to keep it lint-clean.)

## 2. State-check fix (no re-prompt for known players)

**Bug:** `GameOverLeaderboard`'s auto-post effect uses only `localStorage[NAME_KEY]`.
On a new device, a logged-in player has a profile `display_name` but empty
localStorage → they are prompted, and the entered name overwrites their profile.

**Change:** auto-post resolves the name from the **server profile** (`getProfile`)
as the source of truth. If the profile has a `display_name` → auto-post with it
(seed localStorage too) and never show the onboarding overlay. Only show the
overlay when no profile `display_name` exists yet.

## 3. Game-over onboarding overlay (new players only)

A modal overlay over the end screen, shown when: leaderboard enabled, score > 0,
and the player has **no** profile `display_name`.

**Contents**
- Short explanation of why a name is needed (it's their leaderboard identity).
- **Name input** (required) with **live availability check** (`checkNameAvailable`,
  debounced) plus the server-side unique constraint as the guarantee.
- **Projected rank** — "You'd be ranked #X of Y" via the existing
  `fetchModeProjectedRank(modeId, score)`.
- A note: no email required; email is optional and only for syncing the account
  to another device.

**Actions**
- **Primary "Save & post":** validate name (length + available) → post the score
  (`submitScore`, which sets the profile name via `bump_profile_stats`) → close
  overlay → end screen shows the posted result + board.
- **Secondary "Add email to sync":** performs the **same save + post first**
  (never lose the run), then navigates to the Profile panel for optional
  email/password. Requires an `onOpenProfile` callback threaded App → GameOver →
  GameOverLeaderboard → overlay.
- Name-taken → inline error, require a different name (logic already exists).

**Structure:** the overlay is a presentational component (`GameOverOnboard`)
driven by `GameOverLeaderboard`'s existing post state/handlers (`name`, `post()`,
`projected`, `nameTaken`, availability), so there is a single posting path and no
duplicated submit logic.

## 4. Leaderboard data-model refactor

**Now:** `leaderboard` stores `name`, `country`, `ip_hash`, `device_id (text)`.
Name + country are per-row; a rename does not propagate to old rows; IP is hashed
and stored per row.

**Target:** a leaderboard row references the player's profile and nothing
identity-related is duplicated. Name + country come from the profile via the view,
so a rename/country-change reflects everywhere instantly.

### Schema (migration 0013) — leaderboard is currently empty (wiped in 0012), so this is safe
- `profiles` ADD COLUMN `country text` CHECK (`country ~ '^[A-Z]{2}$'`), nullable.
- `leaderboard`:
  - `ALTER COLUMN device_id TYPE uuid USING device_id::uuid`.
  - ADD FK `device_id → profiles(user_id) ON DELETE CASCADE`.
  - `DROP COLUMN name, country, ip_hash` (their CHECK constraints drop with them).
  - **Decision:** keep the column name `device_id` (it now *is* the profile id /
    FK). Not renamed to `profile_id` to avoid churn in `boards.ts` / `aggregate.ts`
    grouping. *(Flag for review — rename is possible but touches more code.)*
- Recreate `leaderboard_top`:
  ```sql
  select l.id, p.display_name as name, l.score, l.correct, l.mode_id,
         l.game_mode, l.device_id, p.country, l.created_at
  from leaderboard l join profiles p on p.user_id = l.device_id;
  ```
  (INNER join — every row now has a profile, guaranteed by the FK.)
- `bump_profile_stats` gains a `p_country text` param: set `country` on INSERT
  only; `on conflict` leaves `country` untouched so a manual choice is preserved.

### submit-score edge function
- Detect country via the existing `lookupCountry(ip)` and pass it to
  `bump_profile_stats(..., p_country)`. (Stored on the profile on first creation.)
- **Rate limiting moves from `ip_hash` to `device_id`** (the authenticated uid):
  count this device's recent leaderboard rows in the window. Drop `ip_hash`
  computation and the `IP_HASH_SALT`. Privacy win — no IP is stored.
- Stop writing `name`, `country`, `ip_hash` into `leaderboard`; insert/update only
  `score, correct, mode_id, game_mode, device_id, created_at`.

### Client
- The `leaderboard_top` view keeps the same column shape (`name`, `country`,
  `device_id`, …), so `boards.ts` / `GlobalEntry` need no change.
- `getProfile` returns `country`; `submitScore` payload unchanged.

## 5. Profile home-country dropdown

- New `src/leaderboard/countries.ts`: ISO 3166-1 alpha-2 list `{ code, name }`.
- `ProfilePanel`: a dropdown (flag via existing `countryToFlag` + name) that
  writes `profiles.country` directly (RLS `profiles_self` permits self-update).
- Country is auto-set on first score submit (geo); the dropdown lets the player
  override it freely thereafter.

---

## Affected files
- `src/modes/quickStart.ts` (+ `startRandomGame`)
- `src/ui/StartModes.tsx` (random FAB; drop auto-advance wiring)
- `src/ui/GameOverLeaderboard.tsx` (profile-based auto-post; drive overlay)
- `src/ui/GameOverOnboard.tsx` (new overlay)
- `src/ui/GameOver.tsx`, `src/App.tsx` (`onOpenProfile` thread)
- `src/profile/client.ts` (return + update `country`)
- `src/ui/ProfilePanel.tsx` (country dropdown)
- `src/leaderboard/countries.ts` (new)
- `supabase/migrations/0013_profile_country_leaderboard_fk.sql`
- `supabase/functions/submit-score/index.ts`
- Tests: `GameOverLeaderboard.test`, `leaderboard/client.test`, `ProfilePanel.test`

## Out of scope / decided earlier
- Start-screen mode `#N` badge stays "best rank across reveal sub-boards" (kept).
- Unique, case-insensitive display names already shipped (migration 0012).

## Open decisions flagged for review
1. Keep `device_id` column name vs. rename to `profile_id` (spec keeps `device_id`).
2. Rate-limit by uid instead of IP (spec does this; drops IP storage entirely).
