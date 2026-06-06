import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { CustomMode } from '../modes/types';
import { fetchRecentGames, fillToLimit } from '../modes/recent';
import { listModes } from '../modes/client';
import { fetchModeTopArt } from '../cards/client';
import { fetchModeRuns } from '../leaderboard/client';
import { summedBoard, summedRank, ownBestPerReveal } from '../leaderboard/boards';
import { getUserId } from '../leaderboard/identity';
import { fetchEnabledRevealModes } from '../reveal/client';
import type { RevealMode } from '../engine/revealMode';
import type { GlobalEntry } from '../leaderboard/types';
import { ScoreValue } from './ScoreValue';
import { countryToFlag } from '../leaderboard/flag';

interface GameCard {
  mode: CustomMode;
  art: string | null;
  leader: GlobalEntry | null;
  /** The player's rank in this mode's summed board; null when they haven't played here. */
  rank: number | null;
  /** The player's summed total in this mode. */
  points: number;
  /** How many games the player has recorded in this mode. */
  games: number;
  /** Distinct reveal modes the player has scored in here. */
  playedReveals: number;
}

const FALLBACK_ART = `${import.meta.env.BASE_URL}og-image.jpeg`;
const INITIAL = 10;

export function RecentGames({ onPick }: { onPick: (mode: CustomMode) => void }) {
  const [modes, setModes] = useState<CustomMode[] | null>(null);
  const [uid, setUid] = useState('');
  const [enabled, setEnabled] = useState<RevealMode[]>([]);
  const [limit, setLimit] = useState(INITIAL);
  const [cards, setCards] = useState<GameCard[] | null>(null);

  // Load the full ordered mode list once: the device's recently-played first,
  // then every other mode by popularity. Cards/runs are fetched lazily per slice.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [recent, all, id, en] = await Promise.all([
        fetchRecentGames(200).catch(() => [] as CustomMode[]),
        listModes(200).catch(() => [] as CustomMode[]),
        getUserId().catch(() => null),
        fetchEnabledRevealModes().catch(() => [] as RevealMode[]),
      ]);
      const ordered = fillToLimit(recent, all, recent.length + all.length);
      if (!cancelled) { setUid(id ?? ''); setEnabled(en); setModes(ordered); }
    })().catch(() => { if (!cancelled) setModes([]); });
    return () => { cancelled = true; };
  }, []);

  // Fetch art + standings for the currently-visible slice.
  useEffect(() => {
    if (!modes) return;
    let cancelled = false;
    (async () => {
      const visible = modes.slice(0, limit);
      const built = await Promise.all(
        visible.map(async (mode) => {
          const [art, runs] = await Promise.all([
            fetchModeTopArt(mode.filter).catch(() => null),
            fetchModeRuns(mode.id).catch(() => []),
          ]);
          const board = summedBoard(runs);
          const rank = uid ? summedRank(board, uid) : null;
          const points = uid ? board.find((e) => e.deviceId === uid)?.score ?? 0 : 0;
          const games = uid ? runs.filter((r) => r.deviceId === uid && r.gameMode).length : 0;
          const own = uid ? ownBestPerReveal(runs, uid) : new Map();
          const playedReveals = enabled.filter((r) => own.has(r)).length;
          return { mode, art, leader: board[0] ?? null, rank, points, games, playedReveals };
        }),
      );
      if (!cancelled) setCards(built);
    })().catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, [modes, limit, uid, enabled]);

  if (modes === null || cards === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <span className="spinner" />
      </div>
    );
  }

  if (modes.length === 0) {
    return (
      <p data-testid="games-empty" style={{ color: 'var(--ink-1)', fontSize: 14, textAlign: 'center', margin: 0 }}>
        No games yet — start one from the Leaderboard tab.
      </p>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        data-testid="recent-games"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
      >
      {cards.map(({ mode, art, leader, rank, points, games, playedReveals }) => (
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
          {rank != null && (
            <span
              data-testid="card-standing"
              style={{
                position: 'absolute', top: 8, right: 8,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 8px', borderRadius: 999,
                background: 'rgba(7,6,10,0.7)', border: '1px solid var(--ember)',
                color: 'var(--ember-hot)', fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              }}
            >
              #{rank}
              <span style={{ color: 'var(--ink-1)', fontWeight: 400 }}>
                · {games} {games === 1 ? 'game' : 'games'}
              </span>
            </span>
          )}
          <span
            style={{
              position: 'absolute', left: 12, right: 12, bottom: 10,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <span style={{ color: 'var(--ink-0)', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 18, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
              {mode.name}
            </span>
            {rank != null && (
              <span
                data-testid="card-you"
                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ember-hot)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap' }}
              >
                <ScoreValue score={points} fontSize={11} />
                <span style={{ color: 'var(--ink-1)', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  pts{enabled.length > 0 ? ` · ${playedReveals}/${enabled.length} reveals` : ''}
                </span>
              </span>
            )}
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
      </div>

      {modes.length > limit && (
        <button
          type="button"
          data-testid="games-load-more"
          onClick={() => setLimit(modes.length)}
          style={{
            alignSelf: 'center',
            padding: '10px 22px',
            borderRadius: 10,
            border: '1px solid var(--line-strong)',
            background: 'rgba(20,17,28,0.6)',
            color: 'var(--ink-1)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Load more ({modes.length - limit})
        </button>
      )}
    </motion.div>
  );
}
