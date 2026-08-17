# DinGelSchwinG — NEXUS-BUILDER v2.0

**BLE-Mesh-Netzwerkzentrale mit echter Hardware-Anbindung, WASM-Abstandsberechnung, Sensor-Fusion, Diagnose-Werkzeugen und Rosetta-KI.**

Dieses Release ersetzt sämtliche Mock-/Demo-/Simulations-Anteile durch funktionsfähigen Code und liefert eine intuitiv bedienbare Oberfläche mit Seitenleisten-Navigation. Alle Aktions- und Funktionsketten sind durch eine automatisierte Test-Suite (73 Tests) abgesichert.

---

## 📱 Bereiche der App

| Bereich | Funktion (echt, nicht simuliert) |
|---|---|
| **Dashboard** | 3D-Raumdarstellung, Live-Gerätekarten aus echten BLE-Scans, Geräte-Sensoren (DeviceOrientation/DeviceMotion), WASM-Abstandsberechnung mit rekursivem Lernen (Umgebungsfaktor n), Details & gebundene Clients |
| **Kopplung** | QR-Scan (Kamera, `html5-qrcode`), BLE-Scan & Bindung (Web Bluetooth im Browser, natives Plugin in der APK), NFC (Web NFC, wo verfügbar), WiFi-Node-Prüfung über echte Gateway-Latenz, Master-QR-Code, manuelle Token-Eingabe |
| **Diagnose** | Echte Latenzmessung (HTTP-Roundtrip-Timing, min/avg/max über 4 Samples), echter Download-Speedtest (CDN speed.cloudflare.com, 10 MB), Durchsatz-Messung über WebSocket-Echo (bestätigte Bytes / Zeit) |
| **Mesh** | Steuert die echte Scan-Engine (Start/Stopp), zeigt alle Live-Knoten mit RSSI, WASM-Distanz, Frequenzband und Aktualität — ohne simulierte Driftwerte |
| **Replay** | Zeichnet die **echten** RSSI-Werte der sichtbaren Geräte auf, Punkte editierbar, Wiedergabe mit Playhead, Export/Import als JSON (`dingelschwinng.replay.v1`) |
| **Rosetta AI** | Chat & Routen-Analyse: mit konfiguriertem OpenAI-kompatiblem Backend (SSE-Streaming) online; sonst Offline-Analyse, die **echte Kennzahlen** aus den Live-Netzwerkdaten berechnet |
| **Einstellungen** | Vollständige Netzwerk-/BLE-/Mesh-Konfiguration mit Validierung und lokaler Persistenz (localStorage), Diagnose-Ziele, KI-Backend (Basis-URL, Key, Modell), Demo-Modus (Opt-in) |

## 🧱 Funktionaler Kern (ersetzt Mock-Code)

| Alt (Mock/Demo/Temp) | Neu (funktionsfähig) |
|---|---|
| `src/mocks/*` (4 Dateien, toter Code) | **gelöscht** |
| `PairingPanel`: BLE/NFC/WiFi = `setTimeout` + Zufall | `src/lib/ble/BleService.ts` (Web BLE + `@capacitor-community/bluetooth-le`) · Web NFC (`NDEFReader`) · Gateway-Latenzprüfung |
| `MeshControl`: „Background service simulation“ mit Zufallsdrift | `MeshView` — steuert die echte Scan-Engine, zeigt echte Knoten |
| `NetworkDiagnostics`: Blob-URL-Fake-Speedtest, Zufalls-iPerf | `src/lib/diagnostics/diagnosticsEngine.ts` — echtes Download-Timing, WebSocket-Echo-Durchsatz |
| `rosettaConverter`: „Simulierte Backend-Interaktion“ | `src/lib/rosetta/rosettaClient.ts` — echter HTTP/SSE-Client + deterministische Offline-Analyse der Live-Daten |
| `NetworkDashboard`: hartkodierte Demo-Geräte, doppelte Module | Store-getriebene Live-Daten, aufgeräumtes Layout |
| `NetworkSettings`: `onChange={() => {}}`, keine Persistenz | `src/state/settings.ts` — Validierung (Clamping) + localStorage-Persistenz, wirkt sofort auf alle Dienste |
| WASM: keine `.wasm`-Datei, `get_learned_n()` hartkodiert | **Echtes WASM** (`src/lib/wasm/bleDistance.wat` → `public/wasm/ble_distance.wasm`), `learned_n` als echter Modul-Zustand |
| `MoEChatInterface` (700 Z.) + `AdvancedResearchChat` (1101 Z.) — simulierte KI | **gelöscht**, ersetzt durch funktionale RosettaView |
| `ReplayEditor`: Zufallssignale | `src/lib/replay/replayEngine.ts` — Aufzeichnung echter Scan-Daten |

