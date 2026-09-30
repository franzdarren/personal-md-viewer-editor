import { parseBlocks, renderBlock, escapeHtml, type Block } from './markdown';
import { htmlToMarkdown } from './toMarkdown';

export type FormatAction =
  | 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'image'
  | 'h1' | 'h2' | 'h3' | 'quote' | 'ul' | 'ol' | 'task'
  | 'codeblock' | 'table' | 'hr';

type Theme = 'light' | 'dark';

let katexPromise: Promise<typeof import('katex').default> | null = null;
export function loadKatex() {
  katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default);
  return katexPromise;
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then((m) => m.default);
  return mermaidPromise;
}
let mermaidCounter = 0;

const TABLE_TEMPLATE =
  '<table><thead><tr><th>Column</th><th>Column</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p><br></p>';

/**
 * Owns the preview DOM. React never touches the inside of the preview:
 * this class renders Markdown into it block by block, and — when the
 * preview is edited — turns only the edited blocks back into Markdown.
 */
export class PreviewController {
  private blocks: Block[] = [];
  private els: HTMLElement[] = [];
  private prefix = '';
  private linksKey = '';
  private lineCount = 1;
  private lastMarkdown = '';

  private blockOf = new WeakMap<HTMLElement, Block>();
  private snapshots = new WeakMap<HTMLElement, string>();
  private dirty = new Set<HTMLElement>();
  private domEdited = false;
  private syncTimer = 0;
  private caretBlock: HTMLElement | null = null;
  private theme: Theme = 'light';
  private editable = true;

  constructor(
    readonly root: HTMLElement,
    readonly scroller: HTMLElement,
    private onChange: (markdown: string) => void,
  ) {
    root.addEventListener('beforeinput', this.onBeforeInput);
    root.addEventListener('input', this.onInput);
    root.addEventListener('keydown', this.onKeyDown);
    root.addEventListener('click', this.onClick);
    root.addEventListener('mousedown', this.onMouseDown);
    root.addEventListener('focusout', this.onFocusOut);
    document.addEventListener('selectionchange', this.onSelectionChange);
    this.setEditable(true);
  }

  destroy() {
    const { root } = this;
    root.removeEventListener('beforeinput', this.onBeforeInput);
    root.removeEventListener('input', this.onInput);
    root.removeEventListener('keydown', this.onKeyDown);
    root.removeEventListener('click', this.onClick);
    root.removeEventListener('mousedown', this.onMouseDown);
    root.removeEventListener('focusout', this.onFocusOut);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    window.clearTimeout(this.syncTimer);
  }

  get isEditable() {
    return this.editable;
  }

  // ---------------------------------------------------------------- render

  render(markdown: string, force = false) {
    this.lastMarkdown = markdown;
    const parsed = parseBlocks(markdown);
    const next = parsed.blocks;
    const full = force || this.domEdited || parsed.linksKey !== this.linksKey || this.els.length !== this.blocks.length;
    this.prefix = parsed.prefix;
    this.linksKey = parsed.linksKey;
    this.lineCount = parsed.lineCount;

    if (full) {
      const top = this.scroller.scrollTop;
      this.els = next.map((b) => this.createEl(b));
      this.root.replaceChildren(...this.els);
      this.dirty.clear();
      this.domEdited = false;
      this.scroller.scrollTop = top;
    } else {
      // Keep the unchanged blocks at the start and end, rebuild the middle.
      const old = this.blocks;
      let p = 0;
      while (p < old.length && p < next.length && old[p].raw === next[p].raw) p++;
      let s = 0;
      while (
        s < old.length - p &&
        s < next.length - p &&
        old[old.length - 1 - s].raw === next[next.length - 1 - s].raw
      ) s++;

      for (let k = 0; k < p; k++) this.bind(this.els[k], next[k]);
      for (let k = 1; k <= s; k++) this.bind(this.els[old.length - k], next[next.length - k]);

      const anchor = this.els[old.length - s] ?? null;
      this.els.slice(p, old.length - s).forEach((e) => e.remove());
      const inserted = next.slice(p, next.length - s).map((b) => this.createEl(b));
      inserted.forEach((e) => this.root.insertBefore(e, anchor));
      this.els = [...this.els.slice(0, p), ...inserted, ...this.els.slice(old.length - s)];
    }
    this.blocks = next;
    this.updateMarks();
    this.renderAsync();
  }

