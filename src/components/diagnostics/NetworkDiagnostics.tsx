import { useState } from 'react';
import { Activity, Zap, Wifi, Server, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { nexus } from '../../engine/nexus';

interface PingResult {
  target: string;
  latencyMs: number | null;
  status: 'pending' | 'ok' | 'fail';
  error?: string;
}

export default function NetworkDiagnostics() {
  const [pingResults, setPingResults] = useState<PingResult[]>([
    { target: '8.8.8.8', latencyMs: null, status: 'pending' },
    { target: '1.1.1.1', latencyMs: null, status: 'pending' },
    { target: 'gateway.local', latencyMs: null, status: 'pending' },
  ]);
  const [speed, setSpeed] = useState<{ mbps: string; ms: string; status: string; err?: string }>({ mbps: '--', ms: '—', status: 'idle' });
  const [iperf, setIperf] = useState<{ mbps: string; pkts: string; status: string; err?: string }>({ mbps: '--', pkts: '—', status: 'idle' });
  const [running, setRunning] = useState(false);

  const handleRunAll = async () => {
    setRunning(true);
    setPingResults((p) => p.map((r) => ({ ...r, status: 'pending', latencyMs: null, error: undefined })));
    setSpeed({ mbps: '--', ms: '…', status: 'run' });
    setIperf({ mbps: '--', pkts: '…', status: 'run' });
    for (const r of ['8.8.8.8', '1.1.1.1', 'gateway.local']) {
      const res = await nexus.diagnosePing(r);
      setPingResults((prev) =>
        prev.map((p) =>
          p.target === r
            ? { target: r, latencyMs: res.latencyMs, status: res.ok ? 'ok' : 'fail', error: res.error }
            : p,
        ),
      );
    }
    try {
      const s = await nexus.diagnoseSpeed();
      setSpeed({ mbps: ((s.bytesPerSec * 8) / 1e6).toFixed(1) + ' Mbps', ms: Math.round(s.durationMs) + 'ms', status: 'ok' });
    } catch (e) {
      setSpeed({ mbps: '--', ms: '—', status: 'fail', err: e instanceof Error ? e.message : 'fail' });
    }
    try {
      const t = await nexus.diagnoseThroughput();
      setIperf({ mbps: t.mbps + ' Mbps', pkts: String(t.packets), status: 'ok' });
    } catch (e) {
      setIperf({ mbps: '--', pkts: '—', status: 'fail', err: e instanceof Error ? e.message : 'fail' });
    }
    setRunning(false);
  };

  return (
    <div className="glass-card p-5 relative overflow-hidden ring-gradient">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-300" /> Netzwerk-Diagnose
        </h3>
        <button
          onClick={() => void handleRunAll()}
          disabled={running}
          className={`text-xs font-extrabold px-3 py-1.5 rounded-lg ${running ? 'bg-slate-800 text-slate-400' : 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white'}`}
        >
          {running ? 'Läuft…' : 'Alle Tests starten'}
        </button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded-2xl p-3 bg-[#060f2a]/60 border border-white/5">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-cyan-300 uppercase mb-2">
            <Server className="w-3 h-3" /> Ping
          </div>
          {pingResults.map((p) => (
            <div key={p.target} className="flex items-center justify-between text-xs font-mono bg-black/20 rounded-lg px-2 py-1.5 mb-1">
              <div className="flex items-center gap-1.5">
                {p.status === 'ok' ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : p.status === 'fail' ? <AlertCircle className="w-3 h-3 text-rose-400" /> : <Clock className="w-3 h-3 text-amber-300" />}
                <span className="text-slate-300">{p.target}</span>
              </div>
              <span className={p.status === 'ok' ? 'text-emerald-300' : p.status === 'fail' ? 'text-rose-300' : 'text-amber-200'}>
                {p.latencyMs !== null ? `${p.latencyMs}ms` : p.error || '--'}
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl p-3 bg-[#060f2a]/60 border border-white/5 text-center">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-amber-300 uppercase mb-2 justify-center">
            <Wifi className="w-3 h-3" /> Speed
          </div>
          <div className="text-2xl font-black text-white">{speed.mbps}</div>
          <div className="text-[10px] text-slate-400">{speed.ms}</div>
          {speed.err && <div className="text-[10px] text-rose-300">{speed.err}</div>}
        </div>
        <div className="rounded-2xl p-3 bg-[#060f2a]/60 border border-white/5 text-center">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-violet-300 uppercase mb-2 justify-center">
            <Activity className="w-3 h-3" /> Durchsatz
          </div>
          <div className="text-2xl font-black text-violet-200">{iperf.mbps}</div>
          <div className="text-[10px] text-slate-400">{iperf.pkts} Pakete</div>
          {iperf.err && <div className="text-[10px] text-rose-300">{iperf.err}</div>}
        </div>
      </div>
    </div>
  );
}
