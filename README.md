# GuessTheCard

A fast, mobile-first browser game: a _Magic: The Gathering_ card is revealed
piece by piece — first just the artwork, then colour, type line, mana cost and
finally the rules text. Name the card before the clock runs out. You have **90
seconds** to guess as many as you can.

🔮 **Play it:** https://pepate.github.io/guessthecardmtg/

All cards and artwork come live from the [Scryfall API](https://scryfall.com/docs/api).

## How to play

1. Pick a card pool:
   - **Popular cards** — well-known Commander staples (sorted by EDHREC rank).
   - **All cards** — everything printed from 2015 on, a fresh random slice each game.
2. Optionally keep **No Universe Beyond cards** checked to stay MTG-native
   (excludes crossovers like LOTR or Final Fantasy).
3. The card reveals in stages — guess as early as you dare. The sooner you’re
   right, the more points you score.
4. After 90 seconds you get your total score and how many cards you nailed.
   Beat your high score.

### Scoring

Each card is worth up to **1000 points** for an instant correct guess, decaying
linearly down to **100** by the moment time runs out on that card. Faster = more
points, so speed is the whole game.

## Tech

- **React 18** + **TypeScript** (strict) on **Vite 5**
- **Zustand** for state, **Framer Motion** for the reveal animations
- Installable **PWA** (offline shell via `vite-plugin-pwa`)
- A pure, framework-free game engine (`src/engine`) so the rules are unit-testable
- **Vitest** unit tests + **Playwright** end-to-end tests
- Deployed to **GitHub Pages**

## Project layout

```
src/
  engine/     pure time-attack rules: rounds, scoring, reveal stages, game planning
  scryfall/   typed Scryfall client (search, rate limiting, retries, art filtering)
  scene/      the animated card stage
  state/      Zustand store, game/round clocks, high-score persistence
  ui/         pool select, HUD, timer, name choices, snackbar, game over
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

The end-to-end tests run fully offline: Scryfall requests are mocked and the
clock is driven by Playwright’s `page.clock`, so they’re deterministic.

## Credits

Card data, names and artwork are provided by **Scryfall**. _Magic: The
Gathering_ is © Wizards of the Coast. This is a fan-made, non-commercial project.
