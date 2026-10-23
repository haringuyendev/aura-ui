#!/usr/bin/env bash
# Copy the aura-ui starter into a new directory and install dependencies.
# Usage: new-app.sh <target-dir> [app-name]
set -euo pipefail

target="${1:?usage: new-app.sh <target-dir> [app-name]}"
name="${2:-$(basename "$target")}"
template="$(cd "$(dirname "$0")/../template" && pwd)"

if [ -e "$target" ] && [ -n "$(ls -A "$target" 2>/dev/null)" ]; then
  echo "error: $target exists and is not empty" >&2
  exit 1
fi

mkdir -p "$target"
cp -R "$template"/. "$target"/
sed -i.bak "s/\"name\": \"aura-starter\"/\"name\": \"$name\"/" "$target/package.json" && rm "$target/package.json.bak"

cd "$target"
npm install --no-audit --no-fund
node "$(dirname "$template")/manager/aura.mjs" init >/dev/null && echo "Aura component manager initialised (.aura/)"
echo "Ready: cd $target && npm run dev"