  /** Re-render from the last known Markdown, dropping any in-progress DOM edits. */
  refresh() {
    this.render(this.lastMarkdown, true);
  }

  private bind(el: HTMLElement, block: Block) {
    this.blockOf.set(el, block);
    el.dataset.line = String(block.line);
  }

  private createEl(block: Block): HTMLElement {
    const el = document.createElement('div');
    el.className = 'md-block';
    const html = renderBlock(block);
    el.innerHTML = html;
    if (block.kind === 'hidden' || !html.trim()) {
      el.hidden = true;
      el.contentEditable = 'false';
    } else if (block.kind !== 'md') {
      // Raw HTML, math and diagrams are edited in the Markdown pane.
      el.contentEditable = 'false';
      el.classList.add('is-locked');
      el.title = 'Edit this block in the Markdown pane';
    }
    this.enhance(el, block);
    this.bind(el, block);
    this.snapshots.set(el, el.innerHTML);
    return el;
  }

  private enhance(el: HTMLElement, block: Block) {
    el.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((cb) => {
      cb.removeAttribute('disabled');
      cb.tabIndex = -1;
      cb.closest('li')?.classList.add('task-item');
    });
    el.querySelectorAll('.math-inline').forEach((m) => m.setAttribute('contenteditable', 'false'));
    // The sanitizer drops attribute values that look like markup (a diagram's "-->" arrows, TeX's "]>"),
    // so the source is also kept as text and restored here.
    el.querySelectorAll<HTMLElement>('.math-inline, .math-block').forEach((m) => {
      if (m.dataset.tex === undefined) m.dataset.tex = m.textContent ?? '';
    });
    el.querySelectorAll<HTMLElement>('.mermaid-block').forEach((d) => {
      if (d.dataset.source === undefined) d.dataset.source = d.querySelector('.mermaid-source')?.textContent ?? '';
    });
    el.querySelectorAll('a[href]').forEach((a) => a.setAttribute('title', `${a.getAttribute('href')}\nCtrl/⌘ + click to open`));

    if (block.kind === 'md' && block.tokens[0].type === 'code') {
      const pre = el.querySelector(':scope > pre');
      if (pre) {
        const lang = ((pre.querySelector('code')?.className || '').match(/language-(\S+)/) || [])[1] || 'text';
        const bar = document.createElement('div');
        bar.className = 'code-toolbar';
        bar.setAttribute('data-ui', '');
        bar.contentEditable = 'false';
        bar.innerHTML = `<span class="code-lang">${escapeHtml(lang)}</span><button type="button" class="code-copy" data-ui>Copy</button>`;
        el.insertBefore(bar, pre);
        el.classList.add('has-code');
      }
    }
  }

