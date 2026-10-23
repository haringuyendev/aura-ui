---
name: scan
description: Refresh and inspect the Aura registry of a project - full rescan, status summary, what changed since the last scan, and resetting the baseline of accepted findings. Use when the user asks to rescan, sync or refresh aura, asks what components or tokens the project has overall, after large refactors, branch switches or merges, or to accept current findings as the new baseline.
---

# Aura scan

Run from the repo root (it has `.aura/`; if not, use the `aura-ui:init` skill). Prefer the vendored CLI
`node .aura/bin/aura.mjs`, or `npm run aura --` when the npm script exists.

| Need | Command |
|---|---|
| Summary of the design system and components (what agents get at session start) | `node .aura/bin/aura.mjs status` |
| Full rescan (after a big refactor, branch switch, merge, or if results look stale) | `node .aura/bin/aura.mjs scan` |
| Colors, fonts, radius, status tokens and which are text-safe | `node .aura/bin/aura.mjs tokens` |
| Accept the current findings as existing (hooks then block only new ones) | `node .aura/bin/aura.mjs baseline` |

Notes:
- Every aura command already refreshes incrementally (by file mtime/size): added, deleted and moved
  components are picked up without a scan. `scan` forces a full re-read, including tokens.
- `status` and `scan` print "Changes since last scan: +added −removed ~updated moved". Report removals
  that other code still imports (check with `aura usage <Name>` before deleting a component).
- Reset the baseline only when the user agrees the current findings are accepted debt; otherwise fix them
  (see the `aura-ui:check` skill).
- If the summary shows components "without a description", offer the `aura-ui:describe` skill.
