// Export: the project's source as one .zip, like Lovable's "download code": no node_modules, build output, caches or
// secrets. In a git repo the file list is git's (tracked + untracked that aren't ignored), so .gitignore decides;
// elsewhere a walk with the usual exclusions. No dependency: the zip is written with node:zlib.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { runSync } from './proc.mjs'

const SKIP = /(^|\/)(node_modules|\.git|dist|build|out|coverage|\.next|\.turbo|\.vercel|\.vite|\.cache|playwright-report|test-results|storybook-static|\.pnpm-store|\.hcom|\.idea)(\/|$)/
// tool state and per-person settings, not source
const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|[^/]*\.log|\.claude\/settings\.local\.json)$/
// secrets stay out even when committed by mistake; templates (.env.example) are fine
const SECRET = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx)|id_(rsa|ed25519)[^/]*)$/
const TEMPLATE = /\.env\.(example|sample|template)$/

const walk = (root, dir = '') => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = dir ? `${dir}/${e.name}` : e.name
  if (SKIP.test(rel)) return []
  return e.isDirectory() ? walk(root, rel) : e.isFile() ? [rel] : []
})

/** Files to export (paths relative to repo, "/" separated) and the secret files left out. dataDir's cache is skipped. */
export function exportFiles(repo, { dataDir } = {}) {
  const cache = dataDir ? path.relative(repo, path.join(dataDir, 'cache')).split(path.sep).join('/') : null
  const git = runSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8', maxBuffer: 256 << 20 })
  const list = git?.status === 0 ? git.stdout.split('\0').filter(Boolean) : walk(repo)
  const skipped = []
  const files = list.filter((rel) => {
    if (SKIP.test(rel) || JUNK.test(rel) || (cache && (rel === cache || rel.startsWith(`${cache}/`)))) return false
    if (SECRET.test(rel) && !TEMPLATE.test(rel)) { skipped.push(rel); return false }
    try { return fs.statSync(path.join(repo, rel)).isFile() } catch { return false } // deleted, still in the index
  })
  return { files: files.sort(), skipped }
}

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc32 = zlib.crc32 ?? ((buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 })

/** A zip archive of [{ name, data, mtime, mode }] (deflate, UTF-8 names, unix permissions). */
export function zip(entries) {
  if (entries.length >= 0xffff) throw new Error(`too many files for a zip (${entries.length})`)
  const parts = [], central = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const packed = zlib.deflateRawSync(e.data, { level: 9 })
    const stored = packed.length >= e.data.length
    const body = stored ? e.data : packed
    const d = e.mtime ?? new Date()
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
    const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    const crc = crc32(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(name.length, 26)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE((3 << 8) | 20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(stored ? 0 : 8, 10)
    dir.writeUInt16LE(time, 12); dir.writeUInt16LE(date, 14); dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(body.length, 20); dir.writeUInt32LE(e.data.length, 24); dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE((((e.mode ?? 0o644) & 0o777) | 0o100000) * 0x10000, 38); dir.writeUInt32LE(offset, 42)
    parts.push(local, name, body)
    central.push(dir, name)
    offset += local.length + name.length + body.length
    if (offset > 0xffffffff) throw new Error('project too large for a zip (over 4 GB)')
  }
  const size = central.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...central, end])
}

const stamp = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`

/** The project as a zip: everything under one folder named after the project, as Lovable's download does. */
export function exportProject(repo, opts = {}) {
  let pkgName = null
  try { pkgName = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).name } catch {}
  const name = String(pkgName || path.basename(repo)).replace(/^@[^/]+\//, '').replace(/[^\w.-]+/g, '-') || 'project'
  const { files, skipped } = exportFiles(repo, opts)
  const entries = files.map((rel) => {
    const abs = path.join(repo, rel), st = fs.statSync(abs)
    return { name: `${name}/${rel}`, data: fs.readFileSync(abs), mtime: st.mtime, mode: st.mode }
  })
  const buffer = zip(entries)
  return { buffer, files, skipped, filename: `${name}-${stamp()}.zip`, bytes: entries.reduce((n, e) => n + e.data.length, 0) }
}

/** Where `export` writes by default: Downloads when it exists, else the folder next to the project. */
export const defaultExportDir = (repo) => { const dl = path.join(os.homedir(), 'Downloads'); return fs.existsSync(dl) ? dl : path.dirname(repo) }

export const formatSize = (n) => n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
