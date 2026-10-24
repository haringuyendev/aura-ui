---
name: build
description: Build or redesign web apps, screens and dashboards that don't look AI-generated - design system first, semantic tokens only, screens composed only from the project's components, purposeful data color, band layouts for dashboards, vi-VN formatting and a rendered-page self-check with aura inspect (no screenshot judging). Works on the aura starter (Lovable-style React + Vite + Tailwind + shadcn) and on existing projects. Use when the user asks to create or change a page, screen, dashboard, form, table or prototype, or says the UI looks generic, cluttered or inconsistent.
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: node "${CLAUDE_PLUGIN_ROOT}/manager/aura.mjs" hook skill-nudge
          once: true
---

# Aura build: design system first, compose from the project's components

`${CLAUDE_PLUGIN_ROOT}` is the aura-ui plugin folder (Claude Code fills it in; with other agents, use the folder where the aura-ui repo is cloned).

## Before building
1. **New app?** Use the `aura-ui:new-app` skill (starter + `aura init`). Stack: React + Vite + TypeScript +
   Tailwind v4 + shadcn/ui (Base UI) + lucide + react-router + TanStack Query/Table + react-hook-form + zod;
   all 60+ shadcn components, ready-made blocks, vi-VN formatters (`src/lib/format.ts`) and tokens with a
   chart palette and status colors. Don't switch frameworks or add another UI library.
2. **Existing app without `.aura/`?** Run the `aura-ui:init` skill first (one-time scan).
3. **Find components with the `aura-ui:find` skill** (`node .aura/bin/aura.mjs find "<need>"`, `show`,
   `tokens`) instead of reading component folders. Prefer a block over re-assembling its primitives.
   For a rich text editor or a PDF/Word/Excel viewer in a starter app, `aura find` prints the add-on's
   install command.
4. Agent hooks check every component edit. If one blocks you, follow the `aura-ui:check` skill. After
   creating a component, describe it (`aura-ui:describe`) so the next agent finds it.
5. **Plan color and emphasis before laying out a screen** (write it down in code, not in your head):
   - **One status map per domain.** Put every status of the domain in one `STATUS_VARIANT` (or `tone`)
     map next to its labels and use it everywhere the status shows: waiting/pending → `warning`, in
     progress → `info`, done/approved → `success`, cancelled/failed/overdue → `destructive`, draft →
     `secondary`/`outline`. Five statuses in one gray outline is a defect (`aura inspect` reports it).
   - **Pick the key numbers.** Name the 3–5 numbers the user acts on; they get the KPI treatment
     (`text-2xl`–`3xl` semibold tabular-nums), and when one is in exception (overdue, over a limit) its
     value or card takes the status color with the words. Zero states are muted.
   - **Each fact lives in one block.** Decide where each fact is shown (alert list, KPI, detail list)
     before building; a summary block links to the detail, it doesn't repeat it.

## Working in an existing project
The project's design system wins over the starter:
- **Rule 8 becomes "compose only from the project's components"** (what `aura find` returns). Never add a
  second UI library or copy starter files in. If something is missing, add it the project's way (e.g.
  `npx shadcn add <name>` with its `components.json`), or port an aura block by rewriting it for the
  project's primitives: Radix-based shadcn uses `asChild`, the starter's Base UI uses `render`; import
  `cn` from the project's path.
- **Tokens are the project's** (`aura tokens`). If a status, info or chart token is missing or not
  text-safe, add it in the project's token file following its `:root` / dark-selector / `@theme` pattern
  and say so. Don't restyle the brand.
- **Follow its conventions** (listed in the session-start summary): file layout, CMS blocks (e.g. Payload:
  a new section is a new block with config + component, registered where blocks are rendered), routing,
  data fetching, i18n, existing formatting helpers.
- Keep the design rules below (surface type, data color, spacing and layout, vi-VN, the 390/768/1440
  check). Showcase sites may use the project's existing gradients and motion; tools stay restrained.
- Don't refactor or move existing components unless the task needs it; if you do, say what changed.

## Hard rules
1. **The design system is everything.** All colors, gradients, shadows, radii, fonts and transitions
   are tokens in `src/index.css` (`:root`, `.dark`, `@theme inline`). Components only use tokens:
   `bg-primary`, `text-muted-foreground`, `shadow-elegant`, `bg-gradient-primary`.
