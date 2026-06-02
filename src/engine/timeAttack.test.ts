import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildOptions, createRound, planGame, planGalleryGame, primaryType, GALLERY_TILES, stageAt, scoreAt, resolveGuess, expire, scanProgressAt, tilesRevealedAt, resolveGameMode, scanAngleFor, tileOrderFor, spotlightOriginFor, KNOWN_REVEAL_MODES } from './timeAttack';
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

describe('resolveGameMode', () => {
  const enabled: RevealMode[] = ['blur', 'scanner', 'mosaic', 'zoom'];

  it('returns a concrete choice unchanged', () => {
    expect(resolveGameMode('zoom', enabled)).toBe('zoom');
  });

  it('resolves "random" to a member of the enabled set', () => {
    for (let i = 0; i < 20; i++) {
      expect(enabled).toContain(resolveGameMode('random', enabled));
    }
  });

  it('falls back to blur when nothing is enabled', () => {
    expect(resolveGameMode('random', [])).toBe('blur');
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

describe('spotlightOriginFor', () => {
  it('returns percentages in [0,100) and is deterministic', () => {
    const o = spotlightOriginFor(42, 3);
    expect(o).toEqual(spotlightOriginFor(42, 3));
    expect(o.xPct).toBeGreaterThanOrEqual(0);
    expect(o.xPct).toBeLessThan(100);
    expect(o.yPct).toBeGreaterThanOrEqual(0);
    expect(o.yPct).toBeLessThan(100);
  });

  it('varies across rounds', () => {
    expect(spotlightOriginFor(42, 0)).not.toEqual(spotlightOriginFor(42, 1));
  });
});

describe('KNOWN_REVEAL_MODES', () => {
  it('lists every known mode', () => {
    expect(KNOWN_REVEAL_MODES).toEqual(['blur', 'scanner', 'mosaic', 'zoom', 'silhouette', 'spotlight', 'gallery']);
  });
});

describe('primaryType', () => {
  const t = (line: string) => primaryType({ id: 'x', name: 'x', cmc: 0, type_line: line });

  it('returns the bare type for a simple line', () => {
    expect(t('Instant')).toBe('Instant');
  });

  it('skips supertypes', () => {
    expect(t('Legendary Creature — God')).toBe('Creature');
    expect(t('Basic Land — Forest')).toBe('Land');
  });

  it('takes the first type for a multi-type card', () => {
    expect(t('Artifact Creature — Golem')).toBe('Artifact');
  });

  it('falls back to the card face when the top-level line is empty', () => {
    expect(primaryType({ id: 'x', name: 'x', cmc: 0, type_line: '', card_faces: [{ type_line: 'Sorcery' }] })).toBe('Sorcery');
  });
});

describe('planGalleryGame', () => {
  const artCard = (name: string, type = 'Creature'): ScryfallCard => ({
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    cmc: 1,
    type_line: type,
    image_uris: { art_crop: `https://img/${encodeURIComponent(name)}.jpg` },
  });

  const creatures = Array.from({ length: 8 }, (_, i) => artCard(`Creature ${i}`, 'Creature'));
  const lands = Array.from({ length: 4 }, (_, i) => artCard(`Land ${i}`, 'Land'));
  const pool = [...creatures, ...lands];

  it('gives every round GALLERY_TILES distinct option cards including the target', () => {
    for (const round of planGalleryGame(pool, CFG)) {
      expect(round.optionCards).toHaveLength(GALLERY_TILES);
      const names = round.optionCards!.map((c) => c.name);
      expect(names).toContain(round.target.name);
      expect(new Set(names).size).toBe(GALLERY_TILES);
      expect(round.options).toEqual(names); // options mirror the tile order
    }
  });

  it('only ever uses cards that have artwork', () => {
    const mixed = [...pool, { id: 'no-art', name: 'No Art', cmc: 1, type_line: 'Creature' } as ScryfallCard];
    for (const round of planGalleryGame(mixed, CFG)) {
      for (const c of round.optionCards!) {
        expect(c.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.art_crop).toBeTruthy();
      }
    }
  });

  it('keeps distractors the same primary type when enough of that type exist', () => {
    // 8 creatures + 4 lands → both types can fill 3 distractors of their own kind.
    for (const round of planGalleryGame(pool, CFG)) {
      const tp = primaryType(round.target);
      for (const c of round.optionCards!) expect(primaryType(c)).toBe(tp);
    }
  });

  it('falls back to other types when the target type is too small', () => {
    const scarce = [artCard('Lone Land', 'Land'), ...creatures.slice(0, 5)];
    const plan = planGalleryGame(scarce, CFG);
    const landRound = plan.find((r) => r.target.name === 'Lone Land');
    expect(landRound).toBeDefined();
    expect(landRound!.optionCards).toHaveLength(GALLERY_TILES);
    // Only one land exists, so the other three tiles are creatures.
    const creatureTiles = landRound!.optionCards!.filter((c) => primaryType(c) === 'Creature');
    expect(creatureTiles).toHaveLength(3);
  });

  it('uses a distinct target card in every round', () => {
    const targets = planGalleryGame(pool, CFG).map((r) => r.target.name);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe('shuffle randomness seam', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0));
  afterEach(() => vi.restoreAllMocks());
  it('with Math.random pinned, the target stays in the options', () => {
    expect(buildOptions(TARGET, POOL)).toContain('Lightning Bolt');
  });
});
