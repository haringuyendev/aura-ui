---
name: new-app
description: Create a new web app from the aura starter - React + Vite + TypeScript + Tailwind v4 + shadcn/ui (all components) + react-router + TanStack Query/Table + react-hook-form + zod, ready-made blocks (data table, KPI stat, forms, date range, file upload, stepper), vi-VN formatters and a design-token system - with the Aura component manager already initialised. Use when the user asks to start, scaffold or prototype a new app, admin panel, dashboard or site from scratch.
---

# Aura new app

`${CLAUDE_PLUGIN_ROOT}` is the aura-ui plugin folder (Claude Code fills it in; with other agents, use the folder where the aura-ui repo is cloned).

```bash
node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" new <target-dir> [--name app-name]
```
It copies `${CLAUDE_PLUGIN_ROOT}/template`, runs `npm install` (needs network or an npm mirror; versions are pinned by the
lockfile), `aura init` and a first git commit. Plain Node, so it works on macOS, Linux and Windows. The target must be
empty or missing. `node` not found: run the `aura-ui:setup` skill first.

What the app has:
- `src/components/ui/`: 60+ shadcn components (Base UI primitives: use `render`, not `asChild`).
- `src/components/blocks/`: page-header, stat + delta, data-table (sorting, column filters, column
  visibility, row selection, Excel/CSV export, server mode), description-list, form (react-hook-form + zod),
  number-input, date-range-picker, file-upload, stepper.
- `src/lib/format.ts`: vi-VN money, numbers, percent, dates, durations.
- `src/index.css`: tokens (oklch), `chart-1…5`, `success`/`warning`/`info`/`destructive` (AA), dark mode.
- `src/App.tsx` (router, query client, toaster, tooltip provider), `src/pages/Index.tsx` placeholder.
- `.aura/`: registry pre-described from the catalog, so `aura find` works in Vietnamese immediately.

Then build the first screen with the `aura-ui:build` skill (brief first: surface type, v1 features, visual
direction; then tokens, variants, screens). Two heavy add-ons are available on demand: a rich text editor
and a PDF/Word/Excel/image viewer; `aura find` prints their install command when a need matches. Run
`npm run dev` and give the user the URL.

Then offer Aura Studio (the `aura-ui:studio` skill): a chat + live preview page to keep shaping the app by prompting.
When the user wants to describe the app and watch it being built from the start, skip `aura new` and open Studio in
the empty target folder instead: `node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" studio --new <target-dir>`. Its first
screen asks what the app is for, creates it from the starter (same script), starts the dev server and sends the
description as the first message.
