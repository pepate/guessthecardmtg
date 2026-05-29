import { AnimatePresence, motion } from 'framer-motion';
import { CardStage } from './scene/CardStage';
import { useGameStore } from './state/gameStore';
import { PoolSelect } from './ui/PoolSelect';
import { HUD } from './ui/HUD';
import { AttributeBar } from './ui/AttributeBar';
import { AttributeGuess } from './ui/AttributeGuess';
import { NameChoice } from './ui/NameChoice';
import { Scoreboard } from './ui/Scoreboard';

const overlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  pointerEvents: 'none',
};

const panelBase: React.CSSProperties = {
  pointerEvents: 'all',
};

function LoadingScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '4px solid rgba(255,255,255,0.15)',
          borderTopColor: '#7af',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

function ErrorScreen() {
  const error = useGameStore((s) => s.error);
  const reset = useGameStore((s) => s.reset);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '0 24px',
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <p style={{ color: '#f88', fontSize: 16, textAlign: 'center', margin: 0 }}>
        {error ?? 'Unbekannter Fehler'}
      </p>
      <button
        onClick={reset}
        style={{
          minHeight: 52,
          minWidth: 180,
          borderRadius: 12,
          border: 'none',
          background: 'rgba(100,160,255,0.5)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 17,
          cursor: 'pointer',
        }}
      >
        Neue Karte
      </button>
    </motion.div>
  );
}

export function App() {
  const phase = useGameStore((s) => s.phase);
  const round = useGameStore((s) => s.round);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0c12',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <CardStage />

      <div style={overlay}>
        <AnimatePresence>
          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                ...panelBase,
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(8,10,20,0.8)',
                backdropFilter: 'blur(14px)',
                borderRadius: '20px 20px 0 0',
              }}
            >
              <PoolSelect />
            </motion.div>
          )}

          {phase === 'loading' && <LoadingScreen key="loading" />}

          {phase === 'error' && <ErrorScreen key="error" />}

          {phase === 'playing' && round && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              <div style={panelBase}>
                <HUD />
              </div>

              <div style={{ flex: 1 }} />

              <div style={{ ...panelBase, display: 'flex', flexDirection: 'column' }}>
                <AttributeBar round={round} />
                <NameChoice />
                <AttributeGuess round={round} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'playing' && round && round.status !== 'playing' && (
          <Scoreboard />
        )}
      </div>
    </div>
  );
}
