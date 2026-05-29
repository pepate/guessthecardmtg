import type { GameMode, RoundState, RoundStatus, StartRoundInput, AttributeKind, AttributeValue, GuessResult, ScoreConfig } from '../types';
import { DEFAULT_SCORE_CONFIG } from '../types';
import { compareAttribute, cardHasAttribute } from '../attributes';
import type { ScryfallCard } from '../../scryfall/types';

const ALL_KINDS: AttributeKind[] = ['color', 'cmc', 'type', 'power'];

function cfg(round: RoundState): ScoreConfig {
  return (round as RoundState & { _config?: ScoreConfig })._config ?? DEFAULT_SCORE_CONFIG;
}

function attachConfig(round: RoundState, config: ScoreConfig): RoundState {
  return Object.assign({}, round, { _config: config });
}

function clampBudget(n: number): number {
  return Math.max(0, n);
}

export type RngFn = (arr: unknown[]) => unknown[];

export function shuffleWithRng<T>(arr: T[], rng: (arr: T[]) => T[]): T[] {
  return rng(arr);
}

function defaultShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardMatchesReveals(card: ScryfallCard, target: ScryfallCard, reveals: Record<AttributeKind, boolean>): boolean {
  for (const kind of ALL_KINDS) {
    if (!reveals[kind]) continue;
    switch (kind) {
      case 'color': {
        const tc = [...(target.colors ?? [])].sort().join(',');
        const cc = [...(card.colors ?? [])].sort().join(',');
        if (tc !== cc) return false;
        break;
      }
      case 'cmc':
        if (card.cmc !== target.cmc) return false;
        break;
      case 'type': {
        const tt = target.type_line.toUpperCase();
        const ct = card.type_line.toUpperCase();
        const primaryTypes = ['CREATURE','PLANESWALKER','ENCHANTMENT','ARTIFACT','LAND','INSTANT','SORCERY','BATTLE'];
        const targetPrimary = primaryTypes.find(p => tt.includes(p)) ?? tt.split('—')[0].trim().split(/\s+/).pop() ?? tt;
        const cardPrimary = primaryTypes.find(p => ct.includes(p)) ?? ct.split('—')[0].trim().split(/\s+/).pop() ?? ct;
        if (targetPrimary !== cardPrimary) return false;
        break;
      }
      case 'power': {
        const tp = target.power;
        const cp = card.power;
        if (tp !== cp) return false;
        break;
      }
    }
  }
  return true;
}

export const progressiveReveal: GameMode & { _shuffleFn?: <T>(arr: T[]) => T[] } = {
  id: 'progressive-reveal',

  startRound(input: StartRoundInput): RoundState {
    const config = input.config ?? DEFAULT_SCORE_CONFIG;
    const base: RoundState = {
      target: input.target,
      pool: input.pool,
      reveals: { color: false, cmc: false, type: false, power: false },
      budget: config.startBudget,
      wrongAttempts: { attribute: 0, name: 0 },
      status: 'playing' as RoundStatus,
    };
    return attachConfig(base, config);
  },

  revealableAttributes(round: RoundState): AttributeKind[] {
    return ALL_KINDS.filter(
      k => !round.reveals[k] && cardHasAttribute(round.target, k),
    );
  },

  guessAttribute(round: RoundState, value: AttributeValue): { round: RoundState; result: GuessResult } {
    const config = cfg(round);
    const correct = compareAttribute(round.target, value);

    if (correct) {
      const newBudget = clampBudget(round.budget - config.revealCost);
      const newReveals = { ...round.reveals, [value.kind]: true };
      const budgetExhausted = newBudget === 0;
      const newStatus: RoundStatus = budgetExhausted ? 'lost' : round.status;
      const newRound = attachConfig({
        ...round,
        reveals: newReveals,
        budget: newBudget,
        status: newStatus,
      }, config);
      const result: GuessResult = {
        correct: true,
        revealedAttribute: value.kind,
        roundOver: budgetExhausted,
        scoreDelta: -config.revealCost,
        budget: newBudget,
      };
      return { round: newRound, result };
    } else {
      const newBudget = clampBudget(round.budget - config.wrongAttributeCost);
      const budgetExhausted = newBudget === 0;
      const newStatus: RoundStatus = budgetExhausted ? 'lost' : round.status;
      const newRound = attachConfig({
        ...round,
        budget: newBudget,
        wrongAttempts: { ...round.wrongAttempts, attribute: round.wrongAttempts.attribute + 1 },
        status: newStatus,
      }, config);
      const result: GuessResult = {
        correct: false,
        roundOver: budgetExhausted,
        scoreDelta: -config.wrongAttributeCost,
        budget: newBudget,
      };
      return { round: newRound, result };
    }
  },

  nameChoices(round: RoundState): string[] {
    const shuffle = (this as typeof progressiveReveal)._shuffleFn ?? defaultShuffle;
    const targetName = round.target.name;

    const distractors = round.pool.filter(c => c.name !== targetName);
    const consistent = distractors.filter(c =>
      cardMatchesReveals(c, round.target, round.reveals),
    );

    const pool = consistent.length >= 1
      ? consistent
      : distractors;

    const picked = shuffle([...pool]).slice(0, 5);
    const names = picked.map(c => c.name).filter(n => n !== targetName);
    const unique = [...new Set(names)].slice(0, 5);

    const all = shuffle([...unique, targetName] as string[]) as string[];
    return all.slice(0, 6);
  },

  guessName(round: RoundState, name: string): { round: RoundState; result: GuessResult } {
    const config = cfg(round);
    const correct = round.target.name === name;

    if (correct) {
      const newRound = attachConfig({
        ...round,
        status: 'won' as RoundStatus,
      }, config);
      const result: GuessResult = {
        correct: true,
        roundWon: true,
        roundOver: true,
        scoreDelta: 0,
        budget: round.budget,
      };
      return { round: newRound, result };
    } else {
      const newBudget = clampBudget(round.budget - config.wrongNameCost);
      const budgetExhausted = newBudget === 0;
      const newStatus: RoundStatus = budgetExhausted ? 'lost' : round.status;
      const newRound = attachConfig({
        ...round,
        budget: newBudget,
        wrongAttempts: { ...round.wrongAttempts, name: round.wrongAttempts.name + 1 },
        status: newStatus,
      }, config);
      const result: GuessResult = {
        correct: false,
        roundOver: budgetExhausted,
        scoreDelta: -config.wrongNameCost,
        budget: newBudget,
      };
      return { round: newRound, result };
    }
  },

  score(round: RoundState): number {
    return clampBudget(round.budget);
  },
};
