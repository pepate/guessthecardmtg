import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildOptions, createRound, planGame, stageAt, scoreAt, resolveGuess, expire } from './timeAttack';
import { DEFAULT_TIME_ATTACK_CONFIG as CFG } from './types';
import type { Round } from './types';
import type { ScryfallCard } from '../scryfall/types';

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

describe('shuffle randomness seam', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0));
  afterEach(() => vi.restoreAllMocks());
  it('with Math.random pinned, the target stays in the options', () => {
    expect(buildOptions(TARGET, POOL)).toContain('Lightning Bolt');
  });
});
