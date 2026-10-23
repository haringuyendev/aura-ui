#!/usr/bin/env node
/**
 * Aura UI audit: deterministic checks on a rendered page.
 *
 * Opens the page in Chromium across viewports (and optional UI states), takes full-page
 * screenshots, and runs DOM checks for the defects that make UI look AI-generated or
 * break usability: raw palette colors, gradients, emoji icons, low contrast, missing focus
 * rings, tiny targets, unlabeled controls, placeholder copy, and data-table rules
 * (numeric alignment, tabular figures, column count, empty cells).
 *
 * Usage:
 *   node audit.mjs <url> [--out ./aura-audit] [--viewports 390,768,1280,1440]
 *                        [--states ready,loading,empty,no-results,error] [--state-param state]
 *                        [--dark] [--wait 600]
 *
 * States are captured by appending ?<state-param>=<state> to the URL, so the page (or a
 * preview route) must render each state from that parameter.
 * Exit code: 1 when any HIGH finding exists, else 0.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"

const args = process.argv.slice(2)
const url = args.find((a) => !a.startsWith("--"))
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
if (!url) {
  console.error("Usage: node audit.mjs <url> [--out dir] [--viewports 390,1440] [--states ready,empty] [--dark]")
  process.exit(2)
}

const outDir = path.resolve(opt("out", "./aura-audit"))
const viewports = opt("viewports", "390,768,1280,1440").split(",").map(Number)
const states = opt("states", "").split(",").filter(Boolean)
const stateParam = opt("state-param", "state")
const waitMs = Number(opt("wait", "600"))
const themes = args.includes("--dark") ? ["light", "dark"] : ["light"]

// ---------------------------------------------------------------------------
// In-page checks. Runs in the browser; must be self-contained.
// ---------------------------------------------------------------------------
function pageChecks() {
  const findings = []
  const push = (severity, check, message, sample) => findings.push({ severity, check, message, sample: sample?.slice(0, 160) })
  const vw = window.innerWidth
  const isVisible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0
  }
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : ""
    return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}> "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40)}"`
  }

  // Color parsing via canvas handles any CSS color syntax (oklch, color-mix, hex…).
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  const toRGBA = (color) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = "#000"
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const luminance = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const blend = (top, bottom) => {
    const a = top[3]
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1)
  }
  const backgroundOf = (el) => {
    const layers = []
    for (let n = el; n; n = n.parentElement) {
      const c = toRGBA(getComputedStyle(n).backgroundColor)
      if (c[3] > 0) layers.push(c)
      if (c[3] >= 1) break
    }
    let bg = [255, 255, 255, 1]
    for (const layer of layers.reverse()) bg = blend(layer, bg)
    return bg
  }

  // 1. Horizontal overflow at page level (scroll containers are fine).
  const docW = document.documentElement.scrollWidth
  if (docW > vw + 1) push("high", "horizontal-overflow", `Page is ${docW}px wide at ${vw}px viewport.`)

  const all = [...document.body.querySelectorAll("*")].filter(isVisible)

  // 2. Raw palette / hard-coded colors in class names (token discipline).
  const rawColor = /(^|\s)(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|(^|\s)(?:[a-z-]+:)*(?:bg|text|border)-(?:white|black)\b|-\[#[0-9a-fA-F]{3,8}\]/
  // Modal scrims (fixed, full-viewport, translucent black) are an accepted exception.
  const isScrim = (el) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return s.position === "fixed" && r.width >= vw - 1 && /(^|\s)bg-black\/\d+/.test(el.className)
  }
  const rawHits = all.filter((el) => typeof el.className === "string" && rawColor.test(el.className) && !isScrim(el))
  if (rawHits.length) push("high", "raw-color-class", `${rawHits.length} elements use raw palette/hex color classes instead of semantic tokens.`, describe(rawHits[0]) + " " + rawHits[0].className.match(rawColor)?.[0])

  // 3. Decorative gradients.
  const gradients = all.filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width * r.height > 4000 && /gradient\(/.test(getComputedStyle(el).backgroundImage)
  })
  if (gradients.length) push("medium", "gradient", `${gradients.length} sizeable elements use gradient backgrounds. Justify or remove.`, describe(gradients[0]))

  // 4. Heavy shadows.
  const heavy = all.filter((el) => {
    const s = getComputedStyle(el).boxShadow
    if (!s || s === "none") return false
    return [...s.matchAll(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[3]) >= 24)
  })
  if (heavy.length > 2) push("medium", "heavy-shadow", `${heavy.length} elements have large blurred shadows (≥24px blur).`, describe(heavy[0]))

  // 5. Emoji used as icons in UI chrome.
  const emoji = /\p{Extended_Pictographic}/u
  const emojiHits = [...document.querySelectorAll("button, a, h1, h2, h3, h4, li, th, label, [role=tab], [role=menuitem]")]
    .filter(isVisible)
    .filter((el) => emoji.test(el.innerText || ""))
  if (emojiHits.length) push("high", "emoji-icon", `${emojiHits.length} controls/headings contain emoji. Use the icon set.`, describe(emojiHits[0]))

  // 6. Placeholder copy.
  const text = document.body.innerText
  const placeholder = text.match(/lorem ipsum|dolor sit amet|john doe|jane doe|acme(?: inc| corp)?|example@example\.com|user@example\.com|\bfoo\b|\bbar baz\b|placeholder text/i)
  if (placeholder) push("high", "placeholder-copy", `Placeholder copy found: "${placeholder[0]}". Use realistic domain data.`)

  // 7. Text contrast (WCAG AA) on sampled text nodes.
  const textEls = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1))
  let lowContrast = []
  for (const el of textEls.slice(0, 600)) {
    if (el.closest("[aria-hidden=true], [disabled], [aria-disabled=true]")) continue
    const s = getComputedStyle(el)
    const fg = toRGBA(s.color)
    const bg = backgroundOf(el)
    const fgBlended = blend(fg, bg)
    const L1 = luminance(fgBlended)
    const L2 = luminance(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const size = parseFloat(s.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)
    if (ratio < (large ? 3 : 4.5)) lowContrast.push({ el, ratio })
  }
  if (lowContrast.length) {
    const worst = lowContrast.sort((a, b) => a.ratio - b.ratio)[0]
    push(lowContrast.length > 3 ? "high" : "medium", "contrast", `${lowContrast.length} text elements below WCAG AA (worst ${worst.ratio.toFixed(2)}:1).`, describe(worst.el))
  }

  // 8. Tiny text.
  const tiny = textEls.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 11.5 && !el.closest("kbd, sup, sub"))
  if (tiny.length) push("medium", "tiny-text", `${tiny.length} text elements smaller than 12px.`, describe(tiny[0]))

  // 9. Controls without accessible names.
  // Visually-hidden native inputs behind custom checkboxes/selects are not user-facing controls.
  const controls = [...document.querySelectorAll("button, a[href], [role=button], input, select, textarea")]
    .filter(isVisible)
    .filter((el) => !el.closest("[aria-hidden=true]") && el.getAttribute("tabindex") !== "-1")
  const unnamed = controls.filter((el) => {
    if (el.matches("input[type=hidden]")) return false
    const name = (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || el.innerText || el.getAttribute("placeholder") || "").trim()
    const labelled = el.id && document.querySelector(`label[for="${el.id}"]`)
    return !name && !labelled && !el.closest("label")
  })
  if (unnamed.length) push("high", "unnamed-control", `${unnamed.length} interactive elements have no accessible name.`, describe(unnamed[0]))

  // 10. Touch targets (WCAG 2.2 AA: 24×24 minimum) on narrow viewports.
  if (vw < 768) {
    const small = controls.filter((el) => {
      const r = el.getBoundingClientRect()
      return (r.width < 24 || r.height < 24) && !el.closest("p, td span")
    })
    if (small.length) push("medium", "target-size", `${small.length} controls smaller than 24×24px on mobile.`, describe(small[0]))
  }

  // 11. Images without alt.
  const noAlt = [...document.querySelectorAll("img")].filter((img) => isVisible(img) && !img.hasAttribute("alt"))
  if (noAlt.length) push("medium", "img-alt", `${noAlt.length} images missing alt.`)

  // 12. Data tables.
  const numeric = /^[-+−]?\s*[\d.,\s]+\s*(₫|đ|vnd|%|\$|€|kg|ml|mg)?$|^[₫$€]\s*[\d.,\s]+$/i
  document.querySelectorAll("table").forEach((table, ti) => {
    if (!isVisible(table)) return
    const label = `table#${ti + 1}`
    const heads = [...table.querySelectorAll("thead th")].filter(isVisible)
    // Text a sighted user can see (screen-reader-only labels are clipped to ~1px).
    const visibleText = (el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let out = ""
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const r = n.parentElement.getBoundingClientRect()
        if (r.width > 2 && r.height > 2) out += n.textContent
      }
      return out.trim()
    }
    const dataHeads = heads.filter((th) => visibleText(th) && !th.querySelector("input[type=checkbox], [role=checkbox]"))
    if (dataHeads.length > 8) push("medium", "table-columns", `${label} shows ${dataHeads.length} data columns by default. Aim for 5–7; move the rest to a detail view or column picker.`)
    if (!heads.length) push("medium", "table-header", `${label} has no <thead> header cells.`)
    const collapsed = dataHeads.filter((th) => th.getBoundingClientRect().width < 56)
    if (collapsed.length) push("high", "table-column-collapsed", `${label}: ${collapsed.length} column(s) squeezed under 56px. Set a table min-width (sum of fixed columns + identity minimum) and scroll horizontally instead.`, describe(collapsed[0]))

    // Skip loading placeholders (aria-hidden skeleton rows) and screen-reader-only status rows.
    const rows = [...table.querySelectorAll("tbody tr")]
      .filter(isVisible)
      .filter((r) => !r.closest("[aria-hidden=true], [aria-busy=true]") && r.getBoundingClientRect().height >= 8)
      .slice(0, 30)
    const colCount = Math.max(0, ...rows.map((r) => r.children.length))
    for (let c = 0; c < colCount; c++) {
      const cells = rows.map((r) => r.children[c]).filter(Boolean).filter((td) => !td.colSpan || td.colSpan === 1)
      const values = cells.map((td) => td.innerText.trim()).filter((t) => t && t !== "—" && t !== "-")
      if (values.length < 3) continue
      const numericShare = values.filter((v) => numeric.test(v) && /\d/.test(v)).length / values.length
      if (numericShare < 0.8) continue
      const misaligned = cells.filter((td) => {
        const a = getComputedStyle(td).textAlign
        return a !== "right" && a !== "end" && td.innerText.trim()
      })
      if (misaligned.length) push("high", "table-numeric-align", `${label} column ${c + 1} is numeric but not right-aligned.`, describe(misaligned[0]))
      const proportional = cells.filter((td) => {
        const target = td.querySelector("*") && td.innerText.trim() ? [td, ...td.querySelectorAll("*")] : [td]
        return !target.some((n) => getComputedStyle(n).fontVariantNumeric.includes("tabular-nums"))
      })
      if (proportional.length) push("medium", "table-tabular-nums", `${label} column ${c + 1} is numeric without tabular-nums (digits won't line up).`, describe(proportional[0]))
      const th = heads[c]
      if (th && !["right", "end"].includes(getComputedStyle(th).textAlign) && !th.querySelector(".flex-row-reverse, [class*='justify-end']"))
        push("medium", "table-header-align", `${label} column ${c + 1} header should align with its right-aligned numbers.`, describe(th))
    }

    const emptyCells = rows.flatMap((r) => [...r.children]).filter((td) => !td.innerText.trim() && !td.querySelector("input, button, [role=checkbox], svg, img") && td.colSpan <= 1)
    if (emptyCells.length > 2) push("low", "table-empty-cell", `${label} has ${emptyCells.length} blank cells. Show "—" so "no value" is distinguishable from "not loaded".`)

    const heights = rows.map((r) => r.getBoundingClientRect().height)
    if (heights.length && Math.min(...heights) < 32) push("low", "table-row-height", `${label} has rows under 32px: hard to scan and click.`)
  })

  return findings
}

// ---------------------------------------------------------------------------
// Focus visibility: tab through the page and check each focused element.
// ---------------------------------------------------------------------------
async function focusCheck(page) {
  const missing = []
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab")
    const r = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0
      const ring = s.boxShadow && s.boxShadow !== "none"
      const underline = s.textDecorationLine.includes("underline")
      return { ok: outline || ring || underline, name: `<${el.tagName.toLowerCase()}> ${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30)}` }
    })
    if (r && !r.ok) missing.push(r.name)
  }
  return missing
}

// ---------------------------------------------------------------------------
async function main() {
  await mkdir(path.join(outDir, "screenshots"), { recursive: true })
  const browser = await chromium.launch()
  const runs = []
  const targets = states.length ? states : [null]

  for (const theme of themes) {
    for (const state of targets) {
      for (const width of viewports) {
        const target = new URL(url)
        if (state) target.searchParams.set(stateParam, state)
        if (theme === "dark") target.searchParams.set("theme", "dark")
        // Realistic device heights: phone 844, tablet 1024, desktop 900.
        const height = width < 600 ? 844 : width < 1000 ? 1024 : 900
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce" })
        const page = await context.newPage()
        const consoleErrors = []
        page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()))
        page.on("pageerror", (e) => consoleErrors.push(e.message))
        await page.goto(target.href, { waitUntil: "networkidle" })
        await page.waitForTimeout(waitMs)

        const name = [state ?? "page", theme === "dark" ? "dark" : null, width].filter(Boolean).join("-")
        const shot = `screenshots/${name}.png`
        await page.screenshot({ path: path.join(outDir, shot), fullPage: true })

        const findings = await page.evaluate(pageChecks)
        if (width >= 1024 && (!state || state === "ready")) {
          const missing = await focusCheck(page)
          if (missing.length) findings.push({ severity: "high", check: "focus-visible", message: `${missing.length} focusable elements show no visible focus indicator.`, sample: missing[0] })
        }
        consoleErrors.forEach((e) => findings.push({ severity: "medium", check: "console-error", message: e.slice(0, 200) }))
        runs.push({ name, state, theme, width, screenshot: shot, findings })
        await context.close()
      }
    }
  }
  await browser.close()

  // Aggregate identical findings across runs.
  const agg = new Map()
  for (const run of runs)
    for (const f of run.findings) {
      const key = `${f.severity}|${f.check}|${f.message}`
      if (!agg.has(key)) agg.set(key, { ...f, seenAt: [] })
      agg.get(key).seenAt.push(run.name)
    }
  const order = { high: 0, medium: 1, low: 2 }
  const findings = [...agg.values()].sort((a, b) => order[a.severity] - order[b.severity])
  const tally = { high: 0, medium: 0, low: 0 }
  findings.forEach((f) => tally[f.severity]++)

  const md = [
    `# Aura UI audit: ${url}`,
    "",
    `Viewports: ${viewports.join(" / ")}px${states.length ? ` · States: ${states.join(", ")}` : ""}${themes.length > 1 ? " · Light + dark" : ""}`,
    "",
    `**${tally.high} high · ${tally.medium} medium · ${tally.low} low**. Deterministic checks only; pair with the ui-critic review for hierarchy and taste.`,
    "",
    ...["high", "medium", "low"].flatMap((sev) => {
      const group = findings.filter((f) => f.severity === sev)
      if (!group.length) return []
      return [`## ${sev.toUpperCase()}`, ...group.map((f) => `- **${f.check}**: ${f.message}${f.sample ? `\n  ↳ e.g. \`${f.sample}\`` : ""}\n  ↳ seen at: ${f.seenAt.join(", ")}`), ""]
    }),
    "## Screenshots",
    ...runs.map((r) => `- ${r.name}: \`${r.screenshot}\``),
    "",
  ].join("\n")

  await writeFile(path.join(outDir, "report.md"), md)
  await writeFile(path.join(outDir, "report.json"), JSON.stringify({ url, tally, findings, runs: runs.map(({ findings, ...r }) => r) }, null, 2))
  console.log(md)
  process.exit(tally.high > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
