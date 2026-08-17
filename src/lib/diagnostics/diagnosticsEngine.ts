/**
 * Diagnose-Engine — echte Netzwerk-Messungen
 * ==========================================
 * - Latenz: mehrfache HTTP-Roundtrips (Timing via performance.now + AbortController)
 * - Download: echter Datentransfer von einem CDN (speed.cloudflare.com, CORS-fähig)
 * - Durchsatz: WebSocket-Echo (Payload wird gesendet und gezählt zurückgegeben)
 *
 * Hinweis: In Web-Apps/WebViews existiert kein ICMP-Ping. HTTP-Timing ist der
 * korrekte, standardisierte Weg, die Latenz zum Ziel zu messen.
 */

export interface LatencySample {
  attempt: number;
  latencyMs: number;
}

export interface LatencyResult {
  target: string;
  status: 'ok' | 'fail';
  samples: LatencySample[];
  minMs: number | null;
  avgMs: number | null;
  maxMs: number | null;
  error?: string;
}

export interface DownloadResult {
  status: 'ok' | 'fail';
  bytes: number;
  durationMs: number;
  mbps: number | null;
  error?: string;
}

export interface ThroughputResult {
  status: 'ok' | 'fail';
  bytesSent: number;
  bytesEchoed: number;
  durationMs: number;
  mbps: number | null;
  error?: string;
}

const DEFAULT_SAMPLE_COUNT = 3;
const DEFAULT_TIMEOUT_MS = 5000;

export interface FetchLike {
  (input: string, init?: { method?: string; mode?: RequestMode; cache?: RequestCache; signal?: AbortSignal }): Promise<{ ok: boolean }>;
}

/**
 * Latenzmessung: n HTTP-Roundtrips zum Ziel (HEAD, no-store).
 * Liefert min/avg/max in Millisekunden.
 */
export async function measureLatency(
  target: string,
  fetchFn: FetchLike = (...args) => fetch(...args),
  samples: number = DEFAULT_SAMPLE_COUNT,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<LatencyResult> {
  const result: LatencyResult = { target, status: 'ok', samples: [], minMs: null, avgMs: null, maxMs: null };
  try {
    for (let i = 1; i <= samples; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const start = performance.now();
      try {
        await fetchFn(target, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller.signal });
        const latencyMs = Math.round((performance.now() - start) * 10) / 10;
        result.samples.push({ attempt: i, latencyMs });
      } finally {
        clearTimeout(timer);
      }
    }
    if (result.samples.length === 0) throw new Error('Keine Antwort erhalten');
    const vals = result.samples.map(s => s.latencyMs);
    result.minMs = Math.min(...vals);
    result.avgMs = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    result.maxMs = Math.max(...vals);
  } catch (e) {
    result.status = 'fail';
    result.error = errToMessage(e);
  }
  return result;
}

/** Robuste Fehlertext-Extraktion (Realm-sicher, z. B. jsdom DOMException). */
function errToMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'AbortError') return 'Zeitüberschreitung';
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Download-Speedtest: echte Daten vom CDN laden und Bandbreite berechnen. */
export async function measureDownload(
  bytes = 10 * 1024 * 1024,
  fetchFn: FetchLike = (...args) => fetch(...args),
  timeoutMs = 15000
): Promise<DownloadResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = performance.now();
    let received = 0;
    try {
      // speed.cloudflare.com unterstützt CORS + Byte-Ranges
      const url = `https://speed.cloudflare.com/__down?bytes=${bytes}`;
      const resp = await fetchFn(url, { cache: 'no-store', signal: controller.signal }) as unknown as {
        ok: boolean;
        body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null;
      };
      if (!resp.ok) throw new Error(`HTTP ${(resp as unknown as { status: number }).status}`);
      const reader = resp.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) received += value.byteLength;
        }
      }
    } finally {
      clearTimeout(timer);
    }
    const durationMs = performance.now() - start;
    if (received === 0) throw new Error('0 Bytes empfangen');
    const mbps = (received * 8) / 1e6 / (durationMs / 1000);
    return { status: 'ok', bytes: received, durationMs: Math.round(durationMs), mbps: Math.round(mbps * 10) / 10 };
  } catch (e) {
    return {
      status: 'fail',
      bytes: 0,
      durationMs: 0,
      mbps: null,
      error: errToMessage(e),
    };
  }
}

