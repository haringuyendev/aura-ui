import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatNumber } from "@/lib/format"

const PdfViewer = React.lazy(() => import("./file-viewers/pdf-viewer"))
const DocxViewer = React.lazy(() => import("./file-viewers/docx-viewer"))
const SheetViewer = React.lazy(() => import("./file-viewers/sheet-viewer"))

export type LightboxFile = {
  name: string
  /** Either a URL the browser can fetch (same origin or CORS-enabled) or a File/Blob already in memory. */
  url?: string
  file?: Blob
  /** MIME type; detected from the name when omitted. */
  type?: string
  size?: number
}

type Kind = "image" | "pdf" | "docx" | "sheet" | "text" | "other"

function kindOf(f: LightboxFile): Kind {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? ""
  const type = f.type ?? (f.file instanceof File ? f.file.type : "")
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"].includes(ext)) return "image"
  if (type === "application/pdf" || ext === "pdf") return "pdf"
  if (ext === "docx" || type.includes("wordprocessingml")) return "docx"
  if (["xlsx", "xls", "xlsm", "csv", "ods"].includes(ext) || type.includes("spreadsheet") || type === "text/csv") return "sheet"
  if (["txt", "log", "json", "md"].includes(ext) || type.startsWith("text/")) return "text"
  return "other"
}

const kindIcon = { image: ImageIcon, pdf: FileTextIcon, docx: FileTextIcon, sheet: FileSpreadsheetIcon, text: FileTextIcon, other: FileIcon }
const zoomable: Kind[] = ["image", "pdf", "docx"]
const sizeLabel = (b: number) => (b >= 1e6 ? `${formatNumber(b / 1e6)} MB` : `${formatNumber(Math.max(1, b / 1e3), 0)} KB`)

function useFileData(f: LightboxFile | undefined) {
  const [state, setState] = React.useState<{ data?: ArrayBuffer; error?: boolean }>({})
  React.useEffect(() => {
    if (!f) return
    let cancelled = false
    setState({})
    const load = f.file ? f.file.arrayBuffer() : fetch(f.url!).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    load.then((data) => !cancelled && setState({ data })).catch(() => !cancelled && setState({ error: true }))
    return () => {
      cancelled = true
    }
  }, [f])
  return state
}

function useObjectUrl(f: LightboxFile | undefined) {
  const [url, setUrl] = React.useState<string>()
  React.useEffect(() => {
    if (!f) return
    if (!f.file) return setUrl(f.url)
    const u = URL.createObjectURL(f.file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [f])
  return url
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>{children}</Button>} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Viewer({ file, kind, zoom, onDownload }: { file: LightboxFile; kind: Kind; zoom: number; onDownload: () => void }) {
  const needsData = kind === "pdf" || kind === "docx" || kind === "sheet" || kind === "text"
  const { data, error } = useFileData(needsData ? file : undefined)
  const src = useObjectUrl(kind === "image" ? file : undefined)
  const center = <div className="flex h-full items-center justify-center"><Spinner /></div>

  const unsupported = (title: string, desc: string) => (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileIcon /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{desc}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onDownload}><DownloadIcon /> Tải về</Button>
      </EmptyContent>
    </Empty>
  )

  if (kind === "other") return unsupported("Chưa xem trước được loại tệp này", "Tải về để mở bằng ứng dụng trên máy.")
  if (error) return unsupported("Không tải được tệp", "Kiểm tra kết nối hoặc quyền truy cập rồi thử lại, hoặc tải về.")
  if (kind === "image")
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-muted p-4">
        {src && <img src={src} alt={file.name} style={{ transform: `scale(${zoom})` }} className="max-h-full max-w-full origin-center object-contain transition-transform" />}
      </div>
    )
  if (!data) return center
  if (kind === "text")
    return <pre className="h-full overflow-auto bg-background p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{new TextDecoder().decode(data)}</pre>
  return (
    <React.Suspense fallback={center}>
      {kind === "pdf" && <PdfViewer data={data} zoom={zoom} />}
      {kind === "docx" && <DocxViewer data={data} zoom={zoom} />}
      {kind === "sheet" && <SheetViewer data={data} />}
    </React.Suspense>
  )
}

type FileLightboxProps = {
  files: LightboxFile[]
  /** Index of the open file; null when closed. */
  index: number | null
  onIndexChange: (index: number | null) => void
}

/** Full-screen viewer for attachments: images, PDF, Word (.docx), Excel/CSV and text, with zoom, paging between files and download. */
function FileLightbox({ files, index, onIndexChange }: FileLightboxProps) {
  const file = index === null ? undefined : files[index]
  const kind = file ? kindOf(file) : "other"
  const [zoom, setZoom] = React.useState(1)
  const href = useObjectUrl(file)
  React.useEffect(() => setZoom(1), [index])

  const go = (d: number) => index !== null && files.length > 1 && onIndexChange((index + d + files.length) % files.length)
  const download = () => {
    if (!href || !file) return
    const a = document.createElement("a")
    a.href = href
    a.download = file.name
    a.click()
  }
  const Icon = kindIcon[kind]

  return (
    <Dialog open={index !== null} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none"
        onKeyDown={(e) => {
          if (e.target instanceof HTMLElement && e.target.closest("[contenteditable], input, textarea")) return
          if (e.key === "ArrowRight") go(1)
          if (e.key === "ArrowLeft") go(-1)
          if ((e.key === "+" || e.key === "=") && zoomable.includes(kind)) setZoom((z) => Math.min(3, z + 0.25))
          if (e.key === "-" && zoomable.includes(kind)) setZoom((z) => Math.max(0.5, z - 0.25))
        }}
      >
        {file && (
          <>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
              <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-sm font-medium">{file.name}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground tabular-nums">
                  {files.length > 1 && `${index! + 1}/${files.length}`}
                  {files.length > 1 && (file.size ?? file.file?.size) ? " · " : ""}
                  {(file.size ?? file.file?.size) ? sizeLabel(file.size ?? file.file!.size) : ""}
                </DialogDescription>
              </div>
              {zoomable.includes(kind) && (
                <div className="hidden items-center sm:flex">
                  <IconButton label="Thu nhỏ (−)" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} disabled={zoom <= 0.5}><MinusIcon /></IconButton>
                  <Button variant="ghost" size="sm" className="w-14 tabular-nums" onClick={() => setZoom(1)} aria-label="Về 100%">
                    {Math.round(zoom * 100)}%
                  </Button>
                  <IconButton label="Phóng to (+)" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} disabled={zoom >= 3}><PlusIcon /></IconButton>
                </div>
              )}
              {files.length > 1 && (
                <div className="flex items-center sm:hidden">
                  <IconButton label="Tệp trước" onClick={() => go(-1)}><ChevronLeftIcon /></IconButton>
                  <IconButton label="Tệp sau" onClick={() => go(1)}><ChevronRightIcon /></IconButton>
                </div>
              )}
              <IconButton label="Tải về" onClick={download}><DownloadIcon /></IconButton>
              <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Đóng (Esc)" />}>
                <XIcon />
              </DialogClose>
            </header>
            <div className="relative min-h-0 flex-1">
              <Viewer key={index} file={file} kind={kind} zoom={zoom} onDownload={download} />
              {files.length > 1 && (
                <>
                  <Button variant="outline" size="icon" aria-label="Tệp trước (←)" onClick={() => go(-1)} className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full shadow-sm sm:inline-flex">
                    <ChevronLeftIcon />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Tệp sau (→)" onClick={() => go(1)} className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full shadow-sm sm:inline-flex">
                    <ChevronRightIcon />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { FileLightbox }
