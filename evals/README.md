# Evals

Goal: prove the skill changes outcomes, not just adds tokens. Each case is run **with** and
**without** the skill on the same model and starter project, then compared on the same evidence.

## Procedure
Arms run on the same model with the same brief, in fresh agent sessions:
- **A (no skill):** a copy of `evals/baseline/` (stock Vite + shadcn with 17 components, neutral theme);
  `npm install`, render from `src/App.tsx`. The agent gets the brief only.
- **C (aura-ui):** `bash scripts/new-app.sh <dir>`; the agent is told to read
  `skills/build/SKILL.md` and may use `evals/tools/shot.mjs` to look at its page.

Then for each build:
1. `npm run build && npx vite preview --port <p>`.
2. Audit at the same settings for both arms:
   ```bash
   npm --prefix evals/tools install && npx --prefix evals/tools playwright install chromium   # once
   node evals/tools/audit.mjs http://localhost:<p>/ --viewports 390,768,1280,1440 --states ready --dark --out <dir>/audit
   ```
3. Copy the two screenshot folders to `blind/X` and `blind/Y` in random order (keep the map).
4. Give a fresh agent `evals/tools/critic/ui-critic.md`, `critique-rubric.md`, the brief and the case's
   expected decisions below; ask for scores for X and Y, top problems and "which would you ship".
   Score States as N/A unless both arms implemented `?state=`.
5. Record in `evals/results/<round>/summary.md`: audit tallies, rubric averages, blind pick, cost, and
   the backlog. Keep 1440/768/390 screenshots.

Pass bar for a skill change: C beats A on rubric average in ≥ 2 of 3 cases, including the held-out
case, and no case regresses versus the previous round. Treat differences ≤ 0.2 as noise (one run per arm).
Keep at least one case held out from rule-writing; don't copy case wording into the skill.

---

## Case 1: Order list (e-commerce back office)
**Prompt:**
> Làm trang "Đơn hàng" cho admin shop mỹ phẩm. Nhân viên CSKH dùng cả ngày để tìm đơn khi khách gọi,
> xử lý đơn chờ xác nhận và đơn giao thất bại. Dữ liệu đơn có: mã đơn, ngày đặt, tên khách, SĐT, địa chỉ,
> sản phẩm (nhiều), tổng tiền, phí ship, phương thức thanh toán, trạng thái thanh toán, trạng thái giao
> hàng, đơn vị vận chuyển, mã vận đơn, ghi chú, nhân viên phụ trách, created_at, updated_at, id.

**Expected decisions (for the critic):**
- Table pattern; search by order code / phone / name; saved views: Chờ xác nhận · Giao thất bại · Tất cả.
- Identity merges order code + date; customer merges name + phone; total right-aligned VND tabular.
- Two statuses (payment, delivery) as badges, or delivery primary with payment secondary; not both as loud colors.
- Address, item list, tracking number, notes in drawer; `id`, `created_at/updated_at` dropped.
- Mobile list: code · customer · total · delivery status.

## Case 2: Lab results (clinical)
**Prompt:**
> Làm màn hình "Kết quả xét nghiệm" cho bác sĩ xem kết quả của một bệnh nhân trong lần khám hôm nay.
> Có khoảng 25–40 chỉ số (công thức máu, sinh hoá, nước tiểu), mỗi chỉ số có giá trị, đơn vị,
> khoảng tham chiếu, cờ cao/thấp, thời gian trả kết quả, người duyệt, máy xét nghiệm.

**Expected decisions:**
- Grouped table by panel (Huyết học / Sinh hoá / Nước tiểu) with group headers; abnormal-first or a
  "Chỉ bất thường" toggle.
- Value right-aligned tabular with unit in its own muted column or inline; reference range muted;
  high/low flags as icon + text (↑ Cao / ↓ Thấp) in status colors, never color alone.
- Machine and approver dropped from the main view (detail/tooltip); result time shown once per panel.
- Patient identity header (name, age/sex, code, allergies) always visible.

## Case 3: Staff directory (HR admin, mobile matters)
**Prompt:**
> Làm trang "Nhân sự" cho quản lý chi nhánh xem danh sách nhân viên, lọc theo phòng ban và trạng thái
> (đang làm, nghỉ phép, đã nghỉ việc), xem nhanh liên hệ. Quản lý hay dùng điện thoại.
> Trường dữ liệu: họ tên, ảnh, mã NV, chức danh, phòng ban, SĐT, email, ngày vào làm, loại hợp đồng,
> trạng thái, quản lý trực tiếp, lương, ngày sinh, CCCD.

**Expected decisions:**
- Mobile-first list with avatar (faces help recognition here), name + title, status badge; tap → detail
  with call/email actions. Desktop: table.
- Salary and CCCD not on the list (sensitive, not needed for the task); birthday optional.
- Facets: phòng ban, trạng thái; search by name / mã NV / SĐT.
- "Đã nghỉ việc" excluded from the default view (saved view to include).

