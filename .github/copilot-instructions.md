# 🤖 DinGelSchwinG — Copilot Agent Instructions

**Projekt:** DinGelSchwinG NEXUS-BUILDER (BLE-Mesh-Netzwerkzentrale)
**Stack:** TypeScript · React 18 · Vite 4 · Tailwind · Capacitor 5 · WebAssembly (WAT) · Vitest
**Sprache:** Deutsch (DE) für UI-Texte, Englisch für Code-Kommentare

---

## 🎯 Grundregeln

1. **Kein Mock-/Demo-/Simulations-Code.** Jede Funktion arbeitet mit echten Daten
   (echte BLE-Scans via `src/lib/ble/BleService.ts`, echte Netzwerk-Messungen via
   `src/lib/diagnostics/diagnosticsEngine.ts`, echte KI-Aufrufe bzw. deterministische
   Offline-Analyse via `src/lib/rosetta/rosettaClient.ts`). Einzige Ausnahme:
   der Opt-in-Demo-Modus (Einstellungen → `demoMode`), der sichtbar als „Demo“ markiert ist.
2. **Zentraler Zustand:** Alle Views lesen/schreiben ausschließlich über
   `src/state/store.tsx` (Reducer + Context). Keine verstreuten lokalen Kopien von Geräte-/Netzwerkdaten.
3. **Einstellungen:** Jede neue Konfiguration gehört in `src/state/types.ts` (`AppSettings`)
   und wird in `src/state/settings.ts` validiert (Clamping) und persistiert (localStorage).
4. **WASM:** Abstands-/Pfadverlust-Rechnungen laufen über `src/lib/bleWasm.ts`.
   Änderungen an der Mathematik in `src/lib/wasm/bleDistance.wat` → `npm run wasm:build`
   und `tests/wasm.test.ts` erweitern (Referenz-Implementierung in JS im Test).
5. **Fehlerbehandlung:** try/catch überall an IO-Grenzen; Fehlermeldungen für den User
   auf Deutsch, ohne interne Details (siehe `errToMessage` in der Diagnose-Engine).
6. **Typen:** `strict` TypeScript, keine `any` (Ausnahmen begründen).

## ✅ Definition of Done (pro Änderung)

```bash
npx tsc --noEmit          # 0 Fehler
npx vitest run            # alle Tests grün
NODE_OPTIONS=--max-old-space-size=1024 npx vite build --sourcemap false   # Build ok
```

## 📱 APK-Build

```bash
npm ci --legacy-peer-deps
npx vite build --sourcemap false
npx cap sync android
cd android && ./gradlew assembleDebug --no-daemon
# Release (signiert): keystore.properties in android/ anlegen (siehe README)
cd android && ./gradlew assembleRelease --no-daemon
```

- JDK 17 + Android SDK 33 (platform-tools, platforms;android-33, build-tools;33.0.2)
- Sandbox mit wenig RAM: Gradle-Speicher bereits in `android/gradle.properties` begrenzt.
- BLE in der APK: natives Plugin `@capacitor-community/bluetooth-le` (nicht Web BLE).
- Signatur-Schlüssel niemals committen (gitignored: `android/keystore/`, `keystore.properties`).

## 🧪 Test-Konventionen

- Pure Logik → `tests/*.test.ts` (Vitest, jsdom).
- WASM: echte Binärdatei aus `public/wasm/` instanziieren, gegen JS-Referenz prüfen.
- Netzwerk: `fetch`/`WebSocket` mocken, KEINE echten Requests in Tests.
- Store-Reducer: Ketten testen (z. B. BIND → Gerät gebunden → UNBIND → zurückgesetzt).
