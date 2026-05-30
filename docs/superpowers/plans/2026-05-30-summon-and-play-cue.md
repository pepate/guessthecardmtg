# Summon Screen & Play Cue — Implementation Plan

> REQUIRED SUB-SKILL: subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Play-icon affordance (pulses after 4s) on the pool buttons; a "summoning" loading screen with 40 rotating texts and a ~1.5s minimum; confirm fresh cards per restart.

**Reference spec:** `docs/superpowers/specs/2026-05-30-summon-and-play-cue-design.md`

---

## Task 1: 40 summoning texts

**Files:** `src/ui/summoningTexts.ts` (create), `src/ui/summoningTexts.test.ts` (create)

- [ ] Create `summoningTexts.ts` exporting `SUMMONING_TEXTS: string[]` (40 entries).
- [ ] Test: 40 entries, all non-empty (trimmed), all unique.
- [ ] `npx vitest run src/ui/summoningTexts.test.ts` → PASS.
- [ ] Commit.

## Task 2: Rotating LoadingScreen + min summon duration

**Files:** `src/App.tsx`, `src/state/gameStore.ts`

- [ ] `LoadingScreen`: random start index, rotate `SUMMONING_TEXTS` every 1900ms via
  `useEffect` interval; render the line under "Summoning cards…".
- [ ] `gameStore.selectPool`: `const MIN_SUMMON_MS = 1500;` record start; after
  `planGame`, await the remainder if faster, then set `playing`.
- [ ] `npm test && npm run build` → green/clean.
- [ ] Commit.

## Task 3: Play icon + pulse

**Files:** `src/ui/PoolSelect.tsx`, `src/index.css`, `src/ui/PoolSelect.test.tsx` (create)

- [ ] `index.css`: `.play-icon` (absolute right, centered), `.play-hint` +
  `@keyframes playPulse` (opacity + ember glow + scale).
- [ ] `PoolSelect`: `btn` gets `position: relative`; add a play-triangle SVG
  `.play-icon` (with `data-testid="play-icon"`) to each button; `hint` state set
  after a 4s timeout adds `.play-hint`.
- [ ] Test (fake timers): two `play-icon`s render; after advancing 4s they gain
  `play-hint`.
- [ ] `npx vitest run src/ui/PoolSelect.test.tsx` → PASS; `npm run build` clean.
- [ ] Commit.

## Task 4: Browser verification

- [ ] Play icons visible; pulse after ~4s.
- [ ] Click → summon screen with rotating text ≥1.5s → game starts.
- [ ] Two consecutive games show different cards.

## Self-review

- Spec coverage: play cue (T3), summon texts + min duration (T1+T2), E3 confirmed
  (no code change; min-duration makes it perceptible).
- No test calls `selectPool`, so the delay doesn't slow the suite.
