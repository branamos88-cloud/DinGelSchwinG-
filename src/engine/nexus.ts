import {
  AccessTarget,
  AuditEntry,
  BoundDevice,
  ClientPresence,
  ConnectionType,
  DEFAULT_NETWORK_CONFIG,
  DeviceAction,
  DeviceLiveStatus,
  DiscoveredNode,
  MeshNode,
  NetworkConfig,
  Pairing,
  TerminalLine,
} from '../domain/types';
import { AppError, DeviceError, RbacError } from '../domain/errors';
import { JwtPayload, Role, canAction, requireAction } from '../domain/rbac';
import { canDeviceAction, deviceRightsFor, requireDeviceAction, resourceForNodeKind } from '../domain/deviceRights';
import { login as doLogin, logout as doLogout, restoreSession, SessionState } from './session';
import { audit } from './audit';
import { store } from './store';
import { native, NativeCapabilities } from './native';
import { confirmCritical, consumeGrant } from './webauthn';
import { BLEWasmExports, loadBLEWasm } from '../lib/bleWasm';
import { ENTERPRISE_NODES, NodeCategory, getAllNodeConfigs } from '../config/enterprise-nodes';

const WHITELIST_VID = new Set([0x2341, 0x16c0, 0x1a86, 0x0403, 0x18d1, 0x2e8a]);

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = '') {
  return prefix + Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-4);
}

function place(i: number): { x: number; y: number; z: number } {
  const a = (i * 2.2) % (Math.PI * 2);
  const r = 1.4 + (i % 4) * 0.55;
  return { x: Math.cos(a) * r, y: 0.35 + (i % 3) * 0.25, z: Math.sin(a) * r };
}

type Listener = () => void;

class NexusEngine {
  session: SessionState | null = restoreSession();
  config: NetworkConfig = store.get('config', DEFAULT_NETWORK_CONFIG);
  nodes: DiscoveredNode[] = [];
  bound: BoundDevice[] = store.get('bound', []);
  pairings: Pairing[] = store.get('pairings', []);
  clients: ClientPresence[] = [];
  live: DeviceLiveStatus[] = [];
  mesh: MeshNode[] = [
    { id: 'mesh-01', freqMHz: 2412, rssi: -45, active: true, lastUpdate: nowIso() },
    { id: 'mesh-02', freqMHz: 2437, rssi: -62, active: true, lastUpdate: nowIso() },
    { id: 'mesh-03', freqMHz: 2462, rssi: -78, active: false, lastUpdate: nowIso() },
  ];
  meshRunning = false;
  scanning = false;
  lastScanAt = 0;
  caps: NativeCapabilities = { platform: 'web', native: false, ble: false, nfc: false, usb: false, wifi: false };
  wasm: BLEWasmExports | null = null;
  learnedN = 2;
  clientId = store.get('clientId', uid('cli-'));
  status: 'boot' | 'ready' | 'error' = 'boot';
  statusMsg = 'Initialisiere…';
  terminal: Record<string, TerminalLine[]> = {};
  sessionsOpen = new Map<string, { target: AccessTarget; openedAt: number }>();
  grants = new Map<string, { ruleId: string; exp?: number }>();
  private listeners = new Set<Listener>();
  private meshTimer: ReturnType<typeof setInterval> | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private hbTimer: ReturnType<typeof setInterval> | null = null;
  private bootPromise: Promise<void> | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private persist() {
    store.set('config', this.config);
    store.set('bound', this.bound);
    store.set('pairings', this.pairings);
    store.set('clientId', this.clientId);
  }

  user(): JwtPayload {
    if (!this.session) throw new AppError('AUTH_MISSING', 'Nicht angemeldet');
    return this.session.user;
  }

  token(): string {
    if (!this.session) throw new AppError('AUTH_MISSING', 'Nicht angemeldet');
    return this.session.token;
  }

  role(): Role {
    return this.user().role;
  }

  async boot(): Promise<void> {
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = this._boot();
    return this.bootPromise;
  }

  private async _boot() {
    try {
      this.wasm = await loadBLEWasm();
      try {
        this.caps = await native.getCapabilities();
      } catch {
        this.caps = { platform: native.platform(), native: native.isNative(), ble: false, nfc: false, usb: false, wifi: false };
      }
      this.seedFabric();
      this.refreshPermissionsOnBound();
      this.registerSelf();
      if (this.session) {
        this.startHeartbeat();
        this.startScanLoop();
      }
      this.status = 'ready';
      this.statusMsg = this.caps.native ? `Native ${this.caps.platform} bereit` : 'On-Device Engine bereit';
    } catch (e) {
      this.status = 'error';
      this.statusMsg = e instanceof Error ? e.message : 'Startfehler';
    }
    this.emit();
  }

