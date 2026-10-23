#!/usr/bin/env node
// Profile an existing project's design system so the agent builds with *its* stack, tokens and components.
//   node scan-project.mjs [repo=.] [--out <dir>]   (default out: <repo>/.aura)
// Writes <out>/profile.json and <out>/components.json (catalog format, searchable with catalog.mjs --project),
// and prints a short summary to paste into the brief. Read-only on the repo itself.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outArg = outIdx >= 0 ? args[outIdx + 1] : undefined
const repo = path.resolve(args.find((a, i) => !a.startsWith('--') && i !== outIdx + 1) ?? '.')
const out = path.resolve(outArg ?? path.join(repo, '.aura'))
const rel = (p) => path.relative(repo, p)
const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
// JSON with comments and trailing commas (tsconfig), stripping comments outside strings only.
function stripJsonComments(src) {
  let outStr = '', inStr = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1]
    if (inStr) { outStr += c; if (c === '\\') outStr += src[++i] ?? ''; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; outStr += c; continue }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; outStr += '\n'; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue }
    outStr += c
  }
  return outStr.replace(/,(\s*[}\]])/g, '$1')
}
const readJson = (p) => { try { return JSON.parse(stripJsonComments(read(p))) } catch { return null } }
const IGNORE = /(^|\/)(node_modules|\.next|dist|build|out|coverage|\.git|\.turbo|\.vercel|public|playwright-report|test-results|\.pnpm-store|\.aura)(\/|$)/

function walk(dir, exts, acc = []) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (IGNORE.test(rel(p))) continue
    if (e.isDirectory()) walk(p, exts, acc)
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(p)
  }
  return acc
}

// ---------- stack ----------
const pkg = readJson(path.join(repo, 'package.json')) ?? {}
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
const has = (n) => Object.keys(deps).find((d) => d === n || d.startsWith(n))
const pick = (map) => Object.entries(map).filter(([, test]) => test()).map(([name]) => name)
const stack = {
  framework: pick({ 'next': () => deps.next, 'vite': () => deps.vite, 'remix': () => has('@remix-run'), 'astro': () => deps.astro, 'expo/react-native': () => deps['react-native'] }),
  react: deps.react ?? null,
  styling: pick({ [`tailwind ${deps.tailwindcss ?? ''}`.trim()]: () => deps.tailwindcss, 'css-modules': () => walk(path.join(repo, 'src'), ['.module.css', '.module.scss']).length, 'styled-components': () => deps['styled-components'], 'emotion': () => has('@emotion'), 'sass': () => deps.sass }),
  ui: pick({ 'shadcn (radix)': () => fs.existsSync(path.join(repo, 'components.json')) && has('@radix-ui'), 'shadcn (base-ui)': () => fs.existsSync(path.join(repo, 'components.json')) && deps['@base-ui/react'], 'radix': () => has('@radix-ui'), 'mui': () => has('@mui/material'), 'antd': () => deps.antd, 'chakra': () => has('@chakra-ui'), 'mantine': () => has('@mantine'), 'headlessui': () => has('@headlessui') }),
  icons: pick({ lucide: () => deps['lucide-react'], heroicons: () => has('@heroicons'), 'react-icons': () => deps['react-icons'], tabler: () => has('@tabler/icons') }),
  forms: pick({ 'react-hook-form': () => deps['react-hook-form'], formik: () => deps.formik, zod: () => deps.zod, yup: () => deps.yup }),
  data: pick({ 'tanstack-table': () => deps['@tanstack/react-table'], 'tanstack-query': () => deps['@tanstack/react-query'], swr: () => deps.swr, recharts: () => deps.recharts, 'chart.js': () => deps['chart.js'], echarts: () => has('echarts') }),
  dates: pick({ 'date-fns': () => deps['date-fns'], dayjs: () => deps.dayjs, moment: () => deps.moment, luxon: () => deps.luxon }),
  motion: pick({ 'framer-motion': () => deps['framer-motion'], motion: () => deps.motion }),
  cms: pick({ payload: () => deps.payload, sanity: () => has('sanity') || has('@sanity'), strapi: () => has('@strapi'), contentful: () => deps.contentful }),
  i18n: pick({ 'next-intl': () => deps['next-intl'], 'react-i18next': () => deps['react-i18next'], lingui: () => has('@lingui') }),
}
const shadcn = readJson(path.join(repo, 'components.json'))

