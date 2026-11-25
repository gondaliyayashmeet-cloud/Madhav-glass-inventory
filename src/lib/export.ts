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
  const margin = paperSize === 'a5' ? 8 : 12;
  const contentWidth = pageWidth - margin * 2;
  const pageBottom = pageHeight - margin;
  const headerHeight = paperSize === 'a5' ? 20 : 24;
  const groupGap = paperSize === 'a5' ? 5 : 7;
  const rowHeight = paperSize === 'a5' ? 8 : 9;
  const tableHeaderHeight = paperSize === 'a5' ? 11 : 13;
  const titleDate = new Date().toLocaleDateString('en-IN');
  const usableGroups = groups.filter((group) => group.items.length > 0);
  let cursorY = 0;

  const drawPageHeader = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(paperSize === 'a5' ? 7 : 8);
    doc.setTextColor(90, 90, 90);
    doc.text(title, pageWidth / 2, margin + 4, { align: 'center' });
    doc.text(titleDate, pageWidth - margin, margin + 4, { align: 'right' });
    cursorY = margin + headerHeight;
  };

  const startPage = (firstPage: boolean) => {
    if (!firstPage) doc.addPage();
    drawPageHeader();
  };

  const drawGroup = (group: ManualGroup) => {
    const brands = [...new Set(group.items.map((item) => item.brand.trim()).filter(Boolean))];
    const sizes = [...new Set(group.items.map((item) => item.size.trim()).filter(Boolean))];
    if (brands.length === 0 || sizes.length === 0) return;

    const sizeColumnWidth = Math.min(paperSize === 'a5' ? 31 : 40, contentWidth * 0.3);
    const brandColumnWidth = (contentWidth - sizeColumnWidth) / brands.length;
    const groupTitleHeight = paperSize === 'a5' ? 8 : 10;
    const tableHeight = groupTitleHeight + tableHeaderHeight + sizes.length * rowHeight;
    const availableHeight = pageBottom - cursorY;

    if (availableHeight < tableHeight && cursorY > margin + headerHeight) {
      startPage(false);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(paperSize === 'a5' ? 10 : 12);
    doc.setTextColor(20, 35, 75);
    doc.text(group.label, margin, cursorY + groupTitleHeight - 2);
    cursorY += groupTitleHeight;

    const top = cursorY;
    const bottom = top + tableHeaderHeight + sizes.length * rowHeight;
    const tableLeft = margin;
    const sizeRight = tableLeft + sizeColumnWidth;

    doc.setDrawColor(45, 65, 125);
    doc.setLineWidth(0.35);
    doc.line(tableLeft, top, margin + contentWidth, top);
    doc.line(tableLeft, bottom, margin + contentWidth, bottom);
    doc.line(tableLeft, top, tableLeft, bottom);
    doc.line(sizeRight, top, sizeRight, bottom);

    brands.forEach((brand, index) => {
      const x = sizeRight + index * brandColumnWidth;
      const right = x + brandColumnWidth;
      doc.line(right, top, right, bottom);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(paperSize === 'a5' ? 7 : 8);
      doc.setTextColor(25, 45, 105);
      const lines = doc.splitTextToSize(brand, brandColumnWidth - 2);
      doc.text(lines.slice(0, 2), x + brandColumnWidth / 2, top + 4, { align: 'center' });
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(paperSize === 'a5' ? 8 : 9);
    doc.setTextColor(25, 45, 105);
    doc.text('Size', tableLeft + 2, top + tableHeaderHeight / 2 + 1.5);
    doc.line(tableLeft, top + tableHeaderHeight, margin + contentWidth, top + tableHeaderHeight);

    const stockByCell = new Map<string, string>();
    for (const item of group.items) {
      const key = `${item.size.trim()}\\u0000${item.brand.trim()}`;
      const current = stockByCell.get(key);
      const next = item.stock.trim();
      if (!current) {
        stockByCell.set(key, next);
      } else if (current !== next) {
        const currentNumber = Number(current);
        const nextNumber = Number(next);
        stockByCell.set(key, Number.isFinite(currentNumber) && Number.isFinite(nextNumber)
          ? String(currentNumber + nextNumber)
          : `${current}, ${next}`);
      }
    }

    sizes.forEach((size, rowIndex) => {
      const rowTop = top + tableHeaderHeight + rowIndex * rowHeight;
      const baseline = rowTop + rowHeight / 2 + 1.5;
      doc.line(tableLeft, rowTop + rowHeight, margin + contentWidth, rowTop + rowHeight);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(paperSize === 'a5' ? 8 : 9);
      doc.setTextColor(25, 45, 105);
      doc.text(size, tableLeft + 2, baseline);

      brands.forEach((brand, brandIndex) => {
        const value = stockByCell.get(`${size}\\u0000${brand}`);
        if (!value) return;
        const x = sizeRight + brandIndex * brandColumnWidth + brandColumnWidth / 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(paperSize === 'a5' ? 9 : 10);
        doc.setTextColor(25, 45, 105);
        doc.text(value, x, baseline, { align: 'center' });
      });
    });

    cursorY = bottom + groupGap;
  };

  if (usableGroups.length > 0) {
    startPage(true);
    usableGroups.forEach(drawGroup);
  }

  doc.save(`${filename}.pdf`);
}