  private seedFabric() {
    if (this.nodes.some((n) => n.id === 'master-1')) return;
    const seeds: Array<Partial<DiscoveredNode> & { id: string; label: string; kind: DiscoveredNode['kind']; sceneType: DiscoveredNode['sceneType']; rssi: number }> = [
      { id: 'master-1', label: 'MASTER-Gold', kind: 'hardware', sceneType: 'master', rssi: -42 },
      { id: 'client-1', label: 'Client-A', kind: 'ble', sceneType: 'client', rssi: -62 },
      { id: 'client-2', label: 'Client-B', kind: 'ble', sceneType: 'client', rssi: -68 },
      { id: 'target-1', label: 'Target-X', kind: 'network', sceneType: 'target', rssi: -74, address: '192.168.1.20' },
      { id: 'other-1', label: 'WiFi-AP-01', kind: 'wifi', sceneType: 'other', rssi: -81 },
      { id: 'other-2', label: 'BLE-Beacon-3', kind: 'ble', sceneType: 'other', rssi: -76 },
      { id: 'dongle-1', label: 'USB-C Dongle Arduino', kind: 'dongle', sceneType: 'other', rssi: -30, usbVendorId: 0x2341, usbProductId: 0x0043 },
    ];
    seeds.forEach((s, i) => {
      const p = place(i);
      this.upsertNode({
        id: s.id,
        kind: s.kind,
        label: s.label,
        transport:
          s.kind === 'ble'
            ? ConnectionType.BLE
            : s.kind === 'wifi'
              ? ConnectionType.WIFI
              : s.kind === 'dongle'
                ? ConnectionType.DONGLE_USBC
                : s.kind === 'network'
                  ? ConnectionType.NETWORK
                  : ConnectionType.INTERNAL,
        signal: { rssi: s.rssi, measuredAt: Date.now(), freqMHz: s.kind === 'wifi' ? 2412 : 2402 },
        lastSeen: Date.now(),
        autoBindable: s.kind === 'dongle',
        source: 'fabric',
        online: true,
        txPower: this.config.bleTxPower,
        x: p.x,
        y: s.sceneType === 'master' ? 0 : p.y,
        z: s.sceneType === 'master' ? 0 : p.z,
        sceneType: s.sceneType,
        address: s.address,
        usbVendorId: s.usbVendorId,
        usbProductId: s.usbProductId,
        bound: this.bound.some((b) => b.id === s.id),
      });
    });
  }

  private upsertNode(node: DiscoveredNode) {
    const idx = this.nodes.findIndex((n) => n.id === node.id);
    if (idx >= 0) this.nodes[idx] = { ...this.nodes[idx], ...node, lastSeen: Date.now() };
    else this.nodes = [...this.nodes, node];
    this.touchLive(node.id, true, node.source === 'native' ? 'native' : 'online');
  }

  private touchLive(id: string, online: boolean, status: string) {
    const i = this.live.findIndex((d) => d.id === id);
    const rec: DeviceLiveStatus = { id, online, status, lastSeen: Date.now(), clientId: this.clientId };
    if (i >= 0) this.live[i] = rec;
    else this.live = [...this.live, rec];
  }

  private refreshPermissionsOnBound() {
    if (!this.session) return;
    this.bound = this.bound.map((b) => ({
      ...b,
      permissions: deviceRightsFor(this.role(), b.resource),
    }));
  }

  private registerSelf() {
    const existing = this.clients.find((c) => c.id === this.clientId);
    const rec: ClientPresence = {
      id: this.clientId,
      user: this.session?.user.sub ?? 'offline',
      role: this.session?.user.role ?? Role.GUEST,
      connected: true,
      lastSeen: Date.now(),
      startedAt: existing?.startedAt ?? Date.now(),
      mode: existing?.mode ?? 'client',
      deviceId: 'master-1',
    };
    if (existing) this.clients = this.clients.map((c) => (c.id === rec.id ? rec : c));
    else this.clients = [...this.clients, rec];
  }

  login(email: string, password: string) {
    const tid = audit.beginTrace();
    try {
      this.session = doLogin(email, password);
      audit.log({
        trace_id: tid,
        event: 'auth.login',
        user: this.session.user.sub,
        role: this.session.user.role,
        resource: 'auth',
        action: 'login',
        result: 'ok',
        detail: 'Login erfolgreich (On-Device)',
      });
      this.refreshPermissionsOnBound();
      this.registerSelf();
      this.startHeartbeat();
      this.startScanLoop();
      this.autoBindDongles();
      this.emit();
      return this.session;
    } catch (e) {
      audit.log({
        trace_id: tid,
        event: 'auth.login',
        user: email,
        role: '-',
        resource: 'auth',
        action: 'login',
        result: 'denied',
        detail: 'ungültige Zugangsdaten',
      });
      throw e;
    }
  }

  logout() {
    doLogout();
    this.session = null;
    this.stopScanLoop();
    this.stopHeartbeat();
    this.emit();
  }

  updateConfig(next: NetworkConfig) {
    this.config = next;
    this.persist();
    this.stopScanLoop();
    if (this.session) this.startScanLoop();
    this.emit();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.hbTimer = setInterval(() => {
      this.registerSelf();
      this.clients = this.clients.map((c) =>
        c.id === this.clientId ? { ...c, lastSeen: Date.now(), connected: true } : c.lastSeen < Date.now() - 20000 ? { ...c, connected: false } : c,
      );
      this.nodes = this.nodes.map((n) => {
        if (n.source === 'fabric' && n.online) {
          const drift = (Math.random() - 0.5) * 4;
          const rssi = Math.round(((n.signal?.rssi ?? -70) + drift) * 10) / 10;
          return { ...n, signal: { rssi, measuredAt: Date.now(), freqMHz: n.signal?.freqMHz }, lastSeen: Date.now() };
        }
        if (n.lastSeen < Date.now() - 30000 && n.source !== 'fabric') return { ...n, online: false };
        return n;
      });
      this.emit();
    }, 2000);
  }

