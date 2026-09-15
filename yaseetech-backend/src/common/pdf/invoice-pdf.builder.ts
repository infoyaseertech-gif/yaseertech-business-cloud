import { PDFDocument } from 'pdf-lib';
import { embedBrandFonts, ngn, PDF_COLORS } from './pdf-theme';
import { PdfCursor } from './pdf-cursor';

export interface InvoicePdfItem {
  description: string;
  quantity: number;
  unitPriceNgn: number;
  lineTotalNgn: number;
}
export interface InvoicePdfData {
  businessName: string;
  businessAddress: string | null;
  branchName: string;
  invoiceNumber: string;
  status: string;
  issueDate: string | Date;
  dueDate: string | Date;
  customerName: string;
  customerAddress: string | null;
  items: InvoicePdfItem[];
  subtotalNgn: number;
  taxNgn: number;
  totalNgn: number;
  amountPaidNgn: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;

// v1 simplification: no pagination -- a very long invoice runs off the
// bottom rather than flowing to page 2. Fine for typical SME invoices.
export async function buildInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedBrandFonts(pdfDoc);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const cursor = new PdfCursor(page, MARGIN, PAGE_HEIGHT - MARGIN);

  const headerTopY = cursor.y;
  cursor.text(data.businessName, { font: fonts.serifBold, size: 18, color: PDF_COLORS.indigo });
  cursor.moveDown(20);
  if (data.businessAddress) {
    cursor.text(data.businessAddress, { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft });
    cursor.moveDown(14);
  }
  cursor.text(data.branchName, { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft });

  page.drawText('INVOICE', {
    x: CONTENT_RIGHT - fonts.serifBold.widthOfTextAtSize('INVOICE', 20),
    y: headerTopY,
    font: fonts.serifBold,
    size: 20,
    color: PDF_COLORS.ink,
  });
  const rightCursor = new PdfCursor(page, MARGIN, headerTopY - 26);
  rightCursor.rightAlignedText(data.invoiceNumber, { font: fonts.mono, size: 10, color: PDF_COLORS.inkSoft }, CONTENT_RIGHT);
  rightCursor.moveDown(16);
  rightCursor.rightAlignedText(data.status.toUpperCase().replace('_', ' '), { font: fonts.monoBold, size: 9, color: PDF_COLORS.gold }, CONTENT_RIGHT);

  cursor.moveDown(36);
  cursor.hLine(CONTENT_RIGHT, PDF_COLORS.border, 1);
  cursor.moveDown(28);

  const blockTopY = cursor.y;
  cursor.text('BILL TO', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft });
  cursor.moveDown(14);
  cursor.text(data.customerName, { font: fonts.serifBold, size: 12, color: PDF_COLORS.ink });
  if (data.customerAddress) {
    cursor.moveDown(15);
    cursor.text(data.customerAddress, { font: fonts.mono, size: 9, color: PDF_COLORS.inkSoft });
  }

  const datesCursor = new PdfCursor(page, MARGIN, blockTopY);
  const dateLabelX = CONTENT_RIGHT - 160;
  datesCursor.text('Issue date', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft }, dateLabelX);
  datesCursor.rightAlignedText(formatDate(data.issueDate), { font: fonts.mono, size: 9, color: PDF_COLORS.ink }, CONTENT_RIGHT);
  datesCursor.moveDown(16);
  datesCursor.text('Due date', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft }, dateLabelX);
  datesCursor.rightAlignedText(formatDate(data.dueDate), { font: fonts.mono, size: 9, color: PDF_COLORS.ink }, CONTENT_RIGHT);

  cursor.moveDown(50);

  const colDescX = MARGIN;
  const colQtyRight = CONTENT_RIGHT - 180;
  const colPriceRight = CONTENT_RIGHT - 90;
  const colTotalRight = CONTENT_RIGHT;

  cursor.text('DESCRIPTION', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft }, colDescX);
  cursor.rightAlignedText('QTY', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft }, colQtyRight);
  cursor.rightAlignedText('PRICE', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft }, colPriceRight);
  cursor.rightAlignedText('AMOUNT', { font: fonts.mono, size: 8, color: PDF_COLORS.inkSoft }, colTotalRight);
  cursor.moveDown(10);
  cursor.hLine(CONTENT_RIGHT, PDF_COLORS.border, 1);
  cursor.moveDown(22);

  for (const item of data.items) {
    cursor.text(item.description, { font: fonts.mono, size: 9.5, color: PDF_COLORS.ink }, colDescX);
    cursor.rightAlignedText(String(item.quantity), { font: fonts.mono, size: 9.5, color: PDF_COLORS.ink }, colQtyRight);
    cursor.rightAlignedText(ngn(item.unitPriceNgn), { font: fonts.mono, size: 9.5, color: PDF_COLORS.ink }, colPriceRight);
    cursor.rightAlignedText(ngn(item.lineTotalNgn), { font: fonts.mono, size: 9.5, color: PDF_COLORS.ink }, colTotalRight);
    cursor.moveDown(22);
    cursor.dashedHLine(CONTENT_RIGHT);
    cursor.moveDown(16);
  }

  cursor.moveDown(10);

  const totalsLabelX = CONTENT_RIGHT - 180;
  cursor.text('Subtotal', { font: fonts.mono, size: 9.5, color: PDF_COLORS.inkSoft }, totalsLabelX);
  cursor.rightAlignedText(ngn(data.subtotalNgn), { font: fonts.mono, size: 9.5, color: PDF_COLORS.ink }, CONTENT_RIGHT);
  cursor.moveDown(18);

  if (data.taxNgn > 0) {
    cursor.text('Tax', { font: fonts.mono, size: 9.5, color: PDF_COLORS.inkSoft }, totalsLabelX);
    cursor.rightAlignedText(ngn(data.taxNgn), { font: fonts.mono, size: 9.5, color: PDF_COLORS.ink }, CONTENT_RIGHT);
    cursor.moveDown(18);
  }

  cursor.text('TOTAL', { font: fonts.monoBold, size: 12, color: PDF_COLORS.indigo }, totalsLabelX);
  cursor.rightAlignedText(ngn(data.totalNgn), { font: fonts.monoBold, size: 12, color: PDF_COLORS.indigo }, CONTENT_RIGHT);
  cursor.moveDown(20);

  if (data.amountPaidNgn > 0) {
    cursor.text('Amount paid', { font: fonts.mono, size: 9.5, color: PDF_COLORS.inkSoft }, totalsLabelX);
    cursor.rightAlignedText(ngn(data.amountPaidNgn), { font: fonts.mono, size: 9.5, color: PDF_COLORS.inkSoft }, CONTENT_RIGHT);
    cursor.moveDown(18);
    const balance = data.totalNgn - data.amountPaidNgn;
    cursor.text('Balance due', { font: fonts.monoBold, size: 10, color: PDF_COLORS.gold }, totalsLabelX);
    cursor.rightAlignedText(ngn(balance), { font: fonts.monoBold, size: 10, color: PDF_COLORS.gold }, CONTENT_RIGHT);
  }

  return pdfDoc.save();
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}
