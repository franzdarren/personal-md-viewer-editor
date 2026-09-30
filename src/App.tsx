import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ChevronDown, CircleQuestionMark, Columns2, Copy, Download, Eye, FileCode, FileDown, Link2, Link2Off,
  Moon, PenLine, Printer, Share2, Sun,
} from 'lucide-react';

import { shareUrl, type Boot } from './bootstrap';
import { MarkdownEditor } from './lib/editor';
import { PreviewController, type FormatAction } from './lib/preview';
import { computeStats } from './lib/markdown';
import { SAMPLE } from './lib/sample';
import { buildHtmlDocument, copyText, downloadFile, slugify } from './lib/exporting';
import {
  deleteDoc, deriveTitle, loadDoc, loadIndex, newId, saveDoc, saveIndex, saveSettings,
  type DocIndex, type Settings, type ViewMode,
} from './lib/storage';

import { FormatBar, modKey } from './components/FormatBar';
import { DocsDrawer } from './components/DocsDrawer';
import { HelpDialog } from './components/HelpDialog';
import { Menu } from './components/Menu';
import { StatusBar, type SaveState } from './components/StatusBar';

type ExportAction = 'md' | 'html' | 'print' | 'copy-md' | 'copy-html' | 'share';
type Toast = { id: number; text: string };

