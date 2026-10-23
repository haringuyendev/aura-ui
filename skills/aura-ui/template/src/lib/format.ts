// Locale-aware formatting. Every number, amount, date and duration shown in the UI goes through here.
// Change LOCALE / CURRENCY for a non-Vietnamese app.

export const LOCALE = "vi-VN"
export const CURRENCY = "₫"
const MINUS = "−"

const nf = (opts: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(LOCALE, opts)

/** 1234.5 → "1.234,5" */
export function formatNumber(value: number, maximumFractionDigits = 1) {
  return nf({ maximumFractionDigits }).format(value)
}

/** 1250 → "1,3 N", 12_400_000 → "12,4 tr", 1_200_000_000 → "1,2 tỷ" */
export function formatCompact(value: number) {
  const abs = Math.abs(value)
  const [div, unit] =
    abs >= 1e9 ? [1e9, " tỷ"] : abs >= 1e6 ? [1e6, " tr"] : abs >= 1e4 ? [1e3, " N"] : [1, ""]
  return formatNumber(value / div, div === 1 ? 0 : 1) + unit
}

/**
 * Money. Full: 1250000 → "1.250.000 ₫". Compact (dashboards, KPIs): "1,3 tr ₫", "1,2 tỷ ₫";
 * amounts under 1 million stay full in compact mode ("850.000 ₫").
 */
export function formatMoney(value: number, { compact = false } = {}) {
  if (compact && Math.abs(value) >= 1e6) return `${formatCompact(value)} ${CURRENCY}`
  return `${nf({ maximumFractionDigits: 0 }).format(value)} ${CURRENCY}`
}

/** Percent from a percent value: 7.25 → "7,3%". Use formatPercent(ratio * 100) for ratios. */
export function formatPercent(value: number, digits = 1) {
  return `${nf({ maximumFractionDigits: digits }).format(value)}%`
}

/** Signed change: 12.5 → "+12,5", -3 → "−3", with an optional unit ("%", " điểm", " phút"). */
export function formatSigned(value: number, unit = "", digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? MINUS : ""
  return `${sign}${nf({ maximumFractionDigits: digits }).format(Math.abs(value))}${unit}`
}

/** Change of a percentage, in percentage points: 1.3 → "+1,3 điểm". */
export function formatPoints(value: number, digits = 1) {
  return formatSigned(value, " điểm", digits)
}

const asDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d))

/** "23/10/2026" */
export function formatDate(d: Date | string | number) {
  return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" }).format(asDate(d))
}

/** "23/10" */
export function formatDayMonth(d: Date | string | number) {
  return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit" }).format(asDate(d))
}

/** "10:30" */
export function formatTime(d: Date | string | number) {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false }).format(asDate(d))
}

/** "10:30, 23/10/2026" */
export function formatDateTime(d: Date | string | number) {
  return `${formatTime(d)}, ${formatDate(d)}`
}

/** Duration in words from seconds: 125 → "2 phút 5 giây", 5700 → "1 giờ 35 phút", 2 days → "2 ngày 3 giờ". */
export function formatDuration(totalSeconds: number) {
  const s = Math.round(Math.abs(totalSeconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = d ? [[d, "ngày"], [h, "giờ"]] : h ? [[h, "giờ"], [m, "phút"]] : m ? [[m, "phút"], [sec, "giây"]] : [[sec, "giây"]]
  return parts.filter(([n], i) => i === 0 || n).map(([n, u]) => `${n} ${u}`).join(" ")
}

/** "vừa xong", "5 phút trước", "3 giờ trước", "hôm qua", then the date. */
export function formatRelative(d: Date | string | number, now: Date = new Date()) {
  const diff = (now.getTime() - asDate(d).getTime()) / 1000
  if (diff < 60) return "vừa xong"
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400 && asDate(d).getDate() === now.getDate()) return `${Math.floor(diff / 3600)} giờ trước`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (asDate(d).toDateString() === yesterday.toDateString()) return "hôm qua"
  return formatDate(d)
}
