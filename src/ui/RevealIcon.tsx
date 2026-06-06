import type { RevealMode } from '../engine/revealMode';
import { REVEAL_MODE_LABELS } from '../reveal/labels';

/**
 * Compact icon for a reveal mode — replaces the wide text label in the reveal
 * list so the leader name has room. Each glyph hints at how the mode reveals
 * the card. The accessible name carries the mode's text label.
 */
export function RevealIcon({ reveal, size = 26 }: { reveal: RevealMode; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    role: 'img' as const,
    'aria-label': REVEAL_MODE_LABELS[reveal],
    style: { flexShrink: 0, color: 'var(--ember-hot)' },
  };
  switch (reveal) {
    case 'blur':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="12" cy="12" r="9" opacity="0.25" />
          <circle cx="12" cy="12" r="5.5" opacity="0.5" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case 'scanner':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" opacity="0.45" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
    case 'mosaic':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          {[4, 10, 16].map((x) =>
            [4, 10, 16].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="0.6" opacity={(x + y) % 12 === 0 ? 1 : 0.5} />),
          )}
        </svg>
      );
    case 'zoom':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="6" />
          <line x1="14.5" y1="14.5" x2="20" y2="20" />
        </svg>
      );
    case 'silhouette':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
        </svg>
      );
    case 'spotlight':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="12" cy="4" r="2" />
          <path d="M12 6 L19 21 H5 Z" opacity="0.5" />
        </svg>
      );
    case 'gallery':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <rect x="3" y="3" width="8" height="8" rx="1.2" />
          <rect x="13" y="3" width="8" height="8" rx="1.2" opacity="0.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.2" opacity="0.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.2" />
        </svg>
      );
    default:
      return null;
  }
}
