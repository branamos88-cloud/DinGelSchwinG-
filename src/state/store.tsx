/**
 * Zentraler App-Store (React Context + Reducer).
 * Alle Views lesen und schreiben ausschließlich über diesen Store.
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import {
  AppAction, AppState, BoundDevice, DEFAULT_SETTINGS, Device, LogEntry,
} from './types';
import {
  loadBoundDevices, loadSettings, saveBoundDevices, saveSettings, sanitizeSettings,
} from './settings';

export function makeInitialState(): AppState {
  return {
    devices: [],
    boundDevices: loadBoundDevices(),
    settings: loadSettings(),
    replayPoints: [],
    logs: [],
    scan: { running: false, source: null, lastScanAt: null, error: null },
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'UPSERT_DEVICE': {
      const d: Device = action.device;
      const exists = state.devices.some(x => x.id === d.id);
      const devices = exists
        ? state.devices.map(x => (x.id === d.id ? { ...x, ...d } : x))
        : [...state.devices, d];
      return { ...state, devices };
    }
    case 'REMOVE_DEVICE':
      return { ...state, devices: state.devices.filter(d => d.id !== action.id) };
    case 'CLEAR_DEVICES':
      return {
        ...state,
        devices: action.source
          ? state.devices.filter(d => d.source !== action.source)
          : [],
      };
    case 'BIND_DEVICE': {
      const bound: BoundDevice = action.bound;
      if (state.boundDevices.some(b => b.id === bound.id)) return state;
      const boundDevices = [...state.boundDevices, bound];
      saveBoundDevices(boundDevices);
      // Zugehöriges Gerät (falls im Netz) als gebunden markieren
      const devices = state.devices.map(d =>
        d.id === bound.deviceId ? { ...d, bound: true } : d
      );
      return { ...state, boundDevices, devices };
    }
    case 'UNBIND_DEVICE': {
      const boundDevices = state.boundDevices.filter(b => b.id !== action.id);
      saveBoundDevices(boundDevices);
      const removed = state.boundDevices.find(b => b.id === action.id);
      const devices = removed?.deviceId
        ? state.devices.map(d => (d.id === removed.deviceId ? { ...d, bound: false } : d))
        : state.devices;
      return { ...state, boundDevices, devices };
    }
    case 'SET_SETTINGS': {
      const settings = sanitizeSettings(action.settings, state.settings);
      saveSettings(settings);
      return { ...state, settings };
    }
    case 'RESET_SETTINGS': {
      const settings = { ...DEFAULT_SETTINGS };
      saveSettings(settings);
      return { ...state, settings };
    }
    case 'SET_REPLAY_POINTS':
      return { ...state, replayPoints: action.points.slice(0, 5000) };
    case 'ADD_REPLAY_POINT':
      return { ...state, replayPoints: [...state.replayPoints.slice(-4999), action.point] };
    case 'ADD_LOG': {
      const entry: LogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        t: Date.now(),
        level: action.level,
        msg: action.msg,
      };
      return { ...state, logs: [...state.logs.slice(-399), entry] };
    }
    case 'CLEAR_LOGS':
      return { ...state, logs: [] };
    case 'SCAN_START':
      return { ...state, scan: { running: true, source: action.source, lastScanAt: Date.now(), error: null } };
    case 'SCAN_STOP':
      return { ...state, scan: { ...state.scan, running: false, lastScanAt: Date.now() } };
    case 'SCAN_ERROR':
      return { ...state, scan: { ...state.scan, running: false, error: action.error, lastScanAt: Date.now() } };
    default:
      return state;
  }
}

export interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, makeInitialState);

  // Persistiere Settings bei jeder Änderung (doppelte Sicherheit neben saveSettings im Reducer)
  useEffect(() => {
    saveSettings(state.settings);
  }, [state.settings]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useAppStore muss innerhalb von <AppStoreProvider> verwendet werden');
  return ctx;
}
