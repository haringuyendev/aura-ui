import type { Column, Row } from "@tanstack/react-table"
import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/toast"
import { formatNumber } from "@/lib/format"
import { cellValue, columnLabel, downloadCsv } from "./csv"

/** "Xuất" menu: Excel (.xlsx, formatted) or CSV. The xlsx writer is loaded only when used. */
export function ExportMenu<TData>({ fileName, columns, getRows, disabled }: { fileName: string; columns: Column<TData, unknown>[]; getRows: () => Row<TData>[]; disabled?: boolean }) {
  const toXlsx = async () => {
    const rows = getRows()
    const { downloadXlsx } = await import("./xlsx")
    downloadXlsx(
      fileName,
      columns.map((c) => ({ header: columnLabel(c), format: c.columnDef.meta?.excelFormat })),
      rows.map((r) => columns.map((c) => cellValue(c, r)))
    )
    toast.add({ title: `Đã xuất ${formatNumber(rows.length)} dòng ra Excel` })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled}>
            <DownloadIcon /> Xuất
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={toXlsx}>Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadCsv(fileName, columns, getRows())}>CSV (.csv)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
