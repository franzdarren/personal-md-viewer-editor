import { Annotation, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, placeholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';
import type { FormatAction } from './preview';

/** Marks changes that came from the preview, so they aren't echoed back. */
const fromOutside = Annotation.define<boolean>();

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--ink)', backgroundColor: 'var(--editor-bg)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: 'var(--editor-size)', lineHeight: '1.75' },
  '.cm-content': { padding: '20px 0 45vh', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 28px 0 10px' },
  '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--faint)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 18px', minWidth: '44px', fontSize: '0.85em' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--muted)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--selection) !important' },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-match-strong)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--selection-match)', outline: 'none' },
  '.cm-placeholder': { color: 'var(--faint)', fontStyle: 'italic' },
  '.cm-panels': { backgroundColor: 'var(--desk)', color: 'var(--ink)', fontFamily: 'var(--font-ui)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--rule)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--rule)' },
  '.cm-textfield': {
    backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule)', borderRadius: '5px',
    padding: '3px 6px', fontFamily: 'var(--font-ui)',
  },
  '.cm-button': {
    backgroundImage: 'none', backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule)',
    borderRadius: '5px', fontFamily: 'var(--font-ui)',
  },
  '.cm-panel.cm-search label': { fontSize: '13px' },
  '.cm-tooltip': { backgroundColor: 'var(--paper)', border: '1px solid var(--rule)', color: 'var(--ink)' },
});

const highlight = HighlightStyle.define([
  { tag: t.heading1, color: 'var(--md-heading)', fontWeight: '700', fontSize: '1.12em' },
  { tag: t.heading2, color: 'var(--md-heading)', fontWeight: '700', fontSize: '1.06em' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], color: 'var(--md-heading)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700', color: 'var(--ink-strong)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--muted)' },
  { tag: t.link, color: 'var(--md-link)' },
  { tag: t.url, color: 'var(--md-url)' },
  { tag: t.quote, color: 'var(--md-quote)', fontStyle: 'italic' },
  { tag: t.monospace, color: 'var(--md-code)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.labelName], color: 'var(--md-mark)' },
  { tag: t.meta, color: 'var(--md-mark)' },
  // Code inside fenced blocks
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: 'var(--hl-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--hl-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--hl-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--hl-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--hl-type)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--hl-tag)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--hl-attr)' },
  { tag: t.invalid, color: 'var(--pencil)' },
]);

// ------------------------------------------------------------ formatting

function wrap(view: EditorView, marker: string, filler: string) {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const before = state.sliceDoc(range.from - marker.length, range.from);
    const after = state.sliceDoc(range.to, range.to + marker.length);
    const n = marker.length;
    if (before === marker && after === marker) {
      return {
        changes: [{ from: range.from - n, to: range.from }, { from: range.to, to: range.to + n }],
        range: EditorSelection.range(range.from - n, range.to - n),
      };
    }
    if (text.length >= n * 2 && text.startsWith(marker) && text.endsWith(marker)) {
      const inner = text.slice(n, -n);
      return { changes: { from: range.from, to: range.to, insert: inner }, range: EditorSelection.range(range.from, range.from + inner.length) };
    }
    const content = text || filler;
    return {
      changes: { from: range.from, to: range.to, insert: marker + content + marker },
      range: EditorSelection.range(range.from + n, range.from + n + content.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
}

function insertTemplate(view: EditorView, before: string, selectedFallback: string, after: string) {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to) || selectedFallback;
    const insert = before + text + after;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
}

function link(view: EditorView, image = false) {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const label = text || (image ? 'description' : 'link text');
    const head = `${image ? '!' : ''}[${label}](`;
    const url = 'https://';
    const insert = `${head}${url})`;
    // With text selected, select the URL to type over; otherwise select the label.
    const sel = text
      ? EditorSelection.range(range.from + head.length, range.from + head.length + url.length)
      : EditorSelection.range(range.from + head.length - label.length - 2, range.from + head.length - 2);
    return { changes: { from: range.from, to: range.to, insert }, range: sel };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
}

const LINE_PATTERNS = {
  heading: /^#{1,6}\s+/,
  quote: /^>\s?/,
  task: /^[-*+]\s+\[[ xX]\]\s+/,
  ul: /^[-*+]\s+/,
  ol: /^\d+[.)]\s+/,
};

