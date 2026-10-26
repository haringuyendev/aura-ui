#!/usr/bin/env bash
# Copy the aura-ui starter into a new directory and install dependencies (kept for older docs: aura new does the work).
# Usage: new-app.sh <target-dir> [app-name]
set -euo pipefail
target="${1:?usage: new-app.sh <target-dir> [app-name]}"
exec node "$(cd "$(dirname "$0")/.." && pwd)/manager/aura.mjs" new "$target" ${2:+--name "$2"}
