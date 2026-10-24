// Project context: paths, package.json stack, tsconfig aliases, where components live.
import fs from 'node:fs'
import path from 'node:path'

export const IGNORE = /(^|\/)(node_modules|\.next|dist|build|out|coverage|\.git|\.turbo|\.vercel|public|playwright-report|test-results|\.pnpm-store|\.aura|storybook-static)(\/|$)/
export const SOURCE_EXT = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte']
export const SECTION_DIR = /\/(blocks|heros|sections|features)\//

export const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }

/** JSON with comments and trailing commas (tsconfig), stripping comments outside strings only. */
export function stripJsonComments(src) {
  let out = '', inStr = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1]
    if (inStr) { out += c; if (c === '\\') out += src[++i] ?? ''; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue }
    out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}
export const readJson = (p) => { try { return JSON.parse(stripJsonComments(read(p))) } catch { return null } }

const UI_LIBS = {
  'shadcn-vue / shadcn-svelte': (d, shadcn) => shadcn && (d['reka-ui'] || d['radix-vue'] || d['bits-ui']),
  'shadcn (radix)': (d, shadcn) => shadcn && Object.keys(d).some((k) => k.startsWith('@radix-ui')),
  'shadcn (base-ui)': (d, shadcn) => shadcn && d['@base-ui/react'],
  radix: (d) => Object.keys(d).some((k) => k.startsWith('@radix-ui')),
  'base-ui': (d) => d['@base-ui/react'],
  mui: (d) => d['@mui/material'],
  antd: (d) => d.antd,
  chakra: (d) => Object.keys(d).some((k) => k.startsWith('@chakra-ui')),
  mantine: (d) => Object.keys(d).some((k) => k.startsWith('@mantine')),
  headlessui: (d) => Object.keys(d).some((k) => k.startsWith('@headlessui')),
  ...Object.fromEntries(['react-bootstrap', 'reactstrap', 'semantic-ui-react', 'primereact', 'react-aria-components', 'evergreen-ui', 'grommet', 'vuetify', 'element-plus', 'naive-ui', 'primevue'].map((n) => [n, (d) => d[n]])),
  nextui: (d) => Object.keys(d).some((k) => k.startsWith('@nextui-org') || k.startsWith('@heroui')),
  fluentui: (d) => Object.keys(d).some((k) => k.startsWith('@fluentui')),
  blueprint: (d) => Object.keys(d).some((k) => k.startsWith('@blueprintjs')),
}
/** Import prefixes of UI libraries; importing one the project doesn't use is a "second UI library". */
export const UI_LIB_IMPORTS = {
  '@mui/': 'mui', antd: 'antd', '@ant-design/pro-components': 'antd', '@chakra-ui/': 'chakra', '@mantine/': 'mantine', '@headlessui/': 'headlessui',
  '@radix-ui/': 'radix', '@base-ui/react': 'base-ui', 'react-bootstrap': 'react-bootstrap', reactstrap: 'reactstrap', 'semantic-ui-react': 'semantic-ui',
  primereact: 'primereact', 'react-aria-components': 'react-aria', '@nextui-org/': 'nextui', '@heroui/': 'heroui', '@fluentui/': 'fluentui',
  '@blueprintjs/': 'blueprint', 'evergreen-ui': 'evergreen', grommet: 'grommet', '@ark-ui/': 'ark', 'vuetify': 'vuetify', 'element-plus': 'element-plus',
  'naive-ui': 'naive-ui', 'primevue': 'primevue', 'bits-ui': 'bits-ui', 'reka-ui': 'reka-ui', 'radix-vue': 'reka-ui', '@skeletonlabs/': 'skeleton',
}

