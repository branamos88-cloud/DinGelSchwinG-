import { Capacitor, WebPlugin, registerPlugin } from '@capacitor/core';

export interface NativeBleDevice {
  id: string;
  name: string;
  address: string;
  rssi: number;
  txPower?: number;
}

export interface NativeUsbDevice {
  id: string;
  name: string;
  vendorId: number;
  productId: number;
  serial?: string;
}

export interface NativeNfcTag {
  id: string;
  serialNumber: string;
  records: Array<{ type: string; data: string }>;
}

export interface NativeWifiInfo {
  ssid: string;
  bssid: string;
  rssi: number;
  frequency: number;
  ip?: string;
  networks?: Array<{ ssid: string; rssi: number; frequency: number }>;
}

export interface NativePingResult {
  host: string;
  port: number;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
}

export interface NativeAdbDevice {
  id: string;
  host: string;
  port: number;
  pairingPort?: number;
  name: string;
  service: 'connect' | 'pairing' | 'classic' | 'nexus';
  state: 'found' | 'open' | 'cnxn' | 'tls' | 'failed';
  latencyMs: number | null;
  banner?: string;
}

export interface NativeCapabilities {
  platform: string;
  native: boolean;
  ble: boolean;
  nfc: boolean;
  usb: boolean;
  wifi: boolean;
  adb?: boolean;
  sdk?: number;
  manufacturer?: string;
  model?: string;
}

interface NexusBridgePlugin {
  requestAllPermissions(): Promise<{ granted: boolean; detail: Record<string, boolean> }>;
  getCapabilities(): Promise<NativeCapabilities>;
  bleScan(opts: { durationMs?: number }): Promise<{ devices: NativeBleDevice[] }>;
  bleConnect(opts: { address: string }): Promise<{ connected: boolean }>;
  bleDisconnect(opts: { address: string }): Promise<{ disconnected: boolean }>;
  bleRssi(opts: { address: string }): Promise<{ rssi: number }>;
  nfcRead(opts?: { timeoutMs?: number }): Promise<NativeNfcTag>;
  usbList(): Promise<{ devices: NativeUsbDevice[] }>;
  wifiInfo(): Promise<NativeWifiInfo>;
  pingHost(opts: { host: string; port?: number; timeoutMs?: number }): Promise<NativePingResult>;
  adbDiscover(opts?: { durationMs?: number }): Promise<{ devices: NativeAdbDevice[]; localIp?: string; percent: number }>;
  adbConnect(opts: { host: string; port?: number }): Promise<{ ok: boolean; state: string; banner?: string; latencyMs: number; error?: string }>;
  adbPair(opts: { host: string; port: number; code: string }): Promise<{ ok: boolean; detail: string }>;
}

const NexusBridge = registerPlugin<NexusBridgePlugin>('NexusBridge', {
  web: () => new WebNexusBridge(),
});

class WebNexusBridge extends WebPlugin implements NexusBridgePlugin {
  async requestAllPermissions() {
    const detail: Record<string, boolean> = {};
    try {
      if (navigator.permissions) {
        for (const name of ['camera', 'geolocation', 'microphone', 'nfc'] as PermissionName[]) {
          try {
            const s = await navigator.permissions.query({ name });
            detail[name] = s.state !== 'denied';
          } catch {
            detail[name] = true;
          }
        }
      }
    } catch {
      /* ignore */
    }
    return { granted: true, detail };
  }

  async getCapabilities(): Promise<NativeCapabilities> {
    return {
      platform: 'web',
      native: false,
      ble: Boolean(navigator.bluetooth),
      nfc: typeof window !== 'undefined' && 'NDEFReader' in window,
      usb: Boolean(navigator.usb),
      wifi: false,
      adb: true,
    };
  }

