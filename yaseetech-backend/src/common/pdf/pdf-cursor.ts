import { PDFFont, PDFPage, rgb } from 'pdf-lib';
import { PDF_COLORS } from './pdf-theme';

interface TextOptions {
  font: PDFFont;
  size: number;
  color?: ReturnType<typeof rgb>;
}

export class PdfCursor {
  y: number;
  constructor(
    private readonly page: PDFPage,
    private readonly marginX: number,
    startY: number,
  ) {
    this.y = startY;
  }

  text(str: string, opts: TextOptions, x?: number): void {
    this.page.drawText(str, {
      x: x ?? this.marginX,
      y: this.y,
      font: opts.font,
      size: opts.size,
      color: opts.color ?? PDF_COLORS.ink,
    });
  }

  rightAlignedText(str: string, opts: TextOptions, rightX: number): void {
    const width = opts.font.widthOfTextAtSize(str, opts.size);
    this.text(str, opts, rightX - width);
  }

  moveDown(amount: number): void {
    this.y -= amount;
  }

  hLine(rightX: number, color = PDF_COLORS.border, thickness = 0.75): void {
    this.page.drawLine({
      start: { x: this.marginX, y: this.y },
      end: { x: rightX, y: this.y },
      thickness,
      color,
    });
  }

  dashedHLine(rightX: number, color = PDF_COLORS.border, dash = 3, gap = 2): void {
    let x = this.marginX;
    while (x < rightX) {
      const segmentEnd = Math.min(x + dash, rightX);
      this.page.drawLine({
        start: { x, y: this.y },
        end: { x: segmentEnd, y: this.y },
        thickness: 0.75,
        color,
      });
      x = segmentEnd + gap;
    }
  }
}