2. **No raw colors in `className`.** Never `text-white`, `bg-black`, `bg-blue-500`, hex or `oklch()`
   in components. If you need a new look, add a token or a variant.
3. **Customize components with variants, not overrides.** Need a hero button or a status badge? Add a
   `cva` variant in `components/ui/button.tsx` / `badge.tsx` that uses tokens, then use
   `<Button variant="hero">`. Don't stack long override classes at the call site.
4. **One color format.** The starter uses `oklch()` in `index.css`. Keep every token in that format,
   and reference tokens through Tailwind classes or `var(--token)`; never wrap them in another color
   function.
5. **Check contrast in both modes.** The common bug is white text on a white surface (or dark on
   dark), e.g. light text on shadcn's `outline` button, which is not transparent. Make every variant
   readable on the surface it sits on.
6. **If the user specifies a design, follow it to the letter** (colors, font, layout, reference site).
7. **Format for the user's locale.** Numbers, money, percentages, dates and times go through `Intl`
   with the UI's locale (Vietnamese UI → `vi-VN`: `12,8`, `1.250.000 ₫`, `23/10/2026`); use the helpers
   in `src/lib/format.ts` (formatMoney, formatPercent, formatDuration, formatDate…). Never print
   raw `toFixed()` output or ISO dates. Durations read as words (`2 phút 5 giây`,
   `1 giờ 35 phút`), never `2:05`.
8. **Compose only from the starter's components.** Every card, table, chart, badge, tab, toggle, sheet,
   dialog, tooltip and form control comes from `src/components/ui/` or `src/components/blocks/`
   (charts through `chart.tsx` / recharts). Do not hand-roll an equivalent with raw `div`s or inline `<svg>`. If something is missing,
   add a variant to the closest component or compose existing ones; layout wrappers (grid, flex, spacing)
   are the only free-form markup.

## First build of a new app
Before writing code, post a short brief in chat (5–10 lines, no more):
0. **Surface type**: *showcase* (landing page, marketing site, portfolio, consumer onboarding) or
   *tool* (an app someone works in: tables, records, forms, dashboards, back office). This decides
   how much the design may decorate; see "Tool screens" below.
1. **What it evokes**: the mood and the kind of product, and 1–3 well-designed existing products to
   draw from (unless the user named one). For tools, pick products known for clarity, not flair.
2. **v1 features**: the few features this first version will have. Keep it small so the user can
   iterate; make it look good rather than do everything.
3. **Visual direction**: palette (primary, accent, neutrals), font (from `@fontsource`, with full
   Vietnamese coverage when the UI is Vietnamese), radius, and any gradients, shadows or motion.
   Do not build a light/dark switcher unless asked.

Then implement in this order:
1. **Design system**: edit `src/index.css` tokens (and add new ones such as `--gradient-primary`,
   `--shadow-elegant`, `--transition-smooth`, registered in `@theme inline`). Install and set the font.
   See `${CLAUDE_PLUGIN_ROOT}/references/design-system.md` for the token and variant patterns.
2. **Variants**: add the component variants you are about to use.
3. **Screens**: small, focused components in their own files (`src/components/<feature>/…`); pages in
   `src/pages/`; routes in `src/App.tsx` above the catch-all. Replace the placeholder `Index.tsx`.
   Use realistic sample data in the user's language; never lorem ipsum.
4. **Images**: no placeholder images or gray boxes. Use assets the user gave, a real image you can
   source legitimately, or a layout that doesn't need a photo.

"Less is more" for text and file count unless the user asked for a full landing page or website.

## Tool screens: restraint over wow
On a *showcase*, gradients, glow, motion and bold color sell the product. On a *tool*, the user
comes back every day to find something and act on it, so the design must make **exceptions** loud
and everything else quiet:
- **Color carries data, not decoration.** Surfaces stay neutral (no tinted backgrounds, gradients,
  glows or decorative icon tiles), but the *data* should be colored with intent. A tool that is all
  black and white is as wrong as one that is all gradients:
  - **Deltas and comparisons** are colored by meaning: `text-success` when the change is good,
    `text-destructive` when bad (wait time up = bad, revenue up = good), muted only when the change is
    too small to matter.
  - **Values past a threshold** take the status color with words: amber `warning` near a limit, red
    over it (e.g. capacity bars, days of stock, overdue days).
  - **Charts** use the `chart-1…5` palette with confidence: the current series in a solid chart color,
    the comparison series in muted gray or dashed, categories (channels, revenue parts) in distinct
    chart colors used consistently everywhere they appear, with a legend or direct labels.
  - **Status chips** use a subtle tint of their status color (`bg-warning/10 text-warning`).
  - Brand color marks primary actions, the active selection and key links.
