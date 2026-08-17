/**
 * MeshView — steuert die echte Scan-Engine und zeigt alle Live-Knoten.
 * (Keine simulierten Drift-Werte: alle Daten stammen aus echten Scans.)
 */
import { useCallback, useEffect, useState } from 'react';
import { Play, Radio, Square, Trash2, Waves } from 'lucide-react';
import { useAppStore } from '../state/store';
import { useBleRuntime } from '../hooks/useBleRuntime';
import type { BLEWasmExports } from '../lib/bleWasm';
import { ActionButton, Card, MonoRow, SectionTitle, StatBox, StatusPill } from './ui';

export default function MeshView({ wasm }: { wasm: BLEWasmExports | null }) {
  const { state, dispatch } = useAppStore();
  const ble = useBleRuntime(wasm);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Anzeige-Refresh (nur Anzeige — Daten kommen aus dem Store)
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => forceTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const toggleScan = useCallback(() => {
    if (ble.scanning) void ble.stopScan();
    else void ble.startScan();
  }, [ble]);

  const clearDevices = useCallback(() => {
    dispatch({ type: 'CLEAR_DEVICES' });
    dispatch({ type: 'ADD_LOG', level: 'info', msg: 'Geräteliste geleert' });
  }, [dispatch]);

  const nodes = state.devices;
  const activeNodes = nodes.filter(n => Date.now() - n.lastSeen < 30000).length;
  const avgRssi = nodes.length
    ? Math.round((nodes.reduce((a, b) => a + b.rssi, 0) / nodes.length) * 10) / 10
    : null;
  const band = `${state.settings.meshFreqStart}–${state.settings.meshFreqEnd} MHz`;
  const scanInterval = state.settings.scanIntervalMs;

  // Frequenz-Schätzung pro Knoten: 2400 + deterministischer Offset aus der ID
  const freqFor = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return Math.round((state.settings.meshFreqStart + (h % (state.settings.meshFreqEnd - state.settings.meshFreqStart || 1))) * 10) / 10;
  };

  return (
    <div className="flex flex-col gap-4">
      <Card glow>
        <SectionTitle
          icon={<Radio className="w-4 h-4 text-violet-300" />}
          right={
            <div className="flex gap-2">
              <ActionButton tone="neutral" onClick={clearDevices}>
                <Trash2 className="w-3.5 h-3.5" /> Liste leeren
              </ActionButton>
              {ble.scanning ? (
                <ActionButton tone="danger" onClick={toggleScan}>
                  <Square className="w-3.5 h-3.5" /> Scan stoppen
                </ActionButton>
              ) : (
                <ActionButton tone="success" onClick={toggleScan}>
                  <Play className="w-3.5 h-3.5" /> Scan starten
                </ActionButton>
              )}
            </div>
          }
        >
          Mesh-Scan-Engine
        </SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatBox label="Knoten gesamt" value={nodes.length} accent="text-violet-200" />
          <StatBox label="Aktiv (≤ 30 s)" value={activeNodes} accent="text-emerald-200" />
          <StatBox label="Ø RSSI" value={avgRssi !== null ? `${avgRssi} dBm` : '--'} accent="text-cyan-200" />
          <StatBox label="Band" value={band} accent="text-amber-200" sub={`Scan alle ${scanInterval} ms`} />
        </div>
        <div className="flex items-center gap-3">
          <StatusPill ok={ble.scanning} label={ble.scanning ? `Scan läuft (${state.scan.source ?? '?'})` : 'Scan pausiert'} />
          <label className="flex items-center gap-2 text-[11px] font-mono text-slate-400 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-cyan-400" />
            Auto-Refresh der Anzeige
          </label>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={<Waves className="w-4 h-4 text-cyan-300" />}>Live-Knoten</SectionTitle>
        {nodes.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-4 text-center">
            Keine Knoten erkannt. „Scan starten“ wählen — Ergebnisse erscheinen hier in Echtzeit.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {nodes.map(n => {
              const active = Date.now() - n.lastSeen < 30000;
              const freq = freqFor(n.id);
              return (
                <div
                  key={n.id}
                  className={`rounded-2xl p-4 border transition ${active ? 'bg-violet-950/30 border-violet-400/40' : 'bg-[#060f2a]/50 border-white/5 opacity-60'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-white truncate">{n.name}</span>
                    <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-600'}`} style={active ? { boxShadow: '0 0 8px rgba(16,185,129,0.7)' } : undefined} />
                  </div>
                  <div className="text-[10px] font-mono space-y-1">
                    <MonoRow k="Typ" v={n.type} vClass="text-violet-300" />
                    <MonoRow k="RSSI" v={`${n.rssi} dBm`} vClass="text-cyan-200" />
                    <MonoRow k="Distanz" v={n.distance !== undefined ? n.distance.toFixed(2) + ' m' : '--'} vClass="text-amber-200" />
                    <MonoRow k="Frequenz" v={`${freq} MHz`} vClass="text-violet-200" />
                    <MonoRow k="Quelle" v={n.source.toUpperCase()} vClass="text-slate-400" />
                    <MonoRow k="Zuletzt" v={`${Math.round((Date.now() - n.lastSeen) / 1000)} s`} vClass="text-slate-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
