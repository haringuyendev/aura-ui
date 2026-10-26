// Running other programs the same way on macOS, Linux and Windows.
// On Windows npm/npx/pnpm/yarn/bunx are .cmd shims: Node can't spawn those without a shell (EINVAL/ENOENT), so they go
// through cmd with quoted arguments. Programs are looked up on PATH (with PATHEXT) plus a few install folders that an
// app started from the Dock/Start menu (Claude Desktop) doesn't have on its PATH.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

export const isWindows = process.platform === 'win32'
const home = os.homedir()

/** Folders where Node, package managers and the claude CLI are installed when they aren't on PATH. */
export function extraBinDirs() {
  const dirs = [path.dirname(process.execPath), path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), path.join(home, '.volta', 'bin'), path.join(home, '.bun', 'bin')]
  if (isWindows) {
    const { APPDATA = '', LOCALAPPDATA = '', ProgramFiles = 'C:\\Program Files' } = process.env
    dirs.push(path.join(ProgramFiles, 'nodejs'), path.join(APPDATA, 'npm'), path.join(LOCALAPPDATA, 'Volta', 'bin'), path.join(home, 'scoop', 'shims'), path.join(LOCALAPPDATA, 'pnpm'))
  } else {
    dirs.push('/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.asdf', 'shims'), path.join(home, '.local', 'share', 'mise', 'shims'), path.join(home, 'Library', 'pnpm'), path.join(home, '.local', 'share', 'pnpm'))
  }
  return dirs
}

/** Full path of a program (PATH first, then the extra folders), or null. */
export function which(name) {
  const exts = isWindows ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').map((e) => e.toLowerCase()) : ['']
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean), ...extraBinDirs()]
  for (const dir of dirs)
    for (const ext of isWindows && !path.extname(name) ? exts : ['']) {
      const file = path.join(dir, name + ext)
      try { if (fs.statSync(file).isFile()) return file } catch {}
    }
  return null
}

const quote = (a) => /^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`

/** spawn(name, args) that works for .cmd shims on Windows and for programs off PATH. Same options as child_process.spawn. */
export function run(name, args = [], opts = {}) {
  const bin = which(name) ?? name
  // the child gets the folder too, so `npm run dev` finds node when Studio was started off PATH
  const env = { ...process.env, ...opts.env }
  const dir = path.isAbsolute(bin) ? path.dirname(bin) : null
  if (dir && !(env.PATH ?? '').split(path.delimiter).includes(dir)) env.PATH = `${dir}${path.delimiter}${env.PATH ?? ''}`
  if (isWindows && /\.(cmd|bat)$/i.test(bin)) return spawn([quote(bin), ...args.map(quote)].join(' '), { ...opts, env, shell: true })
  return spawn(bin, args, { ...opts, env })
}

/** spawnSync counterpart of run(). */
export function runSync(name, args = [], opts = {}) {
  const bin = which(name) ?? name
  const env = { ...process.env, ...opts.env }
  const dir = path.isAbsolute(bin) ? path.dirname(bin) : null
  if (dir && !(env.PATH ?? '').split(path.delimiter).includes(dir)) env.PATH = `${dir}${path.delimiter}${env.PATH ?? ''}`
  if (isWindows && /\.(cmd|bat)$/i.test(bin)) return spawnSync([quote(bin), ...args.map(quote)].join(' '), { ...opts, env, shell: true })
  return spawnSync(bin, args, { ...opts, env })
}

/** The command line of a program's version (first line), or null when it is missing or fails. */
export function version(name, args = ['--version']) {
  if (!which(name)) return null
  const r = runSync(name, args, { encoding: 'utf8', timeout: 15000 })
  return r.status === 0 ? String(r.stdout || r.stderr).trim().split('\n')[0] : null
}

/** Stop a child and what it started: on Windows a .cmd child is cmd.exe running node, so kill the whole tree. */
export function killTree(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return
  if (isWindows && child.pid) { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); return }
  child.kill(signal)
}
