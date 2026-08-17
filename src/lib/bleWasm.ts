/**
 * BLE-Distanz-WASM-Integration
 * ===========================
 * Lädt das echte WebAssembly-Modul aus public/wasm/ble_distance.wasm
 * (kompiliert aus src/lib/wasm/bleDistance.wat — Semantik identisch zu
 * wasm-ble/src/lib.rs). Enthält einen Notfall-Fallback in reinem JS,
 * der nur greift, wenn das .wasm nicht geladen werden kann (z. B.
 * Offline-Betrieb ohne Asset-Pipeline).
 */

export interface BLEWasmExports {
  calculate_distance(rssi: number, tx_power: number): number;
  calculate_distance_env(rssi: number, tx_power: number, n: number): number;
  calc_exact_distance(rssi: number, tx_power: number, rssi_ref: number, dist_ref: number): number;
  batch_distances(rssi_array: Float64Array, tx_power: number): Float64Array;
  learn_from_feedback(rssi_ref: number, dist_ref: number, rssi_new: number, dist_new: number): number;
  get_learned_n(): number;
}

interface RawWasmExports {
  calculate_distance(rssi: number, tx_power: number): number;
  calculate_distance_env(rssi: number, tx_power: number, n: number): number;
  calc_exact_distance(rssi: number, tx_power: number, rssi_ref: number, dist_ref: number): number;
  batch_distances(ptr: number, len: number, tx_power: number, outPtr: number): void;
  learn_from_feedback(rssi_ref: number, dist_ref: number, rssi_new: number, dist_new: number): number;
  get_learned_n(): number;
  memory: WebAssembly.Memory;
}

function pathLoss(rssi: number, txPower: number, n: number): number {
  return Math.pow(10, (txPower - rssi) / (10.0 * n));
}

/** Notfall-Implementierung — mathematisch identisch zum WASM-Modul. */
export const JS_FALLBACK: BLEWasmExports = {
  calculate_distance: (rssi, tx) => pathLoss(rssi, tx, 2.0),
  calculate_distance_env: (rssi, tx, n) => pathLoss(rssi, tx, n),
  calc_exact_distance: (rssi, tx, rssiRef, distRef) => {
    if (Math.abs(rssi - rssiRef) < 0.001) return distRef;
    return pathLoss(rssi, tx, 2.0) * (distRef / pathLoss(rssiRef, tx, 2.0));
  },
  batch_distances: (arr, tx) => {
    const out = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = pathLoss(arr[i], tx, 2.0);
    return out;
  },
  learn_from_feedback: (rssiRef, distRef, rssiNew, distNew) => {
    if (distRef <= 0 || distNew <= 0 || Math.abs(rssiRef - rssiNew) < 0.001) return 2.0;
    const ratio = distNew / distRef;
    if (ratio <= 0) return 2.0;
    const n = (rssiRef - rssiNew) / (10.0 * Math.log10(ratio));
    return Math.max(1.5, Math.min(6.0, n));
  },
  get_learned_n: () => 2.0,
};

let cached: { module: BLEWasmExports; source: 'wasm' | 'js-fallback' } | null = null;

/**
 * Lädt und instanziiert das echte WASM-Modul.
 * Validierung beim Laden: calculate_distance(-65, -59) muss ≈ 2.0 m ergeben.
 */
export async function loadBLEWasm(): Promise<{ module: BLEWasmExports; source: 'wasm' | 'js-fallback' }> {
  if (cached) return cached;
  try {
    const resp = await fetch('/wasm/ble_distance.wasm');
    if (resp.ok) {
      const bytes = await resp.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      const raw = instance.exports as unknown as RawWasmExports;
      if (
        typeof raw.calculate_distance === 'function' &&
        typeof raw.batch_distances === 'function' &&
        raw.memory instanceof WebAssembly.Memory
      ) {
        // Selbsttest: bekannte Eingabe muss ~2.0 m ergeben
        const testVal = raw.calculate_distance(-65, -59);
        if (typeof testVal === 'number' && Number.isFinite(testVal) && Math.abs(testVal - 2.0) < 1.0) {
          const module: BLEWasmExports = {
            calculate_distance: (r, t) => raw.calculate_distance(r, t),
            calculate_distance_env: (r, t, n) => raw.calculate_distance_env(r, t, n),
            calc_exact_distance: (r, t, rr, dr) => raw.calc_exact_distance(r, t, rr, dr),
            batch_distances: (arr, t) => {
              // Speicher im WASM-Modul verwenden (exakte ABI wie in der WAT definiert):
              // Eingabe ab Offset 0, Ausgabe direkt dahinter (8 * len)
              const mem = new Float64Array(raw.memory.buffer);
              const inPtr = 0;
              const outPtr = 8 * arr.length;
              mem.set(arr, inPtr / 8);
              raw.batch_distances(inPtr, arr.length, t, outPtr);
              return new Float64Array(mem.slice(outPtr / 8, outPtr / 8 + arr.length));
            },
            learn_from_feedback: (rr, dr, rn, dn) => raw.learn_from_feedback(rr, dr, rn, dn),
            get_learned_n: () => raw.get_learned_n(),
          };
          cached = { module, source: 'wasm' };
          return cached;
        }
      }
    }
  } catch {
    // Asset nicht ladbar → Fallback unten
  }
  cached = { module: JS_FALLBACK, source: 'js-fallback' };
  return cached;
}

/** Nur für Tests: Cache zurücksetzen. */
export function _resetWasmCache() {
  cached = null;
}
