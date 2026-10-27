#!/usr/bin/env node
// End-to-end smoke test of aura-ui on this OS (CI runs it on macOS, Linux and Windows):
// new app from the starter → check → scaffold → hooks block a raw <button> → verify → Studio API (state, upload, file,
// origin guard) → Studio "new app" mode. Usage: node scripts/smoke.mjs [workdir]   (exit 1 on the first failure)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { killTree, run, which } from '../manager/proc.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const aura = path.join(root, 'manager', 'aura.mjs')
// the temp folder as Windows gives it (8.3 short names like RUNNER~1): what users get from os.tmpdir() too
const work = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'aura-smoke-')))
const app = path.join(work, 'app')
let failed = 0
const step = async (name, fn) => {
  const t = Date.now()
  try { await fn(); console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`) } catch (e) { failed++; console.log(`✗ ${name}\n  ${String(e.stack ?? e).split('\n').slice(0, 6).join('\n  ')}`); process.exit(1) }
}
const assert = (ok, msg) => { if (!ok) throw new Error(msg) }
const cli = (args, opts = {}) => spawnSync(process.execPath, [aura, ...args], { cwd: app, encoding: 'utf8', ...opts })
const hook = (event, input) => spawnSync(process.execPath, [aura, 'hook', event], { cwd: app, encoding: 'utf8', input: JSON.stringify({ session_id: 'smoke', cwd: app, ...input }), env: { ...process.env, CLAUDE_PROJECT_DIR: app } })

/** Start aura studio in `cwd`, wait for its URL, return { base, stop }. */
async function studio(cwd, port) {
  const child = spawn(process.execPath, [aura, 'studio', '--no-open', '--port', String(port)], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { out += d })
  for (let i = 0; i < 60 && !/Aura Studio:/.test(out); i++) await new Promise((r) => setTimeout(r, 250))
  assert(/Aura Studio:/.test(out), `studio did not start: ${out}`)
  // Windows has no SIGTERM handler to run Studio's cleanup: ask it to stop its dev servers through the tree kill
  return { base: `http://localhost:${port}`, stop: () => killTree(child), out: () => out }
}

console.log(`aura-ui smoke on ${process.platform} ${process.arch}, node ${process.version}, in ${work}`)

await step('programs are found (npm through .cmd on Windows)', async () => {
  assert(which('npm'), 'npm not found')
  const r = await new Promise((resolve) => { const c = run('npm', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; c.stdout.on('data', (d) => { o += d }); c.on('close', (code) => resolve({ code, o })); c.on('error', (e) => resolve({ code: 1, o: e.message })) })
  assert(r.code === 0 && /\d+\.\d+/.test(r.o), `npm --version failed: ${r.o}`)
})

await step('aura setup reports this machine', async () => {
  const r = cli(['setup'], { cwd: root })
  assert(/Node\.js/.test(r.stdout), r.stdout + r.stderr)
})

await step('aura new creates the app (copy, install, init)', async () => {
  fs.rmSync(app, { recursive: true, force: true })
  const r = spawnSync(process.execPath, [aura, 'new', app, '--name', 'smoke-app'], { cwd: work, encoding: 'utf8', timeout: 600000 })
  assert(r.status === 0, `exit ${r.status}\n${r.stdout}\n${r.stderr}`)
  assert(fs.existsSync(path.join(app, '.aura', 'registry.json')), 'no .aura/registry.json')
  assert(fs.existsSync(path.join(app, 'node_modules', 'react')), 'dependencies not installed')
  assert(JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).name === 'smoke-app', 'package name not set')
})

await step('aura check passes on the starter', async () => {
  const r = cli(['check'])
  assert(r.status === 0, r.stdout + r.stderr)
})

await step('aura export zips the source without node_modules, caches or .env', async () => {
  fs.writeFileSync(path.join(app, '.env'), 'SECRET=1\n')
  const out = path.join(work, 'export.zip')
  const r = cli(['export', '--out', out])
  fs.rmSync(path.join(app, '.env'))
  assert(r.status === 0 && fs.existsSync(out), r.stdout + r.stderr)
  // entry names from the zip's central directory (no unzip on every CI runner)
  const z = fs.readFileSync(out), end = z.length - 22, names = []
  for (let i = 0, at = z.readUInt32LE(end + 16); i < z.readUInt16LE(end + 10); i++) {
    const n = z.readUInt16LE(at + 28), extra = z.readUInt16LE(at + 30), note = z.readUInt16LE(at + 32)
    names.push(z.toString('utf8', at + 46, at + 46 + n)); at += 46 + n + extra + note
  }
  assert(names.includes('smoke-app/package.json') && names.includes('smoke-app/src/main.tsx'), `missing source: ${names.slice(0, 5).join(', ')}`)
  const bad = names.filter((n) => /\/(node_modules|dist|\.git)\/|\/cache\/|\/\.env$/.test(n))
  assert(!bad.length, `should not be in the zip: ${bad.slice(0, 5).join(', ')}`)
  assert(/Left out .*\.env/.test(r.stdout), 'the left-out .env is not reported')
})

await step('aura scaffold writes a dashboard that passes check', async () => {
  const r = cli(['scaffold', 'dashboard', 'src/pages/Smoke.tsx', '--name', 'Đơn hàng'])
  assert(r.status === 0, r.stdout + r.stderr)
  const c = cli(['check', 'src/pages/Smoke.tsx'])
  assert(c.status === 0, c.stdout + c.stderr)
})

await step('form scaffold picks dates on a calendar; a typed date is blocked', async () => {
  const r = cli(['scaffold', 'form', 'src/pages/SmokeForm.tsx', '--name', 'Lịch hẹn'])
  assert(r.status === 0, r.stdout + r.stderr)
  const page = fs.readFileSync(path.join(app, 'src', 'pages', 'SmokeForm.tsx'), 'utf8')
  assert(/<DateField\b/.test(page) && !/type="date"/.test(page), 'the form scaffold should use DateField')
  const c = cli(['check', 'src/pages/SmokeForm.tsx'])
  assert(c.status === 0, c.stdout + c.stderr)
  const file = path.join(app, 'src', 'pages', 'TypedDate.tsx')
  fs.writeFileSync(file, 'import { Input } from "@/components/ui/input"\n\nexport default function TypedDate() {\n  return <Input placeholder="dd/mm/yyyy" />\n}\n')
  const h = hook('post-edit', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file } })
  fs.rmSync(file)
  assert(h.status === 2 && /date-without-picker/.test(h.stderr), `exit ${h.status}\n${h.stdout}\n${h.stderr}`)
})

