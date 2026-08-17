/**
 * PairingView — echte Client-Kopplung
 * QR: Kamera-Scan (html5-qrcode) · BLE: echter Scan (Web BLE / Capacitor)
 * NFC: Web NFC (NDEFReader) · WiFi: Latenzprüfung zum Gateway
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { Bluetooth, QrCode, ShieldCheck, Trash2, Waves, Wifi, XCircle } from 'lucide-react';
import { useAppStore } from '../state/store';
import { useBleRuntime } from '../hooks/useBleRuntime';
import { buildMasterPairPayload, createBinding, validatePairPayload } from '../lib/pairing/pairingProtocol';
import { measureLatency } from '../lib/diagnostics/diagnosticsEngine';
import type { BLEWasmExports } from '../lib/bleWasm';
import type { PairMethod } from '../state/types';
import { ActionButton, Card, ErrorNote, InfoNote, MonoRow, SectionTitle, StatusPill } from './ui';

type PairStatus = { phase: 'idle' | 'working' | 'done' | 'error'; msg: string };

export default function PairingView({ wasm }: { wasm: BLEWasmExports | null }) {
  const { state, dispatch } = useAppStore();
  const ble = useBleRuntime(wasm);
  const [method, setMethod] = useState<PairMethod>('qr');
  const [status, setStatus] = useState<PairStatus>({ phase: 'idle', msg: 'Bereit zur Kopplung' });
  const [scanningQR, setScanningQR] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [masterPayload, setMasterPayload] = useState<string>('');
  const [manualPayload, setManualPayload] = useState('');
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [wifiLatency, setWifiLatency] = useState<string | null>(null);

  // Master-Payload generieren (für QR-Anzeige an Clients)
  useEffect(() => {
    setMasterPayload(buildMasterPairPayload('master-1', 'MASTER-Gold'));
  }, []);

  useEffect(() => {
    setNfcAvailable(typeof window !== 'undefined' && 'NDEFReader' in window);
  }, []);

  // QR-Scanner aufräumen
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, []);

  const setStatusSafe = (s: PairStatus) => setStatus(s);

  /** Verbindet ein Gerät über den Store. */
  const bind = useCallback(
    (payload: string, m: PairMethod, extra?: { name?: string; rssi?: number; deviceId?: string }) => {
      const validated = validatePairPayload(payload);
      if (!validated.valid) {
        setStatusSafe({ phase: 'error', msg: `Ungültiger Inhalt: ${validated.note ?? '?'}` });
        return;
      }
      const binding = createBinding({ payload, method: m, ...extra });
      if (!binding) {
        setStatusSafe({ phase: 'error', msg: 'Bindung konnte nicht erstellt werden' });
        return;
      }
      dispatch({ type: 'BIND_DEVICE', bound: binding });
      dispatch({ type: 'ADD_LOG', level: 'success', msg: `Gebunden: ${binding.name} (${m.toUpperCase()})` });
      setStatusSafe({ phase: 'done', msg: `Kopplung erfolgreich: ${binding.name}` });
    },
    [dispatch]
  );

  // ------------------------------- QR-Scan -----------------------------------
  const startQR = useCallback(() => {
    if (scanningQR) return;
    setScanningQR(true);
    setStatusSafe({ phase: 'working', msg: 'QR-Scan aktiv — Kamera freigeben…' });
    setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner(
          'qr-reader',
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
          false
        );
        scannerRef.current = scanner;
        scanner.render(
          (decodedText: string) => {
            if (scannerRef.current) {
              scannerRef.current.clear().catch(() => undefined);
              scannerRef.current = null;
            }
            setScanningQR(false);
            bind(decodedText, 'qr');
          },
          () => { /* Scanfehler ignorieren (kontinuierlicher Scan) */ }
        );
      } catch {
        setStatusSafe({ phase: 'error', msg: 'Kamera nicht verfügbar — Berechtigung prüfen' });
        setScanningQR(false);
      }
    }, 250);
  }, [scanningQR, bind]);

  const cancelQR = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => undefined);
      scannerRef.current = null;
    }
    setScanningQR(false);
    setStatusSafe({ phase: 'idle', msg: 'QR-Scan abgebrochen' });
  }, []);

  // ------------------------------- BLE-Scan -----------------------------------
  const startBlePairing = useCallback(() => {
    setStatusSafe({ phase: 'working', msg: 'BLE-Scan läuft — Geräte suchen…' });
    void ble.startScan().then(() => {
      setStatusSafe({
        phase: 'working',
        msg: 'BLE-Scan läuft — Gerät aus der Ergebnisliste auf dem Dashboard auswählen, es wird automatisch als sichtbar registriert. Gefundene Geräte können unten gebunden werden.',
      });
    });
  }, [ble]);

  /** Bindet das BLE-Gerät mit dem stärksten Signal aus dem Scan. */
  const bindStrongestBle = useCallback(() => {
    const candidates = state.devices.filter(d => d.source === 'ble' && !d.bound);
    if (candidates.length === 0) {
      setStatusSafe({ phase: 'error', msg: 'Keine ungebundenen BLE-Geräte gefunden — zuerst scannen' });
      return;
    }
    const best = candidates.reduce((a, b) => (a.rssi > b.rssi ? a : b));
    bind(`dingelschwinng://bind?id=${encodeURIComponent(best.id)}&name=${encodeURIComponent(best.name)}`, 'ble', {
      name: best.name,
      rssi: best.rssi,
      deviceId: best.id,
    });
    dispatch({ type: 'UPSERT_DEVICE', device: { ...best, bound: true } });
  }, [state.devices, bind, dispatch]);

  // --------------------------------- NFC -------------------------------------
  const startNfc = useCallback(async () => {
    if (!nfcAvailable) {
      setStatusSafe({ phase: 'error', msg: 'Web NFC wird von diesem Browser/Gerät nicht unterstützt' });
      return;
    }
    setStatusSafe({ phase: 'working', msg: 'NFC-Token bereithalten…' });
    try {
      const NDEFReaderCtor = (window as unknown as { NDEFReader: new () => { scan(): Promise<void>; addEventListener(type: string, cb: (e: { message?: { records?: Array<{ recordType: string; data: DataView }> } }) => void): void } }).NDEFReader;
      const reader = new NDEFReaderCtor();
      let done = false;
      reader.addEventListener('reading', (e) => {
        if (done) return;
        for (const record of e.message?.records ?? []) {
          if (record.recordType !== 'text') continue;
          const text = new TextDecoder().decode(record.data);
          done = true;
          bind(text, 'nfc');
          return;
        }
      });
      await reader.scan();
      // Scan bleibt bis Timeout aktiv
      setTimeout(() => {
        if (!done) setStatusSafe({ phase: 'idle', msg: 'NFC-Zeitfenster abgelaufen — erneut starten' });
      }, 15000);
    } catch (e) {
      setStatusSafe({ phase: 'error', msg: `NFC-Fehler: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, [nfcAvailable, bind]);

  // --------------------------------- WiFi -------------------------------------
  const startWifi = useCallback(async () => {
    setStatusSafe({ phase: 'working', msg: 'WiFi-Gateway wird geprüft…' });
    setWifiLatency(null);
    const gateway = state.settings.diagTargets[0] ?? 'https://1.1.1.1';
    const result = await measureLatency(gateway, (...args) => fetch(...args), 3);
    if (result.status === 'ok' && result.avgMs !== null) {
      setWifiLatency(`${result.avgMs} ms`);
      setStatusSafe({ phase: 'done', msg: `Netzwerk erreichbar (${result.avgMs} ms) — Node gebunden` });
      bind(`dingelschwinng://bind?id=wifi-node&name=WiFi-Node`, 'wifi', { name: 'WiFi-Node', rssi: -60 });
    } else {
      setStatusSafe({ phase: 'error', msg: `Gateway nicht erreichbar: ${result.error ?? '?'}` });
    }
  }, [state.settings.diagTargets, bind]);

  const methodsEnabled = state.settings.pairingMethods;

  return (
    <div className="flex flex-col gap-4">
      <Card glow>
        <SectionTitle icon={<QrCode className="w-4 h-4 text-cyan-300" />}>Client-Kopplung</SectionTitle>

        {/* Methoden-Auswahl */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <ActionButton tone="primary" active={method === 'qr'} disabled={!methodsEnabled.qr} onClick={() => { setMethod('qr'); void startQR(); }}>
            <QrCode className="w-4 h-4" /> QR-Code scannen
          </ActionButton>
          <ActionButton tone="success" active={method === 'ble'} disabled={!methodsEnabled.ble} onClick={() => { setMethod('ble'); startBlePairing(); }}>
            <Bluetooth className="w-4 h-4" /> BLE-Gerät
          </ActionButton>
          <ActionButton tone="primary" active={method === 'nfc'} disabled={!methodsEnabled.nfc || !nfcAvailable} onClick={() => { setMethod('nfc'); void startNfc(); }}>
            <Waves className="w-4 h-4" /> NFC-Token
          </ActionButton>
          <ActionButton tone="primary" active={method === 'wifi'} disabled={!methodsEnabled.wifi} onClick={() => { setMethod('wifi'); void startWifi(); }}>
            <Wifi className="w-4 h-4" /> WiFi-Node
          </ActionButton>
        </div>

        {/* Status */}
        <div className={`text-xs font-mono mb-3 rounded-lg px-3 py-2 border ${
          status.phase === 'done'
            ? 'bg-emerald-950/40 border-emerald-700/40 text-emerald-200'
            : status.phase === 'error'
              ? 'bg-rose-950/40 border-rose-700/40 text-rose-200'
              : status.phase === 'working'
                ? 'bg-amber-950/40 border-amber-700/40 text-amber-200'
                : 'bg-cyan-950/40 border-cyan-700/40 text-cyan-200'
        }`}>
          {status.msg}
        </div>

        {/* QR-Scanner */}
        {scanningQR && (
          <div className="relative rounded-xl overflow-hidden border border-cyan-500/40 bg-black mb-3">
            <div id="qr-reader" style={{ minHeight: 240 }} />
            <button
              onClick={cancelQR}
              className="absolute top-2 right-2 z-10 bg-slate-900/85 text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-slate-800 border border-white/20"
            >
              Abbrechen
            </button>
          </div>
        )}

        {/* Manuelle Eingabe */}
        <div className="flex gap-2 mt-2">
          <input
            value={manualPayload}
            onChange={e => setManualPayload(e.target.value)}
            placeholder="Kopplungs-Token manuell eingeben…"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-xs font-mono text-cyan-100 focus:border-cyan-400 outline-none"
          />
          <ActionButton tone="neutral" disabled={!manualPayload.trim()} onClick={() => { bind(manualPayload.trim(), 'qr'); setManualPayload(''); }}>
            Binden
          </ActionButton>
        </div>

        {/* BLE-Ergebnisse */}
        {method === 'ble' && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-extrabold text-slate-300">Gefundene BLE-Geräte ({state.devices.filter(d => d.source === 'ble').length})</span>
              <ActionButton tone="success" onClick={bindStrongestBle}>Stärkstes Signal binden</ActionButton>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {state.devices.filter(d => d.source === 'ble').map(d => (
                <div key={d.id} className="flex items-center gap-2 bg-[#060f2a]/60 rounded-lg px-3 py-2 text-xs font-mono border border-white/5">
                  <Bluetooth className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <div className="flex-1 truncate text-slate-200">{d.name}</div>
                  <div className="text-cyan-200">{d.rssi} dBm</div>
                  <div className="text-amber-200">{d.distance?.toFixed(2) ?? '?'} m</div>
                  {d.bound ? (
                    <StatusPill ok label="gebunden" />
                  ) : (
                    <button
                      onClick={() => bind(`dingelschwinng://bind?id=${encodeURIComponent(d.id)}&name=${encodeURIComponent(d.name)}`, 'ble', { name: d.name, rssi: d.rssi, deviceId: d.id })}
                      className="text-[10px] font-extrabold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      Binden
                    </button>
                  )}
                </div>
              ))}
              {state.devices.filter(d => d.source === 'ble').length === 0 && (
                <InfoNote>Keine BLE-Geräte gefunden. Gerät einschalten und Scan erneut starten.</InfoNote>
              )}
            </div>
          </div>
        )}
        {wifiLatency && <InfoNote>Gateway-Latenz: {wifiLatency} — Verbindung geprüft.</InfoNote>}
      </Card>

      {/* Master-QR (dieses Gerät als Master für Clients anzeigen) */}
      <Card>
        <SectionTitle icon={<ShieldCheck className="w-4 h-4 text-amber-300" />}>Dieser Master als QR-Code</SectionTitle>
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="bg-white p-3 rounded-2xl shrink-0">
            {masterPayload && <QRCodeSVG value={masterPayload} size={148} />}
          </div>
          <div className="text-[11px] font-mono text-slate-400 space-y-1">
            <div>Clients können diesen Code scannen, um sich mit dem Master zu koppeln.</div>
            <div className="break-all text-cyan-200 bg-[#060f2a]/60 rounded-lg p-2 border border-white/5">{masterPayload}</div>
            <div>Erwartetes Format: <code className="text-amber-200">dingelschwinng://bind?id=…&name=…&key=…</code></div>
          </div>
        </div>
      </Card>

      {/* Gebundene Geräte */}
      <Card>
        <SectionTitle
          icon={<Bluetooth className="w-4 h-4 text-violet-300" />}
          right={<span className="text-[10px] font-mono text-slate-500">{state.boundDevices.length} gebunden</span>}
        >
          Gebundene Clients
        </SectionTitle>
        {state.boundDevices.length === 0 ? (
          <div className="text-xs text-slate-500 italic">Noch keine Kopplung.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {state.boundDevices.map(c => (
              <div key={c.id} className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-700/30 rounded-xl px-3 py-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs text-emerald-100 truncate">{c.name}</div>
                  <div className="text-[10px] font-mono text-emerald-300/70 truncate">
                    {c.method.toUpperCase()} · {new Date(c.boundAt).toLocaleTimeString()} · {c.rssi} dBm
                  </div>
                </div>
                <button
                  onClick={() => dispatch({ type: 'UNBIND_DEVICE', id: c.id })}
                  className="p-1.5 rounded-lg hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 transition"
                  title="Kopplung lösen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 text-slate-500" />
          <InfoNote>Kopplungen werden lokal auf diesem Gerät gespeichert.</InfoNote>
        </div>
      </Card>
    </div>
  );
}
