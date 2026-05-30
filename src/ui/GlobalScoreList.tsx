import type { ReactNode } from 'react';
import type { GlobalEntry } from '../leaderboard/types';
import { countryToFlag } from '../leaderboard/flag';
import { formatAge } from '../leaderboard/age';

const GRID = '32px 20px 1fr auto auto';

function Row({
  rank,
  entry,
  now,
  highlight,
  testid,
  nameOverride,
}: {
  rank: number;
  entry: GlobalEntry;
  now: number;
  highlight: boolean;
  testid: string;
  nameOverride?: ReactNode;
}) {
  return (
    <div
      data-testid={testid}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        gap: 8,
        alignItems: 'center',
        padding: '8px 10px',
        borderRadius: 8,
        background: highlight ? 'rgba(255,138,60,0.18)' : 'rgba(20,17,28,0.5)',
        border: `1px solid ${highlight ? 'var(--ember)' : 'var(--line)'}`,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>#{rank}</span>
      <span aria-hidden style={{ fontSize: 14 }}>{countryToFlag(entry.country)}</span>
      {nameOverride ?? (
        <span style={{ color: 'var(--ink-0)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.name}
        </span>
      )}
      <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{entry.correct}✓ · {formatAge(entry.createdAt, now)}</span>
      <span style={{ color: 'var(--ember-hot)', fontSize: 15, fontWeight: 700 }}>{entry.score}</span>
    </div>
  );
}

export function GlobalScoreList({
  entries,
  highlightId,
  pinned,
  pinnedNameInput,
  now = Date.now(),
}: {
  entries: GlobalEntry[];
  highlightId?: string;
  pinned?: { rank: number; entry: GlobalEntry } | null;
  /** When set, replaces the name cell of the pinned row (e.g. an inline name input). */
  pinnedNameInput?: ReactNode;
  now?: number;
}) {
  if (entries.length === 0 && !pinned) {
    return (
      <p data-testid="global-empty" style={{ color: 'var(--ink-2)', fontSize: 13, textAlign: 'center', margin: 0 }}>
        No entries yet — be the first!
      </p>
    );
  }

  return (
    <div data-testid="global-list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {entries.map((entry, i) => (
        <Row
          key={entry.id}
          rank={i + 1}
          entry={entry}
          now={now}
          highlight={entry.id === highlightId}
          testid="global-entry"
        />
      ))}
      {pinned && (
        <>
          <div aria-hidden style={{ textAlign: 'center', color: 'var(--ink-2)', fontSize: 14, padding: '2px 0' }}>
            …
          </div>
          <Row rank={pinned.rank} entry={pinned.entry} now={now} highlight testid="global-pinned" nameOverride={pinnedNameInput} />
        </>
      )}
    </div>
  );
}
