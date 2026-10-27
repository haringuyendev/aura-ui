import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { vi } from "react-day-picker/locale"

import { Calendar } from "@/components/ui/calendar"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** Digits typed → "DD/MM/YYYY" (slashes fill themselves; day ≤ 31, month 1–12). */
function maskDate(input: string) {
  const d = input.replace(/\D/g, "").slice(0, 8)
  const [day, month, year] = [d.slice(0, 2), d.slice(2, 4), d.slice(4)]
  if (day.length === 2 && Number(day) > 31) return day.slice(0, 1)
  if (month.length === 2 && (Number(month) > 12 || Number(month) === 0)) return `${day}/${month.slice(0, 1)}`
  return [day, month, year].filter(Boolean).join("/")
}

/** "DD/MM/YYYY" → Date, or undefined when incomplete or not a real date. */
function parseDate(text: string) {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return undefined
  const date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return date.getDate() === Number(m[1]) ? date : undefined
}

const toText = (d?: Date) =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : ""

type DateFieldProps = Omit<React.ComponentProps<typeof InputGroupInput>, "value" | "onChange" | "defaultValue"> & {
  value?: Date
  onChange: (date: Date | undefined) => void
  /** false only when the user asked for typing alone */
  picker?: boolean
  calendarProps?: Omit<React.ComponentProps<typeof Calendar>, "mode" | "selected" | "onSelect">
}

/**
 * One date: picked on a vi-VN calendar (month/year dropdowns), or typed as DD/MM/YYYY with an auto-filling mask.
 * value is a Date (undefined while empty or incomplete). For a period use DateRangePicker.
 */
function DateField({ value, onChange, picker = true, calendarProps, className, disabled, placeholder = "DD/MM/YYYY", ...props }: DateFieldProps) {
  const [text, setText] = React.useState(toText(value))
  const [open, setOpen] = React.useState(false)
  // follow value changes from outside (reset, picked elsewhere) unless the text already says the same date
  const [shown, setShown] = React.useState(value)
  if (shown?.getTime() !== value?.getTime()) {
    setShown(value)
    if (parseDate(text)?.getTime() !== value?.getTime()) setText(toText(value))
  }
  return (
    <InputGroup className={className}>
      <InputGroupInput
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const next = maskDate(e.target.value)
          setText(next)
          const date = parseDate(next)
          if (date || !next) onChange(date)
        }}
        {...props}
      />
      {picker && (
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger disabled={disabled} render={<InputGroupButton size="icon-xs" aria-label="Chọn ngày trên lịch" />}>
              <CalendarIcon />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                locale={vi}
                captionLayout="dropdown"
                selected={value}
                defaultMonth={value}
                onSelect={(d) => {
                  if (d) {
                    setText(toText(d))
                    onChange(d)
                  }
                  setOpen(false)
                }}
                {...calendarProps}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export { DateField }
