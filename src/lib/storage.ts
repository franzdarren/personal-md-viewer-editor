/**
 * Everything is stored in this browser's localStorage:
 *   tinta:index      list of documents + which one is open
 *   tinta:doc:<id>   the Markdown of one document
 *   tinta:settings   theme, layout and toggles
 */
const INDEX_KEY = 'tinta:index';
const DOC_PREFIX = 'tinta:doc:';
const SETTINGS_KEY = 'tinta:settings';

export interface DocMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface DocIndex {
  docs: DocMeta[];
  currentId: string;
}

export type ThemeSetting = 'system' | 'light' | 'dark';
export type ViewMode = 'editor' | 'split' | 'preview';

export interface Settings {
  theme: ThemeSetting;
  view: ViewMode;
  split: number;
  syncScroll: boolean;
  previewEditable: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  view: 'split',
  split: 0.5,
  syncScroll: true,
  previewEditable: true,
};

// Falls back to memory if storage is blocked (e.g. some private-browsing modes).
const memory = new Map<string, string>();
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    memory.set(key, value);
    return false;
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    memory.delete(key);
  }
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(read(SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, JSON.stringify(s));
}

export function loadIndex(): DocIndex | null {
  try {
    const idx = JSON.parse(read(INDEX_KEY) || 'null') as DocIndex | null;
    if (idx && Array.isArray(idx.docs) && idx.docs.length) return idx;
  } catch {
    /* fall through */
  }
  return null;
}

export function saveIndex(idx: DocIndex) {
  write(INDEX_KEY, JSON.stringify(idx));
}

export function loadDoc(id: string): string | null {
  return read(DOC_PREFIX + id);
}

/** Returns false when the browser refused to store it (usually: storage full). */
export function saveDoc(id: string, text: string): boolean {
  return write(DOC_PREFIX + id, text);
}

export function deleteDoc(id: string) {
  remove(DOC_PREFIX + id);
}

export function deriveTitle(text: string): string {
  const heading = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(text)?.[1];
  const firstLine = text.split('\n').find((l) => l.trim())?.trim();
  const title = (heading ?? firstLine ?? '')
    .replace(/[*_`~[\]<>#]/g, '')
    .replace(/\(https?:[^)]*\)/g, '')
    .trim();
  return title.slice(0, 60) || 'Untitled';
}
