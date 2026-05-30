import type { Round, RevealStage, TimeAttackConfig } from './types';
import { DEFAULT_TIME_ATTACK_CONFIG } from './types';
import type { ScryfallCard } from '../scryfall/types';

export type RevealMode = 'blur' | 'scanner';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** target name + (optionCount-1) distinct distractor names from the pool, shuffled. */
export function buildOptions(
  target: ScryfallCard,
  pool: ScryfallCard[],
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): string[] {
  const distractors = [...new Set(pool.map((c) => c.name))].filter((n) => n !== target.name);
  const picked = shuffle(distractors).slice(0, Math.max(0, config.optionCount - 1));
  return shuffle([target.name, ...picked]);
}

export function createRound(
  target: ScryfallCard,
  pool: ScryfallCard[],
  now: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): Round {
  return {
    target,
    options: buildOptions(target, pool, config),
    startedAt: now,
    status: 'playing',
    guess: null,
    score: 0,
  };
}

/** A target card plus its pre-shuffled answer options for one round. */
export interface PlannedRound {
  target: ScryfallCard;
  options: string[];
}

/**
 * Pre-plan a whole game so the player never sees a card or a name twice. Picks
 * `totalRounds` distinct target cards, then fills each round's distractors from
 * the remaining names so all `totalRounds * optionCount` names are unique across
 * the game. Falls back to reusing names only when the pool is too small to keep
 * them globally unique (always keeping each round's own options distinct).
 */
export function planGame(
  pool: ScryfallCard[],
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): PlannedRound[] {
  const { optionCount, totalRounds } = config;

  // Scryfall can return reprints sharing a name — keep one card per name.
  const uniqueByName: ScryfallCard[] = [];
  const seen = new Set<string>();
  for (const c of pool) {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      uniqueByName.push(c);
    }
  }

  const shuffled = shuffle(uniqueByName);
  const targets = shuffled.slice(0, Math.min(totalRounds, shuffled.length));
  const allNames = uniqueByName.map((c) => c.name);

  // Distractor names never used as a target, each consumed at most once so no
  // name repeats across the game while supply lasts.
  const targetNames = new Set(targets.map((t) => t.name));
  const bag = shuffle(allNames.filter((n) => !targetNames.has(n)));

  const plan: PlannedRound[] = [];
  for (let i = 0; i < totalRounds && targets.length > 0; i++) {
    const target = targets[i % targets.length];
    const picked: string[] = [];

    while (picked.length < optionCount - 1 && bag.length > 0) {
      const n = bag.shift()!;
      if (n !== target.name && !picked.includes(n)) picked.push(n);
    }

    // Small-pool fallback: reuse other names, still distinct within the round.
    if (picked.length < optionCount - 1) {
      for (const n of shuffle(allNames)) {
        if (picked.length >= optionCount - 1) break;
        if (n !== target.name && !picked.includes(n)) picked.push(n);
      }
    }

    plan.push({ target, options: shuffle([target.name, ...picked]) });
  }

  return plan;
}

/** Reveal stage from elapsed ms: one stage per stageMs, capped at 5. */
export function stageAt(
  elapsedMs: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): RevealStage {
  if (elapsedMs <= 0) return 0;
  const s = Math.floor(elapsedMs / config.stageMs);
  return Math.min(5, s) as RevealStage;
}

/** Scanner-mode reveal fraction from elapsed ms: linear 0→1 over scanRevealMs. */
export function scanProgressAt(
  elapsedMs: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): number {
  if (elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / config.scanRevealMs);
}

/** Which reveal animation a round uses: strict A/B/A/B; parity flips round 1. */
export function revealModeFor(roundIndex: number, parity: 0 | 1): RevealMode {
  return (roundIndex + parity) % 2 === 0 ? 'blur' : 'scanner';
}

/**
 * Deterministic pseudo-random sweep angle (degrees, [0,360)) for a round.
 * Stable across re-renders for a given (seed, roundIndex) so the sweep
 * direction never changes mid-round, but varies from card to card.
 */
export function scanAngleFor(seed: number, roundIndex: number): number {
  const x = Math.sin(seed * 374761393 + roundIndex * 668265263 + 1) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.floor(frac * 360);
}

/**
 * Points available at a given elapsed time — linear decay from maxScore (t=0)
 * down to minScore (t=durationMs). Smooth per-second, so an earlier guess always
 * scores more.
 */
export function scoreAt(
  elapsedMs: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): number {
  const t = Math.min(Math.max(elapsedMs, 0), config.durationMs);
  const frac = t / config.durationMs;
  return Math.round(config.maxScore - frac * (config.maxScore - config.minScore));
}

/**
 * Apply the player's single guess. One guess locks the round: a correct choice
 * wins and scores by elapsed time, anything else (wrong, or after time is up)
 * loses with 0 points.
 */
export function resolveGuess(
  round: Round,
  choice: string,
  now: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): Round {
  if (round.status !== 'playing') return round;
  const elapsed = now - round.startedAt;
  if (elapsed >= config.durationMs) {
    return { ...round, status: 'lost', guess: choice, score: 0 };
  }
  const correct = choice === round.target.name;
  return {
    ...round,
    status: correct ? 'won' : 'lost',
    guess: choice,
    score: correct ? scoreAt(elapsed, config) : 0,
  };
}

/** Time ran out with no guess → the round is lost. */
export function expire(round: Round): Round {
  if (round.status !== 'playing') return round;
  return { ...round, status: 'lost', guess: null, score: 0 };
}
