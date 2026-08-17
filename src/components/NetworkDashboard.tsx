import { useState, useMemo } from 'react';
import { Radio, Wifi, Bluetooth, ShieldCheck, Cpu, Waves, MapPin, Activity, Zap, Layers, CircleDot } from 'lucide-react';
import Scene3D from './Scene3D';
import { useSensors } from '../hooks/useSensors';
import { nexus, useNexus } from '../context/NexusContext';

export default function NetworkDashboard() {
  const snap = useNexus();
  const sensors = useSensors();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mode = snap.config.defaultMode;
  const selected = snap.nodes.find((d) => d.id === selectedId);

  const sceneDevices = useMemo(
    () =>
      snap.nodes.map((d) => ({
        id: d.id,
        name: d.label,
        x: d.x,
        y: d.y,
        z: d.z,
        type: d.sceneType,
        rssi: d.signal?.rssi,
      })),
    [snap.nodes],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1"><CircleDot className="w-3 h-3 text-amber-400" /> Master</span>
          <span className="flex items-center gap-1"><CircleDot className="w-3 h-3 text-emerald-400" /> Client</span>
          <span className="flex items-center gap-1"><CircleDot className="w-3 h-3 text-rose-400" /> Ziel</span>
        </div>
        <div className="flex items-center gap-2">
          {(['ble', 'wifi', 'usb'] as const).map((m) => (
            <button
              key={m}
              onClick={() => nexus.updateConfig({ ...snap.config, defaultMode: m })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold ${mode === m ? 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white' : 'bg-white/5 text-slate-300'}`}
            >
              {m === 'ble' && <Bluetooth className="w-3.5 h-3.5" />}
              {m === 'wifi' && <Wifi className="w-3.5 h-3.5" />}
              {m === 'usb' && <Radio className="w-3.5 h-3.5" />}
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-gradient-to-b from-[#060f2a] to-[#020617]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-200">
            <Layers className="w-3.5 h-3.5 text-amber-300" /> 3D-Raumdarstellung
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${snap.wasmReady ? 'bg-emerald-900/60 text-emerald-200 border-emerald-600/40' : 'bg-amber-900/40 text-amber-200 border-amber-600/30'}`}>
              {snap.wasmReady ? 'WASM aktiv' : 'JS-Bridge'}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            Modus: <span className="text-white font-bold">{mode.toUpperCase()}</span>
          </div>
        </div>
        <div className="h-[380px] md:h-[500px] relative">
          <Scene3D devices={sceneDevices} onSelect={setSelectedId} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {snap.nodes.map((d) => {
          const dist = nexus.distance(d);
          return (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`text-left rounded-2xl p-4 glass-card ${selectedId === d.id ? 'ring-2 ring-amber-300/60' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-extrabold uppercase ${d.sceneType === 'master' ? 'text-amber-300' : d.sceneType === 'client' ? 'text-emerald-300' : d.sceneType === 'target' ? 'text-rose-300' : 'text-slate-400'}`}>
                  {d.sceneType}
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${d.online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              </div>
              <div className="text-base font-black text-white leading-tight mb-1.5">{d.label}</div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span>RSSI <b className="text-cyan-200">{d.signal?.rssi ?? '--'}</b></span>
                <span>Dist <b className="text-amber-200">{dist.toFixed(2)}m</b></span>
              </div>
              <div className="mt-3 pt-2 border-t border-white/5 flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                <MapPin className="w-3 h-3" /> {d.x.toFixed(1)}, {d.y.toFixed(1)}, {d.z.toFixed(1)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-blue-950/40 to-indigo-950/40 border border-blue-800/30">
          <h3 className="text-sm font-black text-blue-100 flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-blue-300" /> Geräte-Sensoren
          </h3>
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            {[
              { label: 'Alpha', val: sensors.alpha },
              { label: 'Beta', val: sensors.beta },
              { label: 'Gamma', val: sensors.gamma },
            ].map((s) => (
              <div key={s.label} className="bg-[#060f2a]/60 rounded-xl p-2.5 border border-white/5">
                <div className="text-[10px] text-slate-400">{s.label}</div>
                <div className="font-bold text-sm text-cyan-300">{s.val !== null ? s.val.toFixed(1) + '°' : '--'}</div>
              </div>
            ))}
            <div className="col-span-3 bg-[#060f2a]/60 rounded-xl p-2.5 border border-white/5">
              <div className="text-[10px] text-slate-400 mb-1">Beschleunigung</div>
              <div className="flex gap-3 text-xs font-black">
                <span className="text-rose-300">X {sensors.acceleration?.x.toFixed(2) ?? '--'}</span>
                <span className="text-emerald-300">Y {sensors.acceleration?.y.toFixed(2) ?? '--'}</span>
                <span className="text-amber-300">Z {sensors.acceleration?.z.toFixed(2) ?? '--'}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void sensors.requestPermission()} className="text-[11px] bg-blue-600 text-white px-3 py-1.5 rounded-lg font-extrabold">
              Sensor-Berechtigung
            </button>
            <span className={`text-[11px] px-2.5 py-1.5 rounded-lg font-mono font-extrabold border ${sensors.permissionGranted ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-rose-950 text-rose-300 border-rose-700'}`}>
              {sensors.permissionGranted ? 'Gewährt' : 'Nicht gewährt'}
            </span>
          </div>
        </div>

        <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-950/30 to-orange-950/30 border border-amber-800/30">
          <h3 className="text-sm font-black text-amber-100 flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-amber-300" /> WASM-Abstandsbestimmung
          </h3>
          <div className="text-xs font-mono text-slate-300 space-y-1">
            <div className="flex justify-between border-b border-amber-800/30 py-1"><span>Modul</span><b className="text-amber-200">{snap.wasmReady ? 'geladen' : 'JS-Bridge'}</b></div>
            <div className="flex justify-between border-b border-amber-800/30 py-1"><span>Formel</span><span className="text-amber-200">d = 10^((Tx-RSSI)/(10·n))</span></div>
            <div className="flex justify-between py-1"><span>Gelernter n</span><b className="text-amber-200">{snap.learnedN.toFixed(3)}</b></div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-300" /> Details
          </h3>
          {selected ? (
            <div className="text-xs font-mono space-y-1.5 text-slate-300">
              <div className="flex justify-between"><span className="text-slate-500">ID</span><b className="text-cyan-200">{selected.id}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Name</span><b className="text-white">{selected.label}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Typ</span><b>{selected.sceneType}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">RSSI</span><b className="text-cyan-200">{selected.signal?.rssi ?? '--'} dBm</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Distanz</span><b className="text-amber-300">{nexus.distance(selected).toFixed(3)} m</b></div>
              <button
                className="mt-2 text-xs font-extrabold px-3 py-1.5 rounded-lg bg-emerald-700 text-white"
                onClick={() => nexus.bindDevice(selected.id, 'manual')}
              >
                Binden
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">Wähle ein Gerät in der 3D-Ansicht.</div>
          )}
        </div>
        <div className="glass-card p-5">
          <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2">
            <Waves className="w-4 h-4 text-violet-300" /> Engine
          </h3>
          <div className="text-xs font-mono text-slate-300 space-y-1">
            <div>{snap.statusMsg}</div>
            <div>Native: {String(snap.caps.native)} · BLE {String(snap.caps.ble)} · NFC {String(snap.caps.nfc)} · USB {String(snap.caps.usb)}</div>
            <div>Gebunden: {snap.bound.length} · Pairings: {snap.pairings.length}</div>
          </div>
          <button
            onClick={() => {
              if (!selected) return;
              const n = nexus.learnFrom(selected);
              alert(`Lernen abgeschlossen: n = ${n.toFixed(3)}`);
            }}
            className="mt-3 text-xs font-extrabold px-4 py-2 rounded-xl bg-gradient-to-br from-amber-600 to-violet-700 text-white flex items-center gap-1"
          >
            <Zap className="w-3 h-3" /> Client-Feedback lernen
          </button>
        </div>
      </div>
    </div>
  );
}
