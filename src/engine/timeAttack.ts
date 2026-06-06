import type { Round, RevealStage, TimeAttackConfig } from './types';
import { DEFAULT_TIME_ATTACK_CONFIG } from './types';
import type { ScryfallCard } from '../scryfall/types';
import { KNOWN_REVEAL_MODES, type RevealMode } from './revealMode';

// RevealMode/KNOWN_REVEAL_MODES now live in ./revealMode; re-exported here so the
// many existing `from '../engine/timeAttack'` imports keep working.
export { KNOWN_REVEAL_MODES };
export type { RevealMode };

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
  /** Gallery mode: the option cards (incl. target), aligned with `options`. */
  optionCards?: ScryfallCard[];
}

// Card supertypes that precede the actual card type in a type line, e.g. the
// "Legendary" in "Legendary Creature — God". Skipped when picking the primary type.
const SUPERTYPES = new Set(['Legendary', 'Basic', 'Snow', 'World', 'Ongoing', 'Host', 'Elite', 'Token']);

/** The card's primary type (e.g. "Creature", "Land", "Instant"): the first real
 *  type in the type line, skipping supertypes. Used to group gallery distractors. */
export function primaryType(card: ScryfallCard): string {
  const line = card.type_line || card.card_faces?.[0]?.type_line || '';
  const front = line.split(/[—–]/)[0].trim();
  const words = front.split(/\s+/).filter(Boolean);
  for (const w of words) if (!SUPERTYPES.has(w)) return w;
  return words[0] ?? '';
}

function galleryArt(card: ScryfallCard): string | undefined {
  return card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop;
}

/** Number of artwork tiles shown in a gallery round (2×2 grid). */
export const GALLERY_TILES = 4;

/**
 * Pre-plan a gallery game: each round shows one target name and GALLERY_TILES
 * card artworks (the target + distractors), and the player taps the matching
 * art. Only cards with artwork are used. Distractors prefer the target's primary
 * type (creature vs. land …), falling back to other types when a type is scarce.
 * Target cards are distinct across the game; each round's tiles are distinct.
 */
export function planGalleryGame(
  pool: ScryfallCard[],
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): PlannedRound[] {
  const withArt: ScryfallCard[] = [];
  const seen = new Set<string>();
  for (const c of pool) {
    if (galleryArt(c) && !seen.has(c.name)) {
      seen.add(c.name);
      withArt.push(c);
    }
  }

  const targets = shuffle(withArt).slice(0, Math.min(config.totalRounds, withArt.length));
  const plan: PlannedRound[] = [];

  for (const target of targets) {
    const tp = primaryType(target);
    const sameType = shuffle(withArt.filter((c) => c.name !== target.name && primaryType(c) === tp));
    const otherType = shuffle(withArt.filter((c) => c.name !== target.name && primaryType(c) !== tp));

    const distractors: ScryfallCard[] = [];
    const used = new Set<string>([target.name]);
    for (const c of [...sameType, ...otherType]) {
      if (distractors.length >= GALLERY_TILES - 1) break;
      if (!used.has(c.name)) {
        used.add(c.name);
        distractors.push(c);
      }
    }

    const optionCards = shuffle([target, ...distractors]);
    plan.push({ target, options: optionCards.map((c) => c.name), optionCards });
  }

  return plan;
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

/** Mosaic-mode: number of tiles uncovered so far — one per mosaicTileMs, capped at cols*rows. */
export function tilesRevealedAt(
  elapsedMs: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK_CONFIG,
): number {
  const tileCount = config.mosaicCols * config.mosaicRows;
  if (elapsedMs <= 0) return 0;
  return Math.min(tileCount, Math.floor(elapsedMs / config.mosaicTileMs));
}

/** Resolve the pre-game choice to a single concrete mode for the whole game.
 *  A concrete choice passes through; 'random' picks a uniformly random enabled mode. */
export function resolveGameMode(choice: RevealMode | 'random', enabled: RevealMode[]): RevealMode {
  if (choice !== 'random') return choice;
  if (enabled.length === 0) return 'blur';
  return enabled[Math.floor(Math.random() * enabled.length)];
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
 * Deterministic pseudo-random uncover order for mosaic tiles: a permutation of
 * [0..tileCount-1] derived from (seed, roundIndex). Stable across re-renders for a
 * given input (no flicker mid-round), but different from card to card.
 */
export function tileOrderFor(seed: number, roundIndex: number, tileCount: number): number[] {
  const keyed = Array.from({ length: tileCount }, (_, t) => {
    const x =
      Math.sin(seed * 374761393 + roundIndex * 668265263 + (t + 1) * 982451653) * 43758.5453;
    return { t, k: x - Math.floor(x) };
  });
  keyed.sort((a, b) => a.k - b.k);
  return keyed.map((e) => e.t);
}

function hash01(seed: number, roundIndex: number, salt: number): number {
  const x = Math.sin(seed * 374761393 + roundIndex * 668265263 + salt) * 43758.5453;
  return x - Math.floor(x);
}

/** Deterministic spotlight centre (percentages) for a round — stable across re-renders. */
export function spotlightOriginFor(seed: number, roundIndex: number): { xPct: number; yPct: number } {
  return { xPct: Math.floor(hash01(seed, roundIndex, 3) * 100), yPct: Math.floor(hash01(seed, roundIndex, 4) * 100) };
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
