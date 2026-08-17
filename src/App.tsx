/**
 * DinGelSchwinG NEXUS-BUILDER — App-Shell mit Seitenleisten-Navigation.
 * Alle Bereiche sind über die Navigation erreichbar; der zentrale Store
 * hält den kompletten Live-Zustand.
 */
import { useEffect, useState } from 'react';
import {
  Activity, Bluetooth, BrainCircuit, Gauge, Home, Menu, Radio, Settings, SlidersHorizontal, Waves, X,
} from 'lucide-react';
import { AppStoreProvider, useAppStore } from './state/store';
import { loadBLEWasm, BLEWasmExports } from './lib/bleWasm';
import DashboardView from './views/DashboardView';
import PairingView from './views/PairingView';
import DiagnosticsView from './views/DiagnosticsView';
import MeshView from './views/MeshView';
import ReplayView from './views/ReplayView';
import RosettaView from './views/RosettaView';
import SettingsView from './views/SettingsView';
import './App.css';

type ViewId = 'dashboard' | 'pairing' | 'diagnostics' | 'mesh' | 'replay' | 'rosetta' | 'settings';

const NAV: Array<{ id: ViewId; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <Home className="w-4 h-4" /> },
  { id: 'pairing', label: 'Kopplung', icon: <Bluetooth className="w-4 h-4" /> },
  { id: 'diagnostics', label: 'Diagnose', icon: <Gauge className="w-4 h-4" /> },
  { id: 'mesh', label: 'Mesh', icon: <Radio className="w-4 h-4" /> },
  { id: 'replay', label: 'Replay', icon: <Waves className="w-4 h-4" /> },
  { id: 'rosetta', label: 'Rosetta AI', icon: <BrainCircuit className="w-4 h-4" /> },
  { id: 'settings', label: 'Einstellungen', icon: <SlidersHorizontal className="w-4 h-4" /> },
];

function Shell() {
  const { state } = useAppStore();
  const [view, setView] = useState<ViewId>('dashboard');
  const [wasm, setWasm] = useState<BLEWasmExports | null>(null);
  const [wasmSource, setWasmSource] = useState<'wasm' | 'js-fallback' | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBLEWasm().then(res => {
      if (!alive) return;
      setWasm(res.module);
      setWasmSource(res.source);
    });
    return () => { alive = false; };
  }, []);

  const scanActive = state.scan.running;
  const deviceCount = state.devices.length;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-[#020617] via-[#050a18] to-[#0b1220] text-slate-100 font-sans selection:bg-cyan-400/30 overflow-hidden">
      {/* Kopfzeile */}
      <header className="shrink-0 bg-[#050a18]/80 backdrop-blur-2xl border-b border-white/10 px-4 md:px-6 py-3 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNavOpen(!navOpen)}
            className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-cyan-200 border border-white/10"
            aria-label="Menü"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-cyan-200 to-violet-200 leading-none glow-text">
              DinGelSchwinG <span className="text-xs font-medium text-slate-400 align-top ml-1">NEXUS-BUILDER</span>
            </h1>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              BLE-Mesh · WASM-Distanz · 3D · Sensor-Fusion · KI
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${scanActive ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${scanActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {scanActive ? `Scan aktiv (${state.scan.source ?? '?'})` : 'Scan pausiert'}
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400">
            <Activity className="w-3 h-3 text-cyan-300" /> {deviceCount} Geräte
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${wasmSource === 'wasm' ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-amber-950 text-amber-200 border-amber-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${wasmSource === 'wasm' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {wasmSource === 'wasm' ? 'WASM' : wasmSource === 'js-fallback' ? 'WASM-Fallback' : 'WASM lädt'}
          </span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Seitenleiste */}
        <nav
          className={`${navOpen ? 'absolute inset-y-0 left-0 z-50 w-64 translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static shrink-0 w-64 bg-[#04091a]/90 backdrop-blur-2xl border-r border-white/10 flex flex-col transition-transform duration-200 overflow-y-auto`}
          style={{ top: 0 }}
        >
          <div className="lg:hidden flex justify-end p-2">
            <button onClick={() => setNavOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-white" aria-label="Schließen">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-3 pt-4 lg:pt-3 flex-1">
            <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest px-2 mb-2">Bereiche</div>
            <div className="flex flex-col gap-1">
              {NAV.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setView(item.id); setNavOpen(false); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition ${
                    view === item.id
                      ? 'bg-gradient-to-r from-cyan-600/30 to-blue-700/20 text-white ring-1 ring-cyan-400/40'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 border-t border-white/10 text-[10px] font-mono text-slate-600">
            v2.0 · echte Messwerte · kein Mock-Code
          </div>
        </nav>

        {/* Inhalt */}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 md:px-6 py-5">
          {view === 'dashboard' && <DashboardView wasm={wasm} />}
          {view === 'pairing' && <PairingView wasm={wasm} />}
          {view === 'diagnostics' && <DiagnosticsView />}
          {view === 'mesh' && <MeshView wasm={wasm} />}
          {view === 'replay' && <ReplayView />}
          {view === 'rosetta' && <RosettaView onGoSettings={() => setView('settings')} />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>

      <footer className="shrink-0 border-t border-white/10 py-2.5 text-center text-[10px] text-slate-600 font-mono tracking-wide bg-[#020617]/60">
        DinGelSchwinG · NEXUS-BUILDER · WASM-BLE · Kopplung via QR / BLE / NFC / WiFi · echte Diagnose-Messungen
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <Shell />
    </AppStoreProvider>
  );
}
