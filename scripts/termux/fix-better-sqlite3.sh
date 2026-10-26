#!/usr/bin/env bash
# Compatibility entrypoint; native dependency repair has one implementation.
exec bash "$(dirname -- "${BASH_SOURCE[0]}")/fix-native.sh" sqlite
