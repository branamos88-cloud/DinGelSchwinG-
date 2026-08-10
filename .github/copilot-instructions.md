# 🤖 DinGelSchwinG — Copilot Agent Instructions

## Projekt-Kontext

**Projekt:** DinGelSchwinG (MoE Agent Chat mit RBAC & Sicherheits-Guards)  
**Stack:** TypeScript/React (Vite) + Capacitor Android + Python Backend  
**Ziel:** Sichere Mobile-App mit Terminal-Zugriff, Device-Discovery & Multi-Client-Management  
**Sprache:** Deutsch (DE) + English (EN)

---

## 🎯 Kern-Anforderungen

### 1. **Mobile APK-Build**
- **Buildtool:** Capacitor + Gradle (Android)
- **Frontend:** TypeScript/React (Vite) → `npm run build`
- **Sync:** `npx cap sync android` → Änderungen in Android-Projekt übernehmen
- **APK:** `cd android && ./gradlew assembleDebug|assembleRelease`
- **Output:** `android/app/build/outputs/apk/{debug|release}/app-*.apk`

### 2. **TypeScript + React Best Practices**
- ✅ Alle `.tsx`-Dateien mit vollständigen Type-Hints (keine `any`)
- ✅ Hook-Rules beachten (`useEffect`, `useState`, `useContext`)
- ✅ Error-Handling: `try/catch` + einheitliche `AppError`-Hierarchie
- ✅ UI-Components: funktional, memoized wo sinnvoll
- ✅ Linting: `npm run lint` muss 0 Warnungen haben

### 3. **Sicherheit & RBAC**
- ✅ Alle API-Calls: JWT-Token im Header (`Authorization: Bearer <token>`)
- ✅ WebSocket-Verbindungen: Token als Query-Parameter (`?token=<jwt>`)
- ✅ Role-based Access Control:
  - `guest (L0)` — nur Diagnose
  - `operator (L1)` — Hardware-Terminal
  - `service (L2)` — Service-Terminal + USB-Dongle-Lesen
  - `developer (L3)` — SSH + Dongle-Schreiben + BLE
  - `expert (L4)` — KI-Feintuning
  - `emergency (L5)` — Notfall-Override
- ✅ Serverseitige Guards: **Single Source of Truth** (nimm nicht an, Client-Checks reichen)

### 4. **Error Handling & Resilienz**
- ✅ Network-Fehler: exponential backoff (500 ms × 2ⁿ, max 15 s, max 5 Versuche)
- ✅ Circuit Breaker: 3 Fehler → OPEN (10 s), HALF_OPEN, Erfolg → CLOSED
- ✅ Idle-Timeout: 10 min (Session wird serverseitig geschlossen)
- ✅ Absolutes Maximum: 60 min
- ✅ User-Meldungen: niemals Interna (stack trace, IP, PW) → `toUserMessage(error)`

### 5. **Testing & Validierung**
- ✅ Unit-Tests: `npm run test` (falls vorhanden)
- ✅ Type-Check: `npm run type-check` vor Commit
- ✅ Lint: `npm run lint` vor Commit
- ✅ Funktionale Test-Suite: `python3 tests/suite.py` (Backend)
- ✅ Stress-Tests: `python3 tests/stress.py` (unter Last)

---

## 📋 Agent-Arbeitsanweisungen

### **Wenn du Code schreibst:**

1. **Bevor du Änderungen machst:**
   - Frage: _Welche Rolle benötigt diese Aktion?_
   - Frage: _Ist ein Server-seitiger RBAC-Check nötig?_
   - Frage: _Welche Error-Cases sind möglich?_

2. **Nach Änderungen:**
   - Führe `npm run type-check` aus
   - Führe `npm run lint` aus
   - Prüfe: Error-Handling vollständig?
   - Prüfe: RBAC-Guards gesetzt?

3. **Wenn du Dependencies installierst:**
   - Verwende `npm install <package>` (kein yarn/pnpm)
   - Commit `package.json` + `package-lock.json`

4. **Wenn du APKs baust:**
   - Stelle sicher: `npm run build` erfolgreich (0 Fehler)
   - Stelle sicher: `npx cap sync android` erfolgreich
   - Stelle sicher: Gradle-Build erfolgreich (`./gradlew assembleDebug` in `android/`)
   - Output-Dateien: `android/app/build/outputs/apk/{debug|release}/app-*.apk`

