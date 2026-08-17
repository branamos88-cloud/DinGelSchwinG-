# DinGelSchwinG NEXUS-BUILDER — Build-Automatisierung
.PHONY: install build test typecheck android debug-apk release-apk wasm clean

install:        ## Abhängigkeiten installieren
	npm ci --legacy-peer-deps

wasm:           ## WASM-Modul aus WAT kompilieren
	node scripts/build-wasm.cjs

build:          ## Web-App bauen (dist/)
	npm run build

test:           ## Komplette Test-Suite (73 Tests)
	npx vitest run

typecheck:      ## TypeScript-Prüfung
	npx tsc --noEmit

android:        ## Android-Projekt synchronisieren
	npx cap sync android

debug-apk: build android   ## Debug-APK bauen
	cd android && ./gradlew assembleDebug

release-apk: build android ## Release-APK bauen (unsigned → manuell signieren)
	cd android && ./gradlew assembleRelease

clean:
	rm -rf dist android/app/build
