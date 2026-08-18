import { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { nexus, useNexus } from '../context/NexusContext';
import { toUserMessage } from '../domain/errors';

const ICON: Record<string, string> = { network: '🌐', wifi: '📶', ble: '🔵', ntag: '🏷️', dongle: '🔌', hardware: '🖥️' };

export default function OverviewPanel() {
  const snap = useNexus();
  const [trace, setTrace] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const audit = nexus.listAudit(120, trace || undefined);

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <LayoutDashboard className="w-4 h-4 text-amber-300" /> Control Room
        </h3>
        <span className="text-[10px] font-mono text-emerald-300">● Live · {snap.clients.filter((c) => c.connected).length} Clients</span>
      </div>
      {msg && <div className="text-xs text-emerald-200">{msg}</div>}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-[10px] uppercase text-slate-400 mb-2">Clients</div>
          {snap.clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
              <span className="font-mono text-slate-200">
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${c.connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                {c.user} ({c.role}) {c.mode === 'server' ? '· SERVER' : ''}
              </span>
              <span className="flex gap-1">
                {c.mode !== 'server' && (
                  <button
                    className="px-2 py-0.5 border border-white/10 rounded"
                    onClick={() =>
                      nexus.setClientMode(c.id, 'server').then(() => setMsg('Als Server markiert')).catch((e) => setMsg(toUserMessage(e).detail))
                    }
                  >
                    Server
                  </button>
                )}
                <button
                  className="px-2 py-0.5 border border-rose-800 text-rose-300 rounded"
                  onClick={() => nexus.kickClient(c.id).catch((e) => setMsg(toUserMessage(e).detail))}
                >
                  Kick
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-[10px] uppercase text-slate-400 mb-2">Gebundene Geräte</div>
          {snap.bound.length === 0 && <div className="text-xs text-slate-500">Keine Bindungen.</div>}
          {snap.bound.map((b) => {
            const live = snap.live.find((d) => d.id === b.id);
            return (
              <div key={b.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
                <span>
                  {ICON[b.kind]} {b.label}
                </span>
                <span className={live?.online ? 'text-emerald-300' : 'text-rose-300'}>{live?.online ? 'online' : 'offline'}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 p-3">
        <div className="text-[10px] uppercase text-slate-400 mb-2">Discovery</div>
        <div className="grid sm:grid-cols-2 gap-1">
          {snap.nodes.map((n) => (
            <div key={n.id} className="text-xs font-mono text-slate-300 flex justify-between">
              <span>
                {ICON[n.kind]} {n.id}
              </span>
              <span className="text-cyan-300">{n.signal?.rssi ?? '—'} dBm</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase text-slate-400">Audit-Trail</div>
          <input
            className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[10px] text-white w-40"
            placeholder="Trace-ID"
            value={trace}
            onChange={(e) => setTrace(e.target.value)}
          />
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {audit.map((a, i) => (
            <div key={i} className="text-[10px] font-mono flex gap-2 text-slate-400">
              <span>{a.trace_id.slice(0, 6)}.{a.step}</span>
              <span className={a.result === 'ok' ? 'text-emerald-300' : a.result === 'denied' ? 'text-rose-300' : 'text-amber-300'}>{a.event}</span>
              <span className="truncate flex-1">{a.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
