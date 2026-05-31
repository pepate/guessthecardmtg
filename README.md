# GuessTheCard

A fast, mobile-first browser game: a _Magic: The Gathering_ card is revealed
under an obscuring effect — blurred, behind a mosaic, as a silhouette, and so on
— and you pick its name from four choices before the clock runs out. You have
**30 seconds** to name as many cards as you can.

🔮 **Play it:** https://pepate.github.io/guessthecardmtg/

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
4. After 30 seconds you get your total score and how many cards you nailed —
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
- Deployed to **GitHub Pages**

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

## Credits

Card data, names and artwork are provided by **Scryfall**. _Magic: The
Gathering_ is © Wizards of the Coast. This is a fan-made, non-commercial project.
