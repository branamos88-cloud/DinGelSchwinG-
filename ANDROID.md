# DinGelSchwinG NEXUS — Android 11–14

Die App läuft **vollständig on-device**. Alle Module sind aktiv:

| Modul | Funktion |
|---|---|
| Login / RBAC | guest → emergency, JWT lokal, Action-Matrix |
| Nexus 3D | Live-Knoten, WASM-Abstand, Sensorfusion |
| Discovery | BLE / USB-C / WLAN / NFC / QR |
| Pairing | Binden, Gruppen, Sync, Unbind + WebAuthn-Gate |
| Terminal | PTY-Kommandos, Interlock, Flash/SSH rollenbasiert |
| Control Room | Clients, Live-Status, Audit-Trail |
| Mesh / Replay | Frequenzdienst, Signalaufnahme |
| Diagnose | nativer TCP-Ping, Speed, Durchsatz |
| MoE + Research | Permission-Guards, Wikipedia/npm-Recherche |
| Enterprise Nodes | MCP / API / Webhook / Notebook / Inferenz-Probe |
| Settings | persistente Konfiguration |

## Konten (On-Device)

- `service@example.com` / `pwd_service`
- `developer@example.com` / `pwd_developer`
- `expert@example.com` / `pwd_expert`
- `emergency@example.com` / `pwd_emergency`
- `operator@example.com` / `pwd_operator`
- `guest@local` / `pwd_guest`

## SDK-Ziele

- **minSdk 30** — Android 11
- **targetSdk / compileSdk 34** — Android 14

## APK bauen

```bash
npm install
npm run build
npx cap add android   # einmalig
npx cap sync android
node scripts/patch-android.mjs
cd android && ./gradlew assembleDebug
```

GitHub Actions (`.github/workflows/android-apk.yml`) erzeugt das Artifact `DinGelSchwinG-android11-14`.
