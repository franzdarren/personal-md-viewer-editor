import { BookOpen, X } from 'lucide-react';
import { useDialog } from './useDialog';
import { modKey } from './FormatBar';

const alt = modKey === '⌘' ? '⌥' : 'Alt';

const SHORTCUTS: [string, string[]][] = [
  ['Bold / italic', [`${modKey}+B`, `${modKey}+I`]],
  ['Inline code', [`${modKey}+E`]],
  ['Link', [`${modKey}+K`]],
  ['Strikethrough', [`${modKey}+Shift+X`]],
  ['Search in Markdown', [`${modKey}+F`]],
  ['Undo / redo', [`${modKey}+Z`, `${modKey}+Shift+Z`]],
  ['Save now', [`${modKey}+S`]],
  ['Open a file', [`${modKey}+O`]],
  ['Markdown / split / preview', [`${alt}+1`, `${alt}+2`, `${alt}+3`]],
  ['Open a link in the preview', [`${modKey}+click`]],
];

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSample: () => void;
}

export function HelpDialog({ open, onClose, onOpenSample }: Props) {
  const ref = useDialog(open, onClose);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="help-title">
      <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>
      <div className="modal-body">
        <h2 id="help-title">How Tinta works</h2>
        <p>
          Type Markdown on the left and the rendered document appears on the right. You can also type
          directly in the rendered document: the Markdown updates to match.
        </p>

        <h3>Editing the preview</h3>
        <p>
          Blocks you change in the preview get a red mark in the margin. Only those blocks are rewritten
          in the Markdown; everything else keeps your exact formatting. When you click out of the
          preview it redraws from the Markdown.
        </p>
        <p>
          Math, diagrams and raw HTML are locked in the preview. Change them in the Markdown pane. You
          can switch preview editing off with the <strong>Edit preview</strong> switch.
        </p>

        <h3>Saving</h3>
        <p>
          Every change is saved in this browser as you type, so a refresh or an accidentally closed tab
          keeps your work. It is not uploaded anywhere. Clearing your browser's site data deletes it, so
          use <strong>Export → Download Markdown</strong> for anything you want to keep.
        </p>

        <h3>Keyboard shortcuts</h3>
        <table className="shortcut-table">
          <tbody>
            {SHORTCUTS.map(([label, keys]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>
                  {keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ' '}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onOpenSample}>
            <BookOpen size={16} /> Open the welcome document
          </button>
        </div>
      </div>
    </dialog>
  );
}
