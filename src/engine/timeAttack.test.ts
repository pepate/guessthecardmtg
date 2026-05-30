import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildOptions, createRound, planGame, stageAt, scoreAt, resolveGuess, expire, scanProgressAt, tilesRevealedAt, revealModeFor, scanAngleFor, tileOrderFor, zoomFocusFor, spotlightOriginFor, KNOWN_REVEAL_MODES } from './timeAttack';
import { DEFAULT_TIME_ATTACK_CONFIG as CFG } from './types';
import type { Round } from './types';
import type { ScryfallCard } from '../scryfall/types';
import type { RevealMode } from './timeAttack';

function makeCard(name: string): ScryfallCard {
  return { id: name.toLowerCase().replace(/\s+/g, '-'), name, cmc: 1, type_line: 'Instant' };
}

const TARGET = makeCard('Lightning Bolt');
const POOL = [
  TARGET,
  makeCard('Counterspell'),
  makeCard('Doom Blade'),
  makeCard('Llanowar Elves'),
  makeCard('Serra Angel'),
  makeCard('Grizzly Bears'),
];

describe('buildOptions', () => {
  it('returns optionCount choices including the target', () => {
    const opts = buildOptions(TARGET, POOL);
    expect(opts).toHaveLength(CFG.optionCount);
    expect(opts).toContain('Lightning Bolt');
  });

  it('has no duplicate names', () => {
    const opts = buildOptions(TARGET, POOL);
    expect(new Set(opts).size).toBe(opts.length);
  });

  it('dedupes a pool with repeated card names', () => {
    const dupPool = [TARGET, makeCard('Counterspell'), makeCard('Counterspell'), makeCard('Doom Blade')];
    const opts = buildOptions(TARGET, dupPool);
    expect(new Set(opts).size).toBe(opts.length);
  });

  it('caps at available distractors when the pool is small', () => {
    const opts = buildOptions(TARGET, [TARGET, makeCard('Counterspell')]);
    expect(opts).toContain('Lightning Bolt');
    expect(opts.length).toBeLessThanOrEqual(CFG.optionCount);
  });
});

describe('createRound', () => {
  it('starts playing with the given clock and no guess', () => {
    const round = createRound(TARGET, POOL, 1000);
    expect(round.status).toBe('playing');
    expect(round.startedAt).toBe(1000);
    expect(round.guess).toBeNull();
    expect(round.score).toBe(0);
    expect(round.options).toContain('Lightning Bolt');
  });
});

