import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GuessResult } from '../engine/types';

// --- Particle burst for correct attribute reveal ---

interface BurstParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number; // 0..1 countdown
}

function makeParticles(count: number): BurstParticle[] {
  return Array.from({ length: count }, () => {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 0.02 + Math.random() * 0.04;
    return {
      pos: new THREE.Vector3(0, 0, 0.1),
      vel: new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed * 0.3,
      ),
      life: 1.0,
    };
  });
}

interface BurstProps {
  count: number;
  onDone: () => void;
}

function ParticleBurst({ count, onDone }: BurstProps) {
  const particles = useRef<BurstParticle[]>(makeParticles(count));
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const doneRef = useRef(false);

  const positions = useMemo(() => new Float32Array(count * 3), [count]);

  useFrame((_, delta) => {
    let allDead = true;
    particles.current.forEach((p, i) => {
      if (p.life <= 0) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = -999; // hide dead particles
        return;
      }
      allDead = false;
      p.life -= delta * 1.4;
      p.pos.addScaledVector(p.vel, delta * 60);
      positions[i * 3] = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
    });

    if (geoRef.current) {
      const attr = geoRef.current.getAttribute('position') as THREE.BufferAttribute;
      attr.array.set(positions);
      attr.needsUpdate = true;
    }

    if (allDead && !doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  });

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#ffe066" transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

// --- Glossy sweep plane for round won ---

function GlossySweep({ onDone }: { onDone: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const tRef = useRef(0);
  const doneRef = useRef(false);

  useFrame((_, delta) => {
    tRef.current += delta * 1.2;
    if (meshRef.current) {
      // slide from left (-2.5) to right (+2.5)
      meshRef.current.position.x = -2.5 + tRef.current * 5;
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - tRef.current);
    }
    if (tRef.current > 1.0 && !doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  });

  return (
    <mesh ref={meshRef} position={[-2.5, 0, 0.2]} rotation={[0, 0, Math.PI / 8]}>
      <planeGeometry args={[0.4, 4]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
    </mesh>
  );
}

// --- Red shake / glitch for wrong name guess ---

interface ShakeProps {
  meshRef: React.RefObject<THREE.Group | null>;
  onDone: () => void;
}

function ShakeFX({ meshRef, onDone }: ShakeProps) {
  const tRef = useRef(0);
  const doneRef = useRef(false);

  useFrame((_, delta) => {
    tRef.current += delta;
    if (meshRef.current) {
      const intensity = Math.max(0, (0.5 - tRef.current) * 0.15);
      meshRef.current.position.x = (Math.random() - 0.5) * intensity;
      meshRef.current.position.y = (Math.random() - 0.5) * intensity;
    }
    if (tRef.current > 0.5 && !doneRef.current) {
      doneRef.current = true;
      if (meshRef.current) {
        meshRef.current.position.x = 0;
        meshRef.current.position.y = 0;
      }
      onDone();
    }
  });

  return null;
}

// --- Glow pulse overlay ---

function GlowPulse({ onDone }: { onDone: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const tRef = useRef(0);
  const doneRef = useRef(false);

  useFrame((_, delta) => {
    tRef.current += delta * 2;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, Math.sin(tRef.current * Math.PI) * 0.35);
    }
    if (tRef.current > 1.0 && !doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.15]}>
      <planeGeometry args={[2.2, 3.1]} />
      <meshBasicMaterial color="#aaddff" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// --- Main RevealFX ---

type FXKind = 'burst' | 'won' | 'wrong';

interface RevealFXProps {
  resultSeq: number;
  lastResult: GuessResult | null;
  roundWon: boolean;
  /** group ref of the card so shake can move it */
  cardGroupRef: React.RefObject<THREE.Group | null>;
  /** particle count — caller can reduce on weak devices */
  particleCount?: number;
}

export function RevealFX({
  resultSeq,
  lastResult,
  roundWon,
  cardGroupRef,
  particleCount = 60,
}: RevealFXProps) {
  const [activeFX, setActiveFX] = useState<FXKind | null>(null);
  const prevSeqRef = useRef(-1);

  useEffect(() => {
    if (resultSeq === prevSeqRef.current) return;
    prevSeqRef.current = resultSeq;
    if (!lastResult) return;

    if (roundWon) {
      setActiveFX('won');
    } else if (lastResult.correct && lastResult.revealedAttribute) {
      setActiveFX('burst');
    } else if (!lastResult.correct && !lastResult.roundWon) {
      setActiveFX('wrong');
    }
  }, [resultSeq, lastResult, roundWon]);

  const dismiss = () => setActiveFX(null);

  return (
    <>
      {activeFX === 'burst' && (
        <>
          <ParticleBurst count={particleCount} onDone={dismiss} />
          <GlowPulse onDone={dismiss} />
        </>
      )}
      {activeFX === 'won' && <GlossySweep onDone={dismiss} />}
      {activeFX === 'wrong' && <ShakeFX meshRef={cardGroupRef} onDone={dismiss} />}
    </>
  );
}
