/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — CANONICAL CLIENT-SIDE OPENXML XLSX GENERATOR
 * ============================================================================
 * Generates genuine, fully compliant Microsoft Excel OpenXML (.xlsx) binary
 * workbooks directly in standard browser & Node.js environments.
 *
 * Guaranteed Invariants:
 * 1. Output begins with standard PKZIP local header signature 0x04034b50 (PK\x03\x04).
 * 2. Structure complies with ECMA-376 / ISO 29500 Open Packaging Conventions:
 *    - [Content_Types].xml
 *    - _rels/.rels
 *    - xl/_rels/workbook.xml.rels
 *    - xl/workbook.xml
 *    - xl/styles.xml
 *    - xl/sharedStrings.xml
 *    - xl/worksheets/sheet1.xml (Corporate Report Metadata)
 *    - xl/worksheets/sheet2.xml (Authoritative Tabular Data)
 * 3. CWE-1236 / DDE Spreadsheet Formula Injection Defense:
 *    Any cell string starting with =, +, -, @, \t, \r, \n, or Unicode equivalents
 *    is neutralized with a leading single quote (') in the shared string table.
 * 4. Numeric & currency cells are emitted as genuine OpenXML numeric values (<c t="n">).
 * 5. ZERO CSV text is ever passed as an XLSX blob.
 * ============================================================================
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function calculateCrc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function xmlEscape(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getColumnLetter(colIndex) {
  let temp = colIndex + 1;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

/**
 * Native Pure-JS PKZIP Builder supporting Stored (Method 0) entries.
 * Universally supported by Microsoft Excel, Apple Numbers, Google Sheets, LibreOffice.
 */
class OpenXmlZipBuilder {
  constructor() {
    this.entries = [];
    this.encoder = new TextEncoder();
  }

  addFile(name, content) {
    const data = typeof content === 'string'
      ? this.encoder.encode(content)
      : (content instanceof Uint8Array ? content : new Uint8Array(content));

    const nameBytes = this.encoder.encode(name);
    const crc = calculateCrc32(data);

    this.entries.push({
      name,
      nameBytes,
      data,
      size: data.length,
      crc,
    });
  }

  buildUint8Array() {
    let totalLocalHeadersSize = 0;
    let centralDirSize = 0;

    for (const entry of this.entries) {
      // Local header: 30 bytes + name length + data size
      totalLocalHeadersSize += 30 + entry.nameBytes.length + entry.size;
      // Central directory header: 46 bytes + name length
      centralDirSize += 46 + entry.nameBytes.length;
    }

    // End of central directory record: 22 bytes
    const totalSize = totalLocalHeadersSize + centralDirSize + 22;
    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

    let offset = 0;
    const localOffsets = [];

    // 1. Write Local Headers & File Data
    for (const entry of this.entries) {
      localOffsets.push(offset);

      // Local file header signature (0x04034b50)
      view.setUint32(offset, 0x04034b50, true);
      view.setUint16(offset + 4, 20, true);       // Version needed: 2.0
      view.setUint16(offset + 6, 0x0800, true);   // UTF-8 flag (bit 11)
      view.setUint16(offset + 8, 0, true);        // Compression: 0 (Stored)
      view.setUint16(offset + 10, 0, true);       // Mod time
      view.setUint16(offset + 12, 0, true);       // Mod date
      view.setUint32(offset + 14, entry.crc, true);        // CRC-32
      view.setUint32(offset + 18, entry.size, true);       // Compressed size
      view.setUint32(offset + 22, entry.size, true);       // Uncompressed size
      view.setUint16(offset + 26, entry.nameBytes.length, true); // Name length
      view.setUint16(offset + 28, 0, true);                // Extra field length

      offset += 30;
      output.set(entry.nameBytes, offset);
      offset += entry.nameBytes.length;

      output.set(entry.data, offset);
      offset += entry.size;
    }

    const centralDirOffset = offset;

    // 2. Write Central Directory
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const localOffset = localOffsets[i];

      // Central directory file header signature (0x02014b50)
      view.setUint32(offset, 0x02014b50, true);
      view.setUint16(offset + 4, 20, true);      // Version made by: 2.0
      view.setUint16(offset + 6, 20, true);      // Version needed: 2.0
      view.setUint16(offset + 8, 0x0800, true);  // UTF-8 flag
      view.setUint16(offset + 10, 0, true);      // Compression: 0 (Stored)
      view.setUint16(offset + 12, 0, true);      // Mod time
      view.setUint16(offset + 14, 0, true);      // Mod date
      view.setUint32(offset + 16, entry.crc, true);        // CRC-32
      view.setUint32(offset + 20, entry.size, true);       // Compressed size
      view.setUint32(offset + 24, entry.size, true);       // Uncompressed size
      view.setUint16(offset + 28, entry.nameBytes.length, true); // Name length
      view.setUint16(offset + 30, 0, true);                // Extra length
      view.setUint16(offset + 32, 0, true);                // Comment length
      view.setUint16(offset + 34, 0, true);                // Disk start
      view.setUint16(offset + 36, 0, true);                // Internal attr
      view.setUint32(offset + 38, 0, true);                // External attr
      view.setUint32(offset + 42, localOffset, true);      // Local header offset

      offset += 46;
      output.set(entry.nameBytes, offset);
      offset += entry.nameBytes.length;
    }

    // 3. Write End of Central Directory Record (0x06054b50)
    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 4, 0, true);                  // Disk number
    view.setUint16(offset + 6, 0, true);                  // Start disk
    view.setUint16(offset + 8, this.entries.length, true);  // Total entries on disk
    view.setUint16(offset + 10, this.entries.length, true); // Total entries
    view.setUint32(offset + 12, centralDirSize, true);     // Central dir size
    view.setUint32(offset + 16, centralDirOffset, true);   // Central dir offset
    view.setUint16(offset + 20, 0, true);                 // Comment length

    return output;
  }
}

/**
 * Builds a complete OpenXML Workbook (.xlsx) as a binary Uint8Array.
 */
export function buildOpenXmlWorkbook({
  sheetName = 'Data',
  reportTitle = 'Report',
  columns = [],
  rows = [],
  metadata = {},
}) {
  const zip = new OpenXmlZipBuilder();

  // Shared Strings Table with Formula Neutralization
  const sharedStrings = [];
  const stringMap = new Map();

  function getSharedStringId(value) {
    let str = String(value ?? '');
    // CWE-1236 Defense: Neutralize spreadsheet formula injection characters
    if (/^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/.test(str)) {
      str = `'${str}`;
    }
    if (stringMap.has(str)) return stringMap.get(str);
    const id = sharedStrings.length;
    sharedStrings.push(str);
    stringMap.set(str, id);
    return id;
  }

  // Generate Run ID
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  const runId = metadata.runId || `RPT-RUN-${d}-${rand}`;

  // 1. Sheet 1: Report Metadata
  const metadataItems = [
    { prop: 'Document Title', val: reportTitle },
    { prop: 'Run ID', val: runId },
    { prop: 'Company Legal Name', val: metadata.legalName || 'Zamorin Speciality Coffee & Kitchens Pvt. Ltd.' },
    { prop: 'Company GSTIN', val: metadata.gstin || '32AAACZ1234K1Z5' },
    { prop: 'Export Timestamp (UTC)', val: new Date().toISOString() },
    { prop: 'Scope / Filter', val: metadata.scope || 'All Active Records' },
    { prop: 'Security Classification', val: 'CONFIDENTIAL CORPORATE REPORT' },
    { prop: 'Total Records Exported', val: String(rows.length) },
  ];

  let metaSheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView tabSelected="0" workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="30" customWidth="1"/>
    <col min="2" max="2" width="55" customWidth="1"/>
  </cols>
  <sheetData>
    <row r="1" spans="1:2">
      <c r="A1" t="s" s="1"><v>${getSharedStringId('Report Property')}</v></c>
      <c r="B1" t="s" s="1"><v>${getSharedStringId('Value / Configuration')}</v></c>
    </row>`;

  metadataItems.forEach((item, idx) => {
    const rowNum = idx + 2;
    metaSheetXml += `
    <row r="${rowNum}" spans="1:2">
      <c r="A${rowNum}" t="s" s="2"><v>${getSharedStringId(item.prop)}</v></c>
      <c r="B${rowNum}" t="s"><v>${getSharedStringId(item.val)}</v></c>
    </row>`;
  });
  metaSheetXml += `\n  </sheetData>\n</worksheet>`;

  // 2. Sheet 2: Authoritative Tabular Data
  const cleanCols = columns.map((col, idx) => ({
    key: typeof col === 'string' ? col : (col.key || col.field || `col_${idx}`),
    label: typeof col === 'string' ? col : (col.label || col.header || col.key || `Col ${idx + 1}`),
    type: typeof col === 'object' ? (col.type || 'auto') : 'auto',
  }));

  let dataSheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>`;

  cleanCols.forEach((_, idx) => {
    dataSheetXml += `\n    <col min="${idx + 1}" max="${idx + 1}" width="22" customWidth="1"/>`;
  });
  dataSheetXml += `\n  </cols>\n  <sheetData>`;

  // Header Row
  dataSheetXml += `\n    <row r="1" spans="1:${cleanCols.length}">`;
  cleanCols.forEach((col, colIdx) => {
    const cellRef = `${getColumnLetter(colIdx)}1`;
    dataSheetXml += `<c r="${cellRef}" t="s" s="1"><v>${getSharedStringId(col.label)}</v></c>`;
  });
  dataSheetXml += `</row>`;

  // Data Rows
  rows.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 2;
    dataSheetXml += `\n    <row r="${rowNum}" spans="1:${cleanCols.length}">`;

    cleanCols.forEach((col, colIdx) => {
      const cellRef = `${getColumnLetter(colIdx)}${rowNum}`;
      const rawVal = row ? row[col.key] : null;

      if (rawVal === null || rawVal === undefined || rawVal === '') {
        // Empty cell
        return;
      }

      // Check if numeric
      const isExplicitNumber = col.type === 'number' || col.type === 'currency' || col.type === 'numeric';
      const isAutoNumeric = col.type === 'auto' && typeof rawVal === 'number' && !isNaN(rawVal);
      const isStringNumeric = col.type === 'auto' && typeof rawVal === 'string' && /^-?\d+(\.\d+)?$/.test(rawVal.trim());

      if (isExplicitNumber || isAutoNumeric || isStringNumeric) {
        const numVal = Number(rawVal);
        if (!isNaN(numVal)) {
          const styleId = (col.type === 'currency') ? '3' : '0';
          dataSheetXml += `<c r="${cellRef}" t="n" s="${styleId}"><v>${numVal}</v></c>`;
          return;
        }
      }

      // String cell via Shared Strings
      const sId = getSharedStringId(String(rawVal));
      dataSheetXml += `<c r="${cellRef}" t="s"><v>${sId}</v></c>`;
    });

    dataSheetXml += `</row>`;
  });

  dataSheetXml += `\n  </sheetData>\n</worksheet>`;

  // 3. Shared Strings Table XML
  let sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">`;
  for (const s of sharedStrings) {
    sharedStringsXml += `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`;
  }
  sharedStringsXml += `</sst>`;

  // 4. Styles XML (Header bold, borders, currency format)
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="&#x22;&#x20B9;&#x22;#,##0.00"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="10"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <font><b/><sz val="10"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`;

  // 5. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStringTable+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  // 6. Relationships
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // 7. Workbook XML
  const cleanSheetName = (sheetName || 'Data').replace(/[\\/*?:[\]]/g, '').slice(0, 31);
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Report Information" sheetId="1" r:id="rId1"/>
    <sheet name="${xmlEscape(cleanSheetName)}" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

  // Assemble ZIP package
  zip.addFile('[Content_Types].xml', contentTypesXml);
  zip.addFile('_rels/.rels', rootRelsXml);
  zip.addFile('xl/_rels/workbook.xml.rels', wbRelsXml);
  zip.addFile('xl/workbook.xml', wbXml);
  zip.addFile('xl/styles.xml', stylesXml);
  zip.addFile('xl/sharedStrings.xml', sharedStringsXml);
  zip.addFile('xl/worksheets/sheet1.xml', metaSheetXml);
  zip.addFile('xl/worksheets/sheet2.xml', dataSheetXml);

  return zip.buildUint8Array();
}

/**
 * Downloads a genuine OpenXML XLSX workbook in the browser.
 */
export function exportToXlsx({
  filename = 'Zamorin_Export.xlsx',
  sheetName = 'Data',
  reportTitle = 'Zamorin Café ERP Export',
  columns = [],
  rows = [],
  metadata = {},
} = {}) {
  const bytes = buildOpenXmlWorkbook({
    sheetName,
    reportTitle,
    columns,
    rows,
    metadata,
  });

  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;

  if (typeof window !== 'undefined' && window.document) {
    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = cleanFilename;
    window.document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      window.URL.revokeObjectURL(url);
    }, 1000);
  }

  return blob;
}

export { buildOpenXmlWorkbook as buildOpenXmlXlsxBinary };
