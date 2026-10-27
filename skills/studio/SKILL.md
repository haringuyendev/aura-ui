---
name: studio
description: Open Aura Studio, a local Lovable-style page for the project - chat on the left (each message runs Claude Code in the repo, with aura's skills and hooks), the live dev server on the right with 1440/768/390 frames, Approve/Decline buttons for new primitives. Use when the user asks for a Lovable-like page, a chat UI to edit the app, a visual editor, or to "open studio" / "aura studio".
---

# Aura Studio

> `node` not found ("command not found", "not recognized")? Run the `aura-ui:setup` skill first: it installs Node.js for the user, no admin rights needed.

```bash
node .aura/bin/aura.mjs studio                 # http://localhost:4400, opens the browser
node .aura/bin/aura.mjs studio --app apps/web  # monorepo: which app the preview shows first (switchable on the page)
node .aura/bin/aura.mjs studio --port 4500 --model sonnet --no-open
```
Start it in the background (it is a server: it keeps running until Ctrl+C) and give the user the URL.
It needs the `claude` CLI on PATH, logged in. An existing project needs `.aura/` first (the `aura-ui:init` skill).

A brand-new app: run it from the plugin in an empty folder, or name the folder to create:
```bash
node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" studio                   # in an empty folder
node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" studio --new lich-kham    # creates ./lich-kham
```
The page opens on "describe your app": it creates the app from the aura starter (copy, install, aura init, git init),
starts the dev server and sends the description as the first message, which builds the first screens.

What it does:
- Each chat message runs `claude -p` in the repo (`--permission-mode auto` by default; `"studio": { "permissionMode", "model", "port" }`
  in `.aura/rules.json`). Replies stream in; tool steps show as a collapsible list; Aura hook messages show as notes.
  The conversation continues across messages (same Claude session) until the user starts a new one.
- The preview is the app's dev server (found like `aura verify` finds it). If none is running, the page offers to start
  `<package manager> run dev`, and stops it with Studio.
- A new primitive (`aura add`, a new file in the primitives folder) can't get a permission prompt headless: the hook denies
  it, Studio shows Approve/Decline, and an approval is recorded in `.aura/cache/studio-approved.json` so the agent can retry.
- No Playwright in the project: Studio tells the agent to verify with `--skip-inspect` and shows the user an install button.

Attachments: the user can attach files (picker, drag and drop on the chat, pasted screenshots), also on the new-app
screen. They are saved in `.aura/cache/studio-uploads/` (git-ignored) and the message lists their paths with how to use
them: images as mockups or bug screenshots (rebuild with the project's components and tokens), CSV/JSON as sample data,
PDF/text as requirements, Excel/Word through the xlsx/docx skills. 20MB per file, 10 per message.

Address bar: the preview is an iframe on another port, so Studio learns the open page from the app itself. Apps from the
aura starter report it in dev (`src/lib/studio-bridge.ts`, called in `main.tsx`). In an app made another way the
bar stays where it was typed: copy that file and call `reportPathToStudio()` in the entry file.

Export: **Tải code** above the preview downloads the source as a .zip (no node_modules, build output, caches or
`.env` secrets), the same as the `aura-ui:export` skill.

History: the clock button lists earlier conversations ("Cuộc trò chuyện mới" archives the current one); one can be
read or picked up again, Claude session included.

Debugging: `.aura/cache/studio.json` holds the transcript (a new conversation archives the old one in
`.aura/cache/studio-history/`), `.aura/cache/studio-last.jsonl` the last turn's raw stream.
