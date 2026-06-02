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

/** Top-right back affordance. `right` lets it shift left of the account icon. */
export function BackButton({ onBack, right = 12 }: { onBack: () => void; right?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(10px + env(safe-area-inset-top))',
        right,
        zIndex: 4,
        pointerEvents: 'auto',
      }}
    >
      <button type="button" aria-label="Back" data-testid="nav-back" style={ICON_BTN} onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    </div>
  );
}
