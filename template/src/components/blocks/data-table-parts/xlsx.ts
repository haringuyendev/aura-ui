// Minimal .xlsx writer (SpreadsheetML + fflate zip): bold frozen header, autofilter, column widths,
// real numbers and dates with number formats. Loaded on demand by the export menu.
import { strToU8, zipSync } from "fflate"

export type XlsxColumn = { header: string; format?: string }
export type XlsxCell = string | number | boolean | Date | null | undefined

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
const REL_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const colName = (i: number) => {
  let s = ""
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Excel serial date from local date parts (1900 date system). */
const serial = (d: Date) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - Date.UTC(1899, 11, 30)) / 86400000

function defaultFormat(v: XlsxCell) {
  if (v instanceof Date) return v.getHours() || v.getMinutes() ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy"
  if (typeof v === "number") return Number.isInteger(v) ? "#,##0" : "#,##0.##"
  return undefined
}

export function buildXlsx(columns: XlsxColumn[], rows: XlsxCell[][], sheetName = "Dữ liệu"): Uint8Array {
  // number formats → style ids (0 = default, 1 = bold header, 2+ = one per format)
  const formats: string[] = []
  const styleOf = (fmt?: string) => {
    if (!fmt) return 0
    let i = formats.indexOf(fmt)
    if (i < 0) i = formats.push(fmt) - 1
    return 2 + i
  }

  const width = columns.map((c) => c.header.length)
  const cell = (ref: string, v: XlsxCell, col: number, header = false) => {
    if (v === null || v === undefined || v === "") return ""
    if (header || typeof v === "string") {
      const s = String(v)
      width[col] = Math.max(width[col], Math.min(60, s.length))
      return `<c r="${ref}"${header ? ' s="1"' : ""} t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`
    }
    if (typeof v === "boolean") return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
    const fmt = columns[col].format ?? defaultFormat(v)
    const num = v instanceof Date ? serial(v) : v
    if (!Number.isFinite(num)) return ""
    // Excel shows "########" when a number or date doesn't fit, so size from the rendered length.
    const shown = v instanceof Date ? (fmt ?? "dd/mm/yyyy").replace(/["\\]/g, "").length : String(Math.round(num)).length + Math.ceil(String(Math.round(num)).length / 3) + (fmt?.includes("₫") ? 2 : 0)
    width[col] = Math.max(width[col], shown + 1)
    return `<c r="${ref}" s="${styleOf(fmt)}"><v>${num}</v></c>`
  }

  const headerRow = `<row r="1">${columns.map((c, i) => cell(`${colName(i)}1`, c.header, i, true)).join("")}</row>`
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(`${colName(ci)}${ri + 2}`, v, ci)).join("")}</row>`).join("")
  const last = `${colName(Math.max(0, columns.length - 1))}${rows.length + 1}`
  const name = sheetName.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet1"

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${NS} ${REL_NS}>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${width.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(62, w + 2)}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${headerRow}${body}</sheetData>` +
    `<autoFilter ref="A1:${last}"/></worksheet>`

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${NS}>` +
    (formats.length ? `<numFmts count="${formats.length}">${formats.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("")}</numFmts>` : "") +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${2 + formats.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    formats.map((_, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("") +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

  const files: Record<string, string> = {
    "[Content_Types].xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${NS} ${REL_NS}><sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/></sheets>` +
      `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(name.replace(/'/g, "''"))}'!$A$1:$${last.replace(/(\d+)$/, "$$$1")}</definedName></definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheet,
    "xl/styles.xml": styles,
  }
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 })
}

export function downloadXlsx(fileName: string, columns: XlsxColumn[], rows: XlsxCell[][], sheetName?: string) {
  const data = buildXlsx(columns, rows, sheetName)
  const blob = new Blob([data as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
