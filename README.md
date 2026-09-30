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

### Local static preview (UI-only)

```bash
python3 -m http.server 4173
```

Then open:

- Demo: `http://localhost:4173/demo/`
- Builder: `http://localhost:4173/builder/`

### Full local app (API/auth/proxy paths)

```bash
npm install
npm start
```

Then open:

- App root: `http://localhost:3000/` (redirects to `/builder/`)
- Builder: `http://localhost:3000/builder/`

Use this mode when testing server routes (Gemini/logo/asset proxy and auth/data flows).

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
- **Team Gallery** mode in Home, including duplicate-open workflow for shared examples.
- **Dark mode** and theme-aware UI treatment across Builder surfaces.
- Native **PowerPoint (.pptx)** and **PDF (.pdf)** export actions directly from Builder export flow.
- Deterministic ZIP packaging order for byte-stable exports across repeated runs.
- Local save diagnostics and quota-surfacing behavior to make cache failures visible.
- Navigation reliability hardening that routes users back safely on async/store failures.
- In-place UI render optimizations (quality footer/topbar/CDP carousel) to reduce unnecessary repaint/rebuild churn.
- **Simple mode** (`builder/simple-experiences.js`): a streamlined, one-flow guided path alongside the full 9-step wizard — fewer questions, one shared **General** question group (search terms, AI chat chip labels, persona name, catalog/persona gender lean) instead of duplicating them per app, and an overall progress bar that now reflects per-image generation progress instead of freezing during image generation.
- Native **Google Slides** export alongside PPTX/PDF: creates a real Slides deck server-side via the Slides API, using per-user OAuth with refresh tokens stored in GCS; `slides-renderer.js` scales the shared PPTX-space layout (×0.75) to Slides' coordinate space.

## Generated CX demo apps

Beyond the core Holodeck deck, the Builder's **CX Components** step can generate and export full, standalone storefront/app experiences — branded and pre-populated from the customer's story, then embedded as a linked slide or opened standalone:

- **Cimulate** (`demo-apps/cimulate/`) — an intent-aware product-search + concierge-chat storefront. Gemini generates a 12-SKU catalog, 4 intent-rich search chips (3 results each), and a scripted concierge (deterministic chip-driven replies, no free-text search) themed to the customer's real industry vocabulary.
- **Clienteling** (`demo-apps/clienteling/`) — a companion store-associate / sales-floor tool that shares the *same* 12-SKU catalog and stable `sku1..sku12` ids as Cimulate, so a product looked up on the floor matches what a shopper sees online. A shared-catalog sizing fix ensures both apps get the full SKU set they each need even though they read from one common `state.retailCatalog`.
- **Retail CAB** (`demo-apps/retail-cab/`) — a branded retail storefront generated from a **scraped live customer site** rather than invented from scratch: `builder/scrape-client.js` + an allowlisted-host server proxy (`server.js`) pull real SKUs/imagery first, and Gemini (`builder/retail-cab-foundations.js`, `builder/retail-cab-config-generator.js`) gap-fills and tags them (gender/colors/priceTier/category) and adds a birthday-promo flow. No-bleed guarantee: the generated storefront never seeds from a prior/sample customer. Export hardening routes image baking through the same-origin asset proxy (signed GCS URLs are cross-origin and fail directly), carries mount-path detection into the generated `brand-config.js` so `products.json` resolves once exported under `/apps/retailCab/`, paces Gemini requests to avoid batch 429s, and drops the 55 stock styled-look photos + birthday-promo image once real generation has produced replacements. Fixed bugs: a discount-percent unit bug (15% applying as 1500% off) and a trend-filter category leak, both described in the commit history.
- **Screen flows** (`builder/screen-foundations.js`, `builder/screen-config-generator.js`, `builder/screen-registry.js`, `demo/styles/screens.css`) — a generated set of mobile app "screens" (phone-frame UI panels) that can appear as their own slide type in the deck and carry through to PPTX/PDF export; the manifest derives screen panels, so exports re-derive them rather than caching stale ones.
- Generation client hardening: `builder/aubrey-client.js` wraps the Gemini client with server-side request validation/guardrails, and `builder/story-validator.js` makes malformed/older story data resilient across regenerate/import.
- Product-image durability: signed GCS asset URLs are re-signed on load (`builder/project-store.js`) rather than assumed still valid, stale photo maps clear on regenerate/story drift, and images that do expire fall back to a placeholder instead of a broken `<img>`.

### AI and content generation updates

