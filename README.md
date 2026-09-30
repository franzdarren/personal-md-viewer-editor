# md-preview — Markdown live preview

Write Markdown on the left, see it rendered on the right, and edit **either** side. Changes you make in the rendered preview are turned back into Markdown. Everything is saved in your browser as you type.

## Features

- **Two-way editing.** Type in the Markdown or directly in the preview. Only the blocks you edit in the preview are rewritten; the rest of your Markdown stays exactly as you wrote it. Edited blocks get a red mark in the margin until you click out of the preview.
- **Autosave.** Saved to `localStorage` about 0.4 s after you stop typing, and again when the tab is hidden or closed. A refresh or an accidental close keeps your work.
- **Dark mode by default.** Switch between dark and light from the toolbar; the choice is saved in your browser.
- **Several documents.** Create, switch and delete from the Documents drawer (click the md-preview logo). Titles come from the first heading.
- **GitHub-style Markdown**: tables, task lists (tick a box in the preview and only that `[ ]` changes), strikethrough, fenced code with syntax highlighting and a Copy button.
- **Math** with `$inline$` and `$$display$$` (KaTeX), and **diagrams** in ` ```mermaid ` blocks. Both load only when a document uses them.
- **Export**: download `.md` or a standalone `.html`, print / save as PDF, copy Markdown or HTML, or copy a share link that contains the whole document.
- **Open files** with Ctrl/⌘+O or by dropping a `.md` file anywhere on the window.
- Formatting toolbar and shortcuts, synced scrolling, resizable panes, word count and reading time, phone-friendly layout.

Press the **?** button in the app for the full list of shortcuts.

## Run it on your computer

You need **Node.js 20.19 or newer**
   ```bash
   npm install
   npm run dev
   ```
   It prints `Local: http://localhost:5173/`. Open that address in your browser. Saving a source file reloads the page automatically. Press `Ctrl+C` in the terminal to stop it.
4. Optional: check the production build the same way Vercel will run it:
   ``` bash
   npm run build
   npm run preview
   ```

## Where the data lives

Documents are stored in your browser's `localStorage`. Nothing is sent to a server, and each browser (and each deployment URL) has its own separate storage. Clearing site data deletes the documents, so use **Export → Download Markdown** for anything important. Browsers usually allow about 5 MB, which is plenty for text; if it ever fills up, the status bar turns red and the app warns you.

Share links carry the whole document inside the URL (compressed), so no server is involved. Very long documents make very long links; sending the `.md` file is safer for those.

## Good to know about editing the preview

- A block you edit in the preview is converted to standard Markdown, so its formatting can change slightly (for example `__bold__` becomes `**bold**`, or `*` bullets become `-`). Blocks you don't touch are never rewritten.
- Math, diagrams and raw HTML are locked in the preview. Edit those in the Markdown pane.
- In the preview, hold Ctrl (⌘ on Mac) and click a link to open it; a plain click places the cursor so you can edit the link text.

## Project layout

```
index.html              page shell; applies the saved theme before first paint
src/main.tsx            entry point: fonts, styles, <App>
src/bootstrap.ts        first-run welcome doc, share links, loading saved state
src/App.tsx             layout and wiring: panes, toolbar, saving, export, shortcuts
src/components/         FormatBar, DocsDrawer, HelpDialog, Menu, StatusBar
src/lib/markdown.ts     Markdown → blocks → HTML (marked, DOMPurify, highlight.js, math)
src/lib/preview.ts      the editable preview and the preview → Markdown sync
src/lib/toMarkdown.ts   HTML → Markdown rules for edited blocks (turndown)
src/lib/editor.ts       the Markdown editor (CodeMirror 6) and formatting commands
src/lib/storage.ts      localStorage documents and settings
src/lib/exporting.ts    downloads, clipboard, standalone HTML export
src/styles/             markdown.css (document + colours), app.css (interface)
```

### How the two-way sync works

The Markdown is split into top-level blocks (paragraph, list, table…), and each block is rendered into its own wrapper in the preview, remembering its exact source text. When you type in the preview, the blocks your edit touched are marked dirty. The new Markdown is the original text of every clean block plus a fresh conversion of each dirty block. That text is pushed into the editor as a minimal change, so undo history and the cursor on the Markdown side are preserved.
