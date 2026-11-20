import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  onEnter?: () => void;
  onArrowNext?: () => void;
  onArrowPrev?: () => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', onEnter, onArrowNext, onArrowPrev, onKeyDown, ...props }, ref) => (
    <input
      ref={ref}
      className={`h-10 w-full rounded-lg border border-border bg-raised px-3 text-sm text-primary placeholder:text-secondary/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-colors ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
          return;
        }
        if (e.key === 'ArrowRight' && onArrowNext) {
          const el = e.currentTarget;
          if (el.selectionStart === el.selectionEnd && el.selectionStart === el.value.length) {
            e.preventDefault();
            onArrowNext();
            return;
          }
        }
        if (e.key === 'ArrowLeft' && onArrowPrev) {
          const el = e.currentTarget;
          if (el.selectionStart === el.selectionEnd && el.selectionStart === 0) {
            e.preventDefault();
            onArrowPrev();
            return;
          }
        }
        if (e.key === 'ArrowDown' && onArrowNext) {
          e.preventDefault();
          onArrowNext();
          return;
        }
        if (e.key === 'ArrowUp' && onArrowPrev) {
          e.preventDefault();
          onArrowPrev();
          return;
        }
        onKeyDown?.(e);
      }}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
