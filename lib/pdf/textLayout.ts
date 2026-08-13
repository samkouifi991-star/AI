import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

const PAGE_WIDTH = 612 // US Letter, points
const PAGE_HEIGHT = 792
const MARGIN = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const INK = rgb(0.09, 0.11, 0.13)
const MUTED = rgb(0.35, 0.4, 0.45)
const BRAND = rgb(0.11, 0.28, 0.32) // harbor-800-ish

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

// A small stateful helper around pdf-lib that paginates automatically —
// every generated document (form data sheet, instructions, checklist,
// cover sheet) is built from the same primitives so they share one look.
export class PdfWriter {
  doc: PDFDocument
  regular!: PDFFont
  bold!: PDFFont
  page!: PDFPage
  y = 0
  documentTitle: string

  private constructor(doc: PDFDocument, documentTitle: string) {
    this.doc = doc
    this.documentTitle = documentTitle
  }

  static async create(documentTitle: string) {
    const doc = await PDFDocument.create()
    doc.setTitle(documentTitle)
    doc.setProducer('Smart USA Visa')
    doc.setAuthor('Smart USA Visa')
    const writer = new PdfWriter(doc, documentTitle)
    writer.regular = await doc.embedFont(StandardFonts.Helvetica)
    writer.bold = await doc.embedFont(StandardFonts.HelveticaBold)
    writer.addPage()
    return writer
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN
    // header rule + doc title, footer page number added at export time
    this.page.drawText(this.documentTitle, { x: MARGIN, y: PAGE_HEIGHT - 32, size: 8, font: this.bold, color: MUTED })
    this.page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 40 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 40 }, thickness: 0.5, color: MUTED })
    this.y = PAGE_HEIGHT - 64
  }

  private ensureSpace(height: number) {
    if (this.y - height < MARGIN + 20) this.addPage()
  }

  heading(text: string) {
    this.ensureSpace(28)
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 20, font: this.bold, color: BRAND })
    this.y -= 30
  }

  subheading(text: string) {
    this.ensureSpace(20)
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 13, font: this.bold, color: INK })
    this.y -= 20
  }

  paragraph(text: string, opts: { size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const size = opts.size ?? 10.5
    const color = opts.color ?? INK
    const lines = wrapText(text, this.regular, size, CONTENT_WIDTH)
    for (const line of lines) {
      this.ensureSpace(size + 6)
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.regular, color })
      this.y -= size + 6
    }
    this.y -= 4
  }

  keyValue(label: string, value: string) {
    const size = 10
    this.ensureSpace(size + 8)
    this.page.drawText(label, { x: MARGIN, y: this.y, size, font: this.bold, color: MUTED })
    const lines = wrapText(value || '—', this.regular, size, CONTENT_WIDTH - 210)
    this.page.drawText(lines[0] ?? '—', { x: MARGIN + 210, y: this.y, size, font: this.regular, color: INK })
    this.y -= size + 8
    for (const extra of lines.slice(1)) {
      this.ensureSpace(size + 4)
      this.page.drawText(extra, { x: MARGIN + 210, y: this.y, size, font: this.regular, color: INK })
      this.y -= size + 4
    }
  }

  bullet(text: string, checked?: boolean) {
    const size = 10.5
    const marker = checked === undefined ? '•' : checked ? '[x]' : '[ ]'
    const lines = wrapText(text, this.regular, size, CONTENT_WIDTH - 24)
    this.ensureSpace(size + 6)
    this.page.drawText(marker, { x: MARGIN, y: this.y, size, font: this.bold, color: BRAND })
    this.page.drawText(lines[0] ?? '', { x: MARGIN + 22, y: this.y, size, font: this.regular, color: INK })
    this.y -= size + 6
    for (const extra of lines.slice(1)) {
      this.ensureSpace(size + 4)
      this.page.drawText(extra, { x: MARGIN + 22, y: this.y, size, font: this.regular, color: INK })
      this.y -= size + 4
    }
  }

  spacer(height = 10) {
    this.y -= height
  }

  async bytes(): Promise<Uint8Array> {
    const pages = this.doc.getPages()
    pages.forEach((p, i) => {
      p.drawText(`Page ${i + 1} of ${pages.length} — Smart USA Visa`, { x: MARGIN, y: 28, size: 8, font: this.regular, color: MUTED })
      p.drawText('Not a U.S. government document.', { x: PAGE_WIDTH - MARGIN - 130, y: 28, size: 8, font: this.regular, color: MUTED })
    })
    return this.doc.save()
  }
}

export async function mergePdfs(buffers: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const bytes of buffers) {
    const src = await PDFDocument.load(bytes)
    const pages = await merged.copyPages(src, src.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }
  return merged.save()
}
