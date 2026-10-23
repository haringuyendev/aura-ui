import * as React from "react"
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react"
import { cn } from "cn"

import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { formatSigned } from "@/lib/format"

type DeltaProps = React.ComponentProps<"span"> & {
  /** The change, e.g. 12.5 for +12,5% or -3 for −3 phút. */
  value: number
  /** Which direction is good. "up" for revenue, "down" for wait time or errors, "neutral" for spend. */
  good?: "up" | "down" | "neutral"
  /** Formats the change; defaults to a signed percent. */
  format?: (value: number) => string
  /** Changes with |value| below this are shown muted as "no real change". */
  threshold?: number
}

/** Arrow + signed change, colored by whether the change is good or bad (not by up/down). */
function Delta({ value, good = "up", format = (v) => formatSigned(v, "%"), threshold = 0, className, ...props }: DeltaProps) {
  const flat = Math.abs(value) <= threshold
  const isGood = good === "neutral" || flat ? null : good === "up" ? value > 0 : value < 0
  const Icon = flat ? MinusIcon : value > 0 ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span
      data-slot="delta"
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        isGood === null ? "text-muted-foreground" : isGood ? "text-success" : "text-destructive",
        className
      )}
      {...props}
    >
      <Icon aria-hidden className="size-3.5" />
      {format(value)}
    </span>
  )
}

type StatProps = Omit<React.ComponentProps<typeof Card>, "children"> & {
  label: React.ReactNode
  /** The formatted value ("1.234", "12,4 tr ₫"). */
  value: React.ReactNode
  unit?: React.ReactNode
  /** Usually a <Delta />. */
  delta?: React.ReactNode
  /** Baseline or threshold in muted text ("tuần trước: 1.120", "ngưỡng 30 phút"). */
  caption?: React.ReactNode
  /** Top-right slot: a badge, an info tooltip or a small menu. */
  action?: React.ReactNode
  /** Optional sparkline or breakdown bar under the numbers. */
  children?: React.ReactNode
}

/** KPI / stat card: label, big tabular value, change and baseline. The value stays in the foreground color. */
function Stat({ label, value, unit, delta, caption, action, children, className, ...props }: StatProps) {
  return (
    <Card data-slot="stat" className={cn("gap-2", className)} {...props}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        {(delta || caption) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {delta}
            {caption && <span>{caption}</span>}
          </div>
        )}
        {children && <div className="pt-1">{children}</div>}
      </CardContent>
    </Card>
  )
}

export { Delta, Stat }
