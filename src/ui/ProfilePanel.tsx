import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PullToRefresh } from './PullToRefresh';
import { useAuth } from '../auth/useAuth';
import {
  secureWithEmailPassword,
  linkGoogle,
  signInWithPassword,
  signInWithGoogle,
  sendPasswordReset,
  updatePassword,
  signOut,
} from '../auth/actions';
import { clearRecovery, refreshUser, clearAuthError } from '../auth/session';
import { getProfile, upsertDisplayName, checkNameAvailable, updateCountry } from '../profile/client';
import type { Profile } from '../profile/client';
import { fetchPlayerBests, type PlayerBest } from '../profile/stats';
import { ProfileStats } from './ProfileStats';
import { getUserId, ensureUserId } from '../leaderboard/identity';
import { sanitizeName, NAME_MIN, NAME_MAX } from '../leaderboard/validation';
import { COUNTRIES } from '../leaderboard/countries';
import { countryToFlag } from '../leaderboard/flag';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--line-strong)',
  background: 'rgba(20,17,28,0.6)',
  color: 'var(--ink-0)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 14,
  boxSizing: 'border-box',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  background: 'rgba(20,17,28,0.55)',
  border: '1px solid var(--line-strong)',
  borderRadius: 12,
  padding: '12px 14px',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ink-2)',
  letterSpacing: 1,
  textTransform: 'uppercase',
  margin: 0,
};

interface SignInFormProps {
  onSuccess?: () => void;
  warning?: string;
}

function SignInForm({ onSuccess, warning }: SignInFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSignIn() {
    setError('');
    const res = await signInWithPassword(email, password);
    if (!res.ok) { setError(res.error); return; }
    onSuccess?.();
  }

  async function handleGoogle() {
    setError('');
    const res = await signInWithGoogle();
    if (!res.ok) setError(res.error);
  }

  async function handleForgot() {
    setError('');
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    const res = await sendPasswordReset(email);
    if (!res.ok) { setError(res.error); return; }
    setNotice('Check your email for a reset link.');
  }

  return (
    <div style={sectionStyle}>
      {warning && (
        <p data-testid="profile-notice" style={{ color: 'var(--ember-hot)', fontSize: 12, margin: 0 }}>{warning}</p>
      )}
      {notice && (
        <p data-testid="profile-notice" style={{ color: 'var(--ink-1)', fontSize: 12, margin: 0 }}>{notice}</p>
      )}
      {error && (
        <p data-testid="profile-error" style={{ color: 'var(--ember-hot)', fontSize: 12, margin: 0 }}>{error}</p>
      )}
      <input data-testid="signin-email" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
      <input data-testid="signin-password" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
      <button className="ember-btn" data-testid="signin-submit" onClick={handleSignIn}>Sign in</button>
      <button className="ghost-btn" data-testid="signin-google" onClick={handleGoogle}>Sign in with Google</button>
      <button className="ghost-btn" data-testid="forgot-password" style={{ fontSize: 12, color: 'var(--ink-2)' }} onClick={handleForgot}>
        Forgot password?
      </button>
    </div>
  );
}

