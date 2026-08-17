import { useState } from 'react';
import { TerminalSquare, ScanLine, ShieldAlert } from 'lucide-react';
import { AccessTarget, ConnectionType } from '../domain/types';
import { Role, canAction } from '../domain/rbac';
import { toUserMessage } from '../domain/errors';
import { nexus, useNexus } from '../context/NexusContext';
import DeviceTerminal from './DeviceTerminal';

export default function AccessConsole() {
  const snap = useNexus();
  const role = snap.session?.user.role ?? Role.GUEST;
  const [target, setTarget] = useState<AccessTarget | null>(null);
  const [host, setHost] = useState('192.168.1.20');
  const [err, setErr] = useState<string | null>(null);

  const open = (t: AccessTarget) => {
    setErr(null);
    try {
      if (t.kind === 'dongle' && !nexus.runInterlock({ kind: 'dongle', usbVendorId: t.usbVendorId })) {
        throw new Error('Interlock: VID nicht erlaubt');
      }
      setTarget(t);
    } catch (e) {
      setErr(toUserMessage(e).detail);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <TerminalSquare className="w-4 h-4 text-cyan-300" /> Sicherer Zugriff
          </h3>
          <button
            onClick={() => void nexus.scanAll()}
            className="text-xs font-extrabold px-3 py-1.5 rounded-lg bg-slate-800 text-white border border-white/10 flex items-center gap-1"
          >
            <ScanLine className="w-3 h-3" /> {snap.scanning ? 'Scan…' : 'Geräte scannen'}
          </button>
        </div>
        {err && (
          <div className="mb-3 text-sm text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg px-3 py-2 flex gap-2">
            <ShieldAlert className="w-4 h-4" /> {err}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-2 mb-3">
          {snap.nodes.map((n) => (
            <button
              key={n.id}
              onClick={() =>
                open(
                  n.kind === 'dongle'
                    ? { kind: 'dongle', id: n.id, connectionType: ConnectionType.DONGLE_USBC, usbVendorId: n.usbVendorId, usbProductId: n.usbProductId }
                    : n.kind === 'network' || n.kind === 'wifi'
                      ? { kind: 'network', id: n.id, host: n.address || n.label, port: 22, proto: 'ssh', username: 'service' }
                      : n.kind === 'ble'
                        ? { kind: 'ble', id: n.id, address: n.address }
                        : { kind: 'hardware', id: n.id, connectionType: ConnectionType.SERIAL },
                )
              }
              className="text-left rounded-xl px-3 py-2 bg-[#060f2a]/70 border border-white/10 hover:border-cyan-400/40"
            >
              <div className="text-[10px] uppercase text-slate-500">{n.kind}</div>
              <div className="text-sm font-bold text-white">{n.label}</div>
              <div className="text-[10px] font-mono text-slate-400">{n.id} · {n.signal?.rssi ?? '--'} dBm</div>
            </button>
          ))}
        </div>
        {canAction(role, 'terminal.network.ssh') && (
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
            <button
              onClick={() => open({ kind: 'network', host, port: 22, proto: 'ssh', username: 'service' })}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-extrabold"
            >
              SSH
            </button>
          </div>
        )}
        {!canAction(role, 'terminal.interactive') && (
          <p className="text-xs text-amber-300 mt-2">Rolle {role} hat kein interaktives Terminal (mindestens Service).</p>
        )}
      </div>
      {target && <DeviceTerminal target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}
