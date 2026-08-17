/**
 * Kopplungs-Protokoll — Validierung & Bindung
 */
import { describe, it, expect } from 'vitest';
import {
  buildMasterPairPayload,
  createBinding,
  validatePairPayload,
} from '../src/lib/pairing/pairingProtocol';

describe('validatePairPayload', () => {
  it('akzeptiert dingelschwinng:// Protokoll-URLs', () => {
    const res = validatePairPayload('dingelschwinng://bind?id=dev-123&name=ClientA&key=abc');
    expect(res.valid).toBe(true);
    expect(res.deviceId).toBe('dev-123');
    expect(res.name).toBe('ClientA');
    expect(res.key).toBe('abc');
  });

  it('lehnt Protokoll-URL ohne ID ab', () => {
    const res = validatePairPayload('dingelschwinng://bind?name=ClientA');
    expect(res.valid).toBe(false);
  });

  it('akzeptiert JSON-Objekte mit dingelschwinng-Marker', () => {
    const res = validatePairPayload(JSON.stringify({ dingelschwinng: true, id: 'j1', name: 'JsonClient' }));
    expect(res.valid).toBe(true);
    expect(res.deviceId).toBe('j1');
  });

  it('erkennt MAC-Adressen', () => {
    const res = validatePairPayload('AA:BB:CC:DD:EE:FF');
    expect(res.valid).toBe(true);
    expect(res.deviceId).toBe('mac:AA:BB:CC:DD:EE:FF');
  });

  it('akzeptiert kurzen Freitext mit Hinweis', () => {
    const res = validatePairPayload('SN-4711');
    expect(res.valid).toBe(true);
    expect(res.note).toContain('Freitext');
  });

  it('lehnt leere und zu lange Inhalte ab', () => {
    expect(validatePairPayload('').valid).toBe(false);
    expect(validatePairPayload('x'.repeat(100)).valid).toBe(false);
  });
});

describe('createBinding', () => {
  it('erzeugt gültiges BoundDevice aus QR-Payload', () => {
    const bound = createBinding({
      payload: 'dingelschwinng://bind?id=b1&name=TestClient&key=k',
      method: 'qr',
      rssi: -58,
    });
    expect(bound).not.toBeNull();
    expect(bound!.method).toBe('qr');
    expect(bound!.name).toBe('TestClient');
    expect(bound!.rssi).toBe(-58);
    expect(bound!.deviceId).toBe('b1');
  });

  it('liefert null bei ungültigem Payload', () => {
    expect(createBinding({ payload: '', method: 'qr' })).toBeNull();
  });

  it('BLE-Bindung übernimmt Namen und RSSI', () => {
    const bound = createBinding({
      payload: 'dingelschwinng://bind?id=ble1&name=X',
      method: 'ble',
      name: 'BLE-Client-7',
      rssi: -62,
    });
    expect(bound!.name).toBe('BLE-Client-7');
    expect(bound!.rssi).toBe(-62);
  });
});

describe('buildMasterPairPayload', () => {
  it('erzeugt gültige Protokoll-URLs, die wieder validiert werden können', () => {
    const payload = buildMasterPairPayload('master-1', 'MASTER-Gold');
    expect(payload.startsWith('dingelschwinng://bind?')).toBe(true);
    const res = validatePairPayload(payload);
    expect(res.valid).toBe(true);
    expect(res.deviceId).toBe('master-1');
  });
});
