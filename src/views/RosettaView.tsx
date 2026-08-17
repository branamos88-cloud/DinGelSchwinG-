/**
 * RosettaView — KI-Assistent & Netzwerk-Analyse
 * Online: konfigurierbares OpenAI-kompatibles Backend (mit SSE-Streaming).
 * Offline: lokale Analyse-Engine mit echten Kennzahlen aus den Live-Daten.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, Send, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { useAppStore } from '../state/store';
import { AnalysisResult, RosettaClient, ROUTE_LABELS } from '../lib/rosetta/rosettaClient';
import { ActionButton, Card, MonoRow, SectionTitle, StatusPill } from './ui';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const ROUTES = ['net-analysis', 'device-pairing', 'sensor-fusion', 'stream-diagnostics', 'mesh-monitor', 'replay-editor'];

export default function RosettaView({ onGoSettings }: { onGoSettings: () => void }) {
  const { state, dispatch } = useAppStore();
  const [route, setRoute] = useState('net-analysis');
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'sys-1',
      role: 'system',
      content: 'Rosetta-AI bereit. Wähle eine Route und stelle eine Frage — oder starte eine Analyse der Live-Netzwerkdaten.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const client = useMemo(
    () =>
      new RosettaClient({
        baseUrl: state.settings.aiBaseUrl,
        apiKey: state.settings.aiApiKey,
        model: state.settings.aiModel,
        enabled: state.settings.aiEnabled,
      }),
    [state.settings.aiBaseUrl, state.settings.aiApiKey, state.settings.aiModel, state.settings.aiEnabled]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamLog]);

  const online = client.isOnlineConfigured();

  /** Routen-Analyse (online oder offline) — Ergebnis im Chat + Analysepanel. */
  const runAnalysis = useCallback(async () => {
    setBusy(true);
    setAnalysis(null);
    setStreamLog([]);
    try {
      const res = await client.analyzeRoute(route, state);
      setAnalysis(res);
      setMessages(prev => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `[Analyse · ${ROUTE_LABELS[route] ?? route} · ${res.mode === 'online' ? 'KI-Backend' : 'lokale Analyse'}]\n${res.summary}\nEmpfehlungen:\n${res.recommendations.map(r => `• ${r}`).join('\n')}`,
        },
      ]);
      dispatch({ type: 'ADD_LOG', level: 'success', msg: `Rosetta-Analyse ${route} (${res.mode})` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', content: `Fehler: ${msg}` }]);
    } finally {
      setBusy(false);
    }
  }, [client, route, state, dispatch]);

  /** Chat-Nachricht senden (Streaming, wenn konfiguriert). */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setStreamLog([]);
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    if (!online) {
      // Offline: kurze, ehrliche Antwort + Hinweis auf Analyse-Funktion
      setMessages(prev => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: 'Kein KI-Backend konfiguriert. Für Textantworten in den Einstellungen eine OpenAI-kompatible API (Basis-URL + Key) hinterlegen. Die Routen-Analyse funktioniert auch offline mit echten Netzwerkdaten — einfach „Analyse starten“ verwenden.',
        },
      ]);
      return;
    }
    setBusy(true);
    const assistantId = `a-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);
    try {
      await client.chatStream(
        [
          { role: 'system', content: `Du bist Rosetta-AI von DinGelSchwinG (Netzwerk-Analyse). Route: ${route}. Antworte auf Deutsch, kompakt und sachlich.` },
          ...messages.filter(m => m.role !== 'system').slice(-10).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: text },
        ],
        (chunk) => {
          if (!chunk.done && chunk.data) {
            setStreamLog(prev => [...prev.slice(-24), chunk.data]);
          }
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: m.content + chunk.data } : m))
          );
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages(prev =>
        prev.map(m => (m.id === assistantId && !m.content ? { ...m, content: `Fehler: ${msg}` } : m))
      );
    } finally {
      setBusy(false);
    }
  }, [input, busy, client, online, route, messages]);

  return (
    <div className="flex flex-col gap-4">
      {/* Backend-Status */}
      <Card glow>
        <SectionTitle
          icon={<BrainCircuit className="w-4 h-4 text-amber-300" />}
          right={
            <div className="flex items-center gap-2">
              <StatusPill ok={online} warn label={online ? `KI-Backend verbunden: ${state.settings.aiModel || 'konfiguriert'}` : 'Offline-Analyse (kein Backend)'} />
              <ActionButton tone="neutral" onClick={onGoSettings}>
                <Settings2 className="w-3.5 h-3.5" /> KI-Einstellungen
              </ActionButton>
            </div>
          }
        >
          Rosetta-AI Gateway
        </SectionTitle>

        {/* Routen */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {ROUTES.map(r => (
            <button
              key={r}
              onClick={() => setRoute(r)}
              className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg border transition whitespace-nowrap ${
                route === r
                  ? 'bg-amber-600 text-white border-amber-400'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              {ROUTE_LABELS[r] ?? r}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <ActionButton tone="warn" onClick={() => { void runAnalysis(); }} disabled={busy}>
            <Sparkles className="w-3.5 h-3.5" />
            {busy ? 'Analysiere…' : `Analyse starten (${ROUTE_LABELS[route] ?? route})`}
          </ActionButton>
          <div className="text-[10px] font-mono text-slate-500 self-center">
            {online
              ? 'Online: Anfrage geht an das konfigurierte KI-Backend.'
              : 'Offline: Analyse berechnet echte Kennzahlen aus den Live-Netzwerkdaten.'}
          </div>
        </div>

        {/* Analyse-Ergebnis */}
        {analysis && (
          <div className="bg-[#060f2a]/60 border border-amber-700/30 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-extrabold text-amber-200 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                {ROUTE_LABELS[analysis.route] ?? analysis.route} · {analysis.mode === 'online' ? 'KI-Backend' : 'lokale Analyse'} · Konfidenz {Math.round(analysis.confidence * 100)}%
              </div>
              <span className="text-[10px] font-mono text-slate-500">{new Date(analysis.generatedAt).toLocaleTimeString()}</span>
            </div>
            <div className="text-xs font-mono text-slate-200 mb-3">{analysis.summary}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {Object.entries(analysis.metrics).map(([k, v]) => (
                <div key={k} className="bg-[#0b0f18] rounded-lg px-2 py-1.5">
                  <div className="text-[9px] text-slate-500 font-mono truncate">{k}</div>
                  <div className="text-[11px] font-black text-cyan-200 font-mono">{String(v)}</div>
                </div>
              ))}
            </div>
            {analysis.recommendations.length > 0 && (
              <div className="space-y-1">
                {analysis.recommendations.map((r, i) => (
                  <div key={i} className="text-[11px] font-mono text-emerald-200/90">✓ {r}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat */}
        <div className="bg-[#060f2a]/60 border border-white/10 rounded-xl p-3 max-h-64 overflow-y-auto space-y-2 mb-3">
          {messages.map(m => (
            <div
              key={m.id}
              className={`text-xs font-mono rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-cyan-900/40 text-cyan-100 ml-auto'
                  : m.role === 'system'
                    ? 'bg-slate-800/60 text-slate-400 mx-auto text-center'
                    : 'bg-slate-800/80 text-slate-100'
              }`}
            >
              {m.content || (busy && m.role === 'assistant' ? '…' : '')}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void sendMessage(); }}
            placeholder={online ? 'Frage an Rosetta-AI stellen…' : 'Offline: Frage eingeben (Textantworten benötigen ein KI-Backend)'}
            className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-amber-400 outline-none"
          />
          <ActionButton tone="primary" onClick={() => { void sendMessage(); }} disabled={!input.trim() || busy}>
            <Send className="w-3.5 h-3.5" /> Senden
          </ActionButton>
          <ActionButton tone="neutral" onClick={() => setMessages(m => m.slice(0, 1))}>
            <Trash2 className="w-3.5 h-3.5" />
          </ActionButton>
        </div>
      </Card>

      {/* Log */}
      {streamLog.length > 0 && (
        <Card>
          <SectionTitle icon={<Sparkles className="w-4 h-4 text-amber-300" />}>Stream-Protokoll</SectionTitle>
          <div className="bg-[#060f2a]/60 border border-amber-700/30 rounded-xl p-3 font-mono text-[10px] text-amber-100 max-h-32 overflow-y-auto whitespace-pre-wrap">
            {streamLog.join('')}
          </div>
        </Card>
      )}
    </div>
  );
}