/** Workspace package folders of a monorepo (package.json "workspaces" or pnpm-workspace.yaml), or []. */
export function workspaceDirs(repo, pkg = readJson(path.join(repo, 'package.json')) ?? {}) {
  let patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages ?? []
  const pnpm = read(path.join(repo, 'pnpm-workspace.yaml'))
  if (pnpm) patterns = [...patterns, ...[...(pnpm.split(/^packages:\s*$/m)[1] ?? '').matchAll(/^\s+-\s+['"]?([^'"\n#]+?)['"]?\s*$/gm)].map((m) => m[1])]
  const dirs = new Set()
  const subdirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !IGNORE.test(e.name)).map((e) => path.join(d, e.name)) } catch { return [] } }
  // Expand "apps/*", "libs/*/*", "packages/**" segment by segment ("**" = up to 4 levels).
  const expand = (base, segs) => {
    if (!segs.length) return [base]
    const [seg, ...rest] = segs
    if (seg === '**') { let level = [base], all = [base]; for (let i = 0; i < 4; i++) { level = level.flatMap(subdirs); all.push(...level) } return all.flatMap((d) => expand(d, rest)) }
    if (seg.includes('*')) { const re = new RegExp(`^${seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`); return subdirs(base).filter((d) => re.test(path.basename(d))).flatMap((d) => expand(d, rest)) }
    return expand(path.join(base, seg), rest)
  }
  for (const p of patterns.filter((p) => !p.startsWith('!')))
    for (const d of expand(repo, p.replace(/^\.\//, '').replace(/\/$/, '').split('/')))
      if (d !== repo && !IGNORE.test(path.relative(repo, d)) && fs.existsSync(path.join(d, 'package.json'))) dirs.add(d)
  return [...dirs]
}

/** First file target of a package.json exports/imports value (string or conditions object). */
const target = (v) => typeof v === 'string' ? v : Array.isArray(v) ? target(v[0]) : v && typeof v === 'object' ? target(v.source ?? v.development ?? v.import ?? v.default ?? v.require ?? Object.values(v).find((x) => typeof x !== 'object' || x)) : null
/** Match "key" (may contain one *) against spec; returns the * capture ('' for exact) or null. */
function matchKey(key, spec) {
  const star = key.indexOf('*')
  if (star < 0) return key === spec ? '' : null
  const pre = key.slice(0, star), post = key.slice(star + 1)
  return spec.length >= pre.length + post.length && spec.startsWith(pre) && spec.endsWith(post) ? spec.slice(pre.length, spec.length - post.length) : null
}
const mapEntries = (m) => (m && typeof m === 'object' ? Object.entries(m).map(([k, v]) => [k, target(v)]).filter(([, t]) => t) : [])

/** tsconfig/jsconfig "paths", following relative and workspace "extends". */
function tsAliases(dir, resolvePkgFile, seen = new Set()) {
  const load = (file) => {
    if (!file || seen.has(file) || !fs.existsSync(file)) return { paths: {}, base: null, baseUrl: null }
    seen.add(file)
    const cfg = readJson(file) ?? {}
    const parents = [cfg.extends].flat().filter(Boolean).map((e) => load(e.startsWith('.') ? path.resolve(path.dirname(file), e.endsWith('.json') ? e : e + '.json') : resolvePkgFile(e)))
    const own = cfg.compilerOptions ?? {}
    const base = own.baseUrl ? path.resolve(path.dirname(file), own.baseUrl) : own.paths ? path.dirname(file) : null
    const merged = parents.reduce((acc, p) => ({ paths: { ...acc.paths, ...p.paths }, base: p.base ?? acc.base, baseUrl: p.baseUrl ?? acc.baseUrl }), { paths: {}, base: null, baseUrl: null })
    const baseUrl = own.baseUrl ? base : merged.baseUrl ?? null
    return own.paths ? { paths: Object.fromEntries(Object.entries(own.paths).map(([k, v]) => [k, path.resolve(base, String(v[0]))])), base, baseUrl } : { ...merged, baseUrl }
  }
  const { paths, baseUrl } = load(['tsconfig.json', 'jsconfig.json', 'tsconfig.base.json'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f)))
  const aliases = Object.entries(paths).map(([k, t]) => ({ prefix: k.replace(/\*$/, ''), dir: path.resolve(t.replace(/\*$/, '')) }))
  aliases.baseUrl = baseUrl
  return aliases
}

export function createContext(repoArg = '.') {
  const repo = path.resolve(repoArg)
  const rel = (p) => path.relative(repo, p).split(path.sep).join('/')
  const pkg = readJson(path.join(repo, 'package.json')) ?? {}
  // Team overrides in .aura/rules.json: primitivesDir, tokenFiles, allowUiLibraries, cli.
  const config = readJson(path.join(repo, '.aura', 'rules.json')) ?? {}

  // Packages: the repo itself plus, in a monorepo, every workspace package (apps/*, packages/*…).
  const packages = [repo, ...workspaceDirs(repo, pkg)].map((dir) => {
    const p = dir === repo ? pkg : readJson(path.join(dir, 'package.json')) ?? {}
    return { dir, name: p.name ?? null, pkg: p, imports: mapEntries(p.imports), exports: typeof p.exports === 'string' ? [['.', p.exports]] : mapEntries(p.exports), shadcn: readJson(path.join(dir, 'components.json')) }
  })
  const monorepo = packages.length > 1
  const byName = new Map(packages.filter((p) => p.name).map((p) => [p.name, p]))
  /** Package that owns a file: the deepest package folder containing it. */
  const ownerOf = (abs) => packages.filter((p) => abs === p.dir || abs.startsWith(p.dir + path.sep)).sort((a, b) => b.dir.length - a.dir.length)[0] ?? packages[0]
  const fileWithExt = (base) => {
    for (const cand of [base, ...SOURCE_EXT.map((e) => base + e), ...SOURCE_EXT.map((e) => path.join(base, 'index' + e))])
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand
    return null
  }
  /** Resolve "<workspace-package>/<subpath>" through its exports map (or its folder when it has none). */
  function resolvePackageSpec(spec) {
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
    const p = byName.get(name)
    if (!p) return null
    const sub = '.' + spec.slice(name.length)
    // Built packages point exports at dist/; map back to the source file when dist isn't there.
    const toSource = (t) => {
      const abs = path.resolve(p.dir, t)
      if (fileWithExt(abs)) return abs
      const src = abs.replace(/[\\/](dist|build|lib|esm|cjs)(?=[\\/])/, `${path.sep}src`).replace(/\.(d\.ts|m?js|cjs)$/, '')
      return fileWithExt(src) ? src : abs
    }
    if (p.exports.length) {
      for (const [k, t] of p.exports) { const cap = matchKey(k, sub); if (cap !== null) return toSource(t.replace('*', cap)) }
      return null
    }
    if (sub === '.') return toSource(p.pkg.source ?? p.pkg.module ?? p.pkg.main ?? (fs.existsSync(path.join(p.dir, 'src')) ? 'src/index' : 'index'))
    return toSource(sub)
  }
  for (const p of packages) p.aliases = tsAliases(p.dir, resolvePackageSpec)
  for (const p of packages.slice(1)) if (!p.aliases.length && !p.aliases.baseUrl) p.aliases = packages[0].aliases
  // Barrels: files re-exported from a package's entry (src/index.ts), importable as the package name.
  for (const p of packages.slice(1)) {
    p.barrel = new Set()
    const entry = p.name && resolvePackageSpec(p.name)
    const visit = (file, depth) => {
      const f = file && fileWithExt(file)
      if (!f || depth > 3 || p.barrel.has(f)) return
      p.barrel.add(f)
      for (const m of read(f).matchAll(/export\s+(?:\*|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"](\.[^'"]+)['"]/g)) visit(path.resolve(path.dirname(f), m[1]), depth + 1)
    }
    visit(entry, 0)
  }

  const deps = Object.assign({}, ...packages.map((p) => ({ ...p.pkg.dependencies, ...p.pkg.devDependencies })))
  for (const p of packages) if (p.name) delete deps[p.name]
  const has = (n) => Object.keys(deps).some((d) => d === n || d.startsWith(n))
  const pick = (map) => Object.entries(map).filter(([, t]) => t()).map(([k]) => k)
  const srcRoot = fs.existsSync(path.join(repo, 'src')) ? path.join(repo, 'src') : repo
  // The design-system package: the one with shadcn's components.json, else one named ui / design-system / components.
  const uiPkg = packages.find((p) => p.shadcn) ?? packages.slice(1).find((p) => /(^|\/)(ui|ui-kit|react-ui|design-?system|ds|components|primitives)$/i.test(p.name ?? '') || /^(ui|design-?system)$/i.test(path.basename(p.dir))) ?? null
  const shadcn = uiPkg?.shadcn ?? null

  const stack = {
    framework: pick({ next: () => deps.next, vite: () => deps.vite, remix: () => has('@remix-run') || deps['react-router'] && has('@react-router/dev'), astro: () => deps.astro, 'react-native': () => deps['react-native'], nuxt: () => deps.nuxt, vue: () => deps.vue, sveltekit: () => deps['@sveltejs/kit'], svelte: () => deps.svelte, webpack: () => deps.webpack || has('@nx/webpack'), cra: () => deps['react-scripts'] }),
    react: deps.react ?? null,
    styling: pick({ [`tailwind ${deps.tailwindcss ?? ''}`.trim()]: () => deps.tailwindcss, 'styled-components': () => deps['styled-components'], emotion: () => has('@emotion'), sass: () => deps.sass }),
    ui: Object.entries(UI_LIBS).filter(([, t]) => t(deps, shadcn)).map(([k]) => k),
    icons: pick({ lucide: () => has('lucide'), heroicons: () => has('@heroicons'), 'react-icons': () => deps['react-icons'], tabler: () => has('@tabler/icons'), 'ant-design-icons': () => deps['@ant-design/icons'], 'mui-icons': () => deps['@mui/icons-material'], phosphor: () => has('@phosphor-icons'), 'radix-icons': () => deps['@radix-ui/react-icons'], iconify: () => has('@iconify') }),
    forms: pick({ 'react-hook-form': () => deps['react-hook-form'], formik: () => deps.formik, zod: () => deps.zod, yup: () => deps.yup }),
    data: pick({ 'tanstack-table': () => deps['@tanstack/react-table'], 'tanstack-query': () => deps['@tanstack/react-query'], swr: () => deps.swr, recharts: () => deps.recharts, 'chart.js': () => deps['chart.js'], echarts: () => has('echarts') }),
    dates: pick({ 'date-fns': () => deps['date-fns'], dayjs: () => deps.dayjs, moment: () => deps.moment, luxon: () => deps.luxon }),
    motion: pick({ 'framer-motion': () => deps['framer-motion'], motion: () => deps.motion }),
    cms: pick({ payload: () => deps.payload, sanity: () => has('sanity') || has('@sanity'), strapi: () => has('@strapi'), contentful: () => deps.contentful }),
    i18n: pick({ 'next-intl': () => deps['next-intl'], 'react-i18next': () => deps['react-i18next'], lingui: () => has('@lingui') }),
  }
  const usedUiLibs = new Set(Object.values(UI_LIB_IMPORTS).filter((lib) => Object.keys(deps).some((d) => Object.entries(UI_LIB_IMPORTS).some(([prefix, l]) => l === lib && (d === prefix || d.startsWith(prefix))))))

  /** Import prefixes of the UI libraries this project uses (plus allowUiLibraries): their components count as primitives. */
  // Headless primitives (radix, base-ui, ark, reka, bits) are what a project's own components wrap; skip them when it has its own.
  const HEADLESS = new Set(['radix', 'base-ui', 'ark', 'reka-ui', 'bits-ui', 'react-aria'])
  const hasOwnUi = !!(config.primitivesDir || shadcn || (uiPkg && uiPkg.dir !== repo) || ['components/ui', 'src/components/ui'].some((d) => fs.existsSync(path.join(repo, d))))
  const uiLibPrefixes = [...Object.entries(UI_LIB_IMPORTS).filter(([prefix, lib]) => usedUiLibs.has(lib) && !(hasOwnUi && HEADLESS.has(lib)) && Object.keys(deps).some((d) => d === prefix || d.startsWith(prefix))).map(([p]) => p), ...(config.allowUiLibraries ?? [])]

  /** Resolve an import specifier to an absolute file path (relative, tsconfig alias, #subpath import, workspace package), or null for packages. */
  function resolveImport(spec, fromFile) {
    const owner = ownerOf(fromFile)
    let base = null
    if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
    else if (spec.startsWith('#')) { for (const [k, t] of owner.imports) { const cap = matchKey(k, spec); if (cap !== null) { base = path.resolve(owner.dir, t.replace('*', cap)); break } } }
    if (!base) for (const a of owner.aliases) if (a.prefix && spec.startsWith(a.prefix)) { base = path.join(a.dir, spec.slice(a.prefix.length)); break }
    if (!base && monorepo) base = resolvePackageSpec(spec)
    if (!base && owner.aliases.baseUrl && !spec.startsWith('@') && fileWithExt(path.join(owner.aliases.baseUrl, spec))) base = path.join(owner.aliases.baseUrl, spec)
    return base ? fileWithExt(base) : null
  }
  /** Reverse a package.json exports/imports map: the specifier that resolves to this file, or null. */
  const reverse = (entries, owner, abs, prefix = '') => {
    for (const [k, t] of entries) {
      const full = path.resolve(owner.dir, t)
      const star = full.indexOf('*')
      if (star < 0) { if (full === abs) return prefix + k.replace(/^\.\/?/, (m) => (prefix ? '/' : m)).replace(/^\/$/, ''); continue }
      const pre = full.slice(0, star), post = full.slice(star + 1)
      if (abs.startsWith(pre) && abs.endsWith(post)) return (prefix + k.replace(/^\./, '')).replace('*', abs.slice(pre.length, abs.length - post.length))
    }
    return null
  }
  const strip = (p) => p.replace(/\.(tsx|jsx|ts|js)$/, '').replace(/\/(index|Component)$/, '')
  /** Import path for a component file as seen from inside its own package (#subpath, alias, or relative). */
  function localImportFor(file) {
    const owner = ownerOf(file)
    const viaImports = reverse(owner.imports, owner, file)
    if (viaImports) return viaImports
    for (const a of owner.aliases) if (a.prefix && file.startsWith(a.dir + path.sep)) return a.prefix + strip(path.relative(a.dir, file).split(path.sep).join('/'))
    if (owner.aliases.baseUrl && file.startsWith(owner.aliases.baseUrl + path.sep)) return strip(path.relative(owner.aliases.baseUrl, file).split(path.sep).join('/'))
    return './' + strip(rel(file))
  }
  /** Import path other files should use (the package's public export in a monorepo, else the local form). */
  function importPathFor(file) {
    const owner = ownerOf(file)
    if (monorepo && owner.dir !== repo && owner.name && (owner.exports.length || owner.barrel?.size)) {
      const pub = reverse(owner.exports, owner, file, owner.name)
      if (pub && fileWithExt(resolvePackageSpec(pub) ?? '') === file) return pub
      if (owner.barrel?.has(file)) return owner.name
    }
    return localImportFor(file)
  }

  /** Folder an alias points to (tsconfig paths or #subpath imports of that package). */
  function aliasDir(owner, alias) {
    for (const a of owner.aliases) if (a.prefix && (alias + '/').startsWith(a.prefix)) return path.join(a.dir, alias.slice(a.prefix.length))
    for (const [k, t] of owner.imports) {
      const star = k.indexOf('*'), tstar = t.indexOf('*')
      if (star > 0 && tstar > 0 && (alias + '/').startsWith(k.slice(0, star))) return path.resolve(owner.dir, t.slice(0, tstar), (alias + '/').slice(star))
    }
    return null
  }
  const uiAlias = shadcn?.aliases?.ui ?? (shadcn?.aliases?.components ? `${shadcn.aliases.components}/ui` : null)
  const uiBase = uiPkg?.dir ?? repo
  const isUiPackage = uiPkg && uiPkg.dir !== repo && !uiPkg.shadcn
  const uiDir = [config.primitivesDir && path.resolve(repo, config.primitivesDir), uiAlias && aliasDir(uiPkg, uiAlias),
    ...['src/components/ui', 'components/ui', ...(isUiPackage ? ['src/components', 'components', 'src/lib', 'src'] : [])].map((d) => path.join(uiBase, d)),
    ...['ui', 'base', 'primitives', 'atoms', 'common'].flatMap((d) => [path.join(srcRoot, 'components', d), path.join(repo, 'components', d)])]
    .map((d) => d && d.replace(/[\\/]+$/, '')).find((d) => d && fs.existsSync(d)) ?? null

  function walk(dir, exts, acc = []) {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (IGNORE.test(rel(p)) || e.isSymbolicLink()) continue
      if (e.isDirectory()) walk(p, exts, acc)
      else if (exts.some((x) => e.name.endsWith(x)) && !/\.(test|spec|stories)\.[jt]sx?$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(p)
    }
    return acc
  }

  /** A file the registry tracks: any .tsx/.jsx/.vue/.svelte except tests, stories and route files (pages, layouts, app router files). */
  const ROUTE = /(^|\/)(pages|routes|app)\/.*\/?(page|layout|loading|error|not-found|template|default|route|head|global-error)\.[jt]sx$|(^|\/)(src\/)?(pages|routes)\/|\+(page|layout|error)\.svelte$|\.page\.[jt]sx$|(^|\/)(e2e|tests?|__tests__|__mocks__|fixtures|cypress|playwright)\//
  const isComponentPath = (abs) => /\.(tsx|jsx|vue|svelte)$/.test(abs) && !/\.(test|spec|stories|story)\./.test(abs) && (uiDir && abs.startsWith(uiDir + path.sep) || /\/_?components?\//.test('/' + rel(abs)) || !ROUTE.test(rel(abs)))
  /** A file the hooks check: every UI source file, pages and layouts included (screens are written there), except tests and stories. */
  const TEST_DIR = /(^|\/)(e2e|tests?|__tests__|__mocks__|fixtures|cypress|playwright)\//
  const isUiPath = (abs) => /\.(tsx|jsx|vue|svelte)$/.test(abs) && !/\.(test|spec|stories|story)\./.test(abs) && !TEST_DIR.test(rel(abs))
  const isRouteFile = (abs) => isUiPath(abs) && !isComponentPath(abs)
  const isTokenPath = (abs) => /\.css$/.test(abs) || /tailwind[.-](config|preset)[\w.-]*\.[cm]?[jt]s$/.test(abs)
  /** For a barrel file (index.ts, a package entry): exported name → the file that defines it, following re-exports. */
  const barrelCache = new Map()
  function barrelNames(file, depth = 0) {
    if (barrelCache.has(file)) return barrelCache.get(file)
    const names = new Map()
    barrelCache.set(file, names)
    if (depth > 4) return names
    const src = read(file)
    for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
      const target = fileWithExt(path.resolve(path.dirname(file), m[2]))
      if (!target) continue
      for (const part of m[1].split(',')) {
        const [orig, alias] = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)
        if (orig) names.set(alias ?? orig, orig === 'default' ? target : barrelNames(target, depth + 1).get(orig) ?? target)
      }
    }
    for (const m of src.matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g)) {
      const target = fileWithExt(path.resolve(path.dirname(file), m[1]))
      if (!target) continue
      const inner = barrelNames(target, depth + 1)
      for (const [n, f] of inner) if (!names.has(n)) names.set(n, f)
      for (const n of [...read(target).matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let)\s+(\w+)|^export\s*\{([^}]*)\}(?!\s*from)/gm)].flatMap((x) => x[1] ? [x[1]] : x[2].split(',').map((y) => y.trim().split(/\s+as\s+/).pop())))
        if (n && !names.has(n)) names.set(n, target)
    }
    return names
  }
  const isBarrel = (f) => /[\\/]index\.[cm]?[jt]sx?$/.test(f) || packages.some((p) => p.barrel?.size && [...p.barrel][0] === f)

  /** Workspace package name of a file ("@acme/ui"), or null outside a monorepo. */
  const packageOf = (abs) => { const o = ownerOf(abs); return monorepo && o.dir !== repo ? o.name ?? rel(o.dir) : null }
  const workspaces = monorepo ? packages.slice(1).map((p) => ({ name: p.name, dir: rel(p.dir) })) : []
  const aliases = packages[0].aliases

  return { repo, rel, pkg, config, uiLibPrefixes, barrelNames, isBarrel, ownerOf, resolvePackageSpec, deps, stack, usedUiLibs, shadcn, aliases, resolveImport, importPathFor, localImportFor, packageOf, workspaces, monorepo, uiDir, srcRoot, walk, isComponentPath, isUiPath, isRouteFile, isTokenPath, auraDir: path.join(repo, '.aura') }
}
