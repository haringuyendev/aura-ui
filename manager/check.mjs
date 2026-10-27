// Rules run on component files (by the post-edit hook, the stop hook and `aura check`).
import fs from 'node:fs'
import path from 'node:path'
import { UI_LIB_IMPORTS, read } from './context.mjs'
import { analyseComponent, packageImports } from './components.mjs'

export const DEFAULT_RULES = {
  'undefined-token': 'error',
  'foreign-ui-library': 'error',
  'duplicate-component': 'error',
  'bypasses-primitive': 'error',
  'hand-built-surface': 'error',
  'date-without-picker': 'error',
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
const variantsOf = (c) => (Object.keys(c.variants ?? {}).length ? ` (variants: ${Object.entries(c.variants).map(([k, v]) => `${k}=${v.join('|')}`).join('; ')})` : '')

const STR = /(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g
const splitClasses = (s) => s.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter((c) => c && /^[!\w-]/.test(c) && !/[()]/.test(c))
/**
 * Class strings the file keeps outside JSX: object properties (LEVEL = { critical: { accent: "…" } }) and
 * string constants (const rowClass = "…"), so className={cn("…", level.accent)} is judged with what it can resolve to.
 */
function classSources(code) {
  const props = {}, consts = {}
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*(["'`])((?:(?!\2)[^\\\n]|\\.)*)\2/g)) (props[m[1]] ??= []).push(m[3])
  for (const m of code.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])((?:(?!\2)[^\\\n]|\\.)*)\2/g)) consts[m[1]] = m[3]
  return { props, consts }
}

/** JSX elements that can stand in for a container primitive, with the classes of their className: literals (inside cn()/clsx()/ternaries too) plus the map values and constants it references. */
function styledElements(code) {
  const out = []
  let sources
  for (const m of code.matchAll(/<(div|li|section|article|aside|span|p)\b/g)) {
    // walk to the end of the opening tag, skipping {…} and quoted text
    let i = m.index + m[0].length, depth = 0, q = null
    for (; i < code.length; i++) {
      const ch = code[i]
      if (q) { if (ch === q && code[i - 1] !== '\\') q = null; continue }
      if (ch === '"' || ch === "'" || ch === '`') q = ch
      else if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    const tag = code.slice(m.index, i)
    const at = tag.search(/\bclassName=/)
    if (at < 0) continue
    let v = tag.slice(at + 10)
    if (v[0] === '{') { let d = 0, j = 0; for (; j < v.length; j++) { if (v[j] === '{') d++; else if (v[j] === '}' && --d === 0) break } v = v.slice(0, j + 1) }
    else v = v.match(/^(["'])[^"']*\1/)?.[0] ?? ''
    const classes = [...v.matchAll(STR)].flatMap((x) => splitClasses(x[2]))
    // level.accent / LEVEL[x].accent / rowClass: add what those can hold (a primitive's own fooVariants() call is not ours to judge)
    const expr = v[0] === '{' ? v.replace(STR, ' ').replace(/\b\w+Variants\s*\([^)]*\)/g, ' ') : ''
    if (expr.trim()) {
      sources ??= classSources(code)
      for (const p of expr.matchAll(/\.([A-Za-z_$][\w$]*)\b(?!\s*\()/g)) for (const val of sources.props[p[1]] ?? []) classes.push(...splitClasses(val))
      for (const id of expr.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\b(?!\s*[(.[])/g)) if (sources.consts[id[1]] != null) classes.push(...splitClasses(sources.consts[id[1]]))
    }
    if (classes.length) out.push({ tag: m[1], index: m.index, classes: [...new Set(classes)] })
  }
  return out
}

const SURFACE_PRIMS = { accent: ['alert', 'item'], card: ['card', 'item'], row: ['item', 'card'], badge: ['badge'], separator: ['separator'], skeleton: ['skeleton'] }
const SURFACE_LABEL = { accent: 'a tinted/accented callout or row', card: 'a card', row: 'a list row', badge: 'a badge/chip', separator: 'a divider', skeleton: 'a loading placeholder' }
const TONE = /^(destructive|danger|error|critical|warning|warn|caution|success|positive|info|notice|primary|red|orange|amber|yellow|green|emerald|lime|teal|cyan|sky|blue|rose|pink)(-\d{2,3})?$/
/** Which primitive a set of classes imitates, or null. Only unprefixed classes count (hover:bg-… is an effect, not the surface). */
function surfaceKind(tag, all, colors) {
  const cls = all.filter((c) => !c.includes(':'))
  const has = (re) => cls.some((c) => re.test(c))
  const block = tag !== 'span' && tag !== 'p'
  const rounded = has(/^rounded(-(sm|md|lg|xl|2xl|3xl|full))?$/)
  const padded = has(/^(p|px|py|pl|pr|pt|pb)-(\d+(\.5)?|\[.+\])$/)
  const tile = has(/^(size|h|w)-\d/) && !has(/^(w|h)-(full|auto|fit|px)$/) // icon squares, dots, avatars
  const positioned = has(/^(absolute|fixed|sticky)$/)
  const scroller = has(/^(overflow(-[xy])?-(auto|scroll|hidden)|divide-[xy])$/)
  const tint = cls.map((c) => c.match(/^bg-([a-z][a-z-]*?)(?:-\d{2,3})?(?:\/\d+)?$/)?.[1]).filter(Boolean)
  const toneBg = cls.some((c) => { const m = c.match(/^bg-([a-z][a-z0-9-]*?)(\/\d+)?$/); return m && TONE.test(m[1]) && (m[2] || /-\d{2,3}$/.test(m[1])) && !/-(foreground)$/.test(m[1]) })
  const toneBorder = cls.some((c) => { const m = c.match(/^border(?:-[lrtbxyse])?-([a-z][a-z0-9-]*?)(\/\d+)?$/); return m && TONE.test(m[1]) })
  if (has(/^animate-pulse$/) && tint.length) return 'skeleton'
  if (positioned) return null // grid lines, stepper connectors, floating labels
  if (has(/^(h-px|w-px|h-0\.5)$/) && (tint.length || has(/^bg-linear/))) return 'separator'
  if (tile || has(/^border-dashed$/)) return null
  if (!block || (has(/^rounded-full$/) && has(/^inline-flex$/))) {
    if (rounded && has(/^px-(\d|\d\.5)$/) && has(/^text-(xs|sm|\[\d)/) && (tint.length || has(/^border$/))) return 'badge'
    return null
  }
  if (!rounded || !padded) return null
  if (has(/^border-l-(\d|\[)/) || toneBg || (toneBorder && has(/^border(-[lrtbxy])?$/))) return 'accent'
  if (scroller) return null
  const framed = has(/^border$/) || has(/^border-(border|input)$/) || has(/^shadow(-(xs|sm|md|lg|xl))?$/) || tint.some((t) => ['card', 'muted', 'background', 'popover', 'accent', 'secondary'].includes(t))
  if (!framed) return null
  return tag === 'li' ? 'row' : 'card'
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(component|comp|custom|new|base|wrapper|ui|v\d+)$/g, '')

/**
 * Check one file. `state` = { registry, tokens, rules, profile }, `isNew` = the file was just added.
 * Returns [{ rule, severity, line, message }].
 */
export function checkFile(ctx, state, abs, { isNew = false } = {}) {
  const src = read(abs)
  if (!src) return []
  const out = []
  const lines = src.split('\n')
  const ignored = (rule, line) => [lines[line - 1], lines[line - 2]].some((l) => l && new RegExp(`aura-ignore\\s+${rule}\\b`).test(l))
  const add = (rule, line, message) => state.rules[rule] && state.rules[rule] !== 'off' && !ignored(rule, line) && out.push({ rule, severity: state.rules[rule], line, message, key: findingKey(rule, message) })
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
      for (const m of hits) add('bypasses-primitive', lineOf(src, m.index), `raw <${tag}> while the project has "${prim.name}" (${prim.category === 'library' ? prim.import : prim.path}, used in ${prim.usedBy} files). Use ${prim.exports[0]} from "${importFrom(prim)}"${variantsOf(prim)}.`)
    }

    // date-without-picker: a date the user has to type (native <input type="date">, a text box with a DD/MM/YYYY
    // placeholder) while the project has a date field with a calendar. picker={false} is an explicit choice: not flagged.
    const blocks = new Map(state.registry.components.map((c) => [c.name.toLowerCase(), c]))
    const dateField = blocks.get('date-field'), rangeField = blocks.get('date-range-field') ?? blocks.get('date-range-picker'), datePicker = prims.get('date-picker')
    if ((dateField || datePicker) && !/(^|\/)date-[\w-]+\.tsx$/.test(relPath)) {
      const use = dateField
        ? `${dateField.exports.includes('DateField') ? 'DateField' : dateField.exports[0]} from "${importFrom(dateField)}" (calendar + typing)${rangeField ? `, or ${rangeField.exports[0]} from "${importFrom(rangeField)}" for a period` : ''}`
        : `${datePicker.exports.slice(0, 3).join(' / ')} from "${importFrom(datePicker)}"`
      for (const m of code.matchAll(/<(Input|input|InputGroupInput|TextField|MaskedField)\b([^>]*)>/g)) {
        const attrs = m[2]
        const native = /\btype=\{?["'](date|datetime-local)["']/.test(attrs)
        const typed = /placeholder=\{?["'`][^"'`]*\b(dd\s*\/\s*mm|DD\s*\/\s*MM|ngày\s*\/\s*tháng)/i.test(attrs)
        if (native || typed) add('date-without-picker', lineOf(src, m.index), `${native ? `<${m[1]} type="date">` : `<${m[1]}> with a DD/MM/YYYY placeholder`}: users must be able to pick a date from a calendar. Use ${use}.`)
      }
    }

    // hand-built-surface: a div/li/span styled into what Card, Item, Alert, Badge, Separator or Skeleton already is
    for (const el of styledElements(code)) {
      const kind = surfaceKind(el.tag, el.classes, colors)
      if (!kind) continue
      const want = SURFACE_PRIMS[kind].map((n) => prims.get(n)).filter(Boolean)
      if (!want.length) continue
      const use = want.map((p) => `${p.exports.slice(0, 5).join(' + ')} from "${importFrom(p)}"${variantsOf(p)}`).join(', or ')
      add('hand-built-surface', lineOf(src, el.index), `<${el.tag}> styled as ${SURFACE_LABEL[kind]} ("${el.classes.slice(0, 6).join(' ')}${el.classes.length > 6 ? ' …' : ''}"). Use ${use}. If the look you need (a severity tone, an accent bar) isn't a variant yet, add it to the primitive with cva instead of styling a ${el.tag}. Intentional? Put "aura-ignore hand-built-surface: <why>" in a comment on the line above.`)
    }
  }

  // duplicate-component (new component files only)
  // App components aren't in a primitives-only registry: analyse the file itself.
  const self = state.registry.components.find((c) => c.path === relPath) ?? (isNew ? analyseComponent(ctx, abs, src) : null)
  if (isNew && self) {
    const others = state.registry.components.filter((c) => c.path !== relPath)
    const dupByName = others.find((c) => norm(c.name) && norm(c.name) === norm(self.name))
    const dupByExport = others.find((c) => c.exports.some((e) => self.exports.includes(e) && !['Component', 'default'].includes(e)))
    const dup = dupByName ?? dupByExport
    if (dup) add('duplicate-component', 1, `"${self.name}" duplicates the existing ${dup.category} "${dup.name}" (${dup.path}, used in ${dup.usedBy} files). Reuse it (import from "${importFrom(dup)}") or extend it with a variant instead of a second copy.`)
  }
  if (self && state.registry.components.some((c) => c.path === relPath) && !self.described && (isNew || state.rules['undescribed-component'] === 'warn'))
    add('undescribed-component', 1, `"${self.name}" has no description in the registry. Run: aura describe ${self.name} --summary "…" --use "…" --avoid "…" --keywords "vi, en"`)
  return out
}

/**
 * Baseline: findings that existed when aura was added ({ [path]: { [rule]: count } }). Hooks block only
 * new violations, so editing an old file doesn't force unrelated fixes. Marks the first N per rule as existing.
 */
/** What a finding is about, without where it is: the baseline matches on this, so reformatting a file keeps old findings old, and swapping an old violation for a different new one still blocks. */
export const findingKey = (rule, message) => `${rule}:${message.replace(/\b\d+ files\b/g, 'N files').slice(0, 200)}`
export function loadBaseline(ctx) {
  try { return JSON.parse(fs.readFileSync(path.join(ctx.auraDir, 'baseline.json'), 'utf8')).files ?? {} } catch { return {} }
}
export function applyBaseline(relPath, findings, baseline) {
  const entries = baseline[relPath] ?? {}
  const keys = {}, counts = {}
  for (const [rule, v] of Object.entries(entries)) {
    if (v?.keys) for (const k of v.keys) keys[k] = (keys[k] ?? 0) + 1
    else counts[rule] = typeof v === 'number' ? v : v.count // older baselines: count per rule
  }
  return findings.map((f) => (keys[f.key] > 0 ? (keys[f.key]--, { ...f, existing: true }) : counts[f.rule] > 0 ? (counts[f.rule]--, { ...f, existing: true }) : f))
}
export function snapshotBaseline(entries) {
  const files = {}
  for (const { file, findings } of entries)
    for (const f of findings) if (f.severity === 'error' || f.severity === 'warn') {
      const e = ((files[file] ??= {})[f.rule] ??= { count: 0, lines: [], keys: [] })
      e.count++
      e.lines.push(f.line)
      e.keys.push(f.key)
    }
  return { $comment: 'Findings present when aura was added; hooks only block new ones (matched by what the finding is about, so moved lines stay old; lines are where they were). List them: aura check --existing. Refresh: aura baseline', rules: Object.keys(DEFAULT_RULES), pagesChecked: true, files }
}

export const hasErrors = (findings) => findings.some((f) => f.severity === 'error' && !f.existing)
export function formatFindings(relPath, findings) {
  return findings.map((f) => `${relPath}:${f.line} [${f.existing ? 'existing' : f.severity}] ${f.rule}: ${f.message}`).join('\n')
}
