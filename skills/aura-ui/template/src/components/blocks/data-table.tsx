import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatNumber } from "@/lib/format"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Numbers, money and dates align right (header too). */
    align?: "left" | "right" | "center"
    /** Fixed width, e.g. "w-32"; leave the main identity column flexible. */
    className?: string
  }
}

type DataTableProps<TData> = {
  columns: ColumnDef<TData, any>[]
  data: TData[]
  /** Show a search box that filters across all columns. */
  searchPlaceholder?: string
  /** Rows per page; 0 shows everything. */
  pageSize?: number
  initialSorting?: SortingState
  onRowClick?: (row: TData) => void
  getRowId?: (row: TData, index: number) => string
  /** Filters, tabs or actions shown next to the search box. */
  toolbar?: React.ReactNode
  /** What to show when there is no data at all (no search applied). */
  empty?: React.ReactNode
  /** Below md, render each row as a card instead of the table (recommended for 4+ columns). */
  renderMobileRow?: (row: TData) => React.ReactNode
  className?: string
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" }

/** Sortable, searchable, paginated table on TanStack Table, with an optional mobile card layout. */
function DataTable<TData>({
  columns,
  data,
  searchPlaceholder,
  pageSize = 20,
  initialSorting = [],
  onRowClick,
  getRowId,
  toolbar,
  empty,
  renderMobileRow,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [globalFilter, setGlobalFilter] = React.useState("")

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pageSize > 0 && { getPaginationRowModel: getPaginationRowModel() }),
    initialState: { pagination: { pageSize: pageSize || data.length || 1 } },
  })

  const rows = table.getRowModel().rows
  const filteredCount = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize: size } = table.getState().pagination
  const clickable = Boolean(onRowClick)

  const rowProps = (row: Row<TData>) =>
    clickable
      ? {
          tabIndex: 0,
          role: "button" as const,
          onClick: () => onRowClick!(row.original),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onRowClick!(row.original)
            }
          },
          className: "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        }
      : {}

  const noResults = filteredCount === 0

  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-3", className)}>
      {(searchPlaceholder || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {searchPlaceholder && (
            <InputGroup className="sm:max-w-xs">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => {
                  setGlobalFilter(e.target.value)
                  table.setPageIndex(0)
                }}
              />
            </InputGroup>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {noResults ? (
        globalFilter || !empty ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{globalFilter ? `Không tìm thấy kết quả cho “${globalFilter}”` : "Chưa có dữ liệu"}</EmptyTitle>
              {globalFilter && <EmptyDescription>Thử từ khoá khác hoặc xoá bộ lọc.</EmptyDescription>}
            </EmptyHeader>
            {globalFilter && (
              <Button variant="outline" size="sm" onClick={() => setGlobalFilter("")}>
                Xoá tìm kiếm
              </Button>
            )}
          </Empty>
        ) : (
          empty
        )
      ) : (
        <>
          {renderMobileRow && (
            <ul className="flex flex-col divide-y rounded-lg border md:hidden">
              {rows.map((row) => (
                <li key={row.id} {...rowProps(row)} className={cn("p-3", rowProps(row).className)}>
                  {renderMobileRow(row.original)}
                </li>
              ))}
            </ul>
          )}
          <div className={cn("rounded-lg border", renderMobileRow && "hidden md:block")}>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id} className="hover:bg-transparent">
                    {group.headers.map((header) => {
                      const meta = header.column.columnDef.meta
                      const align = meta?.align ?? "left"
                      const sorted = header.column.getIsSorted()
                      return (
                        <TableHead
                          key={header.id}
                          aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                          className={cn(alignClass[align], meta?.className)}
                        >
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("-mx-2 h-7 px-2 text-muted-foreground", align === "right" && "flex-row-reverse")}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === "asc" ? <ArrowUpIcon /> : sorted === "desc" ? <ArrowDownIcon /> : <ArrowUpDownIcon className="opacity-40" />}
                            </Button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} {...rowProps(row)}>
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(alignClass[meta?.align ?? "left"], meta?.align === "right" && "tabular-nums", meta?.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {pageSize > 0 && filteredCount > size && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {formatNumber(pageIndex * size + 1)}–{formatNumber(Math.min((pageIndex + 1) * size, filteredCount))} trong{" "}
            {formatNumber(filteredCount)}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeftIcon />
            </Button>
            <span className="px-2 tabular-nums">
              {pageIndex + 1}/{table.getPageCount()}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Trang sau" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { DataTable, type ColumnDef }
