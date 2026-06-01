import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePanel } from './ProfilePanel';
import * as actions from '../auth/actions';
import * as profileClient from '../profile/client';
import * as session from '../auth/session';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockAuth = {
  user: null as null | { email?: string; identities?: { provider: string }[]; is_anonymous?: boolean },
  isAnonymous: false,
  status: 'signed-out' as 'signed-out' | 'anonymous' | 'permanent',
  recovery: false,
};

vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../auth/actions', () => ({
  secureWithEmailPassword: vi.fn(),
  linkGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  sendPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../auth/session', () => ({
  clearRecovery: vi.fn(),
  clearAuthError: vi.fn(),
  refreshUser: vi.fn(),
}));

const sampleProfile = {
  displayName: 'TestUser',
  gamesPlayed: 10,
  totalCorrect: 80,
  totalCards: 100,
};

vi.mock('../profile/client', () => ({
  getProfile: vi.fn(),
  upsertDisplayName: vi.fn(),
  checkNameAvailable: vi.fn(),
}));

vi.mock('../leaderboard/identity', () => ({
  getUserId: () => Promise.resolve('uid'),
  ensureUserId: () => Promise.resolve('uid'),
}));

// Do NOT mock ../leaderboard/validation — use real implementation.

// ── Helpers ──────────────────────────────────────────────────────────────────

function setAuth(overrides: Partial<typeof mockAuth>) {
  Object.assign(mockAuth, overrides);
}

// Typed shorthand accessors to the mocked modules.
const mockSignInWithPassword = actions.signInWithPassword as ReturnType<typeof vi.fn>;
const mockSignInWithGoogle = actions.signInWithGoogle as ReturnType<typeof vi.fn>;
const mockSendPasswordReset = actions.sendPasswordReset as ReturnType<typeof vi.fn>;
const mockSignOut = actions.signOut as ReturnType<typeof vi.fn>;
const mockUpdatePassword = actions.updatePassword as ReturnType<typeof vi.fn>;
const mockSecureWithEmailPassword = actions.secureWithEmailPassword as ReturnType<typeof vi.fn>;
const mockLinkGoogle = actions.linkGoogle as ReturnType<typeof vi.fn>;
const mockClearRecovery = session.clearRecovery as ReturnType<typeof vi.fn>;
const mockGetProfile = profileClient.getProfile as ReturnType<typeof vi.fn>;
const mockUpsertDisplayName = profileClient.upsertDisplayName as ReturnType<typeof vi.fn>;
const mockCheckNameAvailable = profileClient.checkNameAvailable as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSignInWithPassword.mockResolvedValue({ ok: true });
  mockSignInWithGoogle.mockResolvedValue({ ok: true });
  mockSendPasswordReset.mockResolvedValue({ ok: true });
  mockSignOut.mockResolvedValue({ ok: true });
  mockUpdatePassword.mockResolvedValue({ ok: true });
  mockSecureWithEmailPassword.mockResolvedValue({ ok: true });
  mockLinkGoogle.mockResolvedValue({ ok: true });
  mockGetProfile.mockResolvedValue(sampleProfile);
  mockUpsertDisplayName.mockResolvedValue({ ok: true });
  mockCheckNameAvailable.mockResolvedValue(true);
  // Reset auth to defaults
  Object.assign(mockAuth, {
    user: null,
    isAnonymous: false,
    status: 'signed-out',
    recovery: false,
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProfilePanel — signed-out', () => {
  beforeEach(() => {
    setAuth({ status: 'signed-out', user: null, isAnonymous: false, recovery: false });
  });

  it('renders signin-submit and does NOT render sign-out', () => {
    render(<ProfilePanel />);
    expect(screen.getByTestId('signin-submit')).toBeInTheDocument();
    expect(screen.queryByTestId('sign-out')).not.toBeInTheDocument();
  });

  it('calls signInWithPassword with email + password when submitted', async () => {
    render(<ProfilePanel />);
    fireEvent.change(screen.getByTestId('signin-email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByTestId('signin-password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByTestId('signin-submit'));
    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith('a@b.com', 'secret123');
    });
  });

  it('shows error when signInWithPassword fails', async () => {
    mockSignInWithPassword.mockResolvedValue({ ok: false, error: 'Invalid credentials' });
    render(<ProfilePanel />);
    fireEvent.change(screen.getByTestId('signin-email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByTestId('signin-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('signin-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toHaveTextContent('Invalid credentials');
    });
  });

  it('shows error when forgot-password clicked without email', async () => {
    render(<ProfilePanel />);
    fireEvent.click(screen.getByTestId('forgot-password'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toBeInTheDocument();
    });
    expect(mockSendPasswordReset).not.toHaveBeenCalled();
  });

  it('calls sendPasswordReset and shows notice when email is present', async () => {
    render(<ProfilePanel />);
    fireEvent.change(screen.getByTestId('signin-email'), { target: { value: 'reset@test.com' } });
    fireEvent.click(screen.getByTestId('forgot-password'));
    await waitFor(() => {
      expect(mockSendPasswordReset).toHaveBeenCalledWith('reset@test.com');
    });
    expect(screen.getByTestId('profile-notice')).toHaveTextContent('reset link');
  });
});