export function ProfilePanel({ onNameSaved, ensureSession, promptName }: { onNameSaved?: () => void; ensureSession?: boolean; promptName?: boolean } = {}) {
  const { user, status, recovery, authError } = useAuth();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bests, setBests] = useState<PlayerBest[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryPw, setRecoveryPw] = useState('');
  const [secureEmail, setSecureEmail] = useState('');
  const [securePassword, setSecurePassword] = useState('');
  const [showSignIn, setShowSignIn] = useState(false);
  const [shared, setShared] = useState(false);

  // The secure-account button only appears once both fields have content.
  const secureReady = secureEmail.trim().length > 0 && securePassword.length > 0;

  // An email that's been submitted but not yet confirmed: either a pending
  // change (new_email) or a first email on a still-anonymous account (email
  // set, not yet confirmed). Derived from the user object, so it survives a
  // reload. A confirmed permanent user has neither and is not pending.
  const pendingEmail =
    user?.new_email ||
    (status === 'anonymous' && user?.email && !user?.email_confirmed_at ? user.email : null);

  // While a confirmation is outstanding, re-poll the server so the panel flips
  // to "confirmed" the moment the user clicks the link on another tab/device.
  useEffect(() => {
    if (!pendingEmail) return;
    const id = setInterval(() => void refreshUser(), 5000);
    return () => clearInterval(id);
  }, [pendingEmail]);

  // Load (and pull-to-refresh) the player's profile + personal bests. When opened
  // for account creation (game-over LOGIN), ensure an anonymous session exists so
  // a brand-new player can actually save a name.
  const load = useCallback(async () => {
    const id = await (ensureSession ? ensureUserId() : getUserId()).catch(() => null);
    setUid(id);
    if (!id) return;
    const p = await getProfile(id).catch(() => null);
    if (p) { setProfile(p); setNameInput(p.displayName ?? ''); }
    const b = await fetchPlayerBests(id).catch(() => null);
    if (b) setBests(b);
  }, [ensureSession]);

  useEffect(() => { void load(); }, [load, status]);

  function clearMessages() {
    setError('');
    setNotice('');
    clearAuthError();
  }

  // The success banner is a transient confirmation — clear it after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  async function shareApp() {
    const url = `${location.origin}${import.meta.env.BASE_URL}`;
    const text = `Play GuessTheCard — guess the Magic: The Gathering card before the clock runs out: ${url}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'GuessTheCard', text }); return; }
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // dismissed or blocked — no-op
    }
  }

  // Shared scrollable container: clears the header, scrims the background for
  // legibility, and shows the panel title + any error/notice at the top.
  function shell(children: React.ReactNode) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        data-testid="profile-panel"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'all',
          background: 'linear-gradient(180deg, rgba(7,6,10,0.86) 0%, rgba(7,6,10,0.96) 30%)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <PullToRefresh
          onRefresh={load}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(76px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom))' }}
        >
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2
            style={{
              margin: 0,
              textAlign: 'center',
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 700,
              fontSize: 26,
              color: 'var(--ink-0)',
            }}
          >
            Profile
          </h2>
          {(error || notice || authError) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(error || authError) && <p data-testid="profile-error" style={{ color: 'var(--ember-hot)', fontSize: 13, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>{error || authError}</p>}
              {notice && (
                <div
                  data-testid="profile-notice"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: 'var(--ember)', color: '#1a1020', fontWeight: 700, fontSize: 15,
                    padding: '12px 16px', borderRadius: 12, textAlign: 'center',
                    boxShadow: '0 6px 18px rgba(255,122,44,0.35)',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {notice}
                </div>
              )}
            </div>
          )}
          {pendingEmail && (
            <div
              data-testid="profile-pending"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: 'rgba(255,122,44,0.10)',
                border: '1px solid var(--ember-deep)',
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ember-hot)', fontWeight: 600 }}>
                Confirm your email to finish
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-1)', lineHeight: 1.5 }}>
                We sent a link to <strong style={{ color: 'var(--ink-0)' }}>{pendingEmail}</strong>. This
                page updates automatically once you click it.
              </p>
            </div>
          )}
          {children}
        </div>
        </PullToRefresh>
      </motion.div>
    );
  }

  function shareButton() {
    return (
      <button
        className="ember-btn"
        data-testid="profile-share"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}
        onClick={() => void shareApp()}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
        </svg>
        {shared ? 'Link copied' : 'Share GuessTheCard'}
      </button>
    );
  }

  function nameEditor() {
    // Only show "Save name" once the text differs from the saved name.
    const nameDirty = nameInput.trim().length > 0 && nameInput.trim() !== (profile?.displayName ?? '').trim();
    const needsName = !profile?.displayName;
    return (
      <div style={sectionStyle}>
        <p style={labelStyle}>Display name</p>
        {promptName && needsName && (
          <p data-testid="name-prompt" style={{ margin: '0 0 4px', color: 'var(--ember-hot)', fontSize: 13, lineHeight: 1.45 }}>
            Pick a name to create your account — then you can build your own modes.
          </p>
        )}
        <input
          data-testid="profile-name-input"
          type="text"
          placeholder="Your name"
          value={nameInput}
          maxLength={NAME_MAX}
          onChange={e => setNameInput(e.target.value)}
          style={inputStyle}
        />
        {nameDirty && (
          <button className="ember-btn" data-testid="profile-name-save" onClick={handleNameSave}>Save name</button>
        )}
      </div>
    );
  }

  async function handleNameSave() {
    clearMessages();
    const clean = sanitizeName(nameInput);
    if (!clean) {
      setError(`Name must be at least ${NAME_MIN} characters`);
      return;
    }
    if (!uid) return;
    if (!(await checkNameAvailable(clean))) {
      setError('That name is already taken — please pick another.');
      return;
    }
    const res = await upsertDisplayName(uid, clean);
    if (!res.ok) {
      setError(res.error === 'name-taken' ? 'That name is already taken — please pick another.' : res.error);
      return;
    }
    setProfile(prev => prev ? { ...prev, displayName: clean } : null);
    setNotice('Name saved.');
    onNameSaved?.();
  }

  // Home country — auto-detected on first game, freely changeable here. Only
  // shown once a profile exists (i.e. the player has posted at least once).
  function countryEditor() {
    if (!profile) return null;
    return (
      <div style={sectionStyle}>
        <p style={labelStyle}>Home country</p>
        <select
          data-testid="profile-country"
          value={profile.country ?? ''}
          onChange={e => void handleCountryChange(e.target.value)}
          style={{ ...inputStyle, appearance: 'auto' }}
        >
          <option value="" disabled>Select your country</option>
          {COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>{countryToFlag(c.code)} {c.name}</option>
          ))}
        </select>
      </div>
    );
  }

  async function handleCountryChange(code: string) {
    clearMessages();
    if (!uid || !code) return;
    const res = await updateCountry(uid, code);
    if (!res.ok) { setError(res.error); return; }
    setProfile(prev => prev ? { ...prev, country: code } : prev);
    setNotice('Home country saved.');
  }

  // ── 1. Recovery mode ─────────────────────────────────────────────────────────
  if (recovery) {
    async function handleRecovery() {
      clearMessages();
      const res = await updatePassword(recoveryPw);
      if (!res.ok) { setError(res.error); return; }
      clearRecovery();
      setNotice('Password updated.');
    }
    return shell(
      <div style={sectionStyle}>
        <p style={labelStyle}>Set new password</p>
        <input
          data-testid="recovery-password"
          type="password"
          placeholder="New password"
          value={recoveryPw}
          onChange={e => setRecoveryPw(e.target.value)}
          style={inputStyle}
        />
        <button className="ember-btn" data-testid="recovery-submit" onClick={handleRecovery}>Update password</button>
      </div>,
    );
  }

  // ── 2. Signed out ────────────────────────────────────────────────────────────
  if (status === 'signed-out') {
    return shell(
      <>
        <p style={{ ...labelStyle, textAlign: 'center' }}>Sign in to your account</p>
        <SignInForm />
        {shareButton()}
      </>,
    );
  }

  // ── 3. Anonymous ─────────────────────────────────────────────────────────────
  if (status === 'anonymous') {
    async function handleSecure() {
      clearMessages();
      const res = await secureWithEmailPassword(secureEmail, securePassword);
      if (!res.ok) { setError(res.error); return; }
      setNotice('Check your email to confirm.');
    }
    async function handleLinkGoogle() {
      clearMessages();
      const res = await linkGoogle();
      if (!res.ok) setError(res.error);
    }
    // Until the player has claimed a name, keep the profile minimal — only the
    // name field and a Login option. Securing the account / country / stats only
    // make sense once an account (name) exists, so they appear after naming.
    const hasName = !!profile?.displayName;
    return shell(
      <>
        {nameEditor()}
        {hasName && countryEditor()}
        {hasName && (
          <div style={sectionStyle}>
            <p style={labelStyle}>Secure your account</p>
            <input data-testid="secure-email" type="email" placeholder="Email" value={secureEmail} onChange={e => setSecureEmail(e.target.value)} style={inputStyle} />
            <input data-testid="secure-password" type="password" placeholder="Password" value={securePassword} onChange={e => setSecurePassword(e.target.value)} style={inputStyle} />
            {secureReady && (
              <button className="ember-btn" data-testid="secure-submit" onClick={handleSecure}>Save email &amp; password</button>
            )}
            <button className="ghost-btn" data-testid="link-google" onClick={handleLinkGoogle}>Link Google account</button>
          </div>
        )}
        {hasName && <ProfileStats profile={profile} bests={bests} />}
        <div style={sectionStyle}>
          <button className="ghost-btn" data-testid="login-toggle" style={{ fontSize: 12 }} onClick={() => { clearMessages(); setShowSignIn(s => !s); }}>
            {showSignIn ? 'Cancel' : 'Login'}
          </button>
          {showSignIn && <SignInForm warning="Signing into another account abandons this device's unsaved scores." />}
        </div>
        {shareButton()}
      </>,
    );
  }

  // ── 4. Permanent ─────────────────────────────────────────────────────────────
  const googleLinked = user?.identities?.some(i => i.provider === 'google') ?? false;
  const hasEmail = !!user?.email;

  async function handleSignOut() {
    clearMessages();
    const res = await signOut();
    if (!res.ok) setError(res.error);
  }
  async function handleLinkGooglePerm() {
    clearMessages();
    const res = await linkGoogle();
    if (!res.ok) setError(res.error);
  }
  async function handleSecurePerm() {
    clearMessages();
    const res = await secureWithEmailPassword(secureEmail, securePassword);
    if (!res.ok) { setError(res.error); return; }
    setNotice('Check your email to confirm.');
  }

  return shell(
    <>
      {nameEditor()}
      {countryEditor()}
      <div style={sectionStyle}>
        <p style={labelStyle}>Linked accounts</p>
        {hasEmail && (
          <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>
            Email: <strong style={{ color: 'var(--ink-0)' }}>{user!.email}</strong>
          </span>
        )}
        {!hasEmail && (
          <>
            <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0 }}>Add an email and password to secure your account.</p>
            <input data-testid="secure-email" type="email" placeholder="Email" value={secureEmail} onChange={e => setSecureEmail(e.target.value)} style={inputStyle} />
            <input data-testid="secure-password" type="password" placeholder="Password" value={securePassword} onChange={e => setSecurePassword(e.target.value)} style={inputStyle} />
            {secureReady && (
              <button className="ember-btn" data-testid="secure-submit" onClick={handleSecurePerm}>Save email &amp; password</button>
            )}
          </>
        )}
        {googleLinked ? (
          <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>Google: connected</span>
        ) : (
          <button className="ghost-btn" data-testid="link-google" onClick={handleLinkGooglePerm}>Connect Google</button>
        )}
      </div>
      <ProfileStats profile={profile} bests={bests} />
      <button className="ghost-btn" data-testid="sign-out" onClick={handleSignOut}>Sign out</button>
      {shareButton()}
    </>,
  );
}
