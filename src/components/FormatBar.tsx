import {
  Bold, Code, Heading1, Heading2, Heading3, Image, Italic, Link, List, ListOrdered, ListTodo,
  Minus, SquareCode, Strikethrough, Table, TextQuote, type LucideIcon,
} from 'lucide-react';
import type { FormatAction } from '../lib/preview';

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

type Item = { action: FormatAction; icon: LucideIcon; label: string; keys?: string } | 'sep';

const ITEMS: Item[] = [
  { action: 'bold', icon: Bold, label: 'Bold', keys: `${mod}+B` },
  { action: 'italic', icon: Italic, label: 'Italic', keys: `${mod}+I` },
  { action: 'strike', icon: Strikethrough, label: 'Strikethrough', keys: `${mod}+Shift+X` },
  { action: 'code', icon: Code, label: 'Inline code', keys: `${mod}+E` },
  'sep',
  { action: 'h1', icon: Heading1, label: 'Heading 1' },
  { action: 'h2', icon: Heading2, label: 'Heading 2' },
  { action: 'h3', icon: Heading3, label: 'Heading 3' },
  'sep',
  { action: 'quote', icon: TextQuote, label: 'Quote' },
  { action: 'ul', icon: List, label: 'Bulleted list' },
  { action: 'ol', icon: ListOrdered, label: 'Numbered list' },
  { action: 'task', icon: ListTodo, label: 'Task list' },
  'sep',
  { action: 'link', icon: Link, label: 'Link', keys: `${mod}+K` },
  { action: 'image', icon: Image, label: 'Image' },
  { action: 'codeblock', icon: SquareCode, label: 'Code block' },
  { action: 'table', icon: Table, label: 'Table' },
  { action: 'hr', icon: Minus, label: 'Divider' },
];

export function FormatBar({ onFormat }: { onFormat: (action: FormatAction) => void }) {
  return (
    <div className="format-bar" role="toolbar" aria-label="Formatting">
      {ITEMS.map((item, i) =>
        item === 'sep' ? (
          <span key={`sep${i}`} className="sep" aria-hidden="true" />
        ) : (
          <button
            key={item.action}
            type="button"
            className="icon-btn"
            title={item.keys ? `${item.label} (${item.keys})` : item.label}
            aria-label={item.label}
            // Keep the cursor where it is (in the editor or the preview) when the button is pressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFormat(item.action)}
          >
            <item.icon size={17} strokeWidth={1.9} />
          </button>
        ),
      )}
    </div>
  );
}

export { mod as modKey };