## Case 4: Surgical records (operating-room coordinator)
**Prompt:** (brand constraint included on purpose)
> Làm trang danh sách "Hồ sơ phẫu thuật" cho khoa Gây mê – Phẫu thuật của bệnh viện. Người dùng chính là
> điều phối viên phòng mổ: dùng cả ngày để theo dõi lịch mổ hôm nay, tình trạng từng ca và đôn đốc hoàn
> thiện hồ sơ trước/sau mổ. Mỗi hồ sơ có: id, mã hồ sơ, bệnh nhân (họ tên, năm sinh, giới tính, mã BN),
> chẩn đoán, phương pháp phẫu thuật, phân loại (cấp cứu / chương trình), phòng mổ, ngày giờ dự kiến, thời
> lượng dự kiến, phẫu thuật viên chính, phụ mổ, bác sĩ gây mê, phương pháp vô cảm, trạng thái ca (chờ duyệt,
> đã lên lịch, đang mổ, hồi tỉnh, hoàn tất, hoãn/huỷ), tình trạng hồ sơ (thiếu cam kết phẫu thuật, thiếu
> phiếu khám tiền mê, thiếu biên bản phẫu thuật, đủ), phân loại ASA, nhóm máu, dị ứng, ghi chú, created_at,
> updated_at, created_by. Tông màu xanh lá cây nhạt, trắng, chữ không chân. Dùng dữ liệu mẫu (30–40 hồ sơ).

**Expected decisions:**
- Job: coordinator tracks today's OR schedule and chases incomplete paperwork. Default view: today, ordered by
  what needs attention (in progress / emergency / incomplete records before finished), time within groups.
- Saved views along the two jobs: "Hôm nay", "Thiếu hồ sơ", maybe "Cấp cứu".
- Primary columns: patient (name + age/sex + code merged), scheduled time + duration, OR room, procedure
  (with diagnosis as secondary line or drawer), surgeon, case status, record completeness.
- Emergency flagged inline (icon/label, not a whole red row); allergies flagged inline (safety-critical).
- Record completeness shows *what* is missing (e.g. "Thiếu cam kết"), not just a red/green dot.
- Drawer/detail: assistants, anesthesia method, ASA, blood type, notes. Dropped: id, created_at/updated_at/created_by.
- Brand: light green as the single accent (primary actions, active states) on white/neutral surfaces, not
  green-tinted everything; status colors stay semantic and distinguishable from the brand green;
  sans-serif with full Vietnamese coverage.
- All states present; mobile list keeps time, patient, room, status.

## Case 5: Promotion form (e-commerce admin, not a table)
**Prompt:**
> Làm trang "Tạo chương trình khuyến mãi" cho admin shop mỹ phẩm online. Nhân viên marketing tạo khoảng 5–10
> chương trình mỗi tháng. Các trường: tên chương trình, mã giảm giá (tự sinh hoặc tự nhập), loại giảm
> (phần trăm / số tiền / tặng quà / miễn phí vận chuyển), giá trị giảm, giảm tối đa, giá trị đơn tối thiểu,
> áp dụng cho (toàn shop / danh mục / sản phẩm cụ thể), đối tượng khách (tất cả / theo hạng thành viên /
> khách mới), thời gian bắt đầu và kết thúc, giới hạn tổng lượt dùng, giới hạn mỗi khách, cho phép cộng dồn
> với khuyến mãi khác, kênh áp dụng (website, app, cửa hàng), trạng thái (nháp / kích hoạt), ghi chú nội bộ,
> id, created_by. Dùng dữ liệu mẫu cho danh mục, sản phẩm và hạng thành viên.

**Expected decisions:**
- Form pattern on one page with grouped sections (Thông tin, Ưu đãi, Điều kiện, Thời gian & giới hạn, Kênh),
  or a short stepper; not a table, not a dashboard.
- Progressive disclosure: value/max fields change with discount type (no "giảm tối đa" for fixed amount;
  gift picker for "tặng quà"); product/category pickers only when that scope is chosen.
