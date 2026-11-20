import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { Search, Check, ChevronDown } from 'lucide-react';
import { searchRank } from '../lib/search';

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
  keywords?: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyText?: string;
  onEnter?: () => void;
  onArrowNext?: () => void;
  onArrowPrev?: () => void;
}

export const SearchableSelect = forwardRef<HTMLButtonElement, SearchableSelectProps>(
  ({ value, onValueChange, options, placeholder = 'Search…', emptyText = 'No matches found', onEnter, onArrowNext, onArrowPrev }, ref) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const selected = options.find((o) => o.value === value);

    const filtered = useMemo(() => {
      if (!query.trim()) return options;
      const ranked = options
        .map((o) => {
          const haystack = [o.label, o.sublabel, o.keywords].filter(Boolean).join(' ');
          return { o, rank: searchRank(haystack, query) };
        })
        .filter((x) => x.rank > 0)
        .sort((a, b) => b.rank - a.rank);
      return ranked.map((x) => x.o);
    }, [options, query]);

    useEffect(() => {
      if (!open) return;
      const onClick = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', onClick);
      return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    useEffect(() => {
      if (!open) return;
      const container = containerRef.current;
      if (!container) return;
      const onFocusOut = (e: FocusEvent) => {
        if (!container.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      };
      container.addEventListener('focusout', onFocusOut);
      return () => container.removeEventListener('focusout', onFocusOut);
    }, [open]);

    useEffect(() => {
      if (open) {
        setActiveIndex(0);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setQuery('');
      }
    }, [open]);

    useEffect(() => {
      setActiveIndex(0);
    }, [query]);

    const handleSelect = (v: string) => {
      onValueChange(v);
      setOpen(false);
      setQuery('');
      onEnter?.();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered.length > 0) {
          setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length > 0) {
          setActiveIndex((prev) => Math.max(prev - 1, 0));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered.length > 0 && filtered[activeIndex]) {
          handleSelect(filtered[activeIndex].value);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'ArrowLeft' && onArrowPrev) {
        e.preventDefault();
        setOpen(false);
        onArrowPrev();
      } else if (e.key === 'ArrowRight' && onArrowNext) {
        e.preventDefault();
        setOpen(false);
        onArrowNext();
      }
    };

    useEffect(() => {
      if (!open || !listRef.current) return;
      const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }, [activeIndex, open]);

    return (
      <div ref={containerRef} className="relative">
        <button
          ref={ref}
          type="button"
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => {
            if (!open && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ')) {
              e.preventDefault();
              setOpen(true);
              return;
            }
            if (!open && e.key === 'ArrowUp' && onArrowPrev) {
              e.preventDefault();
              onArrowPrev();
              return;
            }
            if (!open && e.key === 'ArrowRight' && onArrowNext) {
              e.preventDefault();
              onArrowNext();
              return;
            }
            if (!open && e.key === 'ArrowLeft' && onArrowPrev) {
              e.preventDefault();
              onArrowPrev();
              return;
            }
            if (e.key === 'Enter' && open && selected) {
              e.preventDefault();
              setOpen(false);
              onEnter?.();
            }
          }}
          className="inline-flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-raised px-3 text-sm text-primary hover:bg-inset transition-colors"
        >
          <span className={`min-w-0 truncate ${selected ? 'text-primary' : 'text-secondary/60'}`}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className={`size-4 shrink-0 text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-raised shadow-lg animate-dialog-in">
            <div className="relative border-b border-border">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type to search…"
                className="w-full bg-transparent py-3.5 pl-10 pr-3 text-sm text-primary placeholder:text-secondary/60 focus:outline-none"
              />
            </div>
            <div ref={listRef} className="max-h-80 overflow-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-secondary">{emptyText}</div>
              ) : (
                filtered.map((o, i) => {
                  const isSelected = o.value === value;
                  const isActive = i === activeIndex;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => handleSelect(o.value)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                        isActive ? 'bg-inset' : ''
                      } ${isSelected ? 'text-accent font-medium' : 'text-primary'}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{o.label}</span>
                        {o.sublabel && (
                          <span className="block truncate text-xs text-secondary">{o.sublabel}</span>
                        )}
                      </span>
                      {isSelected && <Check className="size-4 shrink-0 text-accent" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

SearchableSelect.displayName = 'SearchableSelect';
export default SearchableSelect;
