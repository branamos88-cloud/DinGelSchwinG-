import { useState } from 'react';
import { Shield, Radio } from 'lucide-react';
import { DEMO_USERS } from '../domain/rbac';
import { toUserMessage } from '../domain/errors';
import { nexus } from '../engine/nexus';

export default function LoginScreen() {
  const [email, setEmail] = useState('service@example.com');
  const [password, setPassword] = useState('pwd_service');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setBusy(true);
    setErr(null);
    try {
      nexus.login(email, password);
      void nexus.requestPermissions();
    } catch (e) {
      setErr(toUserMessage(e).detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-cyan-500 flex items-center justify-center">
            <Radio className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">DinGelSchwinG</h1>
            <p className="text-xs text-slate-400 font-mono">NEXUS-BUILDER · Android 11–14</p>
          </div>
        </div>
        <p className="text-sm text-slate-300">On-Device Engine mit RBAC, Discovery, Terminal, Mesh, KI und Diagnose — alle Module aktiv.</p>
        <label className="block text-xs text-slate-400">
          E-Mail
          <input
            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Passwort
          <input
            type="password"
            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </label>
        {err && <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg px-3 py-2">{err}</div>}
        <button
          onClick={submit}
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 text-white font-extrabold shadow-lg"
        >
          {busy ? 'Anmelden…' : 'Anmelden'}
        </button>
        <div className="text-[11px] text-slate-500 space-y-1">
          <div className="flex items-center gap-1 font-bold text-slate-400">
            <Shield className="w-3 h-3" /> Demo-Konten
          </div>
          {Object.entries(DEMO_USERS).map(([mail, u]) => (
            <button
              key={mail}
              className="block w-full text-left hover:text-cyan-300"
              onClick={() => {
                setEmail(mail);
                setPassword(u.password);
              }}
            >
              {u.name} · {mail} / {u.password}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
