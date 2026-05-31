import { describe, it, expect, vi, beforeEach } from 'vitest';

const listModes = vi.fn();
const setRevealChoice = vi.fn();
const selectPool = vi.fn().mockResolvedValue(undefined);

vi.mock('./client', () => ({ listModes }));
vi.mock('../state/gameStore', () => ({ useGameStore: { getState: () => ({ setRevealChoice, selectPool }) } }));

async function importQuickStart() {
  vi.resetModules();
  return import('./quickStart');
}

beforeEach(() => {
  listModes.mockReset();
  setRevealChoice.mockReset();
  selectPool.mockReset();
  selectPool.mockResolvedValue(undefined);
});

describe('startMostPlayedGame', () => {
  it('starts the mode with the highest entry_count in blur and returns true', async () => {
    listModes.mockResolvedValue([
      { id: 'm1', name: 'Simic', filter: { a: 1 }, entry_count: 3 },
      { id: 'm2', name: 'Top 100', filter: { b: 2 }, entry_count: 11 },
      { id: 'm3', name: 'Artifacts', filter: { c: 3 }, entry_count: 7 },
    ]);
    const { startMostPlayedGame } = await importQuickStart();
    expect(await startMostPlayedGame()).toBe(true);
    expect(setRevealChoice).toHaveBeenCalledWith('blur');
    expect(selectPool).toHaveBeenCalledWith({ kind: 'custom', modeId: 'm2', filter: { b: 2 }, name: 'Top 100' });
  });

  it('returns false and starts nothing when there are no modes', async () => {
    listModes.mockResolvedValue([]);
    const { startMostPlayedGame } = await importQuickStart();
    expect(await startMostPlayedGame()).toBe(false);
    expect(selectPool).not.toHaveBeenCalled();
  });

  it('honours an explicit reveal mode', async () => {
    listModes.mockResolvedValue([{ id: 'm1', name: 'Simic', filter: {}, entry_count: 1 }]);
    const { startMostPlayedGame } = await importQuickStart();
    await startMostPlayedGame('zoom');
    expect(setRevealChoice).toHaveBeenCalledWith('zoom');
  });
});
