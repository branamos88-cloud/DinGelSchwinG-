/**
 * Positionsberechnung für Geräte (pure — testbar).
 * Ohne Richtungsmessung: deterministischer Winkel aus der Geräte-Adresse/ID,
 * Abstand aus WASM-Pfadverlust. Mit Sensor-Daten (alpha/beta/gamma) wird die
 * Ausrichtung des Masters berücksichtigt (echte Sensor-Fusion).
 */

export function hashAngle(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360) * (Math.PI / 180);
}

export interface SensorAngles {
  alpha: number | null; // 0..360 (Kompass)
  beta: number | null;  // -180..180 (Neigung)
  gamma: number | null; // -90..90 (Rollen)
}

/**
 * Berechnet kartesische Position (x, y, z) aus Distanz + Geräte-Seed
 * und optionaler Sensor-Ausrichtung des Masters.
 */
export function positionFromDistance(
  distance: number,
  seed: string,
  sensors: SensorAngles | null,
  elevationDeg = 8
): { x: number; y: number; z: number } {
  const d = Math.max(0.05, distance);
  let phi = hashAngle(seed);
  let theta = (90 - elevationDeg) * (Math.PI / 180); // Standardhöhe leicht über Horizont

  if (sensors && sensors.beta !== null && sensors.alpha !== null) {
    // Master-Ausrichtung: alpha = Kompasswinkel, beta = Neigung
    phi += ((sensors.alpha % 360) / 360) * Math.PI * 2;
    theta = ((sensors.beta + 90) / 180) * Math.PI;
  }

  return {
    x: d * Math.sin(theta) * Math.cos(phi),
    y: d * Math.cos(theta),
    z: d * Math.sin(theta) * Math.sin(phi),
  };
}

/** Klassifiziert ein Gerät anhand von Namen/Adresse in Master/Client/Target/Other. */
export function classifyDevice(name: string, address?: string): 'master' | 'client' | 'target' | 'other' {
  const n = (name || '').toUpperCase();
  const a = (address || '').toUpperCase();
  const full = n + ' ' + a;
  if (/\bMASTER\b|\bGATEWAY\b|\bHUB\b|\bZENTRALE\b|\bNEXUS\b/.test(full)) return 'master';
  if (/\bTARGET\b|\bZIEL\b|\bTAG\b|\bTRACKER\b/.test(full)) return 'target';
  if (/\bCLIENT\b|\bNODE\b|\bSENSOR\b|\bDONGLE\b/.test(full)) return 'client';
  return 'other';
}
