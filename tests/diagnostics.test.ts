/**
 * Diagnose-Engine — Funktionsketten-Tests mit gemocktem Netzwerk
 */
import { describe, it, expect, vi } from 'vitest';
import {
  measureDownload,
  measureLatency,
  measureThroughput,
  EchoSocket,
} from '../src/lib/diagnostics/diagnosticsEngine';

describe('measureLatency', () => {
  it('liefert min/avg/max aus mehreren erfolgreichen Samples', async () => {
    const delays = [5, 15, 30];
    let call = 0;
    const fetchFn = vi.fn(async () => {
      await new Promise(r => setTimeout(r, delays[call++ % delays.length]));
      return { ok: true };
    });
    const res = await measureLatency('https://example.test', fetchFn, 3, 1000);
    expect(res.status).toBe('ok');
    expect(res.samples.length).toBe(3);
    expect(res.avgMs).not.toBeNull();
    expect(res.minMs).not.toBeNull();
    expect(res.maxMs).not.toBeNull();
    expect(res.minMs!).toBeLessThanOrEqual(res.avgMs!);
    expect(res.avgMs!).toBeLessThanOrEqual(res.maxMs!);
  });

  it('meldet Fehler, wenn das Ziel nicht antwortet', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('connection refused');
    });
    const res = await measureLatency('https://down.test', fetchFn, 2, 500);
    expect(res.status).toBe('fail');
    expect(res.error).toContain('connection refused');
    expect(res.avgMs).toBeNull();
  });

  it('bricht bei Timeout ab und meldet Zeitüberschreitung', async () => {
    const fetchFn = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    const res = await measureLatency('https://slow.test', fetchFn, 1, 30);
    expect(res.status).toBe('fail');
    expect(res.error).toContain('Zeitüberschreitung');
  });
});

describe('measureDownload', () => {
  function streamResponse(chunks: Uint8Array[], ok = true) {
    let i = 0;
    return {
      ok,
      status: ok ? 200 : 500,
      body: {
        getReader: () => ({
          read: async () =>
            i < chunks.length
              ? { done: false, value: chunks[i++] }
              : { done: true, value: undefined },
        }),
      },
    };
  }

  it('berechnet Mbit/s aus echt übertragenen Bytes', async () => {
    // 5 MB in 4 Chunks
    const chunk = new Uint8Array(1024 * 1024);
    const fetchFn = vi.fn(async () => streamResponse([chunk, chunk, chunk, chunk, chunk]));
    const res = await measureDownload(5 * 1024 * 1024, fetchFn, 5000);
    expect(res.status).toBe('ok');
    expect(res.bytes).toBe(5 * 1024 * 1024);
    expect(res.mbps).not.toBeNull();
    expect(res.mbps!).toBeGreaterThan(0);
  });

  it('meldet Fehler bei HTTP-Fehler', async () => {
    const fetchFn = vi.fn(async () => streamResponse([], false));
    const res = await measureDownload(1024, fetchFn, 2000);
    expect(res.status).toBe('fail');
    expect(res.mbps).toBeNull();
    expect(res.error).toContain('500');
  });

  it('meldet Fehler bei 0 Bytes', async () => {
    const fetchFn = vi.fn(async () => streamResponse([]));
    const res = await measureDownload(1024, fetchFn, 2000);
    expect(res.status).toBe('fail');
    expect(res.error).toContain('0 Bytes');
  });
});

describe('measureThroughput', () => {
  /** Fake-Echo-Server: wirft jede Nachricht sofort zurück. */
  function echoFactory(delayMs = 0): (url: string) => EchoSocket {
    return () => {
      const handlers: { onmessage?: (ev: { data: unknown }) => void; onopen?: () => void; onerror?: (ev: unknown) => void } = {};
      const sock: EchoSocket = {
        send: (data: string) => {
          setTimeout(() => handlers.onmessage?.({ data }), delayMs);
        },
        close: () => undefined,
        set onmessage(h) { handlers.onmessage = h; },
        set onerror(h) { handlers.onerror = h; },
        set onopen(h) { handlers.onopen = h; },
      };
      setTimeout(() => handlers.onopen?.(), 1);
      return sock;
    };
  }

  it('misst bestätigte Bytes im Zeitfenster', async () => {
    const res = await measureThroughput('wss://echo.test', echoFactory(2), 150, 1024, 2000);
    expect(res.status).toBe('ok');
    expect(res.bytesEchoed).toBeGreaterThan(0);
    expect(res.bytesSent).toBeGreaterThan(0);
    expect(res.mbps).not.toBeNull();
  });

  it('meldet Fehler bei defektem Server (kein Echo)', async () => {
    const factory = () => {
      const handlers: { onopen?: () => void; onerror?: (ev: unknown) => void } = {};
      const sock: EchoSocket = {
        send: () => undefined,
        close: () => undefined,
        set onmessage(_h) { /* nie antworten */ },
        set onerror(h) { handlers.onerror = h; },
        set onopen(h) { handlers.onopen = h; },
      };
      setTimeout(() => handlers.onopen?.(), 1);
      return sock;
    };
    const res = await measureThroughput('wss://dead.test', factory, 100, 1024, 500);
    expect(res.status).toBe('fail');
    expect(res.mbps).toBeNull();
  });
});
