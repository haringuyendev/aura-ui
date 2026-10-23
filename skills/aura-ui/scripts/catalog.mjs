#!/usr/bin/env node
// Component catalog for the aura-ui starter (ui primitives, blocks and lib/format).
//   node catalog.mjs find <words…>   best matches for a need (Vietnamese or English, accents optional)
//   node catalog.mjs show <name…>    full entries
//   node catalog.mjs list [category] one line per component
//   node catalog.mjs sync            refresh exports/variants/deps from the starter's source (maintainers)
//   add --project <dir> (a folder with scan-project.mjs output, default ./.aura) to search an existing
//   project's own components first; aura entries then serve as a reference and a vi/en thesaurus.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'catalog', 'components.json')
const src = path.join(root, 'template', 'src')
// Where catalog entries live in the starter: shadcn primitives, composed blocks, and utilities.
const sources = [
  { dir: path.join(src, 'components', 'ui'), ext: '.tsx', importBase: '@/components/ui/' },
  { dir: path.join(src, 'components', 'blocks'), ext: '.tsx', importBase: '@/components/blocks/' },
  { dir: path.join(src, 'lib'), ext: '.ts', importBase: '@/lib/', only: ['format'] },
]
// Optional heavy blocks installed on demand with add-block.mjs.
const addonsDir = path.join(root, 'addons')
if (fs.existsSync(addonsDir))
  for (const a of fs.readdirSync(addonsDir)) {
    const dir = path.join(addonsDir, a, 'files', 'src', 'components', 'blocks')
    if (fs.existsSync(dir)) sources.push({ dir, ext: '.tsx', importBase: '@/components/blocks/', addon: a })
  }

const load = () => JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

function extract(file) {
  const s = fs.readFileSync(file, 'utf8')
  const exportsBlock = (s.match(/export\s*\{([\s\S]*?)\}/) || [, ''])[1]
  const exports = [
    ...exportsBlock.split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()),
    ...[...s.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]),
  ].filter(Boolean)
  const deps = [...new Set((s.match(/from "(@base-ui\/react\/[a-z-]+|recharts|cmdk|vaul|embla-carousel-react|input-otp|react-day-picker|react-resizable-panels)"/g) || []).map((x) => x.slice(6, -1)))]
  const variants = {}
  const block = s.match(/variants:\s*\{([\s\S]*?)\n {4}\},?\n/)
  if (block) for (const g of block[1].matchAll(/^ {6}(\w+):\s*\{([\s\S]*?)^ {6}\}/gm)) variants[g[1]] = [...g[2].matchAll(/^ {8}"?([\w-]+)"?:/gm)].map((x) => x[1])
  return { exports, variants, deps }
}

function sync() {
  const entries = load()
  const byName = new Map(entries.map((e) => [e.name, e]))
  const found = new Map()
  for (const src of sources) {
    const { dir, ext, importBase, only } = src
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(ext))) {
      const name = f.slice(0, -ext.length)
      if (!only || only.includes(name)) found.set(name, { file: path.join(dir, f), import: importBase + name, addon: src.addon })
    }
  }
  const files = [...found.keys()]
  const missing = files.filter((n) => !byName.has(n))
  const stale = entries.filter((e) => !found.has(e.name)).map((e) => e.name)
  for (const e of entries) {
    const hit = found.get(e.name)
    if (hit) Object.assign(e, { import: hit.import }, hit.addon && { install: `node <this-skill-folder>/scripts/add-block.mjs ${hit.addon} <app-dir>` }, extract(hit.file))
  }
  entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  fs.writeFileSync(catalogPath, JSON.stringify(entries, null, 2) + '\n')
  console.log(`synced ${entries.length - stale.length} entries`)
  if (missing.length) console.log(`MISSING catalog entries (add them by hand): ${missing.join(', ')}`)
  if (stale.length) console.log(`STALE entries (component file gone): ${stale.join(', ')}`)
  process.exitCode = missing.length || stale.length ? 1 : 0
}

const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean)
// Same split, keeping Vietnamese diacritics, so "bảng" (table) outranks "băng" (strip) when the user types accents.
const accented = (s) => s.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean)

function score(e, words, phrase, rawWords = []) {
  const fields = [[e.name.replace(/-/g, ' '), 5], [e.keywords.join(' , '), 4], [e.summary, 2], [e.use_when.join(' '), 2], [(e.exports || []).join(' '), 1]]
  let total = 0
  words.forEach((w, wi) => {
    const raw = rawWords[wi]
    const hasAccent = raw && raw !== fold(raw)
    let best = 0
    for (const [text, weight] of fields) {
      const toks = tokens(text)
      if (toks.includes(w)) {
        // A folded-only match ("bang" for "bảng" vs "băng") counts less when the query carried accents.
        const exact = !hasAccent || accented(text).includes(raw)
        best = Math.max(best, exact ? weight : weight * 0.4)
      } else if (w.length >= 4 && toks.some((t) => t.startsWith(w))) best = Math.max(best, weight / 2)
    }
    total += best
  })
  // whole query equals or contains a keyword phrase ("khoảng ngày", "multi select")
  for (const k of e.keywords) { const f = fold(k); if (f.includes(' ') && phrase.includes(f)) total += 4 }
  // prefer a ready-made block over the primitive it is built from when they tie
  return total + (total > 0 && (e.kind === 'block' || e.kind === 'addon') ? 0.5 : 0)
}

