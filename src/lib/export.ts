import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export type ExportFormat = 'pdf' | 'excel' | 'csv';

export interface ExportColumn {
  header: string;
  key: string;
}

export function exportData(
  format: ExportFormat,
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, any>[],
  title?: string,
) {
  if (format === 'pdf') {
    exportPDF(filename, columns, rows, title);
  } else if (format === 'excel') {
    exportExcel(filename, columns, rows);
  } else {
    exportCSV(filename, columns, rows);
  }
}

function exportPDF(filename: string, columns: ExportColumn[], rows: Record<string, any>[], title?: string) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title ?? filename, pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, 22, { align: 'center' });

  autoTable(doc, {
    startY: 28,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ''))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 10, right: 10 },
  });

  doc.save(`${filename}.pdf`);
}

function exportExcel(filename: string, columns: ExportColumn[], rows: Record<string, any>[]) {
  const data = rows.map((r) => {
    const obj: Record<string, any> = {};
    for (const c of columns) {
      obj[c.header] = r[c.key] ?? '';
    }
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function exportCSV(filename: string, columns: ExportColumn[], rows: Record<string, any>[]) {
  const headers = columns.map((c) => c.header).join(',');
  const lines = rows.map((r) =>
    columns
      .map((c) => {
        const val = String(r[c.key] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      })
      .join(','),
  );
  const csv = [headers, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Grouped exports (thickness + color headline, sizes listed below) ──

export interface ExportGroup {
  label: string;
  rows: Record<string, any>[];
}

export function exportGroupedData(
  format: 'pdf' | 'excel',
  filename: string,
  columns: ExportColumn[],
  groups: ExportGroup[],
  title?: string,
) {
  if (format === 'pdf') {
    exportGroupedPDF(filename, columns, groups, title);
  } else {
    exportGroupedExcel(filename, columns, groups);
  }
}

function exportGroupedPDF(
  filename: string,
  columns: ExportColumn[],
  groups: ExportGroup[],
  title?: string,
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title ?? filename, pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, 21, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  let startY = 28;

  for (const group of groups) {
    if (group.rows.length === 0) continue;

    if (startY > pageHeight - 30) {
      doc.addPage();
      startY = 20;
    }

    // Group header bar
    doc.setFillColor(37, 99, 235);
    doc.rect(margin, startY - 1, pageWidth - margin * 2, 7, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(group.label, margin + 2, startY + 3.5);
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: startY + 6,
      head: [columns.map((c) => c.header)],
      body: group.rows.map((r) => columns.map((c) => String(r[c.key] ?? ''))),
      styles: { fontSize: 8, cellPadding: 2, cellWidth: 'auto' },
      headStyles: { fillColor: [240, 242, 245], textColor: 40, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      rowPageBreak: 'avoid',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startY = (doc as any).lastAutoTable.finalY + 5;
  }

  doc.save(`${filename}.pdf`);
}

function exportGroupedExcel(
  filename: string,
  columns: ExportColumn[],
  groups: ExportGroup[],
) {
  const aoa: (string | number)[][] = [];

  for (const group of groups) {
    if (group.rows.length === 0) continue;

    aoa.push([group.label]);
    aoa.push(columns.map((c) => c.header));
    for (const r of group.rows) {
      aoa.push(columns.map((c) => String(r[c.key] ?? '')));
    }
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge group header rows across all columns
  let row = 0;
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  for (const group of groups) {
    if (group.rows.length === 0) continue;
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: columns.length - 1 } });
    row += 1 + 1 + group.rows.length + 1;
  }
  if (merges.length > 0) ws['!merges'] = merges;

  ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.header.length + 2, 12) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── Manual book print (A5 portrait, thickness/color heading + size: brand grid) ──

export interface ManualGroup {
  label: string;       // e.g. "5mm · Clear"
  items: { size: string; brand: string; stock: string; unit: string }[];
}

export function exportManualBook(
  filename: string,
  groups: ManualGroup[],
  title: string,
  paperSize: 'a5' | 'a4' = 'a5',
) {
  const format = paperSize === 'a5' ? 'a5' : 'a4';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  groups.filter((group) => group.items.length > 0).forEach((group, groupIndex) => {
    if (groupIndex > 0) doc.addPage();

    const headingY = 24;
    const listTop = 38;
    const bottom = pageHeight - 12;
    const availableHeight = bottom - listTop;
    const lineSpacing = Math.max(5, Math.min(8, availableHeight / group.items.length));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(title, margin, 10);
    doc.text(new Date().toLocaleDateString('en-IN'), pageWidth - margin, 10, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(group.label, margin, headingY);
    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.5);
    doc.line(margin, headingY + 3, pageWidth - margin, headingY + 3);

    doc.setFontSize(10);
    group.items.forEach((item, index) => {
      const y = listTop + index * lineSpacing;
      const sizeText = item.size || '—';
      const brandText = item.brand || '—';
      const stockText = item.stock ? `${item.stock} ${item.unit}` : '';

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(sizeText, margin + 1, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(65, 65, 65);
      doc.text(brandText, margin + 32, y);
      if (stockText) {
        doc.setTextColor(100, 100, 100);
        doc.text(stockText, pageWidth - margin - 1, y, { align: 'right' });
      }
      doc.setDrawColor(190, 190, 190);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 2, margin + contentWidth, y + 2);
    });
  });

  doc.save(`${filename}.pdf`);
}
