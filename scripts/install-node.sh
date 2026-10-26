#!/bin/sh
# Install Node.js LTS for aura-ui on macOS/Linux without admin rights: the official build from nodejs.org (SHA-256
# checked against nodejs.org's SHASUMS256.txt) into ~/.aura-ui/node, plus a PATH line in the login-shell profile, which
# Claude Desktop reads at start (restart it) and new terminals pick up.
# Usage: sh install-node.sh [--dir DIR] [--no-profile]     Prints the path of the installed node on success.
set -eu
DIR="$HOME/.aura-ui/node"; PROFILE=1
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --no-profile) PROFILE=0; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

case "$(uname -s)" in Darwin) plat=darwin ;; Linux) plat=linux ;; *) echo "On Windows use install-node.ps1" >&2; exit 2 ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) echo "Unsupported CPU: $(uname -m)" >&2; exit 2 ;; esac
fetch() { if command -v curl >/dev/null 2>&1; then curl -fsSL "$1"; else wget -qO- "$1"; fi; }

# newest LTS release (index.json lists newest first; non-LTS entries have "lts":false)
index=$(fetch https://nodejs.org/dist/index.json)
ver=$(printf '%s' "$index" | tr '{' '\n' | grep '"lts":"' | head -1 | sed 's/.*"version":"\([^"]*\)".*/\1/')
case "$ver" in v[0-9]*) ;; *) echo "Could not read the Node.js release list from nodejs.org" >&2; exit 1 ;; esac
name="node-$ver-$plat-$arch"; file="$name.tar.gz"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

echo "Downloading Node.js $ver ($plat-$arch) from nodejs.org…" >&2
fetch "https://nodejs.org/dist/$ver/$file" > "$tmp/$file"
expected=$(fetch "https://nodejs.org/dist/$ver/SHASUMS256.txt" | grep "  $file\$" | cut -d' ' -f1)
actual=$( (shasum -a 256 "$tmp/$file" 2>/dev/null || sha256sum "$tmp/$file") | cut -d' ' -f1)
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then echo "Checksum mismatch for $file: not installing" >&2; exit 1; fi

mkdir -p "$DIR"
tar -xzf "$tmp/$file" -C "$tmp"
rm -rf "${DIR:?}/$ver"; mv "$tmp/$name" "$DIR/$ver"
ln -sfn "$DIR/$ver" "$DIR/current"
bin="$DIR/current/bin"
"$bin/node" -v >/dev/null

if [ "$PROFILE" = 1 ]; then
  line="export PATH=\"$bin:\$PATH\"  # aura-ui: Node.js"
  # zsh login shells (macOS default, what Claude Desktop reads) use .zprofile; bash uses .bash_profile or .profile
  files="$HOME/.zprofile"
  [ "$plat" = linux ] && files="$HOME/.profile"
  [ -f "$HOME/.bash_profile" ] && files="$files $HOME/.bash_profile"
  for f in $files; do
    grep -q '# aura-ui: Node.js' "$f" 2>/dev/null || printf '\n%s\n' "$line" >> "$f"
  done
  echo "Added Node.js to PATH in: $files (restart Claude Desktop / open a new terminal)" >&2
fi
echo "$bin/node"
