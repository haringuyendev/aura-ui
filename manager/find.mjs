// "I need X" → the project's components that fit, ranked. Vietnamese and English, accents optional.
// The aura catalog acts as a thesaurus: "ô nhập liệu" → input/textarea/select → the project's own ones,
// plus components that wrap them (their `uses`).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean)
const accented = (s) => s.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean)

// Vietnamese UI words → English names project components usually carry. Multi-word phrases first
// (matched on the accent-folded query), then unambiguous single words.
const PHRASES = {
  'hinh anh': ['image', 'media', 'photo', 'picture', 'gallery'], 'anh': ['image', 'media', 'photo'], 'video': ['video', 'media'],
  'nut bam': ['button', 'cta'], 'nut': ['button', 'cta'], 'o nhap': ['input', 'field'], 'nhap lieu': ['input', 'field', 'form'],
  'bieu mau': ['form'], 'form': ['form'], 'dang ky': ['register', 'signup', 'lead', 'form'], 'lien he': ['contact', 'lead'],
  'bang du lieu': ['table', 'grid'], 'bang gia': ['price', 'pricing'], 'gia': ['price', 'pricing'], 'danh sach': ['list'],
  'the': ['card'], 'lien ket': ['link'], 'duong dan': ['link'], 'tieu de': ['heading', 'title', 'hero'], 'dau trang': ['header'],
  'chan trang': ['footer'], 'ban do': ['map', 'location'], 'vi tri': ['location', 'map'], 'hop thoai': ['dialog', 'modal'],
  'popup': ['dialog', 'modal'], 'menu': ['menu', 'nav', 'navigation'], 'dieu huong': ['nav', 'navigation', 'menu'], 'logo': ['logo'],
  'lua chon': ['select', 'option'], 'chon ngay': ['date', 'calendar'], 'ngay': ['date'], 'lich': ['calendar', 'schedule'],
  'tai len': ['upload'], 'tai xuong': ['download'], 'tep': ['file', 'document'], 'tai lieu': ['document', 'legal', 'file'],
  'phan trang': ['pagination'], 'thong bao': ['toast', 'alert', 'notification', 'banner'], 'canh bao': ['alert', 'warning'],
  'tim kiem': ['search'], 'bo loc': ['filter'], 'loc': ['filter'], 'bang chuyen': ['carousel', 'slider'], 'trinh chieu': ['carousel', 'slider'],
  'van ban': ['text', 'richtext', 'content'], 'noi dung': ['content', 'richtext'], 'tien ich': ['amenities'], 'chinh sach': ['policy', 'policies'],
  'tien do': ['progress'], 'mat bang': ['layout', 'floor', 'masterplan', 'plan'], 'can ho': ['apartment', 'unit'], 'toa nha': ['tower', 'building'],
  'tong quan': ['overview'], 'du an': ['project'], 'phap ly': ['legal'], 'tu van': ['consultation', 'consult'], 'ma': ['code'],
}
const expand = (words) => {
  const phrase = ` ${words.join(' ')} `
  const out = new Set()
  for (const [k, v] of Object.entries(PHRASES)) if (phrase.includes(` ${k} `)) v.forEach((e) => out.add(e))
  return [...out]
}

/** Aura catalog: next to this file when vendored into .aura/bin, else the skill's catalog/. */
export function loadAuraCatalog() {
  for (const p of [path.join(here, 'aura-catalog.json'), path.join(here, '..', 'catalog', 'components.json')]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { /* try next */ }
  }
  return []
}

function score(fields, words, raw) {
  let total = 0
  words.forEach((w, i) => {
    const hasAccent = raw[i] && raw[i] !== fold(raw[i])
    let best = 0
    for (const [text, weight] of fields) {
      if (!text) continue
      const toks = tokens(text)
      if (toks.includes(w)) best = Math.max(best, !hasAccent || accented(text).includes(raw[i]) ? weight : weight * 0.4)
      else if (w.length >= 4 && toks.some((t) => t.startsWith(w))) best = Math.max(best, weight / 2)
    }
    total += best
  })
  return total
}

