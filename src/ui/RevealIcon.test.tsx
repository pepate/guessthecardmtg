import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RevealIcon } from './RevealIcon';
import { KNOWN_REVEAL_MODES } from '../engine/revealMode';

describe('RevealIcon', () => {
  it('renders a labelled svg icon for every reveal mode', () => {
    for (const reveal of KNOWN_REVEAL_MODES) {
      const { container } = render(<RevealIcon reveal={reveal} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('aria-label')).toBeTruthy();
    }
  });
});
