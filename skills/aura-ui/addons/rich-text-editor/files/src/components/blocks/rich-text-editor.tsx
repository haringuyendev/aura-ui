import * as React from "react"
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { CharacterCount, Placeholder } from "@tiptap/extensions"
import TextAlign from "@tiptap/extension-text-align"
import { TableKit } from "@tiptap/extension-table"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  TableIcon,
  UnderlineIcon,
  Undo2Icon,
} from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/format"
import { richTextStyles } from "./rich-text-content"

type RichTextEditorProps = {
  /** HTML. Render saved values with <RichTextContent html={…} />. */
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** "basic": marks, headings, lists, quote, link. "full": adds alignment and tables. */
  toolbar?: "basic" | "full"
  /** Character limit; shows a counter when set. */
  maxLength?: number
  readOnly?: boolean
  id?: string
  "aria-invalid"?: boolean
  "aria-label"?: string
  className?: string
}

const blockOptions = [
  { value: "p", label: "Đoạn văn" },
  { value: "h1", label: "Tiêu đề 1" },
  { value: "h2", label: "Tiêu đề 2" },
  { value: "h3", label: "Tiêu đề 3" },
] as const

function ToolbarToggle({ label, pressed, onPress, disabled, children }: { label: string; pressed?: boolean; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle size="sm" aria-label={label} pressed={pressed ?? false} onPressedChange={onPress} disabled={disabled}>
            {children}
          </Toggle>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const apply = () => {
    const href = url.trim()
    const chain = editor.chain().focus().extendMarkRange("link")
    if (!href) chain.unsetLink().run()
    else chain.setLink({ href: /^(https?:|mailto:|tel:)/.test(href) ? href : `https://${href}` }).run()
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setUrl(editor.getAttributes("link").href ?? "")
      }}
    >
      <PopoverTrigger
        render={
          <Toggle size="sm" aria-label="Chèn liên kết" pressed={active}>
            <LinkIcon />
          </Toggle>
        }
      />
      <PopoverContent align="start" className="flex w-72 flex-col gap-2">
        <Input
          autoFocus
          value={url}
          placeholder="https://…"
          aria-label="Địa chỉ liên kết"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), apply())}
        />
        <div className="flex justify-end gap-2">
          {active && (
            <Button size="sm" variant="ghost" onClick={() => (editor.chain().focus().unsetLink().run(), setOpen(false))}>
              Bỏ liên kết
            </Button>
          )}
          <Button size="sm" onClick={apply}>
            Áp dụng
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Toolbar({ editor, full }: { editor: Editor; full: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
      align: e.isActive({ textAlign: "center" }) ? "center" : e.isActive({ textAlign: "right" }) ? "right" : "left",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const c = () => editor.chain().focus()
  const sep = <Separator orientation="vertical" className="mx-1 h-5" />
  return (
    <div role="toolbar" aria-label="Định dạng văn bản" className="flex flex-wrap items-center gap-0.5 border-b p-1">
      <Select
        value={s.block}
        onValueChange={(v) => {
          if (v === "p") c().setParagraph().run()
          else c().toggleHeading({ level: Number(String(v).slice(1)) as 1 | 2 | 3 }).run()
        }}
      >
        <SelectTrigger size="sm" aria-label="Kiểu đoạn" className="w-32 border-0 shadow-none">
          <SelectValue>{(v: string) => blockOptions.find((o) => o.value === v)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {blockOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sep}
      <ToolbarToggle label="Đậm (Ctrl+B)" pressed={s.bold} onPress={() => c().toggleBold().run()}><BoldIcon /></ToolbarToggle>
      <ToolbarToggle label="Nghiêng (Ctrl+I)" pressed={s.italic} onPress={() => c().toggleItalic().run()}><ItalicIcon /></ToolbarToggle>
      <ToolbarToggle label="Gạch chân (Ctrl+U)" pressed={s.underline} onPress={() => c().toggleUnderline().run()}><UnderlineIcon /></ToolbarToggle>
      <ToolbarToggle label="Gạch ngang" pressed={s.strike} onPress={() => c().toggleStrike().run()}><StrikethroughIcon /></ToolbarToggle>
      {sep}
      <ToolbarToggle label="Danh sách" pressed={s.bullet} onPress={() => c().toggleBulletList().run()}><ListIcon /></ToolbarToggle>
      <ToolbarToggle label="Danh sách đánh số" pressed={s.ordered} onPress={() => c().toggleOrderedList().run()}><ListOrderedIcon /></ToolbarToggle>
      <ToolbarToggle label="Trích dẫn" pressed={s.quote} onPress={() => c().toggleBlockquote().run()}><QuoteIcon /></ToolbarToggle>
      <LinkButton editor={editor} active={s.link} />
      {full && (
        <>
          {sep}
          <ToolbarToggle label="Căn trái" pressed={s.align === "left"} onPress={() => c().setTextAlign("left").run()}><AlignLeftIcon /></ToolbarToggle>
          <ToolbarToggle label="Căn giữa" pressed={s.align === "center"} onPress={() => c().setTextAlign("center").run()}><AlignCenterIcon /></ToolbarToggle>
          <ToolbarToggle label="Căn phải" pressed={s.align === "right"} onPress={() => c().setTextAlign("right").run()}><AlignRightIcon /></ToolbarToggle>
          <ToolbarToggle label="Chèn bảng 3×3" onPress={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon /></ToolbarToggle>
        </>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarToggle label="Hoàn tác (Ctrl+Z)" disabled={!s.canUndo} onPress={() => c().undo().run()}><Undo2Icon /></ToolbarToggle>
        <ToolbarToggle label="Làm lại (Ctrl+Shift+Z)" disabled={!s.canRedo} onPress={() => c().redo().run()}><Redo2Icon /></ToolbarToggle>
      </div>
    </div>
  )
}

/** Rich text editor (Tiptap) with a token-styled toolbar. Value is HTML; works inside FormField. */
function RichTextEditor({ value, onChange, placeholder, toolbar = "basic", maxLength, readOnly, id, className, ...aria }: RichTextEditorProps) {
  const full = toolbar === "full"
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      CharacterCount.configure({ limit: maxLength }),
      ...(full ? [TextAlign.configure({ types: ["heading", "paragraph"] }), TableKit.configure({ table: { resizable: false } })] : []),
    ],
    content: value,
    editable: !readOnly,
    editorProps: {
      attributes: {
        ...(id && { id }),
        role: "textbox",
        "aria-multiline": "true",
        ...(aria["aria-label"] && { "aria-label": aria["aria-label"] }),
        ...(aria["aria-invalid"] && { "aria-invalid": "true" }),
        class: cn(richTextStyles, "min-h-32 px-3 py-2 outline-none"),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  })

  // Keep the editor in sync when the value is changed from outside (form reset, loading a record).
  React.useEffect(() => {
    if (editor && value !== (editor.isEmpty ? "" : editor.getHTML())) editor.commands.setContent(value || "", { emitUpdate: false })
  }, [editor, value])

  React.useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  const count = useEditorState({ editor, selector: ({ editor: e }) => (e ? e.storage.characterCount.characters() : 0) })

  return (
    <div
      data-slot="rich-text-editor"
      aria-invalid={aria["aria-invalid"] || undefined}
      className={cn(
        "rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
        readOnly && "bg-muted/40",
        className
      )}
    >
      {editor && !readOnly && <Toolbar editor={editor} full={full} />}
      <EditorContent editor={editor} />
      {maxLength && (
        <div className={cn("border-t px-3 py-1 text-right text-xs tabular-nums", count >= maxLength ? "text-destructive" : "text-muted-foreground")}>
          {formatNumber(count)}/{formatNumber(maxLength)} ký tự
        </div>
      )}
    </div>
  )
}

export { RichTextEditor }
