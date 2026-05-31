import { useEffect, useState } from 'react';
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
import { clearRecovery } from '../auth/session';
import { getProfile, upsertDisplayName } from '../profile/client';
import type { Profile } from '../profile/client';
import { fetchPlayerBests, type PlayerBest } from '../profile/stats';
import { ProfileStats } from './ProfileStats';
import { getUserId } from '../leaderboard/identity';
import { sanitizeName, NAME_MIN, NAME_MAX } from '../leaderboard/validation';

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
        <p data-testid="profile-notice" style={{ color: 'var(--ember-hot)', fontSize: 12, margin: 0 }}>
          {warning}
        </p>
      )}
      {notice && (
        <p data-testid="profile-notice" style={{ color: 'var(--ink-1)', fontSize: 12, margin: 0 }}>
          {notice}
        </p>
      )}
      {error && (
        <p data-testid="profile-error" style={{ color: 'var(--ember-hot)', fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}
      <input
        data-testid="signin-email"
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={inputStyle}
      />
      <input
        data-testid="signin-password"
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={inputStyle}
      />
      <button className="ember-btn" data-testid="signin-submit" onClick={handleSignIn}>
        Sign in
      </button>
      <button className="ghost-btn" data-testid="signin-google" onClick={handleGoogle}>
        Sign in with Google
      </button>
      <button
        className="ghost-btn"
        data-testid="forgot-password"
        style={{ fontSize: 12, color: 'var(--ink-2)' }}
        onClick={handleForgot}
      >
        Forgot password?
      </button>
    </div>
  );
}

export function ProfilePanel() {
  const { user, status, recovery } = useAuth();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bests, setBests] = useState<PlayerBest[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Recovery form state
  const [recoveryPw, setRecoveryPw] = useState('');

  // Secure account form state
  const [secureEmail, setSecureEmail] = useState('');
  const [securePassword, setSecurePassword] = useState('');

  // Show sign-in toggle for anonymous users
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    getUserId().then(id => {
      setUid(id);
      if (id) {
        getProfile(id).then(p => {
          if (p) {
            setProfile(p);
            setNameInput(p.displayName ?? '');
          }
        }).catch(() => {});
        fetchPlayerBests(id).then(setBests).catch(() => {});
      }
    }).catch(() => {});
  }, [status]);

  function clearMessages() {
    setError('');
    setNotice('');
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

    return (
      <div
        data-testid="profile-panel"
        style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}
      >
        <p style={labelStyle}>Set new password</p>
        {error && (
          <p data-testid="profile-error" style={{ color: 'var(--ember-hot)', fontSize: 12, margin: 0 }}>
            {error}
          </p>
        )}
        {notice && (
          <p data-testid="profile-notice" style={{ color: 'var(--ink-1)', fontSize: 12, margin: 0 }}>
            {notice}
          </p>
        )}
        <input
          data-testid="recovery-password"
          type="password"
          placeholder="New password"
          value={recoveryPw}
          onChange={e => setRecoveryPw(e.target.value)}
          style={inputStyle}
        />
        <button className="ember-btn" data-testid="recovery-submit" onClick={handleRecovery}>
          Update password
        </button>
      </div>
    );
  }

  // ── 2. Signed out ────────────────────────────────────────────────────────────
  if (status === 'signed-out') {
    return (
      <div
        data-testid="profile-panel"
        style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}
      >
        <SignInForm />
      </div>
    );
  }

  // ── Name save handler (shared by anonymous + permanent) ──────────────────────
  async function handleNameSave() {
    clearMessages();
    const clean = sanitizeName(nameInput);
    if (!clean) {
      setError(`Name must be at least ${NAME_MIN} characters`);
      return;
    }
    if (!uid) return;
    const res = await upsertDisplayName(uid, clean);
    if (!res.ok) { setError(res.error); return; }
    setProfile(prev => prev ? { ...prev, displayName: clean } : null);
    setNotice('Name saved.');
  }

  function nameEditor() {
    return (
      <div style={sectionStyle}>
        <p style={labelStyle}>Display name</p>
        <input
          data-testid="profile-name-input"
          type="text"
          placeholder="Your name"
          value={nameInput}
          maxLength={NAME_MAX}
          onChange={e => setNameInput(e.target.value)}
          style={inputStyle}
        />
        <button className="ember-btn" data-testid="profile-name-save" onClick={handleNameSave}>
          Save name
        </button>
      </div>
    );
  }

  const statsBlock = () => <ProfileStats profile={profile} bests={bests} />;

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

    return (
      <div
        data-testid="profile-panel"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}
      >
        {error && (
          <p data-testid="profile-error" style={{ color: 'var(--ember-hot)', fontSize: 12, margin: 0 }}>
            {error}
          </p>
        )}
        {notice && (
          <p data-testid="profile-notice" style={{ color: 'var(--ink-1)', fontSize: 12, margin: 0 }}>
            {notice}
          </p>
        )}

        {nameEditor()}

        <div style={sectionStyle}>
          <p style={{ ...labelStyle, margin: 0 }}>Secure your account</p>
          <input
            data-testid="secure-email"
            type="email"
            placeholder="Email"
            value={secureEmail}
            onChange={e => setSecureEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            data-testid="secure-password"
            type="password"
            placeholder="Password"
            value={securePassword}
            onChange={e => setSecurePassword(e.target.value)}
            style={inputStyle}
          />
          <button className="ember-btn" data-testid="secure-submit" onClick={handleSecure}>
            Save email &amp; password
          </button>
          <button className="ghost-btn" data-testid="link-google" onClick={handleLinkGoogle}>
            Link Google account
          </button>
        </div>

        {statsBlock()}

        <div style={sectionStyle}>
          <button
            className="ghost-btn"
            style={{ fontSize: 12 }}
            onClick={() => { clearMessages(); setShowSignIn(s => !s); }}
          >
            {showSignIn ? 'Cancel' : 'Sign in to another account'}
          </button>
          {showSignIn && (
            <SignInForm
              warning="Signing into another account abandons this device's unsaved scores."
            />
          )}
        </div>
      </div>
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

  return (
    <div
      data-testid="profile-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}
    >
      {error && (
        <p data-testid="profile-error" style={{ color: 'var(--ember-hot)', fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}
      {notice && (
        <p data-testid="profile-notice" style={{ color: 'var(--ink-1)', fontSize: 12, margin: 0 }}>
          {notice}
        </p>
      )}

      {nameEditor()}

      <div style={sectionStyle}>
        <p style={labelStyle}>Linked accounts</p>
        {hasEmail && (
          <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>
            Email: <strong style={{ color: 'var(--ink-0)' }}>{user!.email}</strong>
          </span>
        )}
        {!hasEmail && (
          <>
            <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0 }}>
              Add an email and password to secure your account.
            </p>
            <input
              data-testid="secure-email"
              type="email"
              placeholder="Email"
              value={secureEmail}
              onChange={e => setSecureEmail(e.target.value)}
              style={inputStyle}
            />
            <input
              data-testid="secure-password"
              type="password"
              placeholder="Password"
              value={securePassword}
              onChange={e => setSecurePassword(e.target.value)}
              style={inputStyle}
            />
            <button className="ember-btn" data-testid="secure-submit" onClick={handleSecurePerm}>
              Save email &amp; password
            </button>
          </>
        )}
        {googleLinked ? (
          <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>Google: connected</span>
        ) : (
          <button className="ghost-btn" data-testid="link-google" onClick={handleLinkGooglePerm}>
            Connect Google
          </button>
        )}
      </div>

      {statsBlock()}

      <button className="ghost-btn" data-testid="sign-out" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
