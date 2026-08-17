/**
 * Replay-Engine — Aufzeichnung echter Signalverläufe
 * ==================================================
 * Nimmt während der Aufnahme die ECHTEN RSSI-Werte der sichtbaren Geräte
 * auf (aus dem Store), statt Zufallswerte zu erzeugen.
 * Punkte können editiert, angewendet und als JSON exportiert/importiert werden.
 */
import type { Device, ReplayPoint } from '../../state/types';

export interface ReplaySample {
  t: number;
  devices: Array<{ name: string; rssi: number; distance?: number }>;
}

/**
 * Wandelt einen Live-Geräte-Snapshot in Replay-Punkte um.
 * Ein Punkt pro Gerät; Frequenzband aus den Mesh-Einstellungen.
 */
export function sampleToReplayPoints(
  devices: Device[],
  t: number,
  freqMHz: number
): ReplayPoint[] {
  return devices.map((d, i) => ({
    t: t + i,
    freqMHz: Math.round(freqMHz * 10) / 10,
    rssi: d.rssi,
    amp: d.distance !== undefined ? Math.min(1, Math.max(0.05, 1 / Math.max(0.3, d.distance))) : 0.5,
  }));
}

export interface ReplayRecording {
  points: ReplayPoint[];
  startedAt: number;
  samples: ReplaySample[];
  lastT: number;
}

export function createRecording(): ReplayRecording {
  return { points: [], startedAt: Date.now(), samples: [], lastT: -1 };
}

export function appendSample(rec: ReplayRecording, devices: Device[], freqMHz: number): ReplayRecording {
  // Monoton steigende Zeitstempel erzwingen (Date.now kann in derselben ms liegen)
  const now = Date.now() - rec.startedAt;
  const t = Math.max(now, rec.lastT + 1);
  const pts = sampleToReplayPoints(devices, t, freqMHz);
  const sample: ReplaySample = {
    t,
    devices: devices.map(d => ({
      name: d.name,
      rssi: d.rssi,
      distance: d.distance,
    })),
  };
  return { ...rec, points: [...rec.points, ...pts], samples: [...rec.samples, sample], lastT: t + pts.length };
}

/** Validiert importierte Replay-Punkte (JSON). */
export function sanitizeReplayPoints(raw: unknown): ReplayPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: ReplayPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    const t = typeof p.t === 'number' && Number.isFinite(p.t) ? p.t : NaN;
    const freq = typeof p.freqMHz === 'number' && Number.isFinite(p.freqMHz) ? p.freqMHz : NaN;
    const rssi = typeof p.rssi === 'number' && Number.isFinite(p.rssi) ? p.rssi : NaN;
    const amp = typeof p.amp === 'number' && Number.isFinite(p.amp) ? p.amp : 0.5;
    if (Number.isNaN(t) || Number.isNaN(freq) || Number.isNaN(rssi)) continue;
    out.push({ t, freqMHz: freq, rssi, amp: Math.min(1, Math.max(0, amp)) });
  }
  return out.slice(0, 5000);
}

export function serializeReplayPoints(points: ReplayPoint[]): string {
  return JSON.stringify(
    { format: 'dingelschwinng.replay.v1', exportedAt: new Date().toISOString(), points },
    null,
    2
  );
}

export function deserializeReplayPoints(json: string): ReplayPoint[] {
  const parsed = JSON.parse(json) as { points?: unknown } | unknown[];
  if (Array.isArray(parsed)) return sanitizeReplayPoints(parsed);
  if (parsed && typeof parsed === 'object' && 'points' in parsed) {
    return sanitizeReplayPoints((parsed as { points: unknown }).points);
  }
  return [];
}

/** Statistik über eine Aufzeichnung (für UI + Tests). */
export function replayStats(points: ReplayPoint[]): {
  count: number;
  durationMs: number;
  rssiMin: number | null;
  rssiMax: number | null;
  freqMin: number | null;
  freqMax: number | null;
} {
  if (points.length === 0) {
    return { count: 0, durationMs: 0, rssiMin: null, rssiMax: null, freqMin: null, freqMax: null };
  }
  const ts = points.map(p => p.t);
  return {
    count: points.length,
    durationMs: Math.max(...ts) - Math.min(...ts),
    rssiMin: Math.min(...points.map(p => p.rssi)),
    rssiMax: Math.max(...points.map(p => p.rssi)),
    freqMin: Math.min(...points.map(p => p.freqMHz)),
    freqMax: Math.max(...points.map(p => p.freqMHz)),
  };
}