describe('ProfilePanel — anonymous', () => {
  beforeEach(() => {
    setAuth({
      status: 'anonymous',
      user: { is_anonymous: true },
      isAnonymous: true,
      recovery: false,
    });
  });

  it('reveals secure-submit only once both email and password are filled', async () => {
    render(<ProfilePanel />);
    // Secure section appears once the profile (with a name) has loaded.
    await screen.findByTestId('secure-email');
    expect(screen.queryByTestId('secure-submit')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('secure-email'), { target: { value: 'me@example.com' } });
    expect(screen.queryByTestId('secure-submit')).not.toBeInTheDocument(); // email only → still hidden
    fireEvent.change(screen.getByTestId('secure-password'), { target: { value: 'pw123456' } });
    expect(screen.getByTestId('secure-submit')).toBeInTheDocument();
  });

  it('reveals profile-name-save only when the name differs from the saved one', async () => {
    render(<ProfilePanel />);
    await waitFor(() => expect(screen.getByTestId<HTMLInputElement>('profile-name-input').value).toBe('TestUser'));
    expect(screen.queryByTestId('profile-name-save')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'Newname' } });
    expect(screen.getByTestId('profile-name-save')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'TestUser' } });
    expect(screen.queryByTestId('profile-name-save')).not.toBeInTheDocument();
  });

  it('renders profile-stats after profile loads', async () => {
    render(<ProfilePanel />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-stats')).toBeInTheDocument();
    });
  });

  it('calls upsertDisplayName with valid name', async () => {
    render(<ProfilePanel />);
    await waitFor(() => screen.getByTestId('profile-name-input'));
    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'Newname' } });
    fireEvent.click(screen.getByTestId('profile-name-save'));
    await waitFor(() => {
      expect(mockUpsertDisplayName).toHaveBeenCalledWith('uid', 'Newname');
    });
  });

  it('shows profile-error and does NOT call upsertDisplayName for too-short name', async () => {
    render(<ProfilePanel />);
    await waitFor(() => screen.getByTestId('profile-name-input'));
    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByTestId('profile-name-save'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toBeInTheDocument();
    });
    expect(mockUpsertDisplayName).not.toHaveBeenCalled();
  });

  it('pre-fills name input from loaded profile', async () => {
    render(<ProfilePanel />);
    await waitFor(() => {
      expect(screen.getByTestId<HTMLInputElement>('profile-name-input').value).toBe('TestUser');
    });
  });

  it('shows notice after successful name save', async () => {
    render(<ProfilePanel />);
    await waitFor(() => screen.getByTestId('profile-name-input'));
    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'ValidName' } });
    fireEvent.click(screen.getByTestId('profile-name-save'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-notice')).toHaveTextContent('Name saved');
    });
  });

  it('calls onNameSaved after saving a name (game-over login flow)', async () => {
    const onNameSaved = vi.fn();
    render(<ProfilePanel onNameSaved={onNameSaved} ensureSession />);
    await waitFor(() => screen.getByTestId('profile-name-input'));
    fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'Newname' } });
    fireEvent.click(screen.getByTestId('profile-name-save'));
    await waitFor(() => expect(onNameSaved).toHaveBeenCalled());
  });

  it('calls secureWithEmailPassword on secure-submit', async () => {
    render(<ProfilePanel />);
    await screen.findByTestId('secure-email');
    fireEvent.change(screen.getByTestId('secure-email'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByTestId('secure-password'), { target: { value: 'mypassword' } });
    fireEvent.click(screen.getByTestId('secure-submit'));
    await waitFor(() => {
      expect(mockSecureWithEmailPassword).toHaveBeenCalledWith('me@example.com', 'mypassword');
    });
  });

  it('shows sign-in warning when the Login toggle is clicked', async () => {
    render(<ProfilePanel />);
    fireEvent.click(screen.getByTestId('login-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-notice')).toHaveTextContent('unsaved scores');
    });
  });
});

