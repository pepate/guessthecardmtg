import { useEffect, useState } from 'react';

const SAMPLE_ART = `${import.meta.env.BASE_URL}swords.jpg`;

// A scripted, self-contained demo — no real game data needed. The card art
// un-blurs over a few seconds, then the correct option is revealed, mirroring a
// fast correct guess. Plain timers + CSS transitions keep it robust and testable.
const REVEAL_MS = 200;
const ANSWER_MS = 3400;

const OPTIONS = ['Sol Ring', 'Swords to Plowshares', 'Counterspell', 'Lightning Bolt'] as const;
const CORRECT = 'Swords to Plowshares';

export function WelcomeWizard({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    const t0 = setTimeout(() => setRevealed(true), REVEAL_MS);
    const t1 = setTimeout(() => setAnswered(true), ANSWER_MS);
    return () => { clearTimeout(t0); clearTimeout(t1); };
  }, []);

  const caption = 'Name the card before it fully reveals — the faster you are, the more points you score.';

  return (
    <div
      data-testid="welcome-wizard"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        pointerEvents: 'all',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: 'calc(24px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))',
        overflowY: 'auto',
        background: 'linear-gradient(180deg, rgba(7,6,10,0.94) 0%, rgba(7,6,10,0.98) 100%)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 34, color: 'var(--ink-0)' }}>
          Welcome to GuessTheCard
        </h1>
      </div>

      {/* Demo card: blurred art that sharpens, like an in-game reveal. */}
      <div
        aria-hidden
        style={{
          width: 248,
          height: 346,
          borderRadius: 12,
          backgroundImage: `url(${SAMPLE_ART})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: '1px solid var(--line-strong)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          filter: revealed ? 'blur(0px)' : 'blur(18px)',
          transition: `filter ${(ANSWER_MS - REVEAL_MS) / 1000}s ease-out`,
        }}
      />

      <div style={{ width: '100%', maxWidth: 360, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {OPTIONS.map((name) => {
          const isCorrect = name === CORRECT;
          const highlight = answered && isCorrect;
          const dimmed = answered && !isCorrect;
          return (
            <div
              key={name}
              data-testid="welcome-option"
              data-correct={highlight ? 'true' : undefined}
              style={{
                padding: '11px 10px',
                borderRadius: 10,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                border: `1px solid ${highlight ? 'var(--ember)' : 'var(--line-strong)'}`,
                background: highlight ? 'rgba(255,138,60,0.22)' : 'rgba(20,17,28,0.6)',
                color: highlight ? 'var(--ember-hot)' : dimmed ? 'var(--ink-2)' : 'var(--ink-0)',
                opacity: dimmed ? 0.5 : 1,
                transition: 'all 0.4s ease',
              }}
            >
              {name}
            </div>
          );
        })}
      </div>

      <p data-testid="welcome-caption" style={{ margin: 0, minHeight: 20, color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 0.5 }}>
        {caption}
      </p>

      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" className="ember-btn" data-testid="welcome-start" onClick={onStart} style={{ padding: '13px 0', fontSize: 16 }}>
          Start playing
        </button>
        <button type="button" className="ghost-btn" data-testid="welcome-close" onClick={onClose} style={{ fontSize: 13 }}>
          Leaderboard
        </button>
      </div>
    </div>
  );
}
