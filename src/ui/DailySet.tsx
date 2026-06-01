import { useEffect, useState } from 'react';
import { fetchDailyToday, ensureDailyToday, type DailyToday } from '../daily/client';
import { fetchComboBoard } from '../leaderboard/client';
import type { GlobalEntry } from '../leaderboard/types';
import { useGameStore } from '../state/gameStore';
import { DailySetButton } from './DailySetButton';
import { DailySetModal } from './DailySetModal';

export function DailySet() {
  const [daily, setDaily] = useState<DailyToday | null>(null);
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState<GlobalEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchDailyToday().then((d) => { if (!cancelled) setDaily(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function openModal() {
    setOpen(true);
    // Ensure today's set exists (first click of the day creates it), then load its board.
    const d = (await ensureDailyToday().catch(() => null)) ?? daily;
    if (d) {
      setDaily(d);
      const b = await fetchComboBoard(d.modeId, d.reveal, null, 50).catch(() => []);
      setBoard(b);
    }
  }

  function play() {
    if (!daily) return;
    const store = useGameStore.getState();
    store.setRevealChoice(daily.reveal);
    void store.selectPool({
      kind: 'custom',
      modeId: daily.modeId,
      filter: { sets: daily.setCode ? [daily.setCode] : [] },
      name: daily.setName ?? 'Daily Set',
      daily: daily.reveal,
    });
  }

  return (
    <>
      <DailySetButton daily={daily} onOpen={() => void openModal()} />
      {open && daily && (
        <DailySetModal daily={daily} board={board} onPlay={play} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
