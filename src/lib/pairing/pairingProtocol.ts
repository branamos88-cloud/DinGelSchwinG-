/**
 * Kopplungs-Protokoll — Validierung & Bindung (pure, testbar)
 * ============================================================
 * Unterstützt drei QR-Payload-Formate:
 *   1. dingelschwinng://bind?id=…&name=…&key=…
 *   2. JSON: { "dingelschwinng": true, "id": …, "name": …, "key": … }
 *   3. Freitext (z. B. MAC/Seriennummer) — akzeptiert mit Warnung
 */
import type { BoundDevice, PairMethod } from '../../state/types';

export interface ValidatedPayload {
  valid: boolean;
  deviceId?: string;
  name?: string;
  key?: string;
  note?: string;
}

const PROTO_PREFIX = 'dingelschwinng://bind';

export function validatePairPayload(payload: string): ValidatedPayload {
  const raw = (payload || '').trim();
  if (!raw) return { valid: false, note: 'Leerer QR-Inhalt' };

  // Format 1: dingelschwinng://bind?…
  if (raw.startsWith(PROTO_PREFIX)) {
    try {
      const url = new URL(raw);
      const id = url.searchParams.get('id') || '';
      const name = url.searchParams.get('name') || '';
      const key = url.searchParams.get('key') || '';
      if (!id) return { valid: false, note: 'Protokoll-URL ohne Geräte-ID' };
      return { valid: true, deviceId: id.slice(0, 64), name: name.slice(0, 64) || undefined, key: key.slice(0, 64) || undefined };
    } catch {
      return { valid: false, note: 'Ungültige Protokoll-URL' };
    }
  }

  // Format 2: JSON-Objekt
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if (obj && typeof obj === 'object' && (obj.dingelschwinng === true || obj.kind === 'dingelschwinng.bind')) {
        const id = typeof obj.id === 'string' ? obj.id : '';
        if (!id) return { valid: false, note: 'JSON ohne Geräte-ID' };
        return {
          valid: true,
          deviceId: id.slice(0, 64),
          name: typeof obj.name === 'string' ? obj.name.slice(0, 64) : undefined,
          key: typeof obj.key === 'string' ? obj.key.slice(0, 64) : undefined,
        };
      }
    } catch {
      // kein gültiges JSON → Freitext
    }
  }

  // Format 3: Freitext (MAC/Seriennummer)
  if (/^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/.test(raw)) {
    return { valid: true, deviceId: `mac:${raw.toUpperCase()}`, note: 'MAC-Adresse erkannt' };
  }
  if (raw.length >= 3 && raw.length <= 64) {
    return { valid: true, deviceId: `text:${raw}`, note: 'Freitext-Token akzeptiert (ohne kryptografische Prüfung)' };
  }
  return { valid: false, note: 'Inhalt zu lang oder leer' };
}

export interface BindRequest {
  payload: string;
  method: PairMethod;
  rssi?: number;
  name?: string;
  deviceId?: string;
}

/** Erzeugt ein BoundDevice aus einem validierten Kopplungsereignis. */
export function createBinding(req: BindRequest): BoundDevice | null {
  const validated = validatePairPayload(req.payload);
  if (!validated.valid) return null;
  const now = new Date();
  return {
    id: `bound-${req.method}-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    name: req.name || validated.name || `${req.method.toUpperCase()}-Client-${(validated.deviceId || '?').slice(-6)}`,
    method: req.method,
    rssi: req.rssi ?? -60,
    boundAt: now.toISOString(),
    deviceId: validated.deviceId,
    payload: req.payload.slice(0, 200),
  };
}

/** Erzeugt einen QR-Payload zum Koppeln eines Clients mit diesem Master. */
export function buildMasterPairPayload(masterId: string, masterName: string): string {
  const key = Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  return `dingelschwinng://bind?id=${encodeURIComponent(masterId)}&name=${encodeURIComponent(masterName)}&key=${key}`;
}
