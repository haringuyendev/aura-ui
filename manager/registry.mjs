// The component registry (.aura/registry.json) and project profile (.aura/profile.json).
// refresh() is incremental: only files whose mtime/size changed are re-read, deleted files drop out,
// and human/agent-written descriptions survive edits and moves.
import fs from 'node:fs'
import path from 'node:path'
import { SOURCE_EXT, read } from './context.mjs'
import { analyseComponent, libraryImports, localImports } from './components.mjs'
import { scanTokens } from './tokens.mjs'
import { loadAuraCatalog } from './find.mjs'

const ENRICH = ['summary', 'use_when', 'avoid_when', 'extra_keywords', 'example', 'described', 'describedBy']
const loadJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback } }
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n') }

export const files = (ctx) => ({
  registry: path.join(ctx.auraDir, 'registry.json'),
  profile: path.join(ctx.auraDir, 'profile.json'),
  rules: path.join(ctx.auraDir, 'rules.json'),
  baseline: path.join(ctx.auraDir, 'baseline.json'),
  cache: path.join(ctx.auraDir, 'cache', 'index.json'),
})
export const isInitialised = (ctx) => fs.existsSync(files(ctx).registry)
export const loadRegistry = (ctx) => ({ library: [], ...loadJson(files(ctx).registry, { version: 1, components: [] }) })
export const loadProfile = (ctx) => loadJson(files(ctx).profile, null)

