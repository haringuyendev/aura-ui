#!/usr/bin/env node
// Aura: the project's component UI manager.
//   aura init [--no-scripts]        scan the repo, create .aura/ (registry, profile, rules), vendor the CLI, wire npm script
//   aura find <need…>               components in this project that fit ("ô nhập liệu", "date range", "confirm dialog")
//   aura show <name>                props, variants, description, where it is used
//   aura usage <name>               files that import it
//   aura tokens                     colors, fonts, radius, status/chart tokens (and which are text-safe)
//   aura status                     project summary (what agents get at session start)
//   aura check [files…] [--changed] [--json]   run the rules; exit 1 on errors
//   aura describe <name> --summary "…" [--use "a; b"] [--avoid "…"] [--keywords "vi, en"] [--example "…"]
//   aura baseline                   accept current findings as existing (hooks then block only new ones)
//   aura scan                       full rescan (normally not needed: every command refreshes incrementally)
//   aura hook <session-start|post-edit|post-bash|stop>   called by agent hooks with the event JSON on stdin
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createContext } from './context.mjs'
import { files, isInitialised, loadProfile, refresh } from './registry.mjs'
import { DEFAULT_RULES, applyBaseline, checkFile, formatFindings, hasErrors, loadBaseline, loadRules, snapshotBaseline } from './check.mjs'
import { findComponents, formatComponent } from './find.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
const has = (name) => argv.includes(`--${name}`)
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--') && !['--changed', '--json', '--no-scripts', '--full'].includes(all[i - 1])))

function findRepoRoot(start) {
  let dir = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.aura', 'registry.json')) || fs.existsSync(path.join(dir, 'package.json'))) return dir
    const up = path.dirname(dir)
    if (up === dir) return path.resolve(start)
    dir = up
  }
}

function summary(ctx, profile, registry) {
  const p = profile, list = (a) => (a?.length ? a.join(', ') : '—')
  const status = Object.entries(p.tokens.status ?? {}).map(([r, s]) => `${r}=${s.token ?? 'missing'}${s.textSafe === false ? ` (bg only${s.textToken ? `; text: ${s.textToken}` : ''})` : ''}`).join(', ')
  const top = registry.components.filter((c) => c.category !== 'section').slice(0, 14).map((c) => `${c.name}(${c.usedBy})`).join(', ')
  return [
    `Aura manages UI components in this repo (${p.repo}). Ask it instead of scanning component folders:`,
    `  node .aura/bin/aura.mjs find "<what you need>"   ·   show <Name>   ·   tokens   ·   check <file>`,
    `Stack: ${list(p.stack.framework)} · ${list(p.stack.styling)} · UI: ${list(p.stack.ui)} · icons: ${list(p.stack.icons)}${p.stack.cms ? ` · CMS: ${list(p.stack.cms)}` : ''}`,
    `Tokens: ${list(p.tokens.files)} · dark: ${p.tokens.darkSelector ?? 'none'} · ${p.tokens.colors.length} colors · fonts: ${Object.keys(p.tokens.fonts).join(', ') || '—'} · status: ${status} · chart: ${p.tokens.chartTokens}/5`,
    `Components: ${p.components.primitives.length} primitives in ${p.components.uiDir ?? '?'}, ${p.components.components} shared, ${p.components.sections.length} sections. Most used: ${top}`,
    p.conventions.length ? `Conventions: ${p.conventions.join(' · ')}` : '',
    `Rules: reuse existing components (duplicates are blocked), only defined color tokens, no second UI library; after creating a component, describe it with "aura describe".`,
  ].filter(Boolean).join('\n')
}

function state(ctx, r) {
  return { registry: r.registry, tokens: r.tokens, rules: loadRules(ctx), profile: loadProfile(ctx), baseline: loadBaseline(ctx) }
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
  return Object.values(snap.files).reduce((n, rules) => n + Object.values(rules).reduce((a, b) => a + b, 0), 0)
}

function requireInit(ctx) {
  if (!isInitialised(ctx)) { console.error(`No .aura/ in ${ctx.repo}. Run: aura init`); process.exit(2) }
}

function changedFiles(ctx) {
  try {
    const out = execSync('git status --porcelain --untracked-files=all', { cwd: ctx.repo, encoding: 'utf8' })
    return out.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop()).map((p) => path.join(ctx.repo, p)).filter((p) => fs.existsSync(p))
  } catch { return [] }
}

