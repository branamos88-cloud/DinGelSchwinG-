/**
 * ReplayView — Signal-Aufzeichnung & -Wiedergabe
 * Aufnahme: ECHTE RSSI-Werte der sichtbaren Geräte (aus dem Store).
 * Bearbeiten, Anwenden, Export/Import (JSON) und Wiedergabe mit Playhead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Music, Play, Square, Trash2, Upload } from 'lucide-react';
import { useAppStore } from '../state/store';
import {
  appendSample,
  createRecording,
  deserializeReplayPoints,
  replayStats,
  sanitizeReplayPoints,
  serializeReplayPoints,
  ReplayRecording,
} from '../lib/replay/replayEngine';
import { ActionButton, Card, MonoRow, SectionTitle, StatBox, StatusPill } from './ui';
import type { ReplayPoint } from '../state/types';

export default function ReplayView() {
  const { state, dispatch } = useAppStore();
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playHead, setPlayHead] = useState(0);
  const [edited, setEdited] = useState<ReplayPoint[]>([]);
  const recRef = useRef<ReplayRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const points = state.replayPoints;
  const stats = replayStats(points);
  const freqMHz = (state.settings.meshFreqStart + state.settings.meshFreqEnd) / 2;

  // Aufnahme: echte Daten aus dem Store sammeln
  useEffect(() => {
    if (!recording) return;
    recRef.current = createRecording();
    const timer = setInterval(() => {
      if (!recRef.current) return;
      if (state.devices.length === 0) return; // nichts zu messen
      recRef.current = appendSample(recRef.current, state.devices, freqMHz);
      const pts = recRef.current.points.slice(-2000);
      dispatch({ type: 'SET_REPLAY_POINTS', points: pts });
    }, Math.max(300, state.settings.meshIntervalMs));
    return () => {
      clearInterval(timer);
      recRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, state.settings.meshIntervalMs, freqMHz]);

  // Wiedergabe
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setPlayHead(prev => {
        const max = points.length ? Math.max(...points.map(p => p.t)) : 0;
        if (prev >= max) {
          setPlaying(false);
          return 0;
        }
        return prev + 100;
      });
    }, 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, points]);

  const toggleRecording = useCallback(() => {
    setRecording(r => {
      const next = !r;
      dispatch({ type: 'ADD_LOG', level: 'info', msg: next ? 'Aufnahme gestartet (echte Scan-Daten)' : `Aufnahme beendet (${points.length} Punkte)` });
      return next;
    });
    if (!recording) setEdited([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, dispatch, points.length]);

  const handleClear = useCallback(() => {
    dispatch({ type: 'SET_REPLAY_POINTS', points: [] });
    setPlayHead(0);
    setEdited([]);
    setPlaying(false);
  }, [dispatch]);

  const handleEdit = useCallback((idx: number, key: keyof ReplayPoint, val: string) => {
    setEdited(prev => {
      const copy = [...prev];
      const base = points[idx] ?? { t: 0, freqMHz: 2400, rssi: -60, amp: 0.5 };
      if (!copy[idx]) copy[idx] = { ...base };
      const num = parseFloat(val);
      if (Number.isFinite(num)) (copy[idx] as unknown as Record<string, number>)[key] = num;
      return copy;
    });
  }, [points]);

  const applyEdit = useCallback(() => {
    if (edited.length === 0) return;
    dispatch({
      type: 'SET_REPLAY_POINTS',
      points: points.map((p, i) => (edited[i] ? edited[i] : p)),
    });
    setEdited([]);
    dispatch({ type: 'ADD_LOG', level: 'success', msg: `${edited.length} Bearbeitung(en) angewendet` });
  }, [edited, points, dispatch]);

  const doExport = useCallback(() => {
    if (points.length === 0) return;
    const blob = new Blob([serializeReplayPoints(points)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `replay-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [points]);

  const doImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = deserializeReplayPoints(text);
      const clean = sanitizeReplayPoints(parsed);
      if (clean.length === 0) {
        setImportMsg('Keine gültigen Punkte in der Datei');
        return;
      }
      dispatch({ type: 'SET_REPLAY_POINTS', points: clean });
      setImportMsg(`${clean.length} Punkte importiert`);
      dispatch({ type: 'ADD_LOG', level: 'success', msg: `Replay importiert: ${clean.length} Punkte` });
    } catch {
      setImportMsg('Datei konnte nicht gelesen werden');
    }
  }, [dispatch]);

  const currentPoint = points.find(p => Math.abs(p.t - playHead) < 150) ?? points[points.length - 1] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card glow>
        <SectionTitle
          icon={<Music className="w-4 h-4 text-pink-300" />}
          right={
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void doImport(f);
                  e.target.value = '';
                }}
              />
              <ActionButton tone="neutral" onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> Import
              </ActionButton>
              <ActionButton tone="neutral" onClick={doExport} disabled={points.length === 0}>
                <Download className="w-3.5 h-3.5" /> Export JSON
              </ActionButton>
              <ActionButton tone={recording ? 'danger' : 'warn'} onClick={toggleRecording}>
                {recording ? <><Square className="w-3 h-3" /> Aufnahme stoppen</> : <>● Aufnehmen</>}
              </ActionButton>
              <ActionButton tone={playing ? 'danger' : 'primary'} onClick={() => setPlaying(!playing)} disabled={points.length === 0}>
                {playing ? <><Square className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Abspielen</>}
              </ActionButton>
              <ActionButton tone="neutral" onClick={handleClear} disabled={points.length === 0}>
                <Trash2 className="w-3.5 h-3.5" />
              </ActionButton>
            </div>
          }
        >
          Replay-Editor
        </SectionTitle>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <StatBox label="Punkte" value={stats.count} accent="text-pink-200" />
          <StatBox label="Zeitraum" value={stats.count > 1 ? `${stats.durationMs} ms` : '--'} accent="text-cyan-200" />
          <StatBox label="RSSI min/max" value={stats.rssiMin !== null ? `${stats.rssiMin} / ${stats.rssiMax}` : '--'} accent="text-rose-200" />
          <StatBox label="Frequenz min/max" value={stats.freqMin !== null ? `${stats.freqMin} / ${stats.freqMax}` : '--'} accent="text-violet-200" />
          <div className="flex items-center">
            <StatusPill
              ok={!recording}
              warn={recording}
              label={recording ? 'AUFNAHME' : playing ? 'WIEDERGABE' : 'BEREIT'}
            />
          </div>
        </div>

        {importMsg && (
          <div className="mb-3 text-[11px] font-mono px-3 py-2 rounded-lg bg-cyan-950/40 border border-cyan-700/40 text-cyan-200">{importMsg}</div>
        )}
        {recording && state.devices.length === 0 && (
          <div className="mb-3 text-[11px] font-mono px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-700/40 text-amber-200">
            Aufnahme läuft, aber es sind keine Geräte sichtbar — zuerst einen Scan starten (Dashboard/Mesh), sonst werden keine Punkte gesammelt.
          </div>
        )}

        {/* Wellenform */}
        <div className="relative h-28 bg-[#060f2a] rounded-xl border border-white/10 overflow-hidden mb-4">
          {points.length > 1 && (
            <svg viewBox="0 0 600 100" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="sigGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f472b6" />
                  <stop offset="100%" stopColor="#c084fc" stopOpacity="0.2" />
                </linearGradient>
              </defs>
              <polyline
                fill="none"
                stroke="url(#sigGrad)"
                strokeWidth="2"
                points={points.map((p, i) => {
                  const x = (i / Math.max(points.length - 1, 1)) * 600;
                  const y = 50 - (p.amp / 1.0) * 35;
                  return `${x},${y}`;
                }).join(' ')}
              />
            </svg>
          )}
          {points.length > 0 && (
            <div
              className="absolute top-0 h-full w-px bg-pink-400/80"
              style={{ left: `${(playHead / Math.max(Math.max(...points.map(p => p.t)), 1)) * 100}%` }}
            />
          )}
          <div className="absolute bottom-2 left-2 text-[10px] font-mono text-slate-400">
            {currentPoint
              ? <>Zeit: <b className="text-white">{currentPoint.t}ms</b> · Freq: <b className="text-violet-300">{currentPoint.freqMHz}MHz</b> · RSSI: <b className="text-rose-300">{currentPoint.rssi}dBm</b></>
              : <>Noch keine Punkte — Aufnahme starten oder Datei importieren</>}
          </div>
        </div>

        {/* Punktliste mit Bearbeitung */}
        <div className="max-h-56 overflow-y-auto space-y-1.5 mb-3">
          {points.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-[#060f2a]/60 rounded-lg px-2.5 py-1.5 text-xs font-mono border border-white/5">
              <div className="w-6 text-slate-500 font-black">{idx + 1}</div>
              <div className="flex-1 text-slate-300 truncate">{p.t}ms · {p.freqMHz}MHz · {p.rssi}dBm</div>
              <input
                type="number"
                step="0.1"
                defaultValue={p.freqMHz}
                onChange={e => handleEdit(idx, 'freqMHz', e.target.value)}
                className="w-16 bg-slate-900 border border-slate-600 rounded px-1 text-[10px] text-cyan-200 focus:border-cyan-400 outline-none"
                title="Frequenz (MHz)"
              />
              <input
                type="number"
                step="0.1"
                defaultValue={p.rssi}
                onChange={e => handleEdit(idx, 'rssi', e.target.value)}
                className="w-16 bg-slate-900 border border-slate-600 rounded px-1 text-[10px] text-rose-200 focus:border-rose-400 outline-none"
                title="RSSI (dBm)"
              />
            </div>
          ))}
          {points.length === 0 && (
            <div className="text-center text-xs font-mono text-slate-500 py-6">
              Keine Punkte. Aufnahme zeichnet die echten RSSI-Werte sichtbarer Geräte auf.
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <ActionButton tone="primary" onClick={applyEdit} disabled={edited.length === 0}>
            Bearbeitungen anwenden ({edited.length})
          </ActionButton>
          <ActionButton tone="neutral" onClick={() => setEdited([])} disabled={edited.length === 0}>
            Zurücksetzen
          </ActionButton>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={<Music className="w-4 h-4 text-pink-300" />}>Aufzeichnungs-Hinweise</SectionTitle>
        <div className="text-[11px] font-mono text-slate-400 space-y-1.5">
          <MonoRow k="Quelle" v="Echte Scan-Daten (Geräte-RSSI)" vClass="text-pink-200" />
          <MonoRow k="Intervall" v={`${Math.max(300, state.settings.meshIntervalMs)} ms`} vClass="text-cyan-200" />
          <MonoRow k="Export" v="JSON (format: dingelschwinng.replay.v1)" vClass="text-violet-200" />
        </div>
      </Card>
    </div>
  );
}
