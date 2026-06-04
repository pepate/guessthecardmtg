import { useEffect, useState } from 'react';
import { fetchDailyToday, ensureDailyToday, type DailyToday } from '../daily/client';
import { fetchComboBoard } from '../leaderboard/client';
import { fetchSetTopArts } from '../cards/client';
import type { GlobalEntry } from '../leaderboard/types';
import { useGameStore } from '../state/gameStore';
import { DailySetButton } from './DailySetButton';
import { DailySetModal } from './DailySetModal';

export function DailySet() {
  const [daily, setDaily] = useState<DailyToday | null>(null);
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState<GlobalEntry[]>([]);
  const [topArts, setTopArts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchDailyToday().then((d) => { if (!cancelled) setDaily(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // While the board is still empty, pull the set's top-EDHRec artworks to give
  // the banner some colour. Skipped once a leader exists.
  useEffect(() => {
    if (!daily || daily.leader || !daily.setCode) { setTopArts([]); return; }
    let cancelled = false;
    fetchSetTopArts(daily.setCode, 4).then((a) => { if (!cancelled) setTopArts(a); }).catch(() => {});
    return () => { cancelled = true; };
  }, [daily]);

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
      <DailySetButton daily={daily} onOpen={() => void openModal()} topArts={topArts} />
      {open && daily && (
        <DailySetModal daily={daily} board={board} onPlay={play} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
