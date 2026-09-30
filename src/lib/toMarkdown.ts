import TurndownService from 'turndown';

/**
 * Converts preview HTML back into Markdown. Only blocks the user actually
 * edited in the preview go through here; untouched blocks keep their
 * original Markdown byte-for-byte.
 */
const td = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  br: '\\',
});

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * A lighter escape than Turndown's default: it only escapes characters that
 * would actually change the meaning of the text, so an edited paragraph
 * doesn't fill up with needless backslashes (snake_case stays snake_case).
 */
function escapeText(input: string): string {
  let s = input.replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\');
  s = s.replace(/([*`[~])/g, '\\$1');
  s = s.replace(/<(?=[A-Za-z/!?])/g, '\\<');
  s = s.replace(/&(?=#?[A-Za-z0-9]+;)/g, '\\&');
  s = s.replace(/_/g, (_m, i: number, str: string) => (isWordChar(str[i - 1]) && isWordChar(str[i + 1]) ? '_' : '\\_'));
  if ((s.match(/(?<!\\)\$/g) || []).length > 1) s = s.replace(/(?<!\\)\$/g, '\\$');
  // Things that only mean something at the start of a line.
  s = s
    .replace(/^(\s*)([-+])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)(#{1,6})(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*)>/, '$1\\>')
    .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3')
    .replace(/^(\s*)([=-])(?=\2+\s*$)/, '$1\\$2');
  return s;
}
td.escape = escapeText;

/** Text of a code block, treating <br> and block elements as line breaks. */
function codeText(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.nodeValue ?? '';
    } else if (child.nodeName === 'BR') {
      out += '\n';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const isBlock = child.nodeName === 'DIV' || child.nodeName === 'P';
      if (isBlock && out && !out.endsWith('\n')) out += '\n';
      out += codeText(child);
      if (isBlock && !out.endsWith('\n')) out += '\n';
    }
  });
  return out;
}

function fenceFor(code: string) {
  const longest = Math.max(0, ...(code.match(/`+/g) || []).map((r) => r.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

const el = (node: Node) => node as HTMLElement;

td.remove((node) => el(node).hasAttribute?.('data-ui') || node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE');
td.keep(['kbd', 'sub', 'sup', 'mark', 'u', 'ins', 'abbr']);

td.addRule('strikethrough', {
  filter: (node) => node.nodeName === 'DEL' || node.nodeName === 'S' || node.nodeName === 'STRIKE',
  replacement: (content) => (content.trim() ? `~~${content}~~` : content),
});

td.addRule('taskCheckbox', {
  filter: (node) => node.nodeName === 'INPUT' && (node as HTMLInputElement).type === 'checkbox',
  replacement: (_c, node) => (el(node).hasAttribute('checked') ? '[x] ' : '[ ] '),
});

td.addRule('listItem', {
  filter: 'li',
  replacement(content, node, options) {
    const parent = node.parentNode as HTMLElement | null;
    let prefix = `${options.bulletListMarker} `;
    if (parent?.nodeName === 'OL') {
      const start = Number(parent.getAttribute('start') || 1);
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start + index}. `;
    }
    const indent = ' '.repeat(prefix.length);
    let body = content
      .replace(/^\n+/, '')
      .replace(/\n+$/, '\n')
      .replace(/\n(?!\n|$)/g, `\n${indent}`);
    body = body.replace(/^(\[[ x]\])\s+/, '$1 ');
    const needsBreak = el(node).nextElementSibling && !/\n$/.test(body);
    return prefix + body + (needsBreak ? '\n' : '');
  },
});

td.addRule('codeBlock', {
  filter: 'pre',
  replacement(_c, node) {
    const code = el(node).querySelector('code');
    const lang = ((code?.className || '').match(/language-(\S+)/) || [])[1] || '';
    const text = codeText(code || node).replace(/\n$/, '');
    const fence = fenceFor(text);
    return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
  },
});

td.addRule('mathInline', {
  filter: (node) => node.nodeName === 'SPAN' && el(node).classList.contains('math-inline'),
  replacement(_c, node) {
    const tex = el(node).dataset.tex ?? '';
    return el(node).classList.contains('math-display') ? `$$${tex}$$` : `$${tex}$`;
  },
});

td.addRule('mathBlock', {
  filter: (node) => el(node).classList?.contains('math-block'),
  replacement: (_c, node) => `\n\n$$\n${el(node).dataset.tex ?? ''}\n$$\n\n`,
});

td.addRule('mermaid', {
  filter: (node) => el(node).classList?.contains('mermaid-block'),
  replacement(_c, node) {
    const src = el(node).dataset.source ?? '';
    const fence = fenceFor(src);
    return `\n\n${fence}mermaid\n${src}\n${fence}\n\n`;
  },
});

function cellMarkdown(cell: HTMLTableCellElement): string {
  return td
    .turndown(cell.innerHTML)
    .replace(/\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

td.addRule('table', {
  filter: 'table',
  replacement(_c, node) {
    const rows = Array.from((node as HTMLTableElement).rows);
    if (!rows.length) return '';
    const cells = rows.map((r) => Array.from(r.cells).map(cellMarkdown));
    const cols = Math.max(...cells.map((r) => r.length));
    const aligns = Array.from(rows[0].cells).map((c) => (c.getAttribute('align') || c.style.textAlign || '').toLowerCase());
    const alignMark: Record<string, string> = { left: ':--', right: '--:', center: ':-:' };
    const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ')} |`;
    const sep = `| ${Array.from({ length: cols }, (_, i) => alignMark[aligns[i]] ?? '---').join(' | ')} |`;
    return `\n\n${[line(cells[0]), sep, ...cells.slice(1).map(line)].join('\n')}\n\n`;
  },
});

export function htmlToMarkdown(node: HTMLElement): string {
  return td
    .turndown(node)
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
