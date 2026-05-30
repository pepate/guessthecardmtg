import { useEffect, useState } from 'react';

// Side-by-side (card-left, options-right) when the viewport is wide OR landscape.
const QUERY = '(min-width: 900px), (orientation: landscape)';

function read(): boolean {
  return typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia(QUERY).matches
    : false;
}

/** True when the playing screen should use the side-by-side layout. */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return wide;
}
