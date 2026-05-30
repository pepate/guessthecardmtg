import { useEffect, useState } from 'react';

// Narrow portrait phones — used to trim the leaderboard so the start CTAs stay
// above the fold. Mirrors the breakpoint used by the mobile CSS in index.css.
const QUERY = '(max-width: 600px)';

function read(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false;
}

/** True on narrow phone viewports. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return mobile;
}
