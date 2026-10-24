#!/usr/bin/env node
// Aura: the project's component UI manager.
//   aura init [--scripts]          scan the repo (a monorepo from its root), create .aura/, vendor the CLI; re-run to refresh bin/
//   aura find <need…>               components in this project that fit ("ô nhập liệu", "date range", "confirm dialog")
//   aura add <name…>                add primitives with shadcn (only after the user agreed; the hook asks them), then register them
//   aura scaffold <dashboard|list|detail|form> <file.tsx> [--name X]   write a page skeleton from the project's components
//   aura snippet <name> [--for file] import line, variants and real usages of a component
//   aura variant <Component> <name> [--tone t] [--classes "…"] [--write]   add a cva variant to a primitive (instead of styling a div)
//   aura show <name>                props, variants, description, import path(s), where it is used
//   aura usage <name>               files that import it
//   aura tokens                     colors, fonts, radius, status/chart tokens (and which are text-safe)
//   aura status                     project summary (what agents get at session start)
//   aura check [files…] [--changed] [--existing] [--json]   run the rules; exit 1 on new errors
//   aura verify [/path…] [--base url] [--files a,b] [--skip-inspect "why"] [--accept rule --reason "why"]
//                                   the check before saying UI work is done: check the changed files + inspect the pages
//                                   that render them (found through imports and the router); the Stop hook requires it
//   aura inspect <url> [/path…] [--widths 1440,768,390] [--shot] [--json]   open the pages headless and report
//                                   layout, KPI emphasis, data color, repeated content and button problems as text
//   aura doctor                     what Aura couldn't detect in this repo, and the rules.json key that fixes it
//   aura stats [--changed] [--json] findings per rule, new vs existing, and the files with the most
//   aura describe <name> --summary "…" [--use "a; b"] [--avoid "…"] [--keywords "vi, en"] [--example "…"]
//   aura describe --from <file.json> describe many at once: [{ name, summary, use_when, avoid_when, keywords, example }]
//   aura baseline                   accept current findings as existing (hooks then block only new ones)
//   aura scan                       full rescan (normally not needed: every command refreshes incrementally)
//   aura hook <session-start|pre-tool|post-edit|post-bash|stop|subagent-stop|skill-nudge>   called by agent hooks with the event JSON on stdin
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createContext, workspaceDirs } from './context.mjs'
import { files, isInitialised, loadProfile, refresh } from './registry.mjs'
const readRegistry = (ctx) => { try { return JSON.parse(fs.readFileSync(files(ctx).registry, 'utf8')) } catch { return { components: [] } } }
import { DEFAULT_RULES, applyBaseline, checkFile, formatFindings, hasErrors, loadBaseline, loadRules, snapshotBaseline } from './check.mjs'
import { findComponents, formatComponent } from './find.mjs'
import { formatReport, inspect, resolveUrls } from './inspect.mjs'
import { SHADCN, addCommand, addsPrimitives, hasComponent, installNames } from './primitives.mjs'
import { loadVerify, verifiedClean, verify } from './verify.mjs'
import { SCAFFOLDS, addVariant, scaffold, snippet } from './scaffold.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
const has = (name) => argv.includes(`--${name}`)
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--') && !['--changed', '--json', '--scripts', '--existing', '--full', '--shot', '--dry-run', '--write', '--force'].includes(all[i - 1])))

/** The nearest folder with .aura/ going up; else the monorepo root (package.json workspaces); else the nearest package.json. */
function findRepoRoot(start) {
  let dir = path.resolve(start), nearest = null, workspaceRoot = null
  for (;;) {
    if (fs.existsSync(path.join(dir, '.aura', 'registry.json'))) return dir
    if (fs.existsSync(path.join(dir, 'package.json'))) { nearest ??= dir; if (workspaceDirs(dir).length) workspaceRoot = dir }
    const up = path.dirname(dir)
    if (fs.existsSync(path.join(dir, '.git')) || up === dir) break
    dir = up
  }
  return workspaceRoot ?? nearest ?? path.resolve(start)
}

