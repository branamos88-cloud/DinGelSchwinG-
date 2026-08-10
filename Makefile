.PHONY: help install build lint type-check dev preview clean android-add android-sync android-build android-apk android-apk-release android-install all-apk

help:
	@echo "DinGelSchwinG Build Targets"
	@echo "============================"
	@echo ""
	@echo "Web Development:"
	@echo "  make install        - Install dependencies"
	@echo "  make dev            - Start Vite dev server on :5173"
	@echo "  make build          - Build web assets (production)"
	@echo "  make preview        - Preview production build locally"
	@echo "  make lint           - Run ESLint (0 warnings required)"
	@echo "  make type-check     - Run TypeScript type checker"
	@echo ""
	@echo "Android APK Build:"
	@echo "  make android-add             - Add Android platform (one-time)"
	@echo "  make android-sync            - Sync web build → Android project"
	@echo "  make android-apk             - Build Debug APK"
	@echo "  make android-apk-release     - Build Release APK (signed)"
	@echo "  make android-install         - Install Debug APK on device (requires ADB)"
	@echo ""
	@echo "Complete Workflows:"
	@echo "  make all-apk        - Build & release APK (npm + capacitor + gradle)"
	@echo "  make clean          - Clean build artifacts"
	@echo ""

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

lint:
	npm run lint

type-check:
	npm run type-check

clean:
	rm -rf dist/
	rm -rf android/app/build/
	rm -rf node_modules/
	rm -rf releases/

android-add:
	npm run capacitor:add

android-sync: build
	npx cap sync android

android-build: android-sync
	cd android && ./gradlew assembleDebug --no-daemon

android-apk: android-build
	@echo "✅ Debug APK built:"
	@find android/app/build/outputs/apk -name "app-debug*.apk" -type f

android-apk-release: build
	npx cap sync android
	cd android && ./gradlew assembleRelease --no-daemon
	@echo "✅ Release APK built:"
	@find android/app/build/outputs/apk -name "app-release*.apk" -type f

android-install: android-apk
	@echo "📱 Installing Debug APK via ADB..."
	cd android && ./gradlew installDebug

all-apk: install type-check lint build
	@echo "🔨 Building Debug & Release APKs..."
	npx cap sync android
	@mkdir -p releases
	@echo "Building Debug APK..."
	cd android && ./gradlew assembleDebug --no-daemon
	@DEBUG_APK=$$(find android/app/build/outputs/apk -name "app-debug*.apk" -type f | head -1); \
	if [ -f "$$DEBUG_APK" ]; then \
		VERSION=$$(node -p "require('./package.json').version"); \
		BUILD_DATE=$$(date '+%Y-%m-%d_%H-%M-%S'); \
		DEBUG_FILENAME="DinGelSchwinG-v$$VERSION-debug-$$BUILD_DATE.apk"; \
		cp "$$DEBUG_APK" "releases/$$DEBUG_FILENAME"; \
		echo "✅ Debug APK: releases/$$DEBUG_FILENAME"; \
	fi
	@echo ""
	@echo "Building Release APK..."
	cd android && ./gradlew assembleRelease --no-daemon
	@RELEASE_APK=$$(find android/app/build/outputs/apk -name "app-release*.apk" -type f | head -1); \
	if [ -f "$$RELEASE_APK" ]; then \
		VERSION=$$(node -p "require('./package.json').version"); \
		BUILD_DATE=$$(date '+%Y-%m-%d_%H-%M-%S'); \
		RELEASE_FILENAME="DinGelSchwinG-v$$VERSION-release-$$BUILD_DATE.apk"; \
		cp "$$RELEASE_APK" "releases/$$RELEASE_FILENAME"; \
		echo "✅ Release APK: releases/$$RELEASE_FILENAME"; \
	fi
	@echo ""
	@echo "📦 APKs available in: releases/"
	@ls -lh releases/*.apk 2>/dev/null || echo "No APKs found"
