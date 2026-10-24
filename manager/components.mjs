// Static analysis of one component file: exports, props, cva variants, doc line, which primitives it uses.
import path from 'node:path'
import { SECTION_DIR } from './context.mjs'

const words = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_.]/g, ' ').toLowerCase()

/** Resolved local imports of a source file (absolute paths), for the usage graph and "uses". */
export function localImports(ctx, abs, src) {
  const specs = [...src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2])
  return [...new Set(specs.map((s) => ctx.resolveImport(s, abs)).filter(Boolean))]
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

export function analyseComponent(ctx, abs, src) {
  const exports = [...new Set([
    ...[...src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Z]\w*)/gm)].map((m) => m[1]),
    ...[...src.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()).filter((x) => /^[A-Z]/.test(x))),
  ])]
  if (!exports.length) return null
  const variants = {}
  for (const v of src.matchAll(/variants:\s*\{([\s\S]*?)\n\s{2,4}\},?\n/g))
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