## 🧮 WASM-Modul

`wasm-ble/src/lib.rs` wurde als eigenständiges WebAssembly-Modul (WAT → wasm, ohne Laufzeit-Abhängigkeiten) umgesetzt und ist mathematisch identisch (517 Referenz-Checks, max. relativer Fehler 4,4·10⁻⁹):

- `calculate_distance(rssi, tx)` — Pfadverlustmodell, n = 2,0 (Freifeld)
- `calculate_distance_env(rssi, tx, n)` — einstellbarer Umgebungsfaktor
- `calc_exact_distance(...)` — kalibrierte Distanz über Referenzpunkt
- `batch_distances(...)` — Batch über den Modul-Speicher
- `learn_from_feedback(...)` / `get_learned_n()` — rekursives Lernen mit **echtem Modul-Zustand** (1,5–6,0 geklemmt)

Neukompilieren: `npm run wasm:build` (benötigt `wabt`, bereits als devDependency).

## ✅ Tests

```bash
npm test          # 73 Tests in 9 Suiten: WASM (echte Binärdatei), Loader,
                  # Diagnose-Engine, Rosetta-Offline-Analyse, Replay, Pairing-Protokoll,
                  # Settings-Validierung/-Persistenz, Store-Reducer, BLE-Service, Positionierung
npm run type-check
```

## 📦 APK bauen

Fertige APKs liegen im Repo unter [`apk-output/`](apk-output/):

| Datei | Typ | Hinweis |
|---|---|---|
| `DinGelSchwinG-release.apk` | Release, signiert (v1+v2+v3) | produktiv installierbar |
| `DinGelSchwinG-debug.apk` | Debug | für Entwicklung |

Selbst bauen (Android SDK 33 + JDK 17 erforderlich):

```bash
npm ci --legacy-peer-deps
npx vite build --sourcemap false
npx cap sync android
cd android && ./gradlew assembleDebug      # Debug-APK
cd android && ./gradlew assembleRelease    # signiert, wenn keystore.properties existiert
```

### Release-Signatur

- Keystore-Datei (`.p12`), Passwörter und Alias werden über `android/keystore.properties` (gitignored) oder die Umgebungsvariablen `DSG_KEYSTORE` (Base64), `DSG_KEYSTORE_PASS`, `DSG_KEY_ALIAS` bereitgestellt.
- Der Signatur-Schlüssel darf **nicht** ins öffentliche Repository — für GitHub Actions als Secrets hinterlegen (siehe Workflow).

## 🔄 GitHub Actions

[`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) baut bei jedem Push auf `main`:

1. `npm ci` → Tests (73) → Typecheck → Web-Build
2. `cap sync android` → `assembleDebug` (immer) und `assembleRelease` (signiert, wenn Secrets gesetzt)
3. APKs als Build-Artefakt; bei Tags `v*` als GitHub-Release-Anhang

Benötigte Secrets (optional, für signierte Release-APKs):
`DSG_KEYSTORE` (Base64 der `.p12`), `DSG_KEYSTORE_PASS`, `DSG_KEY_ALIAS`.

## 🛠️ Entwicklung

```bash
npm install --legacy-peer-deps   # Peer-Deps-Konflikt drei@10 (React 18) — bewusst so gepinnt
npm run dev                      # Dev-Server (http://localhost:5173)
```

Hinweis Web-Preview/Browser: Web Bluetooth erfordert Chrome/Edge + Gerät mit BLE. In der APK übernimmt das native Plugin (`@capacitor-community/bluetooth-le`). Ohne Hardware kann der **Demo-Modus** in den Einstellungen aktiviert werden — er ist klar als solcher gekennzeichnet.

## 🔐 Berechtigungen (Android)

`BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` / `BLUETOOTH_ADVERTISE` (BLE), `ACCESS_FINE_LOCATION` (≤ API 30), `CAMERA` (QR), `NFC`, `INTERNET`. minSdk 22, target/compileSdk 33.

---

**Stack:** TypeScript · React 18 · Vite 4 · Tailwind · Three.js (@react-three/fiber) · Capacitor 5 · WebAssembly (WAT) · Vitest
