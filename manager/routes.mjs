// Changed files → the pages that render them, so aura verify knows what to inspect.
// Routes come from file-based routing (Next app/pages, Remix/TanStack routes/) or from <Route path element>
// / { path, element|Component } declarations (React Router), with path constants (ROUTES.X) resolved.
// Each changed file is followed up the import graph (.aura/cache/index.json) to the route components above it.
import fs from 'node:fs'
import path from 'node:path'

const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }

/** Next app/pages router (only in packages that use Next) and routes/ folders: { file → path }. */
function fileRoutes(ctx, all) {
  const out = {}
  const nextCache = new Map()
  const usesNext = (f) => {
    const owner = ctx.ownerOf(path.join(ctx.repo, f))
    if (!nextCache.has(owner.dir)) nextCache.set(owner.dir, !!(owner.pkg?.dependencies?.next || owner.pkg?.devDependencies?.next))
    return nextCache.get(owner.dir)
  }
  for (const f of all) {
    let m
    if (!usesNext(f) && /(?:^|\/)(app|pages)\//.test(f) && !/(?:^|\/)(app|src)\/routes\//.test(f)) continue
    if ((m = f.match(/(?:^|\/)app\/(.*?)\/?page\.(tsx|jsx|ts|js|vue)$/))) out[f] = '/' + m[1].split('/').filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@')).map((s) => s.replace(/^\[\[?\.{0,3}(.+?)\]?\]$/, ':$1')).join('/')
    else if ((m = f.match(/(?:^|\/)(?:src\/)?pages\/(.+)\.(tsx|jsx|vue)$/)) && !/(^|\/)(_app|_document|_error|api\/)/.test(m[1]) && /(^|\/)(index|\[|[a-z0-9-]+$)/.test(m[1]) && !/[A-Z]|-page$/.test(path.basename(m[1])))
      out[f] = '/' + m[1].replace(/(^|\/)index$/, '').replace(/\[\.{0,3}(.+?)\]/g, ':$1')
    else if ((m = f.match(/(?:^|\/)app\/routes\/(.+)\.(tsx|jsx)$/)) || (m = f.match(/(?:^|\/)src\/routes\/(.+)\.(tsx|jsx)$/))) {
      if (/(^|\/)__root$|\.lazy$/.test(m[1])) continue
      out[f] = '/' + m[1].replace(/\/route$|(^|[./])_?index$/, '').split(/[./]/).filter((s) => s && !/^_/.test(s) && !/^\(.*\)$/.test(s)).map((s) => s.replace(/^\$(.+)/, ':$1').replace(/^\$$/, '*')).join('/')
    }
  }
  return out
}

/** Path constants: ROUTES.X → "/x" from files declaring `X: "/…"` (the router file's own imports first: apps reuse names). */
function constants(repo, files) {
  const out = {}
  for (const f of files) for (const m of read(path.join(repo, f)).matchAll(/\b([A-Z][A-Z0-9_]*|[a-z]\w*)\s*:\s*["'`](\/[^"'`]*)["'`]/g)) out[m[1]] ??= m[2]
  return out
}

/** <Route path=… element={<X/>}> and { path: …, element: <X/> | Component: X } in router files: { file → path }. */
function declaredRoutes(repo, all, index) {
  const out = {}
  let shared
  for (const f of all) {
    const src = read(path.join(repo, f))
    if (!/\bpath\s*[=:]/.test(src) || !/<Route\b|createBrowserRouter|createRoutesFromElements|RouteObject|\bpath\s*:\s*["'`{]/.test(src)) continue
    shared ??= constants(repo, all.filter((x) => /route|path|url|link/i.test(x)))
    const consts = { ...shared, ...constants(repo, [f, ...(index[f]?.imports ?? []).filter((x) => !/\.(tsx|jsx)$/.test(x))]) }
    // component name → file, from this file's imports (resolved in the index)
    const imports = index[f]?.imports ?? []
    const fileOf = (name) => {
      const spec = src.match(new RegExp(`import\\s+(?:${name}\\b|\\{[^}]*\\b${name}\\b[^}]*\\})[^;]*?from\\s+["']([^"']+)["']`))?.[1]
      if (!spec) return null
      const EXT = /\.(tsx|jsx|ts|js|mjs|vue|svelte)$/
      const base = spec.split('/').pop().replace(EXT, '')
      return imports.find((i) => path.basename(i).replace(EXT, '') === base || new RegExp(`/${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/index\\.(tsx|jsx|ts|js)$`).test(i)) ?? null
    }
    const value = (raw) => {
      raw = raw.trim().replace(/^\{|\}$/g, '').trim()
      const lit = raw.match(/^["'`]([^"'`]*)["'`]$/)
      if (lit) return lit[1]
      const key = raw.split('.').pop()
      return consts[key] ?? null
    }
    // JSX routes, with nesting: a child path without a leading / is relative to its parent.
    const stack = []
    for (const m of src.matchAll(/<Route\b([^>]*?)(\/?)>|<\/Route>/g)) {
      if (m[0] === '</Route>') { stack.pop(); continue }
      const attrs = m[1]
      const raw = attrs.match(/\bpath=(\{[^}]*\}|"[^"]*"|'[^']*')/)?.[1]
      const parent = stack.at(-1) ?? ''
      let p = raw ? value(raw) : attrs.match(/\bindex\b/) ? parent : null
      if (p != null && !p.startsWith('/')) p = `${parent.replace(/\/$/, '')}/${p}`
      const comp = attrs.match(/\belement=\{\s*<\s*([A-Z]\w*)/)?.[1] ?? attrs.match(/\bComponent=\{\s*([A-Z]\w*)/)?.[1]
      const file = comp && fileOf(comp)
      if (file && p != null) (out[file] ??= new Set()).add(p || '/')
      if (!m[2]) stack.push(p ?? parent)
    }
    // object routes (flat; nested children are rare enough to list as written)
    for (const m of src.matchAll(/\bpath\s*:\s*([^,}\n]+)[^}]*?\b(?:element\s*:\s*<\s*([A-Z]\w*)|Component\s*:\s*([A-Z]\w*))/g)) {
      const p = value(m[1]), file = fileOf(m[2] ?? m[3])
      if (file && p != null) (out[file] ??= new Set()).add(p.startsWith('/') ? p : `/${p}`)
    }
  }
  return out
}

/**
 * Pages for the changed files: { pages: [{ path, app, via, dynamic }], unmapped: [file] } (app = the package folder that serves the page).
 * `files` are repo-relative; `index` is the cache's files map ({ imports }).
 */
export function pagesFor(ctx, files, index) {
  const all = Object.keys(index)
  const routes = {}
  for (const [f, set] of Object.entries(declaredRoutes(ctx.repo, all, index))) routes[f] = [...set]
  for (const [f, p] of Object.entries(fileRoutes(ctx, all))) routes[f] = [p]
  const importers = {}
  for (const [f, e] of Object.entries(index)) for (const i of e.imports ?? []) (importers[i] ??= []).push(f)
  const pages = new Map(), unmapped = []
  for (const file of files) {
    // breadth-first up the import graph; stop at the first route layer (a primitive reaches every page: cap it)
    const seen = new Set([file]), found = []
    let layer = [file]
    for (let depth = 0; layer.length && depth < 8 && found.length < 12; depth++) {
      const hits = layer.filter((f) => routes[f] != null)
      if (hits.length) { found.push(...hits); break }
      layer = layer.flatMap((f) => importers[f] ?? []).filter((f) => !seen.has(f) && seen.add(f))
    }
    if (!found.length) { unmapped.push(file); continue }
    for (const f of found.slice(0, 12)) {
      const app = ctx.rel(ctx.ownerOf(path.join(ctx.repo, f)).dir) || '.'
      for (const p of routes[f]) {
        if (!pages.has(app + p)) pages.set(app + p, { path: p, app, via: [], dynamic: /[:*]/.test(p) })
        if (!pages.get(app + p).via.includes(file)) pages.get(app + p).via.push(file)
      }
    }
  }
  return { pages: [...pages.values()], unmapped }
}
