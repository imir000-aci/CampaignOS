# CampaignOS Form Autofill

A Chrome extension (Manifest V3) that lives in the browser **side panel**. It silently
captures the answers you enter into web forms — dropdowns, checkboxes, radio buttons,
dates, URLs, and free‑form text — into a private, local knowledge base, and then
**auto‑fills** future forms whose questions are the same or *similar*.

## How matching works (hybrid)

1. **Local fuzzy match** — every captured question is normalized and scored against the
   fields on the current page using a blend of token overlap (Jaccard), character
   trigram overlap, and edit distance. Exact normalized matches short‑circuit.
2. **Claude semantic fallback** — when the best local score is only *moderately*
   confident, the top candidates are sent to the Claude API in a single batched request
   to decide the true match. This runs only if you provide an API key in Settings and is
   entirely optional — with no key, the extension works fully offline using local
   matching alone.

All captured data lives in `chrome.storage.local` on your machine. Only field *labels*
(never values) are sent to the Claude API, and only for fields in the moderate‑confidence
band.

## Development

```bash
npm install
npm run dev      # Vite dev server with HMR for the side panel
npm run build    # type-check + production build into dist/
```

### Load the extension

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Click the toolbar icon to open the side panel.

### Try it

Two sample pages live in `test/`:

- `test/form-a.html` — fill it in; entries appear in the side panel's **Answers** tab.
- `test/form-b.html` — the same questions plus reworded variants; reload and confident
  fields auto‑fill. Check the **Suggestions** tab to see what was filled (and undo).

Open them with `file://` URLs (enable "Allow access to file URLs" for the extension on
`chrome://extensions` if you want capture/autofill on local files).

## Architecture

```
manifest.config.ts            MV3 manifest
src/
  content/collector.ts        field extraction, capture listeners, autofill orchestration
  content/fill.ts             framework-safe value setters
  background/service-worker.ts storage owner + matching engine + Claude calls
  shared/                     types, normalize, matching, storage, messaging, anthropic
  sidepanel/                  React side panel (Answers / Suggestions / Settings)
```

## Privacy

- Passwords, one‑time codes, and credit‑card fields are never captured.
- A per‑domain allow/deny list and global capture/autofill toggles are in Settings.
- "Clear all data" wipes the knowledge base.
