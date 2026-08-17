/**
 * BleService — echter BLE-Scan & Verbindung
 * ==========================================
 * - Android-APK (Capacitor): @capacitor-community/bluetooth-le (native)
 * - Browser (Chrome/Edge): Web Bluetooth API (navigator.bluetooth)
 * - Kein BLE verfügbar: klar gekennzeichneter Demo-Modus (opt-in in den Einstellungen)
 *
 * Alle Scan-Ergebnisse werden über den zentralen Store veröffentlicht.
 * Distanzen werden mit dem echten WASM-Modul berechnet.
 */
import type { BLEWasmExports } from '../bleWasm';
import { classifyDevice, positionFromDistance } from '../../state/devicePosition';
import type { AppSettings, Device, DeviceSource } from '../../state/types';

export interface BleScanEvent {
  id: string;
  name: string;
  address?: string;
  rssi: number;
  localName?: string;
}

export type BleCapability = 'native' | 'web' | 'none';

export function detectBleCapability(): BleCapability {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const isCapacitorNative = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
  if (isCapacitorNative) return 'native';
  if (nav && 'bluetooth' in nav) return 'web';
  return 'none';
}

/** Web-BLE-spezifische Typdeklarationen (bewusst NICHT als Navigator-Erweiterung,
 *  um Konflikte mit dem DOM-Typ `Bluetooth` zu vermeiden). */
interface WebBleApi {
  getAvailability(): Promise<boolean>;
  requestDevice(options: unknown): Promise<{
    id: string;
    name?: string;
    gatt?: {
      connect(): Promise<{ getPrimaryServices(): Promise<unknown>; disconnect(): void }>;
    };
  }>;
  requestLEScan?: (options: {
    filters?: unknown[];
    keepRepeatedDevices?: boolean;
    acceptAllAdvertisements?: boolean;
  }) => Promise<WebBleScanHandle>;
}

type WebBleNavigator = Omit<Navigator, 'bluetooth'> & { bluetooth?: WebBleApi };

interface WebBleScanHandle {
  active: boolean;
  stop(): void;
  addEventListener(type: 'advertisementreceived', listener: (ev: { device: { id: string; name?: string }; rssi: number; manufacturerData?: unknown; serviceData?: unknown }) => void): void;
}

export class BleService {
  private wasm: BLEWasmExports;
  private settings: AppSettings;
  private onDevice: (d: Device) => void;
  private onLog: (level: 'info' | 'warn' | 'error' | 'success', msg: string) => void;
  private onScanState: (running: boolean, source: DeviceSource) => void;
  private scanHandle: WebBleScanHandle | null = null;
  private demoInterval: ReturnType<typeof setInterval> | null = null;
  private bleClient: unknown = null;
  private scanning = false;

  constructor(deps: {
    wasm: BLEWasmExports;
    settings: AppSettings;
    onDevice: (d: Device) => void;
    onLog: (level: 'info' | 'warn' | 'error' | 'success', msg: string) => void;
    onScanState: (running: boolean, source: DeviceSource) => void;
  }) {
    this.wasm = deps.wasm;
    this.settings = deps.settings;
    this.onDevice = deps.onDevice;
    this.onLog = deps.onLog;
    this.onScanState = deps.onScanState;
  }

  updateSettings(settings: AppSettings) {
    this.settings = settings;
  }

  updateWasm(wasm: BLEWasmExports) {
    this.wasm = wasm;
  }

  get capability(): BleCapability {
    return detectBleCapability();
  }

  isScanning(): boolean {
    return this.scanning;
  }

  /**
   * Scan starten. Wählt automatisch den richtigen Stack (native > web > demo).
   * Demo-Modus nur, wenn in den Einstellungen explizit aktiviert.
   */
  async startScan(): Promise<void> {
    if (this.scanning) return;
    const cap = this.capability;
    if (cap === 'native') {
      try {
        await this.startNativeScan();
        return;
      } catch (e) {
        this.onLog('error', `Nativer BLE-Scan fehlgeschlagen: ${this.errMsg(e)}`);
      }
    }
    if (cap === 'web') {
      try {
        await this.startWebScan();
        return;
      } catch (e) {
        this.onLog('error', `Web-BLE-Scan fehlgeschlagen: ${this.errMsg(e)}`);
      }
    }
    if (this.settings.demoMode) {
      this.onLog('warn', 'Demo-Modus aktiv: simulierte Geräte (keine echte Hardware)');
      this.startDemoScan();
      return;
    }
    this.onLog('error', 'BLE nicht verfügbar. Chrome/Android-Gerät mit Bluetooth verwenden oder Demo-Modus in den Einstellungen aktivieren.');
    this.onScanState(false, 'ble');
  }

  async stopScan(): Promise<void> {
    this.scanning = false;
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    if (this.scanHandle) {
      try {
        this.scanHandle.stop();
      } catch {
        /* bereits gestoppt */
      }
      this.scanHandle = null;
    }
    if (this.bleClient) {
      try {
        const client = this.bleClient as { stopLEScan(): Promise<void> };
        await client.stopLEScan();
      } catch {
        /* ignorieren */
      }
    }
    this.onScanState(false, 'ble');
  }

