import * as React from "react"
import * as XLSX from "xlsx"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNumber } from "@/lib/format"

const MAX_ROWS = 1000
const MAX_COLS = 50

/** Excel / CSV / ODS rendered as a grid with sheet tabs (SheetJS). Shows formatted cell text; formulas show their cached values. */
export default function SheetViewer({ data }: { data: ArrayBuffer }) {
  const workbook = React.useMemo(() => {
    try {
      return XLSX.read(data, { type: "array", cellDates: true, dense: true })
    } catch {
      return null
    }
  }, [data])
  const [sheet, setSheet] = React.useState(() => workbook?.SheetNames[0] ?? "")

  const grid = React.useMemo(() => {
    if (!workbook || !sheet) return null
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheet], { header: 1, raw: false, defval: "", blankrows: false })
    const cols = Math.min(MAX_COLS, rows.reduce((m, r) => Math.max(m, r.length), 0))
    return { rows: rows.slice(0, MAX_ROWS), total: rows.length, cols, totalCols: rows.reduce((m, r) => Math.max(m, r.length), 0) }
  }, [workbook, sheet])

  if (!workbook) return <p className="p-6 text-center text-sm text-destructive">Không đọc được bảng tính này. Hãy tải về để xem.</p>

  return (
    <div className="flex h-full flex-col bg-background">
      {workbook.SheetNames.length > 1 && (
        <Tabs value={sheet} onValueChange={(v) => setSheet(String(v))} className="max-w-full shrink-0 overflow-x-auto border-b px-3 py-2">
          <TabsList className="w-max">
            {workbook.SheetNames.map((n) => (
              <TabsTrigger key={n} value={n}>
                {n}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {grid && grid.rows.length > 0 ? (
          <Table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 w-12 border-r bg-muted text-center" aria-label="Dòng" />
                {Array.from({ length: grid.cols }, (_, c) => (
                  <TableHead key={c} className="min-w-24 border-r text-center font-medium">
                    {XLSX.utils.encode_col(c)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grid.rows.map((row, r) => (
                <TableRow key={r}>
                  <TableCell className="sticky left-0 border-r bg-muted text-center text-muted-foreground tabular-nums">{r + 1}</TableCell>
                  {Array.from({ length: grid.cols }, (_, c) => (
                    <TableCell key={c} className="max-w-80 truncate border-r tabular-nums" title={row[c] ?? ""}>
                      {row[c] ?? ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">Trang tính trống.</p>
        )}
      </div>
      {grid && (grid.total > MAX_ROWS || grid.totalCols > MAX_COLS) && (
        <p className="shrink-0 border-t px-3 py-2 text-xs text-muted-foreground">
          Đang hiển thị {formatNumber(Math.min(grid.total, MAX_ROWS))}/{formatNumber(grid.total)} dòng và {grid.cols}/{grid.totalCols} cột đầu. Tải về để xem đầy đủ.
        </p>
      )}
    </div>
  )
}
