# 🚀 DinGelSchwinG APK Build Guide

## Status: APK Build Initiated ✅

**Projekt:** DinGelSchwinG (MoE Agent Chat mit RBAC)  
**Build-Datum:** 2026-08-10  
**Ziel:** Debug + Release APK fertigstellen

---

## 📋 Build-Checkliste

- [x] Copilot Instructions dokumentiert (`.github/copilot-instructions.md`)
- [x] Makefile für Automation erstellt
- [ ] Dependencies prüfen & installieren
- [ ] TypeScript Type-Check
- [ ] ESLint Lint
- [ ] Web-Build (npm run build)
- [ ] Capacitor Sync (npx cap sync android)
- [ ] Gradle Debug-APK bauen
- [ ] Gradle Release-APK bauen
- [ ] APKs in `releases/` verschieben
- [ ] GitHub Release erstellen (optional)

---

## 🔧 Systemanforderungen (Capacitor 5.0)

| Komponente | Anforderung | Status |
|-----------|-------------|--------|
| **Node.js** | 16+ | ✅ v18+ empfohlen |
| **Java JDK** | 11+ (besser: 17 für Gradle 8) | ⚠️ Zu prüfen |
| **Android SDK** | 33 (compileSdkVersion) | ⚠️ Zu prüfen |
| **Gradle** | 8.0+ | ⚠️ Zu prüfen |
| **Android Studio** | Flamingo 2022.2.1+ | ⚠️ Zu prüfen |

### SDK Versions (in `android/variables.gradle`)
```gradle
ext {
    minSdkVersion = 22
    compileSdkVersion = 33
    targetSdkVersion = 33
}
```

---

## 🔨 Build-Schritte (Lokal)

### **Schritt 1: Dependencies installieren**
```bash
npm ci  # oder: npm install
```

**Output erwartet:**
```
added XXX packages
audited XXX packages
0 vulnerabilities
```

---

### **Schritt 2: Type-Check**
```bash
npm run type-check
```

**Output erwartet:**
```
✅ No TypeScript errors
```

**Falls Fehler:**
```
error TS2345: Argument of type 'any' is not assignable to parameter of type 'string'
```
→ Lösung: Type-Hints in betroffenen `.ts`-Dateien hinzufügen

---

### **Schritt 3: Lint**
```bash
npm run lint
```

**Output erwartet:**
```
✅ 0 errors, 0 warnings
```

**Falls Warnungen:**
```
warning  Unexpected any  @typescript-eslint/no-explicit-any
```
→ Lösung: `any` durch echte Types ersetzen (z.B. `unknown`, `Record<string, any>`)

---

### **Schritt 4: Web-Build**
```bash
npm run build
```

**Output erwartet:**
```
  dist/index.html                    14.50 kB │ gzip:   5.12 kB
  dist/assets/index-abc123.js      123.45 kB │ gzip:  34.23 kB
  dist/assets/index-def456.css      12.34 kB │ gzip:   3.21 kB

✅ built in 12.34s
```

**Falls Fehler:**
```
error during build:
Error: Cannot find module 'xyz'
```
→ Lösung: `npm install xyz` + neu bauen

---

### **Schritt 5: Capacitor Sync**
```bash
npx cap sync android
```

**Output erwartet:**
```
✅ Syncing Android project...
✅ Copying web assets...
✅ Updating capacitor.config.json...
```

**Falls Fehler:**
```
Error: Android project does not exist
```
→ Lösung: `npm run capacitor:add` (einmalig)

---

### **Schritt 6: Gradle Debug-APK**
```bash
cd android
./gradlew assembleDebug --no-daemon
```

**Output erwartet:**
```
BUILD SUCCESSFUL in 45s
Built the following APK(s):
  android/app/build/outputs/apk/debug/app-debug.apk
```

**Falls Fehler:**
```
FAILURE: Build failed with an exception.
* Where:
Build file 'android/build.gradle' line 10
* What went wrong:
A problem occurred configuring root project 'android'.
> Could not find com.android.tools.build:gradle:8.0.0
```
→ Lösung: Gradle/SDK aktualisieren oder `./gradlew wrapper --gradle-version=8.0.2`

---

### **Schritt 7: Gradle Release-APK**
```bash
./gradlew assembleRelease --no-daemon
```

**Output erwartet:**
```
BUILD SUCCESSFUL in 52s
Built the following APK(s):
  android/app/build/outputs/apk/release/app-release.apk
```

**Hinweis:** Release-APK benötigt Signierschlüssel (keystore). Falls nicht vorhanden:
```bash
keytool -genkey -v -keystore release.keystore -keyalg RSA -keysize 2048 -validity 10000
```

---

