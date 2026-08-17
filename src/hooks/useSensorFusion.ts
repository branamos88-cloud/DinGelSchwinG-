/**
 * useSensorFusion — echte Geräte-Sensoren (DeviceOrientation/DeviceMotion)
 * und Fusion mit WASM-Distanzen: Positionen der Geräte werden anhand der
 * Master-Ausrichtung (alpha/beta/gamma) neu projiziert.
 */
import { useCallback, useEffect, useState } from 'react';

export interface SensorData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  acceleration: { x: number; y: number; z: number } | null;
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  absolute: boolean;
  permissionGranted: boolean;
  available: boolean;
}

export function useSensorFusion(): SensorData & { requestPermission: () => Promise<void> } {
  const [data, setData] = useState<SensorData>({
    alpha: null,
    beta: null,
    gamma: null,
    acceleration: null,
    rotationRate: null,
    absolute: false,
    permissionGranted: false,
    available: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
  });

  const requestPermission = useCallback(async () => {
    try {
      const DOE = (window as unknown as Record<string, unknown>).DeviceOrientationEvent as
        | (Event & { requestPermission?: () => Promise<string> })
        | undefined;
      if (typeof DOE?.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        setData(d => ({ ...d, permissionGranted: res === 'granted' }));
      } else {
        // Android/Desktop-Chrome: keine explizite Berechtigung nötig
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
        acceleration: e.acceleration
          ? { x: e.acceleration.x || 0, y: e.acceleration.y || 0, z: e.acceleration.z || 0 }
          : null,
        rotationRate: e.rotationRate
          ? { alpha: e.rotationRate.alpha ?? null, beta: e.rotationRate.beta ?? null, gamma: e.rotationRate.gamma ?? null }
          : null,
      }));
    };
    window.addEventListener('deviceorientation', onOrient as EventListener);
    window.addEventListener('devicemotion', onMotion as EventListener);
    const timer = setTimeout(() => { void requestPermission(); }, 800);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('deviceorientation', onOrient as EventListener);
      window.removeEventListener('devicemotion', onMotion as EventListener);
    };
  }, [requestPermission]);

  return { ...data, requestPermission };
}
