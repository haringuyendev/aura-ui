// Primitives the project lacks and how to add them, so agents propose an addition to the user instead of hand-rolling one.
import fs from 'node:fs'
import path from 'node:path'

// Items of the shadcn registry (aura catalog names that install as-is).
export const SHADCN = new Set(['accordion', 'alert', 'alert-dialog', 'aspect-ratio', 'avatar', 'badge', 'breadcrumb', 'button', 'button-group', 'calendar', 'card', 'carousel', 'chart', 'checkbox', 'collapsible', 'combobox', 'command', 'context-menu', 'dialog', 'drawer', 'dropdown-menu', 'empty', 'field', 'form', 'hover-card', 'input', 'input-group', 'input-otp', 'item', 'kbd', 'label', 'menubar', 'native-select', 'navigation-menu', 'pagination', 'popover', 'progress', 'radio-group', 'resizable', 'scroll-area', 'select', 'separator', 'sheet', 'sidebar', 'skeleton', 'slider', 'sonner', 'spinner', 'switch', 'table', 'tabs', 'textarea', 'toggle', 'toggle-group', 'tooltip'])
// Catalog entries that are compositions of registry items.
export const COMPOSED = { 'date-picker': ['calendar', 'popover'], 'date-range-picker': ['calendar', 'popover'], 'data-table': ['table'], toast: ['sonner'] }

/** Registry items needed for a catalog entry, or null when shadcn can't install it. */
export const installNames = (name) => COMPOSED[name] ?? (SHADCN.has(name) ? [name] : null)

const pascal = (n) => n.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')
/** The project already has it: a primitive/library component with that name or export. */
export const hasComponent = (components, name) => components.some((c) => c.name.toLowerCase() === name || c.exports?.includes(pascal(name)))

/** Folder holding shadcn's components.json: from the primitives folder up to the repo root. */
export function shadcnDir(ctx) {
  for (let dir = ctx.uiDir ?? ctx.repo; dir.startsWith(ctx.repo); dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'components.json'))) return dir
    if (dir === ctx.repo) break
  }
  return null
}

export function packageManager(ctx) {
  const pm = ctx.pkg?.packageManager?.split('@')[0]
  if (pm) return pm
  for (const [file, name] of [['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm']]) if (fs.existsSync(path.join(ctx.repo, file))) return name
  return 'npm'
}

/** { dir, argv, text } to add registry items with the project's package manager, or null when the project has no shadcn setup. */
export function addCommand(ctx, names) {
  const dir = shadcnDir(ctx)
  if (!dir) return null
  const runner = { bun: ['bunx', '--bun'], pnpm: ['pnpm', 'dlx'], yarn: ['yarn', 'dlx'] }[packageManager(ctx)] ?? ['npx']
  const argv = [...runner, 'shadcn@latest', 'add', ...names, '--yes']
  return { dir, argv, text: `${argv.join(' ')}${dir === ctx.repo ? '' : `  (in ${ctx.rel(dir)})`}` }
}

/** Bash commands that add primitives: aura add, shadcn add. Returns the names, or null. */
export function addsPrimitives(command = '') {
  const m = command.match(/(?:\baura(?:\.mjs)?["']?\s+add|\bshadcn(?:@[\w.-]+)?\s+add)\s+([^;&|]*)/)
  return m ? m[1].split(/\s+/).filter((a) => a && !a.startsWith('-')) : null
}
