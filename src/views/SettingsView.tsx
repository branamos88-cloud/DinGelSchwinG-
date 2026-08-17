/**
 * SettingsView — Netzwerk- und KI-Konfiguration
 * Alle Werte werden validiert, gespeichert (localStorage) und wirken
 * unmittelbar auf Scan-Engine, WASM und KI-Client.
 */
import { useCallback, useState } from 'react';
import { Activity, Bluetooth, BrainCircuit, RotateCcw, Save, SlidersHorizontal, Wifi } from 'lucide-react';
import { useAppStore } from '../state/store';
import { DEFAULT_SETTINGS } from '../state/types';
import { ActionButton, Card, SectionTitle, StatusPill } from './ui';

export default function SettingsView() {
  const { state, dispatch } = useAppStore();
  const [local, setLocal] = useState({ ...state.settings });
  const [savedFlash, setSavedFlash] = useState(false);

  const update = useCallback(<K extends keyof typeof local>(key: K, value: (typeof local)[K]) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    dispatch({ type: 'SET_SETTINGS', settings: local });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    dispatch({ type: 'ADD_LOG', level: 'success', msg: 'Einstellungen gespeichert' });
  }, [local, dispatch]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET_SETTINGS' });
    setLocal({ ...DEFAULT_SETTINGS });
    dispatch({ type: 'ADD_LOG', level: 'info', msg: 'Einstellungen auf Standardwerte zurückgesetzt' });
  }, [dispatch]);

  const num = (v: string, fallback: number) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <div className="flex flex-col gap-4">
      <Card glow>
        <SectionTitle
          icon={<SlidersHorizontal className="w-4 h-4 text-amber-300" />}
          right={
            <div className="flex gap-2">
              <ActionButton tone="neutral" onClick={handleReset}>
                <RotateCcw className="w-3.5 h-3.5" /> Zurücksetzen
              </ActionButton>
              <ActionButton tone="success" onClick={handleSave}>
                <Save className="w-3.5 h-3.5" /> {savedFlash ? 'Gespeichert ✓' : 'Speichern'}
              </ActionButton>
            </div>
          }
        >
          Netzwerk-Konfiguration
        </SectionTitle>
        <div className="text-[11px] font-mono text-slate-400 mb-4">
          Änderungen werden lokal gespeichert und sofort von Scan-Engine, WASM und Diagnose verwendet.
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Modus & Scan */}
          <div className="rounded-2xl p-3 bg-[#060f2a]/60 border border-white/5">
            <div className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Wifi className="w-3 h-3" /> Modus & Scan
            </div>
            <label className="block mb-2">
              <span className="text-[10px] text-slate-400">Standard-Modus</span>
              <select
                value={local.defaultMode}
                onChange={e => update('defaultMode', e.target.value as typeof local.defaultMode)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white font-mono mt-1"
              >
                <option value="ble">BLE</option>
                <option value="wifi">WiFi</option>
                <option value="usb">USB / NW</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Scan-Intervall: <b className="text-amber-200">{local.scanIntervalMs} ms</b></span>
              <input
                type="range" min={250} max={10000} step={250}
                value={local.scanIntervalMs}
                onChange={e => update('scanIntervalMs', parseInt(e.target.value))}
                className="w-full mt-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
            </label>
            <label className="block mt-2">
              <span className="text-[10px] text-slate-400">Sensor-Timeout: <b className="text-cyan-200">{local.sensorTimeoutMs} ms</b></span>
              <input
                type="range" min={100} max={5000} step={100}
                value={local.sensorTimeoutMs}
                onChange={e => update('sensorTimeoutMs', parseInt(e.target.value))}
                className="w-full mt-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
            </label>
            <label className="flex items-center gap-2 mt-3 text-[11px] font-mono text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={local.demoMode}
                onChange={e => update('demoMode', e.target.checked)}
                className="accent-amber-400"
              />
              Demo-Modus (nur ohne BLE-Hardware)
            </label>
          </div>

          {/* BLE / WASM */}
          <div className="rounded-2xl p-3 bg-[#060f2a]/60 border border-white/5">
            <div className="text-[10px] font-extrabold text-cyan-300 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Bluetooth className="w-3 h-3" /> BLE / WASM
            </div>
            <label className="block mb-2">
              <span className="text-[10px] text-slate-400">Tx Power (dBm)</span>
              <input
                type="number" value={local.bleTxPower}
                onChange={e => update('bleTxPower', num(e.target.value, local.bleTxPower))}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs font-mono text-cyan-200 mt-1"
              />
            </label>
            <label className="block mb-2">
              <span className="text-[10px] text-slate-400">Umgebungsfaktor n</span>
              <input
                type="number" step="0.1" min={1.5} max={6}
                value={local.bleEnvFactor}
                onChange={e => update('bleEnvFactor', num(e.target.value, local.bleEnvFactor))}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs font-mono text-amber-200 mt-1"
              />
            </label>
            <label className="block mb-2">
              <span className="text-[10px] text-slate-400">Kalibrierung RSSI (dBm)</span>
              <input
                type="number" value={local.wasmCalibrationRssiRef}
                onChange={e => update('wasmCalibrationRssiRef', num(e.target.value, local.wasmCalibrationRssiRef))}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs font-mono text-violet-200 mt-1"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Kalibrierung Distanz (m)</span>
              <input
                type="number" step="0.1" value={local.wasmCalibrationDistRef}
                onChange={e => update('wasmCalibrationDistRef', num(e.target.value, local.wasmCalibrationDistRef))}
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs font-mono text-violet-200 mt-1"
              />
            </label>
          </div>

          {/* Mesh / Pairing */}
          <div className="rounded-2xl p-3 bg-[#060f2a]/60 border border-white/5">
            <div className="text-[10px] font-extrabold text-violet-300 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Mesh / Pairing
            </div>
            <label className="block mb-2">
              <span className="text-[10px] text-slate-400">Mesh-Intervall: <b className="text-violet-200">{local.meshIntervalMs} ms</b></span>
              <input
                type="range" min={250} max={5000} step={250}
                value={local.meshIntervalMs}
                onChange={e => update('meshIntervalMs', parseInt(e.target.value))}
                className="w-full mt-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-400"
              />
            </label>
            <div className="text-[10px] text-slate-400 mb-1">Mesh-Frequenz (MHz)</div>
            <div className="flex gap-2 mb-3">
              <input
                type="number" value={local.meshFreqStart}
                onChange={e => update('meshFreqStart', num(e.target.value, local.meshFreqStart))}
                className="w-1/2 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs font-mono text-violet-200"
              />
              <input
                type="number" value={local.meshFreqEnd}
                onChange={e => update('meshFreqEnd', num(e.target.value, local.meshFreqEnd))}
                className="w-1/2 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs font-mono text-violet-200"
              />
            </div>
            <div className="text-[10px] text-slate-400 mb-1">Kopplungsmethoden</div>
            <div className="flex gap-2 flex-wrap">
              {(['qr', 'ble', 'nfc', 'wifi'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => update('pairingMethods', { ...local.pairingMethods, [m]: !local.pairingMethods[m] })}
                  className={`text-[10px] font-bold px-2 py-1 rounded border ${local.pairingMethods[m] ? 'bg-violet-600 text-white border-violet-400' : 'bg-slate-900 text-slate-400 border-slate-700'}`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* KI-Backend */}
      <Card glow>
        <SectionTitle
          icon={<BrainCircuit className="w-4 h-4 text-amber-300" />}
          right={
            <StatusPill
              ok={local.aiEnabled}
              warn
              label={local.aiEnabled ? 'KI-Backend aktiviert' : 'KI-Backend deaktiviert (Offline-Analyse aktiv)'}
            />
          }
        >
          Rosetta-AI Backend (optional)
        </SectionTitle>
        <div className="grid md:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-[10px] text-slate-400">Basis-URL (OpenAI-kompatibel)</span>
            <input
              type="text"
              value={local.aiBaseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={e => update('aiBaseUrl', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs font-mono text-amber-100 mt-1 focus:border-amber-400 outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-slate-400">Modell</span>
            <input
              type="text"
              value={local.aiModel}
              placeholder="gpt-4o-mini"
              onChange={e => update('aiModel', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs font-mono text-amber-100 mt-1 focus:border-amber-400 outline-none"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-[10px] text-slate-400">API-Key (wird nur lokal gespeichert)</span>
            <input
              type="password"
              value={local.aiApiKey}
              placeholder="sk-…"
              onChange={e => update('aiApiKey', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs font-mono text-amber-100 mt-1 focus:border-amber-400 outline-none"
            />
          </label>
        </div>
        <div className="text-[10px] font-mono text-slate-500">
          Ohne Backend arbeitet die App im Offline-Analyse-Modus: echte Kennzahlen aus den Live-Netzwerkdaten, keine Textgenerierung.
        </div>
      </Card>

      {/* Diagnose-Ziele */}
      <Card>
        <SectionTitle icon={<Wifi className="w-4 h-4 text-cyan-300" />}>Diagnose-Ziele</SectionTitle>
        <div className="text-[11px] font-mono text-slate-400 mb-2">
          Eine URL pro Zeile — wird für die Latenzmessung verwendet.
        </div>
        <textarea
          value={local.diagTargets.join('\n')}
          onChange={e => update('diagTargets', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
          rows={4}
          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-xs font-mono text-cyan-100 focus:border-cyan-400 outline-none"
        />
      </Card>
    </div>
  );
}
