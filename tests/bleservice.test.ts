/**
 * BleService — Scan-Ablauf-Ketten (ohne echte Hardware, jsdom)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BleService, detectBleCapability } from '../src/lib/ble/BleService';
import { JS_FALLBACK } from '../src/lib/bleWasm';
import { DEFAULT_SETTINGS } from '../src/state/types';
import type { Device } from '../src/state/types';

function makeService(settings = DEFAULT_SETTINGS) {
  const onDevice = vi.fn();
  const onLog = vi.fn();
  const onScanState = vi.fn();
  const service = new BleService({
    wasm: JS_FALLBACK,
    settings: { ...settings },
    onDevice,
    onLog,
    onScanState,
  });
  return { service, onDevice, onLog, onScanState };
}

describe('detectBleCapability', () => {
  it('meldet "none" in jsdom (kein navigator.bluetooth)', () => {
    expect(detectBleCapability()).toBe('none');
  });
});

describe('BleService ohne BLE-Hardware', () => {
  let timers: ReturnType<typeof setInterval>[] = [];

  beforeEach(() => {
    timers = [];
  });

  afterEach(() => {
    timers.forEach(t => clearInterval(t));
    vi.restoreAllMocks();
  });

  it('ohne Demo-Modus: Fehler-Log, keine Geräte, Scan bleibt aus', async () => {
    const { service, onDevice, onLog, onScanState } = makeService({ ...DEFAULT_SETTINGS, demoMode: false });
    await service.startScan();
    expect(service.isScanning()).toBe(false);
    expect(onDevice).not.toHaveBeenCalled();
    expect(onLog).toHaveBeenCalledWith('error', expect.stringContaining('BLE nicht verfügbar'));
    expect(onScanState).toHaveBeenCalledWith(false, 'ble');
  });

  it('mit Demo-Modus: veröffentlicht klar als Demo markierte Geräte', async () => {
    const { service, onDevice, onLog } = makeService({ ...DEFAULT_SETTINGS, demoMode: true });
    await service.startScan();
    expect(service.isScanning()).toBe(true);
    expect(onDevice).toHaveBeenCalled();
    const devices: Device[] = onDevice.mock.calls.map((c: unknown[]) => c[0] as Device);
    expect(devices.length).toBeGreaterThanOrEqual(4);
    expect(devices.every(d => d.source === 'demo')).toBe(true);
    expect(onLog).toHaveBeenCalledWith('warn', expect.stringContaining('Demo-Modus'));
    // RSSI-Werte plausibel
    expect(devices.every(d => d.rssi <= 0 && d.rssi >= -100)).toBe(true);
    await service.stopScan();
    expect(service.isScanning()).toBe(false);
  });

  it('publishScanResult berechnet Distanz über WASM und klassifiziert', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // Jitter = 0
    const { service, onDevice } = makeService({ ...DEFAULT_SETTINGS, demoMode: true });
    await service.startScan();
    const master = (onDevice.mock.calls.map((c: unknown[]) => c[0] as Device)).find(d => d.name === 'MASTER-Gold');
    expect(master).toBeDefined();
    expect(master!.type).toBe('master');
    expect(master!.distance).toBeGreaterThan(0);
    // -42 dBm @ -59 TxPower → 10^((−59+42)/20) = 10^-0.85 ≈ 0.141 m
    expect(master!.distance).toBeCloseTo(Math.pow(10, (-59 - -42) / 20), 5);
    await service.stopScan();
    randomSpy.mockRestore();
  });
});