function line(e) {
  return `${e.name.padEnd(16)} [${e.category}${e.kind === 'addon' ? ', add-on' : ''}] ${e.summary}`
}

function show(e) {
  const v = Object.entries(e.variants || {}).map(([k, vals]) => `${k}: ${vals.join(' | ')}`).join('; ')
  return [
    `## ${e.name}  (${e.category}${e.kind === 'addon' ? ', add-on' : ''})  import from "${e.import}"`,
    e.install && `Install first: ${e.install}`,
    e.summary,
    `Use when: ${e.use_when.join('; ')}`,
    `Avoid when: ${e.avoid_when}`,
    `Exports: ${(e.exports || []).join(', ')}`,
    v && `Variants: ${v}`,
    `Example: ${e.example}`,
    e.related.length ? `Related: ${e.related.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

const argv = process.argv.slice(2)
const pIdx = argv.indexOf('--project')
const projectDir = pIdx >= 0 ? argv[pIdx + 1] : fs.existsSync('.aura/components.json') ? '.aura' : null
const [cmd, ...args] = pIdx >= 0 ? argv.filter((_, i) => i !== pIdx && i !== pIdx + 1) : argv
const loadProject = () => {
  if (!projectDir) return null
  try { return JSON.parse(fs.readFileSync(path.join(projectDir, 'components.json'), 'utf8')) } catch { return null }
}
const projectLine = (e) => `${e.name.padEnd(22)} [${e.category}] ${e.import}${e.usedBy ? ` · used in ${e.usedBy} files` : ''}${Object.keys(e.variants || {}).length ? ` · variants ${Object.entries(e.variants).map(([k, v]) => `${k}: ${v.join('|')}`).join('; ')}` : ''}`

if (cmd === 'sync') sync()
else if (cmd === 'find' && args.length) {
  const phrase = tokens(args.join(' ')).join(' ')
  const words = phrase.split(' ')
  const rawWords = accented(args.join(' '))
  const rank = (list) => list.map((e) => [score(e, words, phrase, rawWords.length === words.length ? rawWords : []), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])
  const auraHits = rank(load())
  const project = loadProject()
  if (project) {
    // Direct matches on the project's names, plus "bridged" matches: aura hits for the query mapped to same-named project components.
    const bridged = new Map()
    for (const [s, a] of auraHits.slice(0, 4)) {
      const pascal = a.name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')
      for (const e of project) if (e.name.toLowerCase() === a.name || (e.exports || []).includes(pascal)) bridged.set(e, Math.max(bridged.get(e) ?? 0, s))
    }
    const merged = new Map(rank(project).map(([s, e]) => [e, s]))
    for (const [e, s] of bridged) merged.set(e, (merged.get(e) ?? 0) + s)
    const hits = [...merged].sort((a, b) => b[1] - a[1] || (b[0].usedBy ?? 0) - (a[0].usedBy ?? 0)).slice(0, 5)
    console.log('In this project:')
    console.log(hits.length ? hits.map(([e]) => '  ' + projectLine(e)).join('\n') : '  (no matching component: build it in the project\'s style, see the aura reference below)')
    if (auraHits.length) console.log('\nAura reference (not installed here; port to the project\'s stack only if nothing above fits):\n' + auraHits.slice(0, 2).map(([, e]) => '  ' + line(e)).join('\n'))
  } else {
    const hits = auraHits.slice(0, 5)
    if (!hits.length) console.log('No match. Try other words, or `list` to see every component.')
    for (const [, e] of hits) console.log(line(e))
    if (hits.length) console.log(`\nDetails: node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} show ${hits.slice(0, 2).map(([, e]) => e.name).join(' ')}`)
  }
} else if (cmd === 'show' && args.length) {
  const all = [...(loadProject() ?? []), ...load()]
  for (const n of args) {
    const e = all.find((x) => x.name === n)
    console.log(!e ? `Unknown component: ${n}\n` : e.kind === 'project' ? `## ${e.name} (project ${e.category})  import from "${e.import}"\nFile: ${e.path}\nExports: ${e.exports.join(', ')}\n${Object.keys(e.variants).length ? `Variants: ${JSON.stringify(e.variants)}\n` : ''}Used in ${e.usedBy} files. Open the file for props.\n` : show(e) + '\n')
  }
} else if (cmd === 'list') {
  const project = loadProject()
  if (project) for (const e of project.filter((x) => !args[0] || x.category === args[0])) console.log(projectLine(e))
  else for (const e of load().filter((x) => !args[0] || x.category === args[0])) console.log(line(e))
} else {
  console.log('usage: catalog.mjs find <words…> | show <name…> | list [category] | sync   [--project <dir>]')
  process.exitCode = 2
}
