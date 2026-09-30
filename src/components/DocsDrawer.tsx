import { useEffect, useState } from 'react';
import { FolderOpen, Plus, Trash, X } from 'lucide-react';
import type { DocMeta } from '../lib/storage';
import { useDialog } from './useDialog';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  open: boolean;
  docs: DocMeta[];
  currentId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  onDelete: (id: string) => void;
}

export function DocsDrawer({ open, docs, currentId, onClose, onOpen, onNew, onImport, onDelete }: Props) {
  const ref = useDialog(open, onClose);
  const [confirming, setConfirming] = useState<string | null>(null);

  // A delete needs a second click within a few seconds.
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirming]);

  useEffect(() => {
    if (!open) setConfirming(null);
  }, [open]);

  const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <dialog ref={ref} className="drawer" aria-label="Documents">
      <div className="drawer-head">
        <h2>Documents</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">
          <X size={18} />
        </button>
      </div>
      <div className="drawer-actions">
        <button type="button" className="btn btn-primary" onClick={onNew}>
          <Plus size={16} /> New document
        </button>
        <button type="button" className="btn" onClick={onImport} title="Open a .md or .txt file from your computer">
          <FolderOpen size={16} /> Open file…
        </button>
      </div>
      <ul className="doc-list">
        {sorted.map((doc) => {
          const isConfirming = confirming === doc.id;
          return (
            <li key={doc.id} className="doc-item" aria-current={doc.id === currentId}>
              <button type="button" className="doc-open" onClick={() => onOpen(doc.id)}>
                <span className="doc-title">{doc.title}</span>
                <span className="doc-meta">Edited {relativeTime(doc.updatedAt)}</span>
              </button>
              <button
                type="button"
                className={`icon-btn${isConfirming ? ' is-confirming' : ''}`}
                aria-label={isConfirming ? `Confirm delete ${doc.title}` : `Delete ${doc.title}`}
                title={isConfirming ? 'Click again to delete' : 'Delete'}
                onClick={() => {
                  if (isConfirming) {
                    setConfirming(null);
                    onDelete(doc.id);
                  } else {
                    setConfirming(doc.id);
                  }
                }}
              >
                {isConfirming ? <span className="btn-label">Delete?</span> : <Trash size={16} />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="drawer-foot">
        Documents are saved in this browser only. Use <strong>Export</strong> to keep a copy elsewhere.
      </p>
    </dialog>
  );
}
