import * as React from "react"
import { cn } from "cn"

type DescriptionItem = {
  label: React.ReactNode
  /** Empty values (null, undefined, "") render as "—". */
  value?: React.ReactNode
  /** Make one item span the full row (addresses, notes). */
  full?: boolean
}

type DescriptionListProps = React.ComponentProps<"dl"> & {
  items: DescriptionItem[]
  columns?: 1 | 2 | 3
}

const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }

/** Label–value pairs for detail pages, drawers and summaries. Stacks to one column on mobile. */
function DescriptionList({ items, columns = 2, className, ...props }: DescriptionListProps) {
  return (
    <dl data-slot="description-list" className={cn("grid grid-cols-1 gap-x-6 gap-y-4", cols[columns], className)} {...props}>
      {items.map((item, i) => (
        <div key={i} className={cn("min-w-0 space-y-1", item.full && "sm:col-span-full")}>
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-sm break-words">
            {item.value === null || item.value === undefined || item.value === "" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export { DescriptionList, type DescriptionItem }
