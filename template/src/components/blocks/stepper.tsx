import * as React from "react"
import { CheckIcon } from "lucide-react"
import { cn } from "cn"

type Step = { title: React.ReactNode; description?: React.ReactNode }

type StepperProps = React.ComponentProps<"ol"> & {
  steps: Step[]
  /** Index of the current step (0-based). Earlier steps show as done. */
  current: number
  /** Let users jump back to completed steps. */
  onStepClick?: (index: number) => void
}

/** Progress through a multi-step flow (wizard, checkout, onboarding). Horizontal from sm, vertical on mobile. */
function Stepper({ steps, current, onStepClick, className, ...props }: StepperProps) {
  return (
    <ol data-slot="stepper" className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2", className)} {...props}>
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming"
        const clickable = onStepClick && state === "done"
        const marker = (
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
              state === "done" && "border-primary bg-primary text-primary-foreground",
              state === "current" && "border-primary text-primary",
              state === "upcoming" && "text-muted-foreground"
            )}
          >
            {state === "done" ? <CheckIcon className="size-3.5" aria-hidden /> : i + 1}
          </span>
        )
        const text = (
          <span className="min-w-0 text-left">
            <span className={cn("block text-sm font-medium", state === "upcoming" && "text-muted-foreground")}>{step.title}</span>
            {step.description && <span className="block text-xs text-muted-foreground">{step.description}</span>}
          </span>
        )
        return (
          <li key={i} aria-current={state === "current" ? "step" : undefined} className="flex flex-1 items-start gap-2 sm:flex-col sm:gap-2">
            <div className="flex w-full items-center gap-2">
              {clickable ? (
                <button type="button" onClick={() => onStepClick(i)} className="flex items-start gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {marker}
                  <span className="sm:hidden">{text}</span>
                </button>
              ) : (
                <>
                  {marker}
                  <span className="sm:hidden">{text}</span>
                </>
              )}
              {i < steps.length - 1 && <span aria-hidden className={cn("hidden h-px flex-1 sm:block", i < current ? "bg-primary" : "bg-border")} />}
            </div>
            <span className="hidden sm:block">{text}</span>
          </li>
        )
      })}
    </ol>
  )
}

export { Stepper, type Step }
