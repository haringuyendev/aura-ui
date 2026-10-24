// Rules run on component files (by the post-edit hook, the stop hook and `aura check`).
import fs from 'node:fs'
import path from 'node:path'
import { UI_LIB_IMPORTS, read } from './context.mjs'
import { packageImports } from './components.mjs'

export const DEFAULT_RULES = {
  'undefined-token': 'error',
  'foreign-ui-library': 'error',
  'duplicate-component': 'error',
  'bypasses-primitive': 'error',
  'raw-color': 'warn',
  'status-text-unsafe': 'warn',
  'img-alt': 'warn',
  'icon-button-label': 'warn',
  'undescribed-component': 'info',
}
export const loadRules = (ctx) => {
  try { return { ...DEFAULT_RULES, ...JSON.parse(fs.readFileSync(path.join(ctx.auraDir, 'rules.json'), 'utf8')).rules } } catch { return DEFAULT_RULES }
}

const PALETTE = /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|placeholder|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\b(?:bg|text|border)-\[#[0-9a-fA-F]{3,8}\]|\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)\b/g
const BUILTIN = new Set(['transparent', 'current', 'inherit', 'white', 'black', 'none'])
const NOT_COLOR = /^(xs|sm|base|md|lg|xl|\d?xl|\d+(\.\d+)?|px|left|right|center|justify|start|end|top|bottom|clip|wrap|nowrap|balance|pretty|ellipsis|solid|dashed|dotted|double|hidden|collapse|separate|x|y|t|b|l|r|s|e|opacity|offset|inset|gradient|linear|radial|conic|cover|contain|auto|fixed|local|scroll|repeat|no|origin|blend|none|underline|overline|line|through|lowercase|uppercase|capitalize|normal|italic|thin|light|medium|semibold|bold|extrabold|clip|text|padding|content|border|box|spacing|decoration|current|inherit)$/
const lineOf = (src, index) => src.slice(0, index).split('\n').length
/** Blank out comments and module specifiers (same length, newlines kept) so class checks ignore "text-field.tsx" in a comment or import. */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\w])\/\/[^\n]*|\b(?:from|import)\s*\(?\s*['"][^'"\n]*['"]/g, (m) => m.replace(/[^\n]/g, ' '))
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(component|comp|custom|new|base|wrapper|ui|v\d+)$/g, '')

/**
 * Check one file. `state` = { registry, tokens, rules, profile }, `isNew` = the file was just added.
 * Returns [{ rule, severity, line, message }].
 */
