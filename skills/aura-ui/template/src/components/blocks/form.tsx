import * as React from "react"
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerRenderProps,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
  type Resolver,
  type SubmitHandler,
  type UseFormReturn,
} from "react-hook-form"
import type { z } from "zod"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"

/** react-hook-form resolver for a zod schema (messages come from the schema, write them in the UI language). */
function zodResolver<T extends FieldValues>(schema: z.ZodType<T>): Resolver<T> {
  return async (values) => {
    const result = await schema.safeParseAsync(values)
    if (result.success) return { values: result.data, errors: {} }
    const errors: Record<string, unknown> = {}
    for (const issue of result.error.issues) {
      let node = errors
      issue.path.forEach((key, i) => {
        const k = String(key)
        if (i === issue.path.length - 1) node[k] ??= { type: issue.code, message: issue.message }
        else node = (node[k] ??= {}) as Record<string, unknown>
      })
    }
    return { values: {}, errors: errors as FieldErrors<T> }
  }
}

type FormProps<T extends FieldValues> = Omit<React.ComponentProps<"form">, "onSubmit"> & {
  form: UseFormReturn<T>
  onSubmit: SubmitHandler<T>
}

/** <form> wired to react-hook-form. Create `form` with useForm({ resolver: zodResolver(schema), defaultValues }). */
function Form<T extends FieldValues>({ form, onSubmit, children, ...props }: FormProps<T>) {
  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} {...props}>
        {children}
      </form>
    </FormProvider>
  )
}

type FormFieldProps<T extends FieldValues, N extends FieldPath<T>> = {
  name: N
  label?: React.ReactNode
  description?: React.ReactNode
  orientation?: React.ComponentProps<typeof Field>["orientation"]
  /** Render the control. Spread `field` and `id`; set `aria-invalid={invalid}` on custom controls. */
  children: (props: { field: ControllerRenderProps<T, N>; id: string; invalid: boolean }) => React.ReactNode
}

/** One labeled field with description and validation message, bound to the surrounding <Form>. */
function FormField<T extends FieldValues, N extends FieldPath<T>>({ name, label, description, orientation, children }: FormFieldProps<T, N>) {
  const { control } = useFormContext<T>()
  const id = React.useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field orientation={orientation} data-invalid={fieldState.invalid || undefined}>
          {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
          {children({ field, id, invalid: fieldState.invalid })}
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

export { Form, FormField, zodResolver }
