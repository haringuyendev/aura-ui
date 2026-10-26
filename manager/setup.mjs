// aura setup: what this machine has for aura-ui (Node, npm, git, claude CLI, Playwright, Git Bash on Windows) and the
// command that installs each missing piece on this OS. Read-only: the aura-ui:setup skill asks the user before installing.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { isWindows, version, which } from './proc.mjs'

const mac = process.platform === 'darwin'
const onPath = (file) => !!file && (process.env.PATH ?? '').split(path.delimiter).some((d) => d && path.resolve(d) === path.dirname(file))

function install(tool) {
  const brew = mac && which('brew')
  return {
    node: isWindows ? 'powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/scripts/install-node.ps1"   (không cần admin)' : 'sh "<plugin>/scripts/install-node.sh"   (không cần admin)',
    git: isWindows ? 'winget install Git.Git' : brew ? 'brew install git' : mac ? 'xcode-select --install' : 'sudo apt install git (hoặc dnf/pacman tùy bản Linux)',
    claude: isWindows ? 'irm https://claude.ai/install.ps1 | iex   (PowerShell)' : 'curl -fsSL https://claude.ai/install.sh | bash',
    playwright: 'npm i -D playwright && npx playwright install chromium   (trong thư mục app; Studio có nút cài)',
    bash: 'winget install Git.Git   (kèm Git Bash: Claude Code dùng nó cho lệnh shell và hook)',
  }[tool]
}

/** [{ id, label, ok, detail, fix?, optional? }] */
export function checkSetup(ctx) {
  const items = []
  const nodeMajor = Number(process.versions.node.split('.')[0])
  items.push({ id: 'node', label: 'Node.js ≥ 20', ok: nodeMajor >= 20, detail: `v${process.versions.node} (${process.execPath})`, fix: nodeMajor >= 20 ? null : install('node') })
  // Node found but not on this session's PATH (Claude Desktop started from the Dock without nvm/volta/fnm in PATH):
  // hooks run "node …" and would fail. Fix: settings.json env.PATH with this folder first.
  const nodeOnPath = (process.env.PATH ?? '').split(path.delimiter).some((d) => d && (isWindows ? ['node.exe', 'node.cmd'] : ['node']).some((n) => fs.existsSync(path.join(d, n))))
  if (!nodeOnPath)
    items.push({ id: 'node-path', label: 'Node có trong PATH của phiên Claude', ok: false, detail: `${path.dirname(process.execPath)} chưa có trong PATH, nên hook "node …" của aura không chạy`, fix: isWindows
      ? `thêm ${path.dirname(process.execPath)} vào PATH của user: [Environment]::SetEnvironmentVariable('Path', '${path.dirname(process.execPath)};' + [Environment]::GetEnvironmentVariable('Path','User'), 'User')   rồi mở lại Claude Desktop`
      : `thêm dòng sau vào ~/.zprofile (bash: ~/.bash_profile): export PATH="${path.dirname(process.execPath)}:$PATH"  # aura-ui: Node.js   rồi mở lại Claude Desktop` })
  const npm = version('npm')
  items.push({ id: 'npm', label: 'npm', ok: !!npm, detail: npm ? `v${npm}` : 'không có', fix: npm ? null : install('node') })
  const git = version('git')
  items.push({ id: 'git', label: 'git', ok: !!git, optional: true, detail: git ?? 'không có (aura verify dùng git để biết file nào đã đổi)', fix: git ? null : install('git') })
  const claudeBin = which('claude')
  const claude = claudeBin && version('claude')
  items.push({ id: 'claude', label: 'Claude Code CLI (cho Aura Studio)', ok: !!claude, optional: true, detail: claude ? `${claude} (${claudeBin})${onPath(claudeBin) ? '' : ' — ngoài PATH, Studio vẫn tìm được'}` : 'không có: Studio cần lệnh claude (bản trong Claude Desktop không gọi từ ngoài được)', fix: claude ? null : install('claude') })
  if (isWindows) {
    const bash = which('bash') ?? ['C:\\Program Files\\Git\\bin\\bash.exe'].find((f) => fs.existsSync(f))
    items.push({ id: 'bash', label: 'Git Bash', ok: !!bash, optional: true, detail: bash ?? 'không có: Claude Code chạy lệnh và hook bằng PowerShell (aura vẫn chạy được)', fix: bash ? null : install('bash') })
  }
  if (ctx) {
    let pw = false
    for (const dir of [ctx.repo, ...ctx.workspaces.map((w) => path.join(ctx.repo, w.dir))])
      for (const name of ['playwright', '@playwright/test', 'playwright-core']) { try { createRequire(path.join(dir, 'package.json')).resolve(name); pw = true } catch {} }
    items.push({ id: 'playwright', label: 'Playwright (aura verify mở trang để kiểm tra)', ok: pw, optional: true, detail: pw ? 'có trong dự án' : 'chưa có: verify chỉ kiểm tra code', fix: pw ? null : install('playwright') })
  }
  return items
}

export function formatSetup(items) {
  const lines = [`aura setup (${os.type()} ${os.release()}, ${process.arch})`]
  for (const i of items) {
    lines.push(`${i.ok ? '✓' : i.optional ? '○' : '✗'} ${i.label}: ${i.detail}`)
    if (!i.ok && i.fix) lines.push(`    cài/sửa: ${i.fix}`)
  }
  const required = items.filter((i) => !i.ok && !i.optional)
  lines.push(required.length ? `\n${required.length} mục bắt buộc còn thiếu. Hỏi người dùng trước khi cài.` : '\nĐủ để chạy aura-ui.' + (items.some((i) => !i.ok) ? ' Mục ○ là tùy chọn.' : ''))
  return lines.join('\n')
}
