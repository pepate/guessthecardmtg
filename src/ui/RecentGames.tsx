import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { CustomMode } from '../modes/types';
import { fetchRecentGames, fillToLimit } from '../modes/recent';
import { listModes } from '../modes/client';
import { fetchModeTopArt } from '../cards/client';
import { fetchModeTopScores } from '../leaderboard/client';
import type { GlobalEntry } from '../leaderboard/types';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';

interface GameCard {
  mode: CustomMode;
  art: string | null;
  leader: GlobalEntry | null;
}

const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;

export function RecentGames({ onPick }: { onPick: (mode: CustomMode) => void }) {
  const [cards, setCards] = useState<GameCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recent = await fetchRecentGames(4).catch(() => [] as CustomMode[]);
      let games = recent;
      if (games.length < 4) {
        const popular = await listModes(8).catch(() => []);
        games = fillToLimit(recent, popular, 4);
      }
      const built = await Promise.all(
        games.map(async (mode) => ({
          mode,
          art: await fetchModeTopArt(mode.filter).catch(() => null),
          leader: (await fetchModeTopScores(mode.id, 1).catch(() => []))[0] ?? null,
        })),
      );
      if (!cancelled) setCards(built);
    })().catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, []);

  if (cards === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <span className="spinner" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <p data-testid="games-empty" style={{ color: 'var(--ink-1)', fontSize: 14, textAlign: 'center', margin: 0 }}>
        No games yet — start one from the Leaderboard tab.
      </p>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      data-testid="recent-games"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
    >
      {cards.map(({ mode, art, leader }) => (
        <button
          key={mode.id}
          type="button"
          data-testid="game-card"
          onClick={() => onPick(mode)}
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            borderRadius: 14,
            overflow: 'hidden',
            padding: 0,
            cursor: 'pointer',
            border: '1px solid var(--line-strong)',
            background: `center / cover no-repeat url(${art ?? FALLBACK_ART})`,
            textAlign: 'left',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(7,6,10,0.1) 0%, rgba(7,6,10,0.55) 60%, rgba(7,6,10,0.9) 100%)',
            }}
          />
          <span
            style={{
              position: 'absolute', left: 12, right: 12, bottom: 10,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <span style={{ color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
              {mode.name}
            </span>
            {leader && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-1)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, minWidth: 0 }}>
                <span aria-hidden>{countryToFlag(leader.country)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leader.name}</span>
                <ScoreValue score={leader.score} fontSize={12} />
              </span>
            )}
          </span>
        </button>
      ))}
    </motion.div>
  );
}