  private async renderAsync() {
    const math = Array.from(this.root.querySelectorAll<HTMLElement>('.math-inline:not([data-done]), .math-block:not([data-done])'));
    if (math.length) {
      try {
        const katex = await loadKatex();
        for (const m of math) {
          if (!m.isConnected || m.dataset.done) continue;
          katex.render(m.dataset.tex ?? '', m, {
            displayMode: m.classList.contains('math-block') || m.classList.contains('math-display'),
            throwOnError: false,
          });
          m.dataset.done = '1';
          this.resnapshot(m);
        }
      } catch {
        /* leave the TeX source visible */
      }
    }

    const diagrams = Array.from(this.root.querySelectorAll<HTMLElement>('.mermaid-block')).filter(
      (d) => d.dataset.done !== this.theme,
    );
    if (diagrams.length) {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          // Diagram colours follow Tinta's ink-and-paper palette.
          theme: 'base',
          themeVariables:
            this.theme === 'dark'
              ? {
                  darkMode: true, background: '#1a2032', primaryColor: '#232b44', primaryTextColor: '#dde2ee',
                  primaryBorderColor: '#6f82d6', lineColor: '#9aa2b9', secondaryColor: '#2a2438',
                  tertiaryColor: '#1f2638', edgeLabelBackground: '#1a2032', textColor: '#dde2ee',
                }
              : {
                  background: '#fdfdfc', primaryColor: '#eef1fb', primaryTextColor: '#1d2230',
                  primaryBorderColor: '#2b45b5', lineColor: '#596175', secondaryColor: '#fbeeec',
                  tertiaryColor: '#f5f6f9', edgeLabelBackground: '#fdfdfc', textColor: '#1d2230',
                },
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        });
        for (const d of diagrams) {
          if (!d.isConnected || d.dataset.done === this.theme) continue;
          const source = d.dataset.source ?? '';
          const id = `mmd-${++mermaidCounter}`;
          try {
            await mermaid.parse(source);
            const { svg } = await mermaid.render(id, source);
            d.innerHTML = svg;
          } catch (err) {
            document.getElementById(id)?.remove();
            document.getElementById(`d${id}`)?.remove();
            const msg = err instanceof Error ? err.message : String(err);
            d.innerHTML = `<div class="diagram-error">This diagram has a syntax error: ${escapeHtml(msg.split('\n')[0])}</div><pre class="mermaid-source">${escapeHtml(source)}</pre>`;
          }
          d.dataset.done = this.theme;
          this.resnapshot(d);
        }
      } catch {
        /* diagram library failed to load; the source stays visible */
      }
    }
  }

  private resnapshot(node: HTMLElement) {
    const wrapper = this.wrapperOf(node);
    if (wrapper && !this.dirty.has(wrapper)) this.snapshots.set(wrapper, wrapper.innerHTML);
  }

  setTheme(theme: Theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.renderAsync();
  }

  setEditable(on: boolean) {
    this.editable = on;
    this.root.contentEditable = on ? 'true' : 'false';
    this.root.spellcheck = on;
    if (on) {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, 'false');
    }
  }

  // --------------------------------------------------------- edit tracking

  private wrapperOf(node: Node | null): HTMLElement | null {
    let n: Node | null = node;
    while (n && n.parentNode !== this.root) n = n.parentNode;
    return n instanceof HTMLElement && this.blockOf.has(n) ? n : null;
  }

  private mark(el: HTMLElement | null) {
    if (!el || el.hidden || el.contentEditable === 'false') return;
    this.dirty.add(el);
  }

  private markRange(r: AbstractRange) {
    const a = this.wrapperOf(r.startContainer);
    const b = this.wrapperOf(r.endContainer);
    if (!a || !b || a === b) {
      this.mark(a);
      this.mark(b);
      return;
    }
    let n: Element | null = a;
    while (n) {
      if (n instanceof HTMLElement) this.mark(n);
      if (n === b) break;
      n = n.nextElementSibling;
    }
  }

  private markSelection() {
    const sel = document.getSelection();
    if (sel && sel.rangeCount && this.root.contains(sel.anchorNode)) this.markRange(sel.getRangeAt(0));
  }

  private markChangedSinceRender() {
    for (const el of this.els) {
      if (el.isConnected && el.innerHTML !== this.snapshots.get(el)) this.mark(el);
    }
  }

  private onBeforeInput = (e: InputEvent) => {
    for (const r of e.getTargetRanges()) this.markRange(r);
    this.markSelection();
  };

  private onInput = (e: Event) => {
    if (e.target !== this.root) return; // e.g. a checkbox
    const type = (e as InputEvent).inputType || '';
    if (type.startsWith('history') || type === '') this.markChangedSinceRender();
    this.markSelection();
    this.domEdited = true;
    this.scheduleSync();
  };

  private scheduleSync() {
    window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => this.syncNow(), 60);
  }

  /** Push pending preview edits to the Markdown source right away. */
  syncNow() {
    window.clearTimeout(this.syncTimer);
    if (!this.domEdited) return;
    const md = this.buildMarkdown();
    this.updateMarks();
    if (md !== this.lastMarkdown) {
      this.lastMarkdown = md;
      this.onChange(md);
    }
  }

  /** Rebuild the full Markdown: original text for untouched blocks, converted HTML for edited ones. */
  private buildMarkdown(): string {
    let out = this.prefix;
    let lastWasGenerated = false;
    const pushGenerated = (md: string) => {
      if (!md) return;
      if (out && !out.endsWith('\n\n')) out = out.replace(/\n*$/, '\n\n');
      out += `${md}\n\n`;
      lastWasGenerated = true;
    };

    let loose: Node[] = [];
    const flushLoose = () => {
      if (!loose.length) return;
      const tmp = document.createElement('div');
      loose.forEach((n) => tmp.appendChild(n.cloneNode(true)));
      pushGenerated(htmlToMarkdown(tmp));
      loose = [];
    };

    for (const node of Array.from(this.root.childNodes)) {
      const block = node instanceof HTMLElement ? this.blockOf.get(node) : undefined;
      if (!block) {
        loose.push(node);
        continue;
      }
      flushLoose();
      if (this.dirty.has(node as HTMLElement)) {
        pushGenerated(htmlToMarkdown(node as HTMLElement));
      } else {
        if (lastWasGenerated && !out.endsWith('\n\n')) out += '\n\n';
        out += block.raw;
        lastWasGenerated = false;
      }
    }
    flushLoose();
    if (lastWasGenerated) out = out.replace(/\n+$/, '\n');
    return out;
  }

  private onFocusOut = () => {
    window.setTimeout(() => {
      if (this.root.contains(document.activeElement)) return; // window switch, not a real blur
      this.commit();
    }, 0);
  };

  /** Finish a preview editing session: sync, then re-render cleanly from Markdown. */
  commit() {
    this.syncNow();
    if (this.domEdited) this.refresh();
  }

  private onSelectionChange = () => {
    const sel = document.getSelection();
    const inside = !!sel?.anchorNode && this.root.contains(sel.anchorNode) && this.editable;
    const block = inside ? this.wrapperOf(sel!.anchorNode) : null;
    if (block === this.caretBlock) return;
    this.caretBlock?.classList.remove('has-caret');
    block?.classList.add('has-caret');
    this.caretBlock = block;
  };

  private updateMarks() {
    for (const el of this.els) el.classList.toggle('is-edited', this.dirty.has(el) && el.isConnected);
  }

  // ------------------------------------------------------------ interaction

  private onMouseDown = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ui]')) e.preventDefault();
  };

  private onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;

    if (t instanceof HTMLInputElement && t.type === 'checkbox') {
      e.preventDefault();
      const next = !t.hasAttribute('checked');
      window.setTimeout(() => this.toggleTask(t, next), 0);
      return;
    }

    const copy = t.closest('.code-copy');
    if (copy) {
      const pre = copy.closest('.md-block')?.querySelector('pre');
      if (pre) {
        navigator.clipboard?.writeText((pre.textContent || '').replace(/\n$/, '')).then(() => {
          copy.textContent = 'Copied';
          window.setTimeout(() => (copy.textContent = 'Copy'), 1400);
        });
      }
      return;
    }

    const link = t.closest('a');
    if (link && link.href && (e.ctrlKey || e.metaKey || !this.editable)) {
      e.preventDefault();
      if (link.getAttribute('href')?.startsWith('#')) {
        const target = this.root.querySelector(`[id="${CSS.escape(link.hash.slice(1))}"]`);
        target?.scrollIntoView({ block: 'start' });
      } else {
        window.open(link.href, '_blank', 'noopener,noreferrer');
      }
    }
  };

  /** Toggling a checkbox changes exactly one character in the Markdown. */
  private toggleTask(cb: HTMLInputElement, checked: boolean) {
    cb.checked = checked;
    if (checked) cb.setAttribute('checked', '');
    else cb.removeAttribute('checked');

    const wrapper = this.wrapperOf(cb);
    if (!wrapper) return;
    const block = this.blockOf.get(wrapper)!;
    const boxes = Array.from(wrapper.querySelectorAll('input[type=checkbox]'));
    const matches = [...block.raw.matchAll(/^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/gm)];

    if (!this.dirty.has(wrapper) && matches.length === boxes.length) {
      const m = matches[boxes.indexOf(cb)];
      const pos = m.index! + m[1].length + 1;
      block.raw = block.raw.slice(0, pos) + (checked ? 'x' : ' ') + block.raw.slice(pos + 1);
      this.snapshots.set(wrapper, wrapper.innerHTML);
      const md = this.buildMarkdown();
      this.lastMarkdown = md;
      this.onChange(md);
    } else {
      this.dirty.add(wrapper);
      this.domEdited = true;
      this.syncNow();
      if (!this.root.contains(document.activeElement)) this.refresh();
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.editable || e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Enter' && !mod && this.selectionIn('pre')) {
      // A newline inside the code, not a new block (insertText with "\n" would split the <pre>).
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }
    if (e.key === 'Tab' && this.selectionIn('pre')) {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      return;
    }
    if (mod && !e.shiftKey && !e.altKey) {
      const map: Record<string, FormatAction> = { k: 'link', e: 'code' };
      const action = map[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        this.format(action);
      }
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      this.format('strike');
    }
  };

  private selectionIn(selector: string): boolean {
    const sel = document.getSelection();
    const node = sel?.anchorNode;
    const elNode = node instanceof Element ? node : node?.parentElement;
    const hit = elNode?.closest(selector);
    return !!hit && this.root.contains(hit);
  }

  /** True when the text cursor is inside the editable preview. */
  hasSelection(): boolean {
    const sel = document.getSelection();
    return this.editable && !!sel?.rangeCount && this.root.contains(sel.anchorNode);
  }

  /** Apply a toolbar action at the preview's cursor. Returns false if the preview isn't the active target. */
  format(action: FormatAction): boolean {
    if (!this.hasSelection()) return false;
    const sel = document.getSelection()!;
    const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);
    this.markSelection();

    switch (action) {
      case 'bold': exec('bold'); break;
      case 'italic': exec('italic'); break;
      case 'strike': exec('strikeThrough'); break;
      case 'code': {
        const text = sel.toString() || 'code';
        exec('insertHTML', `<code>${escapeHtml(text)}</code>&#8203;`);
        break;
      }
      case 'link': {
        const text = sel.toString();
        const url = window.prompt('Link address', 'https://');
        if (!url) return true;
        if (text) exec('createLink', url);
        else exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
        break;
      }
      case 'image': {
        const url = window.prompt('Image address', 'https://');
        if (!url) return true;
        exec('insertHTML', `<img src="${escapeHtml(url)}" alt="">`);
        break;
      }
      case 'h1':
      case 'h2':
      case 'h3': {
        const current = String(document.queryCommandValue('formatBlock')).toLowerCase();
        exec('formatBlock', current === action ? '<p>' : `<${action}>`);
        break;
      }
      case 'quote': exec('formatBlock', '<blockquote>'); break;
      case 'ul': exec('insertUnorderedList'); break;
      case 'ol': exec('insertOrderedList'); break;
      case 'task': exec('insertHTML', '<ul><li><input type="checkbox"> Task</li></ul>'); break;
      case 'codeblock': exec('formatBlock', '<pre>'); break;
      case 'hr': exec('insertHorizontalRule'); break;
      case 'table': exec('insertHTML', TABLE_TEMPLATE); break;
    }
    this.markSelection();
    this.domEdited = true;
    this.scheduleSync();
    return true;
  }

  // ---------------------------------------------------------- scroll sync

  private positions() {
    const out: { top: number; line: number }[] = [];
    for (const el of this.els) {
      if (!el.isConnected || el.hidden) continue;
      out.push({ top: el.offsetTop, line: this.blockOf.get(el)!.line });
    }
    return out;
  }

  /** Source line (fractional) at the top of the preview viewport. */
  topLine(): number {
    const pos = this.positions();
    if (!pos.length) return 0;
    const base = pos[0].top;
    const y = this.scroller.scrollTop + base;
    let i = 0;
    while (i + 1 < pos.length && pos[i + 1].top <= y) i++;
    const a = pos[i];
    const b = pos[i + 1] ?? { top: this.root.offsetTop + this.root.offsetHeight, line: this.lineCount };
    const frac = Math.min(1, Math.max(0, (y - a.top) / Math.max(1, b.top - a.top)));
    return a.line + frac * (b.line - a.line);
  }

  scrollToLine(line: number) {
    const pos = this.positions();
    if (!pos.length) return;
    const base = pos[0].top;
    let i = 0;
    while (i + 1 < pos.length && pos[i + 1].line <= line) i++;
    const a = pos[i];
    const b = pos[i + 1] ?? { top: this.root.offsetTop + this.root.offsetHeight, line: this.lineCount };
    const frac = Math.min(1, Math.max(0, (line - a.line) / Math.max(1, b.line - a.line)));
    this.scroller.scrollTop = a.top + frac * (b.top - a.top) - base;
  }

  // --------------------------------------------------------------- export

  /** Clean HTML of the rendered document, without editor-only markup. */
  cleanHtml(): string {
    const clone = this.root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-ui]').forEach((n) => n.remove());
    clone.querySelectorAll('[hidden]').forEach((n) => n.remove());
    clone.querySelectorAll('input[type=checkbox]').forEach((n) => n.setAttribute('disabled', ''));
    clone.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
    clone.querySelectorAll('[data-done]').forEach((n) => n.removeAttribute('data-done'));
    clone.querySelectorAll('a[title]').forEach((n) => n.removeAttribute('title'));
    clone.querySelectorAll('.md-block').forEach((block) => block.replaceWith(...Array.from(block.childNodes)));
    return clone.innerHTML.trim();
  }

  hasMath(): boolean {
    return !!this.root.querySelector('.math-inline, .math-block');
  }
}
