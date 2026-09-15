import { PDFDocument } from 'pdf-lib';
import { embedBrandFonts, ngn, PDF_COLORS } from './pdf-theme';
import { PdfCursor } from './pdf-cursor';

export interface ReceiptPdfItem {
  name: string;
  quantity: number;
  unitPriceNgn: number;
  lineTotalNgn: number;
}
export interface ReceiptPdfPayment {
  method: string;
  amountNgn: number;
}
export interface ReceiptPdfData {
  businessName: string;
  branchName: string;
  transactionNumber: string;
  occurredAt: string | Date;
  cashierName: string;
  items: ReceiptPdfItem[];
  subtotalNgn: number;
  taxNgn: number;
  totalNgn: number;
  payments: ReceiptPdfPayment[];
}

const PAGE_WIDTH = 280;
const MARGIN = 20;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;

export async function buildReceiptPdf(data: ReceiptPdfData): Promise<Uint8Array> {
  const lineHeight = 16;
  const estimatedHeight =
    150 + data.items.length * lineHeight + 40 + data.payments.length * lineHeight + 60;

  const pdfDoc = await PDFDocument.create();
  const fonts = await embedBrandFonts(pdfDoc);
  const page = pdfDoc.addPage([PAGE_WIDTH, estimatedHeight]);
  const cursor = new PdfCursor(page, MARGIN, estimatedHeight - MARGIN);

  cursor.text(data.businessName, { font: fonts.serifBold, size: 13, color: PDF_COLORS.indigo });
  cursor.moveDown(18);
  cursor.text('RECEIPT', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft });
  cursor.rightAlignedText(data.transactionNumber, { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft }, CONTENT_RIGHT);
  cursor.moveDown(14);

  const occurredAt = new Date(data.occurredAt);
  cursor.text(occurredAt.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }), { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft });
  cursor.moveDown(13);
  cursor.text(`${data.branchName} \u00b7 ${data.cashierName}`, { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft });
  cursor.moveDown(16);
  cursor.dashedHLine(CONTENT_RIGHT);
  cursor.moveDown(16);

  for (const item of data.items) {
    const qtyLabel = item.quantity !== 1 ? ` \u00d7${item.quantity}` : '';
    cursor.text(`${item.name}${qtyLabel}`, { font: fonts.mono, size: 9, color: PDF_COLORS.ink });
    cursor.rightAlignedText(ngn(item.lineTotalNgn), { font: fonts.mono, size: 9, color: PDF_COLORS.ink }, CONTENT_RIGHT);
    cursor.moveDown(lineHeight);
  }

  cursor.dashedHLine(CONTENT_RIGHT);
  cursor.moveDown(16);

  if (data.taxNgn > 0) {
    cursor.text('Subtotal', { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft });
    cursor.rightAlignedText(ngn(data.subtotalNgn), { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft }, CONTENT_RIGHT);
    cursor.moveDown(14);
    cursor.text('Tax', { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft });
    cursor.rightAlignedText(ngn(data.taxNgn), { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft }, CONTENT_RIGHT);
    cursor.moveDown(16);
  }
  cursor.text('TOTAL', { font: fonts.monoBold, size: 11, color: PDF_COLORS.indigo });
  cursor.rightAlignedText(ngn(data.totalNgn), { font: fonts.monoBold, size: 11, color: PDF_COLORS.indigo }, CONTENT_RIGHT);
  cursor.moveDown(20);

  for (const payment of data.payments) {
    const label = payment.method.charAt(0).toUpperCase() + payment.method.slice(1);
    cursor.text(label, { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft });
    cursor.rightAlignedText(ngn(payment.amountNgn), { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft }, CONTENT_RIGHT);
    cursor.moveDown(lineHeight);
  }

  cursor.moveDown(16);
  cursor.text('Thank you for your business.', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft });

  return pdfDoc.save();
}
