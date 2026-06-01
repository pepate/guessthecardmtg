import type { CustomMode } from '../modes/types';
import { ModeDetail } from './ModeDetail';

export function RevealPicker({ mode }: { mode: CustomMode }) {
  return (
    <ModeDetail
      modeId={mode.id}
      modeName={mode.name}
      filter={mode.filter}
      cardCount={mode.card_count}
    />
  );
}
