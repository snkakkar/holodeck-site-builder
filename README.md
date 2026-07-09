# DEMO-HOLODECK-TEMPLATE

Reusable Salesforce Holodeck template for building customer-specific, browser-based demos with minimal manual coding.

Holodeck is a static web presentation with five sections:

1. Journey Map
2. Intro / narrative framing
3. Meet the persona
4. Demo slides
5. Business Value close

All content is config-driven and rendered by shared HTML/CSS/JS.

## Quick start

```bash
python3 -m http.server 4173
```

Then open:

- Demo: `http://localhost:4173/demo/`
- Builder: `http://localhost:4173/builder/`

No npm install or build step is required.

## Two ways to build

- **Option A - UI Builder (recommended):** guided 9-step flow for non-technical SEs, ending in one-click ZIP export.
- **Option B - direct config edit:** update `demo/holodeck.config.js` manually (see `HOW_TO_BUILD_HOLODECK.md`).

## Builder workflow (current)

The Builder now uses a 9-step flow:

1. Setup
2. Script & Story
3. Story Foundations
4. Recommended Narrative
5. Slide Selection
6. Assets (optional uploads)
7. CX Components (optional)
8. Preview
9. Export

### Key Builder features

- Script-first default flow with extraction helpers and quality checks.
- Section-based slide selection with richer controls (including bulk actions and view modes).
- Explicit CX link handling that promotes linked slides to embedded CX layouts during export.
- Dedicated **Assets** step with slot-based uploads (brand, persona, store/product/demo imagery); each slot shows the slides it feeds, and skipped slots fall back to clean brand-styled placeholders.
- **Branding modes** (Salesforce / customer / co-brand) selectable in Setup; the exported demo's lockup and palette follow the chosen mode (defaults to Salesforce, identical to prior behavior).
- Stronger exported-demo **navigation**: arrow/Space/Home/End keyboard parity across sections, a slide counter, and `#section=…&slide=…` hash deep-links.
- Deeper **unified-profile** carousel and a story-derived **"Powered by Salesforce"** product strip.
- In-product **guided hints** (dismissible, "don't show again" persists) and a **`CLAUDE_MODIFY.md`** prompt file shipped in every export so SEs can edit the demo with Claude/ChatGPT.
- Inline **Pending text editors** so SEs can fix unresolved copy without jumping between steps.
- Persona enhancements: pronouns and wishlist/stat editing support.
- BVS metric override editing persisted through round-trips.
- Live preview improvements and shared rendering helpers for consistency.
- **Project sharing** from Home with collaboration controls through the new share modal flow.

## Export behavior

The export step supports:

- **Download Complete Demo ZIP** (recommended): ships a ready-to-run `demo/` package with current content.
- **Config only**: download `holodeck.config.js` or builder JSON for existing demo folders.

The ZIP exporter packages the polished `/demo` runtime so visual/output quality follows the live demo shell. The package also includes `CLAUDE_MODIFY.md` — copy-paste prompts (rebrand, add a slide, rewrite the persona, swap assets…) for editing the exported demo with an AI assistant without re-opening the Builder.

## Security behavior for embedded CX URLs

Embedded iframes use trusted-origin sandbox rules:

- Trusted host allowlist includes `aubreydemo.com`.
- Off-allowlist URLs run with tightened sandboxing (drops `allow-same-origin`).
- UI and exported output both surface an "Off-allowlist origin — sandbox tightened" indicator when relevant.

## Builder preview vs final output

- **Builder preview:** in-app scan/authoring preview (`builder/preview-renderer.js`).
- **Final customer output:** polished runtime in `demo/`, with builder state adapted through `builder/holodeck-adapter.js`.

The builder preview helps author content quickly, while the exported/presented Holodeck is the runtime source of truth.

## Repository structure

- `builder/index.html` - builder entry page
- `builder/builder.js`, `builder.css` - core builder UI/logic
- `builder/recommendation-rules.js` - slide recommendation engine
- `builder/preview-renderer.js` - in-builder preview renderer
- `builder/holodeck-adapter.js` - maps builder state to polished Holodeck config
- `builder/holodeck-shared.js` - shared render/transform helpers
- `builder/config-generator.js` - config generation utilities
- `builder/zip-exporter.js` - complete ZIP export pipeline
- `builder/import-validator.js`, `builder/project-store.js` - import validation and persisted project schema
- `builder/project-home.js`, `builder/share-modal.js` - project home actions and share workflow UI
- `demo/index.html` - demo entry URL
- `demo/demo-holodeck-unified.html` - unified presentation shell
- `demo/holodeck.config.js` - primary content configuration
- `demo/js/holodeck-render.js`, `demo/js/demo-deck-renderer.js` - runtime render logic
- `demo/styles/` - theme/layout/animation styles
- `demo/assets/` - logos, images, GIFs, and media
- `HOW_TO_BUILD_HOLODECK.md` - detailed build playbook

## Recommended pre-demo checklist

- Replace all placeholder metrics (`XX%`, `+$XX`, etc.)
- Update presenter identity fields
- Verify live URLs and embedded moments
- Confirm brand/logo approval
- Run through all sections once in browser
- Validate on target presentation device/resolution

## Common local issues

- Media missing: verify paths and file presence under `demo/assets/` (or upload through Builder assets step)
- Live URL not loading: confirm the URL is reachable and embeddable
- Changes not visible: hard refresh browser
- Wrong page: use `http://localhost:4173/demo/` or `http://localhost:4173/builder/`
