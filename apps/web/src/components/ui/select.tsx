'use client';
/**
 * shadcn-flavoured Select primitives backed by native <select>. Kept dependency-free
 * (no Radix Select) so the bundle stays small. Mirrors the shadcn API used across
 * Sprint 4 pages: Select / SelectTrigger / SelectValue / SelectContent / SelectItem.
 */
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectCtxValue {
  value?: string;
  onValueChange?: (v: string) => void;
  placeholder?: string;
  registerItem: (value: string, label: React.ReactNode) => void;
}
const SelectCtx = React.createContext<SelectCtxValue | null>(null);

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

export function Select({ value, defaultValue, onValueChange, children }: SelectProps) {
  const [internal, setInternal] = React.useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;
  const itemsRef = React.useRef<Array<{ value: string; label: React.ReactNode }>>([]);

  const registerItem = React.useCallback((v: string, label: React.ReactNode) => {
    if (!itemsRef.current.some((i) => i.value === v)) {
      itemsRef.current.push({ value: v, label });
    }
  }, []);

  const handle = (next: string) => {
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <SelectCtx.Provider value={{ value: current, onValueChange: handle, registerItem }}>
      <div data-testid="select-root" className="relative">
        {/* Hidden native select for accessibility + tests */}
        <select
          aria-hidden="true"
          value={current}
          onChange={(e) => handle(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          data-testid="select-native"
        >
          <option value="" disabled hidden></option>
          {itemsRef.current.map((i) => (
            <option key={i.value} value={i.value}>
              {typeof i.label === 'string' ? i.label : i.value}
            </option>
          ))}
        </select>
        {children}
      </div>
    </SelectCtx.Provider>
  );
}

export const SelectTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      role="combobox"
      tabIndex={0}
      className={cn(
        'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </div>
  ),
);
SelectTrigger.displayName = 'SelectTrigger';

interface SelectValueProps { placeholder?: string }
export function SelectValue({ placeholder }: SelectValueProps) {
  const ctx = React.useContext(SelectCtx);
  return <span data-testid="select-value">{ctx?.value || placeholder || ''}</span>;
}

interface SelectContentProps { children: React.ReactNode; className?: string }
export function SelectContent({ children }: SelectContentProps) {
  // With our hidden-native fallback, content is just a registration shell.
  return <>{children}</>;
}

interface SelectItemProps { value: string; children: React.ReactNode; className?: string }
export function SelectItem({ value, children }: SelectItemProps) {
  const ctx = React.useContext(SelectCtx);
  React.useEffect(() => {
    ctx?.registerItem(value, children);
  }, [ctx, value, children]);
  return null;
}
