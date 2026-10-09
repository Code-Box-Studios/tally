#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run typecheck
npm run lint
npm test
npm --prefix apps/tally run test:components
(cd apps/tally && npx expo-doctor)
