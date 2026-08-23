import { parse } from 'csv-parse/sync';

export interface ParsedImportRow {
  rowNumber: number; // matches the row number a person would see in Excel/Sheets (header = row 1)
  sku: string;
  name: string;
  category: string | null;
  costPriceNgn: number;
  sellingPriceNgn: number;
  unitOfMeasure: string;
  barcode: string | null;
  initialQuantity: number;
}

export interface InvalidImportRow {
  rowNumber: number;
  errors: string[];
  raw: Record<string, string>;
}

export interface ImportValidationResult {
  validRows: ParsedImportRow[];
  invalidRows: InvalidImportRow[];
  duplicateSkusInFile: string[];
  duplicateSkusInDb: string[];
}

const EXPECTED_HEADERS = [
  'sku',
  'name',
  'category',
  'cost_price_ngn',
  'selling_price_ngn',
  'unit_of_measure',
  'barcode',
  'initial_quantity',
];

/**
 * Parses and validates a product-import CSV against the given set of SKUs
 * that already exist in this tenant's catalog. Never touches the
 * database itself -- this is pure validation logic, called identically by
 * both /products/import/preview (report only) and /products/import/commit
 * (re-validated server-side before writing, never trusting whatever the
 * client claims was previewed).
 *
 * Per Phase 0's risk register (item 7: "Bulk CSV import corrupts existing
 * inventory"): every row is validated individually, duplicate SKUs
 * (within the file and against the existing catalog) are caught and
 * reported by row number, and nothing here writes to the database --
 * that's the caller's job, and only for rows that pass validation.
 */
export function parseAndValidateImportCsv(
  csvContent: string,
  existingSkusLowercase: Set<string>,
): ImportValidationResult {
  let records: Record<string, string>[];
  try {
    records = parse(csvContent, {
      columns: (headerRow: string[]) => headerRow.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    // A malformed CSV (bad quoting, wrong delimiter) fails all at once,
    // rather than partially -- there's no sensible per-row validation to
    // do on a file csv-parse couldn't even tokenize.
    return {
      validRows: [],
      invalidRows: [
        {
          rowNumber: 0,
          errors: [`Could not parse this file as CSV: ${err instanceof Error ? err.message : String(err)}`],
          raw: {},
        },
      ],
      duplicateSkusInFile: [],
      duplicateSkusInDb: [],
    };
  }

  const validRows: ParsedImportRow[] = [];
  const invalidRows: InvalidImportRow[] = [];
  const seenSkusInFile = new Map<string, number>(); // lowercase sku -> first row number seen
  const duplicateSkusInFile = new Set<string>();
  const duplicateSkusInDb = new Set<string>();

  records.forEach((record, index) => {
    const rowNumber = index + 2; // +1 for 0-index, +1 because row 1 is the header
    const errors: string[] = [];

    const sku = (record.sku ?? '').trim();
    const name = (record.name ?? '').trim();
    const category = (record.category ?? '').trim() || null;
    const unitOfMeasure = (record.unit_of_measure ?? '').trim() || 'unit';
    const barcode = (record.barcode ?? '').trim() || null;

    if (!sku) errors.push('SKU is required.');
    if (!name) errors.push('Product name is required.');

    const costPriceNgn = parseFloat(record.cost_price_ngn ?? '');
    if (!record.cost_price_ngn || isNaN(costPriceNgn) || costPriceNgn < 0) {
      errors.push('Cost price must be a non-negative number.');
    }

    const sellingPriceNgn = parseFloat(record.selling_price_ngn ?? '');
    if (!record.selling_price_ngn || isNaN(sellingPriceNgn) || sellingPriceNgn < 0) {
      errors.push('Selling price must be a non-negative number.');
    }

    let initialQuantity = 0;
    const rawQuantity = (record.initial_quantity ?? '').trim();
    if (rawQuantity) {
      initialQuantity = parseFloat(rawQuantity);
      if (isNaN(initialQuantity) || initialQuantity < 0) {
        errors.push('Initial quantity, if given, must be a non-negative number.');
      }
    }

    if (sku) {
      const skuLower = sku.toLowerCase();
      if (seenSkusInFile.has(skuLower)) {
        errors.push(`Duplicate SKU within this file (also on row ${seenSkusInFile.get(skuLower)}).`);
        duplicateSkusInFile.add(sku);
      } else {
        seenSkusInFile.set(skuLower, rowNumber);
      }

      if (existingSkusLowercase.has(skuLower)) {
        errors.push('This SKU already exists in your product catalog.');
        duplicateSkusInDb.add(sku);
      }
    }

    if (errors.length > 0) {
      invalidRows.push({ rowNumber, errors, raw: record });
    } else {
      validRows.push({
        rowNumber,
        sku,
        name,
        category,
        costPriceNgn,
        sellingPriceNgn,
        unitOfMeasure,
        barcode,
        initialQuantity,
      });
    }
  });

  return {
    validRows,
    invalidRows,
    duplicateSkusInFile: [...duplicateSkusInFile],
    duplicateSkusInDb: [...duplicateSkusInDb],
  };
}

export const IMPORT_CSV_TEMPLATE_HEADERS = EXPECTED_HEADERS;