// ---------- path aliases ----------
const tsconfig = readJson(path.join(repo, 'tsconfig.json')) ?? {}
const paths = tsconfig.compilerOptions?.paths ?? {}
const baseUrl = path.join(repo, tsconfig.compilerOptions?.baseUrl ?? '.')
function resolveAlias(spec) {
  for (const [k, [target]] of Object.entries(paths)) {
    const prefix = k.replace(/\*$/, '')
    if (spec.startsWith(prefix)) return path.join(baseUrl, target.replace(/\*$/, ''), spec.slice(prefix.length))
  }
  return null
}

// ---------- tokens ----------
const cssFiles = walk(repo, ['.css']).filter((f) => !/\.module\.css$/.test(f))
const blocks = (src, selectorRe) => [...src.matchAll(new RegExp(`(${selectorRe})\\s*\\{([^{}]*)\\}`, 'g'))].map((m) => m[2])
const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const tokens = { files: [], light: {}, dark: {}, theme: {}, darkSelector: null }
for (const f of cssFiles) {
  const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '')
  const light = Object.assign({}, ...blocks(s, ':root').map(decls))
  const darkMatch = s.match(/((?:\.dark|\[data-theme=['"]?dark['"]?\]|:root\.dark|html\.dark)[^{]*)\{([^{}]*)\}/)
  const theme = Object.assign({}, ...blocks(s, '@theme(?:\\s+inline)?').map(decls))
  if (!Object.keys(light).length && !Object.keys(theme).length) continue
  tokens.files.push(rel(f))
  Object.assign(tokens.light, light)
  Object.assign(tokens.theme, theme)
  if (darkMatch) { Object.assign(tokens.dark, decls(darkMatch[2])); tokens.darkSelector ??= darkMatch[1].trim().replace(/\s+/g, ' ') }
}
const tailwindConfig = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs'].find((f) => fs.existsSync(path.join(repo, f))) ?? null
// Color keys inside `colors: { … }` blocks of a JS Tailwind config (v3 style), nested one level (primary.DEFAULT → primary).
function configColorKeys(src) {
  const keys = []
  for (const m of src.matchAll(/\bcolors\s*:\s*\{/g)) {
    let depth = 1, i = m.index + m[0].length, start = i
    for (; i < src.length && depth; i++) depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0
    const body = src.slice(start, i - 1)
    let d = 0, token = ''
    for (const line of body.split('\n')) {
      const k = d === 0 && line.match(/^\s*['"]?([\w-]+)['"]?\s*:/)
      if (k && k[1] !== 'DEFAULT') keys.push(k[1])
      d += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      token = line
    }
    void token
  }
  return keys
}
const configColors = tailwindConfig ? configColorKeys(read(path.join(repo, tailwindConfig))) : []
// Hand-written utility classes in CSS (`.bg-media-overlay {…}`, `@utility bg-x {…}`) are valid, not undefined tokens.
const customUtilities = new Set(cssFiles.flatMap((f) => [...read(f).matchAll(/(?:^|[\s,}])\.((?:bg|text|border|ring|fill|stroke)-[\w-]+)\s*[{,:]|@utility\s+((?:bg|text|border|ring|fill|stroke)-[\w-]+)/g)].map((m) => m[1] ?? m[2])))
// Tailwind color names usable as bg-*/text-*: from @theme --color-*, plus config colors
const colorNames = new Set([...Object.keys(tokens.theme).filter((k) => k.startsWith('--color-')).map((k) => k.slice(8)), ...configColors])
const fonts = Object.fromEntries(Object.entries(tokens.theme).filter(([k]) => k.startsWith('--font-')).map(([k, v]) => [k.slice(7), v]))
const radius = tokens.light['--radius'] ?? tokens.theme['--radius'] ?? null

// ---------- color math (oklch / hsl / rgb / hex → contrast) ----------
function parseColor(v, depth = 0) {
  if (!v || depth > 5) return null
  v = v.trim()
  const ref = v.match(/^var\((--[\w-]+)\)$/)
  if (ref) return parseColor(tokens.light[ref[1]] ?? tokens.theme[ref[1]], depth + 1)
  let m
  if ((m = v.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?/i))) {
    const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]); const C = +m[2]; const h = (+m[3] * Math.PI) / 180
    const a = C * Math.cos(h), b = C * Math.sin(h)
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b
    const [l, mm, s] = [l_ ** 3, m_ ** 3, s_ ** 3]
    return [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s].map((x) => Math.min(1, Math.max(0, x)))
  }
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  if ((m = v.match(/^#([\da-f]{3}|[\da-f]{6})$/i))) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
    return [0, 2, 4].map((i) => toLin(parseInt(h.slice(i, i + 2), 16) / 255))
  }
  if ((m = v.match(/^(?:hsl\(\s*)?([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i))) {
    const [h, s, l] = [+m[1], +m[2] / 100, +m[3] / 100]
    const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
    return [f(0), f(8), f(4)].map(toLin)
  }
  if ((m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i))) return [m[1], m[2], m[3]].map((c) => toLin(+c / 255))
  return null
}
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const bg = parseColor(tokens.light['--background'] ?? '#fff') ?? [1, 1, 1]
const statusNames = { success: ['success'], warning: ['warning'], danger: ['destructive', 'error', 'danger'], info: ['info'] }
const status = {}
for (const [role, names] of Object.entries(statusNames)) {
  const name = names.find((n) => tokens.light[`--${n}`] || colorNames.has(n))
  if (!name) { status[role] = { token: null }; continue }
  const c = parseColor(tokens.light[`--${name}`])
  const ratio = c ? Math.round(contrast(c, bg) * 100) / 100 : null
  status[role] = { token: name, contrastOnBackground: ratio, textSafe: ratio === null ? null : ratio >= 4.5 }
}
const chartTokens = [1, 2, 3, 4, 5].filter((i) => tokens.light[`--chart-${i}`]).length

// ---------- components ----------
const srcRoot = fs.existsSync(path.join(repo, 'src')) ? path.join(repo, 'src') : repo
const uiAlias = shadcn?.aliases?.ui ?? (shadcn?.aliases?.components ? `${shadcn.aliases.components}/ui` : null)
const uiDir = (uiAlias && resolveAlias(uiAlias)) || [path.join(srcRoot, 'components', 'ui'), path.join(repo, 'components', 'ui')].find((d) => fs.existsSync(d)) || null
const sourceFiles = walk(srcRoot, ['.tsx', '.ts', '.jsx', '.js'])
const allSource = sourceFiles.map((f) => [f, read(f)])
const SECTION_DIR = /\/(blocks|heros|sections|features)\//
const componentFiles = allSource.filter(([f, s]) => /\.(tsx|jsx)$/.test(f) && (/\/components?\//.test(rel(f)) || SECTION_DIR.test('/' + rel(f))) && /export/.test(s))

function analyse([file, s]) {
  const exports = [...new Set([
    ...[...s.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Z]\w*)/gm)].map((m) => m[1]),
    ...[...s.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()).filter((x) => /^[A-Z]/.test(x))),
  ])]
  const variants = {}
  for (const v of s.matchAll(/variants:\s*\{([\s\S]*?)\n\s{2,4}\},?\n/g))
    for (const g of v[1].matchAll(/^\s+(\w+):\s*\{([\s\S]*?)^\s+\},?/gm)) variants[g[1]] = [...g[2].matchAll(/^\s+['"]?([\w-]+)['"]?\s*:/gm)].map((x) => x[1])
  const doc = (s.match(/\/\*\*\s*\n?\s*\*?\s*([^*\n][^\n]*)/) || [])[1]?.trim()
  const name = path.basename(file).replace(/\.(tsx|jsx)$/, '')
  const dir = path.basename(path.dirname(file))
  const id = name === 'index' || name === 'Component' ? dir : name
  return { file, id, exports, variants, doc }
}
const usage = (exportsList) => {
  if (!exportsList.length) return 0
  const re = new RegExp(`\\b(${exportsList.join('|')})\\b`)
  return allSource.filter(([, s]) => /^import /m.test(s) && re.test(s)).length - 1
}
const components = componentFiles.map(analyse).filter((c) => c.exports.length)
const words = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase()
const catalog = components.map((c) => {
  const isUi = uiDir && c.file.startsWith(uiDir)
  const isSection = !isUi && SECTION_DIR.test('/' + rel(c.file))
  const importPath = (() => {
    for (const [k, [target]] of Object.entries(paths)) {
      const base = path.join(baseUrl, target.replace(/\*$/, ''))
      if (c.file.startsWith(base)) return k.replace(/\*$/, '') + path.relative(base, c.file).replace(/\.(tsx|jsx)$/, '').replace(/\/(index|Component)$/, '')
    }
    return './' + rel(c.file)
  })()
  return {
    name: c.id,
    category: isUi ? 'primitive' : isSection ? 'section' : 'project',
    kind: 'project',
    summary: c.doc ?? `${c.exports.join(', ')} (${rel(c.file)})`,
    use_when: [],
    avoid_when: '',
    keywords: [words(c.id), ...c.exports.map(words)],
    example: '',
    related: [],
    import: importPath,
    path: rel(c.file),
    exports: c.exports,
    variants: c.variants,
    usedBy: usage(c.exports),
  }
}).sort((a, b) => { const o = { primitive: 0, project: 1, section: 2 }; return o[a.category] - o[b.category] || b.usedBy - a.usedBy })

// ---------- utilities & conventions ----------
const findFile = (re) => allSource.filter(([f, s]) => re.test(s)).map(([f]) => rel(f))
const utilities = {
  cn: findFile(/export function cn\(/)[0] ?? null,
  numberFormatting: findFile(/Intl\.NumberFormat|toLocaleString\(['"]vi/).slice(0, 5),
  dateFormatting: findFile(/Intl\.DateTimeFormat|from ['"](date-fns|dayjs)['"]/).slice(0, 5),
}
const conventions = []
if (fs.existsSync(path.join(srcRoot, 'app'))) conventions.push(`Next.js app router in ${rel(path.join(srcRoot, 'app'))}`)
if (stack.cms.includes('payload') && fs.existsSync(path.join(srcRoot, 'blocks')))
  conventions.push(`Payload CMS blocks: each page section is ${rel(path.join(srcRoot, 'blocks'))}/<Name>/ (config.ts + Component.tsx), rendered by RenderBlocks; new sections should be new blocks`)
for (const f of ['AGENTS.md', 'CLAUDE.md', 'docs/design.md', 'DESIGN.md']) if (fs.existsSync(path.join(repo, f))) conventions.push(`Read ${f} for project rules`)

// ---------- findings ----------
const PALETTE = /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|placeholder|caret|accent|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g
const BUILTIN = new Set(['transparent', 'current', 'inherit', 'white', 'black', 'none'])
const SIZE_OR_OTHER = /^(xs|sm|base|md|lg|xl|\d?xl|\d+|left|right|center|justify|start|end|top|bottom|clip|wrap|nowrap|balance|pretty|ellipsis|solid|dashed|dotted|double|hidden|collapse|separate|x|y|t|b|l|r|s|e|opacity|offset|inset|gradient|linear|radial|conic|cover|contain|auto|fixed|local|scroll|repeat|no|origin|blend|clip|none|underline|overline|line|through|lowercase|uppercase|capitalize|normal|italic|thin|light|medium|semibold|bold|extrabold|black)$/
const undefinedTokens = {}
const rawColors = []
for (const [f, s] of allSource) {
  if (!/\.(tsx|jsx)$/.test(f)) continue
  for (const m of s.matchAll(/\b(?:hover:|focus:|dark:|group-hover:|data-\[[^\]]+\]:)*(?:bg|text|border|ring|fill|stroke)-([a-z][a-z-]*?)(?:\/\d+)?(?=["'`\s])/g)) {
    const name = m[1]
    if (customUtilities.has(m[0].replace(/^.*?((?:bg|text|border|ring|fill|stroke)-)/, '$1').replace(/\/\d+$/, ''))) continue
    if (BUILTIN.has(name) || SIZE_OR_OTHER.test(name) || colorNames.has(name) || name.split('-').some((p) => SIZE_OR_OTHER.test(p) && !colorNames.has(name))) continue
    ;(undefinedTokens[name] ??= new Set()).add(rel(f))
  }
  const hits = (s.match(PALETTE) || []).length + (s.match(/className=[^>]*#[0-9a-f]{3,6}\b/gi) || []).length
  if (hits) rawColors.push([rel(f), hits])
}
const findings = []
for (const [name, files] of Object.entries(undefinedTokens)) findings.push(`Class uses undefined color token "${name}" in ${[...files].slice(0, 3).join(', ')}`)
for (const [role, s] of Object.entries(status)) {
  if (!s.token) findings.push(`No ${role} status token; add one in ${tokens.files[0] ?? 'the token file'} before using status colors`)
  else if (s.textSafe === false) findings.push(`Status token "${s.token}" has ${s.contrastOnBackground}:1 on the background: use it for tinted backgrounds/borders, not as text`)
}
if (!chartTokens) findings.push('No chart-1…5 tokens for data visualisation')
if (rawColors.length) findings.push(`Raw palette/hex colors in ${rawColors.length} component file(s), e.g. ${rawColors.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f} (${n})`).join(', ')}`)

// ---------- write ----------
const profile = {
  repo: path.basename(repo),
  scannedAt: new Date().toISOString(),
  stack: Object.fromEntries(Object.entries(stack).filter(([, v]) => (Array.isArray(v) ? v.length : v))),
  shadcn: shadcn && { style: shadcn.style, baseColor: shadcn.tailwind?.baseColor, css: shadcn.tailwind?.css, aliases: shadcn.aliases },
  tokens: {
    files: tokens.files,
    tailwindConfig,
    darkMode: tokens.darkSelector,
    colors: [...colorNames].sort(),
    radius,
    fonts,
    status,
    chartTokens,
  },
  components: { uiDir: uiDir && rel(uiDir), primitives: catalog.filter((c) => c.category === 'primitive').map((c) => c.name), project: catalog.filter((c) => c.category === 'project').length, sections: catalog.filter((c) => c.category === 'section' && /(blocks|heros|sections|features)\/[^/]+\/(Component|index)\.(tsx|jsx)$/.test(c.path)).map((c) => c.name).sort() },
  utilities,
  conventions,
  findings,
}
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'profile.json'), JSON.stringify(profile, null, 2) + '\n')
fs.writeFileSync(path.join(out, 'components.json'), JSON.stringify(catalog, null, 2) + '\n')

const list = (a) => (a?.length ? a.join(', ') : '—')
console.log(`# Design system profile: ${profile.repo}
Stack: ${list(stack.framework)} · React ${stack.react ?? '?'} · ${list(stack.styling)} · UI: ${list(stack.ui)} · icons: ${list(stack.icons)}
Forms/data: ${list([...stack.forms, ...stack.data])} · dates: ${list(stack.dates)} · motion: ${list(stack.motion)}${stack.cms.length ? ` · CMS: ${list(stack.cms)}` : ''}
Tokens: ${list(tokens.files)}${tailwindConfig ? ` + ${tailwindConfig}` : ''} · dark: ${tokens.darkSelector ?? 'none'} · radius ${radius ?? '?'}
Colors: ${list([...colorNames].sort())}
Fonts: ${Object.entries(fonts).map(([k, v]) => `${k}=${v.split(',')[0]}`).join(', ') || '—'}
Status tokens: ${Object.entries(status).map(([r, s]) => `${r}=${s.token ?? 'missing'}${s.textSafe === false ? ' (bg only)' : ''}`).join(', ')} · chart tokens: ${chartTokens}/5
Components: ${profile.components.primitives.length} primitives in ${profile.components.uiDir ?? '?'} (${list(profile.components.primitives)}), ${profile.components.project} project components\nExisting sections: ${list(profile.components.sections)}
Utilities: cn=${utilities.cn ?? '—'} · number formatting in ${list(utilities.numberFormatting)}
Conventions:${conventions.map((c) => `\n- ${c}`).join('') || ' —'}
Findings:${findings.map((f) => `\n- ${f}`).join('') || ' none'}
Wrote ${rel(path.join(out, 'profile.json')).startsWith('..') ? path.join(out, 'profile.json') : rel(path.join(out, 'profile.json'))} and components.json`)
