import { useState } from 'react';
import { useGameStore } from '../state/gameStore';
import { shareUrl } from '../share/score';

const ICON_BTN: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  border: '1px solid var(--line-strong)',
  background: 'rgba(20,17,28,0.6)',
  color: 'var(--ink-0)',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};

const MENU_ITEM: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  background: 'transparent',
  border: 'none',
  color: 'var(--ink-0)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  cursor: 'pointer',
};

export function StartShare() {
  const highscores = useGameStore((s) => s.highscores);
  const best = highscores[0] ?? null;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function share(text: string) {
    setOpen(false);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Arcane Drift', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // User dismissed the share sheet, or clipboard was blocked — no-op.
    }
  }

  function shareWithScore() {
    if (!best) return;
    const url = shareUrl({ score: best.score, correct: best.correct, pool: best.pool });
    void share(`My best in Arcane Drift: ${best.score} points (${best.correct} cards) — beat me: ${url}`);
  }

  function shareAppOnly() {
    const url = `${location.origin}${import.meta.env.BASE_URL}`;
    void share(`Play Arcane Drift — guess the Magic: The Gathering card before the clock runs out: ${url}`);
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(10px + env(safe-area-inset-top))',
        right: 18,
        zIndex: 4,
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        aria-label="Share"
        data-testid="start-share"
        style={ICON_BTN}
        onClick={() => (best ? setOpen((v) => !v) : shareAppOnly())}
      >
        {copied ? (
          <span style={{ fontSize: 9, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>
            Copied
          </span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: -1 }}
            aria-hidden
          />
          <div
            data-testid="start-share-menu"
            style={{
              position: 'absolute',
              top: 46,
              right: 0,
              minWidth: 196,
              borderRadius: 10,
              border: '1px solid var(--line-strong)',
              background: 'rgba(16,13,22,0.96)',
              backdropFilter: 'blur(8px)',
              overflow: 'hidden',
              boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
            }}
          >
            {best && (
              <button type="button" style={MENU_ITEM} onClick={shareWithScore}>
                Share with best score
                <span style={{ display: 'block', color: 'var(--ink-2)', fontSize: 10, marginTop: 2 }}>
                  {best.score} pts · {best.correct} cards
                </span>
              </button>
            )}
            <button
              type="button"
              style={{ ...MENU_ITEM, borderTop: '1px solid var(--line)' }}
              onClick={shareAppOnly}
            >
              Share app link only
            </button>
          </div>
        </>
      )}
    </div>
  );
}
