# Dashboards

A dashboard answers, in this order: **Is it OK? Where must I act? Why?** Design top-down from those
three questions, not from the list of available metrics.

## 1. Page structure: horizontal bands
Build the page as a stack of **bands**. Each band holds one kind of content, and the blocks inside a
band have the same height by nature, so no card is stretched or half empty.
1. **Header**: title, "as of" time (`số liệu đến 10:30`), and the global filters that apply to the
   whole page (period, branch/channel). A filter's options can carry a problem count (`Kho Bình Dương 3`).
2. **Attention band** (full width, short): the ranked items as a banner card, laid out in 2 columns on
   wide screens so it stays 3–5 lines tall. It sits *above* the KPIs, never as a tall side column.
3. **KPI band**: 4–5 equal cards in one row (`grid-cols-2 lg:grid-cols-4/5`), all the same structure.
4. **Main chart band**: the chart where shape over time matters, full width (or 2/3 + 1/3 only when the
   side block is a breakdown of similar height, e.g. a channel share list).
5. **Comparison band**: the branch/channel comparison table, full width.
6. **Detail bands**: lists (stock, debt, complaints) two per row, with similar row counts.
On mobile: header → attention → KPIs (2 per row) → the rest stacked.
Never put a tall block (long list, chart) beside short cards (KPIs) in the same row.

## 2. KPI cards
- 4–5 cards. Each: label, big tabular number with unit in the foreground color (the number itself is
  not tinted, even when it misses target), delta vs the comparison period colored by
  good/bad (`text-success` / `text-destructive`, arrow + value), and the comparison baseline in muted
  text (`cùng giờ tuần trước: 1.120`). A threshold, if there is one, in a caption (`ngưỡng 95%`).
- Compare like with like: today until the current time vs the same time last week, not vs the full day.
- A composite KPI may show its split (orders: inbound / outbound / returns) as a thin stacked bar in
  chart colors with a small legend.
- Cards in the band share one structure. A small `chart.tsx` sparkline on every card is fine when the
  intraday/daily trend helps; it also fills the card evenly. Gray line for neutral metrics, status color
  only when the trend is good/bad.

## 3. Attention panel
- Generated from rules over the data, ranked by severity, 3–6 items, each one line of fact + one line
  of context or action, with a severity marker that has a text or icon difference (not color alone),
  the entity tag (branch/channel), and a link to the detail section.
- A summary line in the panel header: `3 nghiêm trọng · 2 theo dõi`. Empty state: "Không có vấn đề
  cần xử lý" with the time checked.
- Explain anomalies that would mislead: "Tuần trước có ngày nghỉ lễ nên số đơn tuần trước thấp bất
  thường."

## 4. Charts
- Use a chart only when shape matters (by hour, by day, vs previous period). Lists and rankings are
  tables or bar lists, not pies.
- Current series: solid `chart-1` bars or line with points; comparison: muted gray ticks or dashed
  line; categories: `chart-1…5`, same color for the same category across the page.
- Mark incomplete periods (the current hour/day) as partial (lighter fill + "đang diễn ra"), never as a
  sudden drop. Label axes with formatted values (`12 tr ₫`, `1,2 N`), keep gridlines faint, add tooltips.
- Give charts real height (220–300px on desktop) and pad the plot so the last axis label is not cut.

## 5. Lists and tables on a dashboard
- Every list says why each row is there (`Còn 1,3 ngày tồn`, `Trễ 2 ngày`) in the status color
  matched to severity, plus an action where one exists (`Tạo phiếu nhập`, `Xem`).
- Show a total in the card header when it matters (`Tổng 1,8 tỷ ₫`).
- Comparison tables highlight only the bad cells; a row click drills into that entity.
- Below `md`, comparison tables become one card per entity that keeps the decisive columns.

## 6. Common failures
- Black-and-white dashboard: deltas gray, charts gray, nothing tells good from bad.
- Rainbow dashboard: icon tiles, gradients, every card a different color.
- Attention list buried below charts, or a raw dump of 4 lists with no ranking.
- 8+ KPI cards; metrics without comparison; partial periods plotted as drops.
- Cramped cards: dividers between short items, no padding, prose stretched across the full width.
- Mixed-height rows: a tall attention column or list next to KPI cards, leaving the cards half empty.
- Hand-drawn charts or cards instead of `chart.tsx` / `card.tsx`.
