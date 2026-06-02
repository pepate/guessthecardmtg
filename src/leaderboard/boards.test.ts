import { describe, it, expect } from 'vitest';
import type { RevealMode } from '../engine/timeAttack';
import {
  comboBoard,
  revealLeaders,
  isRank1,
  deviceModeStanding,
  pickAutoAdvance,
  type Run,
} from './boards';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function run(
  p: Partial<Run> & { deviceId: string; score: number; gameMode: RevealMode | null },
): Run {
  return {
    id: `run-${++_idCounter}`,
    name: p.name ?? p.deviceId,
    correct: 9,
    country: null,
    createdAt: 1_000,
    ...p,
  };
}

// Reset counter between describe blocks to keep ids stable
function resetId() {
  _idCounter = 0;
}

// ---------------------------------------------------------------------------
// comboBoard
// ---------------------------------------------------------------------------

describe('comboBoard', () => {
  it('returns empty array for no runs', () => {
    expect(comboBoard([], 'blur')).toEqual([]);
  });

  it('only considers runs matching the given reveal', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 800, gameMode: 'blur' }),
      run({ deviceId: 'A', score: 999, gameMode: 'zoom' }), // wrong reveal
    ];
    const board = comboBoard(runs, 'blur');
    expect(board).toHaveLength(1);
    expect(board[0].score).toBe(800);
  });

  it('keeps the best score per device, ignoring lower runs', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 500, gameMode: 'blur', createdAt: 100 }),
      run({ deviceId: 'A', score: 900, gameMode: 'blur', createdAt: 200 }),
    ];
    const board = comboBoard(runs, 'blur');
    expect(board).toHaveLength(1);
    expect(board[0].score).toBe(900);
    expect(board[0].deviceId).toBe('A');
  });

  it('tiebreaks equal scores by earlier createdAt', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 700, gameMode: 'blur', createdAt: 200 }),
      run({ deviceId: 'A', score: 700, gameMode: 'blur', createdAt: 100 }),
    ];
    const board = comboBoard(runs, 'blur');
    expect(board[0].createdAt).toBe(100);
  });

  it('tiebreaks equal score + equal createdAt by larger id', () => {
    resetId();
    const r1 = run({ deviceId: 'A', score: 700, gameMode: 'blur', createdAt: 100 });
    const r2 = run({ deviceId: 'A', score: 700, gameMode: 'blur', createdAt: 100 });
    // r2 has larger id (higher counter)
    const board = comboBoard([r1, r2], 'blur');
    expect(board[0].id).toBe(r2.id);
  });

  it('deduplicates multiple devices correctly', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'B', score: 700, gameMode: 'blur' }),
      run({ deviceId: 'A', score: 500, gameMode: 'blur' }), // lower than A's 900
    ];
    const board = comboBoard(runs, 'blur');
    expect(board).toHaveLength(2);
    expect(board[0].deviceId).toBe('A');
    expect(board[0].score).toBe(900);
    expect(board[1].deviceId).toBe('B');
  });

  it('orders board score desc, then createdAt asc', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'C', score: 300, gameMode: 'blur', createdAt: 50 }),
      run({ deviceId: 'A', score: 900, gameMode: 'blur', createdAt: 100 }),
      run({ deviceId: 'B', score: 900, gameMode: 'blur', createdAt: 50 }), // same score, earlier time wins
    ];
    const board = comboBoard(runs, 'blur');
    expect(board.map((e) => e.deviceId)).toEqual(['B', 'A', 'C']);
  });

  it('sets gameModes to [] on each entry', () => {
    resetId();
    const runs: Run[] = [run({ deviceId: 'A', score: 800, gameMode: 'blur' })];
    expect(comboBoard(runs, 'blur')[0].gameModes).toEqual([]);
  });

  it('populates entry fields from the kept run', () => {
    resetId();
    const r = run({
      id: 'fixed-id',
      name: 'TestName',
      deviceId: 'A',
      score: 800,
      correct: 7,
      gameMode: 'blur',
      country: 'DE',
      createdAt: 9999,
    });
    const board = comboBoard([r], 'blur');
    const e = board[0];
    expect(e.id).toBe('fixed-id');
    expect(e.name).toBe('TestName');
    expect(e.score).toBe(800);
    expect(e.correct).toBe(7);
    expect(e.country).toBe('DE');
    expect(e.createdAt).toBe(9999);
    expect(e.deviceId).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// revealLeaders
// ---------------------------------------------------------------------------

describe('revealLeaders', () => {
  it('returns all KNOWN_REVEAL_MODES as keys', () => {
    const result = revealLeaders([]);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(['blur', 'gallery', 'mosaic', 'scanner', 'silhouette', 'spotlight', 'zoom']);
  });

  it('returns null for a reveal with no runs', () => {
    const result = revealLeaders([]);
    expect(result['blur']).toBeNull();
  });

  it('returns the rank-1 entry for each reveal', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'B', score: 700, gameMode: 'blur' }),
      run({ deviceId: 'C', score: 500, gameMode: 'zoom' }),
    ];
    const leaders = revealLeaders(runs);
    expect(leaders['blur']?.deviceId).toBe('A');
    expect(leaders['zoom']?.deviceId).toBe('C');
    expect(leaders['mosaic']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isRank1
// ---------------------------------------------------------------------------

describe('isRank1', () => {
  it('returns true when device is sole rank-1', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'B', score: 700, gameMode: 'blur' }),
    ];
    expect(isRank1(runs, 'blur', 'A')).toBe(true);
  });

  it('returns false when another device has a higher score', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 700, gameMode: 'blur' }),
      run({ deviceId: 'B', score: 900, gameMode: 'blur' }),
    ];
    expect(isRank1(runs, 'blur', 'A')).toBe(false);
  });

  it('returns false when device has no runs on this reveal', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'B', score: 900, gameMode: 'blur' }),
    ];
    expect(isRank1(runs, 'blur', 'A')).toBe(false);
  });

  it('returns false when board is empty', () => {
    expect(isRank1([], 'blur', 'A')).toBe(false);
  });

  it('returns true when device is rank-1 on a different reveal than another leader', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'B', score: 999, gameMode: 'zoom' }),
    ];
    expect(isRank1(runs, 'blur', 'A')).toBe(true);
    expect(isRank1(runs, 'zoom', 'B')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deviceModeStanding
// ---------------------------------------------------------------------------

describe('deviceModeStanding', () => {
  it('returns null when device has no runs', () => {
    resetId();
    const runs: Run[] = [run({ deviceId: 'B', score: 900, gameMode: 'blur' })];
    expect(deviceModeStanding(runs, 'A')).toBeNull();
  });

  it('returns 1 when device is rank-1 on at least one reveal', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'B', score: 700, gameMode: 'blur' }),
    ];
    expect(deviceModeStanding(runs, 'A')).toBe(1);
  });

  it('picks the best (lowest) rank across reveals', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'A', score: 300, gameMode: 'blur' }),  // rank 2 on blur
      run({ deviceId: 'B', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'A', score: 900, gameMode: 'zoom' }),  // rank 1 on zoom
    ];
    expect(deviceModeStanding(runs, 'A')).toBe(1);
  });

  it('returns rank 2 when device is always second', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'B', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'A', score: 700, gameMode: 'blur' }),
      run({ deviceId: 'B', score: 900, gameMode: 'zoom' }),
      run({ deviceId: 'A', score: 700, gameMode: 'zoom' }),
    ];
    expect(deviceModeStanding(runs, 'A')).toBe(2);
  });

  it('ignores reveals where the device has no entry', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'B', score: 900, gameMode: 'zoom' }),  // A not present here
      run({ deviceId: 'A', score: 500, gameMode: 'blur' }),
      run({ deviceId: 'B', score: 300, gameMode: 'blur' }),
    ];
    // A rank 1 on blur, absent on zoom → standing = 1
    expect(deviceModeStanding(runs, 'A')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pickAutoAdvance
// ---------------------------------------------------------------------------

describe('pickAutoAdvance', () => {
  function makeMap(entries: [string, Run[]][]): Map<string, Run[]> {
    return new Map(entries);
  }

  const reveals: RevealMode[] = ['blur', 'zoom'];

  it('returns null when no combos qualify (empty runs)', () => {
    const m = makeMap([['mode-a', []]]);
    expect(pickAutoAdvance(m, 'dev-A', reveals)).toBeNull();
  });

  it('returns null when device is rank-1 on every combo', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'dev-A', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'dev-B', score: 700, gameMode: 'blur' }),
    ];
    const m = makeMap([['mode-a', runs]]);
    // dev-A is rank-1 on blur; zoom has no other device → skipped
    expect(pickAutoAdvance(m, 'dev-A', ['blur'])).toBeNull();
  });

  it('returns null when board has no other device (device is the only participant)', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'dev-A', score: 900, gameMode: 'blur' }),
    ];
    const m = makeMap([['mode-a', runs]]);
    expect(pickAutoAdvance(m, 'dev-A', reveals)).toBeNull();
  });

  it('picks a combo where device is not rank-1 and another device exists', () => {
    resetId();
    const runs: Run[] = [
      run({ deviceId: 'dev-B', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'dev-A', score: 700, gameMode: 'blur' }),
    ];
    const m = makeMap([['mode-a', runs]]);
    const result = pickAutoAdvance(m, 'dev-A', ['blur']);
    expect(result).toEqual({ modeId: 'mode-a', reveal: 'blur' });
  });

  it('prefers the combo with the fewest device points (0 if absent)', () => {
    resetId();
    // mode-a/blur: dev-A has 500 points (not rank-1, B leads at 900)
    // mode-b/blur: dev-A has no entry (0 points), C leads
    const runsA: Run[] = [
      run({ deviceId: 'dev-B', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'dev-A', score: 500, gameMode: 'blur' }),
    ];
    const runsB: Run[] = [
      run({ deviceId: 'dev-C', score: 800, gameMode: 'blur' }),
    ];
    const m = makeMap([['mode-a', runsA], ['mode-b', runsB]]);
    // mode-b/blur: dev-A absent (0 pts), another device exists, not rank-1 → preferred
    const result = pickAutoAdvance(m, 'dev-A', ['blur']);
    expect(result).toEqual({ modeId: 'mode-b', reveal: 'blur' });
  });

  it('tiebreaks by Map insertion order of modes when points are equal', () => {
    resetId();
    // Both mode-a/blur and mode-b/blur: dev-A absent (0 points each), another device exists
    const runsA: Run[] = [run({ deviceId: 'dev-B', score: 900, gameMode: 'blur' })];
    const runsB: Run[] = [run({ deviceId: 'dev-C', score: 800, gameMode: 'blur' })];
    const m = makeMap([['mode-a', runsA], ['mode-b', runsB]]);
    // mode-a inserted first → picked
    const result = pickAutoAdvance(m, 'dev-A', ['blur']);
    expect(result?.modeId).toBe('mode-a');
  });

  it('tiebreaks by reveals array order when mode and points are equal', () => {
    resetId();
    // mode-a has two qualifying reveals with 0 device points each
    const runs: Run[] = [
      run({ deviceId: 'dev-B', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'dev-C', score: 800, gameMode: 'zoom' }),
    ];
    const m = makeMap([['mode-a', runs]]);
    const reveals2: RevealMode[] = ['zoom', 'blur'];
    // zoom comes first in reveals array → picked
    const result = pickAutoAdvance(m, 'dev-A', reveals2);
    expect(result).toEqual({ modeId: 'mode-a', reveal: 'zoom' });
  });

  it('skips combos where the board has no other device even if device is absent', () => {
    resetId();
    // mode-a/blur: only dev-A. mode-b/blur: dev-B leads, dev-A second (50 pts)
    const runsA: Run[] = [run({ deviceId: 'dev-A', score: 700, gameMode: 'blur' })];
    const runsB: Run[] = [
      run({ deviceId: 'dev-B', score: 900, gameMode: 'blur' }),
      run({ deviceId: 'dev-A', score: 50, gameMode: 'blur' }),
    ];
    const m = makeMap([['mode-a', runsA], ['mode-b', runsB]]);
    const result = pickAutoAdvance(m, 'dev-A', ['blur']);
    // mode-a/blur: only dev-A → skip; mode-b/blur qualifies
    expect(result).toEqual({ modeId: 'mode-b', reveal: 'blur' });
  });

  it('returns null when all combos are rank-1 or no other device', () => {
    resetId();
    const runs: Run[] = [run({ deviceId: 'dev-A', score: 900, gameMode: 'blur' })];
    const m = makeMap([['mode-a', runs]]);
    expect(pickAutoAdvance(m, 'dev-A', ['blur', 'zoom'])).toBeNull();
  });
});
