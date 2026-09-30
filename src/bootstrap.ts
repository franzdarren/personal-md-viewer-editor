import * as LZString from 'lz-string';
import { SAMPLE } from './lib/sample';
import {
  deriveTitle, loadDoc, loadIndex, loadSettings, newId, saveDoc, saveIndex,
  type DocIndex, type Settings,
} from './lib/storage';

export interface Boot {
  settings: Settings;
  index: DocIndex;
  text: string;
  /** A message to show once the app is on screen (e.g. "Opened a shared document"). */
  notice: string | null;
}

const SHARE_PREFIX = '#share=';

export function shareUrl(text: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${SHARE_PREFIX}${LZString.compressToEncodedURIComponent(text)}`;
}

function readSharedText(): string | null {
  const { hash } = window.location;
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  // Remove the hash so a refresh doesn't open the shared copy again.
  history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    return LZString.decompressFromEncodedURIComponent(hash.slice(SHARE_PREFIX.length)) || null;
  } catch {
    return null;
  }
}

function makeDoc(index: DocIndex | null, text: string): DocIndex {
  const now = Date.now();
  const id = newId();
  saveDoc(id, text);
  return {
    docs: [{ id, title: deriveTitle(text), createdAt: now, updatedAt: now }, ...(index?.docs ?? [])],
    currentId: id,
  };
}

/** Runs once, before React renders. */
export function bootstrap(): Boot {
  const settings = loadSettings();
  let index = loadIndex();
  let notice: string | null = null;

  const shared = readSharedText();
  if (shared !== null) {
    index = makeDoc(index, shared);
    notice = 'Opened a shared document. It is saved as a new document in this browser.';
  } else if (!index) {
    index = makeDoc(null, SAMPLE); // first visit
  }

  if (!index.docs.some((d) => d.id === index!.currentId)) index.currentId = index.docs[0].id;
  saveIndex(index);

  return { settings, index, text: loadDoc(index.currentId) ?? '', notice };
}
