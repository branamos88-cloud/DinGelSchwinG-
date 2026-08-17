/**
 * Rosetta-AI — funktionaler KI-Client
 * ===================================
 * 1. Online-Modus: echter HTTP-Client (OpenAI-kompatibel, mit SSE-Streaming)
 *    → Basis-URL, API-Key und Modell in den Einstellungen konfigurierbar.
 * 2. Offline-Modus (kein Endpoint konfiguriert): lokale Analyse-Engine, die
 *    ECHTE Statistiken aus den Live-Netzwerkdaten berechnet (kein Mock-Text).
 */
import type { AppState, Device, PairMethod, ReplayPoint } from '../../state/types';

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  chunkId: string;
  data: string;
  done: boolean;
}

export interface AnalysisResult {
  mode: 'online' | 'offline';
  route: string;
  model?: string;
  summary: string;
  metrics: Record<string, string | number>;
  recommendations: string[];
  confidence: number;
  generatedAt: number;
}

export class RosettaClient {
  constructor(private config: AiConfig) {}

  updateConfig(config: AiConfig) {
    this.config = config;
  }

  isOnlineConfigured(): boolean {
    return !!this.config.enabled && this.config.baseUrl.length > 0 && this.config.apiKey.length > 0;
  }

  /** Normalisiert die Endpoint-URL (https://host/v1 → https://host/v1/chat/completions). */
  static resolveEndpoint(baseUrl: string): string {
    let url = baseUrl.replace(/\/+$/, '');
    if (url.endsWith('/chat/completions')) return url;
    if (url.endsWith('/v1')) return `${url}/chat/completions`;
    return `${url}/v1/chat/completions`;
  }

  /** Einfacher Chat-Roundtrip gegen das konfigurierte Backend. */
  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    if (!this.isOnlineConfigured()) {
      throw new Error('Kein KI-Endpoint konfiguriert — siehe Einstellungen (Rosetta AI)');
    }
    const resp = await fetch(RosettaClient.resolveEndpoint(this.config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-4o-mini',
        messages,
        temperature: 0.4,
        stream: false,
      }),
      signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Backend-Fehler ${resp.status}: ${text.slice(0, 200)}`);
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Leere Antwort vom Backend');
    return content;
  }

  /** Streaming-Chat (SSE) gegen das konfigurierte Backend. */
  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.isOnlineConfigured()) {
      throw new Error('Kein KI-Endpoint konfiguriert — siehe Einstellungen (Rosetta AI)');
    }
    const resp = await fetch(RosettaClient.resolveEndpoint(this.config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-4o-mini',
        messages,
        temperature: 0.4,
        stream: true,
      }),
      signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Backend-Fehler ${resp.status}: ${text.slice(0, 200)}`);
    }
    if (!resp.body) throw new Error('Kein Stream-Body');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let chunkId = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
          if (delta) {
            full += delta;
            onChunk({ chunkId: `chunk-${chunkId++}`, data: delta, done: false });
          }
        } catch {
          // Nicht-JSON-Zeile (Keep-Alive o. ä.) ignorieren
        }
      }
    }
    onChunk({ chunkId: `chunk-${chunkId}`, data: '', done: true });
    return full;
  }

  /**
   * Routen-Analyse. Online: LLM; offline: echte statistische Analyse der
   * Live-Netzwerkdaten aus dem Store.
   */
  async analyzeRoute(route: string, state: AppState, signal?: AbortSignal): Promise<AnalysisResult> {
    if (this.isOnlineConfigured()) {
      return this.analyzeOnline(route, state, signal);
    }
    return analyzeOffline(route, state);
  }

  private async analyzeOnline(route: string, state: AppState, signal?: AbortSignal): Promise<AnalysisResult> {
    const snapshot = buildSnapshot(state);
    const system = `Du bist das Rosetta-AI-Gateway von DinGelSchwinG. Route: ${route}. Antworte knapp auf Deutsch mit: Zusammenfassung, Metriken (JSON), 3 Empfehlungen.`;
    const text = await this.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: `Live-Netzwerk-Snapshot:\n${snapshot}` },
      ],
      signal
    );
    return {
      mode: 'online',
      route,
      model: this.config.model,
      summary: text.slice(0, 2000),
      metrics: {},
      recommendations: [],
      confidence: 0.9,
      generatedAt: Date.now(),
    };
  }
}

