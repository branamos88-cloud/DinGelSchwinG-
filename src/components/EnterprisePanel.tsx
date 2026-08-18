import { useState } from 'react';
import { Server } from 'lucide-react';
import { NodeCategory, getAllNodeConfigs } from '../config/enterprise-nodes';
import { nexus } from '../engine/nexus';

export default function EnterprisePanel() {
  const nodes = getAllNodeConfigs();
  const [probe, setProbe] = useState<Record<string, string>>({});

  return (
    <div className="glass-card p-5 space-y-3">
      <h3 className="text-sm font-black text-white flex items-center gap-2">
        <Server className="w-4 h-4 text-violet-300" /> Enterprise Nodes
      </h3>
      {nodes.map((n) => (
        <div key={n.nodeId} className="rounded-xl border border-white/10 p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-amber-200">{n.category}</div>
              <div className="text-sm text-white font-black">{n.nodeName}</div>
              <div className="text-[10px] font-mono text-slate-400 break-all">{n.endpointUrl}</div>
            </div>
            <button
              className="text-[10px] font-extrabold px-2 py-1 rounded bg-violet-700 text-white"
              onClick={async () => {
                const r = await nexus.probeEnterprise(n.category as NodeCategory);
                setProbe((p) => ({ ...p, [n.nodeId]: `${r.ok ? 'OK' : 'DOWN'} ${r.latencyMs}ms · ${r.detail}` }));
              }}
            >
              Probe
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mt-2">{n.primaryFunction}</p>
          <div className="text-[10px] text-slate-500 mt-1">Auth: {n.authentication} · {n.securityLayer}</div>
          {probe[n.nodeId] && <div className="text-[10px] font-mono text-cyan-200 mt-1">{probe[n.nodeId]}</div>}
        </div>
      ))}
    </div>
  );
}