function toggleLines(view: EditorView, kind: 'h1' | 'h2' | 'h3' | 'quote' | 'ul' | 'ol' | 'task') {
  const { state } = view;
  const lines = new Map<number, { from: number; text: string }>();
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to; ) {
      const line = state.doc.lineAt(pos);
      lines.set(line.number, { from: line.from, text: line.text });
      pos = line.to + 1;
    }
  }
  const list = [...lines.values()];
  const strip = (text: string) => {
    const indent = /^\s*/.exec(text)![0];
    let body = text.slice(indent.length);
    for (const re of [LINE_PATTERNS.task, LINE_PATTERNS.ul, LINE_PATTERNS.ol]) body = body.replace(re, '');
    return { indent, body };
  };

  const changes: { from: number; to: number; insert: string }[] = [];
  if (kind === 'h1' || kind === 'h2' || kind === 'h3') {
    const want = '#'.repeat(Number(kind[1])) + ' ';
    const allHave = list.every((l) => l.text.startsWith(want) && !l.text.startsWith(want.trim() + '#'));
    for (const l of list) {
      const body = l.text.replace(LINE_PATTERNS.heading, '');
      changes.push({ from: l.from, to: l.from + l.text.length, insert: allHave ? body : want + body });
    }
  } else if (kind === 'quote') {
    const allHave = list.every((l) => LINE_PATTERNS.quote.test(l.text));
    for (const l of list) {
      changes.push({ from: l.from, to: l.from + l.text.length, insert: allHave ? l.text.replace(LINE_PATTERNS.quote, '') : `> ${l.text}` });
    }
  } else {
    const test = (text: string) => {
      const body = text.trimStart();
      if (kind === 'task') return LINE_PATTERNS.task.test(body);
      if (kind === 'ul') return LINE_PATTERNS.ul.test(body) && !LINE_PATTERNS.task.test(body);
      return LINE_PATTERNS.ol.test(body);
    };
    const allHave = list.every((l) => test(l.text));
    list.forEach((l, i) => {
      const { indent, body } = strip(l.text);
      const marker = kind === 'ul' ? '- ' : kind === 'task' ? '- [ ] ' : `${i + 1}. `;
      changes.push({ from: l.from, to: l.from + l.text.length, insert: allHave ? indent + body : indent + marker + body });
    });
  }
  view.dispatch({ changes, scrollIntoView: true, userEvent: 'input.format' });
}

function insertBlock(view: EditorView, block: string, selectInside?: [number, number]) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const line = state.doc.lineAt(from);
  const atLineStart = from === line.from;
  const lead = atLineStart ? (line.number > 1 && state.doc.line(line.number - 1).text.trim() ? '\n' : '') : '\n\n';
  const insert = `${lead}${block}\n`;
  const base = from + lead.length;
  view.dispatch({
    changes: { from, to, insert },
    selection: selectInside
      ? EditorSelection.range(base + selectInside[0], base + selectInside[1])
      : EditorSelection.cursor(from + insert.length),
    scrollIntoView: true,
    userEvent: 'input.format',
  });
}

