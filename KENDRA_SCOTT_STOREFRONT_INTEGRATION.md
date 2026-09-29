# Baking the Kendra Scott storefront into Holodeck

**Purpose.** Document (1) what the Kendra Scott demo website is, (2) the rebrand
refactor that made it config-swappable, and (3) exactly how that maps onto — and
where it diverges from — this Holodeck project's existing `demo-apps/*/app-config.js`
convention, so the KS storefront can become a first-class, rebrandable Holodeck
demo-app (a third sibling next to `cimulate` and `clienteling`).

Author's TL;DR: **the two projects already converged on the same idea** — a single
`window.*_CONFIG` object as the per-customer contract, with a JS function that writes
brand colors into CSS `:root` tokens. The KS site got there via a manual refactor;
Holodeck got there by design. Folding KS in is mostly *renaming to Holodeck's
conventions and adding the `?holo=<token>` preview hook*, not new architecture.

> **Guiding principle — demos are deterministic, not inferred.** A demo asset exists to
> showcase an *experience*. Every interactive control (a chip, a button, a persona sign-in)
> must be a **deterministic lookup that returns the identical result every time** — for both
> logged-in and logged-out states. Relevance ranking, text inference, and heuristic scoring
> belong in a real product; in a demo they are the source of every "why did it show
> different results this time?" bug. The Cavender's build proved this the hard way (Parts 2
> and 4 below); the storefront generator should be architected around *tag-once, look-up-forever*.

---

## Part 1 — What the Kendra Scott site is

A hand-written **vanilla-JS single-page storefront** (Express static server, no build
step, one dependency: `express`). It is a *fully interactive* retail experience — not a
slide deck:

- Product grid + search overlay rendering from a client-side catalog (`products.json`).
- A signed-in persona ("Rachel Morris") with a profile dashboard, loyalty tier,
  wishlist, and a birthday-reward promo flow.
- A "Color Bar" signature-merchandising feature (customize-your-piece).
- An **optional** live Salesforce stack: Agentforce agent (MIAW), a Data Cloud beacon,
  and an SCRT2 SSE voice agent. **Default is a deterministic client-side flow** — the
  site runs fully with zero org connection; the live stack is the upgrade, not the
  baseline.

It had been forked from an older "NTO Retail" demo and only *partially* rebranded, so
brand identity was scattered inline across ~7 JS files, a 139 KB CSS file, `index.html`,
and data files — with **three different Salesforce orgs hardcoded in four places**.
Rebranding meant a multi-hour find-and-replace hunt (which is why NTO leftovers
survived the last pass).

**Where it fits in a Holodeck story:** this is exactly an `iframe-laptop` scene —
a live storefront the SE drives inside a MacBook frame during the Demo section. Today
Holodeck embeds such scenes from `aubreydemo.com`. A rebrandable KS storefront could be
a *self-hosted* embeddable scene instead: same role in the deck, but authored and
themed by the Builder rather than a separate tool.

---

## Part 2 — The rebrand refactor I did (the KS side)

Goal: turn the multi-hour hunt into a ~30-minute config swap. One-time extraction of
every customer-specific value into single-source-of-truth files, with consumers
refactored to read from them (behavior preserved via literal fallbacks).

**New single-source-of-truth files**

| File | Global | Holds |
|---|---|---|
| `public/js/brand-config.js` | `window.BrandConfig` | brand name, agent name ("Coco"), agent role, signature-feature label ("Color Bar"); the full persona (identity / interests / profile); the loyalty **offer** (code, copy, eligibility name, discount rates) |
| `public/js/sf-config.js` | `window.SFConfig` | all **three orgs** in one place — MIAW, Data Cloud beacon, SCRT2 voice |
| `REBRAND.md` | — | the 5-step rebrand checklist + a fallback/failure table |

**Consumers refactored to read config (behavior-preserving):** `persona.js`,
`birthday-promo.js` (persona/offer from `BrandConfig`), `sitemap.js` (MIAW org from
`SFConfig`), `web-curation-component.js` (agent name, brand name, SCRT2 org — plus a
`[SF Config]` startup console log so a mis-pointed org is obvious), `views.js` (brand
name, agent name, signature-feature label). Route slugs, CSS class names, function
names, and data keys were deliberately **left hardcoded** — they're engine, not skin.