export function checkFile(ctx, state, abs, { isNew = false } = {}) {
  const src = read(abs)
  if (!src) return []
  const out = []
  const add = (rule, line, message) => state.rules[rule] && state.rules[rule] !== 'off' && out.push({ rule, severity: state.rules[rule], line, message })
  const relPath = ctx.rel(abs)
  // Inside the component's own package, use its local form (#components/x); elsewhere its public import.
  const importFrom = (c) => (c.importInPackage && c.package && ctx.packageOf(abs) === c.package ? c.importInPackage : c.import)
  const colors = new Set(state.tokens.colors)
  const prefixes = state.tokens.colorPrefixes ?? []
  // Without any known color tokens (CSS-in-JS theme, plain Tailwind palette) there is nothing to check against.
  const knowsTokens = colors.size > 0
  const custom = new Set(state.tokens.customUtilities)

  // undefined-token: bg-/text-/border-… classes naming a color the design system doesn't define
  const seen = new Set()
  const code = codeOnly(src)
  for (const m of code.matchAll(/(?<![\w-])(?:[\w-]+:)*(bg|text|border|ring|fill|stroke|outline|decoration|divide|from|via|to)-([a-z][a-z0-9-]*?)(?:\/\d+)?(?=["'`\s}])/g)) {
    const [whole, util, raw] = m
    // Side/offset sub-utilities carry the color after them: border-t-<c>, border-x-<c>, ring-offset-<c>, divide-x-<c>; bg-blend-* isn't a color.
    if (util === 'bg' && /^(blend|clip|origin|gradient|linear|radial|conic)(-|$)/.test(raw)) continue
    const name = raw.replace(util === 'ring' || util === 'outline' ? /^offset-/ : util === 'border' || util === 'divide' ? /^(?:[xytblrse]|block|inline)-/ : /^$/, '')
    const cls = whole.replace(/^(?:[\w-]+:)*/, '').replace(/\/\d+$/, '')
    if (!knowsTokens) break
    if (custom.has(cls) || BUILTIN.has(name) || colors.has(name) || NOT_COLOR.test(name) || prefixes.some((p) => name.startsWith(p + '-'))) continue
    if (name.split('-').every((p) => NOT_COLOR.test(p))) continue
    if (/^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+$/.test(name)) continue // raw palette: reported below
    if (seen.has(name)) continue
    seen.add(name)
    const near = [...colors].filter((c) => c.includes(name.split('-')[0])).slice(0, 4)
    add('undefined-token', lineOf(src, m.index), `"${cls}" uses color "${name}", which the design system doesn't define${near.length ? `; existing: ${near.join(', ')}` : ''}. Use an existing token or add --${name} to ${state.tokens.files[0] ?? 'the token file'} (light + dark + @theme).`)
  }

  // raw-color
  for (const m of code.matchAll(PALETTE)) add('raw-color', lineOf(src, m.index), `raw color class "${m[0]}". Use a semantic token (${['primary', 'muted-foreground', 'destructive'].filter((c) => colors.has(c)).join(', ') || 'see aura tokens'}).`)

  // foreign-ui-library
  for (const spec of packageImports(src)) {
    const lib = Object.entries(UI_LIB_IMPORTS).find(([prefix]) => spec === prefix || spec.startsWith(prefix))?.[1]
    if (lib && !ctx.usedUiLibs.has(lib) && !(state.allow ?? []).some((a) => spec === a || spec.startsWith(a.replace(/\/?$/, '/')) || a === lib)) add('foreign-ui-library', lineOf(src, src.indexOf(spec)), `imports "${spec}" (${lib}), a UI library this project doesn't use. Build it from the project's components (${state.profile?.components?.uiDir ?? 'components/ui'}).`)
  }

  // status-text-unsafe
  for (const [role, s] of Object.entries(state.tokens.status ?? {})) {
    if (!s.token || s.textSafe !== false) continue
    const m = src.match(new RegExp(`(?<![\\w-])text-${s.token}(?![\\w-])`))
    if (m) add('status-text-unsafe', lineOf(src, m.index), `"text-${s.token}" has ${s.contrastOnBackground}:1 contrast on the background (${role}). ${s.textToken ? `Use text-${s.textToken} for text` : `Use ${s.token} as a tint (bg-${s.token}/15) with text-foreground, or add a --${s.token}-foreground token`}.`)
  }

  // img-alt, icon-button-label
  for (const m of src.matchAll(/<(img|Image)\b(?![^>]*\balt=)[^>]*>/g)) add('img-alt', lineOf(src, m.index), `<${m[1]}> without alt text.`)
  for (const m of src.matchAll(/<Button\b(?=[^>]*size=["'{]?["']?icon)(?![^>]*aria-label)[^>]*>/g)) add('icon-button-label', lineOf(src, m.index), 'Icon-only <Button> without aria-label.')

  // bypasses-primitive: raw <button>/<input>/… outside components/ui when the project has that primitive
  const inUi = ctx.uiDir && abs.startsWith(ctx.uiDir + path.sep)
  if (!inUi) {
    const prims = new Map(state.registry.components.filter((c) => c.category === 'primitive').map((c) => [c.name.toLowerCase(), c]))
    // No own primitive? The UI library's component the project already uses (antd Button, MUI TextField, Chakra Modal…).
    const LIB_FOR = { button: ['Button'], input: ['Input', 'TextField', 'TextInput'], select: ['Select', 'NativeSelect'], textarea: ['Textarea', 'TextArea', 'Input'], dialog: ['Modal', 'Dialog'], table: ['Table', 'DataGrid', 'DataTable'] }
    const lib = state.registry.library ?? []
    for (const tag of ['button', 'input', 'select', 'textarea', 'dialog', 'table']) {
      const prim = prims.get(tag) ?? LIB_FOR[tag].map((n) => lib.filter((c) => c.name === n).sort((a, b) => b.usedBy - a.usedBy)[0]).find(Boolean)
      if (!prim) continue
      const hits = [...src.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))].filter((x) => !(tag === 'input' && /type=["'](hidden|file|checkbox|radio)["']/.test(x[1])))
      // one finding per occurrence, so the baseline can tell a new raw element from an old one
      for (const m of hits) add('bypasses-primitive', lineOf(src, m.index), `raw <${tag}> while the project has "${prim.name}" (${prim.category === 'library' ? prim.import : prim.path}, used in ${prim.usedBy} files). Use ${prim.exports[0]} from "${importFrom(prim)}"${Object.keys(prim.variants ?? {}).length ? ` (variants: ${Object.entries(prim.variants).map(([k, v]) => `${k}=${v.join('|')}`).join('; ')})` : ''}.`)
    }
  }

  // duplicate-component (new component files only)
  const self = state.registry.components.find((c) => c.path === relPath)
  if (isNew && self) {
    const others = state.registry.components.filter((c) => c.path !== relPath)
    const dupByName = others.find((c) => norm(c.name) && norm(c.name) === norm(self.name))
    const dupByExport = others.find((c) => c.exports.some((e) => self.exports.includes(e) && !['Component', 'default'].includes(e)))
    const dup = dupByName ?? dupByExport
    if (dup) add('duplicate-component', 1, `"${self.name}" duplicates the existing ${dup.category} "${dup.name}" (${dup.path}, used in ${dup.usedBy} files). Reuse it (import from "${importFrom(dup)}") or extend it with a variant instead of a second copy.`)
  }
  if (self && !self.described && (isNew || state.rules['undescribed-component'] === 'warn'))
    add('undescribed-component', 1, `"${self.name}" has no description in the registry. Run: aura describe ${self.name} --summary "…" --use "…" --avoid "…" --keywords "vi, en"`)
  return out
}

/**
 * Baseline: findings that existed when aura was added ({ [path]: { [rule]: count } }). Hooks block only
 * new violations, so editing an old file doesn't force unrelated fixes. Marks the first N per rule as existing.
 */
export function loadBaseline(ctx) {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.auraDir, 'baseline.json'), 'utf8')).files ?? {} } catch { return {} }
}
export function applyBaseline(relPath, findings, baseline) {
  const allowed = Object.fromEntries(Object.entries(baseline[relPath] ?? {}).map(([r, v]) => [r, typeof v === 'number' ? v : v.count]))
  return findings.map((f) => (allowed[f.rule] > 0 ? (allowed[f.rule]--, { ...f, existing: true }) : f))
}
export function snapshotBaseline(entries) {
  const files = {}
  for (const { file, findings } of entries)
    for (const f of findings) if (f.severity === 'error' || f.severity === 'warn') {
      const e = ((files[file] ??= {})[f.rule] ??= { count: 0, lines: [] })
      e.count++
      e.lines.push(f.line)
    }
  return { $comment: 'Findings present when aura was added; hooks only block new ones (matched by count per file and rule; lines are where they were). List them: aura check --existing. Refresh: aura baseline', files }
}

export const hasErrors = (findings) => findings.some((f) => f.severity === 'error' && !f.existing)
export function formatFindings(relPath, findings) {
  return findings.map((f) => `${relPath}:${f.line} [${f.existing ? 'existing' : f.severity}] ${f.rule}: ${f.message}`).join('\n')
}
