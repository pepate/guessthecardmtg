import { describe, it, expect, beforeEach } from 'vitest';
import { progressiveReveal } from './progressiveReveal';
import type { ScryfallCard } from '../../scryfall/types';
import type { RoundState, StartRoundInput } from '../types';
import { DEFAULT_SCORE_CONFIG } from '../types';

function makeCard(overrides: Partial<ScryfallCard> & Pick<ScryfallCard, 'id' | 'name'>): ScryfallCard {
  return {
    cmc: 3,
    type_line: 'Creature — Elf',
    colors: ['G'],
    ...overrides,
  };
}

const TARGET = makeCard({ id: 'target', name: 'Llanowar Elves', cmc: 1, colors: ['G'], power: '1' });

const POOL_CARDS: ScryfallCard[] = [
  TARGET,
  makeCard({ id: 'c1', name: 'Giant Growth', cmc: 1, colors: ['G'], type_line: 'Instant', power: undefined }),
  makeCard({ id: 'c2', name: 'Lightning Bolt', cmc: 1, colors: ['R'], type_line: 'Instant', power: undefined }),
  makeCard({ id: 'c3', name: 'Dark Ritual', cmc: 1, colors: ['B'], type_line: 'Instant', power: undefined }),
  makeCard({ id: 'c4', name: 'Elvish Mystic', cmc: 1, colors: ['G'], type_line: 'Creature — Elf', power: '1' }),
  makeCard({ id: 'c5', name: 'Birds of Paradise', cmc: 1, colors: ['G'], type_line: 'Creature — Bird', power: '0' }),
  makeCard({ id: 'c6', name: 'Sol Ring', cmc: 1, colors: [], type_line: 'Artifact', power: undefined }),
  makeCard({ id: 'c7', name: 'Ancestral Recall', cmc: 1, colors: ['U'], type_line: 'Instant', power: undefined }),
];

const BASE_INPUT: StartRoundInput = { target: TARGET, pool: POOL_CARDS };

function startRound(overrides?: Partial<StartRoundInput>): RoundState {
  return progressiveReveal.startRound({ ...BASE_INPUT, ...overrides });
}

const identityShuffle = <T>(arr: T[]): T[] => [...arr];

describe('startRound', () => {
  it('initialises with full startBudget', () => {
    const round = startRound();
    expect(round.budget).toBe(DEFAULT_SCORE_CONFIG.startBudget);
  });
  it('all reveals are false', () => {
    const round = startRound();
    expect(round.reveals).toEqual({ color: false, cmc: false, type: false, power: false });
  });
  it('status is playing', () => {
    const round = startRound();
    expect(round.status).toBe('playing');
  });
  it('respects custom config', () => {
    const round = startRound({ config: { ...DEFAULT_SCORE_CONFIG, startBudget: 500 } });
    expect(round.budget).toBe(500);
  });
  it('stores target and pool', () => {
    const round = startRound();
    expect(round.target.name).toBe('Llanowar Elves');
    expect(round.pool).toHaveLength(POOL_CARDS.length);
  });
});

describe('revealableAttributes', () => {
  it('returns all four for a card with power', () => {
    const round = startRound();
    const kinds = progressiveReveal.revealableAttributes(round);
    expect(kinds).toContain('color');
    expect(kinds).toContain('cmc');
    expect(kinds).toContain('type');
    expect(kinds).toContain('power');
    expect(kinds).toHaveLength(4);
  });
  it('excludes power for a non-creature card', () => {
    const noPowerTarget = makeCard({ id: 'instant', name: 'Shock', cmc: 1, colors: ['R'], type_line: 'Instant', power: undefined });
    const round = startRound({ target: noPowerTarget });
    const kinds = progressiveReveal.revealableAttributes(round);
    expect(kinds).not.toContain('power');
  });
  it('excludes already revealed kinds', () => {
    let round = startRound();
    ({ round } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['G'] }));
    const kinds = progressiveReveal.revealableAttributes(round);
    expect(kinds).not.toContain('color');
  });
});

