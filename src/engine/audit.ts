import { AuditEntry } from '../domain/types';
import { store } from './store';

function uid(): string {
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
}

class AuditLog {
  private entries: AuditEntry[] = store.get<AuditEntry[]>('audit', []);
  private traces = new Map<string, number>();

  beginTrace(): string {
    const id = uid();
    this.traces.set(id, 0);
    return id;
  }

  log(partial: Omit<AuditEntry, 'ts' | 'step' | 'trace_id'> & { trace_id?: string; step?: number }): AuditEntry {
    const tid = partial.trace_id ?? this.beginTrace();
    const step = partial.step ?? (this.traces.get(tid) ?? 0) + 1;
    this.traces.set(tid, step);
    const entry: AuditEntry = {
      ...partial,
      trace_id: tid,
      step,
      ts: new Date().toISOString(),
    };
    this.entries = [entry, ...this.entries].slice(0, 800);
    store.set('audit', this.entries);
    return entry;
  }

  list(limit = 200, traceId?: string): AuditEntry[] {
    const src = traceId ? this.entries.filter((e) => e.trace_id === traceId) : this.entries;
    return src.slice(0, limit);
  }

  clear(): void {
    this.entries = [];
    store.set('audit', this.entries);
  }
}

export const audit = new AuditLog();
