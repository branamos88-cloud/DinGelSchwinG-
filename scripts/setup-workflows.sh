#!/bin/bash
set -e
mkdir -p .github/workflows
cat > .github/workflows/android-apk.yml <<'YML'
name: Android APK — Android 11-14 (API 30-34)

on:
  push:
    branches: [main, "arena/*"]
    tags: ["v*"]
  pull_request:
    branches: [main]
  workflow_dispatch:
  workflow_call:

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Setup Java 17 (Gradle 8 / AGP 8.2)
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
          cache: gradle

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Android SDK 34 + Build-Tools
        run: |
          sdkmanager --install "platforms;android-34" "build-tools;34.0.0" "platform-tools"
          sdkmanager --list_installed
          echo "ANDROID_HOME=$ANDROID_HOME" >> $GITHUB_ENV
          echo "ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT" >> $GITHUB_ENV
          java -version
          ./android/gradlew --version || true

      - name: Install npm dependencies
        run: npm ci

      - name: Type-Check
        run: npm run type-check

      - name: Build Web Assets (Vite)
        run: npm run build

      - name: Capacitor Sync Android
        run: npx cap sync android

      - name: Patch Android for API 30-34 (BLE/NFC/USB/WiFi + Permissions)
        run: node scripts/patch-android.mjs

      - name: Verify Android 11-14 compatibility
        run: |
          echo "=== variables.gradle ==="
          cat android/variables.gradle
          echo "=== compile SDK check ==="
          grep -E "compileSdkVersion|minSdkVersion|targetSdkVersion" android/variables.gradle
          test "$(grep -oP 'minSdkVersion\s*=\s*\K\d+' android/variables.gradle)" = "30" || (echo "❌ minSdkVersion must be 30 (Android 11)"; exit 1)
          test "$(grep -oP 'compileSdkVersion\s*=\s*\K\d+' android/variables.gradle)" = "34" || (echo "❌ compileSdkVersion must be 34 (Android 14)"; exit 1)
          test "$(grep -oP 'targetSdkVersion\s*=\s*\K\d+' android/variables.gradle)" = "34" || (echo "❌ targetSdkVersion must be 34"; exit 1)
          echo "✅ SDK 30-34 OK"
          echo "=== AndroidManifest permissions ==="
          grep -c "BLUETOOTH_SCAN" android/app/src/main/AndroidManifest.xml
          grep "POST_NOTIFICATIONS" android/app/src/main/AndroidManifest.xml
          grep "NEARBY_WIFI_DEVICES" android/app/src/main/AndroidManifest.xml
          echo "✅ Manifest permissions OK (BLE 12+, WiFi 13+, Notifications 13+)"
          echo "=== Java 17 / Gradle 8 ==="
          grep "com.android.tools.build:gradle:8" android/build.gradle
          cat android/gradle/wrapper/gradle-wrapper.properties | grep distributionUrl

      - name: Make gradlew executable
        run: chmod +x android/gradlew

      - name: Build Debug APK (Android 11-14)
        working-directory: android
        run: ./gradlew assembleDebug --stacktrace --no-daemon

      - name: Build Release APK (unsigned, CI)
        working-directory: android
        continue-on-error: true
        run: ./gradlew assembleRelease --stacktrace --no-daemon

      - name: List APK outputs
        run: |
          find android/app/build/outputs -type f -name "*.apk" | xargs ls -lh || true
          echo "=== APK details ==="
          for apk in $(find android/app/build/outputs -name "*.apk" 2>/dev/null); do
            echo "--- $apk ---"
            aapt dump badging "$apk" 2>/dev/null | head -n 20 || echo "aapt not available for badging"
          done

      - name: Prepare artifacts (versioned)
        run: |
          mkdir -p releases
          VERSION=$(node -p "require('./package.json').version")
          DATE=$(date '+%Y-%m-%d_%H-%M-%S')
          DEBUG_APK=$(find android/app/build/outputs/apk/debug -name "app-debug*.apk" | head -1)
          if [ -f "$DEBUG_APK" ]; then
            cp "$DEBUG_APK" "releases/DinGelSchwinG-v${VERSION}-debug-${DATE}-android11-14.apk"
            cp "$DEBUG_APK" "releases/DinGelSchwinG-debug-latest.apk"
            echo "✅ Debug APK prepared"
          fi
          RELEASE_APK=$(find android/app/build/outputs/apk/release -name "*.apk" | head -1)
          if [ -f "$RELEASE_APK" ]; then
            cp "$RELEASE_APK" "releases/DinGelSchwinG-v${VERSION}-release-${DATE}-android11-14.apk" || true
            cp "$RELEASE_APK" "releases/DinGelSchwinG-release-latest.apk" || true
            echo "✅ Release APK prepared"
          fi
          ls -lh releases/

      - name: Upload Debug APK — DinGelSchwinG-android11-14
        uses: actions/upload-artifact@v4
        with:
          name: DinGelSchwinG-android11-14
          path: |
            android/app/build/outputs/apk/debug/*.apk
            releases/*.apk
          if-no-files-found: error
          retention-days: 30

      - name: Upload Release APK (if built)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: DinGelSchwinG-release-android11-14
          path: |
            android/app/build/outputs/apk/release/*.apk
          if-no-files-found: warn
          retention-days: 30

      - name: Create GitHub Release (on tag v*)
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          files: |
            android/app/build/outputs/apk/debug/*.apk
            android/app/build/outputs/apk/release/*.apk
            releases/*.apk
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
YML
cat > .github/workflows/build-apk.yml <<'YML2'
name: Build APK (Compat)

on:
  push:
    branches: [main, "arena/*"]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    uses: ./.github/workflows/android-apk.yml
YML2
echo "✅ Workflows erstellt:"
ls -lh .github/workflows/
