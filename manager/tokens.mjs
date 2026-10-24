// Design tokens: CSS variables (:root, dark selector, @theme), Tailwind config colors, status/chart tokens with contrast.
import fs from 'node:fs'
import path from 'node:path'
import { read } from './context.mjs'

/** Bodies of rule blocks whose selector matches (brace-matched, so nested @keyframes or @media don't cut them short). */
const blocks = (src, selectorRe) => [...src.matchAll(new RegExp(`(?:^|[\\n};])\\s*(${selectorRe})\\s*\\{`, 'g'))].map((m) => {
  let depth = 1, i = m.index + m[0].length
  const start = i
  for (; i < src.length && depth; i++) depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0
  return src.slice(start, i - 1)
})
const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))

/**
 * Color names from `colors: { … }` / `backgroundColor`, `textColor`, `borderColor` of a JS Tailwind config or preset (v3).
 * Nested objects flatten (muted: { DEFAULT, foreground } → muted, muted-foreground); a key whose value isn't an
 * object literal (gray: colors.gray, brand: palette) becomes a prefix that allows any brand-* shade.
 */
function configColors(src) {
  const keys = new Set(), prefixes = new Set()
  const walkObj = (body, prefix) => {
    let i = 0
    while (i < body.length) {
      const m = body.slice(i).match(/^[\s,]*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*[\s,]*(?:(['"]?)([\w-]+|\d+)\1\s*:\s*|\.\.\.[^,}\n]*)/)
      if (!m || !m[0].trim()) { i++; continue }
      i += m[0].length
      if (!m[2]) continue // ...spread: unknown keys
      const name = m[2] === 'DEFAULT' ? prefix : prefix ? `${prefix}-${m[2]}` : m[2]
      if (body[i] === '{') {
        let depth = 1, j = i + 1
        for (; j < body.length && depth; j++) depth += body[j] === '{' ? 1 : body[j] === '}' ? -1 : 0
        if (name) keys.add(name)
        walkObj(body.slice(i + 1, j - 1), name)
        i = j
      } else {
        let depth = 0, j = i
        for (; j < body.length; j++) { const c = body[j]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; if (depth < 0 || (depth === 0 && c === ',')) break }
        const value = body.slice(i, j).trim()
        if (name) { keys.add(name); if (!/^['"`]|^(hsl|rgb|oklch|var|color-mix)\(/.test(value) && !/^\d/.test(value)) prefixes.add(name) }
        i = j
      }
    }
  }
  for (const m of src.matchAll(/\b(?:colors|backgroundColor|textColor|borderColor)\s*:\s*\{/g)) {
    let depth = 1, i = m.index + m[0].length
    const start = i
    for (; i < src.length && depth; i++) depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0
    walkObj(src.slice(start, i - 1), '')
  }
  return { keys: [...keys], prefixes: [...prefixes] }
}

/** Theme defined in code (CSS-in-JS libraries): files that call createTheme / extendTheme / createSystem / theme tokens. */
function themeFiles(ctx) {
  const re = /\b(createTheme|extendTheme|createSystem|defineConfig\(\s*\{[^}]*theme|createStitches|createVanillaExtract|createGlobalTheme|defineTokens|MantineProvider|ConfigProvider[^>]*theme=)/
  const demo = /(^|\/)(docs?|examples?|playground|demos?|stories|storybook|test|e2e)\//
  return ctx.walk(ctx.repo, ['.ts', '.tsx', '.js', '.jsx']).filter((f) => /theme|styles|tokens|provider|app\.|layout\.|main\.|_app/i.test(f) && re.test(read(f))).map(ctx.rel)
    .sort((a, b) => demo.test(a) - demo.test(b) || a.length - b.length).slice(0, 4)
}

// Tailwind itself and animation helpers define palette/utility variables, not the project's tokens.
const SKIP_IMPORT = /^(tailwindcss|tw-animate-css|tailwindcss-animate|@tailwindcss\/)/

/** Resolve a CSS @import: relative, workspace package (via exports), or a package in node_modules. */
function resolveCssImport(ctx, spec, fromFile) {
  if (/^(url\(|https?:)/.test(spec) || SKIP_IMPORT.test(spec)) return null
  const tryFile = (p) => [p, p + '.css', path.join(p, 'index.css')].find((c) => { try { return fs.statSync(c).isFile() } catch { return false } })
  if (spec.startsWith('.') || spec.startsWith('/')) return tryFile(path.resolve(path.dirname(fromFile), spec)) ?? null
  const ws = ctx.resolvePackageSpec?.(spec)
  if (ws) return tryFile(ws) ?? null
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
  for (let dir = path.dirname(fromFile); ; dir = path.dirname(dir)) {
    const pkgDir = path.join(dir, 'node_modules', name)
    if (fs.existsSync(pkgDir)) {
      const sub = spec.slice(name.length)
      if (sub) return tryFile(path.join(pkgDir, sub)) ?? null
      const pj = (() => { try { return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) } catch { return {} } })()
      const style = pj.style ?? (typeof pj.exports?.['.'] === 'object' ? pj.exports['.'].style : null)
      return style ? tryFile(path.join(pkgDir, style)) ?? null : null
    }
    if (dir === path.dirname(dir)) return null
  }
}

/** CSS files with tokens: tokenFiles from .aura/rules.json, or every .css in the repo, plus what they @import. */
function tokenCssFiles(ctx) {
  const start = ctx.config?.tokenFiles?.length
    ? ctx.config.tokenFiles.map((f) => path.resolve(ctx.repo, f)).filter((f) => fs.existsSync(f))
    : ctx.walk(ctx.repo, ['.css']).filter((f) => !/\.module\.css$/.test(f))
  const seen = new Set(), out = []
  const visit = (f) => {
    const real = fs.realpathSync(f)
    if (seen.has(real)) return
    seen.add(real)
    out.push(f)
    for (const m of read(f).matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) { const t = resolveCssImport(ctx, m[1], f); if (t) visit(t) }
  }
  start.forEach(visit)
  return out
}

export function scanTokens(ctx) {
  const cssFiles = tokenCssFiles(ctx)
  const t = { files: [], light: {}, dark: {}, theme: {}, darkSelector: null }
  for (const f of cssFiles) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '')
    const light = Object.assign({}, ...blocks(s, ':root').map(decls))
    // A rule block whose selector starts the line (not `@custom-variant dark (&:is(.dark *))`).
    const darkSel = s.match(/(?:^|\n)\s*((?:\.dark|\[data-theme=['"]?dark['"]?\]|\[data-mode=['"]?dark['"]?\]|:root\.dark|html\.dark|:root\[data-theme=['"]?dark['"]?\])[^{};()]*)\{/)
    const darkMatch = darkSel && [null, darkSel[1], blocks(s.slice(darkSel.index), darkSel[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))[0] ?? '']
    const theme = Object.assign({}, ...blocks(s, '@theme(?:\\s+inline)?').map(decls))
    if (!Object.keys(light).length && !Object.keys(theme).length) continue
    t.files.push(f.startsWith(ctx.repo + path.sep) ? ctx.rel(f) : f)
    Object.assign(t.light, light)
    Object.assign(t.theme, theme)
    if (darkMatch) { Object.assign(t.dark, decls(darkMatch[2])); t.darkSelector ??= darkMatch[1].trim().replace(/\s+/g, ' ') }
  }
  // Every Tailwind config and preset in the repo (monorepos keep them in a shared package), merged.
  const configs = ctx.walk(ctx.repo, ['.js', '.ts', '.cjs', '.mjs']).filter((f) => /(^|[\\/])tailwind[.-](config|preset)[\w.-]*\.[cm]?[jt]s$|[\\/]tailwind[\w-]*[\\/](preset|index|config)\.[cm]?[jt]s$/.test(f))
  const tailwindConfig = configs.length ? ctx.rel(configs.sort((a, b) => a.length - b.length)[0]) : null
  const fromConfig = configs.map((f) => configColors(read(f)))
  const colors = [...new Set([...Object.keys(t.theme).filter((k) => k.startsWith('--color-')).map((k) => k.slice(8)), ...fromConfig.flatMap((c) => c.keys)])].sort()
  const colorPrefixes = [...new Set(fromConfig.flatMap((c) => c.prefixes))].sort()
  const customUtilities = [...new Set(cssFiles.flatMap((f) => [...read(f).matchAll(/(?:^|[\s,}])\.((?:bg|text|border|ring|fill|stroke)-[\w-]+)\s*[{,:]|@utility\s+((?:bg|text|border|ring|fill|stroke)-[\w-]+)/g)].map((m) => m[1] ?? m[2])))]
  const fonts = Object.fromEntries(Object.entries(t.theme).filter(([k]) => k.startsWith('--font-')).map(([k, v]) => [k.slice(7), v]))

  const resolve = (v, depth = 0) => {
    const ref = v?.trim().match(/^var\((--[\w-]+)\)$/)
    return ref && depth < 5 ? resolve(t.light[ref[1]] ?? t.theme[ref[1]], depth + 1) : v
  }
  const bg = parseColor(resolve(t.light['--background']) ?? '#fff') ?? [1, 1, 1]
  const status = {}
  for (const [role, names] of Object.entries({ success: ['success'], warning: ['warning'], danger: ['destructive', 'error', 'danger'], info: ['info'] })) {
    const name = names.find((n) => t.light[`--${n}`] || colors.includes(n))
    if (!name) { status[role] = { token: null }; continue }
    const c = parseColor(resolve(t.light[`--${name}`]))
    const ratio = c ? Math.round(contrast(c, bg) * 100) / 100 : null
    // A text-safe companion, e.g. --success-foreground used as text on tinted backgrounds.
    const fg = [`${name}-foreground`, `${name}-text`].find((n) => colors.includes(n) && parseColor(resolve(t.light[`--${n}`])) && contrast(parseColor(resolve(t.light[`--${n}`])), bg) >= 4.5)
    status[role] = { token: name, contrastOnBackground: ratio, textSafe: ratio === null ? null : ratio >= 4.5, textToken: ratio !== null && ratio >= 4.5 ? name : fg ?? null }
  }
  return {
    files: t.files,
    tailwindConfig,
    tailwindConfigs: configs.map((f) => ctx.rel(f)),
    colorPrefixes,
    themeFiles: themeFiles(ctx),
    darkSelector: t.darkSelector,
    colors,
    customUtilities,
    fonts,
    radius: t.light['--radius'] ?? t.theme['--radius'] ?? null,
    status,
    chartTokens: [1, 2, 3, 4, 5].filter((i) => t.light[`--chart-${i}`]).length,
    mtimes: Object.fromEntries([...cssFiles, ...configs].map((f) => [path.relative(ctx.repo, f), fs.statSync(f).mtimeMs])),
  }
}

// ---------- color math (oklch / hsl / rgb / hex → linear sRGB → WCAG contrast) ----------
export function parseColor(v) {
  if (!v) return null
  v = v.trim()
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
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
