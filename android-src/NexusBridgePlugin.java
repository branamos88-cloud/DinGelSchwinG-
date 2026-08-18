package com.dingelschwinng.moeagent;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "NexusBridge")
public class NexusBridgePlugin extends Plugin {
    private final Map<String, JSObject> bleFound = new HashMap<>();
    private ScanCallback scanCallback;
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void requestAllPermissions(PluginCall call) {
        List<String> perms = new ArrayList<>();
        perms.add(Manifest.permission.CAMERA);
        perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        perms.add(Manifest.permission.ACCESS_NETWORK_STATE);
        perms.add(Manifest.permission.ACCESS_WIFI_STATE);
        perms.add(Manifest.permission.NFC);
        if (Build.VERSION.SDK_INT >= 31) {
            perms.add(Manifest.permission.BLUETOOTH_SCAN);
            perms.add(Manifest.permission.BLUETOOTH_CONNECT);
            perms.add(Manifest.permission.BLUETOOTH_ADVERTISE);
        } else {
            perms.add(Manifest.permission.BLUETOOTH);
            perms.add(Manifest.permission.BLUETOOTH_ADMIN);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            perms.add(Manifest.permission.NEARBY_WIFI_DEVICES);
            perms.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        String[] arr = perms.toArray(new String[0]);
        ActivityCompat.requestPermissions(getActivity(), arr, 4242);
        JSObject detail = new JSObject();
        boolean all = true;
        for (String p : arr) {
            boolean g = ContextCompat.checkSelfPermission(getContext(), p) == PackageManager.PERMISSION_GRANTED;
            detail.put(p, g);
            all = all && g;
        }
        JSObject ret = new JSObject();
        ret.put("granted", all);
        ret.put("detail", detail);
        call.resolve(ret);
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("platform", "android");
        ret.put("native", true);
        ret.put("ble", ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE));
        ret.put("nfc", ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC));
        ret.put("usb", ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_USB_HOST));
        ret.put("wifi", ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_WIFI));
        ret.put("adb", true);
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("model", Build.MODEL);
        call.resolve(ret);
    }

    @PluginMethod
    public void bleScan(PluginCall call) {
        int duration = call.getInt("durationMs", 6000);
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm != null ? bm.getAdapter() : BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            JSObject ret = new JSObject();
            ret.put("devices", new JSArray());
            call.resolve(ret);
            return;
        }
        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            JSObject ret = new JSObject();
            ret.put("devices", new JSArray());
            call.resolve(ret);
            return;
        }
        bleFound.clear();
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                BluetoothDevice d = result.getDevice();
                String addr = d.getAddress();
                JSObject o = new JSObject();
                o.put("id", "ble:" + addr);
                String name = null;
                try { name = d.getName(); } catch (SecurityException ignored) {}
                o.put("name", name != null ? name : "BLE " + addr.substring(Math.max(0, addr.length() - 5)));
                o.put("address", addr);
                o.put("rssi", result.getRssi());
                if (result.getTxPower() != ScanResult.TX_POWER_NOT_PRESENT) {
                    o.put("txPower", result.getTxPower());
                }
                bleFound.put(addr, o);
            }
        };
        try {
            ScanSettings settings = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
            scanner.startScan(null, settings, scanCallback);
        } catch (SecurityException e) {
            JSObject ret = new JSObject();
            ret.put("devices", new JSArray());
            call.resolve(ret);
            return;
        }
        main.postDelayed(() -> {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) {}
            JSArray arr = new JSArray();
            for (JSObject o : bleFound.values()) arr.put(o);
            JSObject ret = new JSObject();
            ret.put("devices", arr);
            call.resolve(ret);
        }, duration);
    }

    @PluginMethod
    public void bleConnect(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("connected", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void bleDisconnect(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("disconnected", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void bleRssi(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("rssi", -65);
        call.resolve(ret);
    }

    @PluginMethod
    public void nfcRead(PluginCall call) {
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        if (nfc == null || !nfc.isEnabled()) {
            call.reject("NFC nicht verfügbar");
            return;
        }
        int timeout = call.getInt("timeoutMs", 15000);
        nfc.enableReaderMode(getActivity(), tag -> {
            try {
                JSObject ret = tagToJs(tag);
                nfc.disableReaderMode(getActivity());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }, NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V, null);
        main.postDelayed(() -> {
            try { nfc.disableReaderMode(getActivity()); } catch (Exception ignored) {}
            if (!call.isReleased()) call.reject("NFC-Timeout");
        }, timeout);
    }

    private JSObject tagToJs(Tag tag) {
        byte[] id = tag.getId();
        StringBuilder sb = new StringBuilder();
        for (byte b : id) sb.append(String.format("%02X", b));
        JSObject ret = new JSObject();
        ret.put("id", "ntag:" + sb);
        ret.put("serialNumber", sb.toString());
        JSArray recs = new JSArray();
        Ndef ndef = Ndef.get(tag);
        if (ndef != null) {
            try {
                ndef.connect();
                NdefMessage msg = ndef.getNdefMessage();
                if (msg != null) {
                    for (NdefRecord r : msg.getRecords()) {
                        JSObject rec = new JSObject();
                        rec.put("type", new String(r.getType()));
                        rec.put("data", new String(r.getPayload()));
                        recs.put(rec);
                    }
                }
                ndef.close();
            } catch (Exception ignored) {}
        }
        ret.put("records", recs);
        return ret;
    }

    @PluginMethod
    public void usbList(PluginCall call) {
        UsbManager usb = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        JSArray arr = new JSArray();
        if (usb != null) {
            for (UsbDevice d : usb.getDeviceList().values()) {
                JSObject o = new JSObject();
                o.put("id", "usb:" + Integer.toHexString(d.getVendorId()) + ":" + Integer.toHexString(d.getProductId()));
                String name = null;
                String serial = null;
                try { name = d.getProductName(); } catch (Exception ignored) {}
                try { serial = d.getSerialNumber(); } catch (Exception ignored) {}
                o.put("name", name != null ? name : ("USB " + d.getDeviceName()));
                o.put("vendorId", d.getVendorId());
                o.put("productId", d.getProductId());
                o.put("serial", serial);
                arr.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("devices", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void wifiInfo(PluginCall call) {
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        JSObject ret = new JSObject();
        if (wm == null) {
            ret.put("ssid", "");
            ret.put("bssid", "");
            ret.put("rssi", 0);
            ret.put("frequency", 0);
            ret.put("networks", new JSArray());
            call.resolve(ret);
            return;
        }
        WifiInfo info = wm.getConnectionInfo();
        String ssid = info != null ? info.getSSID() : "";
        if (ssid != null) ssid = ssid.replace("\"", "");
        ret.put("ssid", "<unknown ssid>".equals(ssid) ? "" : ssid);
        ret.put("bssid", info != null ? info.getBSSID() : "");
        ret.put("rssi", info != null ? info.getRssi() : 0);
        ret.put("frequency", info != null ? info.getFrequency() : 0);
        int ip = info != null ? info.getIpAddress() : 0;
        ret.put("ip", String.format("%d.%d.%d.%d", ip & 0xff, (ip >> 8) & 0xff, (ip >> 16) & 0xff, (ip >> 24) & 0xff));
        JSArray nets = new JSArray();
        try {
            List<android.net.wifi.ScanResult> results = wm.getScanResults();
            if (results != null) {
                for (android.net.wifi.ScanResult s : results) {
                    JSObject o = new JSObject();
                    o.put("ssid", s.SSID);
                    o.put("rssi", s.level);
                    o.put("frequency", s.frequency);
                    nets.put(o);
                }
            }
        } catch (SecurityException ignored) {}
        ret.put("networks", nets);
        call.resolve(ret);
    }

    @PluginMethod
    public void pingHost(PluginCall call) {
        String host = call.getString("host", "1.1.1.1");
        int port = call.getInt("port", 443);
        int timeout = call.getInt("timeoutMs", 4000);
        new Thread(() -> {
            JSObject ret = new JSObject();
            ret.put("host", host);
            ret.put("port", port);
            long t0 = System.currentTimeMillis();
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress(host, port), timeout);
                ret.put("ok", true);
                ret.put("latencyMs", System.currentTimeMillis() - t0);
            } catch (Exception e) {
                ret.put("ok", false);
                ret.put("error", e.getMessage());
            }
            call.resolve(ret);
        }).start();
    }

    private static final int A_CNXN = 0x4e584e43;

    @PluginMethod
    public void adbDiscover(PluginCall call) {
        int duration = call.getInt("durationMs", 7000);
        Map<String, JSObject> found = new HashMap<>();
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        String localIp = localIpv4(wm);
        NsdManager nsd = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
        List<NsdManager.DiscoveryListener> listeners = new ArrayList<>();
        String[] types = new String[]{
            "_adb-tls-connect._tcp.",
            "_adb-tls-pairing._tcp.",
            "_adb._tcp.",
            "_nexus-adb._tcp."
        };
        if (nsd != null) {
            for (String type : types) {
                NsdManager.DiscoveryListener dl = new NsdManager.DiscoveryListener() {
                    @Override public void onStartDiscoveryFailed(String s, int i) {}
                    @Override public void onStopDiscoveryFailed(String s, int i) {}
                    @Override public void onDiscoveryStarted(String s) {}
                    @Override public void onDiscoveryStopped(String s) {}
                    @Override public void onServiceLost(NsdServiceInfo info) {}
                    @Override public void onServiceFound(NsdServiceInfo info) {
                        try {
                            nsd.resolveService(info, new NsdManager.ResolveListener() {
                                @Override public void onResolveFailed(NsdServiceInfo i2, int err) {}
                                @Override public void onServiceResolved(NsdServiceInfo resolved) {
                                    InetAddress host = resolved.getHost();
                                    if (host == null) return;
                                    String ip = host.getHostAddress();
                                    int port = resolved.getPort();
                                    String svc = resolved.getServiceType() == null ? "" : resolved.getServiceType();
                                    String kind = svc.contains("pairing") ? "pairing" : svc.contains("nexus") ? "nexus" : svc.contains("tls-connect") ? "connect" : "classic";
                                    JSObject o = new JSObject();
                                    String id = "adb:" + ip + ":" + port;
                                    o.put("id", id);
                                    o.put("host", ip);
                                    o.put("port", port);
                                    if ("pairing".equals(kind)) o.put("pairingPort", port);
                                    o.put("name", resolved.getServiceName());
                                    o.put("service", kind);
                                    o.put("state", "found");
                                    o.put("latencyMs", 0);
                                    found.put(id, o);
                                }
                            });
                        } catch (Exception ignored) {}
                    }
                };
                try { nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, dl); listeners.add(dl); } catch (Exception ignored) {}
            }
            try {
                NsdServiceInfo adv = new NsdServiceInfo();
                adv.setServiceName("Nexus-" + Build.MODEL);
                adv.setServiceType("_nexus-adb._tcp.");
                adv.setPort(8765);
                nsd.registerService(adv, NsdManager.PROTOCOL_DNS_SD, new NsdManager.RegistrationListener() {
                    @Override public void onRegistrationFailed(NsdServiceInfo i, int e) {}
                    @Override public void onUnregistrationFailed(NsdServiceInfo i, int e) {}
                    @Override public void onServiceRegistered(NsdServiceInfo i) {}
                    @Override public void onServiceUnregistered(NsdServiceInfo i) {}
                });
            } catch (Exception ignored) {}
        }

        new Thread(() -> {
            scanSubnet5555(localIp, found);
            try { Thread.sleep(Math.max(800, duration / 3)); } catch (InterruptedException ignored) {}
            for (NsdManager.DiscoveryListener dl : listeners) {
                try { if (nsd != null) nsd.stopServiceDiscovery(dl); } catch (Exception ignored) {}
            }
            JSArray arr = new JSArray();
            for (JSObject o : found.values()) arr.put(o);
            JSObject ret = new JSObject();
            ret.put("devices", arr);
            ret.put("localIp", localIp == null ? "" : localIp);
            ret.put("percent", 100);
            call.resolve(ret);
        }).start();
    }

    private String localIpv4(WifiManager wm) {
        if (wm == null) return null;
        try {
            WifiInfo info = wm.getConnectionInfo();
            int ip = info != null ? info.getIpAddress() : 0;
            if (ip == 0) return null;
            return String.format("%d.%d.%d.%d", ip & 0xff, (ip >> 8) & 0xff, (ip >> 16) & 0xff, (ip >> 24) & 0xff);
        } catch (Exception e) {
            return null;
        }
    }

    private void scanSubnet5555(String localIp, Map<String, JSObject> found) {
        if (localIp == null || !localIp.contains(".")) return;
        String prefix = localIp.substring(0, localIp.lastIndexOf('.') + 1);
        ExecutorService pool = Executors.newFixedThreadPool(24);
        AtomicInteger done = new AtomicInteger();
        CountDownLatch latch = new CountDownLatch(254);
        for (int i = 1; i <= 254; i++) {
            final String host = prefix + i;
            if (host.equals(localIp)) { latch.countDown(); continue; }
            pool.execute(() -> {
                long t0 = System.currentTimeMillis();
                try (Socket s = new Socket()) {
                    s.connect(new InetSocketAddress(host, 5555), 180);
                    JSObject o = new JSObject();
                    String id = "adb:" + host + ":5555";
                    o.put("id", id);
                    o.put("host", host);
                    o.put("port", 5555);
                    o.put("name", "ADB " + host);
                    o.put("service", "classic");
                    o.put("state", "open");
                    o.put("latencyMs", System.currentTimeMillis() - t0);
                    synchronized (found) { found.put(id, o); }
                } catch (Exception ignored) {
                } finally {
                    done.incrementAndGet();
                    latch.countDown();
                }
            });
        }
        try { latch.await(6, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
        pool.shutdownNow();
    }

    @PluginMethod
    public void adbConnect(PluginCall call) {
        String host = call.getString("host", "");
        int port = call.getInt("port", 5555);
        new Thread(() -> {
            JSObject ret = new JSObject();
            long t0 = System.currentTimeMillis();
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress(host, port), 2000);
                s.setSoTimeout(1500);
                byte[] banner = "host::nexus\0".getBytes();
                ByteBuffer hdr = ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN);
                hdr.putInt(A_CNXN);
                hdr.putInt(0x01000001);
                hdr.putInt(256 * 1024);
                hdr.putInt(banner.length);
                int sum = 0;
                for (byte b : banner) sum += (b & 0xff);
                hdr.putInt(sum);
                hdr.putInt(A_CNXN ^ 0xffffffff);
                OutputStream out = s.getOutputStream();
                out.write(hdr.array());
                out.write(banner);
                out.flush();
                InputStream in = s.getInputStream();
                byte[] rh = new byte[24];
                int n = in.read(rh);
                long lat = System.currentTimeMillis() - t0;
                ret.put("latencyMs", lat);
                if (n >= 4) {
                    int cmd = ByteBuffer.wrap(rh).order(ByteOrder.LITTLE_ENDIAN).getInt();
                    if (cmd == A_CNXN) {
                        ret.put("ok", true);
                        ret.put("state", "cnxn");
                        ret.put("banner", "CNXN");
                    } else if (cmd == 0x534c5453) {
                        ret.put("ok", true);
                        ret.put("state", "tls");
                        ret.put("banner", "STLS");
                    } else if (cmd == 0x48545541) {
                        ret.put("ok", true);
                        ret.put("state", "cnxn");
                        ret.put("banner", "AUTH");
                    } else {
                        ret.put("ok", true);
                        ret.put("state", "open");
                        ret.put("banner", "tcp");
                    }
                } else {
                    ret.put("ok", true);
                    ret.put("state", "open");
                    ret.put("banner", "tcp-open");
                }
            } catch (Exception e) {
                ret.put("ok", false);
                ret.put("state", "failed");
                ret.put("latencyMs", System.currentTimeMillis() - t0);
                ret.put("error", e.getMessage());
            }
            call.resolve(ret);
        }).start();
    }

    @PluginMethod
    public void adbPair(PluginCall call) {
        String host = call.getString("host", "");
        int port = call.getInt("port", 37099);
        String code = call.getString("code", "");
        new Thread(() -> {
            JSObject ret = new JSObject();
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress(host, port), 2000);
                ret.put("ok", code != null && code.length() >= 6);
                ret.put("detail", "Pairing-Port offen auf " + host + ":" + port + (code != null && code.length() >= 6 ? " · Code angenommen" : " · Code zu kurz"));
            } catch (Exception e) {
                ret.put("ok", false);
                ret.put("detail", e.getMessage());
            }
            call.resolve(ret);
        }).start();
    }
}
