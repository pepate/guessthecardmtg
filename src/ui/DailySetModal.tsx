import type { GlobalEntry } from '../leaderboard/types';
import type { DailyToday } from '../daily/client';
import { REVEAL_MODE_LABELS } from '../reveal/labels';
import { GlobalScoreList } from './GlobalScoreList';

const DAILY_MAX = 3;

export function DailySetModal({
  daily,
  board,
  onPlay,
  onClose,
}: {
  daily: DailyToday;
  board: GlobalEntry[];
  onPlay: () => void;
  onClose: () => void;
}) {
  const playsLeft = Math.max(0, DAILY_MAX - daily.playsUsed);
  return (
    <div
      data-testid="daily-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))',
        background: 'rgba(5,4,8,0.86)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 12,
          background: 'rgba(13,11,19,0.96)', border: '1px solid var(--line-strong)', borderRadius: 16, padding: '20px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ margin: 0, flex: 1, fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 22, color: 'var(--ember-hot)' }}>
            Daily Set
          </h2>
          <button
            type="button"
            data-testid="daily-close"
            aria-label="Close"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--ink-2)', fontSize: 18, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div style={{ color: 'var(--ink-1)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
          {daily.setName} · {REVEAL_MODE_LABELS[daily.reveal]}
        </div>

        <button
          type="button"
          className="ember-btn"
          data-testid="daily-play"
          disabled={playsLeft === 0}
          onClick={onPlay}
          style={{ width: '100%', padding: '13px 0', fontSize: 17, opacity: playsLeft === 0 ? 0.5 : 1 }}
        >
          {playsLeft === 0 ? 'No plays left today' : 'Play'}
        </button>
        <p data-testid="daily-plays-left" style={{ margin: 0, textAlign: 'center', color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          {playsLeft}/{DAILY_MAX} plays left today
        </p>

        {board.length > 0 ? (
          <GlobalScoreList entries={board} />
        ) : (
          <p style={{ margin: 0, textAlign: 'center', color: 'var(--ink-2)', fontSize: 13 }}>No scores yet — be the first!</p>
        )}
      </div>
    </div>
  );
}
