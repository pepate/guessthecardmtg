import { describe, it, expect } from 'vitest';
import { compareAttribute, derivePrimaryType, getCardPower, getDisplayValue, cardHasAttribute, ATTRIBUTE_DEFS } from './attributes';
import type { ScryfallCard } from '../scryfall/types';

function makeCard(overrides: Partial<ScryfallCard>): ScryfallCard {
  return {
    id: 'test',
    name: 'Test Card',
    cmc: 3,
    type_line: 'Creature — Human',
    ...overrides,
  };
}

describe('ATTRIBUTE_DEFS', () => {
  it('has exactly four entries with correct kinds', () => {
    const kinds = ATTRIBUTE_DEFS.map(d => d.kind);
    expect(kinds).toContain('color');
    expect(kinds).toContain('cmc');
    expect(kinds).toContain('type');
    expect(kinds).toContain('power');
    expect(ATTRIBUTE_DEFS).toHaveLength(4);
  });
});

describe('derivePrimaryType', () => {
  it('extracts Creature from legendary creature line', () => {
    expect(derivePrimaryType('Legendary Creature — Elf Warrior')).toBe('Creature');
  });
  it('extracts Planeswalker', () => {
    expect(derivePrimaryType('Legendary Planeswalker — Jace')).toBe('Planeswalker');
  });
  it('extracts Instant', () => {
    expect(derivePrimaryType('Instant')).toBe('Instant');
  });
  it('extracts Land', () => {
    expect(derivePrimaryType('Basic Land — Forest')).toBe('Land');
  });
  it('extracts Artifact Creature -> Artifact (first match wins)', () => {
    const result = derivePrimaryType('Artifact Creature — Construct');
    expect(['Artifact', 'Creature']).toContain(result);
  });
});

describe('getCardPower', () => {
  it('returns numeric power', () => {
    expect(getCardPower(makeCard({ power: '3' }))).toBe(3);
  });
  it('returns null for * power', () => {
    expect(getCardPower(makeCard({ power: '*' }))).toBeNull();
  });
  it('returns null for missing power', () => {
    expect(getCardPower(makeCard({ power: undefined }))).toBeNull();
  });
  it('returns null for infinity symbol', () => {
    expect(getCardPower(makeCard({ power: '∞' }))).toBeNull();
  });
  it('handles 0 power', () => {
    expect(getCardPower(makeCard({ power: '0' }))).toBe(0);
  });
});

describe('compareAttribute — color', () => {
  it('exact match single color', () => {
    const card = makeCard({ colors: ['R'] });
    expect(compareAttribute(card, { kind: 'color', value: ['R'] })).toBe(true);
  });
  it('exact match multi-color order-independent', () => {
    const card = makeCard({ colors: ['U', 'W'] });
    expect(compareAttribute(card, { kind: 'color', value: ['W', 'U'] })).toBe(true);
  });
  it('mismatch different colors', () => {
    const card = makeCard({ colors: ['R'] });
    expect(compareAttribute(card, { kind: 'color', value: ['G'] })).toBe(false);
  });
  it('colorless card matches empty array', () => {
    const card = makeCard({ colors: [] });
    expect(compareAttribute(card, { kind: 'color', value: [] })).toBe(true);
  });
  it('colorless card (undefined colors) matches empty array', () => {
    const card = makeCard({ colors: undefined });
    expect(compareAttribute(card, { kind: 'color', value: [] })).toBe(true);
  });
  it('non-colorless guess vs colorless card is false', () => {
    const card = makeCard({ colors: [] });
    expect(compareAttribute(card, { kind: 'color', value: ['B'] })).toBe(false);
  });
});

describe('compareAttribute — cmc', () => {
  it('matches exact cmc', () => {
    const card = makeCard({ cmc: 4 });
    expect(compareAttribute(card, { kind: 'cmc', value: 4 })).toBe(true);
  });
  it('does not match wrong cmc', () => {
    const card = makeCard({ cmc: 4 });
    expect(compareAttribute(card, { kind: 'cmc', value: 3 })).toBe(false);
  });
  it('handles cmc 0', () => {
    const card = makeCard({ cmc: 0 });
    expect(compareAttribute(card, { kind: 'cmc', value: 0 })).toBe(true);
  });
});

describe('compareAttribute — type', () => {
  it('matches case-insensitively', () => {
    const card = makeCard({ type_line: 'Legendary Creature — Elf' });
    expect(compareAttribute(card, { kind: 'type', value: 'creature' })).toBe(true);
  });
  it('rejects wrong type', () => {
    const card = makeCard({ type_line: 'Instant' });
    expect(compareAttribute(card, { kind: 'type', value: 'Sorcery' })).toBe(false);
  });
  it('matches Planeswalker', () => {
    const card = makeCard({ type_line: 'Legendary Planeswalker — Liliana' });
    expect(compareAttribute(card, { kind: 'type', value: 'Planeswalker' })).toBe(true);
  });
});

describe('compareAttribute — power', () => {
  it('matches numeric power', () => {
    const card = makeCard({ power: '5' });
    expect(compareAttribute(card, { kind: 'power', value: 5 })).toBe(true);
  });
  it('rejects wrong power', () => {
    const card = makeCard({ power: '3' });
    expect(compareAttribute(card, { kind: 'power', value: 4 })).toBe(false);
  });
  it('returns false for * power regardless of guess', () => {
    const card = makeCard({ power: '*' });
    expect(compareAttribute(card, { kind: 'power', value: 0 })).toBe(false);
  });
  it('returns false for missing power', () => {
    const card = makeCard({ power: undefined });
    expect(compareAttribute(card, { kind: 'power', value: 2 })).toBe(false);
  });
});

describe('getDisplayValue', () => {
  it('shows Colorless when no colors', () => {
    expect(getDisplayValue(makeCard({ colors: [] }), 'color')).toBe('Colorless');
  });
  it('shows joined colors', () => {
    expect(getDisplayValue(makeCard({ colors: ['U', 'B'] }), 'color')).toBe('UB');
  });
  it('shows cmc as string', () => {
    expect(getDisplayValue(makeCard({ cmc: 7 }), 'cmc')).toBe('7');
  });
  it('shows primary type', () => {
    expect(getDisplayValue(makeCard({ type_line: 'Legendary Creature — Wizard' }), 'type')).toBe('Creature');
  });
  it('shows power string or dash', () => {
    expect(getDisplayValue(makeCard({ power: '4' }), 'power')).toBe('4');
    expect(getDisplayValue(makeCard({ power: undefined }), 'power')).toBe('—');
  });
});

describe('cardHasAttribute', () => {
  it('is true for color/cmc/type always', () => {
    const card = makeCard({});
    expect(cardHasAttribute(card, 'color')).toBe(true);
    expect(cardHasAttribute(card, 'cmc')).toBe(true);
    expect(cardHasAttribute(card, 'type')).toBe(true);
  });
  it('is false for power when power is missing', () => {
    expect(cardHasAttribute(makeCard({ power: undefined }), 'power')).toBe(false);
  });
  it('is false for power when power is *', () => {
    expect(cardHasAttribute(makeCard({ power: '*' }), 'power')).toBe(false);
  });
  it('is true for power when numeric', () => {
    expect(cardHasAttribute(makeCard({ power: '3' }), 'power')).toBe(true);
  });
});