export function applyFormat(view: EditorView, action: FormatAction) {
  const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  switch (action) {
    case 'bold': wrap(view, '**', 'bold text'); break;
    case 'italic': wrap(view, '*', 'italic text'); break;
    case 'strike': wrap(view, '~~', 'struck text'); break;
    case 'code': wrap(view, '`', 'code'); break;
    case 'link': link(view); break;
    case 'image': link(view, true); break;
    case 'h1': case 'h2': case 'h3': case 'quote': case 'ul': case 'ol': case 'task':
      toggleLines(view, action);
      break;
    case 'codeblock':
      if (sel) insertTemplate(view, '```\n', '', '\n```');
      else insertBlock(view, '```\n\n```', [4, 4]);
      break;
    case 'hr': insertBlock(view, '---\n'); break;
    case 'table':
      insertBlock(view, '| Column | Column |\n| ------ | ------ |\n| Cell   | Cell   |', [2, 8]);
      break;
  }
  view.focus();
}

const formatKeymap = keymap.of([
  { key: 'Mod-b', run: (v) => (applyFormat(v, 'bold'), true) },
  { key: 'Mod-i', run: (v) => (applyFormat(v, 'italic'), true) },
  { key: 'Mod-e', run: (v) => (applyFormat(v, 'code'), true) },
  { key: 'Mod-k', run: (v) => (applyFormat(v, 'link'), true) },
  { key: 'Mod-Shift-x', run: (v) => (applyFormat(v, 'strike'), true) },
]);

// ---------------------------------------------------------------- editor

export interface EditorCallbacks {
  onChange: (text: string) => void;
  onCursor: (line: number, col: number) => void;
}

export class MarkdownEditor {
  readonly view: EditorView;
  private extensions: Extension[];

  constructor(parent: HTMLElement, doc: string, cb: EditorCallbacks) {
    this.extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(highlight),
      formatKeymap,
      keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
      theme,
      placeholder('Start writing Markdown here…'),
      EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Markdown source' }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((tr) => tr.annotation(fromOutside))) {
          cb.onChange(u.state.doc.toString());
        }
        if (u.docChanged || u.selectionSet) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          cb.onCursor(line.number, head - line.from + 1);
        }
      }),
    ];
    this.view = new EditorView({ parent, state: EditorState.create({ doc, extensions: this.extensions }) });
  }

  get text() {
    return this.view.state.doc.toString();
  }

  /** Apply text that changed elsewhere (the preview), touching only the part that differs. */
  setText(next: string) {
    const prev = this.text;
    if (prev === next) return;
    let start = 0;
    const min = Math.min(prev.length, next.length);
    while (start < min && prev.charCodeAt(start) === next.charCodeAt(start)) start++;
    let endPrev = prev.length;
    let endNext = next.length;
    while (endPrev > start && endNext > start && prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)) {
      endPrev--;
      endNext--;
    }
    this.view.dispatch({
      changes: { from: start, to: endPrev, insert: next.slice(start, endNext) },
      annotations: [fromOutside.of(true)],
    });
  }

  /** Replace the whole document and its undo history (switching documents). */
  load(text: string) {
    this.view.setState(EditorState.create({ doc: text, extensions: this.extensions }));
    this.view.scrollDOM.scrollTop = 0;
  }

  format(action: FormatAction) {
    applyFormat(this.view, action);
  }

  focus() {
    this.view.focus();
  }

  private docTop() {
    const scroller = this.view.scrollDOM;
    return this.view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
  }

  /** Source line (fractional, 0-based) at the top of the editor viewport. */
  topLine(): number {
    const { view } = this;
    const height = Math.max(0, view.scrollDOM.scrollTop - this.docTop());
    const block = view.lineBlockAtHeight(height);
    const lineNo = view.state.doc.lineAt(block.from).number - 1;
    const frac = Math.min(1, Math.max(0, (height - block.top) / Math.max(1, block.height)));
    return lineNo + frac;
  }

  scrollToLine(line: number) {
    const { view } = this;
    const doc = view.state.doc;
    const n = Math.min(doc.lines, Math.max(1, Math.floor(line) + 1));
    const block = view.lineBlockAt(doc.line(n).from);
    const frac = line - Math.floor(line);
    view.scrollDOM.scrollTop = block.top + frac * block.height + this.docTop();
  }

  destroy() {
    this.view.destroy();
  }
}