- Gemini text and image generation now use stream-friendly server endpoints to reduce platform timeout risk.
- Prompt scaffolding was updated to use normalized input blocks and clearer budget guidance.
- Generation order tuning improves output consistency (assets before persona copy in bulk flows).
- Narrative fitting/truncation uses shared sentence/clause-fit helpers to avoid mid-sentence clipping.
- Import/load migrations refit older projects to current text/frame constraints automatically.

### Collaboration and persistence updates

- Share modal supports project visibility and collaboration permissions.
- Project store includes gallery listing + visibility updates for shared/team workflows.
- Unsynced/dirty project protection during cache clear and sign-out paths.
- Local cache slimming reduces large payload pressure and mitigates storage quota failures.
- Neon/PostgREST error surfacing improved with structured sync diagnostics.

### Admin reporting dashboard

An admin-only usage-metrics view (`builder/metrics-store.js` + a server aggregation endpoint) backed by Postgres aggregate queries. Fixed shortly after launch: forced RLS was blocking the admin aggregate queries from seeing rows, and the metrics DB pool wasn't enforcing TLS for non-local connections — both closed so the dashboard is both visible to admins and safe by default.

### Runtime and deck quality updates

- Runtime render guards added for malformed slide collections (graceful empty-deck fallback).
- Journey map and two-panel layouts received responsive tablet/phone media-query polish.
- Exported runtime packaging aligns with polished `/demo` shell as source of truth.
- Logo and signed asset proxy endpoints support real brand/logo asset retrieval patterns.

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

## Heroku deployment notes

- Runtime entrypoint is `start-web.js` (`npm start`), with process types in `Procfile`.
- `heroku-postbuild` fetches the pinned PostgREST static binary and installs `auth-service` runtime deps.
- Release phase runs `bin/db-release.sh` and applies:
  - `db/02_functions.sql`
  - `db/03_tables.sql`
  - `db/04_grants.sql`
  - `db/05_rls.sql`

### Database auth model (current)

- This app uses a **single-role Postgres model** on Heroku Essential.
- Release does **not** create DB roles at deploy time.
- PostgREST operates with the DB login role; authorization is enforced via RLS policies and JWT-derived app helpers.
- `05_rls.sql` enables and **forces** RLS on all app tables, and release asserts that RLS + policies are present to fail closed.

### Optional one-time admin bootstrap scripts

These are provided for portability to environments where you do want explicit PostgREST roles:

- `db/00_admin_bootstrap_roles_once.sql` (template)
- `db/01_roles.sql` (portable role creation script)

On Heroku Essential, app credentials typically lack `CREATEROLE`, so these scripts require an external admin-capable DB session.

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
- `builder/app-foundations.js`, `builder/app-config-generator.js` - shared Cimulate/Clienteling prompt/context and config generation
- `builder/retail-cab-foundations.js`, `builder/retail-cab-config-generator.js`, `builder/scrape-client.js` - Retail CAB prompt/context, BrandConfig/products generation, and live-site scraping
- `builder/screen-foundations.js`, `builder/screen-config-generator.js`, `builder/screen-registry.js` - generated mobile "screen flow" slide type
- `builder/simple-experiences.js` - Simple mode's streamlined guided flow
- `builder/aubrey-client.js`, `builder/gemini-client.js`, `builder/story-validator.js` - Gemini generation client, request guardrails, and story-data validation
- `builder/metrics-store.js` - admin usage-metrics dashboard data layer
- `builder/google-slides-exporter.js`, `slides-renderer.js` - Google Slides export path (per-user OAuth, GCS-stored refresh tokens)
- `demo-apps/retail-cab/`, `demo-apps/cimulate/`, `demo-apps/clienteling/` - generated CX app runtimes exportable from the Builder
- `demo/index.html` - demo entry URL
- `demo/demo-holodeck-unified.html` - unified presentation shell
- `demo/holodeck.config.js` - primary content configuration
- `demo/js/holodeck-render.js`, `demo/js/demo-deck-renderer.js` - runtime render logic
- `demo/styles/` - theme/layout/animation styles
- `demo/assets/` - logos, images, GIFs, and media
- `auth-service/` - token/auth shim for PostgREST-compatible JWT flow
- `db/` - SQL migration set (functions/tables/grants/RLS + optional role bootstrap helpers)
- `bin/` - release/build helper scripts (DB release runner, PostgREST fetcher)
- `start-web.js`, `server.js`, `postgrest.conf` - multi-process web/API/PostgREST startup and config
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
