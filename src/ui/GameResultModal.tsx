import { ScoreValue } from './ScoreValue';

/**
 * Small game-over popup shown over the mode just played: the score reached and
 * the rank it takes, with Replay / Share / Close actions.
 */
export function GameResultModal({
  score,
  rank,
  modeName,
  needsSave = false,
  onSaveRank,
  onReplay,
  onShare,
  onClose,
}: {
  score: number;
  rank: number | null;
  modeName?: string;
  /** Player has no claimed name yet — surface a "save your rank" prompt. */
  needsSave?: boolean;
  onSaveRank?: () => void;
  onReplay: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const btn: React.CSSProperties = {
    width: '100%', padding: '13px 0', borderRadius: 10, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700,
  };
  const outlineBtn: React.CSSProperties = {
    ...btn, background: 'transparent', border: '1px solid var(--line-strong)', color: 'var(--ink-0)',
  };
  // When the player still needs to claim a name, the save prompt becomes the
  // primary action and Replay steps down to a secondary outline button.
  const showSave = needsSave && onSaveRank != null;
  return (
    <div
      data-testid="result-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18, background: 'rgba(5,4,8,0.78)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center',
          background: 'rgba(13,11,19,0.97)', border: '1px solid var(--line-strong)', borderRadius: 16, padding: '22px 20px',
          boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
        }}
      >
        {modeName && (
          <span style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            {modeName}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <ScoreValue score={score} fontSize={34} />
          <span style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>pts</span>
        </div>
        {rank != null && (
          <div data-testid="result-rank" style={{ color: 'var(--ink-1)', fontFamily: "'JetBrains Mono', monospace", fontSize: 15 }}>
            Rank <span style={{ color: 'var(--ember-hot)', fontWeight: 700 }}>#{rank}</span>
          </div>
        )}

        {showSave && (
          <p data-testid="result-save-hint" style={{ color: 'var(--ink-1)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
            You're playing as a guest.{' '}
            {rank != null ? <>Claim a name to keep <span style={{ color: 'var(--ember-hot)', fontWeight: 700 }}>#{rank}</span> on the board.</> : 'Claim a name to save your score.'}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 4 }}>
          {showSave && (
            <button type="button" data-testid="result-save" onClick={onSaveRank} className="ember-btn" style={btn}>
              Save my rank
            </button>
          )}
          <button
            type="button"
            data-testid="result-replay"
            onClick={onReplay}
            className={showSave ? undefined : 'ember-btn'}
            style={showSave ? outlineBtn : btn}
          >
            Replay
          </button>
          <button
            type="button"
            data-testid="result-share"
            onClick={onShare}
            style={outlineBtn}
          >
            Share
          </button>
          <button
            type="button"
            data-testid="result-close"
            onClick={onClose}
            style={{ ...btn, background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
