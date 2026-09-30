export type SaveState = 'saved' | 'saving' | 'error';

interface Props {
  saveState: SaveState;
  stats: { words: number; chars: number; lines: number; minutes: number };
  cursor: { line: number; col: number };
  editingPreview: boolean;
}

const fmt = (n: number) => n.toLocaleString();

export function StatusBar({ saveState, stats, cursor, editingPreview }: Props) {
  const saveText =
    saveState === 'saved' ? 'Saved in this browser' : saveState === 'saving' ? 'Saving…' : 'Not saved: browser storage is full';
  return (
    <footer className="statusbar">
      <span className="status-save" data-state={saveState} role="status" aria-live="polite">
        <span className="status-dot" aria-hidden="true" />
        {saveText}
      </span>
      <span className="status-stats">
        <span>{fmt(stats.words)} {stats.words === 1 ? 'word' : 'words'}</span>
        <span>{fmt(stats.chars)} characters</span>
        <span>{stats.minutes ? `${stats.minutes} min read` : '0 min read'}</span>
      </span>
      <span className="status-cursor">
        {editingPreview ? <span className="status-pencil">Editing preview</span> : `Ln ${cursor.line}, Col ${cursor.col}`}
      </span>
    </footer>
  );
}
