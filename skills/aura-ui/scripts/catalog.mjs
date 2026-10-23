#!/usr/bin/env node
// Component catalog for the aura-ui starter.
//   node catalog.mjs find <words…>   best matches for a need (Vietnamese or English, accents optional)
//   node catalog.mjs show <name…>    full entries
//   node catalog.mjs list [category] one line per component
//   node catalog.mjs sync            refresh exports/variants/deps from template/src/components/ui (maintainers)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'catalog', 'components.json')
const uiDir = path.join(root, 'template', 'src', 'components', 'ui')

const load = () => JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

function extract(file) {
  const s = fs.readFileSync(file, 'utf8')
  const exportsBlock = (s.match(/export\s*\{([\s\S]*?)\}/) || [, ''])[1]
  const exports = exportsBlock.split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()).filter(Boolean)
  const deps = [...new Set((s.match(/from "(@base-ui\/react\/[a-z-]+|recharts|cmdk|vaul|embla-carousel-react|input-otp|react-day-picker|react-resizable-panels)"/g) || []).map((x) => x.slice(6, -1)))]
  const variants = {}
  const block = s.match(/variants:\s*\{([\s\S]*?)\n {4}\},?\n/)
  if (block) for (const g of block[1].matchAll(/^ {6}(\w+):\s*\{([\s\S]*?)^ {6}\}/gm)) variants[g[1]] = [...g[2].matchAll(/^ {8}"?([\w-]+)"?:/gm)].map((x) => x[1])
  return { exports, variants, deps }
}

function sync() {
  const entries = load()
  const byName = new Map(entries.map((e) => [e.name, e]))
  const files = fs.readdirSync(uiDir).filter((f) => f.endsWith('.tsx')).map((f) => f.replace(/\.tsx$/, ''))
  const missing = files.filter((n) => !byName.has(n))
  const stale = entries.filter((e) => !files.includes(e.name)).map((e) => e.name)
  for (const e of entries) {
    if (!files.includes(e.name)) continue
    Object.assign(e, { import: `@/components/ui/${e.name}` }, extract(path.join(uiDir, `${e.name}.tsx`)))
  }
  entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  fs.writeFileSync(catalogPath, JSON.stringify(entries, null, 2) + '\n')
  console.log(`synced ${entries.length - stale.length} entries`)
  if (missing.length) console.log(`MISSING catalog entries (add them by hand): ${missing.join(', ')}`)
  if (stale.length) console.log(`STALE entries (component file gone): ${stale.join(', ')}`)
  process.exitCode = missing.length || stale.length ? 1 : 0
}

const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean)

function score(e, words, phrase) {
  const fields = [[e.name.replace(/-/g, ' '), 5], [e.keywords.join(' , '), 4], [e.summary, 2], [e.use_when.join(' '), 2], [(e.exports || []).join(' '), 1]]
    .map(([text, weight]) => [tokens(text), weight])
  let total = 0
  for (const w of words) {
    let best = 0
    for (const [toks, weight] of fields) {
      if (toks.includes(w)) best = Math.max(best, weight)
      else if (w.length >= 4 && toks.some((t) => t.startsWith(w))) best = Math.max(best, weight / 2)
    }
    total += best
  }
  // whole query equals or contains a keyword phrase ("khoảng ngày", "multi select")
  for (const k of e.keywords) { const f = fold(k); if (f.includes(' ') && phrase.includes(f)) total += 4 }
  return total
}

function line(e) {
  return `${e.name.padEnd(16)} [${e.category}] ${e.summary}`
}

function show(e) {
  const v = Object.entries(e.variants || {}).map(([k, vals]) => `${k}: ${vals.join(' | ')}`).join('; ')
  return [
    `## ${e.name}  (${e.category})  import from "${e.import}"`,
    e.summary,
    `Use when: ${e.use_when.join('; ')}`,
    `Avoid when: ${e.avoid_when}`,
    `Exports: ${(e.exports || []).join(', ')}`,
    v && `Variants: ${v}`,
    `Example: ${e.example}`,
    e.related.length ? `Related: ${e.related.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

const [cmd, ...args] = process.argv.slice(2)
if (cmd === 'sync') sync()
else if (cmd === 'find' && args.length) {
  const phrase = tokens(args.join(' ')).join(' ')
  const words = phrase.split(' ')
  const hits = load().map((e) => [score(e, words, phrase), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 5)
  if (!hits.length) console.log('No match. Try other words, or `list` to see every component.')
  for (const [, e] of hits) console.log(line(e))
  if (hits.length) console.log(`\nDetails: node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} show ${hits.slice(0, 2).map(([, e]) => e.name).join(' ')}`)
} else if (cmd === 'show' && args.length) {
  const all = load()
  for (const n of args) { const e = all.find((x) => x.name === n); console.log(e ? show(e) + '\n' : `Unknown component: ${n}\n`) }
} else if (cmd === 'list') {
  for (const e of load().filter((x) => !args[0] || x.category === args[0])) console.log(line(e))
} else {
  console.log('usage: catalog.mjs find <words…> | show <name…> | list [category] | sync')
  process.exitCode = 2
}
