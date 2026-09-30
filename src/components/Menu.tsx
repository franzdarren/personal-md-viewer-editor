import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';

export type MenuItem<K extends string> = { key: K; label: string; icon: LucideIcon; checked?: boolean } | 'sep';

interface Props<K extends string> {
  trigger: ReactNode;
  title: string;
  items: MenuItem<K>[];
  onSelect: (key: K) => void;
  chevron?: boolean;
}

/** A button that opens a small dropdown list. Closes on outside click, Esc, or choosing an item. */
export function Menu<K extends string>({ trigger, title, items, onSelect, chevron }: Props<K>) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const buttons = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('.menu button') ?? []);
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') {
        setOpen(false);
        wrap.current?.querySelector<HTMLButtonElement>('.icon-btn')?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        buttons[(i + step + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    const checked = wrap.current?.querySelector<HTMLButtonElement>('.menu button[aria-checked="true"]');
    (checked ?? wrap.current?.querySelector<HTMLButtonElement>('.menu button'))?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasChecks = items.some((i) => i !== 'sep' && i.checked !== undefined);

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={open}
        title={title}
        aria-label={title}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
        {chevron && <ChevronDown size={14} className="hide-narrow" />}
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((item, i) => {
            if (item === 'sep') return <hr key={`sep${i}`} />;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role={hasChecks ? 'menuitemradio' : 'menuitem'}
                aria-checked={hasChecks ? !!item.checked : undefined}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.key);
                }}
              >
                <Icon size={16} />
                {item.label}
                {item.checked && <Check size={15} className="menu-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
