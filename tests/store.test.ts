/**
 * Store — Reducer-Funktionsketten (Geräte, Bindung, Scan, Logs, Replay)
 */
import { describe, it, expect } from 'vitest';
import { appReducer, makeInitialState } from '../src/state/store';
import type { AppState, Device } from '../src/state/types';

function baseDevice(id: string, overrides?: Partial<Device>): Device {
  return {
    id, name: `Gerät ${id}`, type: 'client', rssi: -65, txPower: -59,
    x: 0, y: 0, z: 0, distance: 2, bound: false, source: 'ble', lastSeen: Date.now(),
    ...overrides,
  };
}

describe('appReducer', () => {
  it('UPSERT_DEVICE: fügt hinzu und aktualisiert bestehende Geräte', () => {
    let state = makeInitialState();
    state = appReducer(state, { type: 'UPSERT_DEVICE', device: baseDevice('d1', { rssi: -60 }) });
    expect(state.devices.length).toBe(1);
    state = appReducer(state, { type: 'UPSERT_DEVICE', device: baseDevice('d1', { rssi: -70, distance: 3.5 }) });
    expect(state.devices.length).toBe(1); // kein Duplikat
    expect(state.devices[0].rssi).toBe(-70);
    expect(state.devices[0].distance).toBe(3.5);
  });

  it('REMOVE_DEVICE und CLEAR_DEVICES funktionieren', () => {
    let state = makeInitialState();
    state = appReducer(state, { type: 'UPSERT_DEVICE', device: baseDevice('d1') });
    state = appReducer(state, { type: 'UPSERT_DEVICE', device: baseDevice('d2', { source: 'demo' }) });
    state = appReducer(state, { type: 'REMOVE_DEVICE', id: 'd1' });
    expect(state.devices.map(d => d.id)).toEqual(['d2']);
    state = appReducer(state, { type: 'CLEAR_DEVICES', source: 'demo' });
    expect(state.devices.length).toBe(0);
  });

  it('BIND_DEVICE → Gerät als gebunden markieren; UNBIND setzt zurück', () => {
    let state = makeInitialState();
    state = appReducer(state, { type: 'UPSERT_DEVICE', device: baseDevice('ble-1', { id: 'ble-1' }) });
    state = appReducer(state, {
      type: 'BIND_DEVICE',
      bound: { id: 'b1', name: 'Client-1', method: 'ble', rssi: -55, boundAt: new Date().toISOString(), deviceId: 'ble-1' },
    });
    expect(state.boundDevices.length).toBe(1);
    expect(state.devices[0].bound).toBe(true);
    // Doppelbindung derselben ID wird ignoriert
    state = appReducer(state, {
      type: 'BIND_DEVICE',
      bound: { id: 'b1', name: 'Client-1', method: 'ble', rssi: -55, boundAt: new Date().toISOString() },
    });
    expect(state.boundDevices.length).toBe(1);
    state = appReducer(state, { type: 'UNBIND_DEVICE', id: 'b1' });
    expect(state.boundDevices.length).toBe(0);
    expect(state.devices[0].bound).toBe(false);
  });

  it('SET_SETTINGS validiert Werte (Clamping wirkt)', () => {
    let state = makeInitialState();
    state = appReducer(state, { type: 'SET_SETTINGS', settings: { scanIntervalMs: 1 } });
    expect(state.settings.scanIntervalMs).toBe(250);
  });

  it('Replay-Punkte: SET ersetzt, ADD hängt an und begrenzt auf 5000', () => {
    let state = makeInitialState();
    state = appReducer(state, { type: 'SET_REPLAY_POINTS', points: [{ t: 1, freqMHz: 2412, rssi: -60, amp: 0.5 }] });
    expect(state.replayPoints.length).toBe(1);
    state = appReducer(state, { type: 'ADD_REPLAY_POINT', point: { t: 2, freqMHz: 2412, rssi: -61, amp: 0.4 } });
    expect(state.replayPoints.length).toBe(2);
    expect(state.replayPoints[1].rssi).toBe(-61);
  });

  it('Scan-Zustand: START → STOP → ERROR', () => {
    let state = makeInitialState();
    state = appReducer(state, { type: 'SCAN_START', source: 'ble' });
    expect(state.scan.running).toBe(true);
    expect(state.scan.source).toBe('ble');
    state = appReducer(state, { type: 'SCAN_ERROR', error: 'Adapter kaputt' });
    expect(state.scan.running).toBe(false);
    expect(state.scan.error).toBe('Adapter kaputt');
    state = appReducer(state, { type: 'SCAN_STOP' });
    expect(state.scan.error).toBe('Adapter kaputt'); // Fehler bleibt bis Neustart
    state = appReducer(state, { type: 'SCAN_START', source: 'demo' });
    expect(state.scan.error).toBeNull();
  });

  it('Logs: ADD hängt an (max. 400), CLEAR leert', () => {
    let state = makeInitialState();
    for (let i = 0; i < 405; i++) {
      state = appReducer(state, { type: 'ADD_LOG', level: 'info', msg: `m${i}` });
    }
    expect(state.logs.length).toBe(400);
    expect(state.logs[399].msg).toBe('m404');
    state = appReducer(state, { type: 'CLEAR_LOGS' });
    expect(state.logs.length).toBe(0);
  });
});

describe('makeInitialState', () => {
  it('liefert Defaults und leere Listen', () => {
    const s: AppState = makeInitialState();
    expect(s.devices).toEqual([]);
    expect(s.replayPoints).toEqual([]);
    expect(s.logs).toEqual([]);
    expect(s.scan.running).toBe(false);
    expect(s.settings.defaultMode).toBe('ble');
  });
});
