# Tinta — Markdown live preview

Write Markdown on the left, see it rendered on the right, and edit **either** side. Changes you make in the rendered preview are turned back into Markdown. Everything is saved in your browser as you type.

## Features

- **Two-way editing.** Type in the Markdown or directly in the preview. Only the blocks you edit in the preview are rewritten; the rest of your Markdown stays exactly as you wrote it. Edited blocks get a red mark in the margin until you click out of the preview.
- **Autosave.** Saved to `localStorage` about 0.4 s after you stop typing, and again when the tab is hidden or closed. A refresh or an accidental close keeps your work.
- **Dark mode.** Light, Dark or Match my system. Applied before the page draws, so there's no white flash.
- **Several documents.** Create, switch and delete from the Documents drawer (click the Tinta logo). Titles come from the first heading.
- **GitHub-style Markdown**: tables, task lists (tick a box in the preview and only that `[ ]` changes), strikethrough, fenced code with syntax highlighting and a Copy button.
- **Math** with `$inline$` and `$$display$$` (KaTeX), and **diagrams** in ` ```mermaid ` blocks. Both load only when a document uses them.
- **Export**: download `.md` or a standalone `.html`, print / save as PDF, copy Markdown or HTML, or copy a share link that contains the whole document.
- **Open files** with Ctrl/⌘+O or by dropping a `.md` file anywhere on the window.
- Formatting toolbar and shortcuts, synced scrolling, resizable panes, word count and reading time, phone-friendly layout.

Press the **?** button in the app for the full list of shortcuts.

## Run it on your computer

You need **Node.js 20.19 or newer** (22 LTS is a good choice). To check, open a terminal and run:

```
node --version
```

You should see something like `v22.12.0`. If the command isn't found or the number is lower, install the LTS version from https://nodejs.org and open a new terminal.

1. Unzip the project and open a terminal **inside the `tinta` folder** (the one that contains `package.json`).
   - VS Code: *File → Open Folder…* → pick `tinta`, then *Terminal → New Terminal*. The terminal opens in the right folder.
   - Windows Explorer: open the `tinta` folder, click the address bar, type `cmd` and press Enter.
2. Install the dependencies (takes a minute the first time; it creates a `node_modules` folder):
   ```
   npm install
   ```
   It ends with a line like `added 180 packages`. Warnings about funding are safe to ignore.
3. Start the development server:
   ```
   npm run dev
   ```
   It prints `Local: http://localhost:5173/`. Open that address in your browser. Saving a source file reloads the page automatically. Press `Ctrl+C` in the terminal to stop it.
4. Optional: check the production build the same way Vercel will run it:
   ```
   npm run build
   npm run preview
   ```
   `npm run build` type-checks and writes the site to `dist/`. `npm run preview` serves it at `http://localhost:4173/`.

## Deploy to Vercel

No configuration file is needed; Vercel recognises Vite projects.

### Option A: from GitHub (updates deploy automatically)

1. Create an empty repository on https://github.com/new (for example `tinta`). Don't add a README or .gitignore there; the project already has them.
2. In the terminal, inside the `tinta` folder, run these one at a time (replace `YOUR-USERNAME`):
   ```
   git init
   git add .
   git commit -m "Tinta markdown editor"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/tinta.git
   git push -u origin main
   ```
   `node_modules` and `dist` are excluded by `.gitignore`, so the push is small.
3. Go to https://vercel.com, sign in with GitHub, click **Add New… → Project**, and click **Import** next to the `tinta` repository.
4. On the configuration screen check that:
   - **Framework Preset** says **Vite**
   - **Build Command** is `npm run build` (or left as the default)
   - **Output Directory** is `dist`
5. Click **Deploy**. After about a minute you get a URL like `https://tinta-xxxx.vercel.app`.

From now on, every `git push` to `main` redeploys the site.

### Option B: from the terminal with the Vercel CLI

1. Install the CLI once: `npm install -g vercel`
2. In the `tinta` folder run `vercel`. The first time it asks you to log in (a browser window opens), then asks a few questions. Accept the defaults: it detects Vite, `npm run build` and `dist`.
3. That creates a **preview** deployment and prints its URL. When you're happy, run `vercel --prod` for the production URL.

## Where the data lives

Documents are stored in the browser's `localStorage` under keys starting with `tinta:`. Nothing is sent to a server, and each browser (and each deployment URL) has its own separate storage. Clearing site data deletes the documents, so use **Export → Download Markdown** for anything important. Browsers usually allow about 5 MB, which is plenty for text; if it ever fills up, the status bar turns red and the app warns you.

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
