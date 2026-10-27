// Tools that write UI from the project's own primitives, so agents start from a correct structure instead of a blank file:
//   scaffold  a page skeleton (dashboard, list, detail, form) wired to the project's components, status variants and tokens
//   snippet   how to use a component: the import, its variants and real usages from the codebase
//   variant   a new cva variant for a primitive (a severity tone, an accent), in the project's own style
import fs from 'node:fs'
import path from 'node:path'

const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
const pascal = (s) => s.replace(/(^|[-_\s/])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[^\w]/g, '')
const camel = (s) => pascal(s).replace(/^./, (c) => c.toLowerCase())

/** Import specifier for component c from file abs: the package-local form inside its own package. */
export function importFor(ctx, c, abs) {
  return c.importInPackage && c.package && ctx.packageOf(abs) === c.package ? c.importInPackage : c.import
}

// ---------------- scaffold ----------------
export const SCAFFOLDS = ['dashboard', 'list', 'detail', 'form']

/**
 * Write a page skeleton. comps = registry components (+ library), tokens = r.tokens.
 * Returns { code, missing: [primitive names the skeleton would have used], notes }.
 */
export function scaffold(ctx, { comps, tokens }, kind, abs, name) {
  // blocks the scaffolds use besides primitives (other blocks are page sections, not controls)
  const BLOCKS = new Set(['date-field'])
  const find = (n) => comps.find((c) => c.name.toLowerCase() === n && (c.category !== 'section' || BLOCKS.has(n)))
  const used = new Map() // import spec → Set(names)
  const missing = new Set()
  const use = (prim, ...names) => {
    const c = find(prim)
    if (!c) { missing.add(prim); return false }
    const ok = names.filter((n) => c.exports.includes(n))
    if (ok.length < names.length) { missing.add(`${prim} (${names.filter((n) => !ok.includes(n)).join(', ')})`); if (!ok.length) return false }
    const spec = importFor(ctx, c, abs)
    if (!used.has(spec)) used.set(spec, new Set())
    ok.forEach((n) => used.get(spec).add(n))
    return ok.length === names.length
  }
  const badgeVariants = find('badge')?.variants?.variant ?? []
  const tone = (wanted, fallback) => wanted.find((v) => badgeVariants.includes(v)) ?? fallback
  const V = {
    bad: tone(['destructive'], 'outline'), warn: tone(['warning'], 'outline'), info: tone(['info', 'secondary'], 'outline'),
    good: tone(['success'], 'secondary'), neutral: tone(['secondary', 'outline'], 'outline'), done: tone(['outline', 'secondary'], 'outline'),
  }
  // A text color for a number that signals a problem (only if the token reads as text on the background).
  const st = tokens.status ?? {}
  const textFor = (role) => { const s = st[role]; return s?.token ? (s.textSafe === false ? (s.textToken ? `text-${s.textToken}` : null) : `text-${s.token}`) : null }
  const badText = textFor('destructive') ?? textFor('danger')
  const needsClient = /(^|\/)app\//.test(ctx.rel(abs)) && ctx.deps.next
  const Name = pascal(name || path.basename(abs).replace(/\.\w+$/, '')).replace(/Page$/, '') + 'Page'

  const hasButton = use('button', 'Button')
  const hasBadge = use('badge', 'Badge')
  const hasCard = use('card', 'Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent')
  const btn = (label, variant, extra = '') => hasButton ? `<Button${variant ? ` variant="${variant}"` : ''}${extra}>${label}</Button>` : `{/* TODO: Button */}`
  const badge = (inner, variantExpr) => hasBadge ? `<Badge variant={${variantExpr}}>${inner}</Badge>` : inner
  const card = (title, desc, body, action = '') => hasCard
    ? `<Card>\n        <CardHeader>\n          <CardTitle>${title}</CardTitle>\n          <CardDescription>${desc}</CardDescription>${action}\n        </CardHeader>\n        <CardContent>\n${body}\n        </CardContent>\n      </Card>`
    : `<section className="flex flex-col gap-3">\n        <h2 className="text-base font-semibold">${title}</h2>\n${body}\n      </section>`
  const header = (title, desc, actions) => `<header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">${title}</h1>
          <p className="text-muted-foreground text-sm">${desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">${actions}</div>
      </header>`

  const statusBlock = `// One map for every place a status is shown: bad outcomes red/amber, good green, neutral gray.
type Status = "qua-han" | "cho-duyet" | "dang-xu-ly" | "hoan-thanh" | "huy"
const STATUS: Record<Status, { label: string; variant: BadgeVariant }> = {
  "qua-han": { label: "Quá hạn", variant: "${V.bad}" },
  "cho-duyet": { label: "Chờ duyệt", variant: "${V.warn}" },
  "dang-xu-ly": { label: "Đang xử lý", variant: "${V.info}" },
  "hoan-thanh": { label: "Hoàn thành", variant: "${V.good}" },
  huy: { label: "Đã hủy", variant: "${V.done}" },
}`
  const badgeType = `type BadgeVariant = ${[...new Set(Object.values(V))].map((v) => `"${v}"`).join(' | ')}`
  const fmt = `const number = new Intl.NumberFormat("vi-VN")
const date = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })`
  const rows = `type Row = { id: string; name: string; owner: string; status: Status; amount: number; due: string }
// TODO: replace with real data
const ROWS: Row[] = [
  { id: "HS-1024", name: "Hồ sơ Nguyễn Văn An", owner: "BS. Trần Minh", status: "qua-han", amount: 12500000, due: "2026-10-20" },
  { id: "HS-1025", name: "Hồ sơ Lê Thị Bình", owner: "BS. Phạm Hà", status: "cho-duyet", amount: 8300000, due: "2026-10-27" },
  { id: "HS-1026", name: "Hồ sơ Hoàng Văn Cường", owner: "BS. Trần Minh", status: "dang-xu-ly", amount: 4100000, due: "2026-10-29" },
  { id: "HS-1027", name: "Hồ sơ Đỗ Thị Dung", owner: "BS. Vũ Lan", status: "hoan-thanh", amount: 15900000, due: "2026-10-18" },
]`
  const hasTable = use('table', 'Table', 'TableHeader', 'TableBody', 'TableRow', 'TableHead', 'TableCell')
  const table = (rowsExpr) => hasTable ? `          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Phụ trách</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Giá trị (₫)</TableHead>
                <TableHead className="text-right">Hạn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {${rowsExpr}.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.id}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.owner}</TableCell>
                  <TableCell>${badge('{STATUS[row.status].label}', 'STATUS[row.status].variant')}</TableCell>
                  <TableCell className="text-right tabular-nums">{number.format(row.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{date.format(new Date(row.due))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>` : `          {/* TODO: the project has no Table primitive; ask the user to add one (aura add table) */}`

  let body = '', top = '', imports = ''
  if (kind === 'dashboard') {
    const hasItem = use('item', 'ItemGroup', 'Item', 'ItemContent', 'ItemTitle', 'ItemDescription', 'ItemActions')
    const attention = hasItem ? `          <ItemGroup className="gap-2">
            {ATTENTION.map((a) => (
              <Item key={a.title} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>
                    ${badge('{LEVEL[a.level].label}', 'LEVEL[a.level].variant')}
                    {a.title}
                  </ItemTitle>
                  <ItemDescription>{a.detail}</ItemDescription>
                </ItemContent>
                <ItemActions>${btn('{a.action}', 'outline')}</ItemActions>
              </Item>
            ))}
          </ItemGroup>` : `          <ul className="flex flex-col gap-2">
            {ATTENTION.map((a) => (
              <li key={a.title} className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm">${badge('{LEVEL[a.level].label}', 'LEVEL[a.level].variant')} {a.title}</span>
                ${btn('{a.action}', 'outline')}
              </li>
            ))}
          </ul>`
    top = `${badgeType}
${statusBlock}
${fmt}

// 3–5 numbers that drive decisions. "exception" numbers turn red when above zero.
// TODO: replace with real data
const KPIS = [
  { label: "Quá hạn", value: 7, hint: "cần xử lý trong hôm nay", exception: true },
  { label: "Chờ duyệt", value: 18, hint: "trung bình chờ 1,5 ngày" },
  { label: "Đang xử lý", value: 42, hint: "+6 so với hôm qua" },
  { label: "Hoàn thành tháng này", value: 315, hint: "đạt 84% kế hoạch" },
]

const LEVEL = {
  critical: { label: "Khẩn", variant: "${V.bad}" as BadgeVariant },
  warning: { label: "Theo dõi", variant: "${V.warn}" as BadgeVariant },
}
// What needs action now. The page leads with this.
const ATTENTION: { level: keyof typeof LEVEL; title: string; detail: string; action: string }[] = [
  { level: "critical", title: "3 hồ sơ quá hạn duyệt", detail: "Quá hạn trung bình 2 ngày, ảnh hưởng lịch trả kết quả.", action: "Xem hồ sơ" },
  { level: "warning", title: "Phòng 2 sắp hết công suất", detail: "Đã xếp 9/10 ca cho ngày mai.", action: "Điều phối" },
]

${rows}`
    body = `      ${header('Tổng quan', 'TODO: ai dùng trang này và để quyết định gì', btn('Hành động chính'))}

      ${card('Cần xử lý', 'Những việc cần làm ngay, xếp theo mức độ.', attention)}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
          ${hasCard ? `<Card key={k.label}>
            <CardHeader>
              <CardDescription${badText ? ` className={k.exception && k.value > 0 ? "${badText}" : undefined}` : ''}>{k.label}</CardDescription>
              <CardTitle className={\`text-3xl font-semibold tabular-nums\${k.exception && k.value > 0 ? " ${badText ?? ''}" : ""}\`}>{number.format(k.value)}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">{k.hint}</CardContent>
          </Card>` : `<div key={k.label}>{k.label}: {number.format(k.value)}</div>`}
        ))}
      </section>

      ${card('Danh sách gần đây', 'Trạng thái dùng chung bảng màu STATUS.', table('ROWS'))}`
  } else if (kind === 'list') {
    const hasInput = use('input', 'Input')
    const hasEmpty = use('empty', 'Empty', 'EmptyHeader', 'EmptyTitle', 'EmptyDescription')
    imports = `import { useMemo, useState } from "react"\n`
    top = `${badgeType}
