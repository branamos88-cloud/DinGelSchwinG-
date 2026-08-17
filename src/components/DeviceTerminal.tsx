import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AccessTarget } from '../domain/types';
import { nexus } from '../engine/nexus';
import { toUserMessage } from '../domain/errors';

export default function DeviceTerminal({ target, onClose }: { target: AccessTarget; onClose: () => void }) {
  const [sid, setSid] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lines = sid ? nexus.terminal[sid] ?? [] : [];

  useEffect(() => {
    try {
      setSid(nexus.openTerminal(target));
    } catch (e) {
      setErr(toUserMessage(e).detail);
    }
    return () => {
      if (sid) nexus.closeTerminal(sid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  const send = () => {
    if (!sid || !input.trim()) return;
    try {
      nexus.exec(sid, input);
      setInput('');
    } catch (e) {
      setErr(toUserMessage(e).detail);
    }
  };

  return (
    <div className="glass-card overflow-hidden flex flex-col h-[420px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/30">
        <div className="text-xs font-mono text-emerald-300">PTY {sid ?? '—'} · {target.kind}</div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] bg-[#020617] space-y-0.5">
        {err && <div className="text-rose-300">{err}</div>}
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              l.stream === 'in' ? 'text-cyan-200' : l.stream === 'err' ? 'text-rose-300' : l.stream === 'sys' ? 'text-amber-200' : 'text-slate-200'
            }
          >
            {l.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex border-t border-white/10">
        <input
          className="flex-1 bg-transparent px-3 py-2 text-sm text-white font-mono outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="help · scan · devices · status"
        />
        <button onClick={send} className="px-4 text-xs font-bold text-cyan-200">
          Enter
        </button>
      </div>
    </div>
  );
}
