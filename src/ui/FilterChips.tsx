import { modeName, type CustomFilter } from '../modes/filter';

export function FilterChips({ filter }: { filter: CustomFilter }) {
  const label = modeName(filter);
  return (
    <div
      className="filter-chips"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}
    >
      {label.split(' · ').map((p) => (
        <span
          key={p}
          className="chip"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: 0.5,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--line-strong)',
            background: 'rgba(255,186,120,0.08)',
            color: 'var(--ink-1)',
          }}
        >
          {p}
        </span>
      ))}
    </div>
  );
}
