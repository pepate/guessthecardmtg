# GuessTheCard

A fast, mobile-first browser game: a _Magic: The Gathering_ card is revealed
under an obscuring effect — blurred, behind a mosaic, as a silhouette, and so on
— and you pick its name from four choices before the clock runs out. You have
**45 seconds** to name as many cards as you can.

🔮 **Play it:** https://guessthecard.de

Cards are served from a Supabase backend; all card data, names and artwork
originate from [Scryfall](https://scryfall.com/docs/api).

## How to play

1. **Pick a mode.** Each mode is a card pool defined by a filter — set, colour,
   type, mana value, rarity, year, EDHREC rank, and so on. Play any mode others
   have made, or unlock mode creation after a few games to build your own.
2. **Pick a reveal mode.** The same pool can be played under six different
   reveal effects, each with its own online leaderboard:
   - **Blur** — the art comes into focus over time.
   - **Scanner** — a sweep uncovers the card top to bottom.
   - **Mosaic** — tiles drop away one by one.
   - **Zoom** — a tight crop pulls back to the full card.
   - **Silhouette** — the shape fills in with detail.
   - **Spotlight** — a moving light widens to reveal everything.
3. **Guess fast.** Pick the right name from four options. The sooner you’re
   right, the more points you score.
4. After 45 seconds you get your total score and how many cards you nailed —
   then chase the holder of that mode’s leaderboard, or jump straight into
   another reveal mode.

**New here?** A short welcome walks you through an example card, and a
**Quick Game** button drops you straight into the most-played mode — so your
first game already has a populated leaderboard to climb, not an empty board.

### Scoring

Each card is worth up to **1000 points** for an instant correct guess, decaying
linearly down to **100** over its **15-second** window. Faster = more points, so
speed is the whole game.

## Accounts & leaderboard

No sign-up needed to play. The first time you post a score, the game quietly
creates an **anonymous account** (Supabase auth) so the leaderboard row is tied
to a real, un-spoofable identity rather than just a typed-in name. From then on,
finished games are **saved automatically**.

Open the **profile** (the account icon, top-right of the start screen) to:

- **Change your display name** — it updates everywhere on the boards at once.
- **Secure your account** by linking an email + password and/or **Google**, so
  your name and scores follow you across devices. This is optional — purely to
  keep your progress if you switch browsers or phones.
- **Sign in** on a new device to recover an account you secured earlier.
- See your **stats**: games played, hit rate, average correct per game, and your
  personal best (score + rank) in each mode.

Each leaderboard is per **(mode, reveal mode)** and keeps your single best run.

## Tech

- **React 18** + **TypeScript** (strict) on **Vite 5**
- **Zustand** for state, **Framer Motion** for the reveal animations
- **Supabase** backend: filtered card pools and per-mode leaderboards via RPC,
  plus **Supabase Auth** (anonymous sign-in, optional email/password + Google)
  for cross-device profiles, with writes guarded by a JWT-verifying Edge Function
- Installable **PWA** (offline shell via `vite-plugin-pwa`)
- A pure, framework-free game engine (`src/engine`) so the rules are unit-testable
- **Vitest** unit tests + **Playwright** end-to-end tests
- Deployed to **GitHub Pages** on the custom domain **guessthecard.de** (HTTPS enforced)

## Project layout

```
src/
  engine/     pure time-attack rules: rounds, scoring, reveal stages, game planning
  cards/      Supabase card client (filtered game-card RPC, seed filters)
  modes/      custom mode filters, validation and client
  sets/       set metadata client
  reveal/     reveal-mode labels and enabled-mode config
  leaderboard/ online scores, ranking, boards and the auth-backed identity
  auth/       Supabase auth: session store, useAuth hook, sign-in/link actions
  profile/    profile data client (display name, stats) and personal bests
  scene/      the animated card stage
  state/      Zustand store, game/round clocks, high-score persistence
  ui/         mode picker, reveal picker, mode builder, HUD, timer, game over,
              profile panel, first-run welcome wizard
  scryfall/   typed Scryfall card shape used internally
e2e/          Playwright golden-path specs
```

## Development

```bash
npm install
npm run dev          # start the dev server
```

### Checks

```bash
npm run typecheck    # tsc, no emit
npm test             # Vitest unit tests
npm run test:e2e     # Playwright e2e (installs browsers on first run)
npm run build        # type-check + production build
```

The end-to-end tests run fully offline: backend requests are mocked and the
clock is driven by Playwright’s `page.clock`, so they’re deterministic.

## Changelog

### 2026-06-05

- **Game-over navigation.** The game-over screen gains bottom **Home** and
  **Back to mode** buttons (the latter opens the mode's picker page). Fixed a bug
  where finishing a second run listed you twice on the leaderboard until a reload.
- **Mode sharing.** The **Your standing** row gets a share button that creates a
  link to that mode; the WhatsApp/Discord preview shows your standing total, and
  opening it lands on the mode's picker page.
- **Clearer leaderboard.** The mode screen explains that your total is the **sum
  of your best score in each reveal mode**, and the Your standing row shows how
  many reveals you've played (e.g. `3 / 7 reveals`) with a nudge to play more.
- **Richer Games tab.** Game cards now show your **rank, points, games and
  reveals played** (when signed in), keep the #1 leader, list **10** at a time
  with a **Load more** button, and the grid's scrollbar is hidden.
- **Profile.** A full-width **Back** button is added at the bottom of the profile,
  matching the other back buttons.
- **Always-fresh updates.** The app now re-checks for a new version periodically
  and on focus, and reloads into it **silently when you're not mid-game** — so an
  open/installed PWA no longer sits on a stale cached build.

### 2026-06-04

- **Summed leaderboard.** A pool's leaderboard now ranks you by the **sum of your
  best score in each reveal mode**, not a single best run — so climbing means
  playing every reveal. Leaderboard rows show the player's total (no per-reveal
  tag); a **Your standing** row shows your rank + total; and the reveal list now
  shows **your own** best per mode, labelled by the mode and sorted highest-first
  so you can see where points are still on the table.
- **Game-over: Next mode.** The result popup shows your run score plus your new
  pool **total** and **total rank**, and a **Next mode** button jumps straight
  into the next reveal you have zero points in.
- **Daily Set: unlimited.** The Daily Set adopts the summed scheme and the
  **3-plays-per-day cap is gone** — play it as often as you like.
- **Start page tabs.** The start screen splits into **Games** (your recently
  played games as artwork cards) and **Leaderboard**, under an always-visible
  Daily Set. Both show each pool's leader by **summed total** (best per reveal);
  the leaderboard's time windows are Today / Weekly / All-time.
- **Daily Set banner.** Until the day's board has a score, the banner shows the
  set's four most-popular card artworks for a splash of colour.

### 2026-06-02

- **Gallery reveal mode.** A new mode that flips the format: the card’s **name**
  is shown and you tap the matching artwork from a **2×2 grid**. Distractors are
  drawn from the target’s primary type (creatures vs. lands…), with the same
  per-card clock and time-based scoring as the other modes.
- **Clearer accounts & onboarding.** The top-right account control is now a
  labeled chip — your name, or **“Guest · Tap to set up”** — and stays visible
  across the start, mode and game-over screens. The profile splits into
  **Create account** and **Login** tabs; creating an account only needs a name,
  then an optional popup offers to link an **email** or **Google** (skippable).
- **Save-your-score sheet.** Game-over login is a focused sheet — *“Save your
  score & claim your spot”* with your placement — and the sign-in screen is
  reframed as **“Welcome back”** (Google first, email fallback).
- **Recent filter.** The start screen gains a **Recent** window next to Today /
  Weekly / All-time, ordering modes by their newest entry.
- **Mode screen polish.** The reveal picker keeps the full account chip and gains
  an always-visible **Back** button below the list; the card-info “i” sits
  centered so it never crowds the account chip.
- **Fix.** Claiming a name on the game-over sheet now reliably posts your run (it
  could fail silently before), with errors surfaced instead of a quiet close.

### 2026-06-01

- **Daily Set.** A shared daily challenge featured at the top of the start
  screen: one random, never-before-played set each day (Europe/Berlin), played
  under one fixed random reveal mode. The first player of the day creates it,
  everyone else joins the same one. You may post at most **3 runs per day** so
  the board can’t be ground out. The button shows the current leader and a
  countdown to the next set; tapping it opens the day’s leaderboard with a
  single **Play** button and your remaining plays. Yesterday’s sets graduate
  into the normal mode list.
- **One unified result screen.** The post-game screen is now the same mode
  screen you see when picking a mode — your run is shown ranked in the board.
  A compact popup reports your score and rank with **Replay / Share / Close**.
- **Login-gated leaderboard.** A score is recorded only once you’ve claimed a
  name; until then the row shows a **LOGIN** prompt that opens the profile.
  Creating your own mode likewise requires a name (the button stays tappable
  and routes you to claim one) — the old “play 3 games first” gate is gone.
- **Mode screen polish.** Reveal modes are shown as compact icons, each row
  carries the record’s age, your own rank is shown when you’ve placed, the
  background is the pool’s most-popular (lowest-EDHREC) card art, and the list
  no longer needs a scrollbar.
- **Navigation & feel.** The device/browser **Back** button now steps back a
  screen, **pull-to-refresh** updates the boards on every non-game screen, the
  mosaic reveal’s tile seams (a faint “graphics glitch”) are gone, and the zoom
  reveal lands cleanly on the full card.
- **Profile decluttered.** Only the name field and Login show until you’ve
  named yourself; securing the account, country and stats appear afterwards.
  Saving now shows a clear banner, and **Share GuessTheCard** is a prominent
  button.

### 2026-05-31

- **Real accounts & identity.** Scores are tied to a Supabase **anonymous
  account** (un-spoofable) instead of a typed name. Profiles carry a unique,
  case-insensitive **display name**; finished games **auto-save**. Secure an
  account with **email + password** and/or **Google**, sign in on a new device,
  and recover a forgotten password.
- **Profile area** (account icon): change name, link accounts, and view
  lifetime **stats** + **personal bests** per mode.
- **Reveal picker tabs** — Leaderboard and Recent games — plus a game-over
  onboarding overlay.
- **45-second games** (replacing the older 90/30s timing), a first-run
  **welcome wizard**, and a **Quick Game** button into the most-played mode.
- Served from the custom domain **guessthecard.de** with dynamic OG previews;
  released under the **PolyForm Noncommercial** license.

## License

The source code is released under the **[PolyForm Noncommercial 1.0.0](LICENSE.md)**
license: you're free to read, use, modify and share it for **noncommercial**
purposes, but **commercial use is not permitted**. (This is a source-available
license, not an OSI "open source" one — that's deliberate, so the code stays
public and free without anyone selling it.)

This license covers **only this project's code**. _Magic: The Gathering_ card
names and artwork are © Wizards of the Coast and are not licensed here.

## Credits

Card data, names and artwork are provided by **Scryfall**. _Magic: The
Gathering_ is © Wizards of the Coast. This is a fan-made, non-commercial project.
