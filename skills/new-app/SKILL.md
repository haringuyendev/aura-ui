---
name: new-app
description: Create a new web app from the aura starter - React + Vite + TypeScript + Tailwind v4 + shadcn/ui (all components) + react-router + TanStack Query/Table + react-hook-form + zod, ready-made blocks (data table, KPI stat, forms, date range, file upload, stepper), vi-VN formatters and a design-token system - with the Aura component manager already initialised. Use when the user asks to start, scaffold or prototype a new app, admin panel, dashboard or site from scratch.
---

# Aura new app

`AURA` = the aura-ui plugin folder, two levels above this skill's real directory (`<base>/../..`; outside Claude Code, the folder where the aura-ui repo is cloned).

```bash
bash "AURA/scripts/new-app.sh" <target-dir> [app-name]
```
It copies `AURA/template`, runs `npm install` (needs network or an npm mirror; versions are pinned by the
lockfile) and `aura init`. The target must be empty or missing.

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
direction; then tokens, variants, screens). For a rich text editor or a PDF/Word/Excel viewer, use the
`aura-ui:add-block` skill. Run `npm run dev` and give the user the URL.
