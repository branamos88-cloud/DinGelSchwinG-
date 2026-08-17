import { Activity } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

export default function StatusBoard() {
  const snap = useNexus();
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-black text-white flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-emerald-300" /> Live-Status
      </h3>
      <div className="text-[10px] font-mono text-slate-400 mb-2">
        {snap.statusMsg} · WASM {snap.wasmReady ? 'aktiv' : 'JS-Bridge'} · {snap.caps.platform}
      </div>
      <div className="space-y-1.5">
        {snap.live.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-xs bg-black/20 rounded-lg px-2 py-1.5">
            <span className="font-mono text-slate-200">{d.id}</span>
            <span className={d.online ? 'text-emerald-300' : 'text-rose-300'}>
              {d.online ? '●' : '○'} {d.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
