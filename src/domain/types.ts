export enum ConnectionType {
  SERIAL = 'serial',
  USB = 'usb',
  BLE = 'ble',
  NFC = 'nfc',
  HID = 'hid',
  NETWORK = 'network',
  WIFI = 'wifi',
  NTAG = 'ntag',
  DONGLE_USBC = 'dongle_usbc',
  INTERNAL = 'internal',
}

export interface SignalInfo {
  rssi: number;
  channel?: string;
  freqMHz?: number;
  measuredAt: number;
}

export interface DiscoveredNode {
  id: string;
  kind: 'network' | 'wifi' | 'ble' | 'ntag' | 'dongle' | 'hardware';
  label: string;
  transport: ConnectionType;
  signal?: SignalInfo;
  lastSeen: number;
  autoBindable: boolean;
  autoBound?: boolean;
  tagData?: Record<string, unknown>;
  permissions?: DeviceAction[];
  usbVendorId?: number;
  usbProductId?: number;
  source: 'native' | 'fabric' | 'qr' | 'nfc' | 'wifi' | 'usb';
  online: boolean;
  txPower: number;
  x: number;
  y: number;
  z: number;
  sceneType: 'master' | 'client' | 'target' | 'other';
  address?: string;
  bound?: boolean;
}

export type DeviceResource = 'hardware' | 'dongle' | 'ble_token' | 'ntag' | 'network';

export interface Pairing {
  id: string;
  name: string;
  deviceIds: string[];
  createdBy: string;
  createdAt: number;
  lastSyncAt?: number;
  lastSyncStatus?: 'ok' | 'pending' | 'failed';
}

export interface ClientPresence {
  id: string;
  user: string;
  role: string;
  deviceId?: string;
  connected: boolean;
  lastSeen: number;
  startedAt?: number;
  mode?: 'client' | 'server';
}

export interface DeviceLiveStatus {
  id: string;
  online: boolean;
  status: string;
  clientId?: string;
  lastSeen: number;
}

export interface AuditEntry {
  trace_id: string;
  step: number;
  event: string;
  user: string;
  role: string;
  resource: string;
  action: string;
  result: string;
  detail: string;
  ts: string;
}

export enum DeviceAction {
  READ = 'read',
  WRITE = 'write',
  UPDATE = 'update',
  DELETE = 'delete',
}

export type AccessTarget =
  | { kind: 'hardware'; id?: string; connectionType: ConnectionType.SERIAL | ConnectionType.USB | ConnectionType.HID }
  | { kind: 'dongle'; id?: string; connectionType: ConnectionType.DONGLE_USBC; usbVendorId?: number; usbProductId?: number }
  | { kind: 'network'; id?: string; host: string; port: number; proto: 'ssh' | 'telnet'; username?: string }
  | { kind: 'ble'; id?: string; address?: string }
  | { kind: 'nfc'; id?: string };

export interface BoundDevice {
  id: string;
  kind: DiscoveredNode['kind'];
  resource: DeviceResource;
  label: string;
  boundBy: string;
  boundAt: string;
  method: 'qr' | 'ble' | 'nfc' | 'wifi' | 'usb' | 'manual';
  rssi: number;
  permissions?: DeviceAction[];
}

export interface NetworkConfig {
  defaultMode: 'ble' | 'wifi' | 'usb';
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
}

export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
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
};

export interface MeshNode {
  id: string;
  freqMHz: number;
  rssi: number;
  active: boolean;
  lastUpdate: string;
}

export interface TerminalLine {
  ts: number;
  stream: 'in' | 'out' | 'err' | 'sys';
  text: string;
}
