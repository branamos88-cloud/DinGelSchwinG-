const PREFIX = 'nexus.v1.';

function canUseStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export const store = {
  get<T>(key: string, fallback: T): T {
    if (!canUseStorage()) return fallback;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    if (!canUseStorage()) return;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* quota */
    }
  },
  del(key: string): void {
    if (!canUseStorage()) return;
    localStorage.removeItem(PREFIX + key);
  },
};
