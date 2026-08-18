import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QrCode, Bluetooth, Waves, Wifi, ShieldCheck, Smartphone, Zap, Cable } from 'lucide-react';
import { nexus, useNexus } from '../context/NexusContext';
import { toUserMessage } from '../domain/errors';

export interface PairedDevice {
  id: string;
  name: string;
  method: 'qr' | 'ble' | 'nfc' | 'wifi' | 'adb';
  rssi: number;
  boundAt: string;
}

export default function PairingPanel({ onBind }: { onBind?: (device: PairedDevice) => void }) {
  const snap = useNexus();
  const [scanningQR, setScanningQR] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [pairingMethod, setPairingMethod] = useState<'qr' | 'ble' | 'nfc' | 'wifi'>('qr');
  const [statusMsg, setStatusMsg] = useState('Bereit zur Kopplung');
  const [err, setErr] = useState<string | null>(null);
  const methods = snap.config.pairingMethods;

  useEffect(() => {
    if (!scanningQR && scannerRef.current) {
      scannerRef.current.clear().catch(() => undefined);
      scannerRef.current = null;
    }
  }, [scanningQR]);

  const finish = (id: string, name: string, method: PairedDevice['method'], rssi: number) => {
    const rec = { id, name, method, rssi, boundAt: new Date().toISOString() };
    onBind?.(rec);
    setStatusMsg('Kopplung erfolgreich — Gerät gebunden');
  };

  const startQR = () => {
    if (scanningQR || !methods.qr) return;
    setPairingMethod('qr');
    setScanningQR(true);
    setScanResult(null);
    setErr(null);
    setStatusMsg('QR-Scan aktiv — Kamera freigeben');
    setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 }, false);
        scannerRef.current = scanner;
        scanner.render(
          (decodedText: string) => {
            setScanResult(decodedText);
            try {
              const b = nexus.bindFromQr(decodedText);
              finish(b.id, b.label, 'qr', b.rssi);
            } catch (e) {
              setErr(toUserMessage(e).detail);
            }
            setScanningQR(false);
            scanner.clear().catch(() => undefined);
            scannerRef.current = null;
          },
          () => undefined,
        );
      } catch {
        setStatusMsg('Kamera-Fehler — Berechtigung prüfen');
      }
    }, 200);
  };

  const bindMethod = async (method: 'ble' | 'nfc' | 'wifi') => {
    setPairingMethod(method);
    setErr(null);
    setStatusMsg(method === 'ble' ? 'BLE-Scan…' : method === 'nfc' ? 'NFC halten…' : 'WLAN erkennen…');
    try {
      const b = method === 'ble' ? await nexus.bindFromBle() : method === 'nfc' ? await nexus.bindFromNfc() : await nexus.bindFromWifi();
      finish(b.id, b.label, method, b.rssi);
    } catch (e) {
      setErr(toUserMessage(e).detail);
      setStatusMsg('Kopplung fehlgeschlagen');
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="bg-gradient-to-br from-slate-900/80 to-blue-950/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
        <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400 flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-amber-300" /> Client-Kopplung
        </h2>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button disabled={!methods.qr} onClick={startQR} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pairingMethod === 'qr' ? 'bg-cyan-600 text-white' : 'bg-slate-800/60 text-slate-200'} disabled:opacity-30`}>
            <QrCode className="w-4 h-4" /> QR Code
          </button>
          <button disabled={!methods.ble} onClick={() => void bindMethod('ble')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pairingMethod === 'ble' ? 'bg-emerald-600 text-white' : 'bg-slate-800/60 text-slate-200'} disabled:opacity-30`}>
            <Bluetooth className="w-4 h-4" /> BLE
          </button>
          <button disabled={!methods.nfc} onClick={() => void bindMethod('nfc')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pairingMethod === 'nfc' ? 'bg-violet-600 text-white' : 'bg-slate-800/60 text-slate-200'} disabled:opacity-30`}>
            <Waves className="w-4 h-4" /> NFC Token
          </button>
          <button disabled={!methods.wifi} onClick={() => void bindMethod('wifi')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pairingMethod === 'wifi' ? 'bg-rose-600 text-white' : 'bg-slate-800/60 text-slate-200'} disabled:opacity-30`}>
            <Wifi className="w-4 h-4" /> WiFi
          </button>
          <button
            disabled={methods.adb === false}
            onClick={() => {
              setPairingMethod('wifi');
              setStatusMsg('ADB-WiFi Discovery…');
              void nexus.discoverAdb().then((list) => {
                const first = list[0];
                if (first) {
                  finish(first.id, first.name, 'adb', -50);
                } else setStatusMsg('Kein ADB-Client im WLAN');
              }).catch((e) => setErr(toUserMessage(e).detail));
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-slate-800/60 text-slate-200 disabled:opacity-30 col-span-2"
          >
            <Cable className="w-4 h-4" /> ADB WiFi
          </button>
        </div>
        <div className="text-xs font-mono mb-2 rounded-lg px-3 py-2 border border-white/10 text-cyan-200">{statusMsg}</div>
        {err && <div className="text-xs text-rose-300 mb-2">{err}</div>}
        {scanningQR && (
          <div className="relative rounded-xl overflow-hidden border border-cyan-500/40 bg-black" id="qr-reader" style={{ minHeight: 240 }}>
            <button onClick={() => setScanningQR(false)} className="absolute top-2 right-2 z-10 bg-slate-900/80 text-white text-xs px-2 py-1 rounded-md">
              Abbrechen
            </button>
          </div>
        )}
        {scanResult && !scanningQR && (
          <div className="bg-emerald-950/50 border border-emerald-600/40 rounded-xl px-3 py-2 text-xs text-emerald-200 font-mono flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Gebunden: {scanResult}
          </div>
        )}
      </div>
      <div className="bg-gradient-to-br from-slate-900/60 to-blue-950/40 border border-slate-700/40 rounded-2xl p-4 flex-1">
        <h3 className="text-sm font-bold text-slate-200 mb-2 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-amber-300" /> Gebundene Clients
        </h3>
        <div className="flex flex-col gap-2">
          {snap.bound.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Warte auf Kopplung…</div>
          ) : (
            snap.bound.map((c) => (
              <div key={c.id} className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-700/30 rounded-xl px-3 py-2 text-emerald-100 text-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="flex-1 truncate font-bold">{c.label}</div>
                <div className="text-[10px] font-extrabold">{c.method.toUpperCase()}</div>
                <button className="text-rose-300" onClick={() => void nexus.unbindDevice(c.id).catch((e) => setErr(toUserMessage(e).detail))}>
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        {snap.pairings.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-[10px] uppercase text-slate-500">Pairings</div>
            {snap.pairings.map((p) => (
              <div key={p.id} className="text-[11px] font-mono text-slate-300 flex justify-between">
                <span>{p.name}</span>
                <button className="text-cyan-300" onClick={() => nexus.syncPairing(p.id)}>
                  Sync
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          className="mt-3 text-[11px] text-cyan-300 underline"
          onClick={() => {
            if (snap.bound.length >= 2) nexus.createPairing('Gruppe ' + (snap.pairings.length + 1), snap.bound.map((b) => b.id));
            else setStatusMsg('Mindestens zwei gebundene Geräte für Pairing');
          }}
        >
          Pairing aus allen Bindungen
        </button>
      </div>
    </div>
  );
}