**CSS as the single color source:** `styles.css` `:root` is the only place color/font
lives; ~15 stray inline `#23423b` literals were replaced with `var(--primary)`, and a
rebrand header comment documents which tokens to change.

**Static-HTML constraint handled:** `index.html` can't read a JS global in markup, so
brand name is stamped onto static surfaces (title, header/footer logo, sign-in badge)
via `data-brand-name` / `data-brand-tmpl` attributes at load. The one unavoidable
literal — the Data Cloud beacon connector ID in a `<script src>` that loads *before*
the config global exists — is kept as a documented, commented line.

**Cleanup:** fixed the image-proxy allow-list (was NTO-only; now includes the catalog
CDN + an `IMG_PROXY_HOSTS` env override), fixed a broken NTO-hosted "Built on
Salesforce" logo, and deleted 292 dead NTO product PNGs (real images load from a CDN).

**The one sharp edge (applies to Holodeck too):** persona interests ⟷ catalog coupling.
The persona's "owned items" and recommendations resolve keywords against the catalog at
runtime — **if the interest keywords don't occur in the new catalog's product text, recs
come back empty and silently.** Any rebrand must validate this after swapping the catalog.

---

## Part 3 — How this maps onto Holodeck's existing convention

Holodeck already has the target pattern in `demo-apps/clienteling/app-config.js` and
`demo-apps/cimulate/app-config.js`. Compare:

| Concern | Kendra Scott (my refactor) | Holodeck `demo-apps/*` (existing) |
|---|---|---|
| Config global | `window.BrandConfig` + `window.SFConfig` | `window.APP_CONFIG` (one object) |
| Brand identity | `BrandConfig.brand.{name,agentName,role,signatureFeatureLabel}` | `APP_CONFIG.brand.{name,sub,conciergeName,assistantName}` |
| Brand colors → CSS | `:root` tokens edited manually; header comment | `APP_CONFIG.brand.colors` + `applyBrandColors()` writes `--app-*` `:root` vars at load |
| Persona | `BrandConfig.persona.{identity,interests,profile}` | `APP_CONFIG.customer` (+ `homeStoreManager`, history, timeline) |
| Catalog | `products.json` (separate file) | `APP_CONFIG.catalog[]` (inline in config) |
| Copy tokens | offer copy w/ `{firstName}` eligibility | `APP_CONFIG.copy` w/ `{customer}/{firstName}/{manager}/…` interpolation |
| Image fallback | image proxy + remote CDN | procedural `getProductSVG` / neutral `cartPlaceholderSVG` — **no photography required** |
| Builder preview | (none — standalone site) | `?holo=<token>` reads a generated config from `localStorage`/`sessionStorage` and swaps `window.APP_CONFIG` |
| Contract statement | `REBRAND.md` | file header: *"the builder regenerates this file per-customer; its shape is the contract."* |

**Read this as: Holodeck's convention is a superset of what I built.** Three things
Holodeck does that the KS site should adopt when folded in:

1. **`applyBrandColors()` over manual `:root` edits.** The KS refactor kept `:root` as
   the manual source of truth (to avoid a flash of unstyled color). Holodeck's approach —
   ship neutral `--app-*` tokens in CSS and have JS `setProperty()` the brand colors
   from `APP_CONFIG.brand.colors` at load — is strictly better for a Builder-generated
   app, because the Builder never has to edit CSS. **Recommendation: converge KS onto
   `applyBrandColors()`.**

