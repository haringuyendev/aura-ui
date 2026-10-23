// Project context: paths, package.json stack, tsconfig aliases, where components live.
import fs from 'node:fs'
import path from 'node:path'

export const IGNORE = /(^|\/)(node_modules|\.next|dist|build|out|coverage|\.git|\.turbo|\.vercel|public|playwright-report|test-results|\.pnpm-store|\.aura|storybook-static)(\/|$)/
export const SOURCE_EXT = ['.tsx', '.ts', '.jsx', '.js']
export const SECTION_DIR = /\/(blocks|heros|sections|features)\//

export const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }

/** JSON with comments and trailing commas (tsconfig), stripping comments outside strings only. */
export function stripJsonComments(src) {
  let out = '', inStr = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1]
    if (inStr) { out += c; if (c === '\\') out += src[++i] ?? ''; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue }
    out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}
export const readJson = (p) => { try { return JSON.parse(stripJsonComments(read(p))) } catch { return null } }

const UI_LIBS = {
  'shadcn (radix)': (d, repo) => fs.existsSync(path.join(repo, 'components.json')) && Object.keys(d).some((k) => k.startsWith('@radix-ui')),
  'shadcn (base-ui)': (d, repo) => fs.existsSync(path.join(repo, 'components.json')) && d['@base-ui/react'],
  radix: (d) => Object.keys(d).some((k) => k.startsWith('@radix-ui')),
  'base-ui': (d) => d['@base-ui/react'],
  mui: (d) => d['@mui/material'],
  antd: (d) => d.antd,
  chakra: (d) => Object.keys(d).some((k) => k.startsWith('@chakra-ui')),
  mantine: (d) => Object.keys(d).some((k) => k.startsWith('@mantine')),
  headlessui: (d) => Object.keys(d).some((k) => k.startsWith('@headlessui')),
}
/** Import prefixes of UI libraries; importing one the project doesn't use is a "second UI library". */
export const UI_LIB_IMPORTS = {
  '@mui/': 'mui', antd: 'antd', '@chakra-ui/': 'chakra', '@mantine/': 'mantine', '@headlessui/': 'headlessui',
  '@radix-ui/': 'radix', '@base-ui/react': 'base-ui', 'react-bootstrap': 'react-bootstrap', 'semantic-ui-react': 'semantic-ui', 'primereact': 'primereact',
}

