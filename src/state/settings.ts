/**
 * Einstellungs-Validierung & Persistenz (pure Funktionen — testbar)
 */
import { AppSettings, DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'dingelschwinng.settings.v1';
const BOUND_KEY = 'dingelschwinng.bound.v1';

const CLAMPS: Record<string, [number, number]> = {
  scanIntervalMs: [250, 30000],
  bleTxPower: [-90, 10],
  bleEnvFactor: [1.0, 6.0],
  sensorTimeoutMs: [100, 30000],
  meshIntervalMs: [250, 30000],
  meshFreqStart: [2300, 6000],
  meshFreqEnd: [2300, 6000],
  wasmCalibrationRssiRef: [-120, 0],
  wasmCalibrationDistRef: [0.05, 1000],
};

function clampNum(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** Validiert ein Partial-Settings-Objekt und erzwingt realistische Grenzen. */
export function sanitizeSettings(partial: Partial<AppSettings>, base: AppSettings = DEFAULT_SETTINGS): AppSettings {
  const merged: AppSettings = { ...base, ...partial };
  const out: AppSettings = { ...merged };
  for (const [key, [lo, hi]] of Object.entries(CLAMPS)) {
    (out as unknown as Record<string, number>)[key] = clampNum(
      (merged as unknown as Record<string, number>)[key], lo, hi
    );
  }
  // meshFreqStart darf nie >= meshFreqEnd sein
  if (out.meshFreqStart >= out.meshFreqEnd) {
    out.meshFreqEnd = out.meshFreqStart + 10;
  }
  // Pairing-Methoden: immer als Objekt mit Booleans
  out.pairingMethods = {
    qr: !!merged.pairingMethods?.qr,
    ble: !!merged.pairingMethods?.ble,
    nfc: !!merged.pairingMethods?.nfc,
    wifi: !!merged.pairingMethods?.wifi,
  };
  // Textfelder
  out.aiBaseUrl = typeof merged.aiBaseUrl === 'string' ? merged.aiBaseUrl.trim() : '';
  out.aiApiKey = typeof merged.aiApiKey === 'string' ? merged.aiApiKey.trim() : '';
  out.aiModel = typeof merged.aiModel === 'string' ? merged.aiModel.trim() : '';
  out.aiEnabled = !!merged.aiEnabled && out.aiBaseUrl.length > 0 && out.aiApiKey.length > 0;
  out.demoMode = !!merged.demoMode;
  if (Array.isArray(merged.diagTargets)) {
    out.diagTargets = merged.diagTargets.map(t => String(t).trim()).filter(t => t.length > 0).slice(0, 12);
  }
  return out;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Lädt gespeicherte Einstellungen (valide Werte erzwingen, sonst Defaults). */
export function loadSettings(storage: StorageLike | null = defaultStorage()): AppSettings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      if (parsed && typeof parsed === 'object') {
        return sanitizeSettings(parsed, DEFAULT_SETTINGS);
      }
    }
  } catch {
    // defekter Speicher → Defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings, DEFAULT_SETTINGS)));
    return true;
  } catch {
    return false;
  }
}

/** Lädt gespeicherte gebundene Geräte (QR/BLE/NFC/WiFi-Kopplungen). */
export function loadBoundDevices(storage: StorageLike | null = defaultStorage()): import('./types').BoundDevice[] {
  try {
    const raw = storage?.getItem(BOUND_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (d): d is import('./types').BoundDevice =>
            d && typeof d.id === 'string' && typeof d.name === 'string' &&
            ['qr', 'ble', 'nfc', 'wifi'].includes(d.method)
        );
      }
    }
  } catch {
    // ignorieren
  }
  return [];
}

export function saveBoundDevices(devices: import('./types').BoundDevice[], storage: StorageLike | null = defaultStorage()): boolean {
  try {
    storage?.setItem(BOUND_KEY, JSON.stringify(devices.slice(0, 200)));
    return true;
  } catch {
    return false;
  }
}
