# Eval v6: aura-base with band layout + compose-only-from-template (2026-10-23)

Changes since v5: hard rule 8 "compose only from the starter's components" (charts via chart.tsx);
dashboard.md rewritten as horizontal bands (full-width attention banner above an equal-height KPI row,
never a tall block beside short cards); KPI numbers stay foreground, only deltas carry status color;
durations in words; self-check at 390/768/1440 including overlap and blank areas.
A = no skill (same builds as v4/v5). Blind critic per case, default state only, States N/A.

| Case | A audit | C audit | A rubric | C rubric | Blind pick |
|---|---|---|---|---|---|
| Clinic ops | 4 H · 2 M | 1 H · 2 M | 2.2 (fail) | **2.7** (ship-quality) | C, clear |
| Shop sales | 4 H · 4 M | 3 H · 1 M | 2.2 (fail) | **2.6** (ship-quality) | C, clear |
| Support center (held out) | 3 H · 1 M | 1 H · 1 M | 1.9 (fail) | **2.6** (ship-quality) | C, clear to large |

All three C builds compose only from template components (0 hand-drawn SVG). Cost ≈ 117–125k tokens,
8–10 min per dashboard.

Re-theme check: swapping 11 lines of tokens in `index.css` (brand hue, chart palette, background,
radius, font) re-skins the whole clinic dashboard with no screen-code change (`clinic-C-retheme-1440.png`);
0 arbitrary-value classes in screen code.

## Remaining backlog (from critics)
- Actions hidden at 390 (clinic); attention items need their own links.
- Chart polish: round y-axis ticks, no smoothed spline for hourly comparison, legend glyph matches the
  series (dash for dashed), staffing/yesterday series where the brief asks.
- Period selector should include "Hôm nay" and a custom range; restock action button; returns by reason.
- Focus ring still missing on a few elements; some 10–11px secondary text.
