import { describe, it, expect, beforeEach } from 'vitest';
import { loadHighscores, saveHighscore, type HighscoreEntry } from './highscores';

function entry(score: number, correct = 10, date = 1000): HighscoreEntry {
  return { score, correct, date, pool: 'popular' };
}

describe('highscores', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(loadHighscores()).toEqual([]);
  });

  it('persists a saved entry across reads', () => {
    saveHighscore(entry(500));
    expect(loadHighscores()).toHaveLength(1);
    expect(loadHighscores()[0].score).toBe(500);
  });

  it('orders entries by score descending', () => {
    saveHighscore(entry(300));
    saveHighscore(entry(900));
    saveHighscore(entry(600));
    expect(loadHighscores().map((e) => e.score)).toEqual([900, 600, 300]);
  });

  it('keeps only the top 10 scores', () => {
    for (let i = 1; i <= 15; i++) saveHighscore(entry(i * 100, 10, i));
    const list = loadHighscores();
    expect(list).toHaveLength(10);
    expect(list[0].score).toBe(1500);
    expect(list[9].score).toBe(600);
  });

  it('breaks score ties in favour of the newer game', () => {
    saveHighscore(entry(500, 10, 1000));
    saveHighscore(entry(500, 12, 2000));
    expect(loadHighscores()[0].correct).toBe(12);
  });

  it('ignores corrupt stored data', () => {
    localStorage.setItem('guessthecard.highscores.v3', 'not json');
    expect(loadHighscores()).toEqual([]);
  });

  it('filters out malformed entries', () => {
    localStorage.setItem(
      'guessthecard.highscores.v3',
      JSON.stringify([{ score: 100, correct: 5, date: 1, pool: 'all' }, { nope: true }]),
    );
    expect(loadHighscores()).toHaveLength(1);
  });
});
