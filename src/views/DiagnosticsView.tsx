/**
 * DiagnosticsView — echte Netzwerk-Messungen
 * Latenz (HTTP-Timing), Download-Speed (CDN), Durchsatz (WebSocket-Echo).
 */
import { useCallback, useState } from 'react';
import { Activity, Download, Gauge, RefreshCw, Server, Zap } from 'lucide-react';
import { useAppStore } from '../state/store';
import {
  DEFAULT_ECHO_WS,
  measureDownload,
  measureLatency,
  measureThroughput,
  EchoSocket,
  LatencyResult,
  DownloadResult,
  ThroughputResult,
} from '../lib/diagnostics/diagnosticsEngine';
import { ActionButton, Card, MonoRow, SectionTitle, StatBox, StatusPill } from './ui';

type LatencyState = Record<string, LatencyResult & { running?: boolean }>;

export default function DiagnosticsView() {
  const { state, dispatch } = useAppStore();
  const [latency, setLatency] = useState<LatencyState>({});
  const [download, setDownload] = useState<DownloadResult | null>(null);
  const [downloadRunning, setDownloadRunning] = useState(false);
  const [throughput, setThroughput] = useState<ThroughputResult | null>(null);
  const [throughputRunning, setThroughputRunning] = useState(false);
  const [targets, setTargets] = useState<string[]>(state.settings.diagTargets);

  const runLatency = useCallback(async () => {
    setLatency(prev => Object.fromEntries(targets.map(t => [t, { ...prev[t], target: t, status: 'fail' as const, samples: [], minMs: null, avgMs: null, maxMs: null, running: true }])));
    const results = await Promise.all(
      targets.map(async (target) => {
        const res = await measureLatency(target, (...args) => fetch(...args), 4);
        dispatch({ type: 'ADD_LOG', level: res.status === 'ok' ? 'success' : 'warn', msg: `Latenz ${target}: ${res.status === 'ok' ? res.avgMs + ' ms' : 'fehlgeschlagen'}` });
        return { target, res };
      })
    );
    setLatency(Object.fromEntries(results.map(({ target, res }) => [target, { ...res, running: false }])));
  }, [targets, dispatch]);

  const runDownload = useCallback(async () => {
    setDownloadRunning(true);
    setDownload(null);
    const res = await measureDownload(10 * 1024 * 1024, (...args) => fetch(...args));
    setDownload(res);
    setDownloadRunning(false);
    dispatch({ type: 'ADD_LOG', level: res.status === 'ok' ? 'success' : 'warn', msg: `Download-Test: ${res.status === 'ok' ? res.mbps + ' Mbit/s' : res.error ?? 'fehlgeschlagen'}` });
  }, [dispatch]);

  const runThroughput = useCallback(async () => {
    setThroughputRunning(true);
    setThroughput(null);
    const res = await measureThroughput(
      DEFAULT_ECHO_WS,
      (url) => new WebSocket(url) as unknown as EchoSocket
    );
    setThroughput(res);
    setThroughputRunning(false);
    dispatch({ type: 'ADD_LOG', level: res.status === 'ok' ? 'success' : 'warn', msg: `Durchsatz-Test: ${res.status === 'ok' ? res.mbps + ' Mbit/s (Uplink)' : res.error ?? 'fehlgeschlagen'}` });
  }, [dispatch]);

  const runAll = useCallback(async () => {
    await Promise.allSettled([runLatency(), runDownload(), runThroughput()]);
  }, [runLatency, runDownload, runThroughput]);

  return (
    <div className="flex flex-col gap-4">
      <Card glow>
        <SectionTitle
          icon={<Zap className="w-4 h-4 text-amber-300" />}
          right={
            <ActionButton tone="primary" onClick={() => { void runAll(); }} disabled={downloadRunning || throughputRunning}>
              <RefreshCw className={`w-3.5 h-3.5 ${downloadRunning || throughputRunning ? 'animate-spin' : ''}`} />
              Alle Tests starten
            </ActionButton>
          }
        >
          Netzwerk-Diagnose
        </SectionTitle>
        <div className="text-[11px] font-mono text-slate-400 mb-4">
          Echte Messungen: HTTP-Roundtrip-Timing, CDN-Download (speed.cloudflare.com), WebSocket-Echo-Durchsatz. Ziele in den Einstellungen anpassbar.
        </div>

        {/* Latenz */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-300" /> Latenz (Roundtrip-Timing)
            </span>
            <ActionButton tone="neutral" onClick={() => { void runLatency(); }}>Latenz messen</ActionButton>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {targets.map(target => {
              const r = latency[target];
              return (
                <div key={target} className="bg-[#060f2a]/60 rounded-xl p-3 border border-white/5">
                  <div className="text-[10px] font-mono text-slate-400 mb-1 truncate">{target}</div>
                  {!r ? (
                    <div className="text-xs text-slate-600 italic font-mono">noch nicht gemessen</div>
                  ) : r.running ? (
                    <div className="text-xs text-amber-300 font-mono animate-pulse">Messung läuft…</div>
                  ) : r.status === 'ok' ? (
                    <div className="flex items-end gap-3">
                      <div className="text-lg font-black text-cyan-200 font-mono">{r.avgMs} ms</div>
                      <div className="text-[10px] font-mono text-slate-500 mb-0.5">
                        min {r.minMs} · max {r.maxMs} · {r.samples.length} Samples
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-rose-300 font-mono">{r.error ?? 'fehlgeschlagen'}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Download + Durchsatz */}
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#060f2a]/60 rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold text-slate-300 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-emerald-300" /> Download-Speedtest (10 MB)
              </span>
              <ActionButton tone="success" onClick={() => { void runDownload(); }} disabled={downloadRunning}>
                {downloadRunning ? 'Lädt…' : 'Messen'}
              </ActionButton>
            </div>
            {download ? (
              download.status === 'ok' ? (
                <div>
                  <div className="text-2xl font-black text-emerald-200 font-mono">{download.mbps} Mbit/s</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    {download.bytes} Bytes in {download.durationMs} ms — echter Download vom CDN
                  </div>
                </div>
              ) : (
                <div className="text-xs text-rose-300 font-mono">{download.error}</div>
              )
            ) : (
              <div className="text-xs text-slate-600 italic font-mono">noch nicht gemessen</div>
            )}
          </div>

          <div className="bg-[#060f2a]/60 rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold text-slate-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-violet-300" /> Durchsatz (WebSocket-Echo)
              </span>
              <ActionButton tone="primary" onClick={() => { void runThroughput(); }} disabled={throughputRunning}>
                {throughputRunning ? 'Misst…' : 'Messen'}
              </ActionButton>
            </div>
            {throughput ? (
              throughput.status === 'ok' ? (
                <div>
                  <div className="text-2xl font-black text-violet-200 font-mono">{throughput.mbps} Mbit/s</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    {throughput.bytesEchoed} Bytes bestätigt in {throughput.durationMs} ms · {DEFAULT_ECHO_WS}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-rose-300 font-mono">{throughput.error}</div>
              )
            ) : (
              <div className="text-xs text-slate-600 italic font-mono">noch nicht gemessen</div>
            )}
          </div>
        </div>
      </Card>

      {/* Ergebnis-Zusammenfassung */}
      <Card>
        <SectionTitle icon={<Server className="w-4 h-4 text-cyan-300" />}>Letzte Ergebnisse</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox
            label="Latenz (beste)"
            value={bestLatency(latency)}
            accent="text-cyan-200"
          />
          <StatBox
            label="Download"
            value={download?.status === 'ok' ? `${download.mbps} Mbit/s` : '--'}
            accent="text-emerald-200"
          />
          <StatBox
            label="Durchsatz"
            value={throughput?.status === 'ok' ? `${throughput.mbps} Mbit/s` : '--'}
            accent="text-violet-200"
          />
          <StatBox
            label="Ziele"
            value={targets.length}
            accent="text-amber-200"
            sub="in den Einstellungen änderbar"
          />
        </div>
      </Card>
    </div>
  );
}

function bestLatency(latency: LatencyState): string {
  const oks = Object.values(latency).filter(r => r.status === 'ok' && r.avgMs !== null);
  if (oks.length === 0) return '--';
  return `${Math.min(...oks.map(r => r.avgMs as number))} ms`;
}
