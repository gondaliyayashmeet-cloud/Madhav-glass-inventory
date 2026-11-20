import { type ReactNode, useEffect } from 'react';

export function Dialog({
  open,
  onOpenChange,
  children,
  className = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto"
      onMouseDown={() => onOpenChange(false)}
    >
      <div className="absolute inset-0 bg-black/40 animate-overlay-in" />
      <div
        className={`relative z-10 w-full rounded-xl border border-border bg-raised p-6 shadow-xl animate-dialog-in ${className || 'max-w-md'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-primary">{children}</h2>;
}

export function DialogContent({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}
