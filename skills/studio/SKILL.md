---
name: studio
description: Open Aura Studio, a local Lovable-style page for the project - chat on the left (each message runs Claude Code in the repo, with aura's skills and hooks), the live dev server on the right with 1440/768/390 frames, Approve/Decline buttons for new primitives. Use when the user asks for a Lovable-like page, a chat UI to edit the app, a visual editor, or to "open studio" / "aura studio".
---

# Aura Studio

```bash
node .aura/bin/aura.mjs studio                 # http://localhost:4400, opens the browser
node .aura/bin/aura.mjs studio --app apps/web  # monorepo: which app the preview shows first (switchable on the page)
node .aura/bin/aura.mjs studio --port 4500 --model sonnet --no-open
```
Start it in the background (it is a server: it keeps running until Ctrl+C) and give the user the URL.
The repo needs `.aura/` (run the `aura-ui:init` skill first) and the `claude` CLI on PATH, logged in.

What it does:
- Each chat message runs `claude -p` in the repo (`--permission-mode auto` by default; `"studio": { "permissionMode", "model", "port" }`
  in `.aura/rules.json`). Replies stream in; tool steps show as a collapsible list; Aura hook messages show as notes.
  The conversation continues across messages (same Claude session) until the user starts a new one.
- The preview is the app's dev server (found like `aura verify` finds it). If none is running, the page offers to start
  `<package manager> run dev`, and stops it with Studio.
- A new primitive (`aura add`, a new file in the primitives folder) can't get a permission prompt headless: the hook denies
  it, Studio shows Approve/Decline, and an approval is recorded in `.aura/cache/studio-approved.json` so the agent can retry.
- No Playwright in the project: Studio tells the agent to verify with `--skip-inspect` and shows the user an install button.

Debugging: `.aura/cache/studio.json` holds the transcript, `.aura/cache/studio-last.jsonl` the last turn's raw stream.