  async bleScan(): Promise<{ devices: NativeBleDevice[] }> {
    if (!navigator.bluetooth) return { devices: [] };
    try {
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information', 'generic_access'],
      });
      return {
        devices: [
          {
            id: `ble:${dev.id}`,
            name: dev.name || 'BLE-Gerät',
            address: dev.id,
            rssi: -60,
          },
        ],
      };
    } catch {
      return { devices: [] };
    }
  }

  async bleConnect() {
    return { connected: false };
  }
  async bleDisconnect() {
    return { disconnected: true };
  }
  async bleRssi() {
    return { rssi: -70 };
  }

  async nfcRead(): Promise<NativeNfcTag> {
    if (typeof window === 'undefined' || !window.NDEFReader) {
      throw new Error('NFC nicht verfügbar');
    }
    return new Promise((resolve, reject) => {
      const reader = new window.NDEFReader!();
      const timer = setTimeout(() => reject(new Error('NFC-Timeout')), 15000);
      reader.onreading = (ev) => {
        clearTimeout(timer);
        const records = Array.from(ev.message.records).map((r) => {
          try {
            const dec = new TextDecoder();
            return { type: r.recordType, data: dec.decode(r.data) };
          } catch {
            return { type: r.recordType, data: '' };
          }
        });
        resolve({
          id: `ntag:${ev.serialNumber}`,
          serialNumber: ev.serialNumber,
          records,
        });
      };
      reader.onreadingerror = () => {
        clearTimeout(timer);
        reject(new Error('NFC-Lesefehler'));
      };
      reader.scan().catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  async usbList(): Promise<{ devices: NativeUsbDevice[] }> {
    if (!navigator.usb) return { devices: [] };
    try {
      const list = await navigator.usb.getDevices();
      return {
        devices: list.map((d, i) => ({
          id: `usb:${d.vendorId.toString(16)}:${d.productId.toString(16)}:${i}`,
          name: d.productName || `USB ${d.vendorId.toString(16)}:${d.productId.toString(16)}`,
          vendorId: d.vendorId,
          productId: d.productId,
          serial: d.serialNumber,
        })),
      };
    } catch {
      return { devices: [] };
    }
  }

  async wifiInfo(): Promise<NativeWifiInfo> {
    return { ssid: '', bssid: '', rssi: 0, frequency: 0, networks: [] };
  }

  async adbDiscover(): Promise<{ devices: NativeAdbDevice[]; localIp?: string; percent: number }> {
    const hosts = ['127.0.0.1', '192.168.1.1', '192.168.0.1', '192.168.1.20', '10.0.0.1'];
    const devices: NativeAdbDevice[] = [];
    for (const host of hosts) {
      const r = await this.pingHost({ host, port: 5555, timeoutMs: 400 });
      if (r.ok) {
        devices.push({
          id: `adb:${host}:5555`,
          host,
          port: 5555,
          name: `ADB ${host}`,
          service: 'classic',
          state: 'open',
          latencyMs: r.latencyMs,
        });
      }
    }
    return { devices, percent: 100 };
  }

  async adbConnect(opts: { host: string; port?: number }) {
    const r = await this.pingHost({ host: opts.host, port: opts.port ?? 5555, timeoutMs: 1500 });
    return {
      ok: r.ok,
      state: r.ok ? 'open' : 'failed',
      latencyMs: r.latencyMs ?? 0,
      error: r.error,
      banner: r.ok ? 'tcp-open' : undefined,
    };
  }

  async adbPair(opts: { host: string; port: number; code: string }) {
    const r = await this.pingHost({ host: opts.host, port: opts.port, timeoutMs: 1500 });
    return {
      ok: r.ok && opts.code.length >= 6,
      detail: r.ok ? `Pairing-Port ${opts.host}:${opts.port} offen — Code ${opts.code}` : r.error ?? 'Pairing-Port nicht erreichbar',
    };
  }

  async pingHost(opts: { host: string; port?: number; timeoutMs?: number }): Promise<NativePingResult> {
    const host = opts.host.replace(/^https?:\/\//, '').split('/')[0];
    const start = performance.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);
    try {
      await fetch(`https://${host}`, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: controller.signal });
      return { host, port: opts.port ?? 443, ok: true, latencyMs: Math.round(performance.now() - start) };
    } catch (e) {
      return {
        host,
        port: opts.port ?? 443,
        ok: false,
        latencyMs: null,
        error: e instanceof Error ? e.message : 'timeout',
      };
    } finally {
      clearTimeout(t);
    }
  }
}

export const native = {
  isNative: () => Capacitor.isNativePlatform(),
  platform: () => Capacitor.getPlatform(),
  requestAllPermissions: () => NexusBridge.requestAllPermissions(),
  getCapabilities: () => NexusBridge.getCapabilities(),
  bleScan: (durationMs = 6000) => NexusBridge.bleScan({ durationMs }),
  bleConnect: (address: string) => NexusBridge.bleConnect({ address }),
  bleDisconnect: (address: string) => NexusBridge.bleDisconnect({ address }),
  bleRssi: (address: string) => NexusBridge.bleRssi({ address }),
  nfcRead: (timeoutMs = 15000) => NexusBridge.nfcRead({ timeoutMs }),
  usbList: () => NexusBridge.usbList(),
  wifiInfo: () => NexusBridge.wifiInfo(),
  pingHost: (host: string, port = 443, timeoutMs = 4000) => NexusBridge.pingHost({ host, port, timeoutMs }),
  adbDiscover: (durationMs = 7000) => NexusBridge.adbDiscover({ durationMs }),
  adbConnect: (host: string, port = 5555) => NexusBridge.adbConnect({ host, port }),
  adbPair: (host: string, port: number, code: string) => NexusBridge.adbPair({ host, port, code }),
};

export { NexusBridge };
