/**
 * DashboardView — Live-Netzwerkübersicht
 * 3D-Szene, Gerätekarten (echte Scan-Daten), Sensoren, WASM-Status & Lernen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Bluetooth, BrainCircuit, Layers, MapPin, Play, Radar, ShieldCheck, Square, Waves,
} from 'lucide-react';
import Scene3D from '../components/Scene3D';
import { useAppStore } from '../state/store';
import { useBleRuntime } from '../hooks/useBleRuntime';
import { useSensorFusion } from '../hooks/useSensorFusion';
import { positionFromDistance } from '../state/devicePosition';
import type { BLEWasmExports } from '../lib/bleWasm';
import { ActionButton, Card, MonoRow, SectionTitle, StatBox, StatusPill } from './ui';
import type { Device } from '../state/types';

export default function DashboardView({ wasm }: { wasm: BLEWasmExports | null }) {
  const { state, dispatch } = useAppStore();
  const ble = useBleRuntime(wasm);
  const sensors = useSensorFusion();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const devices = state.devices;
  const selectedDevice = devices.find(d => d.id === selectedId) ?? null;

  // Sensor-Fusion: Positionen anhand Master-Ausrichtung neu projizieren
  useEffect(() => {
    if (!sensors.permissionGranted || sensors.beta === null || sensors.alpha === null) return;
    for (const d of devices) {
      if (d.type === 'master' || d.source === 'demo') continue;
      const pos = positionFromDistance(d.distance ?? 1.5, d.id, {
        alpha: sensors.alpha,
        beta: sensors.beta,
        gamma: sensors.gamma,
      });
      dispatch({ type: 'UPSERT_DEVICE', device: { ...d, x: pos.x, y: pos.y, z: pos.z } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensors.alpha, sensors.beta, sensors.permissionGranted]);

  const handleLearn = useCallback(async () => {
    if (!selectedDevice || !wasm) return;
    try {
      // Reale Bestätigung: gemessene Distanz des selektierten Geräts
      const confirmedDist = selectedDevice.distance ?? 2.0;
      const confirmedRssi = selectedDevice.rssi;
      const newN = wasm.learn_from_feedback(
        state.settings.wasmCalibrationRssiRef,
        state.settings.wasmCalibrationDistRef,
        confirmedRssi,
        confirmedDist
      );
      dispatch({
        type: 'SET_SETTINGS',
        settings: { bleEnvFactor: Math.round(newN * 1000) / 1000 },
      });
      dispatch({ type: 'ADD_LOG', level: 'success', msg: `Lernschritt: n = ${newN.toFixed(3)} (aus ${selectedDevice.name})` });
    } catch {
      dispatch({ type: 'ADD_LOG', level: 'error', msg: 'Lernprozess fehlgeschlagen' });
    }
  }, [selectedDevice, wasm, state.settings.wasmCalibrationRssiRef, state.settings.wasmCalibrationDistRef, dispatch]);

  const sceneDevices = useMemo(
    () => devices.map(d => ({ id: d.id, name: d.name, x: d.x, y: d.y, z: d.z, type: d.type, rssi: d.rssi })),
    [devices]
  );

  const cardTone = (t: Device['type']) =>
    t === 'master'
      ? 'from-amber-900/40 to-amber-950/60 border-amber-500/40'
      : t === 'client'
        ? 'from-emerald-900/40 to-emerald-950/60 border-emerald-500/40'
        : t === 'target'
          ? 'from-rose-900/40 to-rose-950/60 border-rose-500/40'
          : 'from-slate-800/60 to-slate-950/60 border-slate-600/30';
  const dotColor = (t: Device['type']) =>
    t === 'master' ? '#F59E0B' : t === 'client' ? '#10B981' : t === 'target' ? '#EF4444' : '#9CA3AF';

  const hasDemo = devices.some(d => d.source === 'demo');

  return (
    <div className="flex flex-col gap-6">
      {/* Scan-Steuerung */}
      <Card glow>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[220px]">
            <Radar className="w-6 h-6 text-cyan-300" />
            <div>
              <div className="text-sm font-black text-white">Live-Scan</div>
              <div className="text-[11px] font-mono text-slate-400">
                {state.devices.length} Geräte sichtbar · Quelle: {state.scan.source ?? '—'}
              </div>
            </div>
          </div>
          <StatusPill
            ok={ble.capability !== 'none'}
            warn={ble.capability === 'none' && !state.settings.demoMode}
            label={ble.capability === 'native' ? 'BLE: NATIV (Android)' : ble.capability === 'web' ? 'BLE: Web-Bluetooth' : 'BLE: nicht verfügbar'}
          />
          {!ble.scanning ? (
            <ActionButton tone="success" onClick={() => { void ble.startScan(); }}>
              <Play className="w-3.5 h-3.5" /> Scan starten
            </ActionButton>
          ) : (
            <ActionButton tone="danger" onClick={() => { void ble.stopScan(); }}>
              <Square className="w-3.5 h-3.5" /> Scan stoppen
            </ActionButton>
          )}
        </div>
        {hasDemo && (
          <div className="mt-3 text-[11px] font-mono px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-700/40 text-amber-200">
            ⚠ Demo-Modus: angezeigte Geräte sind simuliert (keine echte Hardware). Einstellungen → Demo-Modus deaktivieren.
          </div>
        )}
        {state.scan.error && (
          <div className="mt-3 text-[11px] font-mono px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-700/40 text-rose-200">
            {state.scan.error}
          </div>
        )}
      </Card>

      {/* 3D-Szene */}
      <Card className="p-0 overflow-hidden" glow>
        <div className="flex items-center justify-between px-5 py-3 bg-[#060f2a]/70 border-b border-white/10">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-200">
            <Layers className="w-3.5 h-3.5 text-amber-300" /> 3D-Raumdarstellung
            <StatusPill ok={wasm !== null} label={wasm ? 'WASM aktiv' : 'WASM lädt…'} />
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            {devices.length === 0 ? 'Noch keine Geräte — Scan starten' : `${devices.length} Geräte`}
          </div>
        </div>
        <div className="h-[380px] md:h-[480px] relative">
          <Scene3D devices={sceneDevices} onSelect={setSelectedId} />
        </div>
      </Card>

      {/* Gerätekarten */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {devices.length === 0 && (
          <div className="col-span-full text-center text-xs font-mono text-slate-500 py-8">
            Keine Geräte im Netz. „Scan starten“ klicken oder Demo-Modus in den Einstellungen aktivieren.
          </div>
        )}
        {devices.map(d => (
          <button
            key={d.id}
            onClick={() => setSelectedId(d.id)}
            className={`text-left rounded-2xl p-4 glass-card border transition-all duration-200 hover:-translate-y-0.5 ${cardTone(d.type)} ${selectedId === d.id ? 'scale-[1.03] ring-2 ring-amber-300/60' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300">{d.type}</span>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: dotColor(d.type), boxShadow: `0 0 8px ${dotColor(d.type)}66` }} />
            </div>
            <div className="text-sm font-black text-white leading-tight mb-1.5 truncate">{d.name}</div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <span>RSSI <b className="text-cyan-200">{d.rssi}</b></span>
              <span>·</span>
              <span>Dist <b className="text-amber-200">{d.distance !== undefined ? d.distance.toFixed(2) + 'm' : '--'}</b></span>
            </div>
            <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {d.x.toFixed(1)}, {d.y.toFixed(1)}, {d.z.toFixed(1)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'REMOVE_DEVICE', id: d.id }); }}
                className="text-slate-600 hover:text-rose-400 text-xs font-black"
                title="Gerät entfernen"
              >✕</button>
            </div>
          </button>
        ))}
      </div>

      {/* Sensoren + WASM */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={<Waves className="w-4 h-4 text-cyan-300" />}>Geräte-Sensoren (echt)</SectionTitle>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatBox label="Alpha" value={sensors.alpha !== null ? sensors.alpha.toFixed(1) + '°' : '--'} accent="text-cyan-200" />
            <StatBox label="Beta" value={sensors.beta !== null ? sensors.beta.toFixed(1) + '°' : '--'} accent="text-amber-200" />
            <StatBox label="Gamma" value={sensors.gamma !== null ? sensors.gamma.toFixed(1) + '°' : '--'} accent="text-violet-200" />
          </div>
          <div className="bg-[#060f2a]/60 rounded-xl p-3 border border-white/5 mb-3">
            <div className="text-[10px] text-slate-400 mb-1">Beschleunigung (m/s²)</div>
            <div className="flex gap-3 text-xs font-black font-mono">
              <span className="text-rose-300">X {sensors.acceleration?.x.toFixed(2) ?? '--'}</span>
              <span className="text-emerald-300">Y {sensors.acceleration?.y.toFixed(2) ?? '--'}</span>
              <span className="text-amber-300">Z {sensors.acceleration?.z.toFixed(2) ?? '--'}</span>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <ActionButton tone="primary" onClick={() => { void sensors.requestPermission(); }}>
              Sensor-Berechtigung
            </ActionButton>
            <StatusPill ok={sensors.permissionGranted} label={sensors.permissionGranted ? 'Gewährt' : 'Nicht gewährt'} />
            {!sensors.available && <span className="text-[10px] font-mono text-slate-500">(nur auf Mobilgeräten)</span>}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={<BrainCircuit className="w-4 h-4 text-amber-300" />}>WASM-Abstand & Lernen</SectionTitle>
          <div className="text-xs font-mono space-y-1.5 mb-3">
            <MonoRow k="Modul" v={wasm ? 'geladen' : 'lädt…'} vClass="text-amber-200" />
            <MonoRow k="Formel" v="d = 10^((Tx−RSSI)/(10·n))" vClass="text-slate-300" />
            <MonoRow k="Gelernter n" v={wasm ? wasm.get_learned_n().toFixed(3) : '--'} vClass="text-violet-200" />
            <MonoRow k="Eingestellter n" v={state.settings.bleEnvFactor.toFixed(2)} vClass="text-cyan-200" />
            <MonoRow k="Kalibrierung" v={`${state.settings.wasmCalibrationRssiRef} dBm @ ${state.settings.wasmCalibrationDistRef} m`} vClass="text-slate-300" />
          </div>
          <div className="flex flex-col gap-2">
            <ActionButton
              tone="warn"
              disabled={!selectedDevice || !wasm}
              onClick={() => { void handleLearn(); }}
            >
              <Activity className="w-3.5 h-3.5" />
              {selectedDevice ? `Lernen mit ${selectedDevice.name} (${selectedDevice.distance !== undefined ? selectedDevice.distance.toFixed(2) : '?'} m)` : 'Gerät zum Lernen auswählen'}
            </ActionButton>
            <div className="text-[10px] font-mono text-slate-500">
              Passt den Umgebungsfaktor n anhand der real gemessenen Distanz des gewählten Geräts an.
            </div>
          </div>
        </Card>
      </div>

      {/* Details + gebundene Clients */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={<ShieldCheck className="w-4 h-4 text-amber-300" />}>Geräte-Details</SectionTitle>
          {selectedDevice ? (
            <div className="text-xs font-mono space-y-1.5">
              <MonoRow k="ID" v={selectedDevice.id} vClass="text-cyan-200" />
              <MonoRow k="Name" v={selectedDevice.name} />
              <MonoRow k="Typ" v={selectedDevice.type} vClass="text-amber-200" />
              <MonoRow k="Quelle" v={selectedDevice.source.toUpperCase()} vClass="text-slate-300" />
              <MonoRow k="RSSI" v={`${selectedDevice.rssi} dBm`} vClass="text-cyan-200" />
              <MonoRow k="TxPower" v={`${selectedDevice.txPower} dBm`} vClass="text-amber-200" />
              <MonoRow k="Distanz (WASM)" v={selectedDevice.distance !== undefined ? selectedDevice.distance.toFixed(3) + ' m' : '--'} vClass="text-amber-300" />
              <MonoRow k="Position" v={`(${selectedDevice.x.toFixed(2)}, ${selectedDevice.y.toFixed(2)}, ${selectedDevice.z.toFixed(2)})`} vClass="text-violet-300" />
              <MonoRow k="Gebunden" v={selectedDevice.bound ? 'Ja' : 'Nein'} vClass={selectedDevice.bound ? 'text-emerald-300' : 'text-slate-400'} />
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">Gerät in der 3D-Szene oder Kartenliste auswählen.</div>
          )}
        </Card>

        <Card>
          <SectionTitle icon={<Bluetooth className="w-4 h-4 text-violet-300" />}>Gebundene Clients</SectionTitle>
          <div className="flex flex-col gap-2">
            {state.boundDevices.length === 0 ? (
              <div className="text-xs text-slate-500 italic">Noch keine Kopplung — siehe Bereich „Kopplung“.</div>
            ) : (
              state.boundDevices.map(c => (
                <div key={c.id} className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-700/30 rounded-xl px-3 py-2 text-emerald-100">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  <div className="flex-1 truncate font-bold text-xs">{c.name}</div>
                  <div className="text-[10px] text-emerald-300 font-extrabold">{c.method.toUpperCase()}</div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
