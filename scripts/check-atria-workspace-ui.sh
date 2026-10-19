#!/usr/bin/env bash
set -euo pipefail
node scripts/check-native-orchestration-hard-cut.mjs
node scripts/check-native-product-localization.mjs