const altKey = modKey === '⌘' ? '⌥' : 'Alt';
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const OPENABLE = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    mql.addEventListener('change', update);
    update();
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function App({ boot }: { boot: Boot }) {
  const [settings, setSettings] = useState<Settings>(boot.settings);
  const [index, setIndex] = useState<DocIndex>(boot.index);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [stats, setStats] = useState(() => computeStats(boot.text));
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [editingPreview, setEditingPreview] = useState(false);

  const narrow = useMedia('(max-width: 820px)');
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  // Side by side doesn't fit on a phone, so narrow screens show one pane at a time.
  const view: ViewMode = narrow && settings.view === 'split' ? 'editor' : settings.view;

  // DOM hosts
  const workspaceRef = useRef<HTMLElement>(null);
  const editorPaneRef = useRef<HTMLElement>(null);
  const previewPaneRef = useRef<HTMLElement>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const previewRootRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Imperative objects and values that event handlers read without re-subscribing
  const editorRef = useRef<MarkdownEditor | null>(null);
  const previewRef = useRef<PreviewController | null>(null);
  const textRef = useRef(boot.text);
  const indexRef = useRef(boot.index);
  const settingsRef = useRef(settings);
  const viewRef = useRef(view);
  const saveStateRef = useRef(saveState);
  const pendingSave = useRef(false);
  const saveTimer = useRef(0);
  const statsTimer = useRef(0);
  const toastId = useRef(0);
  const storageWarned = useRef(false);
  const alignPreview = useRef<() => void>(() => {});
  settingsRef.current = settings;
  viewRef.current = view;
  saveStateRef.current = saveState;

  // ------------------------------------------------------------- helpers

  function toast(text: string) {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }

  function commitIndex(next: DocIndex) {
    indexRef.current = next;
    saveIndex(next);
    setIndex(next);
  }

  /** Write the current document to storage now (normally this happens 0.4 s after typing stops). */
  function flushSave(): boolean {
    window.clearTimeout(saveTimer.current);
    if (!pendingSave.current) return saveStateRef.current !== 'error';
    pendingSave.current = false;
    const idx = indexRef.current;
    const text = textRef.current;
    const ok = saveDoc(idx.currentId, text);
    commitIndex({
      ...idx,
      docs: idx.docs.map((d) => (d.id === idx.currentId ? { ...d, title: deriveTitle(text), updatedAt: Date.now() } : d)),
    });
    setSaveState(ok ? 'saved' : 'error');
    if (ok) storageWarned.current = false;
    else if (!storageWarned.current) {
      storageWarned.current = true;
      toast("This browser's storage is full, so recent changes aren't saved. Export the document to keep it.");
    }
    return ok;
  }

  function onTextChanged(text: string) {
    textRef.current = text;
    pendingSave.current = true;
    setSaveState((s) => (s === 'error' ? s : 'saving'));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, 400);
    window.clearTimeout(statsTimer.current);
    statsTimer.current = window.setTimeout(() => setStats(computeStats(textRef.current)), 250);
  }

  function showDoc(text: string) {
    textRef.current = text;
    editorRef.current?.load(text);
    previewRef.current?.render(text, true);
    if (previewScrollRef.current) previewScrollRef.current.scrollTop = 0;
    setStats(computeStats(text));
    setCursor({ line: 1, col: 1 });
  }

  function leaveCurrentDoc() {
    previewRef.current?.syncNow();
    flushSave();
  }

  function openDoc(id: string) {
    setDrawerOpen(false);
    if (id === indexRef.current.currentId) return;
    leaveCurrentDoc();
    commitIndex({ ...indexRef.current, currentId: id });
    showDoc(loadDoc(id) ?? '');
  }

  function createDoc(text: string) {
    leaveCurrentDoc();
    const now = Date.now();
    const id = newId();
    const ok = saveDoc(id, text);
    commitIndex({
      docs: [{ id, title: deriveTitle(text), createdAt: now, updatedAt: now }, ...indexRef.current.docs],
      currentId: id,
    });
    showDoc(text);
    setSaveState(ok ? 'saved' : 'error');
    setDrawerOpen(false);
    if (!text && viewRef.current !== 'preview') window.setTimeout(() => editorRef.current?.focus(), 0);
  }

  function removeDoc(id: string) {
    const idx = indexRef.current;
    const doc = idx.docs.find((d) => d.id === id);
    const docs = idx.docs.filter((d) => d.id !== id);
    if (id === idx.currentId) {
      // Drop unsaved preview edits of the document being deleted.
      window.clearTimeout(saveTimer.current);
      pendingSave.current = false;
      previewRef.current?.refresh();
    }
    deleteDoc(id);

    if (!docs.length) {
      const now = Date.now();
      const fresh = { id: newId(), title: 'Untitled', createdAt: now, updatedAt: now };
      saveDoc(fresh.id, '');
      commitIndex({ docs: [fresh], currentId: fresh.id });
      showDoc('');
    } else if (id === idx.currentId) {
      const next = [...docs].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      commitIndex({ docs, currentId: next.id });
      showDoc(loadDoc(next.id) ?? '');
    } else {
      commitIndex({ ...idx, docs });
    }
    setSaveState('saved');
    toast(`Deleted “${doc?.title ?? 'document'}”`);
  }

  async function importFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => OPENABLE.test(f.name) || f.type.startsWith('text/'));
    if (!list.length) {
      toast('Only Markdown (.md) or plain text (.txt) files can be opened.');
      return;
    }
    for (const file of list) createDoc((await file.text()).replace(/\r\n?/g, '\n'));
    toast(list.length === 1 ? `Opened ${list[0].name}` : `Opened ${list.length} files`);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function format(action: FormatAction) {
    if (previewRef.current?.format(action)) return;
    if (view === 'preview') {
      toast(
        settings.previewEditable
          ? 'Click into the preview where you want the formatting, then press the button.'
          : 'Turn on “Edit preview” to format text in the preview.',
      );
      return;
    }
    editorRef.current?.format(action);
  }

  function changeView(next: ViewMode) {
    if (next === 'editor') previewRef.current?.commit();
    setSettings((s) => ({ ...s, view: next }));
  }

  function toggleTheme() {
    setSettings((s) => ({ ...s, theme: theme === 'dark' ? 'light' : 'dark' }));
  }

  async function runExport(action: ExportAction) {
    const preview = previewRef.current!;
    preview.syncNow();
    flushSave();
    const text = textRef.current;
    const title = deriveTitle(text);
    const file = slugify(title);
    switch (action) {
      case 'md':
        downloadFile(`${file}.md`, text, 'text/markdown;charset=utf-8');
        break;
      case 'html':
        downloadFile(`${file}.html`, await buildHtmlDocument(title, preview.cleanHtml(), preview.hasMath()), 'text/html;charset=utf-8');
        break;
      case 'print':
        window.print();
        break;
      case 'copy-md':
        toast((await copyText(text)) ? 'Markdown copied to the clipboard' : 'Could not copy. Your browser blocked the clipboard.');
        break;
      case 'copy-html':
        toast((await copyText(preview.cleanHtml())) ? 'HTML copied to the clipboard' : 'Could not copy. Your browser blocked the clipboard.');
        break;
      case 'share': {
        const url = shareUrl(text);
        if (!(await copyText(url))) {
          toast('Could not copy. Your browser blocked the clipboard.');
        } else if (url.length > 16000) {
          toast('Link copied, but it is very long. Some apps may cut it off; sending the .md file is safer.');
        } else {
          toast('Share link copied. Whoever opens it gets their own copy of this document.');
        }
        break;
      }
    }
  }

  // Handlers registered once on window read the newest versions through this ref.
  const latest = useRef({ flushSave, importFiles, onKeyDown: (_: KeyboardEvent) => {} });
  latest.current.flushSave = flushSave;
  latest.current.importFiles = importFiles;
  latest.current.onKeyDown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.shiftKey && !e.altKey && key === 's') {
      e.preventDefault();
      previewRef.current?.syncNow();
      pendingSave.current = true;
      toast(flushSave() ? 'Saved in this browser' : "Not saved: this browser's storage is full");
    } else if (mod && !e.shiftKey && !e.altKey && key === 'o') {
      e.preventDefault();
      openFilePicker();
    } else if (e.altKey && !mod && !e.shiftKey) {
      const next = ({ Digit1: 'editor', Digit2: 'split', Digit3: 'preview' } as const)[e.code as 'Digit1'];
      if (next) {
        e.preventDefault();
        changeView(next);
      }
    }
  };

  // --------------------------------------------------------------- setup

  useLayoutEffect(() => {
    const preview = new PreviewController(previewRootRef.current!, previewScrollRef.current!, (md) => {
      editorRef.current?.setText(md);
      onTextChanged(md);
    });
    const editor = new MarkdownEditor(editorHostRef.current!, textRef.current, {
      onChange: (md) => {
        preview.render(md);
        onTextChanged(md);
        alignPreview.current();
      },
      onCursor: (line, col) => setCursor({ line, col }),
    });
    previewRef.current = preview;
    editorRef.current = editor;
    preview.setEditable(settingsRef.current.previewEditable);
    preview.setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    preview.render(textRef.current, true);
    if (!window.matchMedia('(max-width: 820px)').matches && viewRef.current !== 'preview') editor.focus();

    return () => {
      editor.destroy();
      preview.destroy();
      editorRef.current = null;
      previewRef.current = null;
    };
  }, []);

  // Scroll sync: whichever pane the user is working in leads, the other follows by source line.
  useEffect(() => {
    const editor = editorRef.current!;
    const preview = previewRef.current!;
    const editorScroller = editor.view.scrollDOM;
    const previewScroller = previewScrollRef.current!;
    const panes = [editorPaneRef.current!, previewPaneRef.current!];
    let leader: 'editor' | 'preview' | null = null;
    let frame = 0;

    const enabled = () => settingsRef.current.syncScroll && viewRef.current === 'split';
    const follow = (from: 'editor' | 'preview') => {
      if (leader !== from || !enabled()) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (from === 'editor') preview.scrollToLine(editor.topLine());
        else editor.scrollToLine(preview.topLine());
      });
    };
    const fromEditor = () => follow('editor');
    const fromPreview = () => follow('preview');
    const leadEditor = () => (leader = 'editor');
    const leadPreview = () => (leader = 'preview');
    alignPreview.current = fromEditor;

    const events = ['pointerdown', 'wheel', 'touchstart', 'keydown', 'mouseenter'] as const;
    for (const ev of events) {
      panes[0].addEventListener(ev, leadEditor, { passive: true });
      panes[1].addEventListener(ev, leadPreview, { passive: true });
    }
    editorScroller.addEventListener('scroll', fromEditor, { passive: true });
    previewScroller.addEventListener('scroll', fromPreview, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      alignPreview.current = () => {};
      for (const ev of events) {
        panes[0].removeEventListener(ev, leadEditor);
        panes[1].removeEventListener(ev, leadPreview);
      }
      editorScroller.removeEventListener('scroll', fromEditor);
      previewScroller.removeEventListener('scroll', fromPreview);
    };
  }, []);

  // Save before the page goes away; keep other open tabs in step.
  useEffect(() => {
    const flushAll = () => {
      previewRef.current?.syncNow();
      latest.current.flushSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flushAll();
      if (saveStateRef.current === 'error') {
        e.preventDefault(); // ask "Leave site?" because the latest text isn't stored
        e.returnValue = '';
      }
    };
    const onStorage = (e: StorageEvent) => {
      const current = indexRef.current;
      if (e.key === 'tinta:index') {
        const other = loadIndex();
        if (!other) return;
        let docs = other.docs;
        if (!docs.some((d) => d.id === current.currentId)) {
          const mine = current.docs.find((d) => d.id === current.currentId);
          if (mine) docs = [mine, ...docs];
        }
        const next = { docs, currentId: current.currentId };
        indexRef.current = next;
        setIndex(next);
      } else if (e.key === `tinta:doc:${current.currentId}` && e.newValue !== null && !pendingSave.current && !document.hasFocus()) {
        // The same document was edited in another tab: show that version here.
        textRef.current = e.newValue;
        editorRef.current?.setText(e.newValue);
        previewRef.current?.render(e.newValue);
        setStats(computeStats(e.newValue));
      }
    };
    const onKeyDown = (e: KeyboardEvent) => latest.current.onKeyDown(e);
    const onBeforePrint = () => previewRef.current?.syncNow();

    window.addEventListener('pagehide', flushAll);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      window.removeEventListener('pagehide', flushAll);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, []);

  // Drop a .md file anywhere to open it. Capture phase so the editor doesn't paste the file's text inline.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      setDropping(false);
      if (e.dataTransfer!.files.length) latest.current.importFiles(e.dataTransfer!.files);
    };
    window.addEventListener('dragenter', onEnter, true);
    window.addEventListener('dragleave', onLeave, true);
    window.addEventListener('dragover', onOver, true);
    window.addEventListener('drop', onDrop, true);
    return () => {
      window.removeEventListener('dragenter', onEnter, true);
      window.removeEventListener('dragleave', onLeave, true);
      window.removeEventListener('dragover', onOver, true);
      window.removeEventListener('drop', onDrop, true);
    };
  }, []);

  const noticeShown = useRef(false);
  useEffect(() => {
    if (boot.notice && !noticeShown.current) {
      noticeShown.current = true;
      toast(boot.notice);
    }
  }, [boot.notice]);

  // --------------------------------------------------------- state → DOM

  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    previewRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (!settings.previewEditable) preview.commit();
    preview.setEditable(settings.previewEditable);
    if (!settings.previewEditable) setEditingPreview(false);
  }, [settings.previewEditable]);

  const lastView = useRef(view);
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    editorRef.current?.view.requestMeasure();
    if (view === 'split' && settings.syncScroll) {
      requestAnimationFrame(() => {
        if (editorRef.current) previewRef.current?.scrollToLine(editorRef.current.topLine());
      });
    }
  }, [view, settings.syncScroll]);

  const current = index.docs.find((d) => d.id === index.currentId);
  const title = current?.title ?? 'Untitled';
  useEffect(() => {
    document.title = `${title} · md-preview`;
  }, [title]);

  // -------------------------------------------------------------- divider

  function onDividerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const ws = workspaceRef.current!;
    const rect = ws.getBoundingClientRect();
    let ratio = settings.split;
    handle.setPointerCapture(e.pointerId);
    ws.classList.add('is-resizing');
    handle.classList.add('is-dragging');
    const move = (ev: PointerEvent) => {
      ratio = clamp((ev.clientX - rect.left) / rect.width, 0.2, 0.8);
      ws.style.setProperty('--split', String(ratio));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      ws.classList.remove('is-resizing');
      handle.classList.remove('is-dragging');
      setSettings((s) => ({ ...s, split: ratio }));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function onDividerKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : 0;
    if (!step) return;
    e.preventDefault();
    setSettings((s) => ({ ...s, split: clamp(s.split + step, 0.2, 0.8) }));
  }

  // ---------------------------------------------------------------- render

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setDrawerOpen(true)} title="Your documents">
          <img className="brand-mark" src="/favicon.svg" alt="" />
          <span className="brand-text">
            <span className="brand-name">md-preview</span>
            <span className="brand-doc">{title}</span>
          </span>
          <ChevronDown size={14} className="brand-chevron" aria-hidden="true" />
        </button>

        <span className="sep" aria-hidden="true" />
        <FormatBar onFormat={format} />
        <span className="spacer" />

        <div className="segmented" role="group" aria-label="Layout">
          <button
            type="button"
            className="icon-btn"
            aria-pressed={view === 'editor'}
            title={`Markdown only (${altKey}+1)`}
            aria-label="Markdown only"
            onClick={() => changeView('editor')}
          >
            <PenLine size={16} />
          </button>
          <button
            type="button"
            className="icon-btn hide-narrow"
            aria-pressed={view === 'split'}
            title={`Side by side (${altKey}+2)`}
            aria-label="Side by side"
            onClick={() => changeView('split')}
          >
            <Columns2 size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-pressed={view === 'preview'}
            title={`Preview only (${altKey}+3)`}
            aria-label="Preview only"
            onClick={() => changeView('preview')}
          >
            <Eye size={16} />
          </button>
        </div>

        <button
          type="button"
          className="icon-btn"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
        </button>

        <Menu<ExportAction>
          title="Export, copy, share or print"
          chevron
          trigger={
            <>
              <Download size={17} strokeWidth={1.9} />
              <span className="btn-label hide-narrow">Export</span>
            </>
          }
          onSelect={runExport}
          items={[
            { key: 'md', label: 'Download Markdown (.md)', icon: FileDown },
            { key: 'html', label: 'Download HTML (.html)', icon: FileCode },
            { key: 'print', label: 'Print or save as PDF', icon: Printer },
            'sep',
            { key: 'copy-md', label: 'Copy Markdown', icon: Copy },
            { key: 'copy-html', label: 'Copy HTML', icon: Copy },
            { key: 'share', label: 'Copy share link', icon: Share2 },
          ]}
        />

        <button
          type="button"
          className="icon-btn"
          title="Help and keyboard shortcuts"
          aria-label="Help and keyboard shortcuts"
          onClick={() => setHelpOpen(true)}
        >
          <CircleQuestionMark size={18} strokeWidth={1.9} />
        </button>
      </header>

      <main
        className="workspace"
        data-view={view}
        ref={workspaceRef}
        style={{ '--split': settings.split } as CSSProperties}
      >
        <section className="pane pane-editor" ref={editorPaneRef} aria-label="Markdown source">
          <div className="pane-head">
            <span className="pane-title">Markdown</span>
            <span className="pane-hint hide-narrow">{modKey}+F to search</span>
          </div>
          <div className="pane-body">
            <div ref={editorHostRef} />
          </div>
        </section>

        <div
          className="divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(settings.split * 100)}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          onPointerDown={onDividerDown}
          onDoubleClick={() => setSettings((s) => ({ ...s, split: 0.5 }))}
          onKeyDown={onDividerKey}
        />

        <section className="pane pane-preview" ref={previewPaneRef} aria-label="Preview">
          <div className="pane-head">
            <span className="pane-title">Preview</span>
            <span className="pane-hint hide-narrow">
              {settings.previewEditable ? 'Click anywhere to edit' : 'Read only'}
            </span>
            <span className="spacer" />
            {view === 'split' && (
              <button
                type="button"
                className="icon-btn"
                aria-pressed={settings.syncScroll}
                title={settings.syncScroll ? 'Scroll sync is on' : 'Scroll sync is off'}
                aria-label="Sync scrolling"
                onClick={() => setSettings((s) => ({ ...s, syncScroll: !s.syncScroll }))}
              >
                {settings.syncScroll ? <Link2 size={15} /> : <Link2Off size={15} />}
              </button>
            )}
            <button
              type="button"
              className="toggle"
              role="switch"
              aria-checked={settings.previewEditable}
              title="Type directly in the preview; changes go back into the Markdown"
              onClick={() => setSettings((s) => ({ ...s, previewEditable: !s.previewEditable }))}
            >
              <span className="toggle-track" aria-hidden="true" />
              Edit preview
            </button>
          </div>
          <div className="pane-body">
            <div className="preview-scroll" ref={previewScrollRef}>
              <article
                className="markdown-body"
                ref={previewRootRef}
                aria-label="Rendered document"
                onFocus={() => setEditingPreview(settingsRef.current.previewEditable)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditingPreview(false);
                }}
              />
            </div>
          </div>
        </section>
      </main>

      <StatusBar saveState={saveState} stats={stats} cursor={cursor} editingPreview={editingPreview} />

      <DocsDrawer
        open={drawerOpen}
        docs={index.docs}
        currentId={index.currentId}
        onClose={() => setDrawerOpen(false)}
        onOpen={openDoc}
        onNew={() => createDoc('')}
        onImport={openFilePicker}
        onDelete={removeDoc}
      />

      <HelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onOpenSample={() => {
          setHelpOpen(false);
          createDoc(SAMPLE);
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept=".md,.markdown,.mdown,.mkd,.mdx,.txt,text/markdown,text/plain"
        onChange={(e) => {
          if (e.target.files?.length) importFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>

      {dropping && <div className="drop-overlay">Drop a Markdown file to open it</div>}
    </div>
  );
}
