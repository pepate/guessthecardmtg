import { useRef, useState, type ReactNode, type CSSProperties } from 'react';

const THRESHOLD = 64;
const MAX_PULL = 120;

/**
 * Wraps a scrollable area and adds touch pull-to-refresh: pulling down past a
 * threshold while at the top calls `onRefresh` and shows a spinner until it
 * resolves. Touch-only — mouse/desktop behaviour is unchanged.
 */
export function PullToRefresh({
  onRefresh,
  children,
  style,
}: {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    startY.current = !refreshing && (scrollRef.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
    pullRef.current = 0;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    const next = dy > 0 ? Math.min(dy, MAX_PULL) : 0;
    pullRef.current = next;
    setPull(next);
  }
  async function onTouchEnd() {
    const triggered = startY.current != null && pullRef.current > THRESHOLD;
    startY.current = null;
    pullRef.current = 0;
    setPull(0);
    if (triggered && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
  }

  const indicatorH = refreshing ? 40 : pull;
  return (
    <div
      ref={scrollRef}
      data-testid="ptr-root"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', ...style }}
    >
      {indicatorH > 0 && (
        <div
          data-testid="ptr-spinner"
          aria-hidden
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: indicatorH, overflow: 'hidden', flexShrink: 0 }}
        >
          <span className="spinner" />
        </div>
      )}
      {children}
    </div>
  );
}