/** Kompakter, deterministischer Snapshot der Live-Daten (für LLM + Logs). */
export function buildSnapshot(state: AppState): string {
  const lines: string[] = [];
  lines.push(`Geräte: ${state.devices.length}`);
  for (const d of state.devices.slice(0, 40)) {
    lines.push(
      `- ${d.name} [${d.type}] RSSI=${d.rssi} dBm, Abstand=${d.distance !== undefined ? d.distance.toFixed(2) : '?'} m, Quelle=${d.source}`
    );
  }
  lines.push(`Gebundene Clients: ${state.boundDevices.length}`);
  lines.push(`Replay-Punkte: ${state.replayPoints.length}`);
  lines.push(`Scan: ${state.scan.running ? 'aktiv' : 'inaktiv'} (${state.scan.source ?? '-'})`);
  return lines.join('\n');
}

/** Routen → deutscher Name für die Offline-Analyse. */
export const ROUTE_LABELS: Record<string, string> = {
  'net-analysis': 'Netzwerk-Analyse',
  'device-pairing': 'Geräte-Kopplung',
  'sensor-fusion': 'Sensor-Fusion',
  'stream-diagnostics': 'Stream-Diagnose',
  'mesh-monitor': 'Mesh-Überwachung',
  'replay-editor': 'Replay-Analyse',
};

/**
 * Offline-Analyse: berechnet echte Kennzahlen aus den Live-Daten
 * und leitet daraus Empfehlungen ab (rein deterministisch, kein Mock).
 */
