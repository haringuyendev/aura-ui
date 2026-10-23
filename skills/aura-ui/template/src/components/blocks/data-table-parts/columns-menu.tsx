import type { Table } from "@tanstack/react-table"
import { Columns3Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { columnLabel } from "./csv"

/** "Cột" menu: show or hide columns. Columns with meta.hideable === false (the identity column) stay. */
export function ColumnsMenu<TData>({ table }: { table: Table<TData> }) {
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.columnDef.meta?.hideable !== false)
  if (!columns.length) return null
  const hidden = columns.filter((c) => !c.getIsVisible()).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Columns3Icon />
            Cột{hidden > 0 && <span className="text-muted-foreground tabular-nums">({hidden} ẩn)</span>}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Hiển thị cột</DropdownMenuLabel>
          {columns.map((c) => (
            <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(Boolean(v))} closeOnClick={false}>
              {columnLabel(c)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {hidden > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => columns.forEach((c) => c.toggleVisibility(true))}>Hiện tất cả</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
