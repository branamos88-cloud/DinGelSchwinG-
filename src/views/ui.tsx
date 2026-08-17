/**
 * Gemeinsame UI-Bausteine für alle Views (einheitliche Optik).
 */
import React from 'react';

export function Card({ children, className = '', glow = false }: { children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={`glass-card p-5 relative overflow-hidden ${glow ? 'ring-gradient' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ icon, children, right }: { icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-black text-white flex items-center gap-2">
        {icon}
        {children}
      </h3>
      {right}
    </div>
  );
}

export function StatusPill({ ok, label, warn }: { ok: boolean; label: string; warn?: boolean }) {
  const cls = warn
    ? 'bg-amber-950 text-amber-200 border-amber-700'
    : ok
      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
      : 'bg-rose-950 text-rose-300 border-rose-700';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-mono font-extrabold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${warn ? 'bg-amber-400' : ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      {label}
    </span>
  );
}

export function StatBox({ label, value, accent = 'text-cyan-200', sub }: { label: string; value: React.ReactNode; accent?: string; sub?: string }) {
  return (
    <div className="bg-[#060f2a]/60 rounded-xl p-3 border border-white/5">
      <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
      <div className={`font-bold text-sm ${accent}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

export function ActionButton({
  onClick, children, active, disabled, tone = 'primary', className = '', title,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'success' | 'danger' | 'warn' | 'neutral';
  className?: string;
  title?: string;
}) {
  const tones: Record<string, string> = {
    primary: active ? 'bg-cyan-700 text-white ring-cyan-300/60' : 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white hover:from-cyan-500 hover:to-blue-600',
    success: active ? 'bg-emerald-700 text-white ring-emerald-300/60' : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white hover:from-emerald-500 hover:to-teal-600',
    danger: active ? 'bg-rose-700 text-white ring-rose-300/60' : 'bg-gradient-to-br from-rose-600 to-red-700 text-white hover:from-rose-500 hover:to-red-600',
    warn: 'bg-gradient-to-br from-amber-600 to-orange-700 text-white hover:from-amber-500 hover:to-orange-600',
    neutral: 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-lg transition ring-1 ring-white/10 disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function MonoRow({ k, v, vClass = 'text-white' }: { k: string; v: React.ReactNode; vClass?: string }) {
  return (
    <div className="flex justify-between py-0.5 text-xs font-mono">
      <span className="text-slate-500">{k}</span>
      <b className={vClass}>{v}</b>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="text-[11px] font-mono px-3 py-2 rounded-lg bg-rose-950/50 border border-rose-800/40 text-rose-200">
      {children}
    </div>
  );
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="text-[11px] font-mono px-3 py-2 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-cyan-200">
      {children}
    </div>
  );
}
