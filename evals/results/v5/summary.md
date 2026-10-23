# Eval v5: aura-base with data color, spacing rules and references/dashboard.md (2026-10-23)

Changes since v4: starter gets a real `chart-1…5` palette and success/warning/info tokens; "Color carries
data, not decoration"; "Spacing and layout" section; `references/dashboard.md`; focus-ring check.
A = no skill (clinic/shop A reused from v4; support A new). Case 8 (support) is held out: it was not
used to write the dashboard rules. Blind critic per case, default state only, States N/A.

| Case | A audit | C audit | A rubric | C rubric | Blind pick |
|---|---|---|---|---|---|
| Clinic ops (rules derived from it) | 4 H · 2 M | 2 H · 1 M | **2.4** | 2.0 (fail: 768 overlap, 390 table missing) | A, clear |
| Shop sales (rules derived from it) | 4 H · 4 M | 2 H · 1 M | 2.2 (fail) | 2.2 (fail: KPI cards half empty) | C, slight |
| **Support center (held out)** | 3 H · 1 M | 1 H · 1 M | 2.1 (fail: 934px at 390) | **2.4** (pass) | **C, clear** |

Cost: C ≈ 116–136k tokens / 9–11 min per dashboard (up from ~100k / 6 min in v4).

## Findings
- Color and spacing worked: critics praised C's attention lists with next actions, per-row actions,
  good/bad deltas and channel colors; no one called C black-and-white.
- New regression from `dashboard.md` §1: "KPIs and attention side by side" made KPI cards stretch to
  the attention column's height (half-empty cards in clinic and shop; flagged by both critics).
- Responsive breaks the audit can't see: clinic C table overlapping a card at 768 and missing at 390.
  The skill only asks to check 390 and 1440.
- Over-correction on color: support C painted all four failing KPI numbers red; critics want neutral
  numbers with colored deltas.
- Time shown as `2:05` instead of `2 phút 5 giây`.

## Next fixes
1. dashboard.md: KPIs in their own row (natural height), attention list beside the main chart; cards
   in a row use `items-start` unless contents match.
2. Done check at 390, 768 and 1440; look for overlap and blank areas, not only overflow.
3. KPI number stays foreground; only the delta and threshold line carry status color.
4. Durations in words (`2 phút 5 giây`), compact money everywhere (`524,3 tr ₫`).
