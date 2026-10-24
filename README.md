# Aura UI (v1.4)

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
hooks/hooks.json             hook cho agent: SessionStart, PostToolUse (Write|Edit, Bash), Stop
skills/                      8 skill, gọi bằng /aura-ui:<tên>
  build/                     dựng/sửa màn hình theo luật thiết kế (tự kích hoạt khi làm UI)
  init/  scan/               cài aura vào repo · quét lại, trạng thái, baseline
  find/  check/  describe/   tìm component · kiểm tra & sửa lỗi · viết mô tả component
  inspect/                   mở trang đã dựng, báo lỗi bố cục / màu / số liệu / lặp nội dung bằng chữ
  new-app/                   tạo app từ starter (add-on editor/lightbox: aura find in sẵn lệnh cài khi cần)
manager/                     Aura component manager: aura.mjs (init, find, show, usage, tokens, check,
                             inspect, describe, baseline, scan, status, hook)
template/                    starter: Vite + React 19 + TS + Tailwind v4 + shadcn (63 component, Base UI),
                             blocks/ (page-header, stat, data-table, form…), lib/format.ts, token
catalog/components.json      danh mục 76 mục của starter (dùng làm từ điển Việt–Anh cho aura find)
addons/                      rich-text-editor (Tiptap), file-lightbox (PDF/Word/Excel/ảnh)
scripts/                     new-app.sh, add-block.mjs, catalog.mjs
references/                  design-system.md, dashboard.md
evals/                       quy trình A/B, baseline project, công cụ audit/critic, kết quả v3–v6
```

## Cài đặt
**Claude Code** (plugin, tự cập nhật khi repo có bản mới):
```bash
/plugin marketplace add haringuyendev/aura-ui
/plugin install aura-ui@aura-ui
```
**Agent khác** (Codex, Cursor, Gemini CLI, OpenCode… loại đọc được thư mục skill có `SKILL.md`):
clone repo rồi copy hoặc symlink các thư mục trong `skills/` vào thư mục skill của agent đó (các skill trỏ
ngược về thư mục plugin qua `../..`, nên giữ nguyên cấu trúc repo), ví dụ:
```bash
git clone https://github.com/haringuyendev/aura-ui.git
for s in aura-ui/skills/*; do ln -s "$PWD/$s" ~/.codex/skills/aura-ui-$(basename $s); done   # Codex
```
Agent không hỗ trợ skill: thêm vào `AGENTS.md` của project một dòng "Khi làm UI, đọc và làm theo
`<đường-dẫn>/skills/build/SKILL.md`".
Skill `build` tự kích hoạt khi làm hoặc sửa màn hình; các skill khác gọi bằng `/aura-ui:init`, `/aura-ui:find`, `/aura-ui:check`…
Tạo app mới từ starter: `bash scripts/new-app.sh <thư-mục>` (hoặc `/aura-ui:new-app`).

## Đổi design system
Màu, font, bo góc, shadow, bảng màu biểu đồ nằm trong `src/index.css` của app. Vì màn hình chỉ dùng
token và component của template, sửa file này là cả app đổi theo (đã thử trên dashboard phòng khám:
11 dòng token, không sửa code màn hình). Hình dáng component sửa trong `src/components/ui/`.

## Thêm hoặc sửa component
1. Thêm file vào `template/src/components/ui/` (ví dụ `npx shadcn add <tên>` trong template)
   hoặc khối tự viết vào `template/src/components/blocks/` (chỉ ghép từ `ui/`, dùng token).
2. Thêm một mục vào `catalog/components.json` (name, category, summary, use_when,
   avoid_when, keywords có cả tiếng Việt, example, related).
3. Chạy `node scripts/catalog.mjs sync`: tự cập nhật exports/variants từ code, báo mục
   còn thiếu hoặc thừa.

## Aura component manager
Aura quản lý component của chính dự án: registry `.aura/` luôn khớp với code nhờ hook của agent.
```bash
node manager/aura.mjs init                       # trong repo dự án (monorepo: ở thư mục gốc): quét, tạo .aura/; --scripts để thêm script npm
node .aura/bin/aura.mjs find "ô nhập liệu"       # component phù hợp trong dự án
node .aura/bin/aura.mjs show Button              # props, variant, mô tả, đường import, nơi đang dùng
node .aura/bin/aura.mjs tokens                   # màu, font, token trạng thái (cái nào dùng làm chữ được)
node .aura/bin/aura.mjs check --changed          # kiểm tra file đã đổi (dùng cho pre-commit/CI)
node .aura/bin/aura.mjs stats                    # số finding theo rule: mới / có sẵn
node .aura/bin/aura.mjs doctor                   # Aura chưa nhận ra gì ở repo này, sửa bằng key nào
node .aura/bin/aura.mjs inspect http://localhost:5173 /orders   # xem trang đã render ở 1440/768/390, báo lỗi bằng chữ
node .aura/bin/aura.mjs describe --from mo-ta.json   # mô tả nhiều component một lần
```

**Kiểm tra trang đã dựng** (`aura inspect`, cần dev server và Playwright trong dự án): mở trang headless ở
1440/768/390, in dàn ý trang (khối nào nằm trong màn đầu) và báo bằng chữ: tràn ngang, chồng lấn, chữ bị cắt,
thẻ cao lệch; số KPI chưa nổi bật hoặc đang báo "quá hạn" mà vẫn xám; trạng thái cùng một màu xám; tương phản
dưới WCAG AA; tỉ lệ nội dung có màu quá thấp; cùng một thông tin lặp ở nhiều khối; nhiều nút primary, nút Xóa/Hủy
không có màu destructive, nút trông như bị tắt. Agent sửa theo báo cáo thay vì tự nhìn ảnh chụp; hook Stop nhắc
một lần nếu đã sửa UI mà chưa inspect. Ngưỡng và mức độ chỉnh trong `.aura/rules.json` (`"inspect": {…}`).

**Monorepo** (Turborepo, Nx, pnpm/bun/yarn workspaces): init ở thư mục gốc. Một `.aura/` quản lý mọi app và
package; package có `components.json` (vd. `packages/ui`) là nguồn primitive; hiểu alias tsconfig, `#imports`
của package.json và `exports` của workspace package; đếm lượt dùng trên toàn bộ app; in đường import công khai
(`@acme/ui/components/button`) kèm đường nội bộ (`#components/button`); đọc token theo `@import` sang package khác.

**Repo bất kỳ:** Aura tự nhận Next/Vite/Remix/CRA/Nx/Vue/Svelte, workspace npm/pnpm/yarn/bun, alias tsconfig
(`paths`, `baseUrl`, `extends`), `#imports`/`exports` (kể cả `dist/` → `src/`), barrel `index.ts`, package `ui`/
`design-system`, thư viện UI dùng trực tiếp (antd, MUI, Chakra, Mantine, Headless UI… thì component của thư viện
là primitive), Tailwind v3 (config/preset ở bất kỳ đâu, màu lồng nhau), Tailwind v4 `@theme`, theme viết bằng code.
Cái gì không nhận ra được thì `aura doctor` liệt kê kèm cách sửa; skill `init` hướng dẫn agent tự chỉnh.
Đã thử trên: turbo-web, starter aura, cal.com, dub, taxonomy, next-template, vercel/commerce, ant-design-pro,
chakra-ui-docs, horizon-ui, mui/toolpad, nx-examples, một dự án Vue/shadcn-vue.

Registry mặc định chỉ chứa **viên gạch để build**: primitive, block dùng chung cạnh nó, component của thư viện UI.
Component riêng của từng app không vào `find` và không cần mô tả, nhưng vẫn được hook kiểm tra (`"scope": "all"`
để đưa cả vào).

Tuỳ chỉnh trong `.aura/rules.json`: `scope`, `includeDirs`, `rules` (mức độ), `allowUiLibraries`, `primitivesDir`, `tokenFiles`,
`cli: "local"` (hook chạy `.aura/bin` thay cho bản trong plugin).

Hook (khai báo trong `hooks/hooks.json`, chỉ hoạt động ở repo có `.aura/`):
- **SessionStart:** làm mới registry và đưa tóm tắt design system vào ngữ cảnh agent.
- **PostToolUse (Write/Edit):** cập nhật registry, kiểm tra file; **chặn** component trùng, tự vẽ `<button>`/`<input>`
  khi đã có linh kiện, token màu không tồn tại, thư viện UI lạ. Lỗi có sẵn từ trước (baseline) không chặn.
- **PostToolUse (Bash):** phát hiện file component bị xoá/di chuyển, cập nhật registry.
- **Stop:** không cho agent kết thúc khi còn lỗi hoặc component mới chưa có mô tả (`aura describe`).
- **Hook gắn với skill** (`build`, `find`, chạy một lần): ở repo giao diện chưa có `.aura/`, nhắc agent đề xuất `/aura-ui:init` với người dùng.

Commit `.aura/` (registry, profile, rules, baseline, bin) để cả team và CI dùng chung; `.aura/cache` được bỏ qua.
