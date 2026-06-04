import { useState } from 'react';
import { motion } from 'framer-motion';
import { ensureUserId } from '../leaderboard/identity';
import { checkNameAvailable, upsertDisplayName } from '../profile/client';
import { bumpProfile } from '../profile/refresh';
import { refreshUser } from '../auth/session';
import { sanitizeName, NAME_MIN, NAME_MAX } from '../leaderboard/validation';
import { SignInForm } from './ProfilePanel';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--line-strong)',
  background: 'rgba(20,17,28,0.6)',
  color: 'var(--ink-0)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 14,
  boxSizing: 'border-box',
};

/**
 * Game-over bottom sheet that lets an unnamed player claim a display name so
 * their just-finished run posts to the leaderboard. A returning player can
 * fall back to signing in. On either success, onSaved fires (the caller posts
 * the pending run and closes the sheet).
 */
export function SaveScoreSheet({
  rank,
  modeName,
  onSaved,
  onClose,
}: {
  rank: number | null;
  modeName?: string;
  /** Posts the pending run under the given (or signed-in) name. Resolves true on
   *  success. */
  onSaved: (name?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  async function handleSave() {
    setError('');
    const clean = sanitizeName(nameInput);
    if (!clean) { setError(`Name must be at least ${NAME_MIN} characters`); return; }
    setBusy(true);
    try {
      const uid = await ensureUserId().catch(() => null);
      if (!uid) { setError('Could not start a session — please try again.'); return; }
      if (!(await checkNameAvailable(clean))) {
        setError('That name is already taken — please pick another.');
        return;
      }
      const res = await upsertDisplayName(uid, clean);
      if (!res.ok) {
        setError(res.error === 'name-taken' ? 'That name is already taken — please pick another.' : res.error);
        return;
      }
      // The name now belongs to this (anonymous) account — tell the rest of the
      // app so the account chip / profile stop showing "Guest".
      bumpProfile();
      void refreshUser();
      // Pass the just-claimed name straight through so the post never races the
      // profile write. Only close once the score actually posted.
      const posted = await onSaved(clean);
      if (!posted) { setError('Could not save your score — please try again.'); return; }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const placed =
    rank != null
      ? `You placed #${rank}${modeName ? ` in ${modeName}` : ''}. Pick a name to lock it in.`
      : 'Pick a name to lock in your score.';

  return (
    <div
      data-testid="save-score-sheet"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(5,4,8,0.78)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 460,
          display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch',
          background: 'rgba(13,11,19,0.98)', border: '1px solid var(--line-strong)',
          borderRadius: '18px 18px 0 0', padding: '14px 20px calc(22px + env(safe-area-inset-bottom))',
          boxShadow: '0 -18px 48px rgba(0,0,0,0.6)',
        }}
      >
        <span aria-hidden style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, background: 'var(--line-strong)' }} />
        <button
          type="button"
          data-testid="save-score-close"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 8,
            border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer',
          }}
        >
          ✕
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ember-hot)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
          <h2 style={{ margin: 0, textAlign: 'center', fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 24, color: 'var(--ink-0)', lineHeight: 1.2 }}>
            Save your score &amp; claim your spot
          </h2>
          <p data-testid="save-score-placed" style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.5 }}>
            {placed}
          </p>
        </div>

        {error && (
          <p data-testid="save-score-error" style={{ color: 'var(--ember-hot)', fontSize: 14, fontWeight: 600, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>{error}</p>
        )}

        {!showSignIn && (
          <>
            <input
              data-testid="save-score-name"
              type="text"
              placeholder="Your display name"
              value={nameInput}
              maxLength={NAME_MAX}
              autoFocus
              onChange={e => setNameInput(e.target.value)}
              style={inputStyle}
            />
            <button className="ember-btn" data-testid="save-score-submit" disabled={busy} onClick={() => void handleSave()} style={{ padding: '13px 0', fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Saving…' : 'Save my score & claim spot'}
            </button>
            <p style={{ margin: 0, textAlign: 'center', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              No email or password needed.<br />Add one later to play across devices.
            </p>
          </>
        )}

        <button
          className="ghost-btn"
          data-testid="save-score-signin-toggle"
          style={{ fontSize: 12, color: 'var(--ink-2)' }}
          onClick={() => { setError(''); setShowSignIn(s => !s); }}
        >
          {showSignIn ? 'Back to claiming a name' : 'Played before? Sign in'}
        </button>
        {showSignIn && <SignInForm onSuccess={() => { void (async () => { const ok = await onSaved(); if (ok) onClose(); })(); }} />}
      </motion.div>
    </div>
  );
}
