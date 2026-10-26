#!/bin/sh
# Print the path of a Node.js >= 20 binary, even when it isn't on PATH (Claude Desktop started from the Dock doesn't load
# the shell profile that puts nvm/volta/fnm/asdf on PATH). Exit 1 when there is none. Used by the aura-ui:setup skill.
best=""; best_major=0
try() {
  [ -x "$1" ] || return 0
  major=$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null) || return 0
  [ -n "$major" ] && [ "$major" -gt "$best_major" ] && { best="$1"; best_major="$major"; }
  return 0
}
try "$(command -v node 2>/dev/null)"
for f in "$HOME/.aura-ui/node/current/bin/node" \
         "$HOME"/.nvm/versions/node/*/bin/node \
         "$HOME/.volta/bin/node" \
         "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node \
         "$HOME"/Library/Application\ Support/fnm/node-versions/*/installation/bin/node \
         "$HOME/.asdf/shims/node" "$HOME/.local/share/mise/shims/node" \
         /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node \
         "/c/Program Files/nodejs/node.exe" "$HOME/scoop/apps/nodejs/current/node.exe"; do
  try "$f"
done
[ "$best_major" -ge 20 ] && { echo "$best"; exit 0; }
[ -n "$best" ] && echo "too old: $best (v$best_major, need >= 20)" >&2
exit 1
