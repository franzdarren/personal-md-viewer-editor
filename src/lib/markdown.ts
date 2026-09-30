import { Marked, type Token, type TokenizerAndRendererExtension, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

/**
 * The preview is built from "blocks": one per top-level Markdown token
 * (a paragraph, a heading, a list, a table, ...). Each block remembers the
 * exact Markdown it came from, which is what makes editing the preview
 * possible without rewriting the whole document.
 */
export type BlockKind = 'md' | 'html' | 'math' | 'mermaid' | 'hidden';

export interface Block {
  /** Exact source text for this block, including the blank lines after it. */
  raw: string;
  tokens: Token[];
  /** 0-based line where this block starts in the source. */
  line: number;
  kind: BlockKind;
}

export interface ParsedDoc {
  /** Blank lines before the first block. */
  prefix: string;
  blocks: Block[];
  lineCount: number;
  /** Changes when reference-style link definitions change. */
  linksKey: string;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src: string) {
    const m = /(^|\n) {0,3}\$\$/.exec(src);
    return m ? m.index + m[1].length : undefined;
  },
  tokenizer(src: string) {
    const m = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src);
    if (m) return { type: 'mathBlock', raw: m[0], text: m[1].trim() };
    return undefined;
  },
  renderer(token) {
    const tex = String(token.text);
    return `<div class="math-block" data-tex="${escapeHtml(tex)}">${escapeHtml(tex)}</div>\n`;
  },
};

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start(src: string) {
    const i = src.indexOf('$');
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    let m = /^\$\$(?!\$)((?:\\.|[^\\$])+?)\$\$/.exec(src);
    if (m) return { type: 'mathInline', raw: m[0], text: m[1].trim(), display: true };
    // $...$ — no space just inside the dollars and no digit right after,
    // so "costs $5 and $10" stays plain text.
    m = /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<![\s\\])\$(?!\d)/.exec(src);
    if (m) return { type: 'mathInline', raw: m[0], text: m[1], display: false };
    return undefined;
  },
  renderer(token) {
    const tex = String(token.text);
    const cls = token.display ? 'math-inline math-display' : 'math-inline';
    return `<span class="${cls}" data-tex="${escapeHtml(tex)}">${escapeHtml(tex)}</span>`;
  },
};

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  extensions: [mathBlock, mathInline],
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
      if (language === 'mermaid') {
        return `<div class="mermaid-block" data-source="${escapeHtml(text)}"><pre class="mermaid-source">${escapeHtml(text)}</pre></div>\n`;
      }
      let body: string;
      if (language && hljs.getLanguage(language)) {
        body = hljs.highlight(text, { language, ignoreIllegals: true }).value;
      } else {
        body = escapeHtml(text);
      }
      const cls = language ? ` language-${escapeHtml(language)}` : '';
      return `<pre><code class="hljs${cls}">${body}\n</code></pre>\n`;
    },
  },
});

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'script', 'form', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['style'],
  });
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Open tags minus close tags in a chunk of raw HTML. */
function tagBalance(html: string): number {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  let balance = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const name = m[2].toLowerCase();
    if (VOID_TAGS.has(name) || m[3]) continue;
    balance += m[1] ? -1 : 1;
  }
  return balance;
}

const countNewlines = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
};

function kindOf(tokens: Token[]): BlockKind {
  const first = tokens[0];
  if (tokens.length > 1 || first.type === 'html') return 'html';
  if (first.type === 'def') return 'hidden';
  if (first.type === 'mathBlock') return 'math';
  if (first.type === 'code' && ((first as Tokens.Code).lang || '').trim().split(/\s+/)[0].toLowerCase() === 'mermaid') {
    return 'mermaid';
  }
  return 'md';
}

export function parseBlocks(src: string): ParsedDoc {
  const tokens = marked.lexer(src);
  let prefix = '';
  const blocks: Block[] = [];
  let line = 0;
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === 'space') {
      if (blocks.length) blocks[blocks.length - 1].raw += tok.raw;
      else prefix += tok.raw;
      line += countNewlines(tok.raw);
      i++;
      continue;
    }

    const group: Token[] = [tok];
    let end = i + 1;
    // Raw HTML that opens a tag and closes it several tokens later
    // (e.g. <details> ... </details>) is kept together as one block.
    if (tok.type === 'html') {
      let balance = tagBalance(tok.raw);
      if (balance > 0) {
        let j = i + 1;
        while (j < tokens.length && balance > 0) {
          if (tokens[j].type === 'html') balance += tagBalance(tokens[j].raw);
          j++;
        }
        if (balance <= 0) {
          for (let k = i + 1; k < j; k++) group.push(tokens[k]);
          end = j;
        }
      }
    }

    const raw = group.map((t) => t.raw).join('');
    blocks.push({ raw, tokens: group, line, kind: kindOf(group) });
    line += countNewlines(raw);
    i = end;
  }

  return {
    prefix,
    blocks,
    lineCount: countNewlines(src) + 1,
    linksKey: JSON.stringify(tokens.links ?? {}),
  };
}

export function renderBlock(block: Block): string {
  return sanitize(marked.parser(block.tokens));
}

/** Word, character and reading-time counts for the status bar. */
export function computeStats(text: string) {
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  return {
    words,
    chars: text.length,
    lines: countNewlines(text) + 1,
    minutes: words === 0 ? 0 : Math.max(1, Math.round(words / 230)),
  };
}