describe('ProfilePanel — permanent', () => {
  beforeEach(() => {
    setAuth({
      status: 'permanent',
      user: {
        email: 'user@example.com',
        identities: [{ provider: 'email' }],
        is_anonymous: false,
      },
      isAnonymous: false,
      recovery: false,
    });
  });

  it('renders sign-out button', () => {
    render(<ProfilePanel />);
    expect(screen.getByTestId('sign-out')).toBeInTheDocument();
  });

  it('calls signOut when sign-out is clicked', async () => {
    render(<ProfilePanel />);
    fireEvent.click(screen.getByTestId('sign-out'));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('does NOT render signin-submit', () => {
    render(<ProfilePanel />);
    expect(screen.queryByTestId('signin-submit')).not.toBeInTheDocument();
  });

  it('shows email in linked accounts', () => {
    render(<ProfilePanel />);
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
  });

  it('shows Google connected when google identity present', () => {
    setAuth({
      status: 'permanent',
      user: {
        email: 'user@example.com',
        identities: [{ provider: 'google' }],
        is_anonymous: false,
      },
      isAnonymous: false,
      recovery: false,
    });
    render(<ProfilePanel />);
    expect(screen.getByText(/Google: connected/i)).toBeInTheDocument();
    expect(screen.queryByTestId('link-google')).not.toBeInTheDocument();
  });

  it('offers link-google when Google not linked', () => {
    render(<ProfilePanel />);
    expect(screen.getByTestId('link-google')).toBeInTheDocument();
  });

  it('shows profile-stats after profile loads', async () => {
    render(<ProfilePanel />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-stats')).toBeInTheDocument();
    });
  });
});

describe('ProfilePanel — recovery', () => {
  beforeEach(() => {
    setAuth({
      status: 'permanent',
      user: { email: 'user@example.com', is_anonymous: false },
      isAnonymous: false,
      recovery: true,
    });
  });

  it('renders recovery-submit and NOT signin-submit', () => {
    render(<ProfilePanel />);
    expect(screen.getByTestId('recovery-submit')).toBeInTheDocument();
    expect(screen.queryByTestId('signin-submit')).not.toBeInTheDocument();
  });

  it('calls updatePassword then clearRecovery on submit', async () => {
    render(<ProfilePanel />);
    fireEvent.change(screen.getByTestId('recovery-password'), { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByTestId('recovery-submit'));
    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith('newpassword');
    });
    expect(mockClearRecovery).toHaveBeenCalled();
  });

  it('shows success notice after recovery', async () => {
    render(<ProfilePanel />);
    fireEvent.change(screen.getByTestId('recovery-password'), { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByTestId('recovery-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-notice')).toHaveTextContent('Password updated');
    });
  });

  it('shows error and does NOT call clearRecovery on updatePassword failure', async () => {
    mockUpdatePassword.mockResolvedValue({ ok: false, error: 'Too short' });
    render(<ProfilePanel />);
    fireEvent.change(screen.getByTestId('recovery-password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('recovery-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toHaveTextContent('Too short');
    });
    expect(mockClearRecovery).not.toHaveBeenCalled();
  });

  it('also shows recovery form when status is signed-out but recovery is true', () => {
    setAuth({ status: 'signed-out', user: null, recovery: true });
    render(<ProfilePanel />);
    expect(screen.getByTestId('recovery-submit')).toBeInTheDocument();
    expect(screen.queryByTestId('signin-submit')).not.toBeInTheDocument();
  });
});