  /** Klassifiziert + positioniert ein Scan-Ergebnis und veröffentlicht es. */
  private publishScanResult(ev: BleScanEvent, source: DeviceSource) {
    const id = ev.address ? `ble:${ev.address}` : `ble:${ev.id}`;
    const name = ev.localName || ev.name || (ev.address ? `Gerät ${ev.address.slice(-4)}` : 'Unbekanntes Gerät');
    const type = classifyDevice(name, ev.address);
    const distance = this.wasm.calculate_distance(ev.rssi, this.settings.bleTxPower);
    const pos = positionFromDistance(distance, id, null);
    const device: Device = {
      id,
      name,
      type,
      rssi: ev.rssi,
      txPower: this.settings.bleTxPower,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      distance,
      bound: false,
      address: ev.address,
      source,
      lastSeen: Date.now(),
    };
    this.onDevice(device);
  }

  // ------------------------------ Nativer Stack ------------------------------
  private async getNativeClient(): Promise<{ initialize(): Promise<void>; requestLEScan(options: unknown, callback: (result: { device: { deviceId: string; localName?: string; name?: string }, rssi: number }) => void): Promise<void>; stopLEScan(): Promise<void> }> {
    if (!this.bleClient) {
      const mod = await import('@capacitor-community/bluetooth-le');
      const client = mod.BleClient as unknown as { initialize(): Promise<void> };
      this.bleClient = client;
      await client.initialize();
    }
    return this.bleClient as { initialize(): Promise<void>; requestLEScan(options: unknown, callback: unknown): Promise<void>; stopLEScan(): Promise<void> };
  }

  private async startNativeScan(): Promise<void> {
    const client = await this.getNativeClient();
    await client.initialize();
    this.scanning = true;
    this.onScanState(true, 'ble');
    this.onLog('info', 'Nativer BLE-Scan gestartet (Capacitor Plugin)');
    await client.requestLEScan(
      { allowDuplicates: true },
      (result: { device: { deviceId: string; localName?: string; name?: string }; rssi: number }) => {
        if (!this.scanning) return;
        this.publishScanResult(
          {
            id: result.device?.deviceId || 'unknown',
            name: result.device?.name || '',
            localName: result.device?.localName || result.device?.name || undefined,
            address: result.device?.deviceId,
            rssi: result.rssi,
          },
          'ble'
        );
      }
    );
  }

  // ------------------------------- Web-BLE-Stack ------------------------------
  private async startWebScan(): Promise<void> {
    const nav = navigator as unknown as WebBleNavigator;
    if (!nav.bluetooth) throw new Error('Web Bluetooth wird von diesem Browser nicht unterstützt');
    if (nav.bluetooth.getAvailability) {
      const avail = await nav.bluetooth.getAvailability();
      if (!avail) throw new Error('Bluetooth ist ausgeschaltet oder nicht verfügbar');
    }
    this.scanning = true;
    this.onScanState(true, 'ble');
    this.onLog('info', 'Web-BLE-Scan gestartet (navigator.bluetooth)');

    // Passives Scannen (Chrome 117+): echte RSSI-Werte ohne Pairing-Dialog
    if (typeof nav.bluetooth.requestLEScan === 'function') {
      const handle = await nav.bluetooth.requestLEScan({
        acceptAllAdvertisements: true,
        keepRepeatedDevices: true,
      });
      this.scanHandle = handle;
      handle.addEventListener('advertisementreceived', (ev) => {
        if (!this.scanning) return;
        this.publishScanResult(
          {
            id: ev.device?.id || 'unknown',
            name: ev.device?.name || '',
            localName: ev.device?.name,
            rssi: ev.rssi,
          },
          'ble'
        );
      });
      return;
    }

    // Fallback: Pairing-Dialog (klassisches Web BLE)
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['battery_service', 'device_information'],
    });
    if (!device) throw new Error('Kein Gerät ausgewählt');
    this.publishScanResult(
      { id: device.id, name: device.name || 'Verbundenes Gerät', rssi: -60 },
      'ble'
    );
    this.onLog('success', `Mit ${device.name || 'Gerät'} verbunden (Web BLE)`);
    try {
      if (device.gatt) {
        await device.gatt.connect();
      }
    } catch (e) {
      this.onLog('warn', `GATT-Verbindung nicht möglich: ${this.errMsg(e)}`);
    }
  }

  // -------------------------------- Demo-Modus ---------------------------------
  /** Demo-Modus — NUR nach expliziter Aktivierung in den Einstellungen. */
  private startDemoScan(): void {
    this.scanning = true;
    this.onScanState(true, 'demo');
    const demoTemplates: Array<{ id: string; name: string; rssi: number }> = [
      { id: 'demo-master', name: 'MASTER-Gold', rssi: -42 },
      { id: 'demo-client-a', name: 'Client-A', rssi: -62 },
      { id: 'demo-client-b', name: 'Client-B', rssi: -68 },
      { id: 'demo-target', name: 'Target-X', rssi: -74 },
    ];
    const publish = () => {
      if (!this.scanning) return;
      demoTemplates.forEach((t) => {
        const jitter = Math.round((Math.random() - 0.5) * 4);
        this.publishScanResult(
          { id: t.id, name: t.name, rssi: t.rssi + jitter },
          'demo'
        );
      });
    };
    publish();
    this.demoInterval = setInterval(publish, Math.max(500, this.settings.scanIntervalMs));
  }

  private errMsg(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
  }
}
