import * as React from "react"
import type { Column } from "@tanstack/react-table"
import { PlusCircleIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { formatNumber } from "@/lib/format"

export type FacetOption = { value: string; label?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }

/** Multi-select filter for one column, with counts. Values come from `options` or from the data. */
export function FacetFilter<TData>({ column, title, options, counts }: { column: Column<TData, unknown>; title: string; options?: FacetOption[]; counts?: Map<unknown, number> }) {
  const selected = new Set((column.getFilterValue() as string[] | undefined) ?? [])
  const facets = counts ?? column.getFacetedUniqueValues()
  const list: FacetOption[] = options ?? [...facets.keys()].filter((v) => v !== "" && v != null).map((v) => ({ value: String(v) })).sort((a, b) => a.value.localeCompare(b.value, "vi"))
  const [query, setQuery] = React.useState("")
  const shown = query ? list.filter((o) => (typeof o.label === "string" ? o.label : o.value).toLowerCase().includes(query.toLowerCase())) : list

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    column.setFilterValue(next.size ? [...next] : undefined)
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="border-dashed">
            <PlusCircleIcon />
            {title}
            {selected.size > 0 && (
              <>
                <Separator orientation="vertical" className="mx-0.5 h-4" />
                {selected.size > 2 ? (
                  <Badge variant="secondary">{selected.size} đã chọn</Badge>
                ) : (
                  list.filter((o) => selected.has(o.value)).map((o) => <Badge key={o.value} variant="secondary">{o.label ?? o.value}</Badge>)
                )}
              </>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-60 gap-0 p-0">
        {list.length > 7 && (
          <div className="border-b p-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Tìm ${title.toLowerCase()}`} aria-label={`Tìm ${title.toLowerCase()}`} className="h-8" />
          </div>
        )}
        <div role="group" aria-label={title} className="max-h-72 overflow-y-auto p-1">
          {shown.map((o) => {
            const Icon = o.icon
            const id = `facet-${column.id}-${o.value}`
            return (
              <label key={o.value} htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted has-focus-visible:bg-muted">
                <Checkbox id={id} checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
                {Icon && <Icon className="size-4 text-muted-foreground" />}
                <span className="flex-1 truncate">{o.label ?? o.value}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(facets.get(o.value) ?? 0)}</span>
              </label>
            )
          })}
          {shown.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">Không có lựa chọn phù hợp</p>}
        </div>
        {selected.size > 0 && (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => column.setFilterValue(undefined)}>
              Xoá lọc {title.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
