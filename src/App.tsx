import { useState } from 'react';
import {
  Radio,
  Box,
  Link2,
  TerminalSquare,
  LayoutDashboard,
  Activity,
  MessageCircle,
  Server,
  SlidersHorizontal,
  LogOut,
  Menu,
  Shield,
} from 'lucide-react';
import { NexusProvider, useNexus, nexus } from './context/NexusContext';
import LoginScreen from './components/LoginScreen';
import NetworkDashboard from './components/NetworkDashboard';
import PairingPanel from './components/PairingPanel';
import AccessConsole from './components/AccessConsole';
import OverviewPanel from './components/OverviewPanel';
import StatusBoard from './components/StatusBoard';
import MeshControl from './components/MeshControl';
import ReplayEditor from './components/ReplayEditor';
import NetworkDiagnostics from './components/diagnostics/NetworkDiagnostics';
import RosettaPanel from './components/RosettaPanel';
import MoEChatInterface from './components/MoEChatInterface';
import AdvancedResearchChat from './components/AdvancedResearchChat';
import EnterprisePanel from './components/EnterprisePanel';
import NetworkSettings from './components/NetworkSettings';
import { ROLE_LABELS, ROLE_LEVELS } from './domain/rbac';
import './App.css';

type Tab = 'nexus' | 'geraete' | 'terminal' | 'control' | 'mesh' | 'diagnose' | 'ki' | 'enterprise' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Box }[] = [
  { id: 'nexus', label: 'Nexus', icon: Box },
  { id: 'geraete', label: 'Geräte', icon: Link2 },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'control', label: 'Control', icon: LayoutDashboard },
  { id: 'mesh', label: 'Mesh', icon: Activity },
  { id: 'diagnose', label: 'Diagnose', icon: Radio },
  { id: 'ki', label: 'KI', icon: MessageCircle },
  { id: 'enterprise', label: 'Nodes', icon: Server },
  { id: 'settings', label: 'Setup', icon: SlidersHorizontal },
];

function Shell() {
  const snap = useNexus();
  const [tab, setTab] = useState<Tab>('nexus');
  const [menu, setMenu] = useState(false);
  const user = snap.session?.user;

  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#020617] via-[#050a18] to-[#0b1220] text-slate-100 flex flex-col">
      <header className="sticky top-0 z-50 bg-[#050a18]/85 backdrop-blur-2xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="md:hidden p-2 rounded-lg bg-white/5" onClick={() => setMenu((m) => !m)}>
            <Menu className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg md:text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-cyan-200 to-violet-200">
              DinGelSchwinG <span className="text-xs font-medium text-slate-400">NEXUS</span>
            </h1>
            <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2">
              <Shield className="w-3 h-3 text-amber-300" />
              {user.sub} · {ROLE_LABELS[user.role]} L{ROLE_LEVELS[user.role]} · Android 11–14
            </div>
          </div>
        </div>
        <button onClick={() => nexus.logout()} className="text-xs flex items-center gap-1 text-slate-400 hover:text-white">
          <LogOut className="w-3.5 h-3.5" /> Abmelden
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav className={`${menu ? 'flex' : 'hidden'} md:flex flex-col gap-1 p-3 w-44 border-r border-white/10 bg-[#050a18]/60`}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setMenu(false);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${tab === t.id ? 'bg-cyan-700/40 text-white' : 'text-slate-400 hover:bg-white/5'}`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </nav>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-6xl w-full mx-auto space-y-5">
          {tab === 'nexus' && <NetworkDashboard />}
          {tab === 'geraete' && (
            <div className="grid lg:grid-cols-[1fr_320px] gap-4">
              <PairingPanel />
              <StatusBoard />
            </div>
          )}
          {tab === 'terminal' && <AccessConsole />}
          {tab === 'control' && <OverviewPanel />}
          {tab === 'mesh' && (
            <>
              <MeshControl />
              <ReplayEditor />
            </>
          )}
          {tab === 'diagnose' && <NetworkDiagnostics />}
          {tab === 'ki' && (
            <div className="space-y-5">
              <RosettaPanel />
              <div className="rounded-2xl overflow-hidden border border-white/10 min-h-[640px]">
                <MoEChatInterface />
              </div>
              <div className="rounded-2xl overflow-hidden border border-white/10 min-h-[640px]">
                <AdvancedResearchChat />
              </div>
            </div>
          )}
          {tab === 'enterprise' && <EnterprisePanel />}
          {tab === 'settings' && <NetworkSettings config={snap.config} onChange={(c) => nexus.updateConfig(c)} />}
        </main>
      </div>
      <footer className="border-t border-white/10 py-3 text-center text-[11px] text-slate-600 font-mono">
        {snap.statusMsg} · {snap.nodes.length} Nodes · {snap.bound.length} Bound · WASM {snap.wasmReady ? 'on' : 'js'}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <NexusProvider>
      <Shell />
    </NexusProvider>
  );
}
