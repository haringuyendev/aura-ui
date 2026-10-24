// aura verify: the one check before an agent says a UI change is done.
// check (the changed files) + inspect (the pages that render them, found through the import graph and the
// router), one report, and a per-file record in .aura/cache/verify.json that the Stop hook reads.
import fs from 'node:fs'
import path from 'node:path'
import { formatFindings } from './check.mjs'
import { formatReport, inspect } from './inspect.mjs'
import { pagesFor } from './routes.mjs'

const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
const mtime = (abs) => fs.statSync(abs, { throwIfNoEntry: false })?.mtimeMs ?? 0
export const verifyFile = (ctx) => path.join(ctx.auraDir, 'cache', 'verify.json')
export function loadVerify(ctx) { try { return JSON.parse(fs.readFileSync(verifyFile(ctx), 'utf8')) } catch { return { files: {} } } }

/** Is this file's latest content verified clean? */
export function verifiedClean(ctx, rel, record = loadVerify(ctx)) {
  const e = record.files?.[rel]
  return !!e && e.ok && Math.abs(e.mtime - mtime(path.join(ctx.repo, rel))) < 1
}

/**
 * Base URL of the dev server for an app folder: inspect.baseUrl (a string, or { "<app dir>": url }), else ports
 * from that app's vite/next/… config and package.json scripts (only those when it declares any), else common defaults.
 */
export async function devServer(ctx, app = '.') {
  const conf = ctx.config.inspect?.baseUrl
  if (typeof conf === 'string') return { url: conf.replace(/\/$/, ''), tried: [] }
  if (conf && typeof conf === 'object' && conf[app]) return { url: conf[app].replace(/\/$/, ''), tried: [] }
  const dir = path.join(ctx.repo, app)
  const declared = new Set()
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^(vite|next|nuxt|astro|svelte|rsbuild|webpack)\.config\.|^package\.json$/.test(x)) : [])
    for (const m of read(path.join(dir, f)).matchAll(/(?:\bport\s*:\s*|--port[= ]|\s-p\s+|PORT=)(\d{4,5})/g)) declared.add(+m[1])
  const ports = declared.size ? [...declared] : [5173, 3000, 8080, 4321]
  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(500) })
      if (res.status < 500) return { url: `http://localhost:${port}`, tried: ports }
    } catch {}
  }
  return { url: null, tried: ports }
}