export interface EchoSocket {
  send(data: string): void;
  close(): void;
  set onmessage(handler: ((ev: { data: unknown }) => void) | null);
  set onerror(handler: ((ev: unknown) => void) | null);
  set onopen(handler: (() => void) | null);
}

export type EchoSocketFactory = (url: string) => EchoSocket;

/**
 * Durchsatzmessung über WebSocket-Echo: sendet kontinuierlich Payload und
 * misst, wie viele Bytes innerhalb des Zeitfensters bestätigt (zurückgegeben)
 * werden. Liefert echte Mb/s des Uplinks zum Echo-Server.
 */
export function measureThroughput(
  wsUrl: string,
  factory: EchoSocketFactory,
  windowMs = 3000,
  chunkSize = 16384,
  timeoutMs = 10000
): Promise<ThroughputResult> {
  return new Promise((resolve) => {
    let sock: EchoSocket;
    let bytesEchoed = 0;
    let bytesSent = 0;
    let finished = false;
    let startTime = 0;
    const chunk = 'x'.repeat(chunkSize);

    const finish = (status: 'ok' | 'fail', error?: string) => {
      if (finished) return;
      finished = true;
      const durationMs = performance.now() - startTime;
      try { sock.close(); } catch { /* bereits geschlossen */ }
      if (status === 'fail') {
        resolve({ status, bytesSent, bytesEchoed, durationMs: Math.round(durationMs), mbps: null, error });
        return;
      }
      const mbps = durationMs > 0 ? (bytesEchoed * 8) / 1e6 / (durationMs / 1000) : null;
      resolve({
        status: 'ok',
        bytesSent,
        bytesEchoed,
        durationMs: Math.round(durationMs),
        mbps: mbps === null ? null : Math.round(mbps * 10) / 10,
      });
    };

    const timeout = setTimeout(() => {
      if (bytesEchoed > 0) finish('ok');
      else finish('fail', 'Zeitüberschreitung: Echo-Server antwortet nicht');
    }, timeoutMs);

    try {
      sock = factory(wsUrl);
    } catch (e) {
      clearTimeout(timeout);
      finish('fail', e instanceof Error ? e.message : String(e));
      return;
    }

    sock.onerror = () => {
      clearTimeout(timeout);
      finish('fail', 'WebSocket-Fehler');
    };

    sock.onmessage = (ev) => {
      if (finished) return;
      const size = typeof ev.data === 'string'
        ? ev.data.length
        : ev.data instanceof ArrayBuffer ? ev.data.byteLength
        : ArrayBuffer.isView(ev.data) ? (ev.data as ArrayBufferView).byteLength
        : 0;
      bytesEchoed += size;
      if (!finished) {
        sock.send(chunk);
        bytesSent += chunk.length;
      }
    };

    sock.onopen = () => {
      startTime = performance.now();
      // Messfenster: danach auswerten
      const windowTimer = setTimeout(
        () => (bytesEchoed > 0 ? finish('ok') : finish('fail', 'Keine Echo-Antwort innerhalb des Messfensters')),
        windowMs
      );
      void windowTimer;
      sock.send(chunk);
      bytesSent += chunk.length;
    };
  });
}

/** Standard-Echo-Server für Durchsatztests (öffentlich, WSS). */
export const DEFAULT_ECHO_WS = 'wss://ws.postman-echo.com/raw';

export { DEFAULT_SAMPLE_COUNT, DEFAULT_TIMEOUT_MS };