${statusBlock}
${fmt}

${rows}`
    const filters = `<div className="flex flex-wrap items-center gap-2">
          ${hasInput ? `<Input className="w-full sm:w-64" placeholder="Tìm theo mã hoặc tên…" value={query} onChange={(e) => setQuery(e.target.value)} />` : '{/* TODO: Input */}'}
          ${hasButton ? `<Button variant={status === "all" ? "secondary" : "ghost"} onClick={() => setStatus("all")}>Tất cả</Button>
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <Button key={s} variant={status === s ? "secondary" : "ghost"} onClick={() => setStatus(s)}>
              {STATUS[s].label}
            </Button>
          ))}` : ''}
        </div>`
    const empty = hasEmpty ? `<Empty>
              <EmptyHeader>
                <EmptyTitle>Không có kết quả</EmptyTitle>
                <EmptyDescription>Thử bỏ bớt bộ lọc hoặc tìm bằng từ khác.</EmptyDescription>
              </EmptyHeader>
            </Empty>` : `<p className="text-muted-foreground py-8 text-center text-sm">Không có kết quả.</p>`
    body = `      ${header('Danh sách', 'TODO: danh sách gì, ai xử lý', btn('Thêm mới'))}

      ${card('Tất cả', '{number.format(filtered.length)} kết quả', `        <div className="flex flex-col gap-4">
        ${filters}
          {filtered.length ? (
${table('filtered').replace(/^/gm, '  ')}
          ) : (
            ${empty}
          )}
        </div>`)}`
  } else if (kind === 'detail') {
    const hasItem = use('item', 'ItemGroup', 'Item', 'ItemContent', 'ItemTitle', 'ItemDescription')
    const hasAlert = use('alert', 'Alert', 'AlertTitle', 'AlertDescription')
    const alertVariant = (find('alert')?.variants?.variant ?? []).includes('warning') ? ' variant="warning"' : ''
    top = `${badgeType}
