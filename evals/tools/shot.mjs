// Usage: node shot.mjs <url> <out-dir>  -> <out-dir>/390.png, 768.png, 1440.png; prints console errors and page width
import { createRequire } from 'module'
const require = createRequire(new URL('./package.json', import.meta.url))
const { chromium } = require('playwright')
const [url, out] = process.argv.slice(2)
const fs = await import('fs'); fs.mkdirSync(out, { recursive: true })
const b = await chromium.launch()
for (const w of [390, 768, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: w < 600 ? 844 : 900 } })
  const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(String(e)))
  await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(500)
  const sw = await p.evaluate(() => document.documentElement.scrollWidth)
  await p.screenshot({ path: `${out}/${w}.png`, fullPage: true })
  console.log(`${w}px: scrollWidth=${sw}${sw > w ? ' (HORIZONTAL OVERFLOW)' : ''}; console errors: ${errs.length ? errs.join(' | ') : 'none'}`)
  await p.close()
}
await b.close()