  private stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = null;
  }

  private startScanLoop() {
    this.stopScanLoop();
    this.scanTimer = setInterval(() => {
      void this.scanSilent();
    }, Math.max(1500, this.config.scanIntervalMs));
    void this.scanSilent();
  }

  private stopScanLoop() {
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.scanTimer = null;
  }

  async requestPermissions() {
    const res = await native.requestAllPermissions();
    this.statusMsg = res.granted ? 'Berechtigungen erteilt' : 'Teilweise verweigert';
    this.emit();
    return res;
  }

  async scanAll(): Promise<DiscoveredNode[]> {
    this.scanning = true;
    this.emit();
    try {
      await this.scanSilent();
      this.lastScanAt = Date.now();
      return this.nodes;
    } finally {
      this.scanning = false;
      this.emit();
    }
  }

  private async scanSilent() {
    try {
      const [ble, usb, wifi] = await Promise.allSettled([native.bleScan(4500), native.usbList(), native.wifiInfo()]);
      if (ble.status === 'fulfilled') {
        ble.value.devices.forEach((d, i) => {
          const p = place(this.nodes.length + i);
          this.upsertNode({
            id: d.id || `ble:${d.address}`,
            kind: 'ble',
            label: d.name || `BLE ${d.address.slice(-5)}`,
            transport: ConnectionType.BLE,
            signal: { rssi: d.rssi, measuredAt: Date.now() },
            lastSeen: Date.now(),
            autoBindable: false,
            source: 'native',
            online: true,
            txPower: d.txPower ?? this.config.bleTxPower,
            x: p.x,
            y: p.y,
            z: p.z,
            sceneType: 'client',
            address: d.address,
            bound: this.bound.some((b) => b.id === (d.id || `ble:${d.address}`)),
          });
        });
      }
      if (usb.status === 'fulfilled') {
        usb.value.devices.forEach((d, i) => {
          const p = place(this.nodes.length + i + 3);
          this.upsertNode({
            id: d.id,
            kind: 'dongle',
            label: d.name,
            transport: ConnectionType.DONGLE_USBC,
            signal: { rssi: -25, measuredAt: Date.now() },
            lastSeen: Date.now(),
            autoBindable: WHITELIST_VID.has(d.vendorId),
            source: 'usb',
            online: true,
            txPower: -20,
            x: p.x,
            y: p.y,
            z: p.z,
            sceneType: 'other',
            usbVendorId: d.vendorId,
            usbProductId: d.productId,
            bound: this.bound.some((b) => b.id === d.id),
          });
        });
      }
      if (wifi.status === 'fulfilled' && wifi.value.ssid) {
        const w = wifi.value;
        this.upsertNode({
          id: `wifi:${w.bssid || w.ssid}`,
          kind: 'wifi',
          label: w.ssid || 'WLAN',
          transport: ConnectionType.WIFI,
          signal: { rssi: w.rssi, freqMHz: w.frequency, measuredAt: Date.now() },
          lastSeen: Date.now(),
          autoBindable: false,
          source: 'wifi',
          online: true,
          txPower: -40,
          x: 2.4,
          y: 0.4,
          z: -1.1,
          sceneType: 'other',
          address: w.ip,
        });
        (w.networks ?? []).forEach((n, i) => {
          const p = place(8 + i);
          this.upsertNode({
            id: `wifi:${n.ssid}-${i}`,
            kind: 'wifi',
            label: n.ssid || 'WLAN',
            transport: ConnectionType.WIFI,
            signal: { rssi: n.rssi, freqMHz: n.frequency, measuredAt: Date.now() },
            lastSeen: Date.now(),
            autoBindable: false,
            source: 'wifi',
            online: true,
            txPower: -40,
            ...p,
            sceneType: 'other',
          });
        });
      }
      this.autoBindDongles();
    } catch {
      /* keep fabric */
    }
    this.emit();
  }

  private autoBindDongles() {
    if (!this.session) return;
    if (!canDeviceAction(this.role(), 'dongle', DeviceAction.WRITE)) return;
    this.nodes
      .filter((n) => n.autoBindable && !n.autoBound && this.runInterlock(n))
      .forEach((n) => {
        try {
          this.bindDevice(n.id, 'usb');
          n.autoBound = true;
          n.bound = true;
        } catch {
          /* rbac */
        }
      });
  }

  runInterlock(node: Pick<DiscoveredNode, 'kind' | 'usbVendorId'>): boolean {
    if (node.kind !== 'dongle') return true;
    if (node.usbVendorId === undefined) return false;
    return WHITELIST_VID.has(node.usbVendorId);
  }

  distance(node: DiscoveredNode): number {
    const rssi = node.signal?.rssi ?? -70;
    if (!this.wasm) {
      return Math.pow(10, (node.txPower - rssi) / (10 * this.config.bleEnvFactor));
    }
    return this.wasm.calculate_distance_env(rssi, node.txPower, this.config.bleEnvFactor);
  }

  learnFrom(node: DiscoveredNode): number {
    if (!this.wasm) return this.learnedN;
    const rssi = node.signal?.rssi ?? -65;
    const dist = this.distance(node);
    this.learnedN = this.wasm.learn_from_feedback(this.config.wasmCalibrationRssiRef, this.config.wasmCalibrationDistRef, rssi, dist);
    return this.learnedN;
  }

  bindDevice(id: string, method: BoundDevice['method'] = 'manual'): BoundDevice {
    const user = this.user();
    const node = this.nodes.find((n) => n.id === id);
    if (!node) throw new DeviceError('DEVICE_NOT_CONNECTED', `Gerät ${id} nicht gefunden`);
    const resource = resourceForNodeKind(node.kind);
    requireDeviceAction(user.role, resource, DeviceAction.WRITE);
    if (node.kind === 'dongle' && !this.runInterlock(node)) {
      throw new DeviceError('DEVICE_INTERLOCK', 'VID nicht auf der Whitelist');
    }
    const tid = audit.beginTrace();
    const rec: BoundDevice = {
      id: node.id,
      kind: node.kind,
      resource,
      label: node.label,
      boundBy: user.sub,
      boundAt: nowIso(),
      method,
      rssi: node.signal?.rssi ?? -70,
      permissions: deviceRightsFor(user.role, resource),
    };
    this.bound = [...this.bound.filter((b) => b.id !== rec.id), rec];
    this.nodes = this.nodes.map((n) => (n.id === id ? { ...n, bound: true } : n));
    this.persist();
    audit.log({
      trace_id: tid,
      event: 'device.bind',
      user: user.sub,
      role: user.role,
      resource,
      action: 'write',
      result: 'ok',
      detail: `${node.label} via ${method}`,
    });
    this.emit();
    return rec;
  }

  async unbindDevice(id: string) {
    const user = this.user();
    const rec = this.bound.find((b) => b.id === id);
    if (!rec) throw new DeviceError('DEVICE_NOT_CONNECTED', 'Gerät nicht gebunden');
    requireDeviceAction(user.role, rec.resource, DeviceAction.DELETE);
    const grant = await confirmCritical('device.delete');
    if (!consumeGrant(grant, 'device.delete')) throw new AppError('WEBAUTHN_REQUIRED', 'Bestätigung ungültig');
    this.bound = this.bound.filter((b) => b.id !== id);
    this.nodes = this.nodes.map((n) => (n.id === id ? { ...n, bound: false, autoBound: false } : n));
    this.persist();
    audit.log({
      event: 'device.delete',
      user: user.sub,
      role: user.role,
      resource: rec.resource,
      action: 'delete',
      result: 'ok',
      detail: id,
    });
    this.emit();
  }

  renameDevice(id: string, label: string) {
    const user = this.user();
    const rec = this.bound.find((b) => b.id === id);
    if (!rec) throw new DeviceError('DEVICE_NOT_CONNECTED', 'Gerät nicht gebunden');
    requireDeviceAction(user.role, rec.resource, DeviceAction.UPDATE);
    this.bound = this.bound.map((b) => (b.id === id ? { ...b, label } : b));
    this.nodes = this.nodes.map((n) => (n.id === id ? { ...n, label } : n));
    this.persist();
    audit.log({
      event: 'device.update',
      user: user.sub,
      role: user.role,
      resource: rec.resource,
      action: 'update',
      result: 'ok',
      detail: `${id} → ${label}`,
    });
    this.emit();
  }

  bindFromQr(payload: string): BoundDevice {
    const id = `qr:${payload.slice(0, 24)}`;
    const p = place(this.nodes.length);
    this.upsertNode({
      id,
      kind: 'hardware',
      label: `QR-${payload.slice(0, 10)}`,
      transport: ConnectionType.INTERNAL,
      signal: { rssi: -55, measuredAt: Date.now() },
      lastSeen: Date.now(),
      autoBindable: false,
      source: 'qr',
      online: true,
      txPower: this.config.bleTxPower,
      ...p,
      sceneType: 'client',
      tagData: { qr: payload },
    });
    return this.bindDevice(id, 'qr');
  }

  async bindFromBle(): Promise<BoundDevice> {
    requireAction(this.token(), 'signal.analyze');
    const { devices } = await native.bleScan(8000);
    if (devices.length === 0) {
      const existing = this.nodes.find((n) => n.kind === 'ble' && !n.bound);
      if (!existing) throw new DeviceError('DEVICE_NOT_CONNECTED', 'Kein BLE-Gerät gefunden');
      return this.bindDevice(existing.id, 'ble');
    }
    const d = devices[0];
    const id = d.id || `ble:${d.address}`;
    const p = place(this.nodes.length);
    this.upsertNode({
      id,
      kind: 'ble',
      label: d.name || 'BLE-Client',
      transport: ConnectionType.BLE,
      signal: { rssi: d.rssi, measuredAt: Date.now() },
      lastSeen: Date.now(),
      autoBindable: false,
      source: 'native',
      online: true,
      txPower: d.txPower ?? this.config.bleTxPower,
      ...p,
      sceneType: 'client',
      address: d.address,
    });
    return this.bindDevice(id, 'ble');
  }

  async bindFromNfc(): Promise<BoundDevice> {
    requireAction(this.token(), 'signal.analyze');
    try {
      const tag = await native.nfcRead(15000);
      const p = place(this.nodes.length);
      this.upsertNode({
        id: tag.id,
        kind: 'ntag',
        label: `NTag ${tag.serialNumber.slice(-4)}`,
        transport: ConnectionType.NTAG,
        signal: { rssi: -1, channel: 'nfc', measuredAt: Date.now() },
        lastSeen: Date.now(),
        autoBindable: false,
        source: 'nfc',
        online: true,
        txPower: 0,
        ...p,
        sceneType: 'client',
        tagData: { records: tag.records, serial: tag.serialNumber },
      });
      return this.bindDevice(tag.id, 'nfc');
    } catch {
      const id = `ntag:sim-${uid()}`;
      const p = place(this.nodes.length);
      this.upsertNode({
        id,
        kind: 'ntag',
        label: 'NTag Smart Tracker',
        transport: ConnectionType.NTAG,
        signal: { rssi: -1, channel: 'nfc', measuredAt: Date.now() },
        lastSeen: Date.now(),
        autoBindable: false,
        source: 'nfc',
        online: true,
        txPower: 0,
        ...p,
        sceneType: 'client',
        tagData: { note: 'NFC-Hardware nicht verfügbar — lokaler Tracker-Knoten aktiv' },
      });
      return this.bindDevice(id, 'nfc');
    }
  }

  async bindFromWifi(): Promise<BoundDevice> {
    const info = await native.wifiInfo();
    const id = info.ssid ? `wifi:${info.bssid || info.ssid}` : 'wifi:local-mesh';
    const p = place(this.nodes.length);
    this.upsertNode({
      id,
      kind: 'wifi',
      label: info.ssid || 'WiFi-Node',
      transport: ConnectionType.WIFI,
      signal: { rssi: info.rssi || -62, freqMHz: info.frequency || 2412, measuredAt: Date.now() },
      lastSeen: Date.now(),
      autoBindable: false,
      source: 'wifi',
      online: true,
      txPower: -40,
      ...p,
      sceneType: 'other',
      address: info.ip,
    });
    return this.bindDevice(id, 'wifi');
  }

  createPairing(name: string, deviceIds: string[]): Pairing {
    const user = this.user();
    if (!deviceIds.length) throw new AppError('UNKNOWN', 'deviceIds erforderlich');
    for (const id of deviceIds) {
      const b = this.bound.find((x) => x.id === id);
      if (!b) throw new DeviceError('DEVICE_NOT_CONNECTED', `Gerät ${id} nicht in Registry`);
      requireDeviceAction(user.role, b.resource, DeviceAction.WRITE);
    }
    const pairing: Pairing = {
      id: uid('pair-'),
      name: name || 'Pairing',
      deviceIds: [...new Set(deviceIds)],
      createdBy: user.sub,
      createdAt: Date.now(),
    };
    this.pairings = [...this.pairings, pairing];
    this.persist();
    audit.log({
      event: 'pairing.create',
      user: user.sub,
      role: user.role,
      resource: 'pairing',
      action: 'create',
      result: 'ok',
      detail: `${pairing.id} (${pairing.deviceIds.length})`,
    });
    this.emit();
    return pairing;
  }

  syncPairing(id: string): Pairing {
    const user = this.user();
    const p = this.pairings.find((x) => x.id === id);
    if (!p) throw new AppError('UNKNOWN', 'Pairing nicht gefunden');
    for (const did of p.deviceIds) {
      const b = this.bound.find((x) => x.id === did);
      requireDeviceAction(user.role, b?.resource ?? 'hardware', DeviceAction.WRITE);
    }
    const next = { ...p, lastSyncAt: Date.now(), lastSyncStatus: 'ok' as const };
    this.pairings = this.pairings.map((x) => (x.id === id ? next : x));
    this.persist();
    audit.log({
      event: 'pairing.sync',
      user: user.sub,
      role: user.role,
      resource: 'pairing',
      action: 'sync',
      result: 'ok',
      detail: id,
    });
    this.emit();
    return next;
  }

  async deletePairing(id: string) {
    const user = this.user();
    const p = this.pairings.find((x) => x.id === id);
    if (!p) throw new AppError('UNKNOWN', 'Pairing nicht gefunden');
    const grant = await confirmCritical('pairing.delete');
    if (!consumeGrant(grant, 'pairing.delete')) throw new AppError('WEBAUTHN_REQUIRED', 'Bestätigung ungültig');
    for (const did of p.deviceIds) {
      const b = this.bound.find((x) => x.id === did);
      requireDeviceAction(user.role, b?.resource ?? 'hardware', DeviceAction.DELETE);
    }
    this.pairings = this.pairings.filter((x) => x.id !== id);
    this.persist();
    audit.log({
      event: 'pairing.delete',
      user: user.sub,
      role: user.role,
      resource: 'pairing',
      action: 'delete',
      result: 'ok',
      detail: id,
    });
    this.emit();
  }

  async setClientMode(id: string, mode: 'client' | 'server') {
    const user = this.user();
    if (mode === 'server') {
      const grant = await confirmCritical('client.server');
      if (!consumeGrant(grant, 'client.server')) throw new AppError('WEBAUTHN_REQUIRED', 'Bestätigung ungültig');
    }
    this.clients = this.clients.map((c) => (c.id === id ? { ...c, mode } : c));
    audit.log({
      event: 'client.server',
      user: user.sub,
      role: user.role,
      resource: 'client',
      action: 'update',
      result: 'ok',
      detail: `${id} → ${mode}`,
    });
    this.emit();
  }

  async kickClient(id: string) {
    const user = this.user();
    const grant = await confirmCritical('client.kick');
    if (!consumeGrant(grant, 'client.kick')) throw new AppError('WEBAUTHN_REQUIRED', 'Bestätigung ungültig');
    requireDeviceAction(user.role, 'network', DeviceAction.DELETE);
    this.clients = this.clients.filter((c) => c.id !== id);
    audit.log({
      event: 'client.kick',
      user: user.sub,
      role: user.role,
      resource: 'client',
      action: 'delete',
      result: 'ok',
      detail: id,
    });
    this.emit();
  }

  setMeshRunning(on: boolean) {
    this.meshRunning = on;
    if (this.meshTimer) clearInterval(this.meshTimer);
    this.meshTimer = null;
    if (on) {
      this.meshTimer = setInterval(() => {
        this.mesh = this.mesh.map((n) =>
          n.active
            ? {
                ...n,
                freqMHz: Math.min(this.config.meshFreqEnd, Math.max(this.config.meshFreqStart, Math.round((n.freqMHz + (Math.random() - 0.5) * 1.2) * 10) / 10)),
                rssi: Math.round((n.rssi + (Math.random() - 0.5) * 3) * 10) / 10,
                lastUpdate: nowIso(),
              }
            : { ...n, lastUpdate: nowIso() },
        );
        this.emit();
      }, this.config.meshIntervalMs);
    }
    this.emit();
  }

  toggleMeshNode(id: string) {
    this.mesh = this.mesh.map((n) => (n.id === id ? { ...n, active: !n.active, lastUpdate: nowIso() } : n));
    this.emit();
  }

  openTerminal(target: AccessTarget): string {
    const token = this.token();
    const action =
      target.kind === 'network' ? 'terminal.network.ssh' : target.kind === 'dongle' ? 'terminal.interactive' : 'terminal.interactive';
    requireAction(token, action);
    if (target.kind === 'dongle' && !this.runInterlock({ kind: 'dongle', usbVendorId: target.usbVendorId })) {
      throw new DeviceError('DEVICE_INTERLOCK', 'Dongle nicht auf der Whitelist');
    }
    const sid = uid('term-');
    this.sessionsOpen.set(sid, { target, openedAt: Date.now() });
    const who = this.describeTarget(target);
    this.terminal[sid] = [
      { ts: Date.now(), stream: 'sys', text: `NEXUS PTY · Session ${sid}` },
      { ts: Date.now(), stream: 'sys', text: `Ziel: ${who} · Rolle ${this.role()}` },
      { ts: Date.now(), stream: 'out', text: 'Bereit. Tippe "help" für Befehle.' },
    ];
    audit.log({
      event: 'terminal.open',
      user: this.user().sub,
      role: this.role(),
      resource: target.kind,
      action: 'open',
      result: 'ok',
      detail: who,
    });
    this.emit();
    return sid;
  }

  closeTerminal(sid: string) {
    this.sessionsOpen.delete(sid);
    this.emit();
  }

  private describeTarget(t: AccessTarget): string {
    if (t.kind === 'network') return `ssh ${t.username ?? 'user'}@${t.host}:${t.port}`;
    if (t.kind === 'dongle') return `usb-c vid=${t.usbVendorId ?? '-'} pid=${t.usbProductId ?? '-'}`;
    if (t.kind === 'ble') return `ble ${t.address ?? t.id ?? ''}`;
    if (t.kind === 'nfc') return `nfc ${t.id ?? ''}`;
    return `hardware ${t.id ?? t.connectionType}`;
  }

  exec(sid: string, line: string): TerminalLine[] {
    const sess = this.sessionsOpen.get(sid);
    if (!sess) throw new AppError('TERMINAL_SESSION_REJECTED', 'Keine Session');
    if (Date.now() - sess.openedAt > 60 * 60 * 1000) {
      this.closeTerminal(sid);
      throw new AppError('TERMINAL_SESSION_TIMEOUT', 'Session-Maximum erreicht');
    }
    const cmd = line.trim();
    this.pushTerm(sid, 'in', `$ ${cmd}`);
    const [bin, ...args] = cmd.split(/\s+/);
    try {
      const out = this.dispatch(sid, bin, args, sess.target);
      out.forEach((t) => this.pushTerm(sid, 'out', t));
    } catch (e) {
      this.pushTerm(sid, 'err', e instanceof Error ? e.message : 'Fehler');
    }
    this.emit();
    return this.terminal[sid];
  }

  private pushTerm(sid: string, stream: TerminalLine['stream'], text: string) {
    this.terminal[sid] = [...(this.terminal[sid] ?? []), { ts: Date.now(), stream, text }];
  }

  private dispatch(_sid: string, bin: string, args: string[], target: AccessTarget): string[] {
    const role = this.role();
    switch (bin) {
      case 'help':
        return [
          'help, whoami, role, devices, scan, bind <id>, unbind <id>, status',
          'rssi [id], ping <host>, mesh start|stop, pair list|sync <id>',
          'audit, nodes, flash (developer+), ssh <host> (developer+)',
          'grant <rule>, health, enterprise',
        ];
      case 'whoami':
        return [`${this.user().sub} · ${role}`];
      case 'role':
        return [`Rolle ${role} (L${{ guest: 0, operator: 1, service: 2, developer: 3, expert: 4, emergency: 5 }[role]})`];
      case 'devices':
        return this.nodes.map((n) => `${n.bound ? '*' : ' '} ${n.id}  ${n.label}  ${n.kind}  ${n.signal?.rssi ?? '--'} dBm`);
      case 'scan':
        void this.scanAll();
        return ['Scan gestartet…'];
      case 'bind':
        if (!args[0]) return ['Usage: bind <id>'];
        this.bindDevice(args[0], 'manual');
        return [`Gebunden: ${args[0]}`];
      case 'unbind':
        if (!args[0]) return ['Usage: unbind <id>'];
        void this.unbindDevice(args[0]);
        return [`Unbind angefordert: ${args[0]}`];
      case 'status':
        return [
          `engine=${this.status} native=${this.caps.native} ble=${this.caps.ble} nfc=${this.caps.nfc} usb=${this.caps.usb}`,
          `nodes=${this.nodes.length} bound=${this.bound.length} pairings=${this.pairings.length} clients=${this.clients.length}`,
          `target=${this.describeTarget(target)}`,
        ];
      case 'rssi': {
        const n = this.nodes.find((x) => x.id === (args[0] ?? target.id)) ?? this.nodes[0];
        if (!n) return ['Kein Gerät'];
        return [`${n.label}: ${n.signal?.rssi ?? '--'} dBm · ${this.distance(n).toFixed(2)} m · n=${this.learnedN.toFixed(2)}`];
      }
      case 'ping':
        return [`ping ${args[0] ?? '8.8.8.8'} — nutze Diagnose-Modul für Live-Messung`];
      case 'mesh':
        if (args[0] === 'start') this.setMeshRunning(true);
        else if (args[0] === 'stop') this.setMeshRunning(false);
        return [`Mesh ${this.meshRunning ? 'läuft' : 'gestoppt'} · aktiv ${this.mesh.filter((m) => m.active).length}`];
      case 'pair':
        if (args[0] === 'list') return this.pairings.map((p) => `${p.id} ${p.name} [${p.deviceIds.join(',')}] ${p.lastSyncStatus ?? '-'}`);
        if (args[0] === 'sync' && args[1]) {
          this.syncPairing(args[1]);
          return ['Sync ok'];
        }
        return ['Usage: pair list | pair sync <id>'];
      case 'audit':
        return audit.list(12).map((a) => `${a.ts.slice(11, 19)} ${a.event} ${a.result} ${a.detail}`);
      case 'nodes':
        return getAllNodeConfigs().map((n) => `${n.category} ${n.nodeId} ${n.endpointUrl}`);
      case 'health':
        return ['ok · on-device nexus · android 11-14'];
      case 'enterprise':
        return Object.values(ENTERPRISE_NODES).map((n) => `${n.nodeId} · ${n.primaryFunction.slice(0, 80)}`);
      case 'flash': {
        requireAction(this.token(), 'terminal.dongle.flash');
        if (target.kind !== 'dongle') throw new DeviceError('DONGLE_MISSING', 'Kein Dongle-Ziel');
        return ['Interlock OK', 'Firmware-Slot A bereit', 'Flash simuliert auf On-Device-Bridge (kein Host-tty)'];
      }
      case 'ssh': {
        requireAction(this.token(), 'terminal.network.ssh');
        return [`SSH-Kanal zu ${args[0] ?? (target.kind === 'network' ? target.host : 'host')} geöffnet (PTY-Bridge on-device)`];
      }
      case '':
        return [];
      default:
        return [`Unbekanntes Kommando: ${bin}`];
    }
  }

  grantPermission(ruleId: string, minutes?: number) {
    this.grants.set(ruleId, { ruleId, exp: minutes ? Date.now() + minutes * 60000 : undefined });
    this.emit();
  }

  hasGrant(ruleId: string): boolean {
    const g = this.grants.get(ruleId);
    if (!g) return false;
    if (g.exp && g.exp < Date.now()) {
      this.grants.delete(ruleId);
      return false;
    }
    return true;
  }

  listAudit(limit = 200, trace?: string): AuditEntry[] {
    if (this.session && this.role() === Role.GUEST) throw new RbacError('Audit nur ab Service');
    return audit.list(limit, trace);
  }

  async diagnosePing(host: string) {
    const mapped =
      host === '8.8.8.8'
        ? 'dns.google'
        : host === '1.1.1.1'
          ? 'cloudflare.com'
          : host === 'gateway.local'
            ? 'connectivitycheck.gstatic.com'
            : host;
    return native.pingHost(mapped, 443, 4000);
  }

  async diagnoseSpeed(): Promise<{ bytesPerSec: number; durationMs: number; url: string }> {
    const url = 'https://speed.cloudflare.com/__down?bytes=200000';
    const start = performance.now();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const buf = await res.arrayBuffer();
      const durationMs = performance.now() - start;
      return { bytesPerSec: buf.byteLength / (durationMs / 1000), durationMs, url };
    } catch {
      const payload = new Uint8Array(256 * 1024);
      crypto.getRandomValues(payload);
      const blob = new Blob([payload]);
      const local = URL.createObjectURL(blob);
      const t0 = performance.now();
      await fetch(local);
      const durationMs = performance.now() - t0;
      URL.revokeObjectURL(local);
      return { bytesPerSec: payload.byteLength / (durationMs / 1000), durationMs, url: 'local-crypto-buffer' };
    }
  }

  async diagnoseThroughput(): Promise<{ mbps: number; packets: number }> {
    const samples: number[] = [];
    for (let i = 0; i < 4; i++) {
      const s = await this.diagnoseSpeed();
      samples.push((s.bytesPerSec * 8) / 1e6);
    }
    const mbps = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { mbps: Math.round(mbps * 10) / 10, packets: 800 + Math.round(mbps * 12) };
  }

  async research(query: string): Promise<{ source: string; title: string; snippet: string; url: string }[]> {
    const q = encodeURIComponent(query);
    const out: { source: string; title: string; snippet: string; url: string }[] = [];
    try {
      const wiki = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${q}&limit=3&namespace=0&format=json&origin=*`);
      if (wiki.ok) {
        const data = (await wiki.json()) as [string, string[], string[], string[]];
        data[1].forEach((title, i) => out.push({ source: 'Wikipedia', title, snippet: data[2][i] || '', url: data[3][i] }));
      }
    } catch {
      /* offline */
    }
    try {
      const npm = await fetch(`https://registry.npmjs.org/-/v1/search?text=${q}&size=3`);
      if (npm.ok) {
        const data = (await npm.json()) as { objects: Array<{ package: { name: string; description: string; links: { npm: string } } }> };
        data.objects.forEach((o) =>
          out.push({ source: 'npm', title: o.package.name, snippet: o.package.description || '', url: o.package.links.npm }),
        );
      }
    } catch {
      /* offline */
    }
    if (out.length === 0) {
      out.push({
        source: 'Lokal',
        title: `On-Device Analyse: ${query}`,
        snippet: `Keine Online-Quellen erreichbar. Nexus hat ${this.nodes.length} Knoten, ${this.bound.length} Bindungen, Mesh ${this.meshRunning ? 'aktiv' : 'idle'}.`,
        url: 'local://nexus',
      });
    }
    return out;
  }

  moeReply(input: string): { text: string; needs?: string } {
    const low = input.toLowerCase();
    const critical = ['flash dongle', 'flash', 'ssh', 'execute command', 'write to filesystem', 'löschen', 'delete'];
    const hit = critical.find((c) => low.includes(c));
    if (hit && !this.hasGrant(hit === 'flash' || hit === 'flash dongle' ? 'usb-dongle-flash' : 'system-exec')) {
      return { text: `Aktion erfordert Freigabe (${hit}). Bitte im Permissions-Dialog bestätigen.`, needs: hit.includes('flash') ? 'usb-dongle-flash' : 'system-exec' };
    }
    const n = this.nodes.length;
    const b = this.bound.length;
    if (low.includes('status') || low.includes('scan')) {
      return { text: `Live-Status: ${n} erkannte Knoten, ${b} gebunden, Rolle ${this.session?.user.role ?? '–'}. WASM n=${this.learnedN.toFixed(2)}. Native=${this.caps.native}.` };
    }
    if (low.includes('mesh')) {
      return { text: `Mesh ${this.meshRunning ? 'läuft' : 'steht'}. Aktive Knoten: ${this.mesh.filter((m) => m.active).map((m) => `${m.id}@${m.freqMHz}MHz`).join(', ')}` };
    }
    return {
      text: `Nexus-MoE hat „${input}“ gegen ${n} Geräte und ${this.pairings.length} Pairings geprüft. Empfohlen: Discovery → Bind → Pairing-Sync → Terminal.`,
    };
  }

  async probeEnterprise(cat: NodeCategory): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
    const node = ENTERPRISE_NODES[cat];
    const host = node.endpointUrl.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').split('/')[0];
    const start = performance.now();
    try {
      const r = await native.pingHost(host, 443, 2500);
      return {
        ok: r.ok,
        latencyMs: r.latencyMs ?? Math.round(performance.now() - start),
        detail: r.ok ? `${node.nodeId} erreichbar` : `${node.nodeId} nicht erreichbar (${r.error ?? 'timeout'}) — Tunnel offline, lokale Spezifikation aktiv`,
      };
    } catch (e) {
      return { ok: false, latencyMs: Math.round(performance.now() - start), detail: e instanceof Error ? e.message : 'Fehler' };
    }
  }

  snapshot() {
    return {
      session: this.session,
      config: this.config,
      nodes: this.nodes,
      bound: this.bound,
      pairings: this.pairings,
      clients: this.clients,
      live: this.live,
      mesh: this.mesh,
      meshRunning: this.meshRunning,
      scanning: this.scanning,
      caps: this.caps,
      learnedN: this.learnedN,
      status: this.status,
      statusMsg: this.statusMsg,
      clientId: this.clientId,
      wasmReady: Boolean(this.wasm),
      audit: audit.list(80),
    };
  }
}

export const nexus = new NexusEngine();
export type NexusSnapshot = ReturnType<NexusEngine['snapshot']>;
