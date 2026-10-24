---
name: inspect
description: Verify UI work before saying it is done with aura verify (checks the changed files, finds the pages that render them and inspects those), and check how a built page actually renders - layout breaks at 1440/768/390, whether key numbers stand out, whether statuses and exceptions carry color, contrast, repeated content, cluttered first screen and button problems - with aura inspect, which opens the page headless and reports findings as text, so you fix the UI from a report instead of judging screenshots. Use after building or changing a page or dashboard, when the Aura stop hook asks you to verify, or when the user says the UI looks gray, flat, cluttered, inconsistent or badly organized.
---

# Aura verify and inspect

## verify: the check before you say it is done
```bash
node .aura/bin/aura.mjs verify                                   # changed UI files (git + this session) → check + the pages that render them
node .aura/bin/aura.mjs verify /orders/123                       # pages to open yourself (a real id for /orders/:id)
node .aura/bin/aura.mjs verify --base http://localhost:3005      # when the dev server isn't found
node .aura/bin/aura.mjs verify --files src/pages/orders.tsx      # only these files
node .aura/bin/aura.mjs verify --accept contrast --reason "brand teal is a project token; proposed a darker one to the user"
node .aura/bin/aura.mjs verify --skip-inspect "pages need a login and there is no storage state"
```
- It finds the pages through the import graph and the router (Next/Remix/TanStack file routes, React Router
  `<Route path element>` with path constants), picks up to 6 that cover every changed file, finds each app's dev
  server (port from its vite/next config or scripts, or `"inspect": { "baseUrl": … }` in `.aura/rules.json`,
  per app: `{ "apps/web": "http://localhost:3005" }`) and runs inspect on them.
- Fix every `[error]` and re-run until it prints `✓ verified`. The Stop hook (and SubagentStop for subagents)
  won't let you finish while a file you changed is unverified or changed again after verifying.
- `--accept` is for findings that are wrong for this page, with the reason; the user is shown it. `--skip-inspect`
  is for pages that can't be opened; say so in your reply. Don't use either to get past real problems.
- No dev server? Start it (in the background) and re-run. Pages with a parameter need a real path.

## inspect: one page, by hand
```bash
node .aura/bin/aura.mjs inspect http://localhost:5173/dashboard            # one page, widths 1440, 768, 390
node .aura/bin/aura.mjs inspect http://localhost:5173 /orders /orders/42   # first URL is the base for paths
node .aura/bin/aura.mjs inspect <url> --widths 1440,390 --wait 1500         # fewer widths, wait for slow data
node .aura/bin/aura.mjs inspect <url> --storage .auth/state.json            # pages behind a login
node .aura/bin/aura.mjs inspect <url> --shot                                # also save full-page PNGs (.aura/cache/inspect)
node .aura/bin/aura.mjs inspect <url> --json                                # machine-readable
```
Needs the dev server running and Playwright in the project (`npm i -D playwright` / `bun add -d
playwright`, then `npx playwright install chromium`). Don't install it without asking the user. Exit code 1
when there is an `[error]`.

## Reading the report
- The **stats line** gives body text size, how much of the content carries color, KPI values found and how
  many colors the status chips use.
- The **outline** lists the page's blocks in order (`▲` = visible without scrolling at 1440) and what is
  above the fold at 390. Check that what needs action comes first and that the blocks match the plan.
- **Findings**: `@390` marks a layout problem seen at that width. Fix every `[error]`, the `[warn]`s that
  apply, then re-run. `[info]` is a hint.

## Fixing each rule
| Rule | Default | Fix |
|---|---|---|
| `h-overflow` | error | Something is wider than the screen. Stack columns, let text wrap, give wide tables `overflow-x-auto` or a stacked list on mobile. |
| `overlap` | warn | Blocks or texts sit on each other: remove fixed heights/widths, negative margins or stray absolute positioning. |
| `clipped-text` | warn | Text is cut off with no way to read it: let it wrap, or keep `truncate` and add a `title`/Tooltip with the full text. |
| `uneven-row` | warn | Cards side by side have very different heights: `h-full` on the cards (grid stretches them), balance their content, or change the grid so the long one gets more width. |
| `blank-area` | info | A large empty band: fill it or tighten the layout. |
| `tap-target` | warn | Controls under 32px on mobile: use the default/lg size. |
| `kpi-exception-neutral` | error | A card says "quá hạn / vượt / lỗi…" but its number and card are neutral: color the value (`text-destructive` / `text-warning`) or accent the card (`border-l-4 border-l-destructive`), keep the words. |
| `kpi-size` | warn | KPI values barely bigger than body text: `text-2xl`–`text-3xl font-semibold`. |
| `kpi-tabular` | info | Add `tabular-nums` to KPI values. |
| `zero-same-size` | info | A 0 card looks as important as live ones: mute the value or collapse empty cards. |
| `too-many-kpis` | warn | More than 5 KPI cards in a row: keep the ones that drive decisions. |
| `status-monotone` | error | Several statuses share one neutral style: one `STATUS_VARIANT` map for the domain, each status with a tone (the message proposes one); use the badge variants the project has. |
| `contrast` | error | Text below WCAG AA: use the text-safe token (`text-foreground` on a tint; a status color as text only when it passes). If a project token itself fails (e.g. brand color as link text), say so and propose a darker `-foreground` token instead of patching one spot. |
| `meaning-neutral` | warn | "Hủy / Quá hạn / Hoàn thành…" shown in gray: bad outcomes `destructive`/`warning`, good ones `success`. |
| `low-data-color` | warn | Under 2% of the content carries color: color statuses, exceptions, deltas and key numbers. Not decoration: surfaces stay neutral. |
| `decorative-tint` | info | Large tinted/gradient backgrounds on a tool page: make surfaces neutral, put color on the data. |
| `repeated-content` | error | The same fact (a block title or a long sentence) appears in several blocks: keep it where the user acts on it, make the others a count or a link. |
| `urgent-below-fold` | info | Exceptions only appear after scrolling: move them up. |
| `crowded-fold` | info | Too many blocks on the first screen: lead with what needs action, group or collapse the rest. |
| `multiple-primary` | warn | More than one solid primary button in an area: one primary, others outline/ghost. |
| `destructive-neutral` | warn | Xóa/Hủy actions look neutral: `variant="destructive"` (or ghost with `text-destructive`) plus a confirm. "Hủy" that only closes a dialog is fine. |
| `looks-disabled` | warn | An enabled control looks faded, or a disabled one looks active: fix the variant or disable it for real and say why. |
| `row-actions` | info | 3+ buttons per table row: keep the main one, move the rest into a ⋯ `DropdownMenu`. |
| `console-error` | warn | Console or page errors (or HTTP ≥ 400) while loading: fix them. |

The rules are heuristics (Vietnamese and English wording, computed styles). When a finding is wrong for
this page, say why in your reply and move on. Don't contort the design to silence it.

## Tuning (`.aura/rules.json`)
- Severities go in `"rules"` with the check rules, e.g. `"tap-target": "off"`, `"low-data-color": "info"`.
- `"inspect"`: `baseUrl` (so `aura inspect /orders` works and the stop hook knows where to look),
  `widths`, `height`, `wait`, `storageState`, `nudge` (false stops the stop-hook reminder), and the
  thresholds `kpiRatio` (1.7), `minDataColor` (0.02), `repeatSections` (3), `unevenRow` (0.3),
  `maxKpis` (5), `maxPrimary` (1), `tapTarget` (32), `blankArea` (0.25), `foldBlocks` (8).
