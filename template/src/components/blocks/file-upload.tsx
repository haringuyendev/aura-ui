import * as React from "react"
import { FileIcon, UploadIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { formatNumber } from "@/lib/format"

type FileUploadProps = {
  value: File[]
  onChange: (files: File[]) => void
  /** e.g. "image/*,.pdf" */
  accept?: string
  multiple?: boolean
  /** Bytes; larger files are rejected with a message. */
  maxSize?: number
  /** Helper line under the drop area, e.g. "PDF hoặc ảnh, tối đa 10 MB". */
  hint?: React.ReactNode
  disabled?: boolean
  className?: string
  id?: string
  /** Called with the file index when its name is clicked, e.g. to open <FileLightbox>. */
  onPreview?: (index: number) => void
}

const sizeLabel = (bytes: number) => (bytes >= 1e6 ? `${formatNumber(bytes / 1e6)} MB` : `${formatNumber(Math.max(1, bytes / 1e3), 0)} KB`)

/** Drag-and-drop or click-to-pick file area with the chosen files listed as attachments. */
function FileUpload({ value, onChange, accept, multiple = true, maxSize, hint, disabled, className, id, onPreview }: FileUploadProps) {
  const inputId = React.useId()
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const add = (list: FileList | null) => {
    if (!list) return
    const files = Array.from(list)
    const tooBig = maxSize ? files.filter((f) => f.size > maxSize) : []
    setError(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} vượt quá ${sizeLabel(maxSize!)}` : null)
    const ok = files.filter((f) => !tooBig.includes(f))
    onChange(multiple ? [...value, ...ok] : ok.slice(0, 1))
  }

  return (
    <div data-slot="file-upload" className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={id ?? inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) add(e.dataTransfer.files)
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors",
          "hover:bg-muted/50 has-focus-visible:ring-2 has-focus-visible:ring-ring",
          dragging && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <UploadIcon aria-hidden className="size-5 text-muted-foreground" />
        <span className="font-medium">Kéo thả tệp vào đây hoặc bấm để chọn</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        <input
          id={id ?? inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ""
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <AttachmentGroup>
          {value.map((file, i) => (
            <Attachment key={`${file.name}-${i}`}>
              <AttachmentMedia>
                <FileIcon />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>
                  {onPreview ? (
                    <button type="button" onClick={() => onPreview(i)} className="rounded-sm text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {file.name}
                    </button>
                  ) : (
                    file.name
                  )}
                </AttachmentTitle>
                <AttachmentDescription>{sizeLabel(file.size)}</AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction aria-label={`Bỏ ${file.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
      )}
    </div>
  )
}

export { FileUpload }