const auraFields = (e) => [[e.name.replace(/-/g, ' '), 5], [e.keywords.join(' , '), 4], [e.summary, 2], [e.use_when.join(' '), 2]]
const projectFields = (c) => [
  [c.name, 5],
  [[...(c.keywords ?? []), ...(c.extra_keywords ?? [])].join(' , '), 4],
  [c.exports.join(' '), 3],
  [c.summary ?? c.doc ?? '', 2],
  [(c.use_when ?? []).join(' '), 2],
]

export function findComponents(registry, query, { limit = 6 } = {}) {
  const words = tokens(query)
  const raw = accented(query)
  const rawAligned = raw.length === words.length ? raw : []
  const phrase = words.join(' ')
  const aura = loadAuraCatalog()
    .map((e) => [score(auraFields(e), words, rawAligned) + e.keywords.reduce((s, k) => s + (fold(k).includes(' ') && phrase.includes(fold(k)) ? 4 : 0), 0), e])
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0])
  const topAura = aura.slice(0, 5)
  const pascal = (n) => n.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')

  const synonyms = expand(words).filter((w) => !words.includes(w))
  const results = []
  for (const c of registry.components) {
    let s = score(projectFields(c), words, rawAligned)
    const nameToks = tokens([c.name, ...c.exports].join(' ').replace(/([a-z])([A-Z])/g, '$1 $2'))
    // Synonym hits on the component's own name are strong evidence ("vị trí" → location → LocationBlock).
    const syn = synonyms.filter((w) => nameToks.some((t) => t === w || (w.length >= 4 && (t.startsWith(w) || w.startsWith(t)) && t.length >= 4))).length
    if (syn) s += 4 * syn
    const why = []
    // Bridge through the aura thesaurus only for confident matches, and below direct/synonym evidence.
    for (const [as, a] of topAura.filter(([as]) => as >= topAura[0][0] * 0.6)) {
      const same = c.name.toLowerCase() === a.name || c.exports.includes(pascal(a.name))
      if (same) { s += Math.min(as, 6) * 0.6; why.push(`is a ${a.name}`) }
      else if ((c.uses ?? []).includes(a.name)) { s += Math.min(as, 6) * 0.25; why.push(`wraps ${a.name}`) }
    }
    if (s > 0) results.push({ score: s + Math.min(c.usedBy ?? 0, 20) / 20, component: c, why })
  }
  results.sort((a, b) => b.score - a.score)
  return { results: results.slice(0, limit), aura: topAura.slice(0, 2).map(([, e]) => e) }
}

export function formatComponent(c, { detail = false } = {}) {
  const head = `${c.name} [${c.category}] import { ${c.exports.slice(0, 4).join(', ')}${c.exports.length > 4 ? ', …' : ''} } from "${c.import}" · used in ${c.usedBy ?? 0} files`
  const desc = c.summary ?? c.doc
  const lines = [head]
  if (desc) lines.push(`  ${desc}`)
  if (Object.keys(c.variants ?? {}).length) lines.push(`  variants: ${Object.entries(c.variants).map(([k, v]) => `${k}=${v.join('|')}`).join('; ')}`)
  if (detail) {
    if (c.use_when?.length) lines.push(`  use when: ${c.use_when.join('; ')}`)
    if (c.avoid_when) lines.push(`  avoid when: ${c.avoid_when}`)
    if (Object.keys(c.props ?? {}).length) lines.push(`  props: ${Object.entries(c.props).map(([k, v]) => `${k}: ${v}`).join('; ')}`)
    if (c.uses?.length) lines.push(`  built on: ${c.uses.join(', ')}`)
    if (c.example) lines.push(`  example: ${c.example}`)
    lines.push(`  file: ${c.path}${c.usedIn?.length ? ` · e.g. used in ${c.usedIn.slice(0, 3).join(', ')}` : ''}`)
  }
  return lines.join('\n')
}
