import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { vi } from "react-day-picker/locale"
import type { DateRange } from "react-day-picker"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDate, formatDayMonth } from "@/lib/format"

type Preset = { label: string; range: () => DateRange }

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const daysAgo = (n: number) => {
  const d = startOfDay(new Date())
  d.setDate(d.getDate() - n)
  return d
}

const defaultPresets: Preset[] = [
  { label: "Hôm nay", range: () => ({ from: daysAgo(0), to: daysAgo(0) }) },
  { label: "7 ngày qua", range: () => ({ from: daysAgo(6), to: daysAgo(0) }) },
  { label: "30 ngày qua", range: () => ({ from: daysAgo(29), to: daysAgo(0) }) },
  { label: "Tháng này", range: () => ({ from: new Date(new Date().getFullYear(), new Date().getMonth(), 1), to: daysAgo(0) }) },
]

function label(range?: DateRange) {
  if (!range?.from) return "Chọn khoảng ngày"
  if (!range.to || range.from.getTime() === range.to.getTime()) return formatDate(range.from)
  const sameYear = range.from.getFullYear() === range.to.getFullYear()
  return `${sameYear ? formatDayMonth(range.from) : formatDate(range.from)} – ${formatDate(range.to)}`
}

type DateRangePickerProps = {
  value?: DateRange
  onChange: (range: DateRange | undefined) => void
  presets?: Preset[]
  className?: string
}

/** Period picker: quick presets (Hôm nay, 7 ngày, 30 ngày, Tháng này) plus a custom range on a calendar. */
function DateRangePicker({ value, onChange, presets = defaultPresets, className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const active = presets.find((p) => {
    const r = p.range()
    return value?.from?.getTime() === r.from?.getTime() && value?.to?.getTime() === r.to?.getTime()
  })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className={cn("justify-start font-normal", className)}>
            <CalendarIcon />
            {active ? active.label : label(value)}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:border-r sm:border-b-0">
            {presets.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={active?.label === p.label ? "secondary" : "ghost"}
                className="justify-start"
                onClick={() => {
                  onChange(p.range())
                  setOpen(false)
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            locale={vi}
            selected={value}
            onSelect={onChange}
            numberOfMonths={1}
            defaultMonth={value?.from}
            disabled={{ after: new Date() }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DateRangePicker, type DateRange, type Preset }
