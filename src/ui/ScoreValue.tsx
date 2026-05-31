/**
 * Renders a score so the eye scans the leading (thousands+) digits first:
 * the high-order digits stay bold and hot, the last three (hundreds/tens/units)
 * are slightly smaller and greyed so the big number still registers without shouting.
 */
export function ScoreValue({ score, fontSize = 15 }: { score: number; fontSize?: number }) {
  const text = String(Math.trunc(Math.abs(score)));
  const sign = score < 0 ? '-' : '';
  const head = text.length > 3 ? text.slice(0, -3) : '';
  const tail = head ? text.slice(-3) : text;

  return (
    <span style={{ fontSize, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {sign}
      {head && <span style={{ color: 'var(--ember-hot)' }}>{head}</span>}
      <span
        style={{
          color: head ? 'var(--ink-2)' : 'var(--ember-hot)',
          fontSize: head ? Math.round(fontSize * 0.82) : fontSize,
          fontWeight: head ? 500 : 700,
        }}
      >
        {tail}
      </span>
    </span>
  );
}
