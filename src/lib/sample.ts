export const SAMPLE = `# Welcome to Tinta

Write Markdown on the left and watch it render on the right. **The right side is editable too** — click into this paragraph, change a word, and the Markdown on the left follows.

Everything you type is saved in this browser as you go, so a refresh or an accidental close won't lose your work.

## What you can do in the preview

- Type, delete and press Enter like in any document
- Use **Ctrl/⌘ + B** for bold, **Ctrl/⌘ + I** for italic, **Ctrl/⌘ + K** for a link
- Tick a checkbox and only that \`[ ]\` changes in the source
- Hold **Ctrl/⌘** and click a link to open it

Blocks you edit in the preview get a red mark in the margin. When you click away, the preview redraws from the Markdown.

## Tasks

- [x] Write some Markdown
- [ ] Try editing this list in the preview
- [ ] Switch to dark mode with the button at the top right

## Code

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('Baguio'));
\`\`\`

Inline code looks like \`npm run dev\`.

## Tables

| Shortcut | What it does |
| :-- | :-- |
| Ctrl/⌘ + S | Save now |
| Ctrl/⌘ + O | Open a Markdown file |
| Alt + 1 / 2 / 3 | Editor, split or preview view |
| Ctrl/⌘ + F | Find and replace (in the editor) |

## Quotes

> Markdown is intended to be as easy-to-read and easy-to-write as is feasible.
>
> — John Gruber

## Math

Inline math like $e^{i\\pi} + 1 = 0$ works, and so do display equations:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

## Diagrams

\`\`\`mermaid
flowchart LR
  A[Type in either pane] --> B{Which pane?}
  B -- Markdown --> C[Preview redraws]
  B -- Preview --> D[Edited block becomes Markdown]
  C --> E[(Saved in your browser)]
  D --> E
\`\`\`

---

Start a fresh page from the **Documents** menu at the top left, or drop a \`.md\` file anywhere on this window to open it.
`;
