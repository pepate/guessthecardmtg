import { useState, useCallback } from 'react';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { PerformanceMonitor } from '@react-three/drei';

export function SceneEffects() {
  const [bloomIntensity, setBloomIntensity] = useState(0.8);
  const [bloomEnabled, setBloomEnabled] = useState(true);

  const handleDecline = useCallback(() => {
    setBloomIntensity((v) => {
      const next = v * 0.6;
      if (next < 0.1) {
        setBloomEnabled(false);
        return 0;
      }
      return next;
    });
  }, []);

  const handleIncline = useCallback(() => {
    setBloomEnabled(true);
    setBloomIntensity((v) => Math.min(v + 0.1, 0.8));
  }, []);

  return (
    <PerformanceMonitor onDecline={handleDecline} onIncline={handleIncline}>
      {bloomEnabled && (
        <EffectComposer>
          <Bloom intensity={bloomIntensity} luminanceThreshold={0.4} luminanceSmoothing={0.9} />
        </EffectComposer>
      )}
    </PerformanceMonitor>
  );
}