describe('guessAttribute — correct', () => {
  it('subtracts revealCost from budget', () => {
    const round = startRound();
    const { result } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['G'] });
    expect(result.correct).toBe(true);
    expect(result.scoreDelta).toBe(-DEFAULT_SCORE_CONFIG.revealCost);
    expect(result.budget).toBe(DEFAULT_SCORE_CONFIG.startBudget - DEFAULT_SCORE_CONFIG.revealCost);
  });
  it('sets revealedAttribute', () => {
    const round = startRound();
    const { result } = progressiveReveal.guessAttribute(round, { kind: 'cmc', value: 1 });
    expect(result.revealedAttribute).toBe('cmc');
  });
  it('marks the attribute as revealed', () => {
    const round = startRound();
    const { round: newRound } = progressiveReveal.guessAttribute(round, { kind: 'type', value: 'Creature' });
    expect(newRound.reveals.type).toBe(true);
  });
  it('does not mutate original round', () => {
    const round = startRound();
    progressiveReveal.guessAttribute(round, { kind: 'color', value: ['G'] });
    expect(round.budget).toBe(DEFAULT_SCORE_CONFIG.startBudget);
    expect(round.reveals.color).toBe(false);
  });
});

describe('guessAttribute — wrong', () => {
  it('subtracts wrongAttributeCost', () => {
    const round = startRound();
    const { result } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['R'] });
    expect(result.correct).toBe(false);
    expect(result.scoreDelta).toBe(-DEFAULT_SCORE_CONFIG.wrongAttributeCost);
  });
  it('increments wrongAttempts.attribute', () => {
    const round = startRound();
    const { round: r2 } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['R'] });
    expect(r2.wrongAttempts.attribute).toBe(1);
  });
  it('does not reveal the attribute', () => {
    const round = startRound();
    const { round: r2 } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['R'] });
    expect(r2.reveals.color).toBe(false);
  });
});

describe('budget exhaustion -> lost', () => {
  it('sets status to lost when budget hits 0 on wrong attribute guess', () => {
    const tinyBudget = { ...DEFAULT_SCORE_CONFIG, startBudget: DEFAULT_SCORE_CONFIG.wrongAttributeCost };
    let round = startRound({ config: tinyBudget });
    const { round: r2, result } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['R'] });
    expect(r2.status).toBe('lost');
    expect(result.roundOver).toBe(true);
    expect(r2.budget).toBe(0);
  });

  it('sets status to lost when budget hits 0 on wrong name guess', () => {
    const tinyBudget = { ...DEFAULT_SCORE_CONFIG, startBudget: DEFAULT_SCORE_CONFIG.wrongNameCost };
    let round = startRound({ config: tinyBudget });
    const { round: r2, result } = progressiveReveal.guessName(round, 'Wrong Card');
    expect(r2.status).toBe('lost');
    expect(result.roundOver).toBe(true);
    expect(r2.budget).toBe(0);
  });

  it('budget never goes below 0', () => {
    const tinyBudget = { ...DEFAULT_SCORE_CONFIG, startBudget: 10 };
    let round = startRound({ config: tinyBudget });
    const { round: r2 } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['R'] });
    expect(r2.budget).toBe(0);
  });

  it('full scoring math: 1000 start, 1 reveal, 2 wrong attrs, 1 wrong name', () => {
    let round = startRound();
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['G'] }));
    expect(round.budget).toBe(850);
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'cmc', value: 99 }));
    expect(round.budget).toBe(800);
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'cmc', value: 98 }));
    expect(round.budget).toBe(750);
    ;({ round } = progressiveReveal.guessName(round, 'Wrong Name'));
    expect(round.budget).toBe(550);
    expect(round.status).toBe('playing');
  });
});

describe('guessName', () => {
  it('correct guess sets status won, roundWon, roundOver', () => {
    const round = startRound();
    const { round: r2, result } = progressiveReveal.guessName(round, 'Llanowar Elves');
    expect(r2.status).toBe('won');
    expect(result.roundWon).toBe(true);
    expect(result.roundOver).toBe(true);
    expect(result.correct).toBe(true);
    expect(result.scoreDelta).toBe(0);
  });
  it('correct guess does not change budget', () => {
    const round = startRound();
    const { result } = progressiveReveal.guessName(round, 'Llanowar Elves');
    expect(result.budget).toBe(DEFAULT_SCORE_CONFIG.startBudget);
  });
  it('wrong guess subtracts wrongNameCost', () => {
    const round = startRound();
    const { result } = progressiveReveal.guessName(round, 'Elvish Mystic');
    expect(result.correct).toBe(false);
    expect(result.scoreDelta).toBe(-DEFAULT_SCORE_CONFIG.wrongNameCost);
    expect(result.budget).toBe(DEFAULT_SCORE_CONFIG.startBudget - DEFAULT_SCORE_CONFIG.wrongNameCost);
  });
  it('wrong guess increments wrongAttempts.name', () => {
    const round = startRound();
    const { round: r2 } = progressiveReveal.guessName(round, 'Elvish Mystic');
    expect(r2.wrongAttempts.name).toBe(1);
  });
  it('does not mutate original round', () => {
    const round = startRound();
    progressiveReveal.guessName(round, 'Wrong');
    expect(round.budget).toBe(DEFAULT_SCORE_CONFIG.startBudget);
  });
});

