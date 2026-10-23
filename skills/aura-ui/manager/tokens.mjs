// Design tokens: CSS variables (:root, dark selector, @theme), Tailwind config colors, status/chart tokens with contrast.
import fs from 'node:fs'
import path from 'node:path'
import { read } from './context.mjs'

const blocks = (src, selectorRe) => [...src.matchAll(new RegExp(`(${selectorRe})\\s*\\{([^{}]*)\\}`, 'g'))].map((m) => m[2])
const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))

/** Color keys inside `colors: { … }` of a JS Tailwind config (v3 style); nested keys collapse to the parent. */
function configColorKeys(src) {
  const keys = []
  for (const m of src.matchAll(/\bcolors\s*:\s*\{/g)) {
    let depth = 1, i = m.index + m[0].length
    const start = i
    for (; i < src.length && depth; i++) depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0
    let d = 0
    for (const line of src.slice(start, i - 1).split('\n')) {
      const k = d === 0 && line.match(/^\s*['"]?([\w-]+)['"]?\s*:/)
      if (k && k[1] !== 'DEFAULT') keys.push(k[1])
      d += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
    }
  }
  return keys
}

export function scanTokens(ctx) {
  const cssFiles = ctx.walk(ctx.repo, ['.css']).filter((f) => !/\.module\.css$/.test(f))
  const t = { files: [], light: {}, dark: {}, theme: {}, darkSelector: null }
  for (const f of cssFiles) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '')
    const light = Object.assign({}, ...blocks(s, ':root').map(decls))
    // A rule block whose selector starts the line (not `@custom-variant dark (&:is(.dark *))`).
    const darkMatch = s.match(/(?:^|\n)\s*((?:\.dark|\[data-theme=['"]?dark['"]?\]|:root\.dark|html\.dark)[^{};()]*)\{([^{}]*)\}/)
    const theme = Object.assign({}, ...blocks(s, '@theme(?:\\s+inline)?').map(decls))
    if (!Object.keys(light).length && !Object.keys(theme).length) continue
    t.files.push(ctx.rel(f))
    Object.assign(t.light, light)
    Object.assign(t.theme, theme)
    if (darkMatch) { Object.assign(t.dark, decls(darkMatch[2])); t.darkSelector ??= darkMatch[1].trim().replace(/\s+/g, ' ') }
  }
  const tailwindConfig = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs'].find((f) => fs.existsSync(path.join(ctx.repo, f))) ?? null
  const configColors = tailwindConfig ? configColorKeys(read(path.join(ctx.repo, tailwindConfig))) : []
  const colors = [...new Set([...Object.keys(t.theme).filter((k) => k.startsWith('--color-')).map((k) => k.slice(8)), ...configColors])].sort()
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
    darkSelector: t.darkSelector,
    colors,
    customUtilities,
    fonts,
    radius: t.light['--radius'] ?? t.theme['--radius'] ?? null,
    status,
    chartTokens: [1, 2, 3, 4, 5].filter((i) => t.light[`--chart-${i}`]).length,
    mtimes: Object.fromEntries([...cssFiles, ...(tailwindConfig ? [path.join(ctx.repo, tailwindConfig)] : [])].map((f) => [ctx.rel(f), fs.statSync(f).mtimeMs])),
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