export function refresh(ctx, { full = false } = {}) {
  const f = files(ctx)
  const cache = full ? { files: {}, tokens: {} } : loadJson(f.cache, { files: {}, tokens: {} })
  const registry = loadRegistry(ctx)
  const prevByPath = new Map(registry.components.map((c) => [c.path, c]))

  const roots = [ctx.srcRoot, ...(ctx.uiDir && !ctx.uiDir.startsWith(ctx.srcRoot) ? [ctx.uiDir] : [])]
  const sources = [...new Set(roots.flatMap((r) => ctx.walk(r, SOURCE_EXT)))]
  const nextFiles = {}
  const components = new Map()
  const changed = []
  for (const abs of sources) {
    const relPath = ctx.rel(abs)
    const st = fs.statSync(abs)
    const prev = cache.files[relPath]
    if (prev && prev.mtime === st.mtimeMs && prev.size === st.size) {
      nextFiles[relPath] = prev
      if (prev.component && prevByPath.has(relPath)) components.set(relPath, prevByPath.get(relPath))
      continue
    }
    const src = read(abs)
    const entry = { mtime: st.mtimeMs, size: st.size, imports: localImports(ctx, abs, src).map(ctx.rel), component: false }
    const lib = ctx.uiLibPrefixes.length ? libraryImports(src, ctx.uiLibPrefixes) : []
    if (lib.length) entry.lib = lib.map((l) => `${l.from}#${l.name}`)
    if (ctx.isComponentPath(abs)) {
      const c = analyseComponent(ctx, abs, src)
      if (c) { entry.component = true; components.set(relPath, c); changed.push(relPath) }
    }
    nextFiles[relPath] = entry
  }

  // Added / removed / moved (same name + overlapping exports), and keep descriptions across edits and moves.
  const removed = [...prevByPath.keys()].filter((p) => !components.has(p))
  const added = [...components.keys()].filter((p) => !prevByPath.has(p))
  const updated = changed.filter((p) => prevByPath.has(p))
  const moved = []
  for (const a of added) {
    const c = components.get(a)
    const r = removed.find((r) => !moved.some(([from]) => from === r) && prevByPath.get(r).name === c.name && prevByPath.get(r).exports.some((e) => c.exports.includes(e)))
    if (r) moved.push([r, a])
  }
  for (const [p, c] of components) {
    const prev = prevByPath.get(p) ?? prevByPath.get(moved.find(([, to]) => to === p)?.[0])
    if (prev) for (const k of ENRICH) if (prev[k] !== undefined) c[k] = prev[k]
  }

  // Seed descriptions from the aura catalog for primitives/blocks with the same name (shadcn-style files),
  // so a fresh registry is already searchable in Vietnamese. Marked source: 'aura-catalog'.
  const catalog = new Map(loadAuraCatalog().filter((e) => e.kind !== 'util').map((e) => [e.name, e]))
  // Catalog-seeded entries are re-seeded each refresh (catalog updates reach them); the file must share an
  // export with the catalog entry, so a same-named but different component isn't mislabelled.
  for (const c of components.values()) {
    if (c.described && c.describedBy !== 'aura-catalog') continue
    const e = (c.category === 'primitive' || /\/blocks\//.test(c.path)) && catalog.get(c.name)
    const shared = e ? c.exports.filter((x) => (e.exports ?? []).includes(x)).length : 0
    if (!e || (e.exports?.length && shared < Math.min(2, e.exports.filter((x) => /^[A-Z]/.test(x)).length))) {
      if (c.describedBy === 'aura-catalog') for (const k of ENRICH) delete c[k]
      continue
    }
    Object.assign(c, { summary: e.summary, use_when: e.use_when, avoid_when: e.avoid_when, extra_keywords: e.keywords, described: true, describedBy: 'aura-catalog' })
  }

  // Usage graph: who imports each component file.
  const importers = {}
  for (const [file, e] of Object.entries(nextFiles)) for (const imp of e.imports) if (imp !== file) (importers[imp] ??= []).push(file)
  for (const [p, c] of components) {
    const users = importers[p] ?? []
    c.usedBy = users.length
    c.usedIn = users.slice(0, 8)
  }

  // Library components (antd Button, MUI TextField, Chakra Modal…) used by the project, outside its own primitives.
  const prevLib = new Map((registry.library ?? []).map((c) => [c.path, c]))
  const libUse = {}
  for (const [file, e] of Object.entries(nextFiles)) {
    if (ctx.uiDir && path.join(ctx.repo, file).startsWith(ctx.uiDir + path.sep)) continue
    for (const key of e.lib ?? []) (libUse[key] ??= []).push(file)
  }
  const kebab = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  const library = Object.entries(libUse).map(([key, users]) => {
    const [from, name] = key.split('#')
    const c = { name, category: 'library', path: key, import: from, exports: [name], props: {}, variants: {}, uses: [], doc: null, keywords: [kebab(name).replace(/-/g, ' ')], usedBy: users.length, usedIn: users.slice(0, 8) }
    const prev = prevLib.get(key)
    if (prev) for (const k of ENRICH) if (prev[k] !== undefined) c[k] = prev[k]
    const e = !c.described && (catalog.get(kebab(name)) ?? catalog.get(kebab(name).replace(/^(text-field|textfield)$/, 'input')))
    if (e) Object.assign(c, { summary: e.summary, use_when: e.use_when, avoid_when: e.avoid_when, extra_keywords: e.keywords, described: true, describedBy: 'aura-catalog' })
    return c
  }).filter((c) => c.usedBy >= 1).sort((a, b) => b.usedBy - a.usedBy || a.name.localeCompare(b.name))
  const libChanged = library.length !== prevLib.size || library.some((c) => prevLib.get(c.path)?.usedBy !== c.usedBy)

  // Tokens and profile: rescan when a token file changed (or on full).
  const tokenFilesChanged = full || !cache.tokens?.mtimes || Object.entries(cache.tokens.mtimes).some(([p, m]) => { try { return fs.statSync(path.join(ctx.repo, p)).mtimeMs !== m } catch { return true } })
  const tokens = tokenFilesChanged ? scanTokens(ctx) : cache.tokens
  const order = { primitive: 0, component: 1, section: 2 }
  const list = [...components.values()].sort((a, b) => order[a.category] - order[b.category] || b.usedBy - a.usedBy || a.name.localeCompare(b.name))
  const now = new Date().toISOString()
  const structural = full || added.length || removed.length || updated.length || tokenFilesChanged || libChanged
  if (structural || !fs.existsSync(f.registry)) {
    writeJson(f.registry, { version: 1, updatedAt: now, components: list, library })
    writeJson(f.profile, buildProfile(ctx, tokens, list, now, library))
  }
  writeJson(f.cache, { files: nextFiles, tokens })
  const movedFrom = new Set(moved.map(([from]) => from)), movedTo = new Set(moved.map(([, to]) => to))
  return { registry: { version: 1, components: list, library }, tokens, changes: { added: added.filter((a) => !movedTo.has(a)), removed: removed.filter((r) => !movedFrom.has(r)), updated, moved } }
}

function buildProfile(ctx, tokens, list, now, library = []) {
  const conventions = []
  if (fs.existsSync(path.join(ctx.srcRoot, 'app'))) conventions.push(`App router pages in ${ctx.rel(path.join(ctx.srcRoot, 'app'))}`)
  if (ctx.stack.cms.includes('payload') && fs.existsSync(path.join(ctx.srcRoot, 'blocks')))
    conventions.push(`Payload CMS: a page section is ${ctx.rel(path.join(ctx.srcRoot, 'blocks'))}/<Name>/ (config.ts + Component.tsx), registered in the Pages collection and RenderBlocks`)
  for (const doc of ['AGENTS.md', 'CLAUDE.md', 'DESIGN.md', 'docs/design.md']) if (fs.existsSync(path.join(ctx.repo, doc))) conventions.push(`Project rules in ${doc}`)
  return {
    repo: path.basename(ctx.repo),
    updatedAt: now,
    stack: Object.fromEntries(Object.entries(ctx.stack).filter(([, v]) => (Array.isArray(v) ? v.length : v))),
    ...(ctx.workspaces.length && { workspaces: ctx.workspaces }),
    shadcn: ctx.shadcn && { style: ctx.shadcn.style, css: ctx.shadcn.tailwind?.css, aliases: ctx.shadcn.aliases },
    tokens: { files: tokens.files, tailwindConfig: tokens.tailwindConfig, tailwindConfigs: tokens.tailwindConfigs, themeFiles: tokens.themeFiles, colorPrefixes: tokens.colorPrefixes, darkSelector: tokens.darkSelector, colors: tokens.colors, fonts: tokens.fonts, radius: tokens.radius, status: tokens.status, chartTokens: tokens.chartTokens },
    components: {
      uiDir: ctx.uiDir && ctx.rel(ctx.uiDir),
      primitives: list.filter((c) => c.category === 'primitive').map((c) => c.name),
      components: list.filter((c) => c.category === 'component').length,
      sections: list.filter((c) => c.category === 'section' && /\/(Component|index)\.(tsx|jsx)$/.test(c.path)).map((c) => c.name).sort(),
      sectionFiles: list.filter((c) => c.category === 'section').length,
      undescribed: list.filter((c) => !c.described).length,
      library: library.slice(0, 30).map((c) => `${c.name}(${c.import})`),
    },
    conventions,
  }
}
