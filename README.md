# Aura UI (v0.7)

Plugin/skill giúp coding agent làm UI không bị "AI slop", theo cách Lovable làm: **stack cố định,
starter cài sẵn đủ component, design system viết trước, màn hình chỉ được ghép từ component có sẵn**.
Bổ sung thêm những gì Lovable thiếu cho app nội bộ và dashboard: tiết chế ở màn hình công cụ, màu dùng
cho dữ liệu, bố cục dashboard theo dải, định dạng vi-VN, tự kiểm tra ở 390/768/1440.

## Kết quả eval (chấm mù, cùng model)
| Đề | Không skill | Aura UI |
|---|---|---|
| Dashboard phòng khám | 2,2 | **2,7** |
| Dashboard bán hàng | 2,2 | **2,6** |
| Dashboard CSKH (đề giữ riêng, không dùng để viết luật) | 1,9 | **2,6** |

Thang 0–3, ship-quality ≥ 2,6. Chi tiết từng vòng trong `evals/results/v3`→`v6`
(ở các vòng này skill còn tên `aura-base`).

## Cấu trúc
```
.claude-plugin/              plugin.json, marketplace.json
skills/aura-ui/
  SKILL.md                   luật cứng, brief trước lần build đầu, tiết chế cho màn hình công cụ,
                             spacing & layout, điều kiện "xong"
  references/design-system.md  mẫu token, gradient, shadow, font, animation, variant (Tailwind v4)
  references/dashboard.md    bố cục dải, KPI, khung "Cần xử lý", biểu đồ, danh sách
  template/                  starter: Vite + React 19 + TS + Tailwind v4 + shadcn (63 component,
                             Base UI) + react-router + TanStack Query/Table + react-hook-form + zod;
                             src/components/blocks/ (page-header, stat, data-table, description-list,
                             form, number-input, date-range-picker, file-upload, stepper), src/lib/format.ts
  catalog/components.json    danh mục 76 mục (63 linh kiện shadcn, 9 khối, 3 add-on, format): tác dụng,
                             khi dùng/không dùng, export, variant, ví dụ
  scripts/catalog.mjs        tra danh mục: find <từ khoá> | show <tên> | list [nhóm] | sync
  scripts/new-app.sh         copy starter sang thư mục mới và cài package
  addons/                    khối nặng cài khi cần: rich-text-editor (Tiptap), file-lightbox (PDF/Word/Excel/ảnh)
  scripts/add-block.mjs      cài add-on vào app: chép file, npm install, chép asset (font pdf.js)
evals/
  README.md                  quy trình A/B và 8 đề (bảng, form, dashboard)
  baseline/                  project gốc cho nhánh "không skill"
  tools/audit.mjs            audit Playwright (overflow, màu raw, contrast, focus, bảng…)
  tools/shot.mjs             chụp 390/768/1440
  tools/critic/              agent critic + rubric + danh sách anti-slop
  fixtures/slop.html         trang xấu cố ý để tự kiểm tra audit
  results/v3…v6              kết quả các vòng
```

## Cài đặt
**Claude Code** (plugin, tự cập nhật khi repo có bản mới):
```bash
/plugin marketplace add haringuyendev/aura-ui
/plugin install aura-ui@aura-ui
```
**Agent khác** (Codex, Cursor, Gemini CLI, OpenCode… loại đọc được thư mục skill có `SKILL.md`):
copy hoặc symlink thư mục `skills/aura-ui/` vào thư mục skill của agent đó, ví dụ:
```bash
git clone https://github.com/haringuyendev/aura-ui.git
ln -s "$PWD/aura-ui/skills/aura-ui" ~/.codex/skills/aura-ui      # Codex
```
Agent không hỗ trợ skill: thêm vào `AGENTS.md` của project một dòng "Khi làm UI, đọc và làm theo
`<đường-dẫn>/skills/aura-ui/SKILL.md`".
Skill tự kích hoạt khi làm hoặc sửa app, màn hình, dashboard. Gọi thẳng: "dùng aura-ui làm trang …".
Tạo app mới từ starter: `bash skills/aura-ui/scripts/new-app.sh <thư-mục>`.

## Đổi design system
Màu, font, bo góc, shadow, bảng màu biểu đồ nằm trong `src/index.css` của app. Vì màn hình chỉ dùng
token và component của template, sửa file này là cả app đổi theo (đã thử trên dashboard phòng khám:
11 dòng token, không sửa code màn hình). Hình dáng component sửa trong `src/components/ui/`.

## Thêm hoặc sửa component
1. Thêm file vào `skills/aura-ui/template/src/components/ui/` (ví dụ `npx shadcn add <tên>` trong template)
   hoặc khối tự viết vào `template/src/components/blocks/` (chỉ ghép từ `ui/`, dùng token).
2. Thêm một mục vào `skills/aura-ui/catalog/components.json` (name, category, summary, use_when,
   avoid_when, keywords có cả tiếng Việt, example, related).
3. Chạy `node skills/aura-ui/scripts/catalog.mjs sync`: tự cập nhật exports/variants từ code, báo mục
   còn thiếu hoặc thừa.
