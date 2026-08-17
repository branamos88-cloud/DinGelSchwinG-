/**
 * Einstellungen — Validierung, Clamping & Persistenz
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadBoundDevices,
  loadSettings,
  sanitizeSettings,
  saveBoundDevices,
  saveSettings,
  StorageLike,
} from '../src/state/settings';
import { DEFAULT_SETTINGS } from '../src/state/types';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('sanitizeSettings', () => {
  it('klemmt numerische Werte in gültige Bereiche', () => {
    const s = sanitizeSettings({
      scanIntervalMs: 10,          // zu klein
      bleEnvFactor: 99,            // zu groß
      bleTxPower: -999,            // zu klein
      meshFreqStart: 99999,        // zu groß
    });
    expect(s.scanIntervalMs).toBe(250);
    expect(s.bleEnvFactor).toBe(6.0);
    expect(s.bleTxPower).toBe(-90);
    expect(s.meshFreqStart).toBe(6000);
  });

  it('erzwingt meshFreqStart < meshFreqEnd', () => {
    const s = sanitizeSettings({ meshFreqStart: 2500, meshFreqEnd: 2400 });
    expect(s.meshFreqEnd).toBeGreaterThan(s.meshFreqStart);
  });

  it('aktiviert KI nur bei vollständiger Konfiguration', () => {
    const s = sanitizeSettings({ aiBaseUrl: 'https://x/v1', aiApiKey: 'k', aiModel: 'm', aiEnabled: true });
    expect(s.aiEnabled).toBe(true);
    const s2 = sanitizeSettings({ aiBaseUrl: 'https://x/v1', aiApiKey: '', aiEnabled: true });
    expect(s2.aiEnabled).toBe(false);
  });

  it('filtert leere Diagnose-Ziele', () => {
    const s = sanitizeSettings({ diagTargets: ['  https://a.test ', '', '   '] });
    expect(s.diagTargets).toEqual(['https://a.test']);
  });

  it('normalisiert Pairing-Methoden zu Booleans', () => {
    const s = sanitizeSettings({ pairingMethods: { qr: true, ble: false, nfc: true, wifi: false } });
    expect(s.pairingMethods).toEqual({ qr: true, ble: false, nfc: true, wifi: false });
  });
});

describe('Persistenz', () => {
  it('Roundtrip: speichern und laden', () => {
    const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, bleEnvFactor: 3.2, scanIntervalMs: 5000 });
    expect(saveSettings(settings, storage)).toBe(true);
    const loaded = loadSettings(storage);
    expect(loaded.bleEnvFactor).toBe(3.2);
    expect(loaded.scanIntervalMs).toBe(5000);
  });

  it('liefert Defaults bei kaputtem Speicherinhalt', () => {
    storage.setItem('dingelschwinng.settings.v1', '{kaputt');
    const loaded = loadSettings(storage);
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it('liefert Defaults ohne gespeicherte Werte', () => {
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('Bound-Devices Roundtrip', () => {
    const devices = [
      { id: 'b1', name: 'A', method: 'qr' as const, rssi: -50, boundAt: '2026-01-01T00:00:00Z' },
      { id: 'b2', name: 'B', method: 'ble' as const, rssi: -55, boundAt: '2026-01-01T00:01:00Z' },
    ];
    expect(saveBoundDevices(devices, storage)).toBe(true);
    const loaded = loadBoundDevices(storage);
    expect(loaded.length).toBe(2);
    expect(loaded[0].name).toBe('A');
  });

  it('filtert ungültige Bound-Devices beim Laden', () => {
    storage.setItem('dingelschwinng.bound.v1', JSON.stringify([
      { id: 'ok', name: 'A', method: 'qr', rssi: -50, boundAt: '' },
      { id: 'bad', name: 'B', method: 'invalid', rssi: -50, boundAt: '' },
      'not-an-object',
    ]));
    const loaded = loadBoundDevices(storage);
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('ok');
  });
});
