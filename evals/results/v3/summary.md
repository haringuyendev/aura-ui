# Eval v3: aura-base (Lovable-style baseline) on the lab-results case (2026-10-23)

Arms: **A** = no skill (lab-A from v2, stock project) · **C** = aura-base v1 (starter + Lovable-style
SKILL.md) · **C2** = aura-base + "surface type" step and "Tool screens: restraint over wow" rules.
Same brief, same model, default state only (no arm implemented `?state=`), blind critic per pair,
States dimension N/A.

| Arm | Audit | Raw colors | Rubric (blind pair) | Cost |
|---|---|---|---|---|
| A | 2 H · 2 M · 1 L | 105 | 2.2 (vs C) · 2.0 (vs C2) | ~81k tok / 5 min |
| C | 1 H · 1 M · 1 L | 0 | **1.8** (lost to A, clear) | ~93k tok / 4.5 min |
| C2 | 3 H · 0 M · 1 L | 0 | **2.2** (beat A, slight) | ~94k tok / 4 min |

## Findings
- Lovable's "wow" brief hurts tool screens: C added KPI cards with colored icon tiles, an avatar,
  left color bars and a "Bình thường" pill on every row; the critic scored Visual restraint 1.
- Adding the surface-type split fixed that: C2 is neutral, normal rows unmarked, approver/machine
  moved to the panel header and a detail sheet (Information priority 2 vs A's 1).
- Design-system-first works in both C arms: 0 raw colors vs 105 in A.
- A's score moved 2.2 → 2.0 between two critic runs: treat ±0.2 as noise. C2 vs A is about even
  overall, C2 better on information decisions and restraint, A better on mobile and formatting.

## C2 backlog
- 390px: page overflows to 506px, only the name column visible (Responsive 0).
- Dot decimals ("11.8") instead of vi-VN comma; flags "H/L" instead of "↑ Cao / ↓ Thấp".
- Result time repeated on every row; no allergies in the patient header (both arms).
- Clickable rows lack a visible focus ring; flag column under 56px.
