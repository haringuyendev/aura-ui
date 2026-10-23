import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type PaginationState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatNumber } from "@/lib/format"
import { ColumnsMenu } from "./data-table-parts/columns-menu"
import { ExportMenu } from "./data-table-parts/export-menu"
import { FacetFilter, type FacetOption } from "./data-table-parts/facet-filter"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Numbers, money and dates align right (header too). */
    align?: "left" | "right" | "center"
    /** Fixed width, e.g. "w-32"; leave the main identity column flexible. */
    className?: string
    /** Label for the columns menu and CSV header when `header` is not a plain string. */
    label?: string
    /** false keeps the column out of the columns menu (use for the identity column). */
    hideable?: boolean
    /** Export value (Excel/CSV); defaults to the accessor value. Return numbers and Dates, not formatted text, for Excel. */
    exportValue?: (row: TData) => string | number | boolean | Date | null | undefined
    /** Excel number format, e.g. '#,##0 "₫"', '0.0%', 'dd/mm/yyyy hh:mm'. Defaults by value type. */
    excelFormat?: string
  }
}

type DataTableFilter = {
  /** Column id (or accessorKey) to filter on; its values are matched exactly. */
  column: string
  title: string
  /** Fixed options with labels; omitted → distinct values found in the data. */
  options?: FacetOption[]
}

type ServerState = {
  sorting?: SortingState
  pagination?: PaginationState
  columnFilters?: ColumnFiltersState
  globalFilter?: string
}