function summary(ctx, profile, registry) {
  const p = profile, list = (a) => (a?.length ? a.join(', ') : '—')
  const status = Object.entries(p.tokens.status ?? {}).map(([r, s]) => `${r}=${s.token ?? 'missing'}${s.textSafe === false ? ` (bg only${s.textToken ? `; text: ${s.textToken}` : ''})` : ''}`).join(', ')
  const top = registry.components.filter((c) => c.category !== 'section').slice(0, 14).map((c) => `${c.name}(${c.usedBy})`).join(', ')
  return [
    `Aura manages UI components in this repo (${p.repo}). Ask it instead of scanning component folders:`,
    `  node .aura/bin/aura.mjs find "<what you need>"   ·   snippet <Name>   ·   scaffold <kind> <file>   ·   variant <Component> <name>   ·   add <name>   ·   verify   ·   tokens`,
    `Stack: ${list(p.stack.framework)} · ${list(p.stack.styling)} · UI: ${list(p.stack.ui)} · icons: ${list(p.stack.icons)}${p.stack.cms ? ` · CMS: ${list(p.stack.cms)}` : ''}`,
    `Tokens: ${list([...p.tokens.files, ...(p.tokens.tailwindConfigs ?? [])])}${p.tokens.themeFiles?.length ? ` · theme in code: ${p.tokens.themeFiles.join(', ')} (style through the library's theme props/tokens, not classes)` : ''} · dark: ${p.tokens.darkSelector ?? 'none'} · ${p.tokens.colors.length} colors · fonts: ${Object.keys(p.tokens.fonts).join(', ') || '—'} · status: ${status} · chart: ${p.tokens.chartTokens}/5`,
    p.workspaces?.length ? `Monorepo: ${p.workspaces.length} packages (${p.workspaces.map((w) => w.dir).join(', ')}). Import a package's components by its public path (e.g. "${registry.components.find((c) => c.package && c.importInPackage)?.import ?? '@scope/ui/components/button'}"); inside that package use its local path (show prints both).` : '',
    p.components.scope === 'primitives'
      ? `Building blocks (${registry.components.length}: ${p.components.primitives.length} primitives in ${p.components.uiDir}${registry.components.length > p.components.primitives.length ? ` + ${registry.components.length - p.components.primitives.length} blocks` : ''}): compose new screens from these. App-specific components are not indexed (scope "primitives"; "all" in .aura/rules.json indexes them). Most used: ${top}`
      : `Components (${registry.components.length}): ${p.components.uiDir ? `${p.components.primitives.length} primitives in ${p.components.uiDir}` : registry.library?.length ? 'primitives come from the UI library (below)' : 'no primitives folder (see aura doctor)'}, ${p.components.components} shared, ${p.components.sectionFiles ?? p.components.sections.length} in sections/features. Most used: ${top}`,
    registry.library?.length ? `UI library components in use (the project's primitives too; import from the library): ${registry.library.slice(0, 16).map((c) => `${c.name}(${c.usedBy})`).join(', ')} — from ${[...new Set(registry.library.map((c) => c.import.split('/').slice(0, c.import.startsWith('@') ? 2 : 1).join('/')))].join(', ')}` : '',
    p.conventions.length ? `Conventions: ${p.conventions.join(' · ')}` : '',
    `Workflow for UI work: 1) aura find / aura snippet to pick components; a MISSING primitive → ask the user, then aura add <name> (never hand-build it from divs) · 2) start pages from aura scaffold <dashboard|list|detail|form> <file> · 3) a look a primitive lacks (severity tone, accent) → aura variant <Component> <name> · 4) before saying done: aura verify (checks changed files, inspects the pages that render them) until it prints ✓ verified.`,
    `Enforced by hooks: edits (Write/Edit and shell) are checked — duplicates, raw HTML controls, divs styled as Card/Item/Alert/Badge, undefined color tokens, foreign UI libraries are blocked; new primitives need the user's approval; the agent can't finish until aura verify passes for what it changed. New components must be described (aura describe).`,
    `Skills: aura-ui:build (design rules) · aura-ui:find (components, adding primitives) · aura-ui:inspect (aura verify / inspect) · aura-ui:check (when a hook blocks) · aura-ui:describe.`,
  ].filter(Boolean).join('\n')
}

/**
 * What Aura couldn't work out in this repo, each with the fix (usually a key in .aura/rules.json).
 * Agents run this after init and adapt the config, so Aura fits any repo layout.
 */
function doctor(ctx, r) {
  const notes = [], comps = r.registry.components, lib = r.registry.library ?? [], t = r.tokens
  const uiFramework = ['react', 'vue', 'svelte', 'solid-js', 'preact'].some((d) => ctx.deps[d])
  if (!uiFramework) notes.push(ctx.deps['@angular/core'] ? 'Angular project: Aura analyses React/Vue/Svelte components only; registry and checks will be sparse.' : 'No React/Vue/Svelte dependency found in any package.json; is this the right folder? (In a monorepo, run from the root.)')
  if (!comps.length) notes.push('No components registered. If components live in an unusual place or extension, set "primitivesDir" (and check the folder is not git-ignored build output).')
  if (!ctx.uiDir && !lib.length) {
    // Suggest the folder whose components are imported the most.
    const byDir = {}
    for (const c of comps) { const d = path.dirname(c.path); byDir[d] = (byDir[d] ?? 0) + (c.usedBy ?? 0) }
    const top = Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, n]) => n > 0)
    notes.push(`No primitives folder found (shadcn components.json, components/ui, a ui/design-system package). If the project has base components, set "primitivesDir"${top.length ? `; most-imported folders: ${top.map(([d, n]) => `${d} (${n} imports)`).join(', ')}` : ''}.`)
  }
  if (!t.colors.length) notes.push(t.themeFiles?.length ? `Theme is defined in code (${t.themeFiles[0]}); class-based token checks are skipped. Styling should go through the library's theme tokens.` : ctx.deps.tailwindcss ? 'Tailwind without custom color tokens: undefined-token is skipped (only raw-color warns). If tokens live in a CSS file Aura did not read, set "tokenFiles".' : 'No design tokens found (CSS variables, Tailwind config or theme file). Set "tokenFiles" if they exist.')
  else if (!t.darkSelector) notes.push('No dark-mode token block found (.dark / [data-theme=dark]); fine if the app has no dark mode.')
  const missingStatus = Object.entries(t.status ?? {}).filter(([, v]) => !v.token).map(([k]) => k)
  if (t.colors.length && missingStatus.length) notes.push(`No ${missingStatus.join('/')} status token: screens may hard-code those colors. Consider adding them to ${t.files[0] ?? 'the token file'}.`)
  // Local-looking imports that didn't resolve point at aliases Aura doesn't know.
  const unresolved = {}
  for (const c of comps.slice(0, 400)) {
    const abs = path.join(ctx.repo, c.path)
    const src = (() => { try { return fs.readFileSync(abs, 'utf8') } catch { return '' } })()
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1]
      if (!/^(\.|#|~|@\/|\$)/.test(spec) || ctx.resolveImport(spec, abs)) continue
      const key = spec.startsWith('.') ? 'relative paths' : spec.split('/')[0]
      unresolved[key] = (unresolved[key] ?? 0) + 1
    }
  }
  const un = Object.entries(unresolved).filter(([k, n]) => k !== 'relative paths' && n >= 3)
  if (un.length) notes.push(`Imports Aura can't resolve: ${un.map(([k, n]) => `${k}/… (${n})`).join(', ')}. Usage counts miss them; add the alias to tsconfig "paths" or package.json "imports" (Aura reads both).`)
  if (ctx.monorepo && !ctx.uiDir && lib.length === 0) notes.push('Monorepo without a detected UI package: set "primitivesDir" to the shared components folder.')
  return notes
}

// Rules a baseline without a "rules" list was taken with (before 1.5).
const LEGACY_RULES = Object.keys(DEFAULT_RULES).filter((k) => k !== 'hand-built-surface')
/**
 * Keep an older baseline working with this version, once: a rule added after it was taken would block every old
 * occurrence the moment a file is edited, so its current findings are accepted; count-only entries get the keys
 * of the findings they stand for, so later matching is by content.
 */
function upgradeBaseline(ctx, r) {
  let json
  try { json = JSON.parse(fs.readFileSync(files(ctx).baseline, 'utf8')) } catch { return }
  json.files ??= {}
  const missing = Object.keys(DEFAULT_RULES).filter((k) => !(json.rules ?? LEGACY_RULES).includes(k))
  const keyless = Object.values(json.files).some((byRule) => Object.values(byRule).some((v) => !v?.keys))
  // Before 1.5 pages/layouts/route files weren't checked: their current findings are old too.
  const pagesNew = !json.pagesChecked
  if (!missing.length && !keyless && !pagesNew) return
  const st = { ...state(ctx, r, false), baseline: {} }
  for (const p of r.uiFiles) {
    const entry = json.files[p]
    const routeFile = pagesNew && ctx.isRouteFile(path.join(ctx.repo, p))
    if (!missing.length && !entry && !routeFile) continue
    const found = checkFile(ctx, st, path.join(ctx.repo, p)).filter((f) => f.severity === 'error' || f.severity === 'warn')
    for (const rule of new Set(found.map((f) => f.rule))) {
      const mine = found.filter((f) => f.rule === rule)
      const old = entry?.[rule]
      const take = routeFile || missing.includes(rule) ? mine : old && !old.keys ? mine.slice(0, typeof old === 'number' ? old : old.count) : []
      if (take.length) ((json.files[p] ??= {})[rule] = { count: take.length, lines: take.map((f) => f.line), keys: take.map((f) => f.key) })
    }
    // count-only entries whose findings are gone
    for (const [rule, v] of Object.entries(json.files[p] ?? {})) if (!v?.keys) delete json.files[p][rule]
  }
  json.rules = Object.keys(DEFAULT_RULES)
  json.pagesChecked = true
  fs.writeFileSync(files(ctx).baseline, JSON.stringify(json, null, 2) + '\n')
}

