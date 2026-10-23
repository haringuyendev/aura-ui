---
name: aura-ui
description: Build web apps, screens and dashboards that don't look AI-generated, the way Lovable does it - a fixed React + Vite + Tailwind + shadcn/ui starter, a design system defined first in index.css, semantic tokens only, screens composed only from the starter's components, purposeful data color, band layouts for dashboards, vi-VN formatting and a 390/768/1440 self-check. Use when the user asks to create or redesign an app, page, screen, dashboard or prototype, or when generated UI looks generic, cluttered or inconsistent.
---

# Aura UI: design system first, on a fixed stack

This skill reproduces the approach that makes Lovable's output look consistent:
**one fixed stack, a full component library already installed, and a design system written before
any screen.** The model composes styled components instead of inventing CSS, so every screen shares
the same colors, radius, spacing and type.

## Stack (fixed)
React + Vite + TypeScript + Tailwind v4 + shadcn/ui (Base UI primitives) + lucide icons +
react-router + TanStack Query. Do not switch frameworks or add another UI library.

**New project:** copy the starter, then work inside it. The script lives in this skill's folder
(the folder containing this SKILL.md); in Claude Code that is `${CLAUDE_PLUGIN_ROOT}/skills/aura-ui`.
```bash
bash <this-skill-folder>/scripts/new-app.sh <target-dir>
```
The starter has all 60+ shadcn components in `src/components/ui/`, tokens in `src/index.css`
(including a 5-color `chart-1…5` palette and `success` / `warning` / `info` / `destructive` status
colors, all AA on the background; retune their hues to the brand but keep them colorful),
routing in `src/App.tsx`, and a placeholder `src/pages/Index.tsx`.

**Existing project:** keep its stack. Apply the design-system rules below to whatever it uses.

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
   with the UI's locale (Vietnamese UI → `vi-VN`: `12,8`, `1.250.000 ₫`, `23/10/2026`). Never print
   raw `toFixed()` output or ISO dates. Durations read as words (`2 phút 5 giây`,
   `1 giờ 35 phút`), never `2:05`.
8. **Compose only from the starter's components.** Every card, table, chart, badge, tab, toggle, sheet,
   dialog, tooltip and form control comes from `src/components/ui/` (charts through `chart.tsx` /
   recharts). Do not hand-roll an equivalent with raw `div`s or inline `<svg>`. If something is missing,
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
   See `references/design-system.md` for the token and variant patterns.
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

**Building a dashboard or overview page?** Read `references/dashboard.md` before the brief.

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
   Look at it at 390px, 768px and 1440px wide (Playwright or a browser), and look for overlapping
   blocks, clipped text and large blank areas, not only overflow. At 390px there is no horizontal page
   scroll and the primary data is visible without scrolling sideways: wide tables become a stacked
   list, multi-column grids collapse to one column. Tab through the page: every interactive element,
   including clickable rows and cards, shows a visible focus ring (`focus-visible:ring-2 ring-ring`).
3. Grep your new files for raw colors and fix any hit:
   `grep -rnE "(bg|text|border|from|to|via)-(white|black|slate|gray|zinc|neutral|red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|pink|rose)(-[0-9]+)?\b|#[0-9a-fA-F]{3,6}\b" src --include=*.tsx | grep -v components/ui`
4. Tell the user the URL to open. Keep the closing message to a couple of lines.
