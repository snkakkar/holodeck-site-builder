# DEMO-HOLODECK-TEMPLATE

Reusable Salesforce Holodeck demo template for building customer-specific, browser-based demo stories with minimal manual coding.

## What this repo contains

- `demo/holodeck.config.js` - primary configuration and narrative source of truth
- `demo/at-home-unified.html` - main presentation experience
- `demo/index.html` - entrypoint that redirects to the unified demo page
- `demo/js/holodeck-render.js` - renderer for config-driven sections/slides
- `demo/styles/` - shared styles, animations, and theme tokens
- `demo/assets/` - demo images, GIFs, and brand media
- `HOW_TO_BUILD_HOLODECK.md` - step-by-step build guide

## Quick start

1. Clone the repository.
2. From the repo root, run:

```bash
cd demo
python3 -m http.server 8080
```

3. Open `http://localhost:8080` in your browser.

## Customize a new customer demo

1. Open `demo/holodeck.config.js`.
2. Update Zone 1 fields (customer, presenter, brand, scenes, deck outline, BVS metrics).
3. Add customer-specific images/media to `demo/assets/`.
4. Refresh the local demo in your browser.

For the full workflow, see `HOW_TO_BUILD_HOLODECK.md`.

## Notes

- This project is static HTML/CSS/JS (no build step required).
- Replace placeholder BVS values before external presentation.