// ---------------- commands ----------------
async function main() {
  if (cmd === 'hook') return hook(argv[1])
  const ctx = createContext(findRepoRoot(process.cwd()))

  if (cmd === 'init') {
    const r = refresh(ctx, { full: true })
    const f = files(ctx)
    if (!fs.existsSync(f.rules)) fs.writeFileSync(f.rules, JSON.stringify({ $comment: 'error blocks the agent, warn reports, info hints, off disables', rules: DEFAULT_RULES }, null, 2) + '\n')
    // Vendor the CLI so the team and CI can run it without the plugin.
    const bin = path.join(ctx.auraDir, 'bin')
    fs.mkdirSync(bin, { recursive: true })
    for (const file of fs.readdirSync(here).filter((x) => x.endsWith('.mjs'))) fs.copyFileSync(path.join(here, file), path.join(bin, file))
    const catalog = path.join(here, '..', 'catalog', 'components.json')
    if (fs.existsSync(catalog)) fs.copyFileSync(catalog, path.join(bin, 'aura-catalog.json'))
    fs.writeFileSync(path.join(ctx.auraDir, '.gitignore'), 'cache/\n')
    if (!has('no-scripts') && ctx.pkg && fs.existsSync(path.join(ctx.repo, 'package.json'))) {
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
    console.log(`\nCreated .aura/ (registry.json, profile.json, rules.json, baseline.json, bin/). Commit it; .aura/cache is ignored.`)
    if (existing !== null) console.log(`Baseline: ${existing} existing finding(s) recorded; hooks will only block new ones (see: aura check).`)
    console.log(`${r.registry.components.length} components registered, ${r.registry.components.filter((c) => !c.described).length} without a description yet.`)
    return
  }

  requireInit(ctx)
  const r = refresh(ctx, { full: cmd === 'scan' })
  const byName = (n) => r.registry.components.find((c) => c.name.toLowerCase() === n.toLowerCase()) ?? r.registry.components.find((c) => c.exports.some((e) => e.toLowerCase() === n.toLowerCase()))

  if (cmd === 'scan' || cmd === 'status') {
    console.log(summary(ctx, loadProfile(ctx), r.registry))
    const { added, removed, updated, moved } = r.changes
    if (added.length + removed.length + updated.length + moved.length) console.log(`\nChanges since last scan: +${added.length} −${removed.length} ~${updated.length} moved ${moved.length}`)
  } else if (cmd === 'find') {
    const q = positional.join(' ')
    if (!q) return console.error('usage: aura find <what you need>')
    const { results, aura } = findComponents(r.registry, q)
    if (!results.length) console.log(`No component in this project matches "${q}".`)
    for (const { component, why } of results) console.log(formatComponent(component) + (why.length ? `\n  (${why.join(', ')})` : ''))
    if (aura.length) console.log(`\nNot in the project? Aura reference to build it in this project's style: ${aura.map((a) => `${a.name} (${a.summary.split('.')[0]})`).join('; ')}`)
  } else if (cmd === 'show') {
    const c = byName(positional[0] ?? '')
    console.log(c ? formatComponent(c, { detail: true }) : `Unknown component "${positional[0]}". Try: aura find ${positional[0] ?? ''}`)
  } else if (cmd === 'usage') {
    const c = byName(positional[0] ?? '')
    if (!c) return console.log(`Unknown component "${positional[0]}"`)
    const cache = JSON.parse(fs.readFileSync(files(ctx).cache, 'utf8'))
    const users = Object.entries(cache.files).filter(([, e]) => e.imports.includes(c.path)).map(([p]) => p)
    console.log(`${c.name} is imported by ${users.length} file(s):\n${users.map((u) => '  ' + u).join('\n')}`)
  } else if (cmd === 'tokens') {
    const t = r.tokens
    console.log(`Token files: ${t.files.join(', ')}${t.tailwindConfig ? ` + ${t.tailwindConfig}` : ''} · dark selector: ${t.darkSelector ?? 'none'} · radius: ${t.radius}`)
    console.log(`Colors (bg-/text-/border-…): ${t.colors.join(', ')}`)
    console.log(`Fonts: ${Object.entries(t.fonts).map(([k, v]) => `font-${k} = ${v.split(',')[0]}`).join(', ')}`)
    for (const [role, s] of Object.entries(t.status)) console.log(`Status ${role}: ${s.token ? `${s.token} (${s.contrastOnBackground}:1 on background${s.textSafe ? ', text-safe' : `, background/tint only${s.textToken ? `; for text use ${s.textToken}` : ''}`})` : 'missing'}`)
    console.log(`Chart tokens: ${t.chartTokens}/5${t.customUtilities.length ? ` · custom utilities: ${t.customUtilities.join(', ')}` : ''}`)
  } else if (cmd === 'check') {
    const targets = has('changed') ? changedFiles(ctx) : positional.length ? positional.map((p) => path.resolve(p)) : r.registry.components.map((c) => path.join(ctx.repo, c.path))
    const st = state(ctx, r)
    const report = targets.filter((t) => ctx.isComponentPath(t)).map((t) => ({ file: ctx.rel(t), findings: checkWithBaseline(ctx, st, t, { isNew: r.changes.added.includes(ctx.rel(t)) }) })).filter((x) => x.findings.length)
    if (has('json')) console.log(JSON.stringify(report, null, 2))
    else console.log(report.length ? report.map((x) => formatFindings(x.file, x.findings)).join('\n') : 'aura check: no findings')
    if (report.some((x) => hasErrors(x.findings))) process.exitCode = 1
  } else if (cmd === 'baseline') {
    console.log(`Baseline updated: ${writeBaseline(ctx, r)} finding(s) accepted as existing.`)
  } else if (cmd === 'describe') {
    const c = byName(positional[0] ?? '')
    if (!c) return console.error(`Unknown component "${positional[0]}"`)
    const reg = JSON.parse(fs.readFileSync(files(ctx).registry, 'utf8'))
    const e = reg.components.find((x) => x.path === c.path)
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
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
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
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  const ctx = createContext(findRepoRoot(root))
  if (!isInitialised(ctx)) return // not an aura-managed repo: stay silent
  const sessionFile = path.join(ctx.auraDir, 'cache', `session-${String(input.session_id ?? 'default').replace(/[^\w-]/g, '')}.json`)
  const session = (() => { try { return JSON.parse(fs.readFileSync(sessionFile, 'utf8')) } catch { return { touched: [], added: [] } } })()
  const saveSession = () => { fs.mkdirSync(path.dirname(sessionFile), { recursive: true }); fs.writeFileSync(sessionFile, JSON.stringify(session)) }
  const emit = (eventName, text) => text && process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: text.slice(0, 9500) } }))

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
    const target = input.tool_input?.file_path ? path.resolve(input.tool_input.file_path) : null
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