5. **Wenn du Features hinzufügst:**
   - Backend-API zuerst (`api.py` + Datenmodell)
   - Dann Frontend-Hook (`hooks/useXyz.ts`)
   - Dann React-Component (`components/Xyz.tsx`)
   - Dann RBAC-Guards (`requireAction`, `requireRole`)
   - Dann Tests (mit `chain.py` verifizieren)

---

## 🔐 RBAC-Checkliste

| Aktion | Min. Rolle | Backend-Guard | Client-UI | Audit-Log |
|--------|-----------|---------------|-----------|-----------|
| Diagnose (GET_STATUS) | `guest` | ✅ `requireRole("guest")` | ✅ sichtbar für alle | ✅ `audit.log()` |
| Hardware-Terminal | `operator` | ✅ `requireRole("operator")` | ✅ versteckt für guest | ✅ `audit.log()` |
| USB-Dongle-Flash | `developer` | ✅ `requireAction("dongle.flash")` | ✅ versteckt für service | ✅ `audit.log()` |
| Netzwerk-SSH | `developer` | ✅ `requireAction("network.ssh")` | ✅ versteckt für service | ✅ `audit.log()` |
| KI-Feintuning | `expert` | ✅ `requireRole("expert")` | ✅ nur für expert | ✅ `audit.log()` |
| Notfall-Override | `emergency` | ✅ `requireRole("emergency")` | ✅ nur für emergency | ✅ `audit.log()` |

---

## 🛠️ Kommando-Referenz

```bash
# Entwicklung
npm run dev              # Frontend auf :5173 (mit Vite-Proxy zu Flask :5000)
npm run type-check       # TypeScript-Fehler finden
npm run lint             # ESLint (0 Warnungen erforderlich)
npm run build            # Production-Build
npm run preview          # Bauten-Output lokal anzeigen

# Android-Entwicklung
npm run capacitor:add    # Android-Platform hinzufügen (einmalig)
npm run capacitor:sync   # Änderungen in Android-Projekt synchen
npm run android:build    # Android Studio öffnen (interaktiv)
npm run android:apk      # Debug-APK bauen → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:apk:release  # Release-APK bauen (signiert mit keystore)
npm run android:install  # Debug-APK auf Gerät installieren

# Scripte
./build-apk.sh           # All-in-One APK-Build (optional, nicht für CI erforderlich)

# Backend (Python)
python app.py            # Auth + REST auf :5000
python pty_bridge.py     # Terminal-Bridge auf :8765
python scanner_service.py  # Discovery auf :8766
python status_board.py    # Live-Status auf :8767

# Tests
python3 tests/suite.py       # funktional (16 Checks)
python3 tests/stress.py      # unter Last
python3 tests/chain.py       # Anbindung (53 Checks)
```

---

## 🚀 APK-Release-Workflow

### Automatisiert (GitHub Actions)
1. **Trigger:** Tag erstellen (`git tag v1.0.0`)
2. **Workflow:** `.github/workflows/build-apk.yml` läuft
3. **Bau:** `npm run build` + `npx cap sync android` + `./gradlew assembleDebug/Release`
4. **Artifact:** APK wird als **GitHub Release** hochgeladen
5. **Download:** `/releases/download/v1.0.0/DinGelSchwinG-v1.0.0-release.apk`

### Manuell (lokal)
```bash
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleRelease  # oder assembleDebug
# Output: android/app/build/outputs/apk/release/app-release-*.apk
```

---

## 📊 Datei-Struktur

