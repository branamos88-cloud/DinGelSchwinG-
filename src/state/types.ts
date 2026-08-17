/**
 * Zentrale Typdefinitionen für DinGelSchwinG NEXUS-BUILDER
 */

export type DeviceType = 'master' | 'client' | 'target' | 'other';
export type RadioMode = 'ble' | 'wifi' | 'usb';
export type PairMethod = 'qr' | 'ble' | 'nfc' | 'wifi';
export type DeviceSource = 'ble' | 'wifi' | 'usb' | 'demo';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  rssi: number;
  txPower: number;
  x: number;
  y: number;
  z: number;
  distance?: number;
  bound: boolean;
  address?: string;
  source: DeviceSource;
  lastSeen: number;
}

export interface BoundDevice {
  id: string;
  name: string;
  method: PairMethod;
  rssi: number;
  boundAt: string;
  deviceId?: string;
  payload?: string;
}

export interface AppSettings {
  defaultMode: RadioMode;
  scanIntervalMs: number;
  bleTxPower: number;
  bleEnvFactor: number;
  sensorTimeoutMs: number;
  meshIntervalMs: number;
  meshFreqStart: number;
  meshFreqEnd: number;
  pairingMethods: { qr: boolean; ble: boolean; nfc: boolean; wifi: boolean };
  wasmCalibrationRssiRef: number;
  wasmCalibrationDistRef: number;
  diagTargets: string[];
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiEnabled: boolean;
  demoMode: boolean;
}

export interface ReplayPoint {
  t: number;
  freqMHz: number;
  rssi: number;
  amp: number;
}

export interface LogEntry {
  id: string;
  t: number;
  level: 'info' | 'warn' | 'error' | 'success';
  msg: string;
}

export interface ScanState {
  running: boolean;
  source: DeviceSource | null;
  lastScanAt: number | null;
  error: string | null;
}

export interface AppState {
  devices: Device[];
  boundDevices: BoundDevice[];
  settings: AppSettings;
  replayPoints: ReplayPoint[];
  logs: LogEntry[];
  scan: ScanState;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultMode: 'ble',
  scanIntervalMs: 2000,
  bleTxPower: -59,
  bleEnvFactor: 2.0,
  sensorTimeoutMs: 1000,
  meshIntervalMs: 2000,
  meshFreqStart: 2400,
  meshFreqEnd: 2500,
  pairingMethods: { qr: true, ble: true, nfc: true, wifi: true },
  wasmCalibrationRssiRef: -59,
  wasmCalibrationDistRef: 2.0,
  diagTargets: ['https://1.1.1.1', 'https://8.8.8.8', 'https://www.google.com'],
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  aiEnabled: false,
  demoMode: false,
};

export type AppAction =
  | { type: 'UPSERT_DEVICE'; device: Device }
  | { type: 'REMOVE_DEVICE'; id: string }
  | { type: 'CLEAR_DEVICES'; source?: DeviceSource }
  | { type: 'BIND_DEVICE'; bound: BoundDevice }
  | { type: 'UNBIND_DEVICE'; id: string }
  | { type: 'SET_SETTINGS'; settings: Partial<AppSettings> }
  | { type: 'RESET_SETTINGS' }
  | { type: 'SET_REPLAY_POINTS'; points: ReplayPoint[] }
  | { type: 'ADD_REPLAY_POINT'; point: ReplayPoint }
  | { type: 'ADD_LOG'; level: LogEntry['level']; msg: string }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SCAN_START'; source: DeviceSource }
  | { type: 'SCAN_STOP' }
  | { type: 'SCAN_ERROR'; error: string };
