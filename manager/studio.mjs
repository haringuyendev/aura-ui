// aura studio: a local Lovable-style page - chat on the left, the project's dev server on the right.
// Each message runs Claude Code headless in the repo (claude -p, stream-json), so the user's login, the aura-ui
// skills and hooks (check, verify, primitive approval) apply exactly as in the terminal.
// State (session id, transcript, chosen app/page) lives in .aura/cache/studio.json.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createContext } from './context.mjs'
import { createApp as createFromStarter, isEmptyDir } from './newapp.mjs'
import { killTree, run as runProgram, which } from './proc.mjs'
import { loadPlaywright } from './inspect.mjs'
import { files, refresh } from './registry.mjs'
import { packageManager } from './primitives.mjs'
import { allRoutes } from './routes.mjs'
import { devServer } from './verify.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback } }

const SYSTEM = `You are running inside Aura Studio: a chat page next to a live preview of this project's dev server. The user reads your replies in the chat, not a terminal.
- Everything you write is shown to the user, including short notes between tool calls: write all of it in Vietnamese, or say nothing between tool calls.
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

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html' }
const mimeOf = (name) => MIME[path.extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream'
/** How the agent should use an attachment, by type. */
function attachmentHint(name) {
  const ext = path.extname(name).slice(1).toLowerCase()
  if (/^(png|jpe?g|gif|webp|svg)$/.test(ext)) return "image: a design mockup or a screenshot (of a bug, of a reference). Rebuild what it shows with the project's components and tokens; don't copy colors that aren't tokens"
  if (/^(csv|json|tsv)$/.test(ext)) return 'data: use it as the sample data'
  if (/^(xlsx|xls)$/.test(ext)) return 'Excel file: read it with the xlsx skill (or a short script); use it as data or requirements'
  if (/^(docx|doc)$/.test(ext)) return 'Word file: read it with the docx skill; treat it as requirements'
  if (/^(pptx)$/.test(ext)) return 'slides: read them with the pptx skill; treat them as requirements'
  return 'document: treat it as requirements or reference'
}

const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/**
 * ctx: the aura-managed repo, or null to start on the "new app" screen (create in opts.newDir, or in opts.base/<name>).
 * opts: { port, app, open, model, permissionMode, newDir, base }
 */
export async function studio(initialCtx, opts = {}) {
  let ctx, stateFile, approvedFile, state, appList, playwright, permissionMode, model
  let run = null // { child, aborted }
  let creating = null // { log } while a new app is being created
  const devs = {} // app dir → { child, log, url }
  /** The app's dev server: the one Studio started (its printed URL: another project may hold the default port), else found. */
  const devUrl = async (app) => devs[app]?.url ?? (await devServer(ctx, app)).url
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 1))
  // Attachments live in .aura/cache/studio-uploads (git-ignored); before a new app exists, in a temp folder, moved in on use.
  const staging = path.join(os.tmpdir(), `aura-studio-${process.pid}`)
  const uploadsDir = () => ctx ? path.join(ctx.auraDir, 'cache', 'studio-uploads') : staging
  const findUpload = (id) => {
    if (!/^[\w.-]+$/.test(id ?? '')) return null
    for (const dir of [ctx && uploadsDir(), staging].filter(Boolean)) if (fs.existsSync(path.join(dir, id))) return path.join(dir, id)
    return null
  }

  /** Point Studio at a repo (at start, or once a new app exists). */
  async function attach(c) {
    ctx = c
    stateFile = path.join(ctx.auraDir, 'cache', 'studio.json')
    approvedFile = path.join(ctx.auraDir, 'cache', 'studio-approved.json')
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })
    state = { sessionId: null, messages: [], app: null, path: '/', ...readJson(stateFile, {}) }
    appList = apps(ctx)
    if (opts.app) state.app = opts.app
    if (!appList.some((a) => a.dir === state.app)) state.app = appList.find((a) => a.dir !== '.')?.dir ?? appList[0]?.dir ?? '.'
    permissionMode = opts.permissionMode ?? ctx.config.studio?.permissionMode ?? 'auto'
    model = opts.model ?? ctx.config.studio?.model
    playwright = !!(await loadPlaywright(ctx).catch(() => null))
  }
  if (initialCtx) await attach(initialCtx)
  const routeIndex = () => { refresh(ctx); return JSON.parse(fs.readFileSync(files(ctx).cache, 'utf8')).files }

  /** New app from the aura starter (copy, install, aura init, git init), then point Studio at it. */
  async function createApp(name, onLog) {
    const target = opts.newDir ?? (isEmptyDir(opts.base) ? opts.base : path.join(opts.base, slug(name) || 'app-moi'))
    const created = await createFromStarter({ target, name: slug(name) || path.basename(target), onLog })
    await attach(createContext(created))
    state.fresh = true // the first message builds the app from the user's description
    save()
    return created
  }

  // ---- one chat turn: claude -p, translated into small events for the page ----
  function chat(text, ctxLine, send, attached = []) {
    const user = { role: 'user', text, at: Date.now(), ...(attached.length ? { files: attached.map(({ id, name, type, size }) => ({ id, name, type, size })) } : {}) }
    if (attached.length) ctxLine += `\nThe user attached ${attached.length === 1 ? 'a file' : 'files'} (open with the Read tool):\n${attached.map((f) => `- ${f.rel} (${f.name}) — ${attachmentHint(f.name)}`).join('\n')}`
    const reply = { role: 'assistant', parts: [], at: Date.now() }
    state.messages.push(user, reply)
    save()
    const args = ['-p', `${ctxLine}\n\n${text}`, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--permission-mode', permissionMode, '--append-system-prompt', SYSTEM, '--allowedTools', 'Bash(node .aura/bin/aura.mjs:*)']
    if (state.sessionId) args.push('--resume', state.sessionId)
    if (model) args.push('--model', model)
    const child = runProgram('claude', args, { cwd: ctx.repo, env: { AURA_STUDIO: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
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
        const aura = said.match(/Aura (?:\(\d+\/\d+\)|blocked)[^\n]*/)?.[0]
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
      child.on('error', (e) => finish(1, e.code === 'ENOENT' ? 'không tìm thấy Claude Code CLI. Cài bằng native installer (xem aura setup), rồi mở lại Studio' : e.message))
      child.on('close', (code) => finish(code))
    })
  }

  async function startDev(app) {
    const a = appList.find((x) => x.dir === app)
    if (!a) return { url: null, error: 'Không có app này' }
    if (devs[app]?.url) return { url: devs[app].url }
    const found = await devServer(ctx, app)
    if (found.url && !opts.newDir && !state.fresh) return { url: found.url }
    if (!devs[app]) {
      const [bin, ...rest] = a.dev.split(' ')
      const child = runProgram(bin, rest, { cwd: path.join(ctx.repo, app), env: { BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] })
      child.on('error', (e) => { if (devs[app]) devs[app].log += `\n${e.code === 'ENOENT' ? `không tìm thấy lệnh ${bin}` : e.message}` })
      devs[app] = { child, log: '' }
      const keep = (d) => { devs[app].log = (devs[app].log + d).slice(-4000) }
      child.stdout.on('data', keep); child.stderr.on('data', keep)
      child.on('close', () => { if (devs[app]?.child === child) delete devs[app] })
    }
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500))
      // The dev server prints its URL: trust that first (it may pick another port).
      const printed = devs[app]?.log.replace(/\x1b\[[0-9;]*m/g, '').match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/)?.[0]
      if (printed) { try { const r = await fetch(printed, { signal: AbortSignal.timeout(800) }); if (r.status < 500) { devs[app].url = printed; return { url: printed } } } catch {} }
      const again = devs[app] ? null : await devServer(ctx, app)
      if (again?.url) return { url: again.url }
      if (!devs[app]) break
    }
    return { url: null, error: `Dev server chưa lên. ${(devs[app]?.log ?? '').trim().split('\n').slice(-4).join(' ')}` }
  }

  /** Programs Studio needs that this machine lacks, with the install command for this OS (shown on the page). */
  const missing = () => {
    const win = process.platform === 'win32'
    const out = []
    if (!which('claude')) out.push({ id: 'claude', label: 'Claude Code CLI', why: 'để chat sửa code', fix: win ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash' })
    if (!which('npm')) out.push({ id: 'npm', label: 'Node.js', why: 'để cài thư viện và chạy dev server', fix: 'gõ /aura-ui:setup trong Claude (tab Code): skill tự cài Node, không cần admin' })
    return out
  }

  /** Start a text/event-stream response; returns send(event). A comment every 15s keeps quiet stretches (npm install,
   *  long tool runs) from hitting idle timeouts in browsers and fetch clients. */
  const eventStream = (res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' })
    const ping = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n') }, 15000)
    res.on('close', () => clearInterval(ping))
    return (e) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`) }
  }

  // ---- HTTP ----
  const html = path.join(here, 'studio.html')
  const port = Number(opts.port ?? ctx?.config.studio?.port ?? 4400)
  const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`])
  const body = (req) => new Promise((resolve) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 1e6) req.destroy() }); req.on('end', () => { try { resolve(JSON.parse(s || '{}')) } catch { resolve({}) } }) })
  const sendJson = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)) }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    // Local only: reject other hosts (DNS rebinding) and cross-site requests (another site posting a prompt).
    if (!origins.has(`http://${req.headers.host}`)) return sendJson(res, 403, { error: 'host' })
    if (req.method !== 'GET' && (!origins.has(req.headers.origin) || !/json|octet-stream/.test(req.headers['content-type'] ?? ''))) return sendJson(res, 403, { error: 'origin' })

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(fs.readFileSync(html))
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      if (!ctx) return sendJson(res, 200, { missing: missing(), mode: 'new', base: opts.newDir ?? opts.base, empty: isEmptyDir(opts.newDir ?? opts.base), name: path.basename(opts.newDir ?? opts.base), creating: !!creating })
      let routes = []
      try { routes = allRoutes(ctx, routeIndex()) } catch {}
      const withUrls = await Promise.all(appList.map(async (a) => ({ ...a, url: await devUrl(a.dir) })))
      return sendJson(res, 200, { project: ctx.pkg?.name ?? path.basename(ctx.repo), repo: ctx.repo, apps: withUrls, app: state.app, path: state.path, routes, messages: state.messages, running: !!run, permissionMode, playwright, missing: missing() })
    }
    if (req.method === 'POST' && url.pathname === '/api/create') {
      const b = await body(req)
      if (ctx || creating) return sendJson(res, 409, { error: 'exists' })
      const send = eventStream(res)
      creating = {}
      try {
        const target = await createApp(b.name?.trim() || 'app-moi', (text) => send({ t: 'log', text }))
        send({ t: 'log', text: 'Bật dev server…' })
        const dev = await startDev(state.app)
        send({ t: 'ready', target, url: dev.url })
      } catch (e) {
        send({ t: 'error', text: e.message })
      }
      creating = null
      return res.end()
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const name = path.basename(url.searchParams.get('name') ?? 'file').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(-80) || 'file'
      const chunks = []
      let size = 0, tooBig = false
      await new Promise((resolve) => {
        req.on('data', (d) => { size += d.length; if (size > 20e6) { tooBig = true; req.destroy() } else chunks.push(d) })
        req.on('end', resolve); req.on('close', resolve)
      })
      if (tooBig) return sendJson(res, 413, { error: 'File lớn hơn 20MB.' })
      const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '')
      const id = `${Date.now().toString(36)}-${slug(path.basename(name, path.extname(name))) || 'file'}${ext}`
      fs.mkdirSync(uploadsDir(), { recursive: true })
      fs.writeFileSync(path.join(uploadsDir(), id), Buffer.concat(chunks))
      return sendJson(res, 200, { id, name, type: mimeOf(name), size })
    }
    if (req.method === 'GET' && url.pathname === '/api/file') {
      const file = findUpload(url.searchParams.get('id'))
      if (!file) return sendJson(res, 404, { error: 'not found' })
      // served as a download for anything that could run script in this origin
      const type = mimeOf(file)
      res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", ...(/^image\/(png|jpeg|gif|webp)$|^application\/pdf$|^text\/plain$/.test(type) ? {} : { 'content-disposition': 'attachment' }) })
      return fs.createReadStream(file).pipe(res)
    }
    if (!ctx) return sendJson(res, 409, { error: 'no app yet' })
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const b = await body(req)
      if (!b.text?.trim() && b.files?.length) b.text = 'Xem file đính kèm.'
      if (!b.text?.trim()) return sendJson(res, 400, { error: 'empty' })
      if (run) return sendJson(res, 409, { error: 'busy' })
      if (b.app) state.app = b.app
      if (b.path) state.path = b.path
      const send = eventStream(res)
      let where = `[Aura Studio] The user is looking at ${state.path} of ${state.app === '.' ? 'the app' : state.app} in the preview${b.width ? ` at ${b.width}px wide` : ''}.`
      if (state.fresh && !state.messages.length) where += ` This app was just created from the aura starter (src/pages/Index.tsx is a placeholder). Build what the user describes with the aura-ui:build skill: take their description as the brief (ask only if it is truly ambiguous), set the tokens, then compose the screens and routes from the project's components and blocks. Use realistic Vietnamese sample data.`
      state.fresh = false
      if (!playwright) where += ` Playwright is not installed, so aura verify can't open pages: run it with --skip-inspect "Playwright chưa cài" (Studio shows the user a button to install it). Don't ask to install it yourself.`
      // attachments: move staged files (uploaded before the app existed) into the repo, so the agent can read them
      const attached = []
      for (const f of Array.isArray(b.files) ? b.files.slice(0, 10) : []) {
        const id = f?.id ?? f
        let file = findUpload(id)
        if (!file) continue
        if (!file.startsWith(uploadsDir())) { fs.mkdirSync(uploadsDir(), { recursive: true }); const to = path.join(uploadsDir(), id); try { fs.renameSync(file, to) } catch { fs.copyFileSync(file, to); fs.rmSync(file) } file = to }
        const name = typeof f?.name === 'string' ? path.basename(f.name).slice(-120) : id.replace(/^[a-z0-9]+-/, '')
        attached.push({ id, name, type: mimeOf(name), size: fs.statSync(file).size, rel: ctx.rel(file) })
      }
      await chat(b.text.trim(), where, send, attached)
      return res.end()
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      if (run) { run.aborted = true; killTree(run.child, 'SIGINT'); setTimeout(() => run && killTree(run.child, 'SIGKILL'), 3000) }
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      if (run) return sendJson(res, 409, { error: 'busy' })
      // keep the old conversation (and its Claude session id, for claude --resume) instead of dropping it
      if (state.messages.length) {
        const dir = path.join(ctx.auraDir, 'cache', 'studio-history')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ sessionId: state.sessionId, messages: state.messages }, null, 1))
      }
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
        const child = runProgram(bin, rest, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
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
    if (run) killTree(run.child, 'SIGINT')
    for (const d of Object.values(devs)) killTree(d.child)
    fs.rmSync(staging, { recursive: true, force: true })
    process.exit(0)
  }
  process.on('SIGINT', stopAll)
  process.on('SIGTERM', stopAll)

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const url = `http://localhost:${port}`
  console.log(ctx
    ? `Aura Studio: ${url}  (repo ${ctx.repo}; Claude Code permission mode: ${permissionMode}; Ctrl+C to stop)`
    : `Aura Studio: ${url}  (new app: describe it on the page; it is created in ${opts.newDir ?? opts.base}; Ctrl+C to stop)`)
  if (ctx && !appList.length) console.log('No package.json with a "dev" script found: the preview stays empty until one exists.')
  if (opts.open !== false) openBrowser(url)
  return server
}
