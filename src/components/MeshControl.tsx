import { Radio, Settings, Play, Pause } from 'lucide-react';
import { nexus, useNexus } from '../context/NexusContext';

export default function MeshControl() {
  const snap = useNexus();
  return (
    <div className="glass-card p-5 relative overflow-hidden ring-gradient">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-violet-300" /> Mesh Client Control
        </h3>
        <button
          onClick={() => nexus.setMeshRunning(!snap.meshRunning)}
          className={`flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1.5 rounded-lg ${snap.meshRunning ? 'bg-rose-600 text-white' : 'bg-violet-600 text-white'}`}
        >
          {snap.meshRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {snap.meshRunning ? 'Pause' : 'Start'}
        </button>
      </div>
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        {snap.mesh.map((n) => (
          <button
            key={n.id}
            onClick={() => nexus.toggleMeshNode(n.id)}
            className={`text-left rounded-2xl p-3 border ${n.active ? 'bg-violet-950/50 border-violet-400/60' : 'bg-[#060f2a]/50 border-white/5 opacity-50'}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-extrabold text-violet-300">{n.id}</span>
              <span className={`w-2 h-2 rounded-full ${n.active ? 'bg-violet-400' : 'bg-slate-600'}`} />
            </div>
            <div className="text-lg font-black text-white">
              {n.freqMHz} <span className="text-xs text-slate-400">MHz</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-1">RSSI {n.rssi} dBm</div>
          </button>
        ))}
      </div>
      <div className="rounded-xl p-3 bg-[#060f2a]/60 border border-white/5 font-mono text-xs text-slate-300">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="w-3 h-3 text-violet-300" /> Frequenzüberwachung {snap.config.meshFreqStart}–{snap.config.meshFreqEnd} MHz
        </div>
        <div className="flex gap-4 text-[10px] text-slate-400">
          <span>
            Aktiv: <b className="text-white">{snap.mesh.filter((n) => n.active).length}</b>
          </span>
          <span>
            Dienst: <b className="text-amber-200">{snap.meshRunning ? 'Läuft' : 'Gestoppt'}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
