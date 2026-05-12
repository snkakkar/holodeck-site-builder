# DEMO-HOLODECK-TEMPLATE

Reusable Salesforce Holodeck demo template for building customer-specific, browser-based demo stories with minimal manual coding.

This repository is designed to let you build a polished demo quickly by editing one config file and swapping customer assets, instead of hand-authoring new HTML slides every time.

## What is Holodeck?

Holodeck is a static, presentation-style web experience with five sections:

1. Journey Map
2. Intro / narrative framing
3. Meet the persona
4. Demo slides
5. Business Value close

All sections are driven by `demo/holodeck.config.js` and rendered by shared HTML/CSS/JS.

## Repository structure

- `builder/index.html` - guided UI builder for non-technical SEs (exports `holodeck.config.js`)
- `builder/builder.js`, `builder.css`, `recommendation-rules.js`, `preview-renderer.js`, `config-generator.js` - builder source
- `demo/index.html` - local entry URL (redirects to the main experience)
- `demo/demo-holodeck-unified.html` - unified presentation shell
- `demo/holodeck.config.js` - primary content and configuration source
- `demo/js/holodeck-render.js` - config-driven rendering logic
- `demo/styles/` - theme, layout, and animation CSS
- `demo/assets/` - logos, images, GIFs, and other media
- `HOW_TO_BUILD_HOLODECK.md` - detailed step-by-step build playbook

## Quick start

1. Clone this repository locally.
2. Start a static server from the `demo` folder:

```bash
cd demo
python3 -m http.server 8080
```

3. Open `http://localhost:8080` in your browser.
4. Present from the loaded Holodeck experience.

No npm install or build step is required.

## Two ways to build a demo

**Option A — UI Builder (recommended for non-technical SEs).** Start here:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/builder/`. Fill in customer/audience/products, paste a script, pick recommendations, preview slide cards, and click **Download Complete Demo ZIP**. The exported ZIP ships a verbatim copy of the polished `/demo` template — same HTML shell, same CSS, same JS — with your customer's content already filled into `holodeck.config.js`. Extract, run a local server inside the `demo/` folder, and you have a customer-ready Holodeck.

**Option B — Edit the config file directly.** Open `demo/holodeck.config.js` and update Zone 1 fields by hand. See `HOW_TO_BUILD_HOLODECK.md` for the playbook.

## Builder previews vs. final output — important

The Builder shows two different things:

- **In-app slide previews** ([`builder/preview-renderer.js`](builder/preview-renderer.js)) — lightweight thumbnails the SE uses to scan their plan. They are **indicative only**; they are not the customer-facing output.
- **Exported Holodeck** — the polished `/demo` template with the SE's content adapted in by [`builder/holodeck-adapter.js`](builder/holodeck-adapter.js). This is what the customer sees.

The exporter ([`builder/zip-exporter.js`](builder/zip-exporter.js)) fetches `/demo` files at export time and ships them into the ZIP unchanged, so the visual reference and the final output never drift apart. To upgrade the visual quality of the output, edit `/demo` — the next export will pick the changes up automatically.

## How customization works

Most edits happen in `demo/holodeck.config.js`.

That file is split into two zones:

- Zone 1 (you edit): customer-specific inputs (company, presenter, brand, scenes, outline, BVS values)
- Zone 2 (generated/content-heavy): full narrative and slide payload used by the renderer

For a full walkthrough of every field, see `HOW_TO_BUILD_HOLODECK.md`.

## Customize a new customer demo

1. Open `demo/holodeck.config.js`.
2. Update Zone 1 values:
   - Customer identity (`customer`)
   - Presenter details (`presenter`)
   - Brand colors/logo (`brand`)
   - Live scene URLs (`scenes`)
   - Slide plan (`deckOutline`)
   - BVS metrics (`bvs.metrics`)
3. Add customer media files to `demo/assets/`.
4. Ensure file paths in config point to the right assets.
5. Refresh your browser and click through each section to validate flow.

## Recommended pre-demo checklist

- Replace all placeholder metrics like `XX%`, `+$XX`, and similar values
- Update presenter name/title before every session
- Verify all live scene URLs load correctly
- Confirm customer brand/logo usage is approved
- Smoke-test navigation between all major sections
- Validate on your presentation resolution/device

## Common local issues

- Blank/missing media: verify files exist in `demo/assets/` and config paths are correct
- URL scene not loading: confirm the scene link is live and accessible
- Changes not visible: hard refresh browser and re-check for typo/comma errors in config
- Wrong landing page: open `http://localhost:8080` (not a file URL)

## Notes

- This project is static HTML/CSS/JS (no build step required).
- Keep customer-sensitive content and metrics aligned with approved messaging.
- Use `HOW_TO_BUILD_HOLODECK.md` as the source-of-truth playbook for end-to-end build flow.
