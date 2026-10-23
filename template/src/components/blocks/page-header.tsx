import * as React from "react"
import { cn } from "cn"

type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode
  /** One line under the title: context, "số liệu đến 10:30", record count. */
  description?: React.ReactNode
  /** Above the title, e.g. a <Breadcrumb />. */
  breadcrumb?: React.ReactNode
  /** Right side: the primary action and at most one or two secondary ones. */
  actions?: React.ReactNode
  /** Row under the title: global filters, period picker, tabs. */
  children?: React.ReactNode
}

/** Page title block: breadcrumb, title, description, actions, and an optional filter row. */
function PageHeader({ title, description, breadcrumb, actions, children, className, ...props }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-4", className)} {...props}>
      {breadcrumb}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

export { PageHeader }
