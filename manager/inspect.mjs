// Rendered-page review: open pages in a headless browser at several widths and report layout, KPI
// emphasis, data color, repeated content and button problems as text, so agents fix the UI from a
// report instead of judging screenshots.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export const INSPECT_RULES = {
  // 1. layout (checked at every width)
  'h-overflow': 'error',
  'overlap': 'warn',
  'clipped-text': 'warn',
  'uneven-row': 'warn',
  'blank-area': 'info',
  'tap-target': 'warn',
  // 2. key numbers
  'kpi-exception-neutral': 'error',
  'kpi-size': 'warn',
  'kpi-tabular': 'info',
  'zero-same-size': 'info',
  'too-many-kpis': 'warn',
  // 3. data color
  'status-monotone': 'error',
  'contrast': 'error',
  'meaning-neutral': 'warn',
  'low-data-color': 'warn',
  'decorative-tint': 'info',
  // 4. hierarchy
  'repeated-content': 'error',
  'urgent-below-fold': 'info',
  'crowded-fold': 'info',
  // 5. actions
  'multiple-primary': 'warn',
  'destructive-neutral': 'warn',
  'looks-disabled': 'warn',
  'row-actions': 'info',
  // page health
  'console-error': 'warn',
}
export const INSPECT_DEFAULTS = {
  widths: [1440, 768, 390], height: 900, wait: 600,
  kpiRatio: 1.7, minDataColor: 0.02, repeatSections: 3, unevenRow: 0.3, maxKpis: 5,
  maxPrimary: 1, tapTarget: 32, blankArea: 0.25, foldBlocks: 8,
}
const LAYOUT = new Set(['h-overflow', 'overlap', 'clipped-text', 'uneven-row', 'blank-area', 'tap-target'])

/** Playwright from the project (any workspace, Bun/pnpm stores), else null. */
export async function loadPlaywright(ctx) {
  const roots = [...new Set([ctx.repo, ...ctx.workspaces.map((w) => path.join(ctx.repo, w.dir)), process.cwd()])]
  const tryImport = async (file) => { try { const m = await import(pathToFileURL(file).href); return m.chromium ? m : m.default?.chromium ? m.default : null } catch { return null } }
  for (const name of ['playwright', '@playwright/test', 'playwright-core'])
    for (const root of roots) {
      let file
      try { file = createRequire(path.join(root, 'package.json')).resolve(name) } catch { continue }
      const m = await tryImport(file)
      if (m) return m
    }
  for (const store of ['.bun', '.pnpm']) {
    const dir = path.join(ctx.repo, 'node_modules', store)
    if (!fs.existsSync(dir)) continue
    for (const d of fs.readdirSync(dir).filter((x) => /^(playwright|playwright-core)@/.test(x)).sort().reverse()) {
      const name = d.split('@')[0], pkgDir = path.join(dir, d, 'node_modules', name)
      try { const m = await tryImport(createRequire(path.join(pkgDir, 'package.json')).resolve(pkgDir)); if (m) return m } catch {}
    }
  }
  return null
}

async function launch(pw) {
  try { return await pw.chromium.launch() } catch (e) {
    try { return await pw.chromium.launch({ channel: 'chrome' }) } catch {
      throw new Error(`Playwright is installed but has no browser. Run: npx playwright install chromium\n(${String(e.message).split('\n')[0]})`)
    }
  }
}

/** Resolve the page list: the first absolute URL (or inspect.baseUrl) is the base for later "/paths". */
export function resolveUrls(args, baseUrl) {
  let base = baseUrl
  const urls = []
  for (const a of args) {
    if (/^https?:\/\//.test(a)) { base ??= a; urls.push(a) }
    else if (base) urls.push(new URL(a, base).href)
    else throw new Error(`"${a}" is a path but there is no base URL. Pass a full URL first (aura inspect http://localhost:5173 ${a}) or set "inspect": { "baseUrl": "…" } in .aura/rules.json.`)
  }
  if (!urls.length && base) urls.push(base)
  return urls
}

export async function inspect(ctx, urls, opts = {}) {
  const cfg = { ...INSPECT_DEFAULTS, ...(ctx.config.inspect ?? {}), ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) }
  const pw = await loadPlaywright(ctx)
  if (!pw) throw new Error('Playwright is not installed in this project. Install it as a dev dependency (e.g. bun add -d playwright / npm i -D playwright), then: npx playwright install chromium')
  const browser = await launch(pw)
  const widths = [...cfg.widths].map(Number).sort((a, b) => b - a)
  const reports = []
  try {
    const context = await browser.newContext(cfg.storageState && fs.existsSync(path.resolve(ctx.repo, cfg.storageState)) ? { storageState: path.resolve(ctx.repo, cfg.storageState) } : {})
    for (const url of urls) {
      const page = await context.newPage()
      const consoleErrors = new Set()
      page.on('console', (m) => m.type() === 'error' && consoleErrors.add(m.text().split('\n')[0].slice(0, 160)))
      page.on('pageerror', (e) => consoleErrors.add(String(e.message).split('\n')[0].slice(0, 160)))
      const rep = { url, widths, findings: [], outline: {}, stats: null, shots: [] }
      for (const [i, width] of widths.entries()) {
        await page.setViewportSize({ width, height: cfg.height })
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => page.goto(url, { waitUntil: 'load', timeout: 20000 }))
        if (res && res.status() >= 400) rep.findings.push({ rule: 'console-error', message: `HTTP ${res.status()} for ${url}`, width })
        await page.waitForTimeout(cfg.wait)
        const out = await page.evaluate(collect, { cfg, content: i === 0 })
        for (const f of out.findings) if (i === 0 || LAYOUT.has(f.rule)) rep.findings.push({ ...f, width })
        rep.outline[width] = out.outline
        if (i === 0) rep.stats = out.stats
        if (opts.shot) {
          const dir = path.join(ctx.auraDir, 'cache', 'inspect')
          fs.mkdirSync(dir, { recursive: true })
          const file = path.join(dir, `${new URL(url).pathname.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'home'}-${width}.png`)
          await page.screenshot({ path: file, fullPage: true })
          rep.shots.push(ctx.rel(file))
        }
      }
      for (const e of consoleErrors) rep.findings.push({ rule: 'console-error', message: e })
      await page.close()
      reports.push(rep)
    }
  } finally { await browser.close() }
  return reports
}

