---
name: export
description: Package the project's source code as one .zip to download or hand over, like Lovable's export - no node_modules, build output, caches or .env secrets. Use when the user asks to export, download, zip, package or hand over the source ("xuất code", "tải source", "đóng gói", "nén thành zip", "gửi code cho dev"), or to back up the project before a big change.
---

# aura export

> `node` not found ("command not found", "not recognized")? Run the `aura-ui:setup` skill first: it installs Node.js for the user, no admin rights needed.

Run from the project folder. It works with or without `.aura/`:

```
node .aura/bin/aura.mjs export                  # → ~/Downloads/<project>-<date>.zip
node .aura/bin/aura.mjs export --out ../handover # a folder, or a path ending in .zip
node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" export     # when the project has no .aura/ yet
```

What goes in:
- In a git repo: git's file list (tracked files and new files that aren't ignored), so `.gitignore` decides.
  Elsewhere: every file except the usual generated folders.
- Always left out: `node_modules`, `dist`/`build`/`.next`/`coverage`, the engine's cache, logs, `.DS_Store`, tool state
  (`.hcom`, `.idea`, `.claude/settings.local.json`).
- Secrets are left out even when committed: `.env`, `.env.*` (but `.env.example` stays), `*.pem`, `*.key`, SSH keys.
  The command lists them: tell the user to share them another way, never paste their content.
- Everything sits in one folder named after the project. After unzipping: `npm install && npm run dev`.

Report to the user: the zip's path, the number of files, and any secrets that were left out. Don't commit the zip.

In Aura Studio the **Tải code** button above the preview downloads the same zip.
