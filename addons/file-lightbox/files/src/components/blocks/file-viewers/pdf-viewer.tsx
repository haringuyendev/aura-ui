import * as React from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"

import { Spinner } from "@/components/ui/spinner"
import { formatNumber } from "@/lib/format"

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()

// Fonts, CMaps and wasm decoders copied to public/pdfjs/ by add-block.sh, so PDFs without
// embedded fonts (common for Vietnamese forms) render correctly offline.
const options = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
}

/** Renders a page only once it scrolls near the viewport, so long PDFs open fast. */
function LazyPage({ pageNumber, width, ratio, onVisible }: { pageNumber: number; width: number; ratio: number; onVisible: (n: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [shown, setShown] = React.useState(pageNumber <= 2)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    // Render when within 600px of the viewport; count as "current" while it spans the vertical center.
    const near = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { rootMargin: "600px 0px" })
    const center = new IntersectionObserver(([e]) => e.isIntersecting && onVisible(pageNumber), { rootMargin: "-50% 0px -50% 0px" })
    near.observe(el)
    center.observe(el)
    return () => {
      near.disconnect()
      center.disconnect()
    }
  }, [pageNumber, onVisible])
  return (
    <div ref={ref} data-page={pageNumber} className="mx-auto bg-card shadow-sm" style={{ width, minHeight: shown ? undefined : width * ratio }}>
      {shown && <Page pageNumber={pageNumber} width={width} loading={null} />}
    </div>
  )
}

export default function PdfViewer({ data, zoom }: { data: ArrayBuffer; zoom: number }) {
  const file = React.useMemo(() => ({ data: new Uint8Array(data.slice(0)) }), [data])
  const box = React.useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = React.useState(800)
  const [pages, setPages] = React.useState(0)
  const [ratio, setRatio] = React.useState(1.414)
  const [current, setCurrent] = React.useState(1)

  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const width = Math.max(240, Math.min(boxWidth - 32, 900) * zoom)

  const spinner = <div className="flex h-64 items-center justify-center"><Spinner /></div>

  // react-pdf suspends while loading. The boundary must sit inside this component so it stays
  // mounted and `file` keeps its identity; otherwise every retry re-creates it and reloads forever.
  return (
    <div className="relative h-full">
    <div ref={box} className="h-full overflow-auto bg-muted">
      <React.Suspense fallback={spinner}>
      <Document
        file={file}
        options={options}
        loading={spinner}
        error={<p className="p-6 text-center text-sm text-destructive">Không mở được tệp PDF này.</p>}
        onLoadSuccess={async (doc) => {
          setPages(doc.numPages)
          const first = await doc.getPage(1)
          const vp = first.getViewport({ scale: 1 })
          setRatio(vp.height / vp.width)
        }}
        className="flex flex-col gap-4 py-4"
      >
        {Array.from({ length: pages }, (_, i) => (
          <LazyPage key={i + 1} pageNumber={i + 1} width={width} ratio={ratio} onVisible={setCurrent} />
        ))}
      </Document>
      </React.Suspense>
    </div>
      {pages > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-popover px-3 py-1 text-xs tabular-nums text-popover-foreground shadow-sm ring-1 ring-foreground/10">
            Trang {formatNumber(current)}/{formatNumber(pages)}
          </span>
        </div>
      )}
    </div>
  )
}