${statusBlock}
${fmt}

// TODO: replace with real data
const RECORD = { id: "HS-1024", name: "Hồ sơ Nguyễn Văn An", status: "cho-duyet" as Status, owner: "BS. Trần Minh", created: "2026-10-12", amount: 12500000 }
const FIELDS: [string, string][] = [
  ["Mã hồ sơ", RECORD.id],
  ["Phụ trách", RECORD.owner],
  ["Ngày tạo", date.format(new Date(RECORD.created))],
  ["Giá trị", \`\${number.format(RECORD.amount)} ₫\`],
]
const HISTORY = [
  { at: "2026-10-20", title: "Gửi duyệt", detail: "BS. Trần Minh gửi hồ sơ lên trưởng khoa." },
  { at: "2026-10-12", title: "Tạo hồ sơ", detail: "Tiếp nhận tại quầy 3." },
]`
    const history = hasItem ? `          <ItemGroup className="gap-2">
            {HISTORY.map((h) => (
              <Item key={h.at + h.title} size="sm">
                <ItemContent>
                  <ItemTitle>{h.title}</ItemTitle>
                  <ItemDescription>{date.format(new Date(h.at))} · {h.detail}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>` : `          <ol className="flex flex-col gap-2 text-sm">{HISTORY.map((h) => <li key={h.at + h.title}>{date.format(new Date(h.at))} · {h.title}</li>)}</ol>`
    body = `      ${header(`{RECORD.name}`, `{RECORD.id} · ${hasBadge ? '' : ''}cập nhật {date.format(new Date(HISTORY[0].at))}`, `${badge('{STATUS[RECORD.status].label}', 'STATUS[RECORD.status].variant')}
          ${btn('Từ chối', 'outline')}
          ${btn('Duyệt')}`)}
${hasAlert ? `
      <Alert${alertVariant}>
        <AlertTitle>Hồ sơ chờ duyệt 4 ngày</AlertTitle>
        <AlertDescription>TODO: điều người xem cần biết trước khi quyết định.</AlertDescription>
      </Alert>
` : ''}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          ${card('Thông tin chính', 'TODO: mô tả', `          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {FIELDS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>`)}
        </div>
        ${card('Lịch sử', 'Mới nhất ở trên.', history)}
      </div>`
  } else if (kind === 'form') {
    const hasField = use('field', 'Field', 'FieldLabel', 'FieldDescription')
    const hasLabel = !hasField && use('label', 'Label')
    const hasInput = use('input', 'Input')
    const hasTextarea = use('textarea', 'Textarea')
    const field = (id, label, control, desc = '') => hasField
      ? `<Field>\n              <FieldLabel htmlFor="${id}">${label}</FieldLabel>\n              ${control}${desc ? `\n              <FieldDescription>${desc}</FieldDescription>` : ''}\n            </Field>`
      : `<div className="flex flex-col gap-2">\n              ${hasLabel ? `<Label htmlFor="${id}">${label}</Label>` : `<label htmlFor="${id}" className="text-sm font-medium">${label}</label>`}\n              ${control}${desc ? `\n              <p className="text-muted-foreground text-xs">${desc}</p>` : ''}\n            </div>`
    const input = (id, extra = '') => hasInput ? `<Input id="${id}" name="${id}"${extra} />` : `{/* TODO: Input */}`
    // dates are picked on a calendar (typing stays possible): the starter's DateField, else the browser's date input
    const hasDateField = use('date-field', 'DateField')
    if (hasDateField) imports = `import { useState } from "react"\n`
    const dateControl = hasDateField ? '<DateField id="date" required value={date} onChange={setDate} />' : input('date', ' type="date" required')
    body = `      ${header('Tạo mới', 'TODO: biểu mẫu này dùng để làm gì', '')}

      ${card('Thông tin', 'Các trường có dấu * là bắt buộc.', `          <form className="flex max-w-2xl flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
            ${field('name', 'Họ và tên *', input('name', ' required autoComplete="name"'))}
            <div className="grid gap-5 sm:grid-cols-2">
              ${field('phone', 'Số điện thoại', input('phone', ' type="tel" inputMode="tel"'), 'Dùng để gửi thông báo kết quả.')}
              ${field('date', 'Ngày hẹn *', dateControl)}
            </div>
            ${field('note', 'Ghi chú', hasTextarea ? '<Textarea id="note" name="note" rows={4} />' : input('note'))}
            <div className="flex flex-wrap justify-end gap-2">
              ${btn('Hủy', 'outline', ' type="button"')}
              ${btn('Lưu', '', ' type="submit"')}
            </div>
          </form>`)}`
  } else throw new Error(`unknown scaffold "${kind}" (${SCAFFOLDS.join(', ')})`)

  const state = kind === 'form' && imports.includes('useState') ? `  const [date, setDate] = useState<Date>()

` : kind === 'list' ? `  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<Status | "all">("all")
  const filtered = useMemo(
    () => ROWS.filter((r) => (status === "all" || r.status === status) && \`\${r.id} \${r.name}\`.toLowerCase().includes(query.toLowerCase())),
    [query, status],
  )

` : ''
  // only what the page ended up using
  const usedIn = top + state + body
  const importLines = [...used].map(([spec, names]) => [spec, [...names].filter((n) => new RegExp(`\\b${n}\\b`).test(usedIn))]).filter(([, n]) => n.length).map(([spec, names]) => `import { ${names.join(', ')} } from "${spec}"`).join('\n')
  const code = `${needsClient || kind === 'list' && needsClient ? '"use client"\n\n' : ''}${imports}${importLines}

${top ? top + '\n\n' : ''}export function ${Name}() {
${state}  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
${body}
    </div>
  )
}
`
  const notes = []
  if (!badText && kind === 'dashboard') notes.push('No text-safe destructive token: exception KPIs are not colored; add a --destructive text token or show a Badge next to the number.')
  return { code: code.replace(/\n{3,}/g, '\n\n'), missing: [...missing], notes, Name }
}

// ---------------- snippet ----------------
/** How to use c: import line, variants, and up to 2 real usages from the codebase. */
export function snippet(ctx, c, from) {
  const lines = [`import { ${c.exports.slice(0, 8).join(', ')} } from "${from ? importFor(ctx, c, from) : c.import}"`]
  if (c.importInPackage && !from) lines.push(`// inside ${c.package}: "${c.importInPackage}"`)
  if (Object.keys(c.variants ?? {}).length) lines.push(`// ${Object.entries(c.variants).map(([k, v]) => `${k}: ${v.join(' | ')}`).join(' · ')}`)
  if (c.example) lines.push('', c.example)
  const root = c.exports.find((e) => /^[A-Z]/.test(e)) ?? c.exports[0]
  const real = []
  for (const file of c.usedIn ?? []) {
    if (real.length >= 2) break
    const src = read(path.join(ctx.repo, file))
    const i = src.search(new RegExp(`<${root}[\\s>]`))
    if (i < 0) continue
    const rest = src.slice(i)
    const close = rest.search(new RegExp(`</${root}>|/>`))
    const block = rest.slice(0, close < 0 ? 400 : Math.min(close + root.length + 3, 900)).split('\n').slice(0, 14)
    const indent = Math.min(...block.slice(1).filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length), 99)
    real.push(`// ${file}\n${[block[0], ...block.slice(1).map((l) => l.slice(indent === 99 ? 0 : Math.max(0, indent - 2)))].join('\n')}`)
  }
  if (real.length) lines.push('', ...real.flatMap((r) => [r, '']))
  else if (!c.example) {
    // Compound components: the usual shadcn nesting.
    const parts = (suffixes) => suffixes.map((s) => root + s).filter((n) => c.exports.includes(n))
    const head = parts(['Header']), inHead = parts(['Title', 'Description', 'Action'])
    const v = c.variants?.variant?.[0] ? ` variant="${c.variants.variant.find((x) => x !== 'default') ?? c.variants.variant[0]}"` : ''
    const inner = [
      ...parts(['Trigger']).map((n) => `  <${n}>…</${n}>`),
      ...(head.length ? [`  <${head[0]}>`, ...inHead.map((n) => `    <${n}>…</${n}>`), `  </${head[0]}>`] : inHead.map((n) => `  <${n}>…</${n}>`)),
      ...parts(['Content', 'Media', 'Footer', 'Actions']).map((n) => `  <${n}>…</${n}>`),
    ]
    lines.push('', inner.length ? `<${root}${v}>\n${inner.join('\n')}\n</${root}>` : `<${root}${v}>…</${root}>`)
  }
  return lines.join('\n').trimEnd()
}

