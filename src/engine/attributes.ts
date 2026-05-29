import type { ScryfallCard } from '../scryfall/types';
import type { AttributeKind, AttributeValue, AttributeDef } from './types';

export const ATTRIBUTE_DEFS: AttributeDef[] = [
  { kind: 'color', label: 'Color' },
  { kind: 'cmc', label: 'Mana Value' },
  { kind: 'type', label: 'Type' },
  { kind: 'power', label: 'Power' },
];

const PRIMARY_TYPES = [
  'Creature',
  'Planeswalker',
  'Enchantment',
  'Artifact',
  'Land',
  'Instant',
  'Sorcery',
  'Battle',
];

export function derivePrimaryType(typeLine: string): string {
  const upper = typeLine.toUpperCase();
  for (const t of PRIMARY_TYPES) {
    if (upper.includes(t.toUpperCase())) return t;
  }
  const beforeDash = typeLine.split('—')[0].trim();
  const words = beforeDash.split(/\s+/);
  return words[words.length - 1] ?? typeLine;
}

export function getCardPower(card: ScryfallCard): number | null {
  const raw = card.power;
  if (raw === undefined || raw === null || raw === '*' || raw === '∞') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function compareAttribute(card: ScryfallCard, value: AttributeValue): boolean {
  switch (value.kind) {
    case 'color': {
      const cardColors = card.colors ?? [];
      const guess = [...value.value].sort().join(',');
      const actual = [...cardColors].sort().join(',');
      return guess === actual;
    }
    case 'cmc':
      return card.cmc === value.value;
    case 'type':
      return derivePrimaryType(card.type_line).toLowerCase() === value.value.toLowerCase();
    case 'power': {
      const p = getCardPower(card);
      return p !== null && p === value.value;
    }
  }
}

export function getDisplayValue(card: ScryfallCard, kind: AttributeKind): string {
  switch (kind) {
    case 'color': {
      const c = card.colors ?? [];
      return c.length === 0 ? 'Colorless' : c.join('');
    }
    case 'cmc':
      return String(card.cmc);
    case 'type':
      return derivePrimaryType(card.type_line);
    case 'power':
      return card.power ?? '—';
  }
}

export function cardHasAttribute(card: ScryfallCard, kind: AttributeKind): boolean {
  if (kind === 'power') return getCardPower(card) !== null;
  return true;
}
