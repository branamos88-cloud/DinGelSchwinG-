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
}