describe('score', () => {
  it('returns full budget at start', () => {
    const round = startRound();
    expect(progressiveReveal.score(round)).toBe(DEFAULT_SCORE_CONFIG.startBudget);
  });
  it('clamps at 0', () => {
    const round = { ...startRound(), budget: -50 };
    expect(progressiveReveal.score(round)).toBe(0);
  });
  it('returns remaining budget after deductions', () => {
    let round = startRound();
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['G'] }));
    expect(progressiveReveal.score(round)).toBe(850);
  });
});

describe('nameChoices', () => {
  beforeEach(() => {
    progressiveReveal._shuffleFn = identityShuffle;
  });

  it('always includes the target name', () => {
    const round = startRound();
    const choices = progressiveReveal.nameChoices(round);
    expect(choices).toContain('Llanowar Elves');
  });
  it('returns between 2 and 6 choices', () => {
    const round = startRound();
    const choices = progressiveReveal.nameChoices(round);
    expect(choices.length).toBeGreaterThanOrEqual(2);
    expect(choices.length).toBeLessThanOrEqual(6);
  });
  it('has no duplicates', () => {
    const round = startRound();
    const choices = progressiveReveal.nameChoices(round);
    expect(new Set(choices).size).toBe(choices.length);
  });

  it('all non-target choices share color when color is revealed', () => {
    let round = startRound();
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['G'] }));
    expect(round.reveals.color).toBe(true);

    const choices = progressiveReveal.nameChoices(round);
    const nonTarget = choices.filter(n => n !== 'Llanowar Elves');

    for (const name of nonTarget) {
      const card = POOL_CARDS.find(c => c.name === name)!;
      expect(card).toBeDefined();
      const cardColors = [...(card.colors ?? [])].sort().join(',');
      const targetColors = [...(TARGET.colors ?? [])].sort().join(',');
      expect(cardColors).toBe(targetColors);
    }
  });

  it('all non-target choices share cmc when cmc is revealed', () => {
    let round = startRound();
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'cmc', value: 1 }));
    expect(round.reveals.cmc).toBe(true);

    const choices = progressiveReveal.nameChoices(round);
    const nonTarget = choices.filter(n => n !== 'Llanowar Elves');

    for (const name of nonTarget) {
      const card = POOL_CARDS.find(c => c.name === name)!;
      expect(card).toBeDefined();
      expect(card.cmc).toBe(TARGET.cmc);
    }
  });

  it('all non-target choices share type when type is revealed', () => {
    let round = startRound();
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'type', value: 'Creature' }));
    expect(round.reveals.type).toBe(true);

    const choices = progressiveReveal.nameChoices(round);
    const nonTarget = choices.filter(n => n !== 'Llanowar Elves');

    for (const name of nonTarget) {
      const card = POOL_CARDS.find(c => c.name === name)!;
      expect(card).toBeDefined();
      expect(card.type_line.toUpperCase()).toContain('CREATURE');
    }
  });

  it('all non-target choices share power when power is revealed', () => {
    let round = startRound();
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'power', value: 1 }));
    expect(round.reveals.power).toBe(true);

    const choices = progressiveReveal.nameChoices(round);
    const nonTarget = choices.filter(n => n !== 'Llanowar Elves');

    for (const name of nonTarget) {
      const card = POOL_CARDS.find(c => c.name === name)!;
      expect(card).toBeDefined();
      expect(card.power).toBe(TARGET.power);
    }
  });

  it('falls back gracefully when too few consistent distractors', () => {
    const uniqueTarget = makeCard({ id: 'rare', name: 'Unique Card', cmc: 99, colors: ['W', 'U', 'B', 'R', 'G'], power: '99' });
    let round = progressiveReveal.startRound({ target: uniqueTarget, pool: [uniqueTarget, ...POOL_CARDS] });
    ;({ round } = progressiveReveal.guessAttribute(round, { kind: 'color', value: ['W', 'U', 'B', 'R', 'G'] }));
    expect(round.reveals.color).toBe(true);

    const choices = progressiveReveal.nameChoices(round);
    expect(choices).toContain('Unique Card');
    expect(choices.length).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic with identity shuffle', () => {
    const round = startRound();
    const a = progressiveReveal.nameChoices(round);
    const b = progressiveReveal.nameChoices(round);
    expect(a).toEqual(b);
  });
});