export function createContext(repoArg = '.') {
  const repo = path.resolve(repoArg)
  const rel = (p) => path.relative(repo, p).split(path.sep).join('/')
  const pkg = readJson(path.join(repo, 'package.json')) ?? {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const has = (n) => Object.keys(deps).some((d) => d === n || d.startsWith(n))
  const pick = (map) => Object.entries(map).filter(([, t]) => t()).map(([k]) => k)
  const srcRoot = fs.existsSync(path.join(repo, 'src')) ? path.join(repo, 'src') : repo

  const stack = {
    framework: pick({ next: () => deps.next, vite: () => deps.vite, remix: () => has('@remix-run'), astro: () => deps.astro, 'react-native': () => deps['react-native'] }),
    react: deps.react ?? null,
    styling: pick({ [`tailwind ${deps.tailwindcss ?? ''}`.trim()]: () => deps.tailwindcss, 'styled-components': () => deps['styled-components'], emotion: () => has('@emotion'), sass: () => deps.sass }),
    ui: Object.entries(UI_LIBS).filter(([, t]) => t(deps, repo)).map(([k]) => k),
    icons: pick({ lucide: () => deps['lucide-react'], heroicons: () => has('@heroicons'), 'react-icons': () => deps['react-icons'], tabler: () => has('@tabler/icons') }),
    forms: pick({ 'react-hook-form': () => deps['react-hook-form'], formik: () => deps.formik, zod: () => deps.zod, yup: () => deps.yup }),
    data: pick({ 'tanstack-table': () => deps['@tanstack/react-table'], 'tanstack-query': () => deps['@tanstack/react-query'], swr: () => deps.swr, recharts: () => deps.recharts, 'chart.js': () => deps['chart.js'], echarts: () => has('echarts') }),
    dates: pick({ 'date-fns': () => deps['date-fns'], dayjs: () => deps.dayjs, moment: () => deps.moment, luxon: () => deps.luxon }),
    motion: pick({ 'framer-motion': () => deps['framer-motion'], motion: () => deps.motion }),
    cms: pick({ payload: () => deps.payload, sanity: () => has('sanity') || has('@sanity'), strapi: () => has('@strapi'), contentful: () => deps.contentful }),
    i18n: pick({ 'next-intl': () => deps['next-intl'], 'react-i18next': () => deps['react-i18next'], lingui: () => has('@lingui') }),
  }
  const usedUiLibs = new Set(Object.values(UI_LIB_IMPORTS).filter((lib) => Object.keys(deps).some((d) => Object.entries(UI_LIB_IMPORTS).some(([prefix, l]) => l === lib && (d === prefix || d.startsWith(prefix))))))

  const shadcn = readJson(path.join(repo, 'components.json'))
  const tsconfig = readJson(path.join(repo, 'tsconfig.json')) ?? readJson(path.join(repo, 'jsconfig.json')) ?? {}
  const paths = tsconfig.compilerOptions?.paths ?? {}
  const baseUrl = path.join(repo, tsconfig.compilerOptions?.baseUrl ?? '.')
  const aliases = Object.entries(paths).map(([k, [target]]) => ({ prefix: k.replace(/\*$/, ''), dir: path.resolve(baseUrl, String(target).replace(/\*$/, '')) }))

  /** Resolve an import specifier to an absolute file path (alias or relative), or null for packages. */
  function resolveImport(spec, fromFile) {
    let base = null
    if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
    else for (const a of aliases) if (a.prefix && spec.startsWith(a.prefix)) { base = path.join(a.dir, spec.slice(a.prefix.length)); break }
    if (!base) return null
    for (const cand of [base, ...SOURCE_EXT.map((e) => base + e), ...SOURCE_EXT.map((e) => path.join(base, 'index' + e))])
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand
    return null
  }
  /** Import path other files should use for a component file (alias form when possible). */
  function importPathFor(file) {
    for (const a of aliases)
      if (a.prefix && file.startsWith(a.dir + path.sep)) return a.prefix + path.relative(a.dir, file).split(path.sep).join('/').replace(/\.(tsx|jsx|ts|js)$/, '').replace(/\/(index|Component)$/, '')
    return './' + rel(file).replace(/\.(tsx|jsx|ts|js)$/, '')
  }

  const uiAlias = shadcn?.aliases?.ui ?? (shadcn?.aliases?.components ? `${shadcn.aliases.components}/ui` : null)
  const aliasDir = uiAlias && (() => { for (const a of aliases) if (a.prefix && uiAlias.startsWith(a.prefix)) return path.join(a.dir, uiAlias.slice(a.prefix.length)); return null })()
  const uiDir = [aliasDir, path.join(srcRoot, 'components', 'ui'), path.join(repo, 'components', 'ui')].find((d) => d && fs.existsSync(d)) ?? null

  function walk(dir, exts, acc = []) {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (IGNORE.test(rel(p))) continue
      if (e.isDirectory()) walk(p, exts, acc)
      else if (exts.some((x) => e.name.endsWith(x)) && !/\.(test|spec|stories)\.[jt]sx?$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(p)
    }
    return acc
  }

  /** A file the registry tracks: a .tsx/.jsx under components/, ui/, blocks/, heros/, sections/, features/. */
  const isComponentPath = (abs) => /\.(tsx|jsx)$/.test(abs) && !/\.(test|spec|stories)\./.test(abs) && (/\/components?\//.test('/' + rel(abs)) || SECTION_DIR.test('/' + rel(abs)) || (uiDir && abs.startsWith(uiDir + path.sep)))
  const isTokenPath = (abs) => /\.css$/.test(abs) || /tailwind\.config\.[cm]?[jt]s$/.test(abs)

  return { repo, rel, pkg, deps, stack, usedUiLibs, shadcn, aliases, resolveImport, importPathFor, uiDir, srcRoot, walk, isComponentPath, isTokenPath, auraDir: path.join(repo, '.aura') }
}