type DataTableProps<TData> = {
  columns: ColumnDef<TData, any>[]
  data: TData[]
  getRowId?: (row: TData, index: number) => string
  /** Show a search box that filters across all columns. */
  searchPlaceholder?: string
  /** Multi-select filters shown in the toolbar, e.g. [{ column: "status", title: "Trạng thái", options }]. */
  filters?: DataTableFilter[]
  /** Rows per page; 0 shows everything. */
  pageSize?: number
  initialSorting?: SortingState
  initialColumnVisibility?: VisibilityState
  /** Show the "Cột" menu so users can hide/show columns. */
  columnToggle?: boolean
  /** Remember column visibility in localStorage under this key. */
  storageKey?: string
  /** Checkbox per row and a bulk-action bar. Use with getRowId. */
  selectable?: boolean
  /** Buttons shown in the bulk bar for the selected rows; call clear() after acting. */
  bulkActions?: (rows: TData[], clear: () => void) => React.ReactNode
  /** Adds an "Xuất" menu: Excel (.xlsx) or CSV, of the selected rows or all filtered rows. */
  exportFileName?: string
  onRowClick?: (row: TData) => void
  /** Extra controls next to the search and filters (tabs, a primary action). */
  toolbar?: React.ReactNode
  /** What to show when there is no data at all (no search or filter applied). */
  empty?: React.ReactNode
  /** Below md, render each row as a card instead of the table (recommended for 4+ columns). */
  renderMobileRow?: (row: TData) => React.ReactNode
  /** Show skeleton rows (initial load or server refetch). */
  loading?: boolean
  /**
   * Server mode: data is one page already sorted/filtered by the API. Pass `rowCount` and the state
   * you keep, and fetch again in the change handlers.
   */
  manual?: boolean
  rowCount?: number
  state?: ServerState
  onSortingChange?: (s: SortingState) => void
  onPaginationChange?: (p: PaginationState) => void
  onColumnFiltersChange?: (f: ColumnFiltersState) => void
  onGlobalFilterChange?: (q: string) => void
  className?: string
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" }
const PAGE_SIZES = [10, 20, 50, 100]

const matchAny: FilterFn<unknown> = (row, id, value: string[]) => !value?.length || value.includes(String(row.getValue(id)))

/** State that is internal by default and follows `controlled` when the parent passes it (server mode). */
function useMaybeControlled<T>(controlled: T | undefined, initial: T, onChange?: (v: T) => void) {
  const [inner, setInner] = React.useState<T>(initial)
  const value = controlled ?? inner
  const set = React.useCallback(
    (u: Updater<T>) => {
      const next = typeof u === "function" ? (u as (old: T) => T)(value) : u
      setInner(next)
      onChange?.(next)
    },
    [value, onChange]
  )
  return [value, set] as const
}

function readStored(key?: string): VisibilityState | undefined {
  if (!key) return undefined
  try {
    const raw = localStorage.getItem(`data-table:${key}`)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

/**
 * Data table on TanStack Table: sorting, search, multi-select column filters with counts, user column
 * visibility (remembered), row selection with bulk actions, CSV export, pagination, loading skeleton,
 * mobile card layout, and a server mode for API-backed lists.
 */
function DataTable<TData>({
  columns: userColumns,
  data,
  getRowId,
  searchPlaceholder,
  filters,
  pageSize = 20,
  initialSorting = [],
  initialColumnVisibility = {},
  columnToggle = false,
  storageKey,
  selectable = false,
  bulkActions,
  exportFileName,
  onRowClick,
  toolbar,
  empty,
  renderMobileRow,
  loading = false,
  manual = false,
  rowCount,
  state,
  onSortingChange,
  onPaginationChange,
  onColumnFiltersChange,
  onGlobalFilterChange,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useMaybeControlled(state?.sorting, initialSorting, onSortingChange)
  const [columnFilters, setColumnFilters] = useMaybeControlled<ColumnFiltersState>(state?.columnFilters, [], onColumnFiltersChange)
  const [globalFilter, setGlobalFilter] = useMaybeControlled(state?.globalFilter, "", onGlobalFilterChange)
  const [pagination, setPagination] = useMaybeControlled<PaginationState>(state?.pagination, { pageIndex: 0, pageSize: pageSize || 1 }, onPaginationChange)
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => ({ ...initialColumnVisibility, ...readStored(storageKey) }))
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  // In server mode the search box updates its own text at once and tells the parent after a pause.
  const [searchText, setSearchText] = React.useState(globalFilter)

  React.useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(`data-table:${storageKey}`, JSON.stringify(columnVisibility))
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }, [storageKey, columnVisibility])

  React.useEffect(() => {
    if (!manual || searchText === globalFilter) return
    const t = setTimeout(() => {
      setGlobalFilter(searchText)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    }, 300)
    return () => clearTimeout(t)
  }, [manual, searchText, globalFilter, setGlobalFilter, setPagination])

  const columns = React.useMemo<ColumnDef<TData, any>[]>(() => {
    if (!selectable) return userColumns
    const select: ColumnDef<TData, any> = {
      id: "__select",
      enableSorting: false,
      enableHiding: false,
      meta: { className: "w-10", hideable: false },
      header: ({ table }) => (
        <Checkbox
          aria-label="Chọn tất cả dòng trên trang"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
        />
      ),
      cell: ({ row }) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Checkbox aria-label="Chọn dòng" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} />
        </span>
      ),
    }
    return [select, ...userColumns]
  }, [selectable, userColumns])

  const table = useReactTable<TData>({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, columnVisibility, rowSelection, ...(pageSize > 0 && { pagination }) },
    defaultColumn: { filterFn: matchAny as FilterFn<TData> },
    globalFilterFn: "includesString",
    onSortingChange: setSorting,
    onColumnFiltersChange: (u) => {
      setColumnFilters(u)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    },
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: manual,
    manualFiltering: manual,
    manualPagination: manual,
    ...(manual
      ? { rowCount: rowCount ?? data.length }
      : {
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
          getFacetedRowModel: getFacetedRowModel(),
          getFacetedUniqueValues: getFacetedUniqueValues(),
          ...(pageSize > 0 && { getPaginationRowModel: getPaginationRowModel() }),
        }),
  })

  const rows = table.getRowModel().rows
  const total = manual ? (rowCount ?? data.length) : table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize: size } = table.getState().pagination
  const visibleColumns = table.getVisibleLeafColumns()
  const selectedRows = table.getSelectedRowModel().rows
  const filtered = columnFilters.length > 0 || Boolean(globalFilter)
  const clearSelection = () => table.resetRowSelection()

  const rowProps = (row: Row<TData>) =>
    onRowClick
      ? {
          tabIndex: 0,
          onClick: () => onRowClick(row.original),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.target !== e.currentTarget) return
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onRowClick(row.original)
            }
          },
          className: "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        }
      : {}

  const exportColumns = visibleColumns.filter((c) => c.id !== "__select")
  const exportRows = () =>
    selectedRows.length ? selectedRows : manual ? rows : table.getSortedRowModel().rows.filter((r) => table.getFilteredRowModel().rowsById[r.id])

  const search = searchPlaceholder && (
    <InputGroup className="w-full sm:w-72">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={searchPlaceholder}
        placeholder={searchPlaceholder}
        value={manual ? searchText : globalFilter}
        onChange={(e) => {
          if (manual) setSearchText(e.target.value)
          else {
            setGlobalFilter(e.target.value)
            table.setPageIndex(0)
          }
        }}
      />
    </InputGroup>
  )

  const hasToolbar = searchPlaceholder || filters?.length || toolbar || columnToggle || exportFileName

  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-3", className)}>
      {hasToolbar && (
        <div className="flex min-h-9 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          {selectable && selectedRows.length > 0 ? (
            <div role="region" aria-label="Thao tác với các dòng đã chọn" className="flex min-h-9 w-full flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-accent-foreground">
              <span className="text-sm font-medium tabular-nums">Đã chọn {formatNumber(selectedRows.length)}</span>
              <div className="flex flex-wrap items-center gap-2">
                {bulkActions?.(selectedRows.map((r) => r.original), clearSelection)}
                {exportFileName && <ExportMenu fileName={exportFileName} columns={exportColumns} getRows={exportRows} />}
              </div>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={clearSelection}>
                <XIcon /> Bỏ chọn
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {search}
                {filters?.map((f) => {
                  const column = table.getColumn(f.column)
                  return column ? <FacetFilter key={f.column} column={column} title={f.title} options={f.options} counts={manual ? new Map() : undefined} /> : null
                })}
                {columnFilters.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
                    Xoá lọc <XIcon />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {toolbar}
                {exportFileName && <ExportMenu fileName={exportFileName} columns={exportColumns} getRows={exportRows} disabled={total === 0} />}
                {columnToggle && <ColumnsMenu table={table} />}
              </div>
            </>
          )}
        </div>
      )}

      {!loading && total === 0 ? (
        filtered || !empty ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>{globalFilter ? `Không tìm thấy kết quả cho “${globalFilter}”` : filtered ? "Không có dòng nào khớp bộ lọc" : "Chưa có dữ liệu"}</EmptyTitle>
              {filtered && <EmptyDescription>Thử từ khoá khác hoặc xoá bộ lọc.</EmptyDescription>}
            </EmptyHeader>
            {filtered && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setGlobalFilter("")
                  setSearchText("")
                  table.resetColumnFilters()
                }}
              >
                Xoá tìm kiếm và bộ lọc
              </Button>
            )}
          </Empty>
        ) : (
          empty
        )
      ) : (
        <>
          {renderMobileRow && (
            <ul aria-busy={loading || undefined} className="flex flex-col divide-y rounded-lg border md:hidden">
              {loading
                ? Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="space-y-2 p-3">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </li>
                  ))
                : rows.map((row) => (
                    <li key={row.id} {...rowProps(row)} data-state={row.getIsSelected() ? "selected" : undefined} className={cn("flex gap-3 p-3 data-[state=selected]:bg-muted", rowProps(row).className)}>
                      {selectable && (
                        <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label="Chọn dòng" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">{renderMobileRow(row.original)}</div>
                    </li>
                  ))}
            </ul>
          )}
          <div className={cn("rounded-lg border", renderMobileRow && "hidden md:block")}>
            <Table aria-busy={loading || undefined}>
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
                {loading
                  ? Array.from({ length: Math.min(size || 8, 8) }, (_, i) => (
                      <TableRow key={i} className="hover:bg-transparent">
                        {visibleColumns.map((c) => (
                          <TableCell key={c.id} className={c.columnDef.meta?.className}>
                            <Skeleton className={cn("h-4", c.id === "__select" ? "size-4" : "w-3/4")} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.map((row) => (
                      <TableRow key={row.id} {...rowProps(row)} data-state={row.getIsSelected() ? "selected" : undefined}>
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

      {pageSize > 0 && total > 0 && (total > size || pageIndex > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {formatNumber(pageIndex * size + 1)}–{formatNumber(Math.min((pageIndex + 1) * size, total))} trong {formatNumber(total)}
          </span>
          <div className="flex items-center gap-2">
            <Select value={String(size)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger size="sm" aria-label="Số dòng mỗi trang" className="w-28">
                <SelectValue>{(v: string) => `${v} dòng`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...PAGE_SIZES, pageSize])].sort((a, b) => a - b).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} dòng
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon-sm" aria-label="Trang trước" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeftIcon />
            </Button>
            <span className="tabular-nums">
              {pageIndex + 1}/{Math.max(1, table.getPageCount())}
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

export { DataTable, type ColumnDef, type DataTableFilter, type FacetOption }
