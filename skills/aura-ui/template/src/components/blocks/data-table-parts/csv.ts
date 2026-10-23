import type { Column, Row } from "@tanstack/react-table"

/** Human label of a column: meta.label, a string header, or the id. */
export function columnLabel<TData>(c: Column<TData, unknown>) {
  const h = c.columnDef.header
  return c.columnDef.meta?.label ?? (typeof h === "string" ? h : c.id)
}

const escape = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Download rows as UTF-8 CSV (with BOM so Excel shows Vietnamese correctly). Uses meta.exportValue when given. */
export function downloadCsv<TData>(fileName: string, columns: Column<TData, unknown>[], rows: Row<TData>[]) {
  const header = columns.map((c) => escape(columnLabel(c)))
  const body = rows.map((r) =>
    columns.map((c) => escape(c.columnDef.meta?.exportValue ? c.columnDef.meta.exportValue(r.original) : r.getValue(c.id))).join(",")
  )
  const blob = new Blob(["﻿" + [header.join(","), ...body].join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
