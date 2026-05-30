import { useState } from 'react';

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

export function StartShare() {
  const [copied, setCopied] = useState(false);

  async function shareApp() {
    const url = `${location.origin}${import.meta.env.BASE_URL}`;
    const text = `Play Arcane Drift — guess the Magic: The Gathering card before the clock runs out: ${url}`;
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
        onClick={() => void shareApp()}
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
    </div>
  );
}
