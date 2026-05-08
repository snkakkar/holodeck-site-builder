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

- `demo/index.html` - local entry URL (redirects to the main experience)
- `demo/at-home-unified.html` - unified presentation shell
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
