# Eval v4: aura-base with tool-screen rules, locale and 390px check (2026-10-23)

aura-base = Lovable-style starter + design-system-first SKILL.md, plus: surface type (showcase/tool),
"Tool screens: restraint over wow", vi-VN formatting via Intl, exceptions = status color + words,
self-check at 390/1440. A = no skill (stock project; lab-A reused from v2). Default state only for
both arms; blind critic per case (States N/A, 10 dimensions); see `blind-map.txt`.

| Case | A audit | C audit | A rubric | C rubric | Blind pick |
|---|---|---|---|---|---|
| Lab results (table) | 2 H · 2 M · 1 L | 1 H | 1.9 (fail) | **2.6** (pass) | C, clear |
| Clinic ops dashboard | 4 H · 2 M | 1 H | **2.4** (fail: 390 overflow) | 2.3 (pass) | A after its mobile fix; slight |
| Shop sales dashboard | 4 H · 4 M | 1 H | 2.1 (fail) | **2.6** (pass) | C, clear |

Cost per screen: A ≈ 82–83k tokens / 5.5–6.5 min · C ≈ 84–103k tokens / 4.5–6.7 min.

## Findings
- C passed the gate in all 3 cases; A failed in all 3 (mobile overflow/clipping, raw colors, contrast).
- C's only HIGH audit finding everywhere: clickable rows/controls with no visible focus ring.
- Dashboards: C is calmer, consistent and responsive, but A's clinic build answered the director's
  question better: ranked attention list first, every KPI compared with last week and colored by
  good/bad, in-progress hour shown as partial. C kept KPI deltas grey and put attention second.
  "Color means status" was read as "avoid color" for deltas.
- A shop build had sharper analysis (sale-day context for the previous period, ROAS vs target,
  supplier lead time) but 8 KPI cards with colored sparklines and mixed money formats.

## Backlog for aura-base
- Dashboard guidance: lead with "is today OK / where must I act" (ranked attention list with links),
  4–5 KPIs each with comparison and good/bad-colored delta, partial periods marked, anomalies
  annotated (e.g. a sale day in the comparison period), actions on lists (restock, view).
- Focus ring on every interactive row/card (`focus-visible:ring`).
- Allergies/safety facts in record headers (lab, both arms missed it).