describe('planGame', () => {
  // Needs at least totalRounds * optionCount unique names to prove no repeats.
  const bigPool = Array.from({ length: 200 }, (_, i) => makeCard(`Card ${i}`));

  it('plans exactly totalRounds rounds when the pool is large enough', () => {
    const plan = planGame(bigPool, CFG);
    expect(plan).toHaveLength(CFG.totalRounds);
  });

  it('uses a distinct target card in every round', () => {
    const plan = planGame(bigPool, CFG);
    const targets = plan.map((r) => r.target.name);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('never repeats a name anywhere across the game when the pool is large', () => {
    const plan = planGame(bigPool, CFG);
    const everyName = plan.flatMap((r) => r.options);
    expect(everyName).toHaveLength(CFG.totalRounds * CFG.optionCount);
    expect(new Set(everyName).size).toBe(everyName.length);
  });

  it('always includes the target among its own options, with no in-round duplicates', () => {
    for (const round of planGame(bigPool, CFG)) {
      expect(round.options).toContain(round.target.name);
      expect(new Set(round.options).size).toBe(round.options.length);
    }
  });

  it('falls back gracefully for a small pool: distinct in-round options, cycled targets', () => {
    const plan = planGame(POOL, CFG);
    expect(plan).toHaveLength(CFG.totalRounds);
    for (const round of plan) {
      expect(round.options).toHaveLength(CFG.optionCount);
      expect(round.options).toContain(round.target.name);
      expect(new Set(round.options).size).toBe(round.options.length);
    }
  });
});

describe('stageAt', () => {
  it('is 0 at the start and before time begins', () => {
    expect(stageAt(0)).toBe(0);
    expect(stageAt(-500)).toBe(0);
    expect(stageAt(2999)).toBe(0);
  });

  it('advances one stage per stageMs', () => {
    expect(stageAt(3000)).toBe(1);
    expect(stageAt(6000)).toBe(2);
    expect(stageAt(9000)).toBe(3);
    expect(stageAt(12000)).toBe(4);
  });

  it('caps at 5 once time is up', () => {
    expect(stageAt(15000)).toBe(5);
    expect(stageAt(99999)).toBe(5);
  });
});

describe('scoreAt', () => {
  it('awards maxScore at t=0', () => {
    expect(scoreAt(0)).toBe(CFG.maxScore);
  });

  it('awards minScore at the deadline', () => {
    expect(scoreAt(CFG.durationMs)).toBe(CFG.minScore);
  });

  it('decays smoothly and monotonically', () => {
    const a = scoreAt(3000);
    const b = scoreAt(6000);
    const c = scoreAt(9000);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('clamps below 0 and past the deadline', () => {
    expect(scoreAt(-1000)).toBe(CFG.maxScore);
    expect(scoreAt(CFG.durationMs + 5000)).toBe(CFG.minScore);
  });
});

describe('resolveGuess', () => {
  let round: Round;
  beforeEach(() => {
    round = createRound(TARGET, POOL, 1000);
  });

  it('wins on a correct guess and scores by elapsed time', () => {
    const next = resolveGuess(round, 'Lightning Bolt', 1000); // elapsed 0
    expect(next.status).toBe('won');
    expect(next.guess).toBe('Lightning Bolt');
    expect(next.score).toBe(CFG.maxScore);
  });

  it('scores less for a later correct guess', () => {
    const next = resolveGuess(round, 'Lightning Bolt', 1000 + 9000);
    expect(next.status).toBe('won');
    expect(next.score).toBe(scoreAt(9000));
  });

  it('loses with 0 points on a wrong guess', () => {
    const next = resolveGuess(round, 'Counterspell', 1000 + 2000);
    expect(next.status).toBe('lost');
    expect(next.guess).toBe('Counterspell');
    expect(next.score).toBe(0);
  });

  it('loses when the guess lands after time is up', () => {
    const next = resolveGuess(round, 'Lightning Bolt', 1000 + CFG.durationMs);
    expect(next.status).toBe('lost');
    expect(next.score).toBe(0);
  });

  it('is a no-op once the round is already resolved (one guess locks it)', () => {
    const won = resolveGuess(round, 'Lightning Bolt', 1000);
    const again = resolveGuess(won, 'Counterspell', 1000 + 5000);
    expect(again).toBe(won);
  });
});

describe('expire', () => {
  it('marks a playing round lost with no guess', () => {
    const round = createRound(TARGET, POOL, 1000);
    const next = expire(round);
    expect(next.status).toBe('lost');
    expect(next.guess).toBeNull();
    expect(next.score).toBe(0);
  });

  it('does not override an already-won round', () => {
    const won = resolveGuess(createRound(TARGET, POOL, 1000), 'Lightning Bolt', 1000);
    expect(expire(won)).toBe(won);
  });
});

describe('scanProgressAt', () => {
  it('is 0 at or before the start', () => {
    expect(scanProgressAt(0)).toBe(0);
    expect(scanProgressAt(-500)).toBe(0);
  });

  it('is 1 at or after scanRevealMs', () => {
    expect(scanProgressAt(CFG.scanRevealMs)).toBe(1);
    expect(scanProgressAt(CFG.scanRevealMs + 5000)).toBe(1);
  });

  it('is linear in between (half way at half the time)', () => {
    expect(scanProgressAt(CFG.scanRevealMs / 2)).toBeCloseTo(0.5, 5);
  });
});

describe('tilesRevealedAt', () => {
  it('reveals nothing at or before t=0', () => {
    expect(tilesRevealedAt(0)).toBe(0);
    expect(tilesRevealedAt(-500)).toBe(0);
  });

  it('reveals one more tile every mosaicTileMs', () => {
    expect(tilesRevealedAt(CFG.mosaicTileMs)).toBe(1);
    expect(tilesRevealedAt(CFG.mosaicTileMs * 5)).toBe(5);
  });

  it('caps at the full tile count', () => {
    const total = CFG.mosaicCols * CFG.mosaicRows;
    expect(tilesRevealedAt(CFG.mosaicTileMs * total)).toBe(total);
    expect(tilesRevealedAt(CFG.mosaicTileMs * total + 9999)).toBe(total);
  });
});

describe('revealModeFor', () => {
  const M3: RevealMode[] = ['blur', 'scanner', 'mosaic'];

  it('rotates through the given modes with offset 0', () => {
    expect(revealModeFor(0, 0, M3)).toBe('blur');
    expect(revealModeFor(1, 0, M3)).toBe('scanner');
    expect(revealModeFor(2, 0, M3)).toBe('mosaic');
    expect(revealModeFor(3, 0, M3)).toBe('blur');
  });

  it('offset shifts which mode is round 1', () => {
    expect(revealModeFor(0, 1, M3)).toBe('scanner');
    expect(revealModeFor(0, 2, M3)).toBe('mosaic');
  });

  it('rotates through a longer enabled list', () => {
    const all: RevealMode[] = ['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight'];
    expect(revealModeFor(4, 0, all)).toBe('silhouette');
    expect(revealModeFor(6, 0, all)).toBe('blur');
  });

  it('degenerates to a single mode', () => {
    expect(revealModeFor(7, 0, ['zoom'])).toBe('zoom');
  });
});

describe('scanAngleFor', () => {
  it('is deterministic for the same seed + round', () => {
    expect(scanAngleFor(12345, 3)).toBe(scanAngleFor(12345, 3));
  });

  it('returns an angle in [0, 360)', () => {
    for (let i = 0; i < 10; i++) {
      const a = scanAngleFor(987, i);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });

  it('varies across rounds for one game seed', () => {
    const angles = new Set([0, 1, 2, 3, 4].map((i) => scanAngleFor(42, i)));
    expect(angles.size).toBeGreaterThan(1);
  });
});

describe('tileOrderFor', () => {
  it('returns a valid permutation of [0..tileCount-1]', () => {
    const order = tileOrderFor(42, 0, 24);
    expect(order.length).toBe(24);
    expect([...order].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 24 }, (_, i) => i),
    );
  });

  it('is deterministic for the same seed + round', () => {
    expect(tileOrderFor(12345, 3, 24)).toEqual(tileOrderFor(12345, 3, 24));
  });

  it('varies across rounds for one game seed', () => {
    expect(tileOrderFor(42, 0, 24)).not.toEqual(tileOrderFor(42, 1, 24));
  });
});

describe('zoomFocusFor / spotlightOriginFor', () => {
  it('returns percentages in [0,100) and is deterministic', () => {
    const f = zoomFocusFor(42, 3);
    expect(f).toEqual(zoomFocusFor(42, 3));
    expect(f.xPct).toBeGreaterThanOrEqual(0);
    expect(f.xPct).toBeLessThan(100);
    expect(f.yPct).toBeGreaterThanOrEqual(0);
    expect(f.yPct).toBeLessThan(100);
  });

  it('spotlight differs from zoom focus for the same input', () => {
    expect(spotlightOriginFor(42, 3)).not.toEqual(zoomFocusFor(42, 3));
  });

  it('varies across rounds', () => {
    expect(zoomFocusFor(42, 0)).not.toEqual(zoomFocusFor(42, 1));
  });
});

describe('KNOWN_REVEAL_MODES', () => {
  it('lists the six known modes', () => {
    expect(KNOWN_REVEAL_MODES).toEqual(['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight']);
  });
});

describe('shuffle randomness seam', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0));
  afterEach(() => vi.restoreAllMocks());
  it('with Math.random pinned, the target stays in the options', () => {
    expect(buildOptions(TARGET, POOL)).toContain('Lightning Bolt');
  });
});
