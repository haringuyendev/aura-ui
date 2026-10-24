#!/usr/bin/env node
// Aura: the project's component UI manager.
//   aura init [--scripts]          scan the repo (a monorepo from its root), create .aura/, vendor the CLI; re-run to refresh bin/
//   aura find <need…>               components in this project that fit ("ô nhập liệu", "date range", "confirm dialog")
//   aura show <name>                props, variants, description, import path(s), where it is used
//   aura usage <name>               files that import it
//   aura tokens                     colors, fonts, radius, status/chart tokens (and which are text-safe)
//   aura status                     project summary (what agents get at session start)
//   aura check [files…] [--changed] [--existing] [--json]   run the rules; exit 1 on new errors
//   aura doctor                     what Aura couldn't detect in this repo, and the rules.json key that fixes it
//   aura stats [--changed] [--json] findings per rule, new vs existing, and the files with the most
//   aura describe <name> --summary "…" [--use "a; b"] [--avoid "…"] [--keywords "vi, en"] [--example "…"]
//   aura describe --from <file.json> describe many at once: [{ name, summary, use_when, avoid_when, keywords, example }]
//   aura baseline                   accept current findings as existing (hooks then block only new ones)
//   aura scan                       full rescan (normally not needed: every command refreshes incrementally)
//   aura hook <session-start|post-edit|post-bash|stop|skill-nudge>   called by agent hooks with the event JSON on stdin
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createContext, workspaceDirs } from './context.mjs'
import { files, isInitialised, loadProfile, refresh } from './registry.mjs'
import { DEFAULT_RULES, applyBaseline, checkFile, formatFindings, hasErrors, loadBaseline, loadRules, snapshotBaseline } from './check.mjs'
import { findComponents, formatComponent } from './find.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
const has = (name) => argv.includes(`--${name}`)
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--') && !['--changed', '--json', '--scripts', '--existing', '--full'].includes(all[i - 1])))

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
    `  node .aura/bin/aura.mjs find "<what you need>"   ·   show <Name>   ·   tokens   ·   check <file>`,
    `Stack: ${list(p.stack.framework)} · ${list(p.stack.styling)} · UI: ${list(p.stack.ui)} · icons: ${list(p.stack.icons)}${p.stack.cms ? ` · CMS: ${list(p.stack.cms)}` : ''}`,
    `Tokens: ${list([...p.tokens.files, ...(p.tokens.tailwindConfigs ?? [])])}${p.tokens.themeFiles?.length ? ` · theme in code: ${p.tokens.themeFiles.join(', ')} (style through the library's theme props/tokens, not classes)` : ''} · dark: ${p.tokens.darkSelector ?? 'none'} · ${p.tokens.colors.length} colors · fonts: ${Object.keys(p.tokens.fonts).join(', ') || '—'} · status: ${status} · chart: ${p.tokens.chartTokens}/5`,
    p.workspaces?.length ? `Monorepo: ${p.workspaces.length} packages (${p.workspaces.map((w) => w.dir).join(', ')}). Import a package's components by its public path (e.g. "${registry.components.find((c) => c.package && c.importInPackage)?.import ?? '@scope/ui/components/button'}"); inside that package use its local path (show prints both).` : '',
    `Components (${registry.components.length}): ${p.components.uiDir ? `${p.components.primitives.length} primitives in ${p.components.uiDir}` : registry.library?.length ? 'primitives come from the UI library (below)' : 'no primitives folder (see aura doctor)'}, ${p.components.components} shared, ${p.components.sectionFiles ?? p.components.sections.length} in sections/features. Most used: ${top}`,
    registry.library?.length ? `UI library components in use (the project's primitives too; import from the library): ${registry.library.slice(0, 16).map((c) => `${c.name}(${c.usedBy})`).join(', ')} — from ${[...new Set(registry.library.map((c) => c.import.split('/').slice(0, c.import.startsWith('@') ? 2 : 1).join('/')))].join(', ')}` : '',
    p.conventions.length ? `Conventions: ${p.conventions.join(' · ')}` : '',
    `Rules: reuse existing components (duplicates are blocked), only defined color tokens, no second UI library; after creating a component, describe it with "aura describe".`,
    `Skills: aura-ui:find (pick components) · aura-ui:check (when a hook blocks) · aura-ui:describe · aura-ui:build (design rules).`,
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

function state(ctx, r) {
  return { registry: r.registry, tokens: r.tokens, rules: loadRules(ctx), profile: loadProfile(ctx), baseline: loadBaseline(ctx), allow: ctx.config.allowUiLibraries ?? [] }
}
/** Check a file and mark findings that were already there when aura was added. */
function checkWithBaseline(ctx, st, abs, opts) {
  return applyBaseline(ctx.rel(abs), checkFile(ctx, st, abs, opts), st.baseline)
}
function writeBaseline(ctx, r) {
  const st = { ...state(ctx, r), baseline: {} }
  const entries = r.registry.components.map((c) => ({ file: c.path, findings: checkFile(ctx, st, path.join(ctx.repo, c.path)) }))
  const snap = snapshotBaseline(entries)
  fs.writeFileSync(files(ctx).baseline, JSON.stringify(snap, null, 2) + '\n')
  return Object.values(snap.files).reduce((n, rules) => n + Object.values(rules).reduce((a, b) => a + (typeof b === 'number' ? b : b.count), 0), 0)
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
      $comment: 'rules: error blocks the agent, warn reports, info hints, off disables. Optional: primitivesDir (folder of base components), tokenFiles (CSS entry files; @imports are followed), allowUiLibraries (import prefixes allowed besides the detected ones), cli ("local" makes hooks run .aura/bin instead of the plugin copy)',
      rules: DEFAULT_RULES,
      allowUiLibraries: [],
    }, null, 2) + '\n')
    // Vendor the CLI so the team and CI can run it without the plugin.
    const bin = path.join(ctx.auraDir, 'bin')
    fs.mkdirSync(bin, { recursive: true })
    for (const file of fs.readdirSync(here).filter((x) => x.endsWith('.mjs'))) fs.copyFileSync(path.join(here, file), path.join(bin, file))
    const catalog = path.join(here, '..', 'catalog', 'components.json')
    if (fs.existsSync(catalog)) fs.copyFileSync(catalog, path.join(bin, 'aura-catalog.json'))
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
    console.log(`${r.registry.components.length} components registered, ${r.registry.components.filter((c) => !c.described).length} without a description yet.`)
    return
  }

  requireInit(ctx)
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
  } else if (cmd === 'find') {
    const q = positional.join(' ')
    if (!q) return console.error('usage: aura find <what you need>')
    const { results, aura } = findComponents({ components: everything }, q)
    if (!results.length) console.log(`No component in this project matches "${q}".`)
    for (const { component, why } of results) console.log(formatComponent(component) + (why.length ? `\n  (${why.join(', ')})` : ''))
    if (aura.length) {
      // Add-ons install into apps made from the aura starter (Base UI blocks at src/components/blocks); elsewhere they are a reference.
      const starterApp = r.registry.components.some((c) => c.name === 'data-table' && /components\/blocks\//.test(c.path))
      const installer = path.join(here, '..', 'scripts', 'add-block.mjs')
      const addCmd = (name) => `node ${fs.existsSync(installer) ? JSON.stringify(installer) : '"${CLAUDE_PLUGIN_ROOT}/scripts/add-block.mjs"'} ${name} .`
      const lines = aura.map((a) => a.kind === 'addon' && starterApp
        ? `${a.name}: aura add-on, install with: ${addCmd((a.install ?? '').match(/add-block\.mjs (\S+)/)?.[1] ?? a.name)}`
        : `${a.name} (${a.summary.split('.')[0]})${a.kind === 'addon' ? ' [aura add-on for starter apps; port it to this project\'s primitives]' : ''}`)
      console.log(`\nNot in the project? ${starterApp ? '' : "Aura reference to build it in this project's style: "}\n  ${lines.join('\n  ')}`)
    }
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
    const scope = has('changed') ? 'changed files (git status)' : positional.length ? positional.join(', ') : `all ${r.registry.components.length} registered components`
    const targets = (has('changed') ? changedFiles(ctx) : positional.length ? positional.map((p) => path.resolve(p)).flatMap((p) => (fs.statSync(p, { throwIfNoEntry: false })?.isDirectory() ? ctx.walk(p, ['.tsx', '.jsx', '.vue', '.svelte']) : [p])) : r.registry.components.map((c) => path.join(ctx.repo, c.path))).filter((t) => ctx.isComponentPath(t))
    const st = state(ctx, r)
    const all = targets.map((t) => ({ file: ctx.rel(t), findings: checkWithBaseline(ctx, st, t, { isNew: r.changes.added.includes(ctx.rel(t)) }) }))
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

async function hook(event) {
  const input = await readStdin()
  // post-edit resolves from the edited file, so a nested .aura/ (or a monorepo root) is found from any package.
  const target = input.tool_input?.file_path ? path.resolve(input.cwd ?? process.cwd(), input.tool_input.file_path) : null
  const root = event === 'post-edit' && target ? path.dirname(target) : process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  const ctx = createContext(findRepoRoot(root))
  // "cli": "local" in .aura/rules.json: run the repo's vendored copy (local patches) instead of this one.
  const localCli = path.join(ctx.auraDir, 'bin', 'aura.mjs')
  if (ctx.config.cli === 'local' && fs.existsSync(localCli) && fs.realpathSync(localCli) !== fs.realpathSync(fileURLToPath(import.meta.url))) {
    const res = spawnSync(process.execPath, [localCli, 'hook', event], { input: JSON.stringify(input), encoding: 'utf8' })
    process.stdout.write(res.stdout ?? '')
    process.stderr.write(res.stderr ?? '')
    process.exit(res.status ?? 0)
  }
  const emit = (eventName, text) => text && process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: text.slice(0, 9500) } }))
  if (event === 'skill-nudge') {
    // Skill-scoped (once): when an aura skill edits files in a UI repo that isn't managed yet, suggest init.
    const ui = ['react', 'next', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact'].some((d) => ctx.deps[d])
    if (isInitialised(ctx) || !ui) return
    const cli = process.env.CLAUDE_PLUGIN_ROOT ? path.join(process.env.CLAUDE_PLUGIN_ROOT, 'manager', 'aura.mjs') : fileURLToPath(import.meta.url)
    return emit('PostToolUse', `Aura: this repo (${path.basename(ctx.repo)}) has no .aura/ registry, so components aren't indexed and edits aren't checked (duplicates, raw primitives, undefined tokens). Offer the user the aura-ui:init skill (node "${cli}" init): one read-only scan that writes .aura/ and enables the checks. Don't run it without asking.`)
  }
  if (!isInitialised(ctx)) return // not an aura-managed repo: stay silent
  const sessionFile = path.join(ctx.auraDir, 'cache', `session-${String(input.session_id ?? 'default').replace(/[^\w-]/g, '')}.json`)
  const session = (() => { try { return JSON.parse(fs.readFileSync(sessionFile, 'utf8')) } catch { return { touched: [], added: [] } } })()
  const saveSession = () => { fs.mkdirSync(path.dirname(sessionFile), { recursive: true }); fs.writeFileSync(sessionFile, JSON.stringify(session)) }

  if (event === 'session-start') {
    const r = refresh(ctx)
    const { added, removed } = r.changes
    const note = added.length || removed.length ? `\nSince the last session: ${added.length ? `added ${added.join(', ')}` : ''}${added.length && removed.length ? '; ' : ''}${removed.length ? `removed ${removed.join(', ')}` : ''}.` : ''
    return emit('SessionStart', summary(ctx, loadProfile(ctx), r.registry) + note)
  }

  if (event === 'post-bash') {
    const r = refresh(ctx)
    const { added, removed, moved } = r.changes
    if (added.length || removed.length || moved.length)
      emit('PostToolUse', `Aura registry updated: ${[added.length && `added ${added.join(', ')}`, removed.length && `removed ${removed.join(', ')}`, moved.length && `moved ${moved.map(([a, b]) => `${a} → ${b}`).join(', ')}`].filter(Boolean).join('; ')}.`)
    for (const a of added) if (!session.added.includes(a)) session.added.push(a)
    return saveSession()
  }

  if (event === 'post-edit') {
    if (!target || !target.startsWith(ctx.repo + path.sep)) return
    const isComp = ctx.isComponentPath(target), isToken = ctx.isTokenPath(target)
    if (!isComp && !isToken) return
    const r = refresh(ctx)
    const relPath = ctx.rel(target)
    for (const a of r.changes.added) if (!session.added.includes(a)) session.added.push(a)
    if (isComp && !session.touched.includes(relPath)) session.touched.push(relPath)
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

  if (event === 'stop') {
    if (input.stop_hook_active) return
    if (!session.touched.length) return
    const r = refresh(ctx)
    const st = state(ctx, r)
    const errors = session.touched
      .map((p) => path.join(ctx.repo, p))
      .filter((p) => fs.existsSync(p))
      .flatMap((p) => checkWithBaseline(ctx, st, p, { isNew: session.added.includes(ctx.rel(p)) }).filter((f) => f.severity === 'error' && !f.existing).map((f) => formatFindings(ctx.rel(p), [f])))
    const undescribed = session.added.map((p) => r.registry.components.find((c) => c.path === p)).filter((c) => c && !c.described)
    if (errors.length) process.stdout.write(JSON.stringify({ decision: 'block', reason: `Aura: unresolved component errors:\n${errors.join('\n')}` }))
    else if (undescribed.length) process.stdout.write(JSON.stringify({ decision: 'block', reason: `Aura: describe the new component(s) so other agents can find them: ${undescribed.map((c) => `aura describe ${c.name} --summary "…" --use "…" --keywords "vi, en"`).join(' ; ')} (run via node .aura/bin/aura.mjs).` }))
  }
}

main().catch((e) => { console.error(e?.stack ?? String(e)); process.exit(1) })