- **Normal is unmarked.** Flag only what needs attention; an "OK/normal/active" value gets no badge,
  pill or tint. If most rows carry a marker, nothing stands out. (This is about status flags; chart
  series and good/bad deltas are still colored.)
- **One signal per fact.** Show an exception once (e.g. colored value *or* badge *or* row tint),
  not three ways at once.
- **Exceptions must be unmistakable.** The one signal you pick uses a status color *and* words or an
  icon, never color alone and never a cryptic code: "↑ Cao", "↓ Thấp", "Quá hạn 3 ngày", not "H"/"L".
- **Every element earns its place.** No charts, avatars or summary cards unless they drive a decision
  the user makes on this screen (on a dashboard, 4–5 KPI cards do; on a record or list screen they
  usually repeat what the list shows). Fields the user rarely needs go to a detail view, not a column.

**Building a dashboard or overview page?** Read `${CLAUDE_PLUGIN_ROOT}/references/dashboard.md` before the brief.

## Spacing and layout
Dense where the user scans many similar items, airy where they read. Cramped is not "efficient".
- **Tables** may be compact (rows 40–48px). Everything else gets room: cards and panels `p-5`–`p-6`,
  gaps between cards `gap-4`–`gap-6`, sections separated by `space-y-6`–`space-y-8`.
- **Lists of sentences** (alerts, insights, activity) use `space-y-3` between items, `leading-relaxed`,
  an icon aligned to the first line, and no divider lines between short items. Each item states the
  fact, then the context or the recommended action ("Tỷ lệ giao trễ 8%, gấp đôi tuần trước. Nên kiểm tra
  kho Bình Dương."). With many items on a wide screen, use two columns.
- **Bands of like content.** Stack the page as full-width rows; each row holds one kind of block
  (summary banner, KPI cards, a chart, a table, a pair of lists) with similar heights. Never put a
  tall block beside short cards; a card that is half empty because its neighbor is tall is a bug.
- **Type scale with clear steps**: page title `text-xl`/`text-2xl` semibold, card titles `text-base`
  semibold, body `text-sm`, captions `text-xs` muted. KPI numbers `text-2xl`–`text-3xl` tabular.
- **Line length** for prose stays under ~80 characters; don't stretch one sentence across 1440px.

## Later requests
- Keep changes small and within the request. No unrequested features, no speculative abstractions.
- Before each change, check whether a token or variant already covers it; extend the design system
  rather than styling one spot.
- Refactor when a file grows large or styles start to repeat.

## Done means
1. `npm run build` passes with no type or CSS errors, and imports resolve.
2. The dev server runs (`npm run dev`) and the page loads with no console errors.
   **Check the rendered result with `aura inspect`, not by eyeballing screenshots** (`aura-ui:inspect`):
   `node .aura/bin/aura.mjs inspect http://localhost:<port>/<route> [/other-route…]`. It opens each page at
   1440/768/390, prints the page outline and reports layout breaks (horizontal scroll, overlap, clipped
   text, uneven card rows), KPI emphasis, status colors, contrast, repeated content and button problems as
   text. Fix every `[error]`, the `[warn]`s that apply, and re-run until no error is left. Take one
   screenshot at the end only if the user wants to see it. At 390px wide tables become a stacked list
   and multi-column grids collapse to one column. Also tab through the page: every interactive
   element, including clickable rows and cards, shows a visible focus ring (`focus-visible:ring-2 ring-ring`).
3. Grep your new files for raw colors and fix any hit:
   `grep -rnE "(bg|text|border|from|to|via)-(white|black|slate|gray|zinc|neutral|red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|pink|rose)(-[0-9]+)?\b|#[0-9a-fA-F]{3,6}\b" src --include=*.tsx | grep -v components/ui`
4. Tell the user the URL to open. Keep the closing message to a couple of lines.
