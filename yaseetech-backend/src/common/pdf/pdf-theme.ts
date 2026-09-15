import * as fs from 'fs';
import * as path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, rgb } from 'pdf-lib';

// pdf-lib's 14 standard fonts (Helvetica, Times, etc.) are WinAnsi-only and
// cannot render the Naira sign (U+20A6). IBM Plex Mono/Serif are embedded
// instead -- verified via fonttools to contain the ₦ glyph -- so every
// amount on a receipt or invoice renders correctly rather than falling back
// to a tofu box or a literal "NGN" prefix.
const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

export const PDF_COLORS = {
  ink: rgb(0.11, 0.11, 0.15),
  inkSoft: rgb(0.42, 0.42, 0.48),
  indigo: rgb(0.20, 0.19, 0.45),
  gold: rgb(0.62, 0.47, 0.09),
  border: rgb(0.85, 0.84, 0.82),
};

export interface BrandFonts {
  mono: PDFFont;
  monoBold: PDFFont;
  serif: PDFFont;
  serifBold: PDFFont;
}

/**
 * Formats a naira amount for PDF text runs: thousands separators, 2 decimal
 * places, and the ₦ glyph itself (safe only because the caller is using one
 * of the embedded brand fonts above -- never a pdf-lib standard font).
 */
export function ngn(amountNgn: number): string {
  const formatted = amountNgn.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `\u20a6${formatted}`;
}

export async function embedBrandFonts(pdfDoc: PDFDocument): Promise<BrandFonts> {
  pdfDoc.registerFontkit(fontkit);

  const [monoBytes, monoBoldBytes, serifBytes, serifBoldBytes] = await Promise.all([
    fs.promises.readFile(path.join(FONTS_DIR, 'IBMPlexMono-Regular.ttf')),
    fs.promises.readFile(path.join(FONTS_DIR, 'IBMPlexMono-Bold.ttf')),
    fs.promises.readFile(path.join(FONTS_DIR, 'IBMPlexSerif-Regular.ttf')),
    fs.promises.readFile(path.join(FONTS_DIR, 'IBMPlexSerif-Bold.ttf')),
  ]);

  const [mono, monoBold, serif, serifBold] = await Promise.all([
    pdfDoc.embedFont(monoBytes, { subset: true }),
    pdfDoc.embedFont(monoBoldBytes, { subset: true }),
    pdfDoc.embedFont(serifBytes, { subset: true }),
    pdfDoc.embedFont(serifBoldBytes, { subset: true }),
  ]);

  return { mono, monoBold, serif, serifBold };
}
