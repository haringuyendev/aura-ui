// Static analysis of one component file: exports, props, cva variants, doc line, which primitives it uses.
import path from 'node:path'
import { SECTION_DIR } from './context.mjs'

const words = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_.]/g, ' ').toLowerCase()

/** Resolved local imports of a source file (absolute paths), for the usage graph and "uses". */
export function localImports(ctx, abs, src) {
  const out = new Set()
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s([^'"]*?)from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const file = ctx.resolveImport(m[2] ?? m[3], abs)
    if (!file) continue
    // Through a barrel (index.ts / package entry), credit the files that define the imported names.
    const named = m[1]?.match(/\{([^}]*)\}/)?.[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean)
    if (named?.length && ctx.isBarrel?.(file)) {
      const map = ctx.barrelNames(file)
      const hits = named.map((n) => map.get(n)).filter(Boolean)
      if (hits.length) { hits.forEach((h) => out.add(h)); continue }
    }
    out.add(file)
  }
  return [...out]
}

/** Package imports (for "second UI library" checks). */
export const packageImports = (src) => [...src.matchAll(/(?:^|\n)\s*import\s[^'"]*?from\s+['"]([^'"./][^'"]*)['"]/g)].map((m) => m[1])

function propsOf(src) {
  const props = {}
  // interface FooProps { a?: string; b: number } / type FooProps = { … } (first level only)
  for (const m of src.matchAll(/(?:interface\s+(\w*Props)\b[^{]*|type\s+(\w*Props)\s*=[^{]*)\{([\s\S]*?)\n\}/g)) {
    for (const p of m[3].matchAll(/^\s{2}(?:readonly\s+)?(['"]?[\w-]+['"]?)(\?)?\s*:\s*([^;\n]+)/gm)) props[p[1].replace(/['"]/g, '')] = `${p[3].trim()}${p[2] ? ' (optional)' : ''}`
  }
  // destructured params of exported components: function Foo({ a, b = 1, ...rest }: …)
  for (const m of src.matchAll(/(?:export\s+(?:default\s+)?function\s+[A-Z]\w*|(?:export\s+)?const\s+[A-Z]\w*\s*(?::[^=]+)?=\s*(?:React\.forwardRef[^(]*\()?)\s*\(\s*\{([^}]*)\}/g))
    for (const name of m[1].split(',').map((x) => x.trim().replace(/^\.\.\..*/, '').split(/[=:]/)[0].trim()).filter(Boolean)) props[name] ??= 'see source'
  return props
}

const pascal = (s) => s.replace(/(^|[-_.\s]+)(\w)/g, (_, __, c) => c.toUpperCase())

/** Vue/Svelte single-file component: one component named after the file; props from defineProps / $props / export let. */
function sfcProps(src) {
  const props = {}
  const block = src.match(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>/)?.[1] ?? src.match(/defineProps\s*\(\s*\{([\s\S]*?)\}\s*\)/)?.[1]
  if (block) for (const m of block.matchAll(/^\s*(['"]?[\w-]+['"]?)(\?)?\s*:\s*([^,;\n]+)/gm)) props[m[1].replace(/['"]/g, '')] = `${m[3].trim()}${m[2] ? ' (optional)' : ''}`
  for (const m of src.matchAll(/export\s+let\s+(\w+)(?:\s*:\s*([^=;\n]+))?/g)) props[m[1]] = m[2]?.trim() ?? 'see source'
  const runes = src.match(/let\s*\{([^}]*)\}\s*(?::[^=]+)?=\s*\$props\(\)/)?.[1]
  if (runes) for (const n of runes.split(',').map((x) => x.trim().replace(/^\.\.\..*/, '').split(/[=:]/)[0].trim()).filter(Boolean)) props[n] ??= 'see source'
  return props
}

/** PascalCase components a file imports from UI libraries: [{ name, from }] (named, default and per-component paths). */
export function libraryImports(src, prefixes) {
  const out = []
  for (const m of src.matchAll(/(?:^|\n)\s*import\s+(?!type\b)([^'";]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const [, clause, from] = m
    if (!prefixes.some((p) => from === p || from.startsWith(p.endsWith('/') ? p : p + '/')) || /icons?(-material)?([/-]|$)|\/(styles|utils|system)$/.test(from)) continue
    const notComponent = (n) => /(Props|Type|Types|Config|Options|Theme|Context|Icon|Outlined|Filled|Rounded|TwoTone)$/.test(n) || /^[A-Z0-9_]+$/.test(n)
    const def = clause.match(/^\s*([A-Z]\w*)/)?.[1]
    if (def && !notComponent(def)) out.push({ name: def, from })
    for (const n of clause.match(/\{([^}]*)\}/)?.[1].split(',') ?? []) {
      const [orig, alias] = n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)
      if (/^[A-Z]/.test(orig ?? '') && !n.trim().startsWith('type ') && !notComponent(orig)) out.push({ name: orig, from, local: alias })
    }
  }
  return out
}

export function analyseComponent(ctx, abs, src) {
  if (/\.(vue|svelte)$/.test(abs)) {
    const base = path.basename(abs).replace(/\.(vue|svelte)$/, '')
    const name = base === 'index' ? path.basename(path.dirname(abs)) : base
    const isUi = ctx.uiDir && abs.startsWith(ctx.uiDir + path.sep)
    return {
      name, category: isUi ? 'primitive' : SECTION_DIR.test('/' + ctx.rel(abs)) ? 'section' : 'component',
      path: ctx.rel(abs), import: ctx.importPathFor(abs).replace(/(\.(vue|svelte))?$/, path.extname(abs)), exports: [pascal(name)], props: sfcProps(src), variants: {},
      uses: ctx.uiDir ? localImports(ctx, abs, src).filter((f) => f.startsWith(ctx.uiDir + path.sep)).map((f) => path.basename(f).replace(/\.\w+$/, '')) : [],
      doc: (src.match(/<!--\s*([^\n]*?)\s*-->/) || [])[1] ?? null, keywords: [words(name)], client: false,
    }
  }
  const exports = [...new Set([
    ...[...src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Z]\w*)/gm)].map((m) => m[1]),
    ...[...src.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()).filter((x) => /^[A-Z]/.test(x))),
  ])]
  if (!exports.length) return null
  // cva variants: the component's own cva (itemVariants for item.tsx) wins over helpers' (itemMediaVariants)
  const variants = {}
  const own = path.basename(abs).replace(/\.\w+$/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase()) + 'Variants'
  const cvas = [...src.matchAll(/const\s+(\w+)\s*=\s*cva\(/g)].map((m, i, all) => ({ name: m[1], text: src.slice(m.index, all[i + 1]?.index ?? src.length) }))
  const parts = cvas.length ? [...cvas.filter((c) => c.name !== own), ...cvas.filter((c) => c.name === own)].map((c) => c.text) : [src]
  for (const part of parts)
    for (const v of part.matchAll(/variants:\s*\{([\s\S]*?)\n\s{2,4}\},?\n/g))
      for (const g of v[1].matchAll(/^\s+(\w+):\s*\{([\s\S]*?)^\s+\},?/gm)) variants[g[1]] = [...g[2].matchAll(/^\s+['"]?([\w-]+)['"]?\s*:/gm)].map((x) => x[1])
  const doc = (src.match(/\/\*\*\s*\n?\s*\*?\s*([^*\n@][^\n]*)/) || [])[1]?.trim()
  const base = path.basename(abs).replace(/\.(tsx|jsx)$/, '')
  const name = base === 'index' || base === 'Component' ? path.basename(path.dirname(abs)) : base
  const isUi = ctx.uiDir && abs.startsWith(ctx.uiDir + path.sep)
  const category = isUi ? 'primitive' : SECTION_DIR.test('/' + ctx.rel(abs)) ? 'section' : 'component'
  const uses = ctx.uiDir
    ? localImports(ctx, abs, src).filter((f) => f.startsWith(ctx.uiDir + path.sep)).map((f) => path.basename(f).replace(/\.(tsx|jsx|ts|js)$/, ''))
    : []
  return {
    name,
    category,
    path: ctx.rel(abs),
    import: ctx.importPathFor(abs),
    ...(ctx.monorepo && { package: ctx.packageOf(abs), ...(ctx.localImportFor(abs) !== ctx.importPathFor(abs) && { importInPackage: ctx.localImportFor(abs) }) }),
    exports,
    props: propsOf(src),
    variants,
    uses: [...new Set(uses)].filter((u) => u !== name),
    doc: doc ?? null,
    keywords: [...new Set([words(name), ...exports.map(words)])],
    client: /^['"]use client['"]/.test(src.trimStart()),
  }
}