```
DinGelSchwinG-/
├── .github/
│   ├── copilot-instructions.md    ← Du bist hier
│   └── workflows/
│       └── build-apk.yml          ← CI/CD für APK-Bau
├── src/
│   ├── App.tsx                    ← Root-Component
│   ├── components/
│   │   ├── AccessConsole.tsx      ← Terminal UI
│   │   ├── NetworkPanel.tsx       ← Device-Discovery
│   │   ├── StatusBoard.tsx        ← Live-Clients
│   │   ├── PairingPanel.tsx       ← Multi-Device-Pairing
│   │   ├── OverviewPanel.tsx      ← Control-Room
│   │   └── NfcReader.tsx          ← NFC/NTag
│   ├── hooks/
│   │   ├── useTerminal.ts         ← Terminal-WS-Client
│   │   ├── useDiscovery.ts        ← Discovery-WS-Client
│   │   ├── useStatusBoard.ts      ← Status-WS-Client
│   │   └── useAuth.ts             ← Auth + JWT
│   ├── services/
│   │   ├── api.ts                 ← REST-Calls
│   │   ├── errors.ts              ← Error-Hierarchie
│   │   ├── ws_terminal_client.ts  ← WS-Terminal
│   │   ├── ws_discovery_client.ts ← WS-Discovery
│   │   └── ws_status_client.ts    ← WS-Status
│   └── types/
│       └── index.ts               ← TypeScript-Interfaces
├── server/
│   ├── app.py                     ← Flask Auth
│   ├── api.py                     ← REST-Endpunkte
│   ├── rbac.py                    ← RBAC-Modell
│   ├── device_manager.py          ← Geräte-CRUD
│   ├── pty_bridge.py              ← Terminal-Bridge
│   ├── scanner_service.py         ← Discovery
│   ├── status_board.py            ← Live-Clients
│   ├── audit_log.py               ← Audit-Trail
│   ├── rate_limiter.py            ← Brute-Force-Schutz
│   ├── models/                    ← DB-Modelle
│   └── tests/
│       ├── suite.py               ← Funktionale Tests
│       ├── stress.py              ← Last-Tests
│       └── chain.py               ← Anbindung-Tests
├── android/
│   ├── app/
│   │   ├── build.gradle           ← Gradle-Config
│   │   ├── src/
│   │   │   └── main/
│   │   │       ├── java/
│   │   │       │   └── io/ionic/starter/MainActivity.kt
│   │   │       └── AndroidManifest.xml
│   │   └── build/
│   │       └── outputs/apk/
│   │           ├── debug/app-debug.apk      ← Debug-APK (hier suchen!)
│   │           └── release/app-release.apk  ← Release-APK (signiert)
│   ├── gradle.properties
│   └── settings.gradle
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── .eslintrc.cjs
├── docker-compose.yml
├── Dockerfile
├── Makefile
├── build-apk.sh                   ← Bash-Skript (optional)
├── README.md
└── LICENSE
```

---

## ⚠️ Häufige Fehler vermeiden

| Fehler | Ursache | Lösung |
|--------|--------|--------|
| `Type 'any' is not allowed` | Fehlende Type-Hints | `npm run lint` → alle `any` durch korrekte Types ersetzen |
| `Token missing` in WS | Query-Parameter vergessen | WebSocket: `ws://...?token=<jwt>` (nicht Header!) |
| `RBAC_DENIED` (erwartet operator, erhielt guest) | Guard vergessen | Prüfe `requireRole()` / `requireAction()` im Backend |
| APK-Build schlägt fehl | Capacitor nicht synced | `npx cap sync android` vor `./gradlew` |
| `ENOENT: no such file or directory android` | Android-Platform nicht vorhanden | `npm run capacitor:add` |
| Endless Reconnect-Loop | WS-URL falsch | Prüfe `VITE_API_BASE` im `.env` / Vite-Proxy |
| Gradle-Build schlägt fehl (JDK/SDK) | Umgebung nicht konfiguriert | `JAVA_HOME` + `ANDROID_SDK_ROOT` setzen; `./gradlew --version` prüfen |

---

## 🎓 Tipps für Agent-Steuerung

**Präzise Prompts für Copilot:**

```
"Schreibe einen React-Hook `useDeviceList` (TypeScript), der RBAC-Geräte-CRUD handhabt.
 - GET /api/devices (Lesen)
 - POST /api/devices (Binden, nur developer+)
 - DELETE /api/devices/:id (Löschen, nur developer+)
 - Error-Handling: AppError-Hierarchie
 - Loading/Error-States
 Verwende useAuth() zum Token abrufen."
```

**Statt:**
```
"Schreib mir einen Hook für Geräte."
```

---

## 📚 Literatur & Referenzen

- **Capacitor:** https://capacitorjs.com/docs/android
- **React Hooks:** https://react.dev/reference/react/hooks
- **TypeScript:** https://www.typescriptlang.org/docs/
- **Flask:** https://flask.palletsprojects.com/
- **WebSockets (Python):** https://websockets.readthedocs.io/
- **JWT:** https://jwt.io/ / PyJWT docs
- **RBAC:** https://en.wikipedia.org/wiki/Role-based_access_control

---

**Ziel:** APK fertig + zum Download bereit ✅  
**Status:** Agent-Ready (befolge diese Instructions)  
**Version:** 1.0 | **Last Updated:** 2026-08-10
