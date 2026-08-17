/**
 * WASM-Modul & Loader — End-to-End-Test
 * 1. Echtes .wasm aus public/wasm direkt instanziieren und mathematisch prüfen
 * 2. Loader (loadBLEWasm) mit gemocktem fetch → muss das ECHTE WASM laden
 * 3. Loader ohne fetch → kontrollierter JS-Fallback
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBLEWasm, _resetWasmCache, JS_FALLBACK } from '../src/lib/bleWasm';

const wasmPath = resolve(__dirname, '../public/wasm/ble_distance.wasm');

function refPathLoss(rssi: number, tx: number, n: number): number {
  return Math.pow(10, (tx - rssi) / (10 * n));
}

interface RawExports {
  calculate_distance(r: number, t: number): number;
  calculate_distance_env(r: number, t: number, n: number): number;
  calc_exact_distance(r: number, t: number, rr: number, dr: number): number;
  batch_distances(ptr: number, len: number, tx: number, out: number): void;
  learn_from_feedback(rr: number, dr: number, rn: number, dn: number): number;
  get_learned_n(): number;
  memory: WebAssembly.Memory;
}

async function instantiateRaw(): Promise<RawExports> {
  const bytes = readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance.exports as unknown as RawExports;
}

afterEach(() => {
  _resetWasmCache();
  delete (globalThis as Record<string, unknown>).fetch;
});

describe('WASM-Modul (echte Binärdatei)', () => {
  it('ist vorhanden und instanziierbar', async () => {
    const e = await instantiateRaw();
    expect(typeof e.calculate_distance).toBe('function');
    expect(e.memory).toBeInstanceOf(WebAssembly.Memory);
  });

  it('calculate_distance entspricht Pfadverlustmodell (n=2)', async () => {
    const e = await instantiateRaw();
    for (const tx of [-59, -40, 4]) {
      for (let rssi = -100; rssi <= -20; rssi += 5) {
        const got = e.calculate_distance(rssi, tx);
        const want = refPathLoss(rssi, tx, 2.0);
        expect(Math.abs(got - want) / Math.max(1, Math.abs(want))).toBeLessThan(1e-7);
      }
    }
  });

  it('calculate_distance(-65, -59) ≈ 1.995 m (Selbsttest-Wert)', async () => {
    const e = await instantiateRaw();
    expect(Math.abs(e.calculate_distance(-65, -59) - 1.995262315)).toBeLessThan(1e-4);
  });

  it('calculate_distance_env respektiert n', async () => {
    const e = await instantiateRaw();
    for (const n of [1.5, 2.7, 4.0, 6.0]) {
      const got = e.calculate_distance_env(-70, -59, n);
      expect(Math.abs(got - refPathLoss(-70, -59, n)) / got).toBeLessThan(1e-7);
    }
  });

  it('calc_exact_distance: gleicher RSSI → Referenzdistanz', async () => {
    const e = await instantiateRaw();
    expect(e.calc_exact_distance(-59, -59, -59, 2.5)).toBeCloseTo(2.5, 9);
    const got = e.calc_exact_distance(-70, -59, -59, 2.0);
    const want = refPathLoss(-70, -59, 2) * (2.0 / refPathLoss(-59, -59, 2));
    expect(Math.abs(got - want) / Math.max(1, Math.abs(want))).toBeLessThan(1e-7);
  });

  it('batch_distances schreibt korrekte Ergebnisse in den Modul-Speicher', async () => {
    const e = await instantiateRaw();
    const mem = new Float64Array(e.memory.buffer);
    const inp = [-60, -65, -70, -75];
    const inPtr = 0;
    const outPtr = 8 * inp.length;
    mem.set(inp, inPtr / 8);
    e.batch_distances(inPtr, inp.length, -59, outPtr);
    for (let i = 0; i < inp.length; i++) {
      const want = refPathLoss(inp[i], -59, 2);
      expect(Math.abs(mem[outPtr / 8 + i] - want) / want).toBeLessThan(1e-7);
    }
  });

  it('learn_from_feedback hält echten Modul-Zustand (get_learned_n)', async () => {
    const e = await instantiateRaw();
    expect(e.get_learned_n()).toBeCloseTo(2.0, 9); // Default
    const n1 = e.learn_from_feedback(-59, 2.0, -70, 6.0);
    expect(n1).toBeCloseTo(11 / (10 * Math.log10(3)), 7);
    expect(e.get_learned_n()).toBeCloseTo(n1, 9);
    // Clamping nach oben: n = 65/(10·log10(10)) = 6.5 → begrenzt auf 6.0
    const n2 = e.learn_from_feedback(-20, 1.0, -85, 10.0);
    expect(n2).toBeCloseTo(6.0, 9);
    expect(e.get_learned_n()).toBeCloseTo(6.0, 9);
    // Ungültige Eingabe → 2.0, Zustand unverändert
    const n3 = e.learn_from_feedback(-59, 0, -70, 6.0);
    expect(n3).toBeCloseTo(2.0, 9);
    expect(e.get_learned_n()).toBeCloseTo(6.0, 9);
  });
});

describe('Loader (loadBLEWasm)', () => {
  it('lädt das ECHTE WASM, wenn das Asset verfügbar ist', async () => {
    (globalThis as Record<string, unknown>).fetch = async () =>
      new Response(readFileSync(wasmPath), { status: 200 });
    const res = await loadBLEWasm();
    expect(res.source).toBe('wasm');
    expect(Math.abs(res.module.calculate_distance(-65, -59) - 1.995262315)).toBeLessThan(1e-4);
  });

  it('fällt auf den JS-Fallback zurück, wenn kein Asset ladbar ist', async () => {
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error('network down');
    };
    const res = await loadBLEWasm();
    expect(res.source).toBe('js-fallback');
    expect(res.module).toBe(JS_FALLBACK);
  });

  it('JS-Fallback ist mathematisch identisch zum WASM', async () => {
    (globalThis as Record<string, unknown>).fetch = async () =>
      new Response(readFileSync(wasmPath), { status: 200 });
    const real = (await loadBLEWasm()).module;
    for (const rssi of [-90, -75, -60, -45]) {
      const w = real.calculate_distance(rssi, -59);
      const j = JS_FALLBACK.calculate_distance(rssi, -59);
      expect(Math.abs(w - j) / j).toBeLessThan(1e-6);
      const w2 = real.calculate_distance_env(rssi, -59, 2.7);
      const j2 = JS_FALLBACK.calculate_distance_env(rssi, -59, 2.7);
      expect(Math.abs(w2 - j2) / j2).toBeLessThan(1e-6);
    }
    const batchIn = new Float64Array([-60, -65, -70]);
    const a = real.batch_distances(batchIn, -59);
    const b = JS_FALLBACK.batch_distances(batchIn, -59);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(a[i] - b[i]) / b[i]).toBeLessThan(1e-6);
    }
  });
});
