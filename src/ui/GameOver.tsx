import { motion } from 'framer-motion';
import { useGameStore } from '../state/gameStore';
import { useCountUp } from './useCountUp';
import { HighscoreList } from './HighscoreList';

export function GameOver() {
  const correctCount = useGameStore((s) => s.correctCount);
  const totalScore = useGameStore((s) => s.totalScore);
  const totalRounds = useGameStore((s) => s.config.totalRounds);
  const highscores = useGameStore((s) => s.highscores);
  const restart = useGameStore((s) => s.restart);
  const reset = useGameStore((s) => s.reset);

  const animatedScore = useCountUp(totalScore, 1100, 1, 0);
  const best = highscores[0]?.score ?? 0;
  const isBest = totalScore > 0 && totalScore >= best;

  return (
    <motion.div
      key="gameover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="gameover"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '24px 22px calc(24px + env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: isBest ? 'var(--ember-hot)' : 'var(--ink-2)',
          }}
        >
          {isBest ? 'Neuer Rekord' : 'Spiel beendet'}
        </div>
        <div data-testid="final-correct" style={{ fontSize: 52, fontWeight: 700, color: 'var(--ink-0)', margin: '4px 0' }}>
          {correctCount}/{totalRounds}
        </div>
        <div style={{ color: 'var(--ember-hot)', fontSize: 24, fontWeight: 600 }}>
          <span data-testid="final-score">{animatedScore}</span> Punkte
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 420 }}>
        <HighscoreList
          entries={highscores}
          highlight={(e) => e.score === totalScore && e.correct === correctCount}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 420 }}>
        <button className="ember-btn" style={{ width: '100%' }} onClick={restart}>
          Nochmal spielen
        </button>
        <button className="ghost-btn" style={{ width: '100%' }} onClick={reset}>
          Zur Auswahl
        </button>
      </div>
    </motion.div>
  );
}