export function analyzeOffline(route: string, state: AppState): AnalysisResult {
  const devices: Device[] = state.devices;
  const metrics: Record<string, string | number> = {
    geräte_gesamt: devices.length,
    geräte_aktiv: devices.filter(d => Date.now() - d.lastSeen < 30000).length,
    gebunden: state.boundDevices.length,
    scan_aktiv: state.scan.running ? 'ja' : 'nein',
  };
  const recommendations: string[] = [];
  let summary = '';
  let confidence = 0.8;

  if (route === 'net-analysis' || route === 'mesh-monitor') {
    const rssiValues = devices.map(d => d.rssi);
    if (rssiValues.length > 0) {
      const best = Math.max(...rssiValues);
      const worst = Math.min(...rssiValues);
      const avg = Math.round((rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length) * 10) / 10;
      metrics.bester_rssi_dbm = best;
      metrics.schwächster_rssi_dbm = worst;
      metrics.durchschnitt_rssi_dbm = avg;
      metrics.streckung_dbm = Math.abs(best - worst);
    }
    const distances = devices.map(d => d.distance).filter((d): d is number => d !== undefined);
    if (distances.length > 0) {
      metrics.größte_distanz_m = Math.round(Math.max(...distances) * 100) / 100;
      metrics.kleinste_distanz_m = Math.round(Math.min(...distances) * 100) / 100;
    }
    const weak = devices.filter(d => d.rssi < -85);
    const masters = devices.filter(d => d.type === 'master');
    if (weak.length > 0) {
      recommendations.push(`${weak.length} Gerät(e) mit sehr schwachem Signal (< -85 dBm): ${weak.map(w => w.name).join(', ')} — Position prüfen.`);
    }
    if (masters.length === 0) {
      recommendations.push('Kein Master im Netz erkannt — sicherstellen, dass der Master eingeschaltet ist.');
    }
    if (state.scan.running) {
      recommendations.push(`Scan läuft (${state.scan.source}) — ${devices.length} Geräte aktuell sichtbar.`);
    } else {
      recommendations.push('Scan ist pausiert — auf dem Dashboard oder unter Mesh „Scan starten“ wählen.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Netzwerkzustand unauffällig — alle Signale im Normbereich.');
    }
    summary = `Analyse von ${devices.length} Geräten. ${
      devices.length > 0
        ? `RSSI-Spanne ${metrics.schwächster_rssi_dbm}…${metrics.bester_rssi_dbm} dBm.`
        : 'Keine Geräte im Speicher — zuerst einen Scan durchführen.'
    }`;
  } else if (route === 'device-pairing') {
    const methods = state.boundDevices.map(b => b.method);
    metrics.kopplungen = state.boundDevices.length;
    for (const m of ['qr', 'ble', 'nfc', 'wifi'] as const) {
      metrics[`methode_${m}`] = methods.filter((x: PairMethod) => x === m).length;
    }
    const enabled = Object.entries(state.settings.pairingMethods)
      .filter(([, v]) => v)
      .map(([k]) => k.toUpperCase());
    recommendations.push(`Aktivierte Kopplungswege: ${enabled.length ? enabled.join(', ') : 'keine — in den Einstellungen freischalten'}.`);
    if (state.boundDevices.length === 0) {
      recommendations.push('Noch keine Kopplung — QR-Code des Clients scannen oder BLE-Scan starten.');
    } else {
      recommendations.push(`${state.boundDevices.length} Gerät(e) gebunden — Kopplungen werden lokal gespeichert.`);
    }
    summary = `${state.boundDevices.length} gebundene Geräte, ${devices.length} Geräte im Netz sichtbar.`;
  } else if (route === 'sensor-fusion') {
    metrics.devices_mit_position = devices.filter(d => d.distance !== undefined).length;
    if (devices.length > 0) {
      recommendations.push('3D-Positionen werden aus WASM-Distanz + Sensor-Ausrichtung (alpha/beta) berechnet.');
      recommendations.push('Für kalibrierte Abstände „Lernen aus Bestätigung“ auf dem Dashboard verwenden.');
    } else {
      recommendations.push('Keine Geräte für Sensor-Fusion vorhanden — Scan starten.');
    }
    summary = 'Sensor-Fusion kombiniert WASM-Pfadverlust mit Geräte-Orientierung des Masters.';
  } else if (route === 'stream-diagnostics' || route === 'replay-editor') {
    const points: ReplayPoint[] = state.replayPoints;
    metrics.aufgezeichnete_punkte = points.length;
    if (points.length > 1) {
      const rssi = points.map(p => p.rssi);
      const freqs = points.map(p => p.freqMHz);
      metrics.rssi_min = Math.min(...rssi);
      metrics.rssi_max = Math.max(...rssi);
      metrics.freq_min_mhz = Math.min(...freqs);
      metrics.freq_max_mhz = Math.max(...freqs);
      metrics.zeitraum_ms = Math.max(...points.map(p => p.t)) - Math.min(...points.map(p => p.t));
      recommendations.push(`Aufzeichnung umfasst ${points.length} Punkte über ${metrics.zeitraum_ms} ms.`);
      recommendations.push('Signalverlauf kann im Replay-Editor editiert und als JSON exportiert werden.');
    } else {
      recommendations.push('Noch keine Aufzeichnung — im Replay-Editor die Aufnahme mit echten Scan-Daten starten.');
    }
    summary = `${points.length} Replay-Punkte vorhanden.`;
    confidence = 0.85;
  } else {
    summary = `Route "${route}" — keine Daten vorhanden.`;
    recommendations.push('Einen Scan oder eine Aufzeichnung starten, um Daten für die Analyse zu erzeugen.');
    confidence = 0.5;
  }

  return {
    mode: 'offline',
    route,
    summary,
    metrics,
    recommendations,
    confidence,
    generatedAt: Date.now(),
  };
}