export function formatReport(rep, rules) {
  const sev = (r) => rules[r] ?? INSPECT_RULES[r] ?? 'warn'
  const order = { error: 0, warn: 1, info: 2 }
  const findings = rep.findings.filter((f) => sev(f.rule) !== 'off').map((f) => ({ ...f, severity: sev(f.rule) }))
  // A layout problem seen at several widths is printed once with all of them.
  const merged = new Map()
  for (const f of findings) {
    const k = `${f.rule}|${f.message.replace(/\d+px/g, '#')}`
    const m = merged.get(k)
    if (m) { if (f.width && !m.at.includes(f.width)) m.at.push(f.width) } else merged.set(k, { ...f, at: LAYOUT.has(f.rule) && f.width ? [f.width] : [] })
  }
  const list = [...merged.values()].sort((a, b) => order[a.severity] - order[b.severity])
  const s = rep.stats
  const [wide, narrow] = [rep.widths[0], rep.widths.at(-1)]
  const outline = (w) => (rep.outline[w] ?? []).map((o) => `  ${o.fold ? '▲' : ' '} ${o.text}`).join('\n')
  const lines = [
    `aura inspect ${rep.url} · ${rep.widths.join(', ')}px`,
    s && `Body text ${s.body}px · data color ${(s.dataColor * 100).toFixed(1)}% of content · ${s.kpis} KPI value(s)${s.kpiSize ? ` (largest ${s.kpiSize}px, ${(s.kpiSize / s.body).toFixed(1)}×)` : ''} · ${s.chips} status chip(s) in ${s.chipColors} color(s)`,
    `Outline @${wide} (▲ = visible without scrolling):\n${outline(wide)}`,
    narrow !== wide && `Above the fold @${narrow}: ${(rep.outline[narrow] ?? []).filter((o) => o.fold).map((o) => o.text.replace(/^y=\d+\s*/, '')).join(' › ') || '—'}`,
    ...list.map((f) => `[${f.severity}] ${f.at.length ? `@${f.at.join('/')} ` : ''}${f.rule}: ${f.message}`),
    !list.length && 'No findings.',
    rep.shots.length && `Screenshots: ${rep.shots.join(', ')}`,
  ]
  return { text: lines.filter(Boolean).join('\n'), errors: list.filter((f) => f.severity === 'error').length, findings: list }
}

