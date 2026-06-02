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

export function SignInForm({ onSuccess, warning }: SignInFormProps) {
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

  const dividerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    color: 'var(--ink-2)', fontSize: 11, letterSpacing: 0.5, margin: '2px 0',
  };
  const lineStyle: React.CSSProperties = { flex: 1, height: 1, background: 'var(--line-strong)' };

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h3 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 22, color: 'var(--ink-0)' }}>
          Welcome back
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', textAlign: 'center', lineHeight: 1.4 }}>
          Sign in to pick up your name and scores here.
        </p>
      </div>
      {warning && (
        <p data-testid="profile-notice" style={{ color: 'var(--ember-hot)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{warning}</p>
      )}
      {notice && (
        <p data-testid="profile-notice" style={{ color: 'var(--ink-1)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{notice}</p>
      )}
      {error && (
        <p data-testid="profile-error" style={{ color: 'var(--ember-hot)', fontSize: 15, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>{error}</p>
      )}
      <button className="ghost-btn" data-testid="signin-google" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={handleGoogle}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
          <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z" />
        </svg>
        Continue with Google
      </button>
      <div style={dividerStyle}>
        <span style={lineStyle} /> or with email <span style={lineStyle} />
      </div>
      <p style={labelStyle}>Email</p>
      <input data-testid="signin-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
      <p style={labelStyle}>Password</p>
      <input data-testid="signin-password" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
      <button className="ember-btn" data-testid="signin-submit" onClick={handleSignIn}>Sign in</button>
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
  const [authTab, setAuthTab] = useState<'create' | 'login'>('create');
  // After "Create account" succeeds we pop a modal offering an optional email /
  // Google link. createdName is shown there; linkEmailOpen reveals the fields.
  const [linkPrompt, setLinkPrompt] = useState(false);
  const [linkEmailOpen, setLinkEmailOpen] = useState(false);
  const [createdName, setCreatedName] = useState('');
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
              {(error || authError) && <p data-testid="profile-error" style={{ color: 'var(--ember-hot)', fontSize: 16, fontWeight: 600, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>{error || authError}</p>}
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
        {linkPrompt && linkAccountModal()}
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

  // Register a brand-new player: claim a name (creating the anonymous session if
  // there isn't one yet). Securing with an email / Google happens afterwards in
  // an optional modal, so the form itself stays a single field.
  async function handleCreateAccount() {
    clearMessages();
    const clean = sanitizeName(nameInput);
    if (!clean) { setError(`Name must be at least ${NAME_MIN} characters`); return; }
    const id = await ensureUserId().catch(() => null);
    if (!id) { setError('Could not start a session — please try again.'); return; }
    if (!(await checkNameAvailable(clean))) { setError('That name is already taken — please pick another.'); return; }
    const res = await upsertDisplayName(id, clean);
    if (!res.ok) {
      setError(res.error === 'name-taken' ? 'That name is already taken — please pick another.' : res.error);
      return;
    }
    setUid(id);
    setProfile(prev => (prev ? { ...prev, displayName: clean } : prev));
    setCreatedName(clean);
    setLinkEmailOpen(false);
    setLinkPrompt(true);
    onNameSaved?.();
    void load();
  }

  // Optional account-linking from the post-create modal.
  async function handleModalLinkEmail() {
    clearMessages();
    const res = await secureWithEmailPassword(secureEmail, securePassword);
    if (!res.ok) { setError(res.error); return; }
    setNotice('Check your email to confirm.');
    setLinkPrompt(false);
  }
  async function handleModalLinkGoogle() {
    clearMessages();
    const res = await linkGoogle();
    if (!res.ok) setError(res.error); // success redirects away
  }

  // Post-create modal: confirms the account and offers an optional email / Google
  // link. Skipping is a first-class choice — the account already exists.
  function linkAccountModal() {
    return (
      <div
        data-testid="link-account-modal"
        onClick={() => setLinkPrompt(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 18, background: 'rgba(5,4,8,0.82)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12,
            background: 'rgba(13,11,19,0.98)', border: '1px solid var(--line-strong)', borderRadius: 16, padding: '22px 20px',
            boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <h3 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 24, color: 'var(--ink-0)', textAlign: 'center', lineHeight: 1.2 }}>
              You're in{createdName ? `, ${createdName}` : ''}!
            </h3>
            <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-1)', textAlign: 'center', lineHeight: 1.5 }}>
              Link an email or Google to play on other devices.
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', textAlign: 'center' }}>
              Optional — you can always do this later.
            </p>
          </div>
          {error && <p data-testid="link-error" style={{ color: 'var(--ember-hot)', fontSize: 15, fontWeight: 600, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>{error}</p>}
          {linkEmailOpen ? (
            <>
              <input data-testid="secure-email" type="email" placeholder="you@example.com" value={secureEmail} onChange={e => setSecureEmail(e.target.value)} style={inputStyle} />
              <input data-testid="secure-password" type="password" placeholder="Password" value={securePassword} onChange={e => setSecurePassword(e.target.value)} style={inputStyle} />
              {secureReady && (
                <button className="ember-btn" data-testid="secure-submit" onClick={handleModalLinkEmail}>Save email &amp; password</button>
              )}
            </>
          ) : (
            <button className="ember-btn" data-testid="link-email-open" onClick={() => setLinkEmailOpen(true)}>Link an email</button>
          )}
          <button className="ghost-btn" data-testid="link-google" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={handleModalLinkGoogle}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z" />
            </svg>
            Continue with Google
          </button>
          <button className="ghost-btn" data-testid="link-skip" style={{ fontSize: 13, color: 'var(--ink-2)' }} onClick={() => setLinkPrompt(false)}>
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  // Tabbed entry point for players without a claimed name (signed-out or a fresh
  // guest): "Create account" (name + optional email/password/Google) vs "Login".
  function namelessAuth() {
    const tabButton = (key: 'create' | 'login', label: string) => (
      <button
        type="button"
        data-testid={`auth-tab-${key}`}
        aria-pressed={authTab === key}
        onClick={() => { clearMessages(); setAuthTab(key); }}
        style={{
          flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
          border: `1px solid ${authTab === key ? 'var(--ember)' : 'var(--line-strong)'}`,
          background: authTab === key ? 'var(--ember)' : 'transparent',
          color: authTab === key ? '#1a1020' : 'var(--ink-1)',
        }}
      >
        {label}
      </button>
    );
    return (
      <>
        <div style={{ display: 'flex', gap: 8 }}>
          {tabButton('create', 'Create account')}
          {tabButton('login', 'Login')}
        </div>
        {authTab === 'create' ? (
          <div style={sectionStyle}>
            {promptName && (
              <p data-testid="name-prompt" style={{ margin: 0, color: 'var(--ember-hot)', fontSize: 14, lineHeight: 1.45 }}>
                Pick a name to create your account — then you can build your own modes.
              </p>
            )}
            <p style={labelStyle}>Display name</p>
            <input data-testid="profile-name-input" type="text" placeholder="Your display name" value={nameInput} maxLength={NAME_MAX} onChange={e => setNameInput(e.target.value)} style={inputStyle} />
            <button className="ember-btn" data-testid="create-account" onClick={handleCreateAccount}>Create account</button>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', textAlign: 'center', lineHeight: 1.5 }}>
              No email or password needed — you can link one next (optional).
            </p>
          </div>
        ) : (
          <SignInForm onSuccess={onNameSaved} />
        )}
        {shareButton()}
      </>
    );
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
    return shell(namelessAuth());
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
    // Until the player has claimed a name, show the Create-account / Login tabs.
    // Securing the account / country / stats only make sense once a name exists.
    const hasName = !!profile?.displayName;
    if (!hasName) {
      return shell(namelessAuth());
    }
    return shell(
      <>
        {nameEditor()}
        {countryEditor()}
        <div style={sectionStyle}>
          <p style={labelStyle}>Secure your account</p>
          <input data-testid="secure-email" type="email" placeholder="Email" value={secureEmail} onChange={e => setSecureEmail(e.target.value)} style={inputStyle} />
          <input data-testid="secure-password" type="password" placeholder="Password" value={securePassword} onChange={e => setSecurePassword(e.target.value)} style={inputStyle} />
          {secureReady && (
            <button className="ember-btn" data-testid="secure-submit" onClick={handleSecure}>Save email &amp; password</button>
          )}
          <button className="ghost-btn" data-testid="link-google" onClick={handleLinkGoogle}>Link Google account</button>
        </div>
        <ProfileStats profile={profile} bests={bests} />
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