- A live plain-language summary of the rule ("Giảm 15%, tối đa 50.000 ₫ cho đơn từ 300.000 ₫, áp dụng
  toàn shop, 22/10–31/10") and/or a voucher preview, since the marketer must verify the rule.
- Sensible defaults (code auto-generated, all channels, starts now), money inputs formatted vi-VN, inline
  validation (end after start, max ≤ order minimum logic), conflict warning if stacking is on.
- Sticky action bar: "Lưu nháp" (secondary) + "Kích hoạt" (primary). `id`, `created_by` not in the form.
- States: validation errors, saving, saved/activated confirmation, load error (edit mode). Usable on mobile.

---

## Audit self-test
`fixtures/slop.html` is a deliberately bad page. The audit must report HIGH findings for raw colors,
emoji icons, placeholder copy, contrast, unnamed controls, collapsed columns and numeric alignment:
```bash
node evals/tools/audit.mjs file://$PWD/evals/fixtures/slop.html --viewports 390,1280 --out /tmp/aura-slop
```

## Case 6: Clinic operations dashboard (director, daily overview)
**Prompt:**
> Làm trang "Tổng quan" (dashboard) cho giám đốc hệ thống phòng khám đa khoa có 3 chi nhánh. Giám đốc mở
> mỗi sáng và giữa ngày để nắm tình hình và xử lý chỗ có vấn đề. Dữ liệu có: lượt khám hôm nay và cùng kỳ
> tuần trước, doanh thu (dịch vụ, thuốc, bảo hiểm), thời gian chờ trung bình, tỷ lệ bệnh nhân bỏ về, lượt
> khám theo giờ, công suất theo chuyên khoa, bác sĩ đang quá tải, khiếu nại mới, thuốc sắp hết tồn kho,
> công nợ bảo hiểm quá hạn; tất cả có thể xem theo từng chi nhánh. Dùng dữ liệu mẫu.

**Expected decisions:**
- Answers "is today OK, and where must I act?" first: a short attention list (overloaded doctors, long
  waits at a branch, stock-outs, overdue insurance debt, new complaints) near the top, each with a link/action.
- 4–5 KPIs max, each with a comparison (vs same day last week) and direction colored by good/bad, not by
  up/down; numbers formatted vi-VN (`1,2 tỷ ₫`, `18 phút`).
- Branch filter in the page header that applies to everything; branches compared side by side where it matters.
- Charts only where shape matters (visits by hour vs last week); simple bars/lines, labeled axes, no pies
  with many slices, no 3D/gradients; tables for lists (stock, debt).
- Restraint: neutral surfaces, color only for status; no decorative icon tiles. Usable at 390px (stacked).

## Case 7: Online shop sales dashboard (owner, multi-channel)
**Prompt:**
> Làm trang "Dashboard bán hàng" cho chủ shop mỹ phẩm bán trên website, Shopee và TikTok Shop. Chủ shop xem
> hằng ngày để biết bán có tốt không, kênh nào đang kéo xuống, cần nhập hàng gì. Dữ liệu: doanh thu, số
> đơn, giá trị đơn trung bình, tỷ lệ chuyển đổi, chi phí quảng cáo và ROAS theo kênh, doanh thu theo ngày,
> top sản phẩm, sản phẩm sắp hết hàng, đơn hoàn/huỷ; so sánh với kỳ trước; có bộ chọn khoảng thời gian.
> Dùng dữ liệu mẫu.

**Expected decisions:**
- Period selector (Hôm nay / 7 ngày / 30 ngày / tuỳ chọn) with "so với kỳ trước" applied to every KPI.
- 4–5 KPIs (doanh thu, đơn, AOV, tỷ lệ chuyển đổi, ROAS) with delta; money in VND vi-VN (`12,4 tr ₫`).
- Channel comparison as a compact table or grouped bars (revenue, orders, ad spend, ROAS per channel),
  highlighting the channel that dropped.
- Revenue over time as a line/area vs previous period; top products as a ranked list with revenue and units.
- Low-stock list with days-of-stock and a restock action; returns/cancellations rate with the main reason.
- Restraint and responsive as in Case 6.

## Case 8: Customer-support center dashboard (held out: not used to write dashboard rules)
**Prompt:**
> Làm trang "Dashboard CSKH" cho trưởng trung tâm chăm sóc khách hàng của một công ty viễn thông (khoảng 60
> nhân viên, 3 ca). Trưởng trung tâm theo dõi trong ngày để điều phối người và xử lý tồn đọng. Dữ liệu: số
> cuộc gọi/chat/email đến và đã xử lý, thời gian chờ trung bình, tỷ lệ bỏ máy, tỷ lệ đạt SLA, CSAT, số ticket
> tồn và ticket quá hạn, nhân viên đang online/đang nghỉ theo ca, lưu lượng theo giờ so với dự báo, top lý do
> liên hệ, ticket khiếu nại mức cao; so sánh với hôm qua. Dùng dữ liệu mẫu.

**Expected decisions:**
- First screen answers "are we keeping up, and where to act": SLA/wait/abandon vs target and yesterday,
  plus a ranked attention list (queue over SLA, overdue tickets, understaffed hour, escalated complaints).
- 4–5 KPIs with good/bad-colored deltas; time as `1 phút 20 giây`/`80 giây`, percentages vi-VN.
- Volume by hour vs forecast (and staffing) as one chart, current hour marked partial.
- Channel breakdown (call/chat/email) compact; top contact reasons as a ranked bar list.
- Overdue/escalated tickets as a list with age and owner, each linkable. Agents by shift as counts, not a roster.
- Restraint with purposeful color; comfortable spacing; usable at 390px.
