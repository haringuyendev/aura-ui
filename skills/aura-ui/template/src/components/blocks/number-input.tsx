import * as React from "react"

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { LOCALE } from "@/lib/format"

type NumberInputProps = Omit<React.ComponentProps<typeof InputGroupInput>, "value" | "onChange" | "type"> & {
  value: number | null
  onChange: (value: number | null) => void
  /** Unit shown at the end: "₫", "%", "ngày". */
  suffix?: React.ReactNode
  /** Decimal places allowed (0 for money). */
  decimals?: number
}

const group = new Intl.NumberFormat(LOCALE).formatToParts(1000).find((p) => p.type === "group")?.value ?? "."
const decimal = new Intl.NumberFormat(LOCALE).formatToParts(1.1).find((p) => p.type === "decimal")?.value ?? ","

function display(value: number | null, decimals: number) {
  if (value === null || Number.isNaN(value)) return ""
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: decimals }).format(value)
}

/** Numeric input that shows locale grouping while typing ("1.250.000") and returns a number. Use for money, %, quantities. */
function NumberInput({ value, onChange, suffix, decimals = 0, onBlur, ...props }: NumberInputProps) {
  const [text, setText] = React.useState(() => display(value, decimals))
  const focused = React.useRef(false)

  React.useEffect(() => {
    if (!focused.current) setText(display(value, decimals))
  }, [value, decimals])

  return (
    <InputGroup>
      <InputGroupInput
        inputMode={decimals ? "decimal" : "numeric"}
        autoComplete="off"
        className="tabular-nums"
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          const raw = e.target.value.split(group).join("").replace(decimal, ".").replace(/[^\d.-]/g, "")
          const [int, frac] = raw.split(".")
          const cleaned = decimals && frac !== undefined ? `${int}.${frac.slice(0, decimals)}` : int
          const n = cleaned === "" || cleaned === "-" ? null : Number(cleaned)
          onChange(n)
          const head = n === null ? cleaned : display(Math.trunc(n), 0)
          setText(decimals && frac !== undefined ? `${head}${decimal}${frac.slice(0, decimals)}` : head)
        }}
        onBlur={(e) => {
          focused.current = false
          setText(display(value, decimals))
          onBlur?.(e)
        }}
        {...props}
      />
      {suffix && (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{suffix}</InputGroupText>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export { NumberInput }
