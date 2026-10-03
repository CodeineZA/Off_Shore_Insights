// The Excel writer: sheets in, an .xlsx out. exceljs is large, so it is imported only when someone asks for the file.
import type { Sheet } from './reportsheets';

export async function buildWorkbook(sheets: Sheet[], title: string): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Off_Shore_Insights'; wb.title = title; wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }));
    s.rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FF1D1610' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3DCB2' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 30;
    ws.eachRow((row, n) => { if (n > 1) row.alignment = { vertical: 'top', wrapText: true }; });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
