import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, FileJson, ChevronDown } from 'lucide-react';
import { exportData, type ExportFormat, type ExportColumn } from '../lib/export';

interface Props {
  filename: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  title?: string;
  label?: string;
}

export function ExportButton({ filename, columns, rows, title, label = 'Export' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleExport = (format: ExportFormat) => {
    exportData(format, filename, columns, rows, title);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={rows.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-inset disabled:opacity-50"
      >
        <Download className="size-4" />
        {label}
        <ChevronDown className="size-3.5 text-secondary" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-raised shadow-lg">
          <button
            onClick={() => handleExport('pdf')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-primary transition-colors hover:bg-inset"
          >
            <FileText className="size-4 text-error" />
            PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-primary transition-colors hover:bg-inset"
          >
            <FileSpreadsheet className="size-4 text-success" />
            Excel
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-primary transition-colors hover:bg-inset"
          >
            <FileJson className="size-4 text-accent" />
            CSV
          </button>
        </div>
      )}
    </div>
  );
}
