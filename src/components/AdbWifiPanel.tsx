import { useState } from 'react';
import { Smartphone, Wifi, Link2, KeyRound, RefreshCw } from 'lucide-react';
import { nexus, useNexus } from '../context/NexusContext';
import { toUserMessage } from '../domain/errors';

const STATE_CLR: Record<string, string> = {
  found: 'text-slate-300',
  probing: 'text-amber-300',
  open: 'text-cyan-300',
  cnxn: 'text-emerald-300',
  tls: 'text-violet-300',
  paired: 'text-emerald-200',
  failed: 'text-rose-300',
};

export default function AdbWifiPanel() {
  const snap = useNexus();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const pct = snap.discovery.percent;
  const enabled = snap.config.pairingMethods.adb !== false;

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-cyan-300" /> ADB WiFi Client · Discovery
        </h3>
        <button
          disabled={!enabled}
          onClick={() => {
            setMsg(null);
            void nexus.discoverAdb().then((list) => setMsg(`${list.length} Clients`)).catch((e) => setMsg(toUserMessage(e).detail));
          }}
          className="text-xs font-extrabold px-3 py-1.5 rounded-lg bg-cyan-700 text-white flex items-center gap-1 disabled:opacity-40"
        >
          <RefreshCw className="w-3 h-3" /> Scan
        </button>
      </div>
      <div>
        <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
          <span>{snap.discovery.phase}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[10px] font-mono text-slate-500 mt-1">
          {snap.discovery.found} Nodes · {snap.discovery.adb} ADB · mDNS _adb-tls-connect / :5555 / CNXN
        </div>
      </div>
      {msg && <div className="text-xs text-cyan-200">{msg}</div>}
      <div className="space-y-2">
        {snap.adbClients.length === 0 && <div className="text-xs text-slate-500">Keine ADB-Clients. Wireless Debugging auf dem Zielgerät aktivieren.</div>}
        {snap.adbClients.map((c) => (
          <div key={c.id} className="rounded-xl border border-white/10 p-3 bg-[#060f2a]/50">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5 text-cyan-300" /> {c.name}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {c.host}:{c.port} · {c.service} · <span className={STATE_CLR[c.state] ?? ''}>{c.state}</span>
                  {c.latencyMs != null ? ` · ${c.latencyMs}ms` : ''}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  className="text-[10px] font-extrabold px-2 py-1 rounded bg-emerald-700 text-white flex items-center gap-1"
                  onClick={() => void nexus.connectAdb(c.id).then((x) => setMsg(`${x.host} → ${x.state}`)).catch((e) => setMsg(toUserMessage(e).detail))}
                >
                  <Link2 className="w-3 h-3" /> Connect
                </button>
              </div>
            </div>
            {c.service === 'pairing' || c.pairingPort ? (
              <div className="flex gap-2 mt-2">
                <input
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                  placeholder="Pairing-Code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button
                  className="text-[10px] font-extrabold px-2 py-1 rounded bg-violet-700 text-white flex items-center gap-1"
                  onClick={() => void nexus.pairAdb(c.id, code).then((x) => setMsg(x.state)).catch((e) => setMsg(toUserMessage(e).detail))}
                >
                  <KeyRound className="w-3 h-3" /> Pair
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
