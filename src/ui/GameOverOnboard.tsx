import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { sanitizeName, NAME_MIN, NAME_MAX } from '../leaderboard/validation';
import { checkNameAvailable } from '../profile/client';

/**
 * First-run game-over overlay: a player without a name yet picks one (with a live
 * availability check) and sees the rank they'd land at. Email is explicitly
 * optional — only for syncing to another device. Name entry + posting are driven
 * by the parent (GameOverLeaderboard) so there is a single posting path.
 */
export function GameOverOnboard({
  name,
  onNameChange,
  projected,
  nameTaken,
  sending,
  error,
  onSave,
  onSaveAndSync,
  onClose,
}: {
  name: string;
  onNameChange: (v: string) => void;
  projected: { rank: number; total: number } | null;
  nameTaken: boolean;
  sending: boolean;
  error?: boolean;
  onSave: () => void;
  onSaveAndSync: () => void;
  onClose: () => void;
}) {
  const clean = sanitizeName(name);
  const [available, setAvailable] = useState<boolean | null>(null);

  // Debounced availability check as the player types. The server-side unique
  // constraint is the real guarantee; this is just instant feedback.
  useEffect(() => {
    setAvailable(null);
    if (!clean) return;
    let cancelled = false;
    const id = setTimeout(() => {
      checkNameAvailable(clean)
        .then((ok) => !cancelled && setAvailable(ok))
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [clean]);

  const taken = nameTaken || available === false;
  const canSave = !!clean && !sending && !taken;

  const field: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${taken ? 'var(--ember-hot)' : 'var(--line-strong)'}`,
    background: 'rgba(20,17,28,0.6)',
    color: 'var(--ink-0)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 16,
    boxSizing: 'border-box',
  };

  return (
    <motion.div
      data-testid="onboard-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(20px + env(safe-area-inset-top)) 18px calc(20px + env(safe-area-inset-bottom))',
        background: 'rgba(5,4,8,0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: 'rgba(13,11,19,0.92)',
          border: '1px solid var(--line-strong)',
          borderRadius: 16,
          padding: '24px 20px',
        }}
      >
        <h2 style={{ margin: 0, textAlign: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 24, color: 'var(--ink-0)' }}>
          Save your score
        </h2>

        {projected && (
          <p data-testid="onboard-projected" style={{ margin: 0, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: 'var(--ink-2)' }}>
            With this run you'd be ranked{' '}
            <span style={{ color: 'var(--ember-hot)' }}>#{projected.rank}</span> of {projected.total + 1}.
          </p>
        )}

        <p style={{ margin: 0, textAlign: 'center', color: 'var(--ink-1)', fontSize: 15, lineHeight: 1.55 }}>
          Pick a name to claim your spot on the leaderboard. It's your identity across
          every mode.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            data-testid="onboard-name"
            type="text"
            placeholder="Your name"
            value={name}
            maxLength={NAME_MAX}
            autoFocus
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave(); }}
            style={field}
          />
          {taken ? (
            <span data-testid="onboard-taken" style={{ fontSize: 14, color: 'var(--ember-hot)' }}>
              That name is taken — please choose another.
            </span>
          ) : available === true ? (
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>✓ available</span>
          ) : clean ? (
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>checking…</span>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>At least {NAME_MIN} characters.</span>
          )}
        </div>

        <button
          className="ember-btn"
          data-testid="onboard-save"
          disabled={!canSave}
          style={{ width: '100%', padding: '14px 0', fontSize: 17, opacity: canSave ? 1 : 0.5 }}
          onClick={onSave}
        >
          {sending ? 'Saving…' : 'Save & post'}
        </button>

        {error && !taken && (
          <p data-testid="onboard-error" style={{ margin: 0, textAlign: 'center', color: 'var(--ember-hot)', fontSize: 14 }}>
            Couldn't save — please try again.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
          <p style={{ margin: '8px 0 0', textAlign: 'center', color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.55 }}>
            No email needed to play. Add one only if you want to sync this account to
            another device.
          </p>
          <button
            className="ghost-btn"
            data-testid="onboard-sync"
            disabled={!canSave}
            style={{ fontSize: 14, opacity: canSave ? 1 : 0.5 }}
            onClick={onSaveAndSync}
          >
            Save &amp; add email to sync
          </button>
        </div>

        <button
          className="ghost-btn"
          data-testid="onboard-close"
          style={{ fontSize: 14, color: 'var(--ink-2)' }}
          onClick={onClose}
        >
          Not now — back to leaderboard
        </button>
      </div>
    </motion.div>
  );
}
