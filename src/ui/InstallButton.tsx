import { useCanInstall, promptInstall } from '../pwa/install';

export function InstallButton() {
  const canInstall = useCanInstall();
  if (!canInstall) return null;

  return (
    <button
      type="button"
      className="install-btn"
      data-testid="install-btn"
      onClick={() => void promptInstall()}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      Install app
    </button>
  );
}
