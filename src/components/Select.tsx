import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';

interface SelectContextValue {
  value: string;
  setValue: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  labelsRef: MutableRefObject<Record<string, string>>;
  activeIndex: number;
  setActiveIndex: (n: number | ((prev: number) => number)) => void;
  onEnter?: () => void;
}

const SelectContext = createContext<SelectContextValue | undefined>(undefined);

function useSelectContext() {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error('Select components must be used within <Select>');
  return ctx;
}

export function Select({
  value,
  onValueChange,
  onEnter,
  containerRef,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  onEnter?: () => void;
  containerRef?: React.Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const labelsRef = useRef<Record<string, string>>({});
  const internalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (internalRef.current && !internalRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const setValue = (v: string) => {
    setInternalValue(v);
    onValueChange(v);
  };

  const setRef = (el: HTMLDivElement | null) => {
    internalRef.current = el;
    if (typeof containerRef === 'function') containerRef(el);
    else if (containerRef) (containerRef as MutableRefObject<HTMLDivElement | null>).current = el;
  };

  return (
    <SelectContext.Provider value={{ value: internalValue, setValue, open, setOpen, labelsRef, activeIndex, setActiveIndex, onEnter }}>
      <div ref={setRef} className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className = '', children }: { className?: string; children: ReactNode }) {
  const { value: currentValue, open, setOpen, labelsRef, activeIndex, setActiveIndex, setValue, onEnter } = useSelectContext();

  const items = Object.entries(labelsRef.current);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = items.findIndex(([v]) => v === currentValue);
        setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
        setOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) {
        setValue(item[0]);
        setOpen(false);
        onEnter?.();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        if (!open) {
          const currentIdx = items.findIndex(([v]) => v === currentValue);
          setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
        }
        setOpen(!open);
      }}
      onKeyDown={handleKeyDown}
      className={`inline-flex h-10 items-center justify-between gap-2 rounded-lg border border-border bg-raised px-3 text-sm text-primary hover:bg-inset transition-colors ${className}`}
    >
      {children}
      <svg className={`size-4 text-secondary transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, labelsRef } = useSelectContext();
  const label = labelsRef.current[value] || placeholder || value;
  return <span className={value ? 'text-primary' : 'text-secondary/60'}>{label}</span>;
}

export function SelectContent({ children }: { children: ReactNode }) {
  const { open } = useSelectContext();
  return (
    <div
      className={`absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-raised py-1 shadow-lg animate-dialog-in ${open ? '' : 'hidden'}`}
    >
      {children}
    </div>
  );
}

export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  const { value: current, setValue, setOpen, labelsRef, activeIndex } = useSelectContext();
  const itemRef = useRef<HTMLButtonElement>(null);
  const selected = current === value;

  const label = typeof children === 'string' ? children : String(children ?? '');
  if (value) labelsRef.current[value] = label;

  const items = Object.entries(labelsRef.current);
  const index = items.findIndex(([v]) => v === value);
  const isActive = index === activeIndex && index !== -1;

  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isActive]);

  return (
    <button
      ref={itemRef}
      type="button"
      onClick={() => { setValue(value); setOpen(false); }}
      className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
        isActive ? 'bg-inset' : ''
      } ${selected ? 'text-accent font-medium' : 'text-primary'}`}
    >
      {children}
    </button>
  );
}
