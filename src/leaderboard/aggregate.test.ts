import { describe, it, expect } from 'vitest';
import { aggregateByPerson, type LeaderboardRun } from './aggregate';

function run(p: Partial<LeaderboardRun> & { name: string; score: number }): LeaderboardRun {
  return {
    id: `${p.name}-${p.score}`,
    correct: 9,
    gameMode: null,
    deviceId: 'device-default',
    country: 'DE',
    createdAt: 0,
    ...p,
  };
}

describe('aggregateByPerson', () => {
  it('shows each person once, keeping their best score', () => {
    const out = aggregateByPerson([
      run({ name: 'Intenso', score: 3446, gameMode: 'silhouette', createdAt: 100 }),
      run({ name: 'Intenso', score: 4642, gameMode: 'silhouette', createdAt: 200 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Intenso');
    expect(out[0].score).toBe(4642);
  });

  it('lists every reveal mode the person played, ordered by points (highest first)', () => {
    const out = aggregateByPerson([
      run({ name: 'Al', score: 500, gameMode: 'blur' }),
      run({ name: 'Al', score: 900, gameMode: 'zoom' }),
      run({ name: 'Al', score: 700, gameMode: 'mosaic' }),
    ]);
    expect(out[0].gameModes).toEqual(['zoom', 'mosaic', 'blur']);
    expect(out[0].score).toBe(900);
  });

  it('keeps only the best run per reveal mode when computing badges', () => {
    const out = aggregateByPerson([
      run({ name: 'Al', score: 300, gameMode: 'blur' }),
      run({ name: 'Al', score: 800, gameMode: 'blur' }),
    ]);
    expect(out[0].gameModes).toEqual(['blur']);
    expect(out[0].score).toBe(800);
  });

  it('ranks people by best score, older runs winning ties', () => {
    const out = aggregateByPerson([
      run({ name: 'Low', score: 100, gameMode: 'blur' }),
      run({ name: 'TieOld', score: 500, gameMode: 'blur', createdAt: 10 }),
      run({ name: 'TieNew', score: 500, gameMode: 'blur', createdAt: 20 }),
      run({ name: 'High', score: 900, gameMode: 'blur' }),
    ]);
    expect(out.map((p) => p.name)).toEqual(['High', 'TieOld', 'TieNew', 'Low']);
  });

  it('produces no badges for runs without a reveal mode but still counts the score', () => {
    const out = aggregateByPerson([run({ name: 'Legacy', score: 600, gameMode: null })]);
    expect(out[0].gameModes).toEqual([]);
    expect(out[0].score).toBe(600);
  });
});