// Runs inside the page (serialized by Playwright): everything it needs is defined here.
function collect({ cfg, content }) {
  const W = innerWidth, H = innerHeight
  const findings = []
  const add = (rule, message) => findings.push({ rule, message })

  // ---- colors: any CSS color (oklch, color-mix…) → rgba through a 1px canvas
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const g = cv.getContext('2d', { willReadFrequently: true }), cache = new Map()
  const rgba = (str) => {
    if (!str) return { r: 0, g: 0, b: 0, a: 0 }
    let v = cache.get(str)
    if (v) return v
    g.clearRect(0, 0, 1, 1); g.fillStyle = 'rgba(0,0,0,0)'; g.fillStyle = str; g.fillRect(0, 0, 1, 1)
    const d = g.getImageData(0, 0, 1, 1).data
    v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
    cache.set(str, v)
    return v
  }
  const over = (f, b) => {
    const a = f.a + b.a * (1 - f.a)
    if (!a) return { r: 0, g: 0, b: 0, a: 0 }
    const mix = (x, y) => (x * f.a + y * b.a * (1 - f.a)) / a
    return { r: mix(f.r, b.r), g: mix(f.g, b.g), b: mix(f.b, b.b), a }
  }
  const chroma = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
  const colored = (c) => c.a >= 0.25 && chroma(c) >= 40
  const tint = (c) => c.a >= 0.04 && chroma(c) >= 30
  const hue = (c) => {
    const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), d = mx - mn
    if (!d) return -1
    const h = mx === c.r ? ((c.g - c.b) / d) % 6 : mx === c.g ? (c.b - c.r) / d + 2 : (c.r - c.g) / d + 4
    return (h * 60 + 360) % 360
  }
  const family = (c) => { const h = hue(c); return h < 0 ? 'neutral' : h < 20 || h >= 340 ? 'red' : h < 45 ? 'orange' : h < 70 ? 'amber' : h < 165 ? 'green' : h < 200 ? 'teal' : h < 255 ? 'blue' : h < 300 ? 'violet' : 'pink' }
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

  // ---- DOM helpers (memoized: computed styles are the slow part)
  const memo = (fn) => { const m = new Map(); return (el) => { if (m.has(el)) return m.get(el); const v = fn(el); m.set(el, v); return v } }
  const st = memo((el) => getComputedStyle(el))
  const bgOf = memo((el) => { if (!el || el.nodeType !== 1) return { r: 255, g: 255, b: 255, a: 1 }; const own = rgba(st(el).backgroundColor); return own.a >= 1 ? own : over(own, bgOf(el.parentElement)) })
  const opacity = memo((el) => (!el || el.nodeType !== 1 ? 1 : parseFloat(st(el).opacity) * opacity(el.parentElement)))
  const positioned = memo((el) => (!el || el === document.body ? false : ['absolute', 'fixed', 'sticky'].includes(st(el).position) || positioned(el.parentElement)))
  const bgImage = memo((el) => (!el || el === document.body ? false : /url\(/.test(st(el).backgroundImage) || bgImage(el.parentElement)))
  const rect = (el) => el.getBoundingClientRect()
  const pageY = (el) => rect(el).top + scrollY
  const own = memo((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim())
  const text = memo((el) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim())
  const short = (s, n = 40) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const desc = (el) => { const slot = el.dataset?.slot, t = short(text(el), 36); return `${el.tagName.toLowerCase()}${slot ? `[${slot}]` : ''}${t ? ` "${t}"` : ''}` }
  const chrome = (el) => el.closest('header,[role=banner],nav,footer,[role=contentinfo],[aria-label*="breadcrumb" i]')
  const visible = (el) => { const r = rect(el); if (r.width < 2 || r.height < 2) return false; const s = st(el); return s.visibility !== 'hidden' && opacity(el) > 0.05 && !el.closest('[aria-hidden="true"],[hidden],[inert]') }
  const INTERACTIVE = 'a[href],button,[role=button],input:not([type=hidden]),select,textarea,[role=tab],[role=checkbox],[role=switch],[role=combobox]'
  const all = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('script,style,noscript,template,svg'))
  const vis = all.filter(visible)
  const texts = vis.filter((el) => own(el))
  const sizes = texts.map((el) => parseFloat(st(el).fontSize)).sort((a, b) => a - b)
  const body = sizes[Math.floor(sizes.length / 2)] || 16

  // ---- blocks: card-like boxes (and tables); the outermost ones are the page's sections
  const isCard = (el) => {
    if (el.dataset?.slot === 'card') return true
    if (el.matches(`${INTERACTIVE},label,tr,td,th,thead,tbody`)) return false
    const r = rect(el)
    if (r.width < 120 || r.height < 48 || r.width > W * 0.98) return false
    const s = st(el)
    if ((parseFloat(s.borderTopLeftRadius) || 0) < 4) return false
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s[`border${k}Width`]) > 0 && rgba(s[`border${k}Color`]).a > 0.1)
    const bg = rgba(s.backgroundColor), pbg = bgOf(el.parentElement)
    return border || s.boxShadow !== 'none' || (bg.a > 0.5 && Math.abs(bg.r - pbg.r) + Math.abs(bg.g - pbg.g) + Math.abs(bg.b - pbg.b) > 6)
  }
  const cards = vis.filter(isCard), cardSet = new Set(cards)
  const cardOf = (el) => { for (let p = el.parentElement; p; p = p.parentElement) if (cardSet.has(p)) return p }
  const outer = cards.filter((c) => !cardOf(c) && !chrome(c))
  const tables = vis.filter((el) => el.tagName === 'TABLE' && !outer.some((o) => o.contains(el)) && !chrome(el))
  const sections = [...outer, ...tables].sort((a, b) => rect(a).top - rect(b).top || rect(a).left - rect(b).left)
  const sectionOf = (el) => sections.find((s) => s.contains(el))
  const label = (el) => {
    const h = [...el.querySelectorAll('h1,h2,h3,h4,h5,h6,[data-slot=card-title],th')].find(visible)
    if (h) return short(text(h))
    const t = [...el.querySelectorAll('*')].find((x) => own(x) && visible(x) && !/^[\d\s.,%]+$/.test(own(x)))
    return short(t ? own(t) : text(el))
  }
  // Boxes side by side: similar width, same top.
  const rowsOf = (els, tol = 6) => {
    const rows = []
    for (const el of [...els].sort((a, b) => rect(a).top - rect(b).top)) {
      const r = rect(el)
      const row = rows.find((x) => Math.abs(rect(x[0]).top - r.top) <= tol && !x.some((y) => y.contains(el) || el.contains(y)) && Math.max(rect(x[0]).width, r.width) / Math.min(rect(x[0]).width, r.width) <= 1.6)
      row ? row.push(el) : rows.push([el])
    }
    return rows.map((r) => r.sort((a, b) => rect(a).left - rect(b).left))
  }

  const BAD = /(quá hạn|trễ hạn|khẩn|vượt|lỗi|cảnh báo|nguy hiểm|thất bại|từ chối|chênh lệch|overdue|urgent|exceed|error|failed|critical|alert|breach|rejected)/i
  const exception = (t) => {
    const m = t.match(BAD)
    if (!m) return null
    const before = t.slice(0, m.index)
    return /(^|\s)0\s*$/.test(before) || /không\s*$/i.test(before) ? null : m[1]
  }

  // ================= 1. layout =================
  const docW = document.documentElement.scrollWidth
  if (docW > W + 1) {
    const clips = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(st(p).overflowX)) return true; return false }
    const culprits = vis.filter((el) => rect(el).right > W + 1 && !clips(el) && !(el.parentElement && el.parentElement !== document.body && rect(el.parentElement).right > W + 1))
    add('h-overflow', `page is ${docW}px wide in a ${W}px viewport (horizontal scroll). Widest: ${culprits.slice(0, 3).map(desc).join(', ') || 'unknown'}. Stack columns, wrap, or put wide tables in overflow-x-auto / a stacked list.`)
  }
  const tipped = (el) => el.closest('[title],[aria-describedby],[data-slot=tooltip-trigger],[data-tooltip]')
  const clipped = texts.filter((el) => {
    const s = st(el)
    const hides = /hidden|clip/.test(s.overflow + s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis' || +s.webkitLineClamp > 0
    return hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) && !tipped(el)
  })
  if (clipped.length) add('clipped-text', `${clipped.length} text(s) cut off with no title/tooltip: ${clipped.slice(0, 4).map(desc).join(', ')}. Let it wrap or give the full text in a title/Tooltip.`)

  const leaves = vis.filter((el) => (own(el) || el.matches('button,input,select,textarea,img,[role=button]')) && !positioned(el)).map((el) => ({ el, r: rect(el) })).sort((a, b) => a.r.top - b.r.top)
  const overlaps = []
  for (let i = 0; i < leaves.length && overlaps.length < 4; i++)
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j]
      if (b.r.top >= a.r.bottom - 4) break
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
      if (ix > 4 && iy > 4 && !a.el.contains(b.el) && !b.el.contains(a.el)) { overlaps.push(`${desc(a.el)} × ${desc(b.el)}`); break }
    }
  if (overlaps.length) add('overlap', `content overlaps: ${overlaps.join('; ')}. Check fixed widths/heights, negative margins and absolute positioning.`)

  for (const row of rowsOf(outer)) {
    if (row.length < 2) continue
    const hs = row.map((e) => Math.round(rect(e).height)), mx = Math.max(...hs), mn = Math.min(...hs)
    if ((mx - mn) / mx > cfg.unevenRow && mx - mn > 40) add('uneven-row', `cards side by side are ${hs.join('/')}px tall (${row.map(label).join(' | ')}), leaving blank space. Stretch them (h-full), balance their content, or let the short ones span less.`)
  }
  const boxes = vis.filter((el) => own(el) || el.matches('img,canvas,video,input,button,select,textarea')).map((el) => ({ y: pageY(el), b: pageY(el) + rect(el).height })).sort((a, b) => a.y - b.y)
  let bottom = boxes[0]?.y ?? 0
  for (const x of boxes) { if (x.y - bottom > H * cfg.blankArea) add('blank-area', `${Math.round(x.y - bottom)}px of empty space at y=${Math.round(bottom)}–${Math.round(x.y)}. Fill it, or tighten the layout.`); bottom = Math.max(bottom, x.b) }
  if (W <= 480) {
    const small = vis.filter((el) => el.matches(INTERACTIVE) && !chrome(el) && !(el.tagName === 'A' && el.closest('p'))).filter((el) => {
      const r = rect(el.closest('label') ?? el)
      return r.height < cfg.tapTarget || (!text(el) && r.width < cfg.tapTarget)
    })
    if (small.length) add('tap-target', `${small.length} control(s) smaller than ${cfg.tapTarget}px to tap: ${small.slice(0, 4).map(desc).join(', ')}. Use the default/lg size on mobile or enlarge the hit area.`)
  }

  // ================= content rules (widest viewport only) =================
  const chipsAll = vis.filter((el) => {
    if (el.dataset?.slot === 'badge') return true
    const t = text(el)
    if (!t || t.length > 32 || el.matches(INTERACTIVE) || el.children.length > 3) return false
    const s = st(el), r = rect(el)
    if (r.height > 30 || r.width > 260 || !s.display.startsWith('inline')) return false
    const bordered = parseFloat(s.borderTopWidth) > 0 && rgba(s.borderTopColor).a > 0.1
    return (parseFloat(s.borderTopLeftRadius) || 0) >= 4 && parseFloat(s.paddingLeft) >= 4 && (rgba(s.backgroundColor).a > 0.04 || bordered)
  })
  const chipSet = new Set(chipsAll)
  const chips = chipsAll.filter((c) => !chrome(c) && ![...chipSet].some((o) => o !== c && o.contains(c)))
  const chipSig = (el) => {
    const s = st(el), fg = rgba(s.color), bg = rgba(s.backgroundColor), bd = rgba(s.borderTopColor)
    return colored(fg) ? family(fg) : tint(bg) ? family(bg) : parseFloat(s.borderTopWidth) > 0 && colored(bd) ? family(bd) : 'neutral'
  }
  const kpis = []
  const stats = { body, dataColor: 0, kpis: 0, kpiSize: 0, chips: chips.length, chipColors: new Set(chips.map(chipSig)).size }
  const outline = []

  if (content) {
    // ================= 2. key numbers =================
    const NUM = /^[+\-−]?\d[\d.,\s]*%?$/
    for (const el of texts) {
      const t = own(el)
      if (!NUM.test(t) || t.length > 12 || el.closest('td,th,button,a,nav,header,footer,[role=row],label,option')) continue
      const card = cardOf(el)
      const s = st(el), fs = parseFloat(s.fontSize)
      if (!card || text(card).length > 400 || (fs < body * 1.15 && +s.fontWeight < 600)) continue
      const prev = kpis.find((k) => k.card === card)
      if (prev && prev.fs >= fs) continue
      if (prev) kpis.splice(kpis.indexOf(prev), 1)
      kpis.push({ el, card, fs, value: parseFloat(t.replace(/[^\d.\-]/g, '')), tab: s.fontVariantNumeric.includes('tabular-nums'), color: hex(rgba(s.color)) })
    }
    stats.kpis = kpis.length
    stats.kpiSize = Math.round(Math.max(0, ...kpis.map((k) => k.fs)))
    const smallKpi = kpis.filter((k) => k.fs / body < cfg.kpiRatio)
    if (smallKpi.length) add('kpi-size', `${smallKpi.length} KPI value(s) are not much bigger than body text (${smallKpi.slice(0, 4).map((k) => `"${label(k.card)}" ${Math.round(k.fs)}px`).join(', ')} vs ${body}px body): use text-2xl–3xl (≥ ${Math.ceil(body * cfg.kpiRatio)}px), font-semibold.`)
    const untab = kpis.filter((k) => !k.tab)
    if (untab.length) add('kpi-tabular', `${untab.length} KPI value(s) without tabular-nums (${untab.slice(0, 3).map((k) => `"${label(k.card)}"`).join(', ')}): add tabular-nums so digits line up.`)
    const quiet = kpis.filter((k) => {
      const s = st(k.card)
      const accent = ['Top', 'Right', 'Bottom', 'Left'].some((d) => parseFloat(s[`border${d}Width`]) > 0 && colored(rgba(s[`border${d}Color`]))) || tint(rgba(s.backgroundColor))
      return exception(text(k.card)) && !colored(rgba(st(k.el).color)) && !accent
    })
    if (quiet.length) add('kpi-exception-neutral', `${quiet.length} card(s) report an exception but their number and card stay neutral, so it is easy to miss: ${quiet.slice(0, 6).map((k) => `"${label(k.card)}" ${own(k.el)} (says "${exception(text(k.card))}")`).join(', ')}. Color the value (text-destructive / text-warning) or accent the card (e.g. border-l-4 border-l-destructive), keeping the words.`)
    for (const row of rowsOf(kpis.map((k) => k.card), 8)) {
      if (row.length > cfg.maxKpis) add('too-many-kpis', `${row.length} KPI cards in one row (${row.map(label).join(' | ')}): keep the ${cfg.maxKpis} that drive decisions; move the rest into a table or a secondary section.`)
      const ks = row.map((c) => kpis.find((k) => k.card === c))
      const zero = ks.filter((k) => k.value === 0), live = ks.filter((k) => k.value !== 0)
      for (const z of zero) if (live.some((l) => l.color === z.color && Math.abs(rect(l.card).height - rect(z.card).height) < 8)) add('zero-same-size', `"${label(z.card)}" shows 0 with the same weight as the non-zero cards next to it: mute the value (text-muted-foreground) or shrink/collapse empty cards so live work stands out.`)
    }

    // ================= 3. data color =================
    const tone = (t) => /hủy|huỷ|lỗi|từ chối|quá hạn|thất bại|không đủ|không đạt|cancel|error|reject|fail|overdue/i.test(t) ? 'destructive'
      : /^(chờ|đợi|cần|sắp|tạm|pending|waiting|due|on hold)/i.test(t) || /sắp hết|theo dõi/i.test(t) ? 'warning'
      : /^(đang|in progress|running|processing)/i.test(t) ? 'info'
      : /^(đã|hoàn|xong|thành công|đạt|done|completed|approved|success|active)/i.test(t) ? 'success'
      : /nháp|draft|^mới|^new/i.test(t) ? 'secondary/outline' : null
    const reported = new Set()
    const groups = new Map()
    for (const c of chips) {
      const td = c.closest('td')
      const key = td ? `${[...document.querySelectorAll('table')].indexOf(td.closest('table'))}:${td.cellIndex}` : 'page'
      if (!groups.has(key)) groups.set(key, { td, items: new Map() })
      const t = text(c).replace(/^\d+\s*/, '')
      groups.get(key).items.set(t, chipSig(c))
    }
    for (const { td, items } of groups.values()) {
      const neutral = [...items].filter(([, s]) => s === 'neutral').map(([t]) => t)
      if (items.size < 4 || neutral.length < 4 || neutral.length / items.size < 0.5) continue
      const head = td ? td.closest('table')?.querySelectorAll('th')[td.cellIndex] : null
      neutral.forEach((t) => reported.add(t))
      const map = neutral.map((t) => `${t} → ${tone(t) ?? '?'}`).join(' · ')
      add('status-monotone', `${items.size} statuses${head ? ` in column "${short(text(head))}"` : ''} but ${neutral.length} share one neutral style (${neutral.join(', ')}), so the status can't be read at a glance. Put every status in one STATUS_VARIANT map and give each a tone: ${map}. Keep the words.`)
    }
    const GOOD = /^(hoàn thành|đã duyệt|thành công|đạt|đã hoàn tất|completed|approved|success|passed)/i
    const BADWORD = /^(hủy|huỷ|đã hủy|lỗi|quá hạn|khẩn|từ chối|thất bại|không đạt|overdue|urgent|error|failed|rejected|cancelled)/i
    const neutralWords = new Map()
    for (const el of [...chips, ...texts.filter((x) => own(x).length <= 24 && !x.closest(`${INTERACTIVE},th,option,label`) && ![...chipSet].some((c) => c.contains(x)))]) {
      if (chrome(el)) continue
      const t = text(el)
      // A chip is a status by itself; a bare text only when it is just the word (not a label like "Hoàn thành hôm nay").
      const word = chipSet.has(el) ? t : t.replace(/[\s\d.,:()]+$/, '')
      if (!(GOOD.test(word) || BADWORD.test(word)) || reported.has(t) || (!chipSet.has(el) && word.split(' ').length > 3)) continue
      const neutral = chipSet.has(el) ? chipSig(el) === 'neutral' : !colored(rgba(st(el).color))
      if (neutral) neutralWords.set(t, (neutralWords.get(t) ?? 0) + 1)
    }
    if (neutralWords.size) add('meaning-neutral', `${[...neutralWords].slice(0, 6).map(([t, n]) => `"${short(t, 24)}"${n > 1 ? ` ×${n}` : ''}`).join(', ')} rendered in neutral gray: bad outcomes take destructive/warning, good ones success (tinted chip or colored text, with the words).`)

    let total = 0, tinted = 0
    for (const el of texts) {
      if (chrome(el) || el.closest(`${INTERACTIVE},label,option`)) continue
      const r = rect(el), area = r.width * r.height
      total += area
      let chip = el
      for (let i = 0; i < 3 && chip && !chipSet.has(chip); i++) chip = chip.parentElement
      if (colored(rgba(st(el).color)) || (chip && chipSet.has(chip) && chipSig(chip) !== 'neutral')) tinted += area
    }
    stats.dataColor = total ? tinted / total : 0
    if ((kpis.length || chips.length || tables.length) && stats.dataColor < cfg.minDataColor) add('low-data-color', `only ${(stats.dataColor * 100).toFixed(1)}% of the content carries color (links and buttons excluded): the page reads gray. Statuses, exceptions, deltas and the key numbers should use status/chart tokens.`)
    const decor = vis.filter((el) => !chrome(el) && !el.closest('tr') && !chipSet.has(el) && rect(el).width * rect(el).height >= W * H * 0.06 && (tint(rgba(st(el).backgroundColor)) || /gradient/.test(st(el).backgroundImage)) && !el.matches('button,a'))
    if (decor.length) add('decorative-tint', `${decor.length} large block(s) with tinted or gradient backgrounds (${decor.slice(0, 3).map(desc).join(', ')}): on a tool surfaces stay neutral; spend color on data and status.`)

    const low = new Map()
    for (const el of texts) {
      if (chrome(el) || el.closest(':disabled,[disabled],[aria-disabled=true],[data-disabled]') || el.matches('option') || bgImage(el)) continue
      const s = st(el), bg = bgOf(el), f0 = rgba(s.color)
      const fg = over({ ...f0, a: f0.a * opacity(el) }, bg)
      const ratio = contrast(fg, bg), fs = parseFloat(s.fontSize)
      const need = fs >= 24 || (fs >= 18.66 && +s.fontWeight >= 700) ? 3 : 4.5
      if (ratio >= need - 0.05) continue
      const k = `${hex(fg)} on ${hex(bg)}`
      const e = low.get(k) ?? { ratio, need, n: 0, ex: own(el) }
      e.n++
      low.set(k, e)
    }
    for (const [k, e] of [...low].sort((a, b) => b[1].n - a[1].n).slice(0, 5)) add('contrast', `text ${k} is ${e.ratio.toFixed(1)}:1 (needs ${e.need}:1): "${short(e.ex, 30)}"${e.n > 1 ? ` and ${e.n - 1} more` : ''}. Use the text-safe token (foreground on tints, the status color only when it passes).`)

    // ================= 4. hierarchy =================
    const norm = (t) => t.toLowerCase().replace(/\s+/g, ' ')
    const secText = new Map(sections.map((s) => [s, norm(text(s))]))
    const chipTexts = new Set(chips.map((c) => norm(text(c))))
    const frags = new Map()
    for (const el of texts) {
      if (!sectionOf(el) || el.closest(`${INTERACTIVE},th,label,option`) || [...chipSet].some((c) => c.contains(el))) continue
      for (const part of own(el).split(/\s*[—–|·•:;,]\s*|\s-\s/)) {
        const t = part.trim(), words = (t.match(/\p{L}+/gu) ?? []).length
        if (t.length < 8 || !words || (words < 2 && !/\d/.test(t))) continue
        if (!frags.has(norm(t)) && !chipTexts.has(norm(t))) frags.set(norm(t), t)
      }
    }
    // A fact counts when it is a block's title or a long sentence (names and codes recur across views by
    // nature), and only across different groups: a grid of similar cards repeating a label is fine.
    const group = new Map()
    rowsOf(sections).forEach((row, i) => row.forEach((s) => group.set(s, i)))
    const title = (s) => norm(label(s)).replace(/^[^\p{L}]+/u, '')
    const repeats = []
    for (const [key, t] of frags) {
      const secs = sections.filter((s) => secText.get(s).includes(key))
      const groups = new Set(secs.map((s) => group.get(s))).size
      const fact = t.length >= 40 || secs.some((s) => title(s) === key)
      if (fact && (groups >= cfg.repeatSections || (groups === 2 && t.length >= 40))) repeats.push({ key, t, secs })
    }
    repeats.sort((a, b) => b.secs.length - a.secs.length || b.t.length - a.t.length)
    const kept = []
    for (const r of repeats) if (!kept.some((k) => k.key.includes(r.key) && k.secs.length >= r.secs.length)) kept.push(r)
    if (kept.length) add('repeated-content', `${kept.length} fact(s) repeated across blocks: ${kept.slice(0, 5).map((r) => `"${short(r.t, 50)}" in ${r.secs.length} (${r.secs.map(label).join(' | ')})`).join('; ')}. Show each fact once (one signal per fact): keep it in the most actionable block, drop it or link to it from the others.`)

    const urgent = [...chips.filter((c) => tone(text(c)) === 'destructive' || BADWORD.test(text(c))), ...kpis.filter((k) => exception(text(k.card))).map((k) => k.card)]
    if (urgent.length && !urgent.some((u) => pageY(u) < H) && document.documentElement.scrollHeight > H * 1.2) add('urgent-below-fold', `exceptions (${urgent.slice(0, 3).map(desc).join(', ')}) only appear below the first screen: put what needs action first.`)

    // ================= 5. actions =================
    const buttons = vis.filter((el) => el.matches('button,[role=button],[data-slot=button]') && text(el) && !chrome(el))
    const solid = (el) => { const bg = rgba(st(el).backgroundColor); return bg.a > 0.8 && chroma(bg) >= 40 }
    const regions = new Map()
    for (const b of buttons.filter(solid)) {
      if (b.closest('[role=dialog],[role=alertdialog],dialog')) continue
      const sec = sectionOf(b) ?? null, k = `${sections.indexOf(sec)}|${family(rgba(st(b).backgroundColor))}`
      regions.set(k, [...(regions.get(k) ?? []), b])
    }
    for (const [k, list] of regions) {
      const sec = sections[+k.split('|')[0]]
      if (list.length > cfg.maxPrimary && !list.every((b) => b.closest('tr'))) add('multiple-primary', `${list.length} solid primary buttons in ${sec ? `"${label(sec)}"` : 'the page header area'} (${list.slice(0, 4).map((b) => `"${short(text(b), 20)}"`).join(', ')}): keep one primary per area, make the others outline/ghost.`)
    }
    const red = (el) => { const s = st(el); return [rgba(s.color), rgba(s.backgroundColor), rgba(s.borderTopColor)].some((c) => (colored(c) || tint(c)) && ['red', 'pink', 'orange'].includes(family(c))) }
    const destr = new Map()
    for (const b of buttons) {
      const t = text(b)
      if (!/^(xóa|xoá|hủy|huỷ|delete|remove|từ chối|reject|thu hồi|revoke)/i.test(t)) continue
      if (/^(hủy|huỷ|cancel)$/i.test(t) && b.closest('[role=dialog],[role=alertdialog],dialog,form')) continue
      if (!red(b) && !b.matches(':disabled,[aria-disabled=true]')) destr.set(t, (destr.get(t) ?? 0) + 1)
    }
    if (destr.size) add('destructive-neutral', `destructive action(s) look neutral: ${[...destr].map(([t, n]) => `"${short(t, 20)}"${n > 1 ? ` ×${n}` : ''}`).join(', ')}. Use the destructive variant (or ghost/outline with text-destructive) and confirm before acting.`)
    const faded = [], clear = []
    for (const b of vis.filter((el) => el.matches('button,[role=button],a[href]') && text(el) && !chrome(el))) {
      const s = st(b), disabled = b.matches(':disabled,[aria-disabled=true],[data-disabled]')
      if (!disabled && (opacity(b) < 0.6 || s.cursor === 'not-allowed' || s.pointerEvents === 'none')) faded.push(b)
      else if (disabled && opacity(b) >= 0.95 && s.cursor !== 'not-allowed' && contrast(over(rgba(s.color), bgOf(b)), bgOf(b)) >= 4.5) clear.push(b)
    }
    if (faded.length) add('looks-disabled', `${faded.length} enabled control(s) look disabled (faded or not-allowed cursor): ${faded.slice(0, 4).map(desc).join(', ')}. Give them their normal variant, or disable them for real and say why.`)
    if (clear.length) add('looks-disabled', `${clear.length} disabled control(s) look enabled: ${clear.slice(0, 4).map(desc).join(', ')}. Use the disabled style (opacity-50, cursor-not-allowed) and explain why in a tooltip.`)
    const busy = vis.filter((el) => el.matches('tr,[role=row]')).filter((tr) => [...tr.querySelectorAll('button,[role=button],a[data-slot=button]')].filter(visible).length >= 3)
    if (busy.length) add('row-actions', `${busy.length} row(s) carry 3+ action buttons (e.g. ${[...busy[0].querySelectorAll('button,[role=button],a[data-slot=button]')].filter(visible).map((b) => `"${short(text(b), 14)}"`).join(' · ')}): keep the main action on the row, move the rest into a ⋯ DropdownMenu.`)
  }

  // ---- outline: headings outside blocks, then blocks; cards side by side become one row
  const heads = vis.filter((el) => /^H[1-3]$/.test(el.tagName) && !sectionOf(el) && !chrome(el))
  const items = [...heads.map((el) => ({ el, head: true })), ...sections.map((el) => ({ el }))].sort((a, b) => pageY(a.el) - pageY(b.el) || rect(a.el).left - rect(b.el).left)
  for (const it of items) {
    const y = Math.round(pageY(it.el)), last = outline.at(-1)
    const kpi = kpis.find((k) => k.card === it.el)
    const name = it.head ? `# ${short(text(it.el), 50)}` : `${it.el.tagName === 'TABLE' ? 'table' : 'card'} "${label(it.el)}"${kpi ? ` ${own(kpi.el)}` : ''}`
    if (!it.head && last && !last.head && Math.abs(last.y - y) <= 8) { last.names.push(name); continue }
    outline.push({ y, head: it.head, names: [name], fold: y < H })
  }
  const outlineText = outline.map((o) => ({ fold: o.fold, text: `y=${o.y} ${o.names.length > 1 ? `${o.names.length} side by side: ${o.names.map((n) => n.replace(/^card /, '')).join(' | ')}` : o.names[0]}` }))
  if (content && outline.filter((o) => o.fold).reduce((n, o) => n + o.names.length, 0) > cfg.foldBlocks) add('crowded-fold', `${outline.filter((o) => o.fold).reduce((n, o) => n + o.names.length, 0)} blocks on the first screen: lead with the few that need action, group or collapse the rest.`)
  return { findings, outline: outlineText, stats }
}