2. **Image sourcing — scrape-first, not Gemini-first.** This is the one place where the
   storefront should *diverge* from the current Holodeck demo-app default. `cimulate` /
   `clienteling` use **fictional** catalogs, so they have nothing to scrape and go
   straight to Gemini image-gen (`generateProductPhotos` / `photoPrompt` in
   `builder/app-foundations.js`) with the procedural SVG as fallback. A storefront is
   built for a **real customer with a real website and real product photos** — exactly
   what the KS site already does (its `products.json` `image` fields point at a live CDN,
   fetched through `server.js`'s image proxy). So the storefront's image ladder should be:
   **(1) scrape real product/brand imagery from the customer's live site → (2) Gemini
   image-gen only to fill gaps → (3) procedural `getProductSVG` / `cartPlaceholderSVG`
   placeholder as the last resort.** Gemini becomes the gap-filler, not the generator.
   Two consequences: the Builder needs a **scrape/ingest step it does not have today**
   (see Part 4), and any scraped image host must be in the server image-proxy allow-list
   (`IMG_PROXY_HOSTS` — the exact thing the KS rebrand fixed), whereas Gemini/GCS URLs
   bypass the proxy.

3. **The `?holo=<token>` preview override.** This is the mechanism that lets the Builder
   theme the app live inside an iframe and in the exported ZIP. The KS site has no
   equivalent. **Recommendation: add the same IIFE** (read `holo` query param → pull
   generated config from `localStorage`/`sessionStorage` → replace the config global).

One thing the KS site has that `demo-apps` do **not**: a real **Salesforce live stack**
(`sf-config.js` — three orgs). `demo-apps` are purely client-side/deterministic. If the
KS storefront is folded in as a demo-app, keep `sf-config.js` separate and **default it
off** — the demo-app baseline in Holodeck is client-side and deterministic, matching KS's
own default. The live stack becomes an optional "advanced" config, not part of the
Builder's happy path.

---

## Part 4 — Concrete plan to fold KS in as a Holodeck demo-app

Target: `demo-apps/storefront/` as a sibling of `cimulate` and `clienteling`, with the
same `app-config.js` contract, generated per-customer by the Builder, embedded as an
`iframe-laptop` scene via `?holo=<token>`, and shipped in the export ZIP under
`apps/storefront/`.

**How generation actually works today** (confirmed by code trace — this is the path a
storefront must join): the Builder's demo-app generator lives in
**`builder/app-foundations.js`** (`ctxFrom` builds context from Builder state →
`promptForClienteling` / `promptForCimulate` → `generate({jsonMode:true})` calls Gemini
text → `assemble()` → hands off to **`builder/app-config-generator.js`**
`buildClientelingConfig` / `buildCimulateConfig` → `toConfigJs`). Product photos come
from `generateProductPhotos` / `photoPrompt` in the same file, calling the Gemini image
endpoint. **`builder/holodeck-adapter.js` is NOT the config path** — it only maps Builder
layouts → Holodeck slide types (`iframe-laptop`) and is already generic.

### Steps

1. **Create `demo-apps/storefront/`** — `index.html`, styles, `app.js`, and an
   `app-config.js` normalized to the `APP_CONFIG` contract. Merge KS `BrandConfig` into
   one `window.APP_CONFIG`: `brand` (name + `colors`), `customer` (persona),
   `catalog[]`, `copy` (tokenized strings), plus a KS-specific `offer` block. **The file
   must keep the exact structure the exporter expects:** config object first → the
   `/* BUILDER PREVIEW OVERRIDE */` `?holo` IIFE (copy verbatim from
   `demo-apps/clienteling/app-config.js`) → the `window.money`-led helper tail
   (`applyBrandColors`, `getProductSVG`, `cartPlaceholderSVG`, `productImage`,
   `productById`). `zip-exporter.js` splits the file at `window.money` to graft
   generated data onto the helper tail — get this wrong and export silently degrades.

2. **Adopt `applyBrandColors()`.** Replace KS's manual `:root` swap with neutral
   `--app-*` tokens + `applyBrandColors()` reading `APP_CONFIG.brand.colors`, so the
   Builder never edits CSS.

3. **Scrape-first image ladder** (the storefront-specific divergence, see Part 3):
   add a **scrape/ingest step** to pull the customer's real product/brand imagery + URLs
   from their live site into the catalog; use `generateProductPhotos` only for gaps;
   fall back to `getProductSVG`. **This ingest step does not exist in the Builder today**
   (cimulate/clienteling have fictional catalogs) — it is net-new work. Scraped image
   hosts must be added to `server.js` `IMG_PROXY_HOSTS`.

4. **Write `promptForStorefront`** in `app-foundations.js` and `buildStorefrontConfig`
   in `app-config-generator.js`. The prompt must reuse the shared **12-SKU catalog
   contract** (`sku1..sku12`, `state.retailCatalog`) so imagery is reused across sibling
   apps at zero extra image cost, honor the "CRITICAL VOCABULARY RULE," and — critically —
   guarantee the **persona's interest keywords occur in the catalog text** (else recs
   come back silently empty; this is the KS site's sharpest edge).

   **Each generated SKU must ship pre-tagged with structured attributes** — `gender`
   (`men|women|unisex`), `colors[]`, `priceTier`, and `category` — as real fields on the
   product object, not left to be inferred from the name/description at runtime (F1, Part 4A).
   This is a hard generator contract: the storefront engine reads these fields and never
   re-derives an attribute from prose. It is what makes every chip a deterministic lookup.

5. **Register the app in the ~8 hardcoded places** (there is no single registry — see
   the Integration-points table below). The dispatch in `app-foundations.js` /
   `app-config-generator.js` / `zip-exporter.js` is a **binary** `appId === "clienteling"
   ? … : cimulate` ternary today; each becomes a 3-way branch or a lookup. The hardcoded
   `id !== "clienteling" && id !== "cimulate"` guards in `builder.js` will silently drop
   or mis-token a `storefront` slice until updated.

6. **Keep `sf-config.js` separate and default-off.** The live Salesforce stack is the one
   thing demo-apps don't model; it must not be on the Builder happy path. The storefront's
   baseline is the deterministic client-side flow, matching both KS's own default and the
   demo-app convention.

7. **Ship a `CLAUDE_MODIFY.md`-style prompt** with the export (Holodeck already ships one
   per export) covering: rebrand, swap the catalog, rewrite the persona, toggle the live
   SF stack.

### Integration points (file : line ranges) — the actionable checklist

| Concern | File : lines |
|---|---|
| App registry — guided cards | `builder/simple-experiences.js:29-114` |
| App registry — `previewUrl` | `builder/builder.js:3403-3418` (`APP_CATALOG`) |
| Default `state.apps` slices | `builder/builder.js:3434-3440` |
| Hardcoded id guards (dedup/token) | `builder/builder.js:3866, 3896-3903` |
| Gemini prompt + binary dispatch | `builder/app-foundations.js:62-130, 280-282, 319-321, 465-467` |
| Config builder + `toConfigJs` | `builder/app-config-generator.js` (`buildClientelingConfig`/`buildCimulateConfig` siblings) |
| Product-photo prompt | `builder/app-foundations.js:421-439` |
| ZIP template manifest + header | `builder/zip-exporter.js:86-112, 298-305` |
| Preview token stash ↔ read | `builder/builder.js:3958-3965` (`stashPreviewConfig`) ↔ `demo-apps/<app>/app-config.js:377-395` (IIFE to copy) |
| iframe-laptop slide mapping | `builder/holodeck-adapter.js:265-269, 707-709` (generic — likely no change) |
| Trusted iframe hosts | `builder/preview-renderer.js:2774` (same-origin `/demo-apps/*` already trusted) |

### What stays "engine" — and why "engine" is the real risk surface

Mirroring the KS refactor's engine/skin split: `server.js` (image proxy, SPA fallback),
the router, and all view/render logic are reusable engine — a rebrand does not rewrite them.

**But do not read this as "the engine is the safe part."** It is the opposite. The engine
code is shared, but **per-customer DATA flows through it** — the persona, the catalog, the
agent vocabulary. Every bug that cost the Cavender's build multiple debugging rounds
(gift-for-him showing women's items; a color chip collapsing to one result; a sign-in
poisoning the agent's conversation) was an **engine bug caused by skin data**, not a theming
bug. The search/selection logic and the agent funnel are the **primary regression surface of
a rebrand**, not the untouched part. The behavioral contract in Part 4A exists precisely so
the generator emits an engine that data cannot corrupt. Only the config global, the catalog,
brand colors, and assets *change* — but what they change is exactly where things break.

---

## Part 4A — Behavioral contract (the half the skin doesn't cover)

Everything above themes the storefront. This part governs how it *behaves* — the half that
actually broke repeatedly in the Cavender's build. These are **generator contracts**: rules
the storefront generator must satisfy so behavior is correct-by-construction, not debugged
per-customer. Each is stated as a lesson learned, with the bug it prevents.

### The five findings (F1–F5)

**F1 — Tag attributes as data; never infer them from text.** The Cavender's catalog carried
no gender/color/price fields — gender was guessed from the product *name* by regex, color by
substring-matching the description, price by parsing a string. That single choice produced
"gift for him → women's dresses" and "black → one result." **Contract:** every SKU ships with
explicit `gender` (`men|women|unisex`), `colors[]`, `priceTier`, and `category` **as stored
fields**, and the engine reads those fields. It must never re-derive an attribute from prose.

**F2 — One selection primitive, not parallel engines.** Cavender's had four independent
product pickers (free-text search, the agent picker, the gift guide, the persona
recommender), each re-implementing gender/color/price filtering slightly differently. Fixing
one left the others wrong — that is *why* it took multiple rounds. **Contract:** the storefront
has exactly one `selectProducts(filter)` function; every surface calls it. No surface filters
the catalog on its own.

**F3 — The agent funnel must be a static lookup, not a stateful parser.** Cavender's parsed
button clicks as free text against a shared, accumulating "intent" object, so one choice
poisoned the next and the same label meant different things in different menus. **Contract:**
the generated agent uses a declarative `(question → answer → filter)` table — each button maps
to one fixed filter object, with no cross-menu label collisions and no accumulated mutable
state. For a demo this is *better* than a heuristic funnel: it is deterministic and reviewable
at a glance.

**F4 — Define a persona-seeding contract.** In Cavender's, signing in silently seeded the
agent's conversation state (a family, a color), which then contaminated later queries. The
persona↔catalog coupling is bidirectional and stateful, not just a keyword-overlap warning.
**Contract:** persona data may bias the homepage grid, but it must **not** pre-fill the agent's
conversational state — the funnel starts empty. State exactly what, if anything, the persona is
allowed to seed (recommendation: nothing).

**F5 — One identity event, every surface subscribes.** Cavender's had two sign-in paths that
did different things; the header updated on one and not the other because there was no central
identity handler. **Contract:** one `identity:changed` event; header, agent chips, and recs all
subscribe. Logged-in vs logged-out is resolved *once* and passed as an input, not re-decided in
scattered branches.

### Reference architecture — tag-once, look-up-forever

The generator should emit this shape (it is the fix for F1–F3 together):

1. **Pre-tagged catalog.** Each of the 12 SKUs carries real `gender/colors/priceTier/category`
   fields (see the amended Part 4 step 4). No runtime inference exists anywhere in the app.
2. **One `selectProducts({ gender, colors, category, priceTier, exclude, limit })`** that
   filters the tagged catalog by exact field match and slices to a limit. Same filter in →
   same products out, every time.
3. **A static chip→filter table**, keyed by `(loggedIn, chip label)`, mapping each button to
   one filter object. The agent merges the chosen answers into a single filter and calls
   `selectProducts` once. Every entry point — search, agent, gift guide, persona grid — funnels
   into the same primitive.

The anti-pattern to avoid is exactly what Cavender's had: four pickers, four gender checks,
three color vocabularies, five price sites, three identity predicates, and a
structured→text→re-parsed round-trip. The generated storefront should have one of each.

### Behavioral test matrix (validate every generated storefront)

The existing checks in Part 5 test *theming* (colors, images, orgs) — none of the logic
bugs. Add a behavioral matrix that a tiny offline harness over the tagged catalog can assert
before the UI is ever opened. For every combination of **{logged-out, logged-in} × {each chip
path: gift-for-him, gift-for-her, treat-myself} × {each color chip}**, assert the returned SKU
set is:

1. **non-empty** (no path returns zero),
2. **all the correct gender** (no opposite-gender leakage),
3. **all match the chosen color / price tier**, and
4. **identical across repeated runs** — the reproducibility guarantee.

Also assert that **signing in does not empty the recs and does not change the funnel's first
question.** This single matrix would have caught every Cavender's behavioral bug in one pass.

---

## Part 5 — Fallbacks / failure guide (merged KS + Holodeck)

| Failure | Behavior / fix |
|---|---|
| Live SF stack (MIAW/beacon/voice) unavailable | KS already falls back to the deterministic client-side flow — this is the demo's safety net. As a demo-app, default the live stack **off**. |
| Product image missing / 404 / blocked | Degrade in order: **scraped real image → Gemini-generated photo → procedural `getProductSVG`**. If a scraped URL 404s, also confirm its host is in the proxy allow-list (`IMG_PROXY_HOSTS`). |
| Exported ZIP shows broken product photos weeks later | Gemini images are baked into `apps/storefront/app-config.js` as **GCS signed URLs, not bundled files** (`zip-exporter.js`), and signed URLs expire. Prefer scraped/stable URLs; procedural SVG covers the gap. For a long-shelf-life demo, re-export or bundle images as files. |
| Persona recs / owned-items empty | Interest keywords don't occur in the catalog text — the `promptForStorefront` generator must guarantee overlap. **Most likely silent failure; validate every generated storefront.** |
| Wrong org after repointing (live stack only) | Startup `[SF Config]` console log prints which org each service points at — check it matches. |
| Off-allowlist embedded origin | Holodeck tightens the iframe sandbox and surfaces an indicator; a self-hosted `/demo-apps/storefront/` is same-origin/trusted, so no tightening. |
| Brand colors look wrong | With `applyBrandColors()`, verify `APP_CONFIG.brand.colors.primary` is a valid 6-char hex. |
| Storefront slice silently dropped in Builder | A hardcoded `id !== "clienteling" && id !== "cimulate"` guard (`builder.js:3866, 3896-3903`) wasn't updated to include `storefront`. |
| Agent returns different products for the same button | Caused by parsing button clicks as free text against shared, accumulating agent state (F3). Fix = a static chip→filter lookup table; each button maps to one fixed filter, resolved once. |
| Logged-in behaves differently from logged-out | Caused by scattered identity branches and multiple sign-in paths (F5). Fix = one `identity:changed` event every surface subscribes to, and resolve gender-from-identity once as an input to `selectProducts`. |
| Gift-for-him / color chip returns wrong or empty results | Caused by inferring gender/color from product text instead of stored fields (F1). Fix = pre-tagged `gender`/`colors` fields read by the single `selectProducts` primitive. |

---

## Part 6 — Brand gender-lean: a configurable catalog + agent knob

**Observation (from the KS demo).** The KS catalog leans heavily toward women, and once
"Rachel Morris" signs in the experience skews *further* female (her persona interests and
box rules pull female-coded product). For KS that's on-brand — but as a **reusable
storefront generator** it's a hard-coded bias. A menswear or unisex customer generated
from the same template would inherit a female-leaning catalog and female-coded agent
search terms unless every value were hand-edited. That's exactly the kind of scattered,
per-customer hunt the rebrand refactor set out to kill.

**Why the tag-once catalog (Part 4A/F1) makes this knob reliable.** `genderLean` only works
if `gender` is a real, stored field on each SKU. When gender is *inferred* from the product
name (as in KS today), the knob can only hope the generated names imply the right gender —
exactly the fragility that produced the gender bugs. With pre-tagged SKUs, `genderLean`
becomes a trivial generation-time ratio over a known field (e.g. weight the mix 6:4:2 for
`female`), and the runtime `selectProducts` gender filter is exact. Tagging is the
precondition; the knob is the lever.

**The fix (spec — not yet built): a single `genderLean` brand knob.** Add one
configuration axis to the storefront's brand config with three settings —
**`unisex` (default) | `male` | `female`** — and have the three coupled subsystems read
from it instead of carrying a baked-in bias:

| Subsystem | Where it lives (KS today) | Holodeck generator equivalent | What `genderLean` should drive |
|---|---|---|---|
| **Catalog composition** | `public/js/products.json` | `buildStorefrontConfig` catalog gen + scrape/ingest weighting | Ratio of men's / women's / unisex SKUs generated or scraped. `unisex` ≈ balanced; `male`/`female` weight the mix but never go 100% — keep some cross-gender coverage so search still returns results. |
| **Persona interests / box rules** | `BrandConfig.persona.interests`, `persona.js` `BOX_RULES` | `promptForStorefront` persona block | Persona interest keywords must overlap the catalog *as generated* (the sharp edge). A `female` persona against a `male`-leaned catalog = silent empty recs. `genderLean` must key **both** so they stay coupled. |
| **Coco's search terms** | `web-curation-component.js` agent strings / seasonal search seeds | `promptForStorefront` agent-vocabulary block | The agent's suggested searches and greeting vocabulary should be **brand-relevant and gender-appropriate**: unisex phrasing for `unisex`, men's-styling language for `male`, etc. Today these are female/jewelry-coded strings. |

**Why it belongs in the generator, not the KS site.** The KS site is a *finished* demo —
its female lean is correct for Kendra Scott and should stay. The scalability win is making
`genderLean` a first-class input to `promptForStorefront` / `buildStorefrontConfig` (Part 4),
so every *future* storefront the Builder generates picks the right catalog balance, persona,
and agent vocabulary from one setting. This extends the persona⟷catalog coupling warning
(Parts 2, 4, 5): `genderLean` is the upstream control that keeps all three in sync — set it
once and the generator produces a catalog, a persona, and an agent voice that agree.

**Generator prompt requirements (add to Part 4 step 4's `promptForStorefront`):**
- Accept `genderLean` (`unisex`|`male`|`female`, default `unisex`) from Builder state.
- Weight the 12-SKU catalog mix by `genderLean` while keeping ≥2 SKUs cross-gender so no
  search/persona path returns empty.
- Generate the persona so its interest keywords **provably occur** in the weighted catalog
  text (unchanged rule, now gender-aware).
- Generate Coco's suggested-search seeds and greeting vocabulary in the matching register
  (unisex / men's / women's), brand-relevant rather than jewelry-hardcoded.
- Validation after generation: sign-in path must still populate recs under the chosen lean.

**Default matters.** `unisex` should be the generator default so a new customer starts
balanced for men and women; `male`/`female` are opt-in skews a demo author sets when the
brand truly leans that way. This inverts today's implicit KS default (female).

---

## Appendix — file cross-reference

**Kendra Scott site** (`…/Customer Demos/Kendra Scott/Kendra Scott Website/`):
`public/js/brand-config.js`, `public/js/sf-config.js`, `public/js/persona.js`,
`public/js/birthday-promo.js`, `public/js/sitemap.js`,
`public/js/web-curation-component.js`, `public/js/views.js`, `public/css/styles.css`,
`server.js`, `REBRAND.md`.

**Holodeck convention to align to** (this repo):
- `demo-apps/clienteling/app-config.js` — the reference `APP_CONFIG` contract,
  `applyBrandColors`, `getProductSVG`/`cartPlaceholderSVG`, and the `?holo=<token>`
  override IIFE (lines ~377-395) to copy.
- `builder/app-foundations.js` — the demo-app generator: prompts
  (`promptForClienteling`/`promptForCimulate`), the Gemini text call
  (`generate({jsonMode:true})`), product-photo generation
  (`generateProductPhotos`/`photoPrompt`), the 12-SKU shared-catalog contract.
- `builder/app-config-generator.js` — `buildClientelingConfig`/`buildCimulateConfig` +
  `toConfigJs` (where a `buildStorefrontConfig` sibling would go).
- `builder/builder.js` — `APP_CATALOG` (~3403-3418), `stashPreviewConfig` (~3958-3965),
  `previewUrlFor`, and the hardcoded id guards.
- `builder/zip-exporter.js` — `APP_TEMPLATE_FILES`/`APP_META` and the
  `window.money`-split config-graft on export.
- `server.js` — Gemini endpoints `POST /api/gemini/generate` (text; `GEMINI_TEXT_MODEL`,
  default `gemini-3.5-flash`; SSE→NDJSON) and `POST /api/gemini/generate-image`
  (`GEMINI_IMAGE_MODEL`, default `gemini-3-pro-image`; returns a GCS signed URL when
  GCS is configured, else a `data:` URL). Key is server-only; browser calls via
  `builder/gemini-client.js` (`HOLO_GEMINI`).
- README §"Builder preview vs final output" and §"Security behavior for embedded CX URLs".
