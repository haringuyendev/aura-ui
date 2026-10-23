import * as React from "react"
import DOMPurify from "dompurify"
import { cn } from "cn"

/** Typography for rich text, shared by the editor and the read-only view. Token colors only. */
export const richTextStyles = cn(
  "text-sm leading-relaxed break-words text-foreground",
  "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li>p]:my-0.5",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  "[&_td]:border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium"
)

type RichTextContentProps = Omit<React.ComponentProps<"div">, "children" | "dangerouslySetInnerHTML"> & {
  /** HTML saved from RichTextEditor (or any untrusted source); it is sanitized before rendering. */
  html: string
}

/** Read-only rendering of rich text HTML, sanitized with DOMPurify, styled with the same typography as the editor. */
function RichTextContent({ html, className, ...props }: RichTextContentProps) {
  const clean = React.useMemo(() => DOMPurify.sanitize(html, { ADD_ATTR: ["target"] }), [html])
  return <div data-slot="rich-text-content" className={cn(richTextStyles, className)} dangerouslySetInnerHTML={{ __html: clean }} {...props} />
}

export { RichTextContent }
