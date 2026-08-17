/**
 * useBleRuntime — verbindet den BleService mit dem zentralen Store.
 * Ein einziger Service für die ganze App (Singleton über useRef).
 */
import { useEffect, useRef, useState } from 'react';
import { BleService, detectBleCapability } from '../lib/ble/BleService';
import type { BLEWasmExports } from '../lib/bleWasm';
import { useAppStore } from '../state/store';

export interface BleRuntime {
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  scanning: boolean;
  capability: 'native' | 'web' | 'none';
}

export function useBleRuntime(wasm: BLEWasmExports | null): BleRuntime {
  const { state, dispatch } = useAppStore();
  const serviceRef = useRef<BleService | null>(null);
  const [scanning, setScanning] = useState(false);

  if (!serviceRef.current) {
    serviceRef.current = new BleService({
      wasm: wasm ?? {
        calculate_distance: () => 1,
        calculate_distance_env: () => 1,
        calc_exact_distance: () => 1,
        batch_distances: (a: Float64Array) => new Float64Array(a.length),
        learn_from_feedback: () => 2.0,
        get_learned_n: () => 2.0,
      },
      settings: state.settings,
      onDevice: (device) => dispatch({ type: 'UPSERT_DEVICE', device }),
      onLog: (level, msg) => dispatch({ type: 'ADD_LOG', level, msg }),
      onScanState: (running, source) => {
        setScanning(running);
        if (running) dispatch({ type: 'SCAN_START', source });
        else dispatch({ type: 'SCAN_STOP' });
      },
    });
  }

  useEffect(() => {
    serviceRef.current?.updateSettings(state.settings);
  }, [state.settings]);

  useEffect(() => {
    if (wasm) serviceRef.current?.updateWasm(wasm);
  }, [wasm]);

  useEffect(() => {
    // Aufräumen beim Unmount
    return () => {
      serviceRef.current?.stopScan().catch(() => undefined);
    };
  }, []);

  return {
    startScan: () => serviceRef.current!.startScan(),
    stopScan: () => serviceRef.current!.stopScan(),
    scanning,
    capability: detectBleCapability(),
  };
}
