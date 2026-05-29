import type { Round, RevealStage, TimeAttackConfig } from './types';
import { DEFAULT_TIME_ATTACK_CONFIG } from './types';
import type { ScryfallCard } from '../scryfall/types';

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

/** Reveal stage from elapsed ms: one stage per stageMs, capped at 5. */
export function stageAt(
  elapsedMs: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): RevealStage {
  if (elapsedMs <= 0) return 0;
  const s = Math.floor(elapsedMs / config.stageMs);
  return Math.min(5, s) as RevealStage;
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
