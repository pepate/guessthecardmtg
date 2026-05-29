import { useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../state/gameStore';
import { HoloCard } from './HoloCard';
import { RevealFX } from './RevealFX';
import { SceneEffects } from './effects';

function IdleScene() {
  return (
    <mesh>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshBasicMaterial color="#334455" transparent opacity={0.5} />
    </mesh>
  );
}

function ActiveScene() {
  const round = useGameStore((s) => s.round);
  const lastResult = useGameStore((s) => s.lastResult);
  const resultSeq = useGameStore((s) => s.resultSeq);

  const cardGroupRef = useRef<THREE.Group>(null);

  if (!round) return <IdleScene />;

  const roundWon = round.status === 'won';

  return (
    <group ref={cardGroupRef}>
      <Suspense fallback={null}>
        <HoloCard round={round} />
      </Suspense>
      <RevealFX
        resultSeq={resultSeq}
        lastResult={lastResult}
        roundWon={roundWon}
        cardGroupRef={cardGroupRef}
      />
    </group>
  );
}

/**
 * CardStage — named export, no props required.
 * Drop it into any container element; it fills 100%/100% via inline style.
 */
export function CardStage() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 4], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 4]} intensity={0.8} />
        <ActiveScene />
        <SceneEffects />
      </Canvas>
    </div>
  );
}
