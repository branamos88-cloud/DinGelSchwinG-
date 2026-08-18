import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { nexus, NexusSnapshot } from '../engine/nexus';

const NexusContext = createContext<NexusSnapshot | null>(null);

export function NexusProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<NexusSnapshot>(() => nexus.snapshot());

  useEffect(() => {
    void nexus.boot().then(() => setSnap(nexus.snapshot()));
    return nexus.subscribe(() => setSnap(nexus.snapshot()));
  }, []);

  const value = useMemo(() => snap, [snap]);
  return <NexusContext.Provider value={value}>{children}</NexusContext.Provider>;
}

export function useNexus(): NexusSnapshot {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error('useNexus außerhalb von NexusProvider');
  return ctx;
}

export { nexus };
