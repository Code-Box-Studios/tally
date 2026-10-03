#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]]; then
  echo 'Tally checks require Node 22. Select it in PATH before running.' >&2
  exit 1
fi
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
npm run check:functions
npm run test:emulators
flutter build web --target lib/main_preview.dart --output=build/web-preview
flutter build web --target lib/main_dev.dart --output=build/web-emulator
