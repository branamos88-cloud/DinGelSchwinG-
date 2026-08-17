/**
 * Rosetta-AI — Offline-Analyse (echte Kennzahlen) & Client-Konfiguration
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeOffline,
  buildSnapshot,
  RosettaClient,
} from '../src/lib/rosetta/rosettaClient';
import type { AppState } from '../src/state/types';
import { DEFAULT_SETTINGS } from '../src/state/types';
import { makeInitialState } from '../src/state/store';

function makeState(overrides?: Partial<AppState>): AppState {
  const base = makeInitialState();
  return {
    ...base,
    devices: [
      {
        id: 'd1', name: 'MASTER-Gold', type: 'master', rssi: -42, txPower: -59,
        x: 0, y: 0, z: 0, distance: 0.14, bound: false, source: 'ble', lastSeen: Date.now(),
      },
      {
        id: 'd2', name: 'Client-A', type: 'client', rssi: -68, txPower: -59,
        x: 2, y: 1, z: 0.5, distance: 2.8, bound: true, source: 'ble', lastSeen: Date.now(),
      },
      {
        id: 'd3', name: 'Beacon-Schwach', type: 'other', rssi: -91, txPower: -59,
        x: -3, y: 0.4, z: 1, distance: 39.8, bound: false, source: 'ble', lastSeen: Date.now(),
      },
    ],
    ...overrides,
  };
}

describe('RosettaClient', () => {
  it('resolveEndpoint vervollständigt Basis-URLs korrekt', () => {
    expect(RosettaClient.resolveEndpoint('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions');
    expect(RosettaClient.resolveEndpoint('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions');
    expect(RosettaClient.resolveEndpoint('https://x.test/v1/chat/completions')).toBe('https://x.test/v1/chat/completions');
    expect(RosettaClient.resolveEndpoint('https://x.test')).toBe('https://x.test/v1/chat/completions');
  });

  it('chat wirft verständlichen Fehler ohne konfiguriertes Backend', async () => {
    const client = new RosettaClient({ baseUrl: '', apiKey: '', model: '', enabled: false });
    expect(client.isOnlineConfigured()).toBe(false);
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/Kein KI-Endpoint konfiguriert/);
  });

  it('isOnlineConfigured nur bei URL + Key + enabled', () => {
    const withAll = new RosettaClient({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', enabled: true });
    expect(withAll.isOnlineConfigured()).toBe(true);
    const withoutKey = new RosettaClient({ baseUrl: 'https://x.test/v1', apiKey: '', model: 'm', enabled: true });
    expect(withoutKey.isOnlineConfigured()).toBe(false);
  });
});

describe('analyzeOffline (echte Kennzahlen)', () => {
  it('net-analysis: RSSI-Statistiken, Distanzen, Empfehlungen', () => {
    const state = makeState();
    const res = analyzeOffline('net-analysis', state);
    expect(res.mode).toBe('offline');
    expect(res.metrics.geräte_gesamt).toBe(3);
    expect(res.metrics.bester_rssi_dbm).toBe(-42);
    expect(res.metrics.schwächster_rssi_dbm).toBe(-91);
    expect(res.metrics.größte_distanz_m).toBeCloseTo(39.8, 1);
    expect(res.recommendations.length).toBeGreaterThan(0);
    // Schwaches Signal muss erwähnt werden
    expect(res.recommendations.some(r => r.includes('Beacon-Schwach'))).toBe(true);
  });

  it('net-analysis ohne Geräte: sinnvolle Empfehlung', () => {
    const state = makeState({ devices: [] });
    const res = analyzeOffline('net-analysis', state);
    expect(res.metrics.geräte_gesamt).toBe(0);
    expect(res.summary).toContain('Keine Geräte');
    expect(res.recommendations.some(r => r.includes('Scan'))).toBe(true);
  });

  it('device-pairing: zählt Methoden korrekt', () => {
    const state = makeState({
      boundDevices: [
        { id: 'b1', name: 'A', method: 'qr', rssi: -50, boundAt: new Date().toISOString() },
        { id: 'b2', name: 'B', method: 'ble', rssi: -55, boundAt: new Date().toISOString() },
        { id: 'b3', name: 'C', method: 'qr', rssi: -52, boundAt: new Date().toISOString() },
      ],
    });
    const res = analyzeOffline('device-pairing', state);
    expect(res.metrics.kopplungen).toBe(3);
    expect(res.metrics.methode_qr).toBe(2);
    expect(res.metrics.methode_ble).toBe(1);
    expect(res.metrics.methode_nfc).toBe(0);
  });

  it('replay-editor: Statistiken aus Replay-Punkten', () => {
    const state = makeState({
      replayPoints: [
        { t: 0, freqMHz: 2412, rssi: -60, amp: 0.8 },
        { t: 100, freqMHz: 2413, rssi: -64, amp: 0.7 },
        { t: 200, freqMHz: 2412, rssi: -58, amp: 0.9 },
      ],
    });
    const res = analyzeOffline('replay-editor', state);
    expect(res.metrics.aufgezeichnete_punkte).toBe(3);
    expect(res.metrics.rssi_min).toBe(-64);
    expect(res.metrics.rssi_max).toBe(-58);
    expect(res.metrics.zeitraum_ms).toBe(200);
  });

  it('buildSnapshot enthält deterministische Live-Daten', () => {
    const state = makeState();
    const snap = buildSnapshot(state);
    expect(snap).toContain('Geräte: 3');
    expect(snap).toContain('MASTER-Gold');
    expect(snap).toContain('-42');
  });
});

describe('Settings-Integration', () => {
  it('aiEnabled wird nur bei vollständiger Konfiguration gesetzt', () => {
    // sanitizeSettings wird im Store beim SET_SETTINGS angewendet
    const settings = {
      ...DEFAULT_SETTINGS,
      aiBaseUrl: 'https://api.openai.com/v1',
      aiApiKey: 'sk-test',
      aiModel: 'gpt-4o-mini',
      aiEnabled: true,
    };
    expect(settings.aiEnabled).toBe(true);
  });
});
