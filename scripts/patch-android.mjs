import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('android');
if (!fs.existsSync(root)) {
  console.error('android/ missing');
  process.exit(1);
}

function write(p, c) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
  console.log('wrote', p);
}

const varsPath = path.join(root, 'variables.gradle');
if (fs.existsSync(varsPath)) {
  let v = fs.readFileSync(varsPath, 'utf8');
  v = v.replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 30');
  v = v.replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 34');
  v = v.replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 34');
  fs.writeFileSync(varsPath, v);
  console.log('patched variables.gradle');
}

const manifestPath = path.join(root, 'app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let m = fs.readFileSync(manifestPath, 'utf8');
  const perms = `
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
    <uses-feature android:name="android.hardware.nfc" android:required="false" />
    <uses-feature android:name="android.hardware.usb.host" android:required="false" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.wifi" android:required="false" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.NFC" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.HIGH_SAMPLING_RATE_SENSORS" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
    <uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
`;
  if (!m.includes('BLUETOOTH_SCAN')) {
    m = m.replace('<manifest', '<manifest xmlns:tools="http://schemas.android.com/tools"');
    m = m.replace(/<application/, perms + '\n    <application');
    m = m.replace('<application', '<application android:hardwareAccelerated="true" android:usesCleartextTraffic="true" android:requestLegacyExternalStorage="true"');
  }
  fs.writeFileSync(manifestPath, m);
  console.log('patched AndroidManifest.xml');
}

const javaDir = path.join(root, 'app/src/main/java/com/dingelschwinng/moeagent');
fs.mkdirSync(javaDir, { recursive: true });
const pluginSrc = fs.readFileSync(path.resolve('android-src/NexusBridgePlugin.java'), 'utf8');
write(path.join(javaDir, 'NexusBridgePlugin.java'), pluginSrc);

const mainCandidates = [
  path.join(javaDir, 'MainActivity.java'),
  path.join(root, 'app/src/main/java/com/dingelschwinng/moeagent/MainActivity.java'),
];
// Capacitor 6 default package may be com.dingelschwinng.moeagent
function patchMain(file) {
  if (!fs.existsSync(file)) return false;
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('NexusBridgePlugin')) {
    if (src.includes('registerPlugin')) {
      src = src.replace(/super\.onCreate\([^)]*\);/, (mm) => `${mm}\n        registerPlugin(NexusBridgePlugin.class);`);
    } else if (src.includes('onCreate')) {
      src = src.replace(/super\.onCreate\([^)]*\);/, (mm) => `${mm}\n        registerPlugin(NexusBridgePlugin.class);`);
    }
    if (!src.includes('import com.dingelschwinng.moeagent.NexusBridgePlugin') && src.includes('package ')) {
      src = src.replace(/package .+;/, (mm) => `${mm}\n\nimport com.dingelschwinng.moeagent.NexusBridgePlugin;`);
    }
    fs.writeFileSync(file, src);
    console.log('patched', file);
  }
  return true;
}

write(
  path.join(javaDir, 'MainActivity.java'),
  `package com.dingelschwinng.moeagent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NexusBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`,
);

const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'MainActivity.java' || e.name === 'MainActivity.kt') patchMain(p);
  }
};
walk(path.join(root, 'app/src/main/java'));

console.log('Android 11–14 patch complete');
