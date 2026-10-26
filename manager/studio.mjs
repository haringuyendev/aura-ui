// aura studio: a local Lovable-style page - chat on the left, the project's dev server on the right.
// Each message runs Claude Code headless in the repo (claude -p, stream-json), so the user's login, the aura-ui
// skills and hooks (check, verify, primitive approval) apply exactly as in the terminal.
// State (session id, transcript, chosen app/page) lives in .aura/cache/studio.json.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from './inspect.mjs'
import { packageManager } from './primitives.mjs'
import { allRoutes } from './routes.mjs'
import { devServer } from './verify.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback } }

const SYSTEM = `You are running inside Aura Studio: a chat page next to a live preview of this project's dev server. The user reads your replies in the chat, not a terminal.
- Reply in Vietnamese, short: what you changed and where it shows (1-4 lines). No long reports, no code dumps unless asked.
- Build UI with the aura-ui:build skill: compose screens from the project's components (aura find / scaffold / snippet / variant), semantic tokens only.
- Before you finish a UI change, run node .aura/bin/aura.mjs verify and fix what it reports.
- Studio runs the dev server and the preview reloads by itself: don't start, stop or restart dev servers.
- Things that need the user's approval (a new primitive, deleting files, installing packages): ask in one line and stop; Studio shows them buttons.`

/** Short Vietnamese label for a tool call, as shown in the chat. */
function describeTool(ctx, name, input = {}) {
  const rel = (p) => (p ? ctx.rel(path.resolve(ctx.repo, p)) : '')
  if (name === 'Read') return `Đọc ${rel(input.file_path)}`
  if (name === 'Write') return `${fs.existsSync(path.resolve(ctx.repo, input.file_path ?? '')) ? 'Ghi' : 'Tạo'} ${rel(input.file_path)}`
  if (name === 'Edit' || name === 'MultiEdit') return `Sửa ${rel(input.file_path)}`
  if (name === 'Bash') {
    const aura = input.command?.match(/aura(?:\.mjs)?["']?\s+(\w+)(.*)/)
    return aura ? `Aura ${aura[1]}${aura[2].trim() ? ' ' + aura[2].trim().slice(0, 60) : ''}` : `Chạy ${String(input.description || input.command || '').slice(0, 80)}`
  }
  if (name === 'Glob' || name === 'Grep') return `Tìm ${input.pattern ?? ''}`
  if (name === 'Skill') return `Dùng skill ${input.skill ?? ''}`
  if (name === 'Task' || name === 'Agent') return `Giao việc: ${input.description ?? ''}`
  if (name === 'TodoWrite') return 'Lên kế hoạch'
  if (name === 'WebFetch' || name === 'WebSearch') return `Tra cứu ${input.url ?? input.query ?? ''}`
  return name.replace(/^mcp__\w+__/, '')
}

/** Folders that serve a page: the repo root and workspace packages with a dev script. */
function apps(ctx) {
  return ['.', ...ctx.workspaces.map((w) => w.dir)]
    .map((dir) => ({ dir, pkg: readJson(path.join(ctx.repo, dir, 'package.json'), {}) }))
    .filter((a) => a.pkg.scripts?.dev)
    .map((a) => ({ dir: a.dir, name: a.pkg.name ?? path.basename(path.resolve(ctx.repo, a.dir)), dev: `${packageManager(ctx)} run dev` }))
}

/** Open the URL in the default browser (best effort). */
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref() } catch {}
}

/**
 * opts: { port, app, open, model, permissionMode }
 * deps: { refresh() → { index } } (the CLI's incremental scan, for the route list)
 */
