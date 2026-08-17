/**
 * Replay-Engine — Aufzeichnung echter Daten, Editieren, Export/Import
 */
import { describe, it, expect } from 'vitest';
import {
  appendSample,
  createRecording,
  deserializeReplayPoints,
  replayStats,
  sanitizeReplayPoints,
  sampleToReplayPoints,
  serializeReplayPoints,
} from '../src/lib/replay/replayEngine';
import type { Device } from '../src/state/types';

const devices: Device[] = [
  { id: 'd1', name: 'A', type: 'client', rssi: -60, txPower: -59, x: 1, y: 0, z: 0, distance: 1.1, bound: false, source: 'ble', lastSeen: Date.now() },
  { id: 'd2', name: 'B', type: 'target', rssi: -75, txPower: -59, x: -2, y: 0, z: 1, distance: 5.6, bound: false, source: 'ble', lastSeen: Date.now() },
];

describe('sampleToReplayPoints', () => {
  it('wandelt echte Geräte-Snapshots in Punkte um', () => {
    const pts = sampleToReplayPoints(devices, 500, 2412);
    expect(pts.length).toBe(2);
    expect(pts[0].rssi).toBe(-60);
    expect(pts[1].rssi).toBe(-75);
    expect(pts[0].freqMHz).toBe(2412);
    expect(pts[0].t).toBeGreaterThanOrEqual(500);
  });
});

describe('Aufzeichnung (appendSample)', () => {
  it('sammelt Punkte über mehrere Samples', () => {
    let rec = createRecording();
    rec = appendSample(rec, devices, 2412);
    rec = appendSample(rec, devices, 2412);
    expect(rec.points.length).toBe(4);
    expect(rec.samples.length).toBe(2);
    // Zeitstempel monoton steigend
    const ts = rec.points.map(p => p.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });
});

describe('Export/Import (JSON)', () => {
  it('Roundtrip erhält alle Punkte', () => {
    const points = sampleToReplayPoints(devices, 0, 2437);
    const json = serializeReplayPoints(points);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('dingelschwinng.replay.v1');
    const back = deserializeReplayPoints(json);
    expect(back.length).toBe(points.length);
    for (let i = 0; i < points.length; i++) {
      expect(back[i].rssi).toBe(points[i].rssi);
      expect(back[i].freqMHz).toBe(points[i].freqMHz);
    }
  });

  it('akzeptiert auch rohe Arrays', () => {
    const back = deserializeReplayPoints(JSON.stringify([{ t: 1, freqMHz: 2400, rssi: -50, amp: 0.5 }]));
    expect(back.length).toBe(1);
    expect(back[0].rssi).toBe(-50);
  });

  it('filtert ungültige Einträge (sanitize)', () => {
    const clean = sanitizeReplayPoints([
      { t: 1, freqMHz: 2400, rssi: -50, amp: 0.5 },
      { t: 'bad', freqMHz: 2400, rssi: -50 },
      null,
      { t: 2, freqMHz: -999, rssi: 'x' },
      { t: 3, freqMHz: 2450, rssi: -70, amp: 99 }, // amp geklemmt
    ]);
    expect(clean.length).toBe(2);
    expect(clean[1].amp).toBe(1); // geklemmt auf 1
  });

  it('wirft bei kaputtem JSON', () => {
    expect(() => deserializeReplayPoints('{kaputt')).toThrow();
  });
});

describe('replayStats', () => {
  it('berechnet Statistik korrekt', () => {
    const stats = replayStats([
      { t: 0, freqMHz: 2412, rssi: -60, amp: 1 },
      { t: 150, freqMHz: 2437, rssi: -70, amp: 0.5 },
    ]);
    expect(stats.count).toBe(2);
    expect(stats.durationMs).toBe(150);
    expect(stats.rssiMin).toBe(-70);
    expect(stats.rssiMax).toBe(-60);
    expect(stats.freqMin).toBe(2412);
    expect(stats.freqMax).toBe(2437);
  });

  it('liefert Nullwerte für leere Liste', () => {
    const stats = replayStats([]);
    expect(stats.count).toBe(0);
    expect(stats.rssiMin).toBeNull();
  });
});
