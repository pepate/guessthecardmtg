import { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useLoader } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import type { RoundState } from '../engine/types';

// Holographic foil GLSL — rainbow shimmer scales with `u_intensity`
const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;
    vec4 mvPos = modelViewMatrix * vec4(position, 0.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D u_tex;
  uniform float u_intensity;
  uniform float u_time;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  // Map a 0-1 value to a rainbow hue shift
  vec3 hue2rgb(float h) {
    float r = abs(h * 6.0 - 3.0) - 1.0;
    float g = 2.0 - abs(h * 6.0 - 2.0);
    float b = 2.0 - abs(h * 6.0 - 4.0);
    return clamp(vec3(r, g, b), 0.0, 1.0);
  }

  void main() {
    vec4 base = texture2D(u_tex, vUv);

    // Fresnel-style viewing-angle shimmer
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

    // Animated diagonal bands give the foil sweep
    float band = fract(vUv.x * 4.0 + vUv.y * 2.0 + u_time * 0.3);
    vec3 foil = hue2rgb(band) * (fresnel + 0.4) * u_intensity;

    gl_FragColor = vec4(base.rgb + foil, base.a);
  }
`;

interface Props {
  round: RoundState;
  tiltX: number; // -1..1
  tiltY: number; // -1..1
}

const MAX_TILT = 0.18; // radians

function CardMesh({ round, tiltX, tiltY }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const isWon = round.status === 'won';
  const artUrl =
    (isWon
      ? round.target.image_uris?.normal
      : round.target.image_uris?.art_crop) ??
    round.target.card_faces?.[0]?.image_uris?.[isWon ? 'normal' : 'art_crop'] ??
    '';

  // reveals intensity: count of revealed attributes / 4 attrs total
  const revealCount = Object.values(round.reveals).filter(Boolean).length;
  const intensity = revealCount / 4;

  // Configure TextureLoader with crossOrigin before fetching — Scryfall requires it
  const tex = useLoader(TextureLoader, artUrl, (loader) => {
    (loader as TextureLoader).crossOrigin = 'anonymous';
  });

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.u_time.value = clock.getElapsedTime();
      matRef.current.uniforms.u_intensity.value = intensity;
    }
    if (meshRef.current) {
      const mesh = meshRef.current;
      const targetX = tiltY * MAX_TILT;
      const targetY = tiltX * MAX_TILT;
      mesh.rotation.x += (targetX - mesh.rotation.x) * 0.08;
      mesh.rotation.y += (targetY - mesh.rotation.y) * 0.08;
    }
  });

  const uniforms = useRef({
    u_tex: { value: tex },
    u_intensity: { value: intensity },
    u_time: { value: 0 },
  });

  // Keep texture uniform in sync when URL changes
  useEffect(() => {
    if (uniforms.current) uniforms.current.u_tex.value = tex;
  }, [tex]);

  // MTG card aspect ratio ~2.5"×3.5" => 0.714
  const aspect = isWon ? 0.714 : 1.0; // art_crop is roughly square
  const W = 2.0;
  const H = W / aspect;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[W, H, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms.current}
        transparent
      />
    </mesh>
  );
}

// DeviceOrientation permission state for iOS — only needed once per session
type GyroState = 'unknown' | 'granted' | 'denied' | 'unavailable';

interface HoloCardProps {
  round: RoundState | null;
}

export function HoloCard({ round }: HoloCardProps) {
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [gyroState, setGyroState] = useState<GyroState>('unknown');
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Detect iOS gyro permission requirement (iOS 13+)
  const needsIosPermission =
    typeof DeviceOrientationEvent !== 'undefined' &&
    // @ts-expect-error — requestPermission is iOS-specific
    typeof DeviceOrientationEvent.requestPermission === 'function';

  useEffect(() => {
    if (needsIosPermission) return; // wait for button click
    if (typeof DeviceOrientationEvent === 'undefined') {
      setGyroState('unavailable');
      return;
    }

    const handler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;   // front-back tilt
      const gamma = e.gamma ?? 0; // left-right tilt
      setTiltX(Math.max(-1, Math.min(1, gamma / 45)));
      setTiltY(Math.max(-1, Math.min(1, beta / 45)));
    };
    window.addEventListener('deviceorientation', handler, true);
    setGyroState('granted');
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [needsIosPermission]);

  const requestIosGyro = useCallback(() => {
    // @ts-expect-error — iOS-specific API
    DeviceOrientationEvent.requestPermission()
      .then((state: string) => {
        if (state === 'granted') {
          const handler = (e: DeviceOrientationEvent) => {
            const beta = e.beta ?? 0;
            const gamma = e.gamma ?? 0;
            setTiltX(Math.max(-1, Math.min(1, gamma / 45)));
            setTiltY(Math.max(-1, Math.min(1, beta / 45)));
          };
          window.addEventListener('deviceorientation', handler, true);
          setGyroState('granted');
        } else {
          setGyroState('denied');
        }
      })
      .catch(() => setGyroState('denied'));
  }, []);

  // Touch-drag fallback when gyro unavailable/denied
  const onPointerDown = useCallback((e: PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.x) / 80;
    const dy = (e.clientY - dragRef.current.y) / 80;
    setTiltX(Math.max(-1, Math.min(1, dx)));
    setTiltY(Math.max(-1, Math.min(1, dy)));
  }, []);
  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setTiltX(0);
    setTiltY(0);
  }, []);

  useEffect(() => {
    if (gyroState === 'granted') return; // gyro handles it
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gyroState, onPointerDown, onPointerMove, onPointerUp]);

  if (!round) return null;

  return (
    <>
      {needsIosPermission && gyroState === 'unknown' && (
        <Html center>
          <button
            style={{
              position: 'absolute',
              bottom: '1rem',
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              border: '1px solid #fff',
              borderRadius: '0.5rem',
              padding: '0.4rem 0.8rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
            onClick={requestIosGyro}
          >
            Bewegung aktivieren
          </button>
        </Html>
      )}
      <CardMesh round={round} tiltX={tiltX} tiltY={tiltY} />
    </>
  );
}