export async function studio(ctx, deps, opts = {}) {
  const stateFile = path.join(ctx.auraDir, 'cache', 'studio.json')
  const approvedFile = path.join(ctx.auraDir, 'cache', 'studio-approved.json')
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  const state = { sessionId: null, messages: [], app: null, path: '/', ...readJson(stateFile, {}) }
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1))
  const appList = apps(ctx)
  if (opts.app) state.app = opts.app
  if (!appList.some((a) => a.dir === state.app)) state.app = appList.find((a) => a.dir !== '.')?.dir ?? appList[0]?.dir ?? '.'
  const permissionMode = opts.permissionMode ?? ctx.config.studio?.permissionMode ?? 'auto'
  const model = opts.model ?? ctx.config.studio?.model

  let playwright = !!(await loadPlaywright(ctx).catch(() => null))
  let run = null // { child, aborted }
  const devs = {} // app dir → { child, log }

  // ---- one chat turn: claude -p, translated into small events for the page ----
  function chat(text, ctxLine, send) {
    const user = { role: 'user', text, at: Date.now() }
    const reply = { role: 'assistant', parts: [], at: Date.now() }
    state.messages.push(user, reply)
    save()
    const args = ['-p', `${ctxLine}\n\n${text}`, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--permission-mode', permissionMode, '--append-system-prompt', SYSTEM, '--allowedTools', 'Bash(node .aura/bin/aura.mjs:*)']
    if (state.sessionId) args.push('--resume', state.sessionId)
    if (model) args.push('--model', model)
    const child = spawn('claude', args, { cwd: ctx.repo, env: { ...process.env, AURA_STUDIO: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    run = { child, aborted: false }
    const emit = (e) => { send(e); return e }
    const lastText = () => reply.parts.at(-1)?.kind === 'text' ? reply.parts.at(-1) : null
    const tools = new Map()
    const approvals = new Set()
    const noteApproval = (s) => {
      for (const m of String(s).matchAll(/\[aura-approve:([^\]]+)\]/g))
        for (const n of m[1].split(',')) if (!approvals.has(n)) { approvals.add(n); reply.parts.push({ kind: 'approve', name: n }); emit({ t: 'approve', name: n }) }
    }
    let buf = '', stderr = '', fresh = true
    const rawLog = path.join(ctx.auraDir, 'cache', 'studio-last.jsonl') // the last turn's stream, for debugging
    fs.writeFileSync(rawLog, '')
    const line = (raw) => {
      let o
      try { o = JSON.parse(raw) } catch { return }
      fs.appendFileSync(rawLog, raw + '\n')
      if (o.type === 'stream_event' && !o.parent_tool_use_id && o.event?.type === 'message_start') fresh = true
      if (o.type === 'system' && o.subtype === 'init') {
        if (state.sessionId !== o.session_id) { state.sessionId = o.session_id; save() }
      } else if (o.type === 'system' && o.subtype === 'informational' && /Aura/.test(o.content ?? '')) {
        // a hook's systemMessage ("Stop says: Aura: …")
        const label = String(o.content).replace(/^\w+ says:\s*/, '').split('\n')[0].slice(0, 200)
        reply.parts.push({ kind: 'aura', text: label }); emit({ t: 'aura', text: label })
      } else if (o.type === 'system' && o.subtype === 'hook_response') {
        noteApproval(o.output ?? o.stdout ?? '')
        // An Aura hook that blocked (Stop asking for verify, a rule violation): show it as a step.
        const parsed = (() => { try { return JSON.parse(o.stdout || o.output || '') } catch { return null } })()
        const reason = parsed?.decision === 'block' ? parsed.reason : o.exit_code === 2 ? o.stderr : null
        if (reason && /Aura/.test(reason)) {
          const label = String(reason).trim().split('\n')[0].slice(0, 160)
          reply.parts.push({ kind: 'aura', text: label }); emit({ t: 'aura', text: label })
        }
      } else if (o.type === 'stream_event' && !o.parent_tool_use_id && o.event?.type === 'content_block_delta' && o.event.delta?.type === 'text_delta') {
        // each assistant message (a continuation after a hook, after tools) is its own paragraph
        const part = (!fresh && lastText()) || (reply.parts.push({ kind: 'text', text: '' }), reply.parts.at(-1))
        part.text += o.event.delta.text
        emit({ t: 'text', text: o.event.delta.text, fresh })
        fresh = false
      } else if (o.type === 'assistant') {
        for (const b of o.message?.content ?? []) if (b.type === 'tool_use' && !tools.has(b.id)) {
          const tool = { kind: 'tool', id: b.id, name: b.name, label: describeTool(ctx, b.name, b.input), sub: !!o.parent_tool_use_id, status: 'run' }
          tools.set(b.id, tool); reply.parts.push(tool); emit({ t: 'tool', ...tool })
        }
      } else if (o.type === 'user') {
        // a blocking hook's reason comes back to the model as a user turn (Stop asking for verify, a rule violation)
        const said = typeof o.message?.content === 'string' ? o.message.content : (o.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        const aura = said.match(/Aura[^\n]*/)?.[0]
        if (aura && !o.parent_tool_use_id) { const label = aura.slice(0, 200); reply.parts.push({ kind: 'aura', text: label }); emit({ t: 'aura', text: label }) }
        for (const b of Array.isArray(o.message?.content) ? o.message.content : []) if (b.type === 'tool_result' && tools.has(b.tool_use_id)) {
          const tool = tools.get(b.tool_use_id)
          tool.status = b.is_error ? 'error' : 'ok'
          noteApproval(typeof b.content === 'string' ? b.content : JSON.stringify(b.content))
          emit({ t: 'tool_done', id: tool.id, status: tool.status })
        }
      } else if (o.type === 'result') {
        reply.meta = { ok: o.subtype === 'success' && !o.is_error, cost: o.total_cost_usd, ms: o.duration_ms }
        if (!reply.parts.some((p) => p.kind === 'text') && o.result) { reply.parts.push({ kind: 'text', text: o.result }); emit({ t: 'text', text: o.result }) }
      }
    }
    child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1) } })
    child.stderr.on('data', (d) => { stderr += d })
    return new Promise((resolve) => {
      const finish = (code, err) => {
        if (buf.trim()) line(buf)
        for (const t of tools.values()) if (t.status === 'run') t.status = run?.aborted ? 'error' : 'ok'
        reply.meta ??= { ok: false }
        if (run?.aborted) reply.meta.stopped = true
        else if (code && !reply.parts.length) reply.parts.push({ kind: 'text', text: `Không chạy được Claude Code (${err ?? `exit ${code}`}). ${stderr.trim().split('\n').slice(-3).join(' ')}`.trim() })
        save()
        run = null
        emit({ t: 'done', message: reply })
        resolve()
      }
      child.on('error', (e) => finish(1, e.code === 'ENOENT' ? 'không tìm thấy lệnh claude trong PATH' : e.message))
      child.on('close', (code) => finish(code))
    })
  }

  async function startDev(app) {
    const a = appList.find((x) => x.dir === app)
    if (!a) return { url: null, error: 'Không có app này' }
    const found = await devServer(ctx, app)
    if (found.url) return { url: found.url }
    if (!devs[app]) {
      const [bin, ...rest] = a.dev.split(' ')
      const child = spawn(bin, rest, { cwd: path.join(ctx.repo, app), env: { ...process.env, BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] })
      devs[app] = { child, log: '' }
      const keep = (d) => { devs[app].log = (devs[app].log + d).slice(-4000) }
      child.stdout.on('data', keep); child.stderr.on('data', keep)
      child.on('close', () => { if (devs[app]?.child === child) delete devs[app] })
    }
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500))
      // The dev server prints its URL: trust that first (it may pick another port).
      const printed = devs[app]?.log.replace(/\x1b\[[0-9;]*m/g, '').match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/)?.[0]
      if (printed) { try { const r = await fetch(printed, { signal: AbortSignal.timeout(800) }); if (r.status < 500) return { url: printed } } catch {} }
      const again = await devServer(ctx, app)
      if (again.url) return { url: again.url }
      if (!devs[app]) break
    }
    return { url: null, error: `Dev server chưa lên. ${(devs[app]?.log ?? '').trim().split('\n').slice(-4).join(' ')}` }
  }

  // ---- HTTP ----
  const html = path.join(here, 'studio.html')
  const port = Number(opts.port ?? ctx.config.studio?.port ?? 4400)
  const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`])
  const body = (req) => new Promise((resolve) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 1e6) req.destroy() }); req.on('end', () => { try { resolve(JSON.parse(s || '{}')) } catch { resolve({}) } }) })
  const sendJson = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)) }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    // Local only: reject other hosts (DNS rebinding) and cross-site requests (another site posting a prompt).
    if (!origins.has(`http://${req.headers.host}`)) return sendJson(res, 403, { error: 'host' })
    if (req.method !== 'GET' && (!origins.has(req.headers.origin) || !/json/.test(req.headers['content-type'] ?? ''))) return sendJson(res, 403, { error: 'origin' })

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(fs.readFileSync(html))
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      let routes = []
      try { routes = allRoutes(ctx, deps.refresh().index) } catch {}
      const withUrls = await Promise.all(appList.map(async (a) => ({ ...a, url: (await devServer(ctx, a.dir)).url })))
      return sendJson(res, 200, { project: ctx.pkg?.name ?? path.basename(ctx.repo), repo: ctx.repo, apps: withUrls, app: state.app, path: state.path, routes, messages: state.messages, running: !!run, permissionMode, playwright })
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const b = await body(req)
      if (!b.text?.trim()) return sendJson(res, 400, { error: 'empty' })
      if (run) return sendJson(res, 409, { error: 'busy' })
      if (b.app) state.app = b.app
      if (b.path) state.path = b.path
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' })
      const send = (e) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`) }
      let where = `[Aura Studio] The user is looking at ${state.path} of ${state.app === '.' ? 'the app' : state.app} in the preview${b.width ? ` at ${b.width}px wide` : ''}.`
      if (!playwright) where += ` Playwright is not installed, so aura verify can't open pages: run it with --skip-inspect "Playwright chưa cài" (Studio shows the user a button to install it). Don't ask to install it yourself.`
      await chat(b.text.trim(), where, send)
      return res.end()
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      if (run) { run.aborted = true; run.child.kill('SIGINT'); setTimeout(() => run?.child.kill('SIGKILL'), 3000) }
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      if (run) return sendJson(res, 409, { error: 'busy' })
      Object.assign(state, { sessionId: null, messages: [] }); save()
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/approve') {
      const b = await body(req)
      const list = readJson(approvedFile, [])
      if (b.name && b.ok && !list.includes(b.name)) fs.writeFileSync(approvedFile, JSON.stringify([...list, b.name]))
      for (const m of state.messages) for (const p of m.parts ?? []) if (p.kind === 'approve' && p.name === b.name && !p.decided) p.decided = b.ok ? 'yes' : 'no'
      save()
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/view') {
      const b = await body(req)
      if (b.app && appList.some((a) => a.dir === b.app)) state.app = b.app
      if (typeof b.path === 'string') state.path = b.path || '/'
      save()
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/playwright') {
      // dev dependency in the previewed app + its browser, with the project's package manager
      const pm = packageManager(ctx)
      const add = { bun: 'bun add -d playwright', pnpm: 'pnpm add -D playwright', yarn: 'yarn add -D playwright' }[pm] ?? 'npm i -D playwright'
      const exec = { bun: 'bunx', pnpm: 'pnpm exec', yarn: 'yarn' }[pm] ?? 'npx'
      const cwd = path.join(ctx.repo, state.app ?? '.')
      const runCmd = (cmd) => new Promise((resolve) => {
        const [bin, ...rest] = cmd.split(' ')
        let log = ''
        const child = spawn(bin, rest, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
        child.stdout.on('data', (d) => { log = (log + d).slice(-2000) }); child.stderr.on('data', (d) => { log = (log + d).slice(-2000) })
        child.on('error', (e) => resolve({ code: 1, log: e.message }))
        child.on('close', (code) => resolve({ code, log }))
      })
      for (const cmd of [add, `${exec} playwright install chromium`]) {
        const r = await runCmd(cmd)
        if (r.code) return sendJson(res, 200, { ok: false, error: `${cmd} lỗi: ${r.log.trim().split('\n').slice(-3).join(' ')}` })
      }
      playwright = !!(await loadPlaywright(ctx).catch(() => null))
      return sendJson(res, 200, { ok: playwright, error: playwright ? null : 'Đã cài nhưng chưa nạp được Playwright.' })
    }
    if (req.method === 'POST' && url.pathname === '/api/dev') {
      const b = await body(req)
      return sendJson(res, 200, await startDev(b.app ?? state.app))
    }
    sendJson(res, 404, { error: 'not found' })
  })

  const stopAll = () => {
    run?.child.kill('SIGINT')
    for (const d of Object.values(devs)) d.child.kill('SIGTERM')
    process.exit(0)
  }
  process.on('SIGINT', stopAll)
  process.on('SIGTERM', stopAll)

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const url = `http://localhost:${port}`
  console.log(`Aura Studio: ${url}  (repo ${ctx.repo}; Claude Code permission mode: ${permissionMode}; Ctrl+C to stop)`)
  if (!appList.length) console.log('No package.json with a "dev" script found: the preview stays empty until one exists.')
  if (opts.open !== false) openBrowser(url)
  return server
}
