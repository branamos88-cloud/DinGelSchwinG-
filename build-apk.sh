#!/bin/bash

# DinGelSchwinG APK Build & Release Script
# Builds both Debug and Release APKs

set -e

echo "========================================"
echo "DinGelSchwinG APK Build Pipeline"
echo "========================================"

PROJECT_NAME="DinGelSchwinG"
VERSION=$(node -p "require('./package.json').version")
BUILD_DATE=$(date '+%Y-%m-%d_%H-%M-%S')

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Install dependencies
echo -e "${YELLOW}[1/5] Installing dependencies...${NC}"
npm install

# Step 2: Type check
echo -e "${YELLOW}[2/5] Running TypeScript type check...${NC}"
npm run type-check

# Step 3: Build web assets
echo -e "${YELLOW}[3/5] Building web assets...${NC}"
npm run build

# Step 4: Sync Capacitor
echo -e "${YELLOW}[4/5] Syncing Capacitor...${NC}"
npx cap sync android

# Step 5: Build APKs
echo -e "${YELLOW}[5/5] Building APK files...${NC}"

if [ ! -d "android" ]; then
  echo -e "${RED}Android directory not found. Adding Capacitor Android platform...${NC}"
  npx cap add android
fi

# Debug APK
echo -e "${YELLOW}Building Debug APK...${NC}"
cd android
./gradlew assembleDebug
DEBUG_APK=$(find . -name "app-debug.apk" -type f | head -1)

# Release APK (optional)
read -p "Build Release APK? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Building Release APK...${NC}"
  ./gradlew assembleRelease
  RELEASE_APK=$(find . -name "app-release.apk" -type f | head -1)
fi

cd ..

# Step 6: Copy APKs to release directory
RELEASE_DIR="releases"
mkdir -p "$RELEASE_DIR"

if [ -f "$DEBUG_APK" ]; then
  DEBUG_FILENAME="${PROJECT_NAME}-v${VERSION}-debug-${BUILD_DATE}.apk"
  cp "$DEBUG_APK" "$RELEASE_DIR/$DEBUG_FILENAME"
  echo -e "${GREEN}✓ Debug APK created: $RELEASE_DIR/$DEBUG_FILENAME${NC}"
fi

if [ ! -z "$RELEASE_APK" ] && [ -f "$RELEASE_APK" ]; then
  RELEASE_FILENAME="${PROJECT_NAME}-v${VERSION}-release-${BUILD_DATE}.apk"
  cp "$RELEASE_APK" "$RELEASE_DIR/$RELEASE_FILENAME"
  echo -e "${GREEN}✓ Release APK created: $RELEASE_DIR/$RELEASE_FILENAME${NC}"
fi

echo -e "${GREEN}========================================"
echo "APK Build Complete!"
echo "========================================${NC}"
echo -e "${GREEN}APKs available in: $RELEASE_DIR/${NC}"
ls -lh "$RELEASE_DIR"/*.apk 2>/dev/null || echo "No APKs found"
