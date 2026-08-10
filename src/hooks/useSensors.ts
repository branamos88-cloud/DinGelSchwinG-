import { useState, useEffect, useCallback } from 'react';

export interface SensorData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  acceleration: { x: number; y: number; z: number } | null;
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  absolute: boolean;
  permissionGranted: boolean;
}

export function useSensors() {
  const [data, setData] = useState<SensorData>({
    alpha: null,
    beta: null,
    gamma: null,
    acceleration: null,
    rotationRate: null,
    absolute: false,
    permissionGranted: false,
  });

  const requestPermission = useCallback(async () => {
    try {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        const res = await (DeviceOrientationEvent as any).requestPermission();
        if (res === 'granted') {
          setData(d => ({ ...d, permissionGranted: true }));
        }
      } else {
        // Desktop / Android Chrome: keine explizite Permission notwendig
        setData(d => ({ ...d, permissionGranted: true }));
      }
    } catch {
      setData(d => ({ ...d, permissionGranted: true }));
    }
  }, []);

  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      setData(prev => ({
        ...prev,
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
        absolute: e.absolute || false,
      }));
    };
    const onMotion = (e: DeviceMotionEvent) => {
      setData(prev => ({
        ...prev,
        acceleration: e.acceleration ? {
          x: e.acceleration.x || 0,
          y: e.acceleration.y || 0,
          z: e.acceleration.z || 0,
        } : null,
        rotationRate: e.rotationRate ? {
          alpha: e.rotationRate.alpha ?? null,
          beta: e.rotationRate.beta ?? null,
          gamma: e.rotationRate.gamma ?? null,
        } : null,
      }));
    };
    window.addEventListener('deviceorientation', onOrient as EventListener);
    window.addEventListener('devicemotion', onMotion as EventListener);
    // Auto-request auf ersten Interakt (mobile Safari Blockade vermeiden)
    const timer = setTimeout(() => requestPermission(), 1000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('deviceorientation', onOrient as EventListener);
      window.removeEventListener('devicemotion', onMotion as EventListener);
    };
  }, [requestPermission]);


  return { ...data, requestPermission };
}