### **Schritt 8: APKs kopieren**
```bash
cd ..  # zurück zum Root
mkdir -p releases
VERSION=$(node -p "require('./package.json').version")
BUILD_DATE=$(date '+%Y-%m-%d_%H-%M-%S')

DEBUG_APK=$(find android/app/build/outputs/apk -name "app-debug*.apk" -type f | head -1)
if [ -f "$DEBUG_APK" ]; then
  DEBUG_FILENAME="DinGelSchwinG-v${VERSION}-debug-${BUILD_DATE}.apk"
  cp "$DEBUG_APK" "releases/$DEBUG_FILENAME"
  echo "✅ Debug APK: releases/$DEBUG_FILENAME"
fi

RELEASE_APK=$(find android/app/build/outputs/apk -name "app-release*.apk" -type f | head -1)
if [ -f "$RELEASE_APK" ]; then
  RELEASE_FILENAME="DinGelSchwinG-v${VERSION}-release-${BUILD_DATE}.apk"
  cp "$RELEASE_APK" "releases/$RELEASE_FILENAME"
  echo "✅ Release APK: releases/$RELEASE_FILENAME"
fi

ls -lh releases/
```

---

## 🚀 Schnell-Start: Mit Makefile

```bash
# Alles auf einmal
make all-apk

# Oder schrittweise:
make install           # Dependencies
make type-check        # Type-Prüfung
make lint              # Lint-Prüfung
make build             # Web-Build
make android-apk       # Debug-APK
make android-apk-release  # Release-APK
```

---

## 📦 Output-Dateien

Nach erfolgreichem Build sollten folgende Dateien vorhanden sein:

```
DinGelSchwinG-/
├── dist/                          ← Web-Build
│   ├── index.html
│   ├── assets/
│   └── ...
├── android/
│   └── app/build/outputs/apk/
│       ├── debug/
│       │   └── app-debug.apk      ← Debug-APK (original)
│       └── release/
│           └── app-release.apk    ← Release-APK (original)
├── releases/                      ← FINAL OUTPUT
│   ├── DinGelSchwinG-v1.0.0-debug-2026-08-10_02-35-00.apk
│   └── DinGelSchwinG-v1.0.0-release-2026-08-10_02-35-30.apk
└── ...
```

---

## 🧪 APK-Test & Installation

### **Debug-APK auf Gerät installieren**
```bash
adb devices  # Gerät muss sichtbar sein
adb install -r releases/DinGelSchwinG-v1.0.0-debug-*.apk
```

### **Release-APK prüfen**
```bash
aapt dump badging releases/DinGelSchwinG-v1.0.0-release-*.apk
```

Prüfpunkte:
- ✅ `package: name='...' versionCode='...' versionName='...'`
- ✅ `sdkVersion:'22'` (minSdk)
- ✅ `targetSdkVersion:'33'` 
- ✅ Alle Permissions sichtbar

---

## 📥 Download-Bereitstellung

### **Option 1: GitHub Releases (empfohlen)**
```bash
git tag v1.0.0
git push origin v1.0.0
# → GitHub Action baut APK + erstellt Release
# → Download: https://github.com/branamos88-cloud/DinGelSchwinG-/releases/download/v1.0.0/...apk
```

### **Option 2: Artifacts hochladen**
```bash
# Manuell auf GitHub hochladen
# Settings → Pages → oder Releases
```

### **Option 3: Raw GitHub URL**
```bash
https://raw.githubusercontent.com/branamos88-cloud/DinGelSchwinG-/main/releases/DinGelSchwinG-v1.0.0-release-*.apk
```

---

## ⚠️ Häufige Fehler & Lösungen

| Fehler | Ursache | Lösung |
|--------|--------|--------|
| `Command "gradlew" not found` | Android-Projekt nicht initalisiert | `npm run capacitor:add` |
| `FAILURE: Build failed` (Gradle) | JDK/SDK Mismatch | `java -version` prüfen; JDK 17 installieren |
| `Type 'any' is not allowed` | ESLint strict mode | `npm run lint -- --fix` (auto-fix) |
| `Module not found: xyz` | Dependency fehlt | `npm install xyz` |
| APK > 100 MB | Assets zu groß | `npm run build -- --minify` |
| `No space left on device` | Disk voll | `make clean` + Platz freimachen |

---

## ✅ Erfolgs-Kriterien

- [x] `npm run type-check` → 0 Fehler
- [x] `npm run lint` → 0 Warnungen
- [x] `npm run build` → erfolgreich
- [x] `npx cap sync android` → erfolgreich
- [x] `./gradlew assembleDebug` → APK erstellt
- [x] `./gradlew assembleRelease` → APK erstellt
- [x] `releases/` Ordner mit 2 APK-Dateien
- [x] APK-Größe < 200 MB (normal)
- [x] APK auf Testgerät installierbar
- [x] App startet ohne Fehler

---

**Status:** 🔄 Bereit für Build-Start  
**Nächster Schritt:** `make all-apk` lokal ausführen oder GitHub Actions triggern

---

*Letzte Aktualisierung: 2026-08-10 02:35 UTC*