// ---------------- variant ----------------
const TONE_OF = { critical: 'destructive', danger: 'destructive', error: 'destructive', destructive: 'destructive', warning: 'warning', caution: 'warning', success: 'success', positive: 'success', info: 'info', notice: 'info' }
const SURFACE = /^(item|card|alert|callout|banner|panel|tile)$/

/**
 * Add a variant to the cva of component c. opts: { name, tone, classes, prop = 'variant' }.
 * Returns { file, before, after, classes, usage } or throws with a reason.
 */
export function addVariant(ctx, c, tokens, opts) {
  const file = path.join(ctx.repo, c.path)
  const src = read(file)
  const cvas = [...src.matchAll(/const\s+(\w+)\s*=\s*cva\(/g)]
  if (!cvas.length) throw new Error(`${c.path} has no cva() call; add the variant by hand where its classes are defined`)
  const pick = cvas.find((m) => m[1].toLowerCase() === `${camel(c.name)}variants`.toLowerCase()) ?? cvas.find((m) => m[1].toLowerCase().startsWith(camel(c.name).toLowerCase())) ?? cvas[0]
  const prop = opts.prop ?? 'variant'
  const from = pick.index
  const vIdx = src.indexOf('variants:', from)
  const gm = new RegExp(`\\b${prop}\\s*:\\s*\\{`, 'g')
  gm.lastIndex = vIdx
  const g = gm.exec(src)
  if (vIdx < 0 || !g) throw new Error(`${pick[1]} has no "${prop}" variant group`)
  // end of the group
  let depth = 0, end = -1
  for (let i = g.index + g[0].length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) { end = i; break }
  }
  const group = src.slice(g.index, end)
  if (new RegExp(`(^|[\\s{,])["']?${opts.name}["']?\\s*:`).test(group)) throw new Error(`${pick[1]} already has ${prop}="${opts.name}"`)
  const tone = opts.tone ?? TONE_OF[opts.name]
  const colors = new Set(tokens.colors ?? [])
  let classes = opts.classes
  if (!classes) {
    if (!tone) throw new Error(`can't tell the tone of "${opts.name}": pass --tone <token> (e.g. destructive, warning) or --classes "…"`)
    if (colors.size && !colors.has(tone)) throw new Error(`the design system has no "${tone}" color (aura tokens lists them)`)
    // Reuse the group's own destructive entry as the pattern when there is one: same structure, new tone.
    const sib = group.match(/\bdestructive\s*:\s*\n?\s*(["'`])([^"'`]+)\1/)
    const textSafe = tokens.status ? Object.values(tokens.status).find((s) => s.token === tone) : null
    const textTok = textSafe?.textSafe === false ? textSafe.textToken ?? null : tone
    if (sib && tone !== 'destructive') classes = sib[2].replace(/destructive/g, tone)
    else if (SURFACE.test(c.name)) classes = `border-l-4 border-l-${tone} bg-${tone}/5`
    else if (c.name === 'button') classes = `bg-${tone} text-${tone}-foreground hover:bg-${tone}/90`
    else classes = `bg-${tone}/10 ${textTok ? `text-${textTok}` : 'text-foreground'} border-transparent`
  }
  // indentation of the group's entries
  const entryIndent = group.match(/\n(\s+)["'\w-]+\s*:/)?.[1] ?? '        '
  const closeIndent = src.slice(src.lastIndexOf('\n', end) + 1, end)
  const before = src.slice(0, end).replace(/\s*$/, '')
  const sep = before.endsWith(',') || before.endsWith('{') ? '' : ','
  const key = /^[a-zA-Z_$][\w$]*$/.test(opts.name) ? opts.name : `"${opts.name}"`
  const insert = `${sep}\n${entryIndent}${key}:\n${entryIndent}  "${classes}",\n${/^\s*$/.test(closeIndent) ? closeIndent : ''}`
  const after = before + insert + src.slice(end)
  const root = c.exports.find((e) => /^[A-Z]/.test(e)) ?? c.exports[0]
  return { file, cva: pick[1], src, after, classes, usage: `<${root} ${prop}="${opts.name}">…</${root}>` }
}
