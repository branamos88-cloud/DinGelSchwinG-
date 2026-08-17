/**
 * Geräte-Positionierung & Klassifizierung
 */
import { describe, it, expect } from 'vitest';
import {
  classifyDevice,
  hashAngle,
  positionFromDistance,
} from '../src/state/devicePosition';

describe('hashAngle', () => {
  it('ist deterministisch und im Bereich [0, 2π)', () => {
    for (const seed of ['a', 'b', 'MASTER-Gold', 'ble:AA:BB']) {
      const a1 = hashAngle(seed);
      const a2 = hashAngle(seed);
      expect(a1).toBe(a2);
      expect(a1).toBeGreaterThanOrEqual(0);
      expect(a1).toBeLessThan(Math.PI * 2);
    }
  });
});

describe('positionFromDistance', () => {
  it('ohne Sensoren: Position auf Kugel mit korrektem Radius', () => {
    const pos = positionFromDistance(10, 'seed1', null);
    const radius = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(radius).toBeCloseTo(10, 6);
  });

  it('mit Sensoren: alpha/beta verändern die Position deterministisch', () => {
    const without = positionFromDistance(5, 'seed', null);
    const withSensors = positionFromDistance(5, 'seed', { alpha: 90, beta: 20, gamma: 0 });
    expect(withSensors.x).not.toBeCloseTo(without.x, 6);
  });

  it('Distanz wird nie kleiner als 0.05 m', () => {
    const pos = positionFromDistance(0.001, 'x', null);
    const radius = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(radius).toBeCloseTo(0.05, 6);
  });
});

describe('classifyDevice', () => {
  it('erkennt Master, Client, Target und Sonstige', () => {
    expect(classifyDevice('MASTER-Gold')).toBe('master');
    expect(classifyDevice('Gateway-X')).toBe('master');
    expect(classifyDevice('Client-A')).toBe('client');
    expect(classifyDevice('Sensor-Node-3')).toBe('client');
    expect(classifyDevice('Target-7')).toBe('target');
    expect(classifyDevice('Tag-42')).toBe('target');
    expect(classifyDevice('Unbekanntes-Gerät')).toBe('other');
  });

  it('berücksichtigt auch die Adresse', () => {
    expect(classifyDevice('', 'AA:BB:CC:DD:EE:FF')).toBe('other');
  });
});