function state(ctx, r, upgrade = true) {
  if (upgrade) upgradeBaseline(ctx, r)
  return { registry: r.registry, tokens: r.tokens, rules: loadRules(ctx), profile: loadProfile(ctx), baseline: loadBaseline(ctx), allow: ctx.config.allowUiLibraries ?? [] }
}
/** Check a file and mark findings that were already there when aura was added. */
function checkWithBaseline(ctx, st, abs, opts) {
  return applyBaseline(ctx.rel(abs), checkFile(ctx, st, abs, opts), st.baseline)
}
function writeBaseline(ctx, r) {
  const st = { ...state(ctx, r, false), baseline: {} }
  const entries = r.uiFiles.map((p) => ({ file: p, findings: checkFile(ctx, st, path.join(ctx.repo, p)) }))
  const snap = snapshotBaseline(entries)
  fs.writeFileSync(files(ctx).baseline, JSON.stringify(snap, null, 2) + '\n')
  return Object.values(snap.files).reduce((n, rules) => n + Object.values(rules).reduce((a, b) => a + (typeof b === 'number' ? b : b.count), 0), 0)
}

// The plugin version this CLI belongs to (next to it in the plugin; written into .aura/bin/VERSION when vendored).
const VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(here, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version } catch {}
  try { return fs.readFileSync(path.join(here, 'VERSION'), 'utf8').trim() } catch { return null }
})()
/** Copy this CLI into .aura/bin so the team, CI and agents run it without the plugin. */
function vendorCli(ctx) {
  const bin = path.join(ctx.auraDir, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  for (const file of fs.readdirSync(here).filter((x) => x.endsWith('.mjs'))) fs.copyFileSync(path.join(here, file), path.join(bin, file))
  const catalog = path.join(here, '..', 'catalog', 'components.json')
  if (fs.existsSync(catalog)) fs.copyFileSync(catalog, path.join(bin, 'aura-catalog.json'))
  if (VERSION) fs.writeFileSync(path.join(bin, 'VERSION'), VERSION + '\n')
}
/**
 * Hooks and skills tell agents to run .aura/bin/aura.mjs: keep it at the plugin's version, or an agent told to run
 * a new command (verify, scaffold…) gets an old CLI that doesn't have it. Skipped with "cli": "local" (patched copy).
 */
function syncVendoredCli(ctx) {
  const bin = path.join(ctx.auraDir, 'bin')
  if (!VERSION || ctx.config.cli === 'local' || !fs.existsSync(path.join(here, '..', '.claude-plugin'))) return null
  let current = null
  try { current = fs.readFileSync(path.join(bin, 'VERSION'), 'utf8').trim() } catch {}
  if (current === VERSION) return null
  vendorCli(ctx)
  return current ?? 'older'
}

function requireInit(ctx) {
  if (!isInitialised(ctx)) { console.error(`No .aura/ in ${ctx.repo}. Run: aura init`); process.exit(2) }
}

function changedFiles(ctx) {
  try {
    const out = execSync('git status --porcelain --untracked-files=all', { cwd: ctx.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop()).map((p) => path.join(ctx.repo, p)).filter((p) => fs.existsSync(p))
  } catch { return [] }
}

// ---------------- commands ----------------
async function main() {
  if (cmd === 'hook') return hook(argv[1])
  if (!cmd || cmd === 'help') return console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1).filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  const ctx = createContext(findRepoRoot(process.cwd()))

  if (cmd === 'init') {
    const again = isInitialised(ctx)
    const r = refresh(ctx, { full: true })
    const f = files(ctx)
    if (!fs.existsSync(f.rules)) fs.writeFileSync(f.rules, JSON.stringify({
      $comment: 'rules: error blocks the agent, warn reports, info hints, off disables. Optional: primitivesDir (folder of base components), tokenFiles (CSS entry files; @imports are followed), allowUiLibraries (import prefixes allowed besides the detected ones), cli ("local" makes hooks run .aura/bin instead of the plugin copy), inspect ({ baseUrl (a URL, or { "apps/web": url } per app), widths, storageState, kpiRatio, minDataColor, repeatSections, maxKpis, tapTarget } for aura inspect/verify; its rules go in "rules" too), verify ({ mode: "required" (Stop hook needs aura verify) | "off", maxPages, maxStopBlocks })',
      rules: DEFAULT_RULES,
      allowUiLibraries: [],
    }, null, 2) + '\n')
    vendorCli(ctx)
    fs.writeFileSync(path.join(ctx.auraDir, '.gitignore'), 'cache/\n')
    if (has('scripts') && ctx.pkg && fs.existsSync(path.join(ctx.repo, 'package.json'))) {
      const pkgPath = path.join(ctx.repo, 'package.json')
      const raw = fs.readFileSync(pkgPath, 'utf8')
      const pkg = JSON.parse(raw)
      if (!pkg.scripts?.aura) {
        pkg.scripts = { ...pkg.scripts, aura: 'node .aura/bin/aura.mjs', 'aura:check': 'node .aura/bin/aura.mjs check --changed' }
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, raw.match(/^(\s+)"/m)?.[1].length ?? 2) + '\n')
      }
    }
    const existing = fs.existsSync(files(ctx).baseline) ? null : writeBaseline(ctx, r)
    console.log(summary(ctx, loadProfile(ctx), r.registry))
    console.log(again ? `\nUpdated .aura/ (rescanned, bin/ refreshed from the plugin; rules and baseline kept).` : `\nCreated .aura/ (registry.json, profile.json, rules.json, baseline.json, bin/). Commit it; .aura/cache is ignored.`)
    if (!has('scripts')) console.log(`package.json left untouched. Team members run: node .aura/bin/aura.mjs check --changed (or re-run init with --scripts to add "aura" / "aura:check").`)
    const nested = ctx.workspaces.filter((w) => fs.existsSync(path.join(ctx.repo, w.dir, '.aura', 'registry.json'))).map((w) => `${w.dir}/.aura`)
    if (nested.length) console.log(`Note: ${nested.join(', ')} from an earlier per-package init is now redundant (this root registry covers every package); delete it.`)
    const notes = doctor(ctx, r)
    if (notes.length) console.log(`\nCheck these (fix in .aura/rules.json, then aura scan; aura doctor re-checks):\n${notes.map((n) => `- ${n}`).join('\n')}`)
    if (existing !== null) console.log(`Baseline: ${existing} existing finding(s) recorded; hooks will only block new ones (see: aura check).`)
    console.log(`${r.registry.components.length} ${r.scope === 'primitives' ? 'primitives' : 'components'} registered${r.registry.library?.length ? ` + ${r.registry.library.length} UI library components` : ''}, ${r.registry.components.filter((c) => !c.described).length} without a description yet; ${r.uiFiles.length} UI files checked by the hooks.`)
    return
  }

  if (cmd === 'inspect') {
    const opts = { shot: has('shot') }
    if (flag('widths')) opts.widths = flag('widths').split(',').map(Number).filter(Boolean)
    if (flag('wait')) opts.wait = Number(flag('wait'))
    if (flag('storage')) opts.storageState = flag('storage')
    let reports
    try { reports = await inspect(ctx, resolveUrls(positional, ctx.config.inspect?.baseUrl), opts) } catch (e) { console.error(`aura inspect: ${e.message}`); process.exit(1) }
    if (!reports.length) return console.error('usage: aura inspect <url> [/path…] (or set "inspect": { "baseUrl": "http://localhost:5173" } in .aura/rules.json)')
    const out = reports.map((rep) => formatReport(rep, ctx.config.rules ?? {}))
    if (has('json')) console.log(JSON.stringify(reports.map((rep, i) => ({ url: rep.url, stats: rep.stats, outline: rep.outline, findings: out[i].findings })), null, 2))
    else console.log(out.map((o) => o.text).join('\n\n'))
    if (out.some((o) => o.errors)) process.exitCode = 1
    return
  }

  requireInit(ctx)
  syncVendoredCli(ctx)
  const r = refresh(ctx, { full: cmd === 'scan' })
  const everything = [...r.registry.components, ...(r.registry.library ?? [])]
  const byName = (n) => everything.find((c) => c.name.toLowerCase() === n.toLowerCase()) ?? everything.find((c) => c.exports.some((e) => e.toLowerCase() === n.toLowerCase()))

  if (cmd === 'doctor') {
    const notes = doctor(ctx, r)
    console.log(notes.length ? `aura doctor:\n${notes.map((n) => `- ${n}`).join('\n')}\nConfig keys (.aura/rules.json): primitivesDir, tokenFiles, allowUiLibraries, rules, cli.` : 'aura doctor: detection looks complete.')
  } else if (cmd === 'scan' || cmd === 'status') {
    console.log(summary(ctx, loadProfile(ctx), r.registry))
    const { added, removed, updated, moved } = r.changes
    if (added.length + removed.length + updated.length + moved.length) console.log(`\nChanges since last scan: +${added.length} −${removed.length} ~${updated.length} moved ${moved.length}`)
    // Primitive health: what nobody uses and what agents can't find yet.
    const prims = r.registry.components.filter((c) => c.category === 'primitive')
    const unused = prims.filter((c) => !c.usedBy), undescribed = prims.filter((c) => !c.described)
    if (prims.length) console.log(`\nPrimitives: ${prims.length}${unused.length ? ` · unused (${unused.length}): ${unused.map((c) => c.name).join(', ')}` : ''}${undescribed.length ? ` · no description (${undescribed.length}): ${undescribed.slice(0, 12).map((c) => c.name).join(', ')}${undescribed.length > 12 ? ', …' : ''} (aura-ui:describe)` : ''}`)
  } else if (cmd === 'find') {
    const q = positional.join(' ')
    if (!q) return console.error('usage: aura find <what you need>')
    const { results, aura } = findComponents({ components: everything }, q)
    if (!results.length) console.log(`No component in this project matches "${q}".`)
    for (const { component, why } of results) console.log(formatComponent(component) + (why.length ? `\n  (${why.join(', ')})` : ''))
    // Catalog matches the project doesn't have: primitives are proposed to the user (aura add asks them), blocks are composed, add-ons installed.
    const missing = aura.filter((a) => !hasComponent(everything, a.name))
    if (missing.length) {
      const starterApp = r.registry.components.some((c) => c.name === 'data-table' && /components\/blocks\//.test(c.path))
      const installer = path.join(here, '..', 'scripts', 'add-block.mjs')
      const addBlock = (name) => `node ${fs.existsSync(installer) ? JSON.stringify(installer) : '"${CLAUDE_PLUGIN_ROOT}/scripts/add-block.mjs"'} ${name} .`
      const lines = missing.map((a) => {
        const names = installNames(a.name)
        if (a.kind === 'addon') return starterApp ? `${a.name}: aura add-on, install with: ${addBlock((a.install ?? '').match(/add-block\.mjs (\S+)/)?.[1] ?? a.name)}` : `${a.name} (${a.summary.split('.')[0]}) [aura add-on for starter apps; port it to this project's primitives]`
        if (a.kind === 'block' && !(names && results.length === 0)) return `${a.name} (${a.summary.split('.')[0]}) [aura block: compose it from the project's primitives${starterApp ? `; install: ${addBlock(a.name)}` : ''}]`
        if (!names) return `${a.name} (${a.summary.split('.')[0]}) [not in this project and not installable automatically: propose to the user how to add it]`
        const add = addCommand(ctx, names.filter((n) => !hasComponent(everything, n)))
        return `${a.name} (${a.summary.split('.')[0]}): MISSING PRIMITIVE. Ask the user first, then: node .aura/bin/aura.mjs add ${names.join(' ')}${add ? ` (runs ${add.text})` : ' (no shadcn components.json here: propose to the user how to add it)'}`
      })
      console.log(`\nNot in the project:\n  ${lines.join('\n  ')}`)
      if (missing.some((a) => installNames(a.name) && a.kind !== 'addon')) console.log('Don\'t hand-build a missing primitive from divs. Ask the user whether to add it; if they decline, compose from what exists and say so.')
    } else if (!results.length) console.log('Nothing in the project or the aura catalog fits. Propose a new primitive to the user before building one.')
  } else if (cmd === 'add') {
    // Install primitives the user approved (the PreToolUse hook asks them), then register them.
    const names = positional.filter((n) => !hasComponent(everything, n))
    const skipped = positional.filter((n) => hasComponent(everything, n))
    if (!positional.length) return console.error('usage: aura add <name…>   (shadcn registry names, e.g. calendar popover; aura find prints them)')
    if (skipped.length) console.log(`Already in the project: ${skipped.join(', ')} (aura show <name>)`)
    if (!names.length) return
    const unknown = names.filter((n) => !SHADCN.has(n))
    const command = addCommand(ctx, names)
    if (!command) return console.error(`aura add: no shadcn components.json in ${ctx.rel(ctx.uiDir ?? ctx.repo) || '.'}; add ${names.join(', ')} the way this project adds UI components, after the user agrees.`), process.exit(1)
    if (unknown.length) console.log(`Note: ${unknown.join(', ')} ${unknown.length > 1 ? 'are' : 'is'} not a known shadcn item; trying anyway.`)
    if (has('dry-run')) return console.log(command.text)
    console.log(`$ ${command.text}`)
    const res = spawnSync(command.argv[0], command.argv.slice(1), { cwd: command.dir, stdio: 'inherit' })
    if (res.status !== 0) return console.error(`aura add: the shadcn command failed (exit ${res.status ?? res.error?.message}).`), process.exit(1)
    const after = refresh(ctx)
    const added = after.changes.added
    console.log(added.length ? `Added: ${added.join(', ')}. Describe each one: node .aura/bin/aura.mjs describe <Name> --summary "…" --use "…" --keywords "vi, en"` : 'No new primitive files appeared (already installed, or the registry item has another name).')
  } else if (cmd === 'scaffold') {
    const [kind, out] = positional
    if (!SCAFFOLDS.includes(kind) || !out) return console.error(`usage: aura scaffold <${SCAFFOLDS.join('|')}> <file.tsx> [--name Orders] [--force]`), process.exit(2)
    const abs = path.resolve(out)
    if (!/\.(tsx|jsx)$/.test(abs)) return console.error('aura scaffold writes React (.tsx/.jsx) pages.'), process.exit(2)
    if (fs.existsSync(abs) && !has('force')) return console.error(`aura scaffold: ${ctx.rel(abs)} exists (--force to overwrite).`), process.exit(2)
    const res = scaffold(ctx, { comps: everything, tokens: r.tokens }, kind, abs, flag('name'))
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, res.code)
    const after = refresh(ctx)
    const findings = checkWithBaseline(ctx, state(ctx, after), abs, { isNew: true }).filter((f) => !f.existing)
    console.log(`Wrote ${ctx.rel(abs)}: ${kind} skeleton exporting ${res.Name}, built from the project's ${[...new Set(res.code.match(/from "[^"]+"/g) ?? [])].length} component module(s).`)
    if (res.missing.length) console.log(`Not in the project (left as TODO): ${res.missing.join(', ')}. aura find shows how to add them; ask the user first.`)
    for (const n of res.notes) console.log(`Note: ${n}`)
    if (findings.length) console.log(formatFindings(ctx.rel(abs), findings))
    console.log(`Next: wire it to a route, replace the sample data and TODO text (keep the structure: what needs action first, one STATUS map, key numbers emphasized), then run: node .aura/bin/aura.mjs verify`)
  } else if (cmd === 'snippet') {
    const c = byName(positional[0] ?? '')
    if (!c) return console.log(`Unknown component "${positional[0]}". Try: aura find ${positional[0] ?? ''}`)
    console.log(snippet(ctx, c, flag('for') ? path.resolve(flag('for')) : null))
  } else if (cmd === 'variant') {
    const [compName, name] = positional
    const c = compName && byName(compName)
    if (!c || !name) return console.error('usage: aura variant <Component> <name> [--tone destructive|warning|success|info] [--classes "…"] [--prop variant] [--write]'), process.exit(2)
    if (c.category === 'library') return console.error(`aura variant: ${c.name} comes from ${c.import}; extend it through the library's theme instead.`), process.exit(2)
    let res
    try { res = addVariant(ctx, c, r.tokens, { name, tone: flag('tone'), classes: flag('classes'), prop: flag('prop') }) } catch (e) { return console.error(`aura variant: ${e.message}`), process.exit(1) }
    const line = res.after.split('\n').findIndex((l, i) => l !== res.src.split('\n')[i])
    console.log(`${has('write') ? 'Added' : 'Would add'} to ${res.cva} in ${c.path}:\n${res.after.split('\n').slice(line, line + 3).map((l) => '+ ' + l).join('\n')}\nUse: ${res.usage}`)
    if (!has('write')) return console.log('Re-run with --write to apply (it changes a shared primitive: mention it to the user).')
    fs.writeFileSync(res.file, res.after)
    refresh(ctx)
    const findings = checkWithBaseline(ctx, state(ctx, refresh(ctx)), res.file).filter((f) => !f.existing)
    if (findings.length) console.log(formatFindings(c.path, findings))
  } else if (cmd === 'show') {
    const c = byName(positional[0] ?? '')
    console.log(c ? formatComponent(c, { detail: true }) : `Unknown component "${positional[0]}". Try: aura find ${positional[0] ?? ''}`)
  } else if (cmd === 'usage') {
    const c = byName(positional[0] ?? '')
    if (!c) return console.log(`Unknown component "${positional[0]}"`)
    const cache = JSON.parse(fs.readFileSync(files(ctx).cache, 'utf8'))
    const users = Object.entries(cache.files).filter(([, e]) => e.imports.includes(c.path) || e.lib?.includes(c.path)).map(([p]) => p)
    console.log(`${c.name} is imported by ${users.length} file(s):\n${users.map((u) => '  ' + u).join('\n')}`)
  } else if (cmd === 'tokens') {
    const t = r.tokens
    console.log(`Token files: ${[...t.files, ...(t.tailwindConfigs ?? [])].join(', ') || '—'}${t.themeFiles?.length ? ` · theme in code: ${t.themeFiles.join(', ')}` : ''} · dark selector: ${t.darkSelector ?? 'none'} · radius: ${t.radius}`)
    console.log(`Colors (bg-/text-/border-…): ${t.colors.join(', ') || '— (no color tokens found; undefined-token is skipped)'}${t.colorPrefixes?.length ? ` · any shade of: ${t.colorPrefixes.join(', ')}` : ''}`)
    console.log(`Fonts: ${Object.entries(t.fonts).map(([k, v]) => `font-${k} = ${v.split(',')[0]}`).join(', ')}`)
    for (const [role, s] of Object.entries(t.status)) console.log(`Status ${role}: ${s.token ? `${s.token} (${s.contrastOnBackground}:1 on background${s.textSafe ? ', text-safe' : `, background/tint only${s.textToken ? `; for text use ${s.textToken}` : ''}`})` : 'missing'}`)
    console.log(`Chart tokens: ${t.chartTokens}/5${t.customUtilities.length ? ` · custom utilities: ${t.customUtilities.join(', ')}` : ''}`)
  } else if (cmd === 'check' || cmd === 'stats') {
    const scope = has('changed') ? 'changed files (git status)' : positional.length ? positional.join(', ') : `all ${r.uiFiles.length} UI files`
    const targets = (has('changed') ? changedFiles(ctx) : positional.length ? positional.map((p) => path.resolve(p)).flatMap((p) => (fs.statSync(p, { throwIfNoEntry: false })?.isDirectory() ? ctx.walk(p, ['.tsx', '.jsx', '.vue', '.svelte']) : [p])) : r.uiFiles.map((p) => path.join(ctx.repo, p))).filter((t) => ctx.isUiPath(t))
    const st = state(ctx, r)
    const all = targets.map((t) => ({ file: ctx.rel(t), findings: checkWithBaseline(ctx, st, t, { isNew: r.changes.added.includes(ctx.rel(t)) || r.changes.newFiles.includes(ctx.rel(t)) }) }))
    if (cmd === 'stats') {
      // Findings per rule, split into new and existing (baseline), plus the files with the most.
      const rows = {}
      for (const { findings } of all) for (const f of findings) { const row = (rows[f.rule] ??= { severity: f.severity, new: 0, existing: 0, files: 0 }); row[f.existing ? 'existing' : 'new']++ }
      for (const { findings } of all) for (const rule of new Set(findings.map((f) => f.rule))) rows[rule].files++
      if (has('json')) return console.log(JSON.stringify(rows, null, 2))
      console.log(`aura stats (${scope}, ${targets.length} files)`)
      for (const [rule, x] of Object.entries(rows).sort((a, b) => b[1].new - a[1].new)) console.log(`  ${rule.padEnd(22)} ${x.severity.padEnd(5)} new ${String(x.new).padStart(4)} · existing ${String(x.existing).padStart(4)} · in ${x.files} files`)
      const worst = all.map((x) => [x.file, x.findings.filter((f) => !f.existing).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 5)
      if (worst.length) console.log(`Most new findings: ${worst.map(([f, n]) => `${f} (${n})`).join(', ')}`)
      return
    }
    // Default: only what needs action; --existing adds baseline findings (with their current lines).
    const report = all.map((x) => ({ ...x, findings: has('existing') ? x.findings : x.findings.filter((f) => !f.existing) })).filter((x) => x.findings.length)
    if (has('json')) console.log(JSON.stringify(report, null, 2))
    else {
      const hidden = all.reduce((n, x) => n + x.findings.filter((f) => f.existing).length, 0)
      console.log(`aura check: ${scope}, ${targets.length} files${!has('existing') && hidden ? ` (${hidden} existing finding(s) from the baseline hidden; --existing lists them, stats counts them)` : ''}`)
      console.log(report.length ? report.map((x) => formatFindings(x.file, x.findings)).join('\n') : 'no findings')
    }
    if (report.some((x) => hasErrors(x.findings))) process.exitCode = 1
  } else if (cmd === 'verify') {
    if (flag('accept') && !flag('reason')) return console.error('aura verify: --accept needs --reason "<why the finding is wrong for this page>" (it is shown to the user).'), process.exit(2)
    // Changed = git status + what agent sessions of the last 12 hours touched (shell edits, already-committed work, no git).
    const recent = fs.existsSync(path.join(ctx.auraDir, 'cache')) ? fs.readdirSync(path.join(ctx.auraDir, 'cache')).filter((f) => /^session-.*\.json$/.test(f)).map((f) => path.join(ctx.auraDir, 'cache', f)).filter((f) => Date.now() - fs.statSync(f).mtimeMs < 12 * 3600e3) : []
    const touched = recent.flatMap((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).touched ?? [] } catch { return [] } }).map((p) => path.join(ctx.repo, p))
    const list = flag('files') ? flag('files').split(',').map((f) => path.resolve(f.trim())) : [...new Set([...changedFiles(ctx), ...touched])]
    const targets = list.filter((t) => fs.existsSync(t) && ctx.isUiPath(t))
    const st = state(ctx, r)
    const index = JSON.parse(fs.readFileSync(files(ctx).cache, 'utf8')).files
    const res = await verify(ctx, { st, index, check: (abs) => checkWithBaseline(ctx, st, abs, { isNew: r.changes.added.includes(ctx.rel(abs)) || r.changes.newFiles.includes(ctx.rel(abs)) }) }, {
      files: targets,
      paths: positional,
      base: flag('base'),
      widths: flag('widths')?.split(',').map(Number).filter(Boolean),
      wait: flag('wait') ? Number(flag('wait')) : undefined,
      storageState: flag('storage'),
      maxPages: flag('max-pages') ? Number(flag('max-pages')) : undefined,
      skipInspect: flag('skip-inspect'),
      accept: flag('accept')?.split(',').map((x) => x.trim()).filter(Boolean),
      reason: flag('reason'),
    })
    console.log(res.text)
    if (!res.ok) process.exitCode = 1
  } else if (cmd === 'baseline') {
    console.log(`Baseline updated: ${writeBaseline(ctx, r)} finding(s) accepted as existing.`)
  } else if (cmd === 'describe' && flag('from')) {
    // Bulk: a JSON array (or { name: {…} } map) of { name, summary, use_when, avoid_when, keywords, example }.
    const raw = JSON.parse(fs.readFileSync(path.resolve(flag('from')), 'utf8'))
    const items = Array.isArray(raw) ? raw : Object.entries(raw).map(([name, v]) => ({ name, ...v }))
    const reg = JSON.parse(fs.readFileSync(files(ctx).registry, 'utf8'))
    const done = [], unknown = []
    for (const it of items) {
      const c = byName(it.name ?? ''), e = c && [...reg.components, ...(reg.library ?? [])].find((x) => x.path === (it.path ?? c.path))
      if (!e) { unknown.push(it.name); continue }
      const list = (v) => (Array.isArray(v) ? v : String(v).split(/\s*[;,]\s*/)).filter(Boolean)
      if (it.summary) e.summary = it.summary
      if (it.use_when ?? it.use) e.use_when = list(it.use_when ?? it.use)
      if (it.avoid_when ?? it.avoid) e.avoid_when = String(it.avoid_when ?? it.avoid)
      if (it.keywords ?? it.extra_keywords) e.extra_keywords = list(it.keywords ?? it.extra_keywords)
      if (it.example) e.example = it.example
      Object.assign(e, { described: true, describedBy: 'agent' })
      done.push(e.name)
    }
    fs.writeFileSync(files(ctx).registry, JSON.stringify(reg, null, 2) + '\n')
    console.log(`Described ${done.length} component(s).${unknown.length ? ` Unknown: ${unknown.join(', ')}` : ''}`)
  } else if (cmd === 'describe') {
    const c = byName(positional[0] ?? '')
    if (!c) return console.error(`Unknown component "${positional[0]}"`)
    const reg = JSON.parse(fs.readFileSync(files(ctx).registry, 'utf8'))
    const e = [...reg.components, ...(reg.library ?? [])].find((x) => x.path === c.path)
    if (flag('summary')) e.summary = flag('summary')
    if (flag('use')) e.use_when = flag('use').split(/\s*;\s*/).filter(Boolean)
    if (flag('avoid')) e.avoid_when = flag('avoid')
    if (flag('keywords')) e.extra_keywords = flag('keywords').split(/\s*,\s*/).filter(Boolean)
    if (flag('example')) e.example = flag('example')
    e.described = true
    e.describedBy = 'agent'
    fs.writeFileSync(files(ctx).registry, JSON.stringify(reg, null, 2) + '\n')
    console.log(formatComponent(e, { detail: true }))
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1).filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    process.exitCode = cmd ? 2 : 0
  }
}

