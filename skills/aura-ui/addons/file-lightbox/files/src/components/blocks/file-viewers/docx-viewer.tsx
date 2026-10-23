import * as React from "react"
import { renderAsync } from "docx-preview"

import { Spinner } from "@/components/ui/spinner"

/** Word (.docx) rendered client-side with docx-preview: paragraphs, tables, images, headers/footers. */
export default function DocxViewer({ data, zoom }: { data: ArrayBuffer; zoom: number }) {
  const body = React.useRef<HTMLDivElement>(null)
  const styles = React.useRef<HTMLDivElement>(null)
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading")

  React.useEffect(() => {
    if (!body.current || !styles.current) return
    let cancelled = false
    setState("loading")
    body.current.innerHTML = ""
    renderAsync(data.slice(0), body.current, styles.current, {
      inWrapper: true,
      ignoreLastRenderedPageBreak: true,
      renderComments: false,
      renderChanges: false,
      useBase64URL: true,
    })
      .then(() => !cancelled && setState("ready"))
      .catch(() => !cancelled && setState("error"))
    return () => {
      cancelled = true
    }
  }, [data])

  return (
    <div className="relative h-full overflow-auto bg-muted">
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {state === "error" && <p className="p-6 text-center text-sm text-destructive">Không mở được tệp Word này. Hãy tải về để xem.</p>}
      <div ref={styles} />
      <div
        ref={body}
        style={{ zoom }}
        className="[&_.docx-wrapper]:bg-transparent! [&_.docx-wrapper]:p-4! [&_.docx-wrapper>section.docx]:mb-4 [&_.docx-wrapper>section.docx]:shadow-sm"
      />
    </div>
  )
}
