---
name: setup
description: Check and fix what aura-ui needs on this machine - Node.js 20+, npm, git, the Claude Code CLI (for Aura Studio), Playwright (for aura verify) and, on Windows, Git Bash - including Node that is installed but not on the PATH of Claude Desktop sessions (nvm, volta, fnm). Use right after installing the aura-ui plugin, when an Aura hook fails with "node: command not found" or similar, when Aura Studio says claude or npm is missing, or when the user asks whether aura-ui will work on their machine (macOS, Windows, Linux, Claude Desktop).
---

# Aura setup

`${CLAUDE_PLUGIN_ROOT}` is the aura-ui plugin folder.

## 1. Find Node
```bash
node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" setup
```
If `node` isn't found, look for an installed one before proposing an install:
- macOS / Linux / Git Bash: `sh "${CLAUDE_PLUGIN_ROOT}/bin/find-node.sh"`
- Windows PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/bin/find-node.ps1"`

It prints the path of a Node 20+ binary. Run the report with that path: `"<path>" "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" setup`.
Nothing found (exit 1): Node is missing or older than 20; go to step 2 with the install command for this OS.

## 2. Read the report and fix
Each line: `✓` ok, `✗` required and missing, `○` optional. A missing item comes with the command for this OS.

- **Always ask the user before installing anything or changing settings.** Say what the command does, in one line.
  Installers that need admin rights or a GUI (the Node .pkg on macOS, winget prompts): give the user the command or the
  link and let them run it.
- **Node installed but not on the session's PATH** (`✗ Node có trong PATH của phiên Claude`): typical of Claude Desktop
  started from the Dock with Node from nvm/volta/fnm. Aura's hooks run `node …`, so they fail there. With the user's
  agreement, add the PATH line the report prints to the `env` block of `~/.claude/settings.json` (merge with what is
  there; it is a full literal PATH, `$PATH` isn't expanded), then restart the session. Alternative: install Node with the
  official installer or Homebrew, which put it in a folder GUI apps see.
- **Claude Code CLI** (needed by Aura Studio only): the native installer, no Node required. The copy inside Claude Desktop
  can't be started by other programs, so Studio needs the CLI even when the user works in Desktop.
- **Windows without Git Bash**: aura works (hooks run `node …` in PowerShell); Git for Windows is still recommended.
- **Playwright**: optional, per project. Without it `aura verify` checks code only. Studio has an install button.

## 3. Check that the hooks run
After fixing, start a new session (hooks and PATH are read at start) in a repo with `.aura/` and ask for a change that
writes a raw `<button>` in a page. Aura should block it ("Aura blocked this change"). No block and no Aura line at
session start: the hooks aren't running; re-run step 1 inside that session.

## Supported
| Where | Works |
|---|---|
| Claude Code CLI (macOS, Linux, Windows) | everything |
| Claude Desktop, Code tab (local session) | plugins and skills; hooks need Node on that session's PATH (step 2); Studio needs the CLI |
| Claude Desktop chat, claude.ai | not supported: no plugins, hooks or local processes |