await step('post-edit hook blocks a raw <button>', async () => {
  const file = path.join(app, 'src', 'pages', 'Raw.tsx')
  fs.writeFileSync(file, 'export default function Raw() {\n  return <button onClick={() => {}}>Lưu</button>\n}\n')
  const r = hook('post-edit', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file } })
  assert(r.status === 2 && /Aura blocked/.test(r.stderr) && /bypasses-primitive/.test(r.stderr), `exit ${r.status}\n${r.stdout}\n${r.stderr}`)
  fs.rmSync(file)
})

await step('pre-tool hook asks before adding a primitive (deny + marker under Studio)', async () => {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'node .aura/bin/aura.mjs add rating' } }
  assert(/"permissionDecision":"ask"/.test(hook('pre-tool', input).stdout), 'no ask')
  const r = spawnSync(process.execPath, [aura, 'hook', 'pre-tool'], { cwd: app, encoding: 'utf8', input: JSON.stringify({ session_id: 'smoke', cwd: app, ...input }), env: { ...process.env, CLAUDE_PROJECT_DIR: app, AURA_STUDIO: '1' } })
  assert(/"deny"/.test(r.stdout) && /\[aura-approve:rating\]/.test(r.stdout), r.stdout + r.stderr)
})

await step('aura verify (inspect skipped) records the change', async () => {
  const r = cli(['verify', '--files', path.join(app, 'src', 'pages', 'Smoke.tsx'), '--skip-inspect', 'smoke test'])
  assert(r.status === 0 && /verified/.test(r.stdout), r.stdout + r.stderr)
})

await step('Studio API: state, upload, file, origin guard', async () => {
  const s = await studio(app, 4491)
  try {
    const st = await (await fetch(`${s.base}/api/state`)).json()
    assert(st.project === 'smoke-app' && st.apps.length === 1, JSON.stringify(st).slice(0, 300))
    const up = await fetch(`${s.base}/api/upload?name=${encodeURIComponent('Yêu cầu.csv')}`, { method: 'POST', headers: { origin: s.base, 'content-type': 'application/octet-stream' }, body: 'a,b\n1,2\n' })
    const j = await up.json()
    assert(up.ok && /^[\w.-]+$/.test(j.id) && j.name === 'Yêu cầu.csv', JSON.stringify(j))
    const f = await fetch(`${s.base}/api/file?id=${encodeURIComponent(j.id)}`)
    assert(f.ok && (await f.text()).startsWith('a,b'), `file ${f.status}`)
    assert(fs.existsSync(path.join(app, '.aura', 'cache', 'studio-uploads', j.id)), 'upload not in .aura/cache/studio-uploads')
    const evil = await fetch(`${s.base}/api/reset`, { method: 'POST', headers: { origin: 'http://evil.example', 'content-type': 'application/json' }, body: '{}' })
    assert(evil.status === 403, `cross-site POST got ${evil.status}`)
    const trav = await fetch(`${s.base}/api/file?id=${encodeURIComponent('../studio.json')}`)
    assert(trav.status === 404, `traversal got ${trav.status}`)
  } finally { s.stop() }
})

await step('Studio opens on "new app" in an empty folder', async () => {
  const empty = path.join(work, 'empty')
  fs.rmSync(empty, { recursive: true, force: true }); fs.mkdirSync(empty)
  const s = await studio(empty, 4492)
  try {
    const st = await (await fetch(`${s.base}/api/state`)).json()
    assert(st.mode === 'new' && st.empty === true, JSON.stringify(st))
    // create from the page's API: copy + install + init, then the dev server for the preview
    const res = await fetch(`${s.base}/api/create`, { method: 'POST', headers: { origin: s.base, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Quản lý kho' }) })
    const events = (await res.text()).split('\n\n').filter((c) => c.startsWith('data: ')).map((c) => JSON.parse(c.slice(6)))
    const ready = events.find((e) => e.t === 'ready')
    assert(ready?.url, `no ready event: ${JSON.stringify(events.filter((e) => e.t !== 'log'))}\n${events.slice(-5).map((e) => e.text).join('\n')}`)
    const page = await fetch(ready.url)
    assert(page.ok, `dev server ${ready.url} answered ${page.status}`)
    const after = await (await fetch(`${s.base}/api/state`)).json()
    assert(after.project === 'quan-ly-kho' && after.apps[0]?.url === ready.url, JSON.stringify(after).slice(0, 300))
  } finally { s.stop() }
})

console.log(failed ? `${failed} failed` : 'all passed')
// Windows may still hold files of a just-stopped dev server; leftovers in the temp folder are harmless
if (!process.argv[2]) try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 3 }) } catch {}