// ---------------- agent hooks ----------------
async function readStdin() {
  if (process.stdin.isTTY) return {}
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  try { return JSON.parse(data || '{}') } catch { return {} }
}

const json = (o) => process.stdout.write(JSON.stringify(o))
const inDir = (abs, dir) => !!dir && abs.startsWith(dir + path.sep)

async function hook(event) {
  const input = await readStdin()
  // post-edit/pre-tool resolve from the edited file, so a nested .aura/ (or a monorepo root) is found from any package.
  const target = input.tool_input?.file_path ? path.resolve(input.cwd ?? process.cwd(), input.tool_input.file_path) : null
  const root = (event === 'post-edit' || event === 'pre-tool') && target ? path.dirname(target) : process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  const ctx = createContext(findRepoRoot(root))
  // "cli": "local" in .aura/rules.json: run the repo's vendored copy (local patches) instead of this one.
  const localCli = path.join(ctx.auraDir, 'bin', 'aura.mjs')
  if (ctx.config.cli === 'local' && fs.existsSync(localCli) && fs.realpathSync(localCli) !== fs.realpathSync(fileURLToPath(import.meta.url))) {
    const res = spawnSync(process.execPath, [localCli, 'hook', event], { input: JSON.stringify(input), encoding: 'utf8' })
    process.stdout.write(res.stdout ?? '')
    process.stderr.write(res.stderr ?? '')
    process.exit(res.status ?? 0)
  }
  const emit = (eventName, text) => text && json({ hookSpecificOutput: { hookEventName: eventName, additionalContext: text.slice(0, 9500) } })
  if (event === 'skill-nudge') {
    // Skill-scoped (once): when an aura skill edits files in a UI repo that isn't managed yet, suggest init.
    const ui = ['react', 'next', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact'].some((d) => ctx.deps[d])
    if (isInitialised(ctx) || !ui) return
    const cli = process.env.CLAUDE_PLUGIN_ROOT ? path.join(process.env.CLAUDE_PLUGIN_ROOT, 'manager', 'aura.mjs') : fileURLToPath(import.meta.url)
    return emit('PostToolUse', `Aura: this repo (${path.basename(ctx.repo)}) has no .aura/ registry, so components aren't indexed and edits aren't checked (duplicates, raw primitives, undefined tokens). Offer the user the aura-ui:init skill (node "${cli}" init): one read-only scan that writes .aura/ and enables the checks. Don't run it without asking.`)
  }
  if (!isInitialised(ctx)) return // not an aura-managed repo: stay silent
  const synced = syncVendoredCli(ctx)

  // Session state: files touched (by Write/Edit and by shell commands), per subagent too.
  const sessionFile = path.join(ctx.auraDir, 'cache', `session-${String(input.session_id ?? 'default').replace(/[^\w-]/g, '')}.json`)
  const session = (() => { try { return JSON.parse(fs.readFileSync(sessionFile, 'utf8')) } catch { return {} } })()
  session.touched ??= []; session.added ??= []; session.primitives ??= []; session.unapproved ??= []; session.agents ??= {}
  const saveSession = () => { fs.mkdirSync(path.dirname(sessionFile), { recursive: true }); fs.writeFileSync(sessionFile, JSON.stringify(session)) }
  const agent = input.agent_id ? (session.agents[input.agent_id] ??= { touched: [] }) : null
  const touch = (rel) => {
    if (!session.touched.includes(rel)) session.touched.push(rel)
    if (agent && !agent.touched.includes(rel)) agent.touched.push(rel)
  }
  const uiRel = ctx.uiDir ? ctx.rel(ctx.uiDir) : null

  if (event === 'session-start') {
    const r = refresh(ctx)
    session.startedAt ??= Date.now()
    saveSession()
    const { added, removed } = r.changes
    const note = added.length || removed.length ? `\nSince the last session: ${added.length ? `added ${added.join(', ')}` : ''}${added.length && removed.length ? '; ' : ''}${removed.length ? `removed ${removed.join(', ')}` : ''}.` : ''
    return emit('SessionStart', summary(ctx, loadProfile(ctx), r.registry) + note + (synced ? `\n.aura/bin updated to Aura ${VERSION} (was ${synced}); commit it with the rest of .aura/.` : ''))
  }

  if (event === 'pre-tool') {
    // Adding a primitive changes the shared UI kit: the user decides (permission prompt).
    const names = input.tool_name === 'Bash' ? addsPrimitives(input.tool_input?.command) : null
    const have = names && [...readRegistry(ctx).components, ...(readRegistry(ctx).library ?? [])]
    const fresh = names?.filter((n) => !hasComponent(have, n)) ?? []
    if (fresh.length) return json({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `Aura: the agent wants to add primitive(s) ${fresh.join(', ')} to ${uiRel ?? 'the UI kit'} (shared by every screen). Approve only if you want them in the project.` } })
    if (input.tool_name === 'Write' && target && inDir(target, ctx.uiDir) && !fs.existsSync(target) && /\.(tsx|jsx|vue|svelte)$/.test(target))
      return json({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `Aura: the agent wants to create a new primitive ${ctx.rel(target)} in the shared UI kit. Approve, or deny and ask it to reuse an existing component (aura find) or add a standard one (aura add).` } })
    return
  }

  if (event === 'post-bash') {
    const command = input.tool_input?.command ?? ''
    // Files the command changed: compare the index before and after the refresh (catches sed, heredocs, scripts, codegen).
    const before = (() => { try { return JSON.parse(fs.readFileSync(files(ctx).cache, 'utf8')).files } catch { return {} } })()
    const r = refresh(ctx)
    const after = (() => { try { return JSON.parse(fs.readFileSync(files(ctx).cache, 'utf8')).files } catch { return {} } })()
    const changed = Object.keys(after).filter((p) => !before[p] || before[p].mtime !== after[p].mtime).filter((p) => ctx.isUiPath(path.join(ctx.repo, p)))
    for (const p of changed) touch(p)
    for (const a of [...r.changes.added, ...r.changes.newFiles]) if (!session.added.includes(a)) session.added.push(a)
    // New primitives: through aura add / shadcn add they were approved by the user (pre-tool asks); otherwise flag them.
    const newPrims = [...new Set([...r.changes.added, ...r.changes.newFiles])].filter((p) => uiRel && p.startsWith(uiRel + '/'))
    const viaAdd = !!addsPrimitives(command)
    for (const p of newPrims) {
      if (viaAdd) { if (!session.primitives.includes(p)) session.primitives.push(p) }
      else if (!session.unapproved.includes(p)) session.unapproved.push(p)
    }
    saveSession()
    const notes = []
    const { added, removed, moved } = r.changes
    if (added.length || removed.length || moved.length) notes.push(`Aura registry updated: ${[added.length && `added ${added.join(', ')}`, removed.length && `removed ${removed.join(', ')}`, moved.length && `moved ${moved.map(([a, b]) => `${a} → ${b}`).join(', ')}`].filter(Boolean).join('; ')}.`)
    const st = changed.length ? state(ctx, r) : null
    const errors = changed.flatMap((p) => { const abs = path.join(ctx.repo, p); return fs.existsSync(abs) ? checkWithBaseline(ctx, st, abs, { isNew: session.added.includes(p) }).filter((f) => f.severity === 'error' && !f.existing).map((f) => formatFindings(p, [f])) : [] })
    const rogue = newPrims.filter((p) => !viaAdd)
    if (rogue.length || errors.length) return json({ decision: 'block', reason: [
      rogue.length && `Aura: ${rogue.join(', ')} ${rogue.length > 1 ? 'are new primitives' : 'is a new primitive'} created without the user's approval. Delete ${rogue.length > 1 ? 'them' : 'it'} and use an existing component (aura find), or ask the user and add a standard one with: node .aura/bin/aura.mjs add <name> (it asks them).`,
      errors.length && `Aura: files changed by that command have errors (shell edits are checked like Write/Edit):\n${errors.join('\n')}`,
      ...notes,
    ].filter(Boolean).join('\n') })
    return emit('PostToolUse', notes.join('\n'))
  }

  if (event === 'post-edit') {
    if (!target || !target.startsWith(ctx.repo + path.sep)) return
    const isComp = ctx.isUiPath(target), isToken = ctx.isTokenPath(target)
    if (!isComp && !isToken) return
    const r = refresh(ctx)
    const relPath = ctx.rel(target)
    for (const a of [...r.changes.added, ...r.changes.newFiles]) if (!session.added.includes(a)) session.added.push(a)
    // A Write that created a primitive went through the permission prompt (pre-tool).
    if (inDir(target, ctx.uiDir) && session.added.includes(relPath) && !session.primitives.includes(relPath)) session.primitives.push(relPath)
    if (isComp) touch(relPath)
    saveSession()
    if (!isComp) return emit('PostToolUse', `Aura: design tokens re-read (${r.tokens.colors.length} colors).`)
    const findings = checkWithBaseline(ctx, state(ctx, r), target, { isNew: session.added.includes(relPath) })
    const errors = findings.filter((f) => f.severity === 'error' && !f.existing)
    if (errors.length) {
      const rest = findings.filter((f) => f.severity !== 'error' && !f.existing)
      process.stderr.write(`Aura blocked this change. Fix before continuing:\n${formatFindings(relPath, errors)}\n${rest.length ? `Also:\n${formatFindings(relPath, rest)}\n` : ''}`)
      process.exit(2)
    }
    const notes = findings.filter((f) => f.severity !== 'error' && !f.existing)
    if (notes.length) emit('PostToolUse', `Aura notes for ${relPath}:\n${formatFindings(relPath, notes)}`)
    return
  }

  if (event === 'stop' || event === 'subagent-stop') {
    // The main agent answers for everything touched in the session; a subagent for what it touched.
    const scope = event === 'subagent-stop' ? session.agents[input.agent_id]?.touched ?? [] : session.touched
    const live = scope.filter((p) => fs.existsSync(path.join(ctx.repo, p)))
    const mode = ctx.config.verify?.mode ?? (ctx.config.inspect?.nudge === false ? 'off' : 'required')
    const maxBlocks = ctx.config.verify?.maxStopBlocks ?? 4
    const key = event === 'subagent-stop' ? `blocks-${input.agent_id}` : 'blocks'
    const problems = []
    if (live.length) {
      const r = refresh(ctx)
      const st = state(ctx, r)
      const errors = live.flatMap((p) => checkWithBaseline(ctx, st, path.join(ctx.repo, p), { isNew: session.added.includes(p) }).filter((f) => f.severity === 'error' && !f.existing).map((f) => formatFindings(p, [f])))
      if (errors.length) problems.push(`unresolved component errors:\n${errors.join('\n')}`)
      const rogue = session.unapproved.filter((p) => fs.existsSync(path.join(ctx.repo, p)))
      if (rogue.length) problems.push(`primitive(s) created without the user's approval: ${rogue.join(', ')}. Delete them or ask the user and use aura add.`)
      const undescribed = session.added.filter((p) => scope.includes(p) || session.primitives.includes(p)).map((p) => r.registry.components.find((c) => c.path === p)).filter((c) => c && !c.described)
      if (undescribed.length) problems.push(`describe the new component(s) so other agents can find them: ${undescribed.map((c) => `aura describe ${c.name} --summary "…" --use "…" --keywords "vi, en"`).join(' ; ')}`)
      if (mode === 'required') {
        const record = loadVerify(ctx)
        const stale = live.filter((p) => !verifiedClean(ctx, p, record))
        if (stale.length) problems.push(`UI changed but not verified (or verify failed): ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ', …' : ''}. Run: node .aura/bin/aura.mjs verify  (checks the changed files and inspects the pages that render them; fix every error and re-run until it prints ✓ verified)`)
      }
    }
    if (problems.length) {
      session[key] = (session[key] ?? 0) + 1
      saveSession()
      if (session[key] <= maxBlocks) return json({ decision: 'block', reason: `Aura (${session[key]}/${maxBlocks}): ${problems.join('\n\n')}` })
      // Give up blocking, but don't let it pass silently: the user sees what is left. The next turn starts counting again.
      session[key] = 0
      saveSession()
      return json({ systemMessage: `Aura: the agent stopped with unresolved UI issues after ${maxBlocks} reminders:\n- ${problems.map((p) => p.split('\n')[0]).join('\n- ')}\nRun: node .aura/bin/aura.mjs verify` })
    }
    session[key] = 0
    // Tell the user what changed in the shared UI kit and what wasn't inspected.
    const msgs = []
    const prims = session.primitives.filter((p) => !(session.reported ??= []).includes(p))
    if (event === 'stop' && prims.length) { msgs.push(`new primitive(s) in ${uiRel ?? 'the UI kit'}: ${prims.map((p) => path.basename(p).replace(/\.\w+$/, '')).join(', ')}`); session.reported.push(...prims) }
    const last = loadVerify(ctx).last
    if (event === 'stop' && live.length && last?.skipped && session.skipReported !== last.at) { msgs.push(`rendered check skipped: ${last.skipped}`); session.skipReported = last.at }
    if (event === 'stop' && live.length && last?.accepted?.length && session.acceptReported !== last.at) { msgs.push(`accepted findings: ${last.accepted.join(', ')} (${last.reason ?? 'no reason given'})`); session.acceptReported = last.at }
    saveSession()
    if (msgs.length) json({ systemMessage: `Aura: ${msgs.join(' · ')}` })
  }
}

main().catch((e) => { console.error(e?.stack ?? String(e)); process.exit(1) })