const matches = (pattern, real) => {
  const a = pattern.split('/'), b = real.replace(/[?#].*/, '').split('/')
  return a.length === b.length && a.every((s, i) => s === b[i] || s.startsWith(':') || s === '*')
}

/** Pick pages so every file is covered once (static pages first), then fill up to max. */
function choosePages(pages, max) {
  const order = [...pages].sort((x, y) => x.dynamic - y.dynamic || y.via.length - x.via.length)
  const chosen = [], covered = new Set()
  for (const p of order) if (!p.dynamic && p.via.some((f) => !covered.has(f)) && chosen.length < max) { chosen.push(p); p.via.forEach((f) => covered.add(f)) }
  for (const p of order) if (!p.dynamic && !chosen.includes(p) && chosen.length < max) chosen.push(p)
  return chosen
}

/**
 * opts: { files (abs), paths (explicit /routes or URLs), base, widths, wait, storageState, maxPages, skipInspect (reason), accept ([rules]), reason }
 * deps: { st, check(abs) → findings, index (cache files map) }
 * Returns { ok, text }.
 */
export async function verify(ctx, deps, opts) {
  const out = [], rels = opts.files.map((f) => ctx.rel(f))
  const accepted = new Set(opts.accept ?? [])
  out.push(`aura verify: ${rels.length} changed UI file(s)${rels.length ? `: ${rels.slice(0, 6).join(', ')}${rels.length > 6 ? ', …' : ''}` : ''}`)
  if (!rels.length) return { ok: true, text: out.concat('Nothing to verify (no changed UI files; pass --files or commit-free changes).').join('\n') }

  // 1. check
  const checkErr = {}
  const checkLines = []
  for (const abs of opts.files) {
    const f = deps.check(abs).filter((x) => !x.existing)
    const errs = f.filter((x) => x.severity === 'error' && !accepted.has(x.rule))
    if (errs.length) checkErr[ctx.rel(abs)] = errs.length
    if (f.length) checkLines.push(formatFindings(ctx.rel(abs), f))
  }
  out.push('', `── check ── ${Object.keys(checkErr).length ? `✗ ${Object.values(checkErr).reduce((a, b) => a + b, 0)} error(s)` : '✓ no errors'}`)
  if (checkLines.length) out.push(...checkLines)

  // 2. pages
  const fileOk = Object.fromEntries(rels.map((r) => [r, !checkErr[r]]))
  const pageErr = {}
  let inspected = 0, skipped = null
  const { pages, unmapped } = pagesFor(ctx, rels, deps.index)
  let targets = [] // { url, app, path, via }
  if (opts.paths?.length) {
    const app = pages[0]?.app ?? (rels[0] ? ctx.rel(ctx.ownerOf(path.join(ctx.repo, rels[0])).dir) || '.' : '.')
    for (const p of opts.paths) targets.push({ raw: p, app, path: p, via: pages.filter((x) => matches(x.path, p)).flatMap((x) => x.via) })
    // explicit pages: the agent chose what shows its change
    for (const t of targets) if (!t.via.length) t.via = rels
  } else {
    const max = opts.maxPages ?? ctx.config.verify?.maxPages ?? 6
    targets = choosePages(pages, max).map((p) => ({ app: p.app, path: p.path, via: p.via }))
    const dynamicOnly = rels.filter((r) => !targets.some((t) => t.via.includes(r)) && pages.some((p) => p.via.includes(r)))
    if (dynamicOnly.length) {
      const examples = [...new Set(pages.filter((p) => p.dynamic && p.via.some((f) => dynamicOnly.includes(f))).map((p) => p.path))].slice(0, 3)
      out.push('', `Pages with a parameter render ${dynamicOnly.join(', ')}: ${examples.join(', ')}. Pass a real one: aura verify ${examples[0].replace(/:(\w+)/g, '<$1>')}`)
      if (!opts.skipInspect) dynamicOnly.forEach((r) => (fileOk[r] = false))
    }
    const extra = pages.filter((p) => !p.dynamic && !targets.includes(p) && !targets.some((t) => t.path === p.path && t.app === p.app))
    if (extra.length) out.push(`Also rendered on ${extra.length} more page(s) not inspected this run: ${extra.slice(0, 6).map((p) => p.path).join(', ')}${extra.length > 6 ? ', …' : ''}`)
  }
  if (unmapped.length && !opts.paths?.length) out.push('', `Not rendered by any route yet (checked only): ${unmapped.join(', ')}`)

  if (opts.skipInspect) {
    skipped = opts.skipInspect
    out.push('', `── inspect ── skipped: ${skipped}`)
  } else if (targets.length) {
    // dev server per app
    const bases = {}
    for (const app of new Set(targets.map((t) => t.app))) bases[app] = opts.base ? { url: opts.base.replace(/\/$/, '') } : await devServer(ctx, app)
    const runnable = targets.filter((t) => /^https?:/.test(t.path) || bases[t.app].url)
    for (const app of Object.keys(bases).filter((a) => !bases[a].url)) {
      const t = targets.filter((x) => x.app === app)
      out.push('', `── inspect ── ✗ no dev server answering for ${app} (ports tried: ${bases[app].tried.join(', ')}). Start it, or pass --base <url>; if the pages can't be opened (login, no data), re-run with --skip-inspect "<why>" and tell the user.`)
      t.forEach((x) => x.via.forEach((r) => (fileOk[r] = false)))
    }
    if (runnable.length) {
      const urls = runnable.map((t) => (/^https?:/.test(t.path) ? t.path : bases[t.app].url + t.path))
      let reports = []
      try {
        reports = await inspect(ctx, urls, { widths: opts.widths, wait: opts.wait, storageState: opts.storageState })
      } catch (e) {
        out.push('', `── inspect ── ✗ ${e.message}`)
        runnable.forEach((t) => t.via.forEach((r) => (fileOk[r] = false)))
      }
      reports.forEach((rep, i) => {
        const fr = formatReport(rep, deps.st.rules)
        const errs = fr.findings.filter((f) => f.severity === 'error' && !accepted.has(f.rule)).length
        inspected++
        if (errs) { pageErr[runnable[i].path] = errs; runnable[i].via.forEach((r) => (fileOk[r] = false)) }
        out.push('', `── inspect ${runnable[i].path} ── ${errs ? `✗ ${errs} error(s)` : '✓ no errors'}${runnable[i].via.length < rels.length ? ` (shows ${runnable[i].via.map((v) => path.basename(v)).join(', ')})` : ''}`, fr.text)
      })
    }
  } else if (!opts.paths?.length && !unmapped.length) {
    out.push('', '── inspect ── no static page to open.')
  }

  // 3. record
  const ok = Object.values(fileOk).every(Boolean)
  const record = loadVerify(ctx)
  record.files ??= {}
  const at = Date.now()
  for (const r of rels) record.files[r] = { mtime: mtime(path.join(ctx.repo, r)), ok: fileOk[r], at }
  record.last = { at, ok, checkErrors: checkErr, pageErrors: pageErr, inspected, skipped, accepted: [...accepted], reason: opts.reason ?? null }
  fs.mkdirSync(path.dirname(verifyFile(ctx)), { recursive: true })
  fs.writeFileSync(verifyFile(ctx), JSON.stringify(record, null, 1))
  if (accepted.size || skipped) fs.appendFileSync(path.join(ctx.auraDir, 'cache', 'feedback.jsonl'), JSON.stringify({ at: new Date(at).toISOString(), files: rels, accepted: [...accepted], skipped, reason: opts.reason ?? skipped }) + '\n')

  const nErr = Object.values(checkErr).reduce((a, b) => a + b, 0) + Object.values(pageErr).reduce((a, b) => a + b, 0)
  out.push('', ok
    ? `✓ verified${skipped ? ' (inspect skipped: tell the user why)' : ''}${accepted.size ? ` (accepted: ${[...accepted].join(', ')} — say why in your reply)` : ''}`
    : `✗ not verified: ${nErr ? `${nErr} error(s) to fix` : 'pages not inspected'}. Fix, then run aura verify again. A finding that is wrong for this page: --accept <rule> --reason "<why>".`)
  return { ok, text: out.join('\n') }
}
