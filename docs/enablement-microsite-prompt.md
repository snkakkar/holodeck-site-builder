# Prompt: Demo Holodeck Builder enablement microsite (self-contained)

Paste everything below the line into Claude (desktop app). It needs no repo access: every fact it needs is in this prompt. The only things it must fetch itself are Slack and meeting-transcript updates (Step 1), using whatever connectors you have enabled (Slack, Google Drive). If you have the 10/5 Uri / Shachi transcript PDF, attach it too; a detailed summary is included below in case you don't.

---

## Role and goal

You are building an internal enablement microsite (deck-style, section-by-section navigation) for Salesforce Solution Engineers. It explains the **Demo Holodeck Builder**, specifically its **Simple / Guided flow**. Its purpose:

1. Show the value of the platform: what it is, what it produces, why it matters.
2. Tell SEs exactly **when to use it** (and when not to).
3. Tell SEs **when to graduate to Uri Botfield's build** (a white-labeled framework that builds the experience into a real org), and how the two fit together.
4. Explain the **architecture** well enough that an SE could build something similar.

Audience: SEs and SE leadership, mixed technical depth. Many are comfortable in Claude Code, but not all. Tone: confident, concrete, no hype. Prefer specifics over adjectives.

Source rules:
- The facts in Step 2 were verified against the actual codebase on 2026-10-08. Treat them as authoritative.
- The facts in Step 3 come from a 10/5 conversation between Shachi and Uri. Treat them as intent and status, not shipped features.
- Anything you pull from Slack or other transcripts in Step 1 must be cited (channel, date). If it contradicts Step 2, do not silently pick one. List it under "Open questions" and mark the slide "To confirm".
- If you cannot verify something, mark it "To confirm" on the slide instead of asserting it.
- No invented metrics, adoption numbers, or time savings.

## Step 1: Fetch the latest updates (do this first)

Use your Slack connector. If Slack is not connected, say so up front and continue with Steps 2 to 5, leaving the "Latest updates" section as a clearly marked placeholder.

- Search **all channels you can access, public and private**, for messages **from Shachi Kakkar** mentioning: "Demo Holodeck Builder", "Holodeck", "holodeck builder", "Retail CAB", "CAB demo", "Simple / Guided", "autopilot".
- Also search the same terms in messages from others, to catch replies, feedback, and adoption signals in those threads.
- Read full threads, not only top-level posts. Check linked canvases and files.
- Sort newest first. Extract: new features announced (with date), SE feedback or adoption signals, known issues, requests, and anything about Uri, Pacemakers, Heroku hosting, or the CAB demo.
- If Google Drive / Meet transcripts / Gemini notes are available, search them for the same terms and for conversations with Uri Botfield. Prefer the most recent.

Then, before building, reply with a short summary: what you found, anything that contradicts Step 2, and your open questions. Continue building without waiting unless something blocks you.

## Step 2: What the builder is (verified against the code)

### What the Simple / Guided flow is
A four-step wizard: **Experiences, Setup, Details, Build**. An SE picks experiences, enters or Analyzes a customer website, optionally answers a few questions, and gets a branded set of demo experiences plus a one-slide-per-experience deck, exported as a ZIP. The SE needs no script and no deck-writing. It is the "Recommended" option when creating a new project. The other options are a "Retail CAB demo" shortcut (preselects Retail CAB and jumps to Setup) and "Advanced: start from a script" (the full 9-step builder, or an Aubrey script picker).

### The four wizard panels, in detail
1. **Experiences:** multi-select cards. Chips 2 to 4 are locked until at least one is selected. Build also needs a customer name.
2. **Setup (Customer basics):** project name; website with an **Analyze** button; customer name; industry; logo upload; three brand colors; story context (up to 100k characters, or upload .txt/.md/.json/.pdf/.docx up to 15 MB).
   - **Analyze:** runs automatically when the website field changes. It scrapes the site, looks up the logo (with scraped icons as fallback), and uses Gemini to extract customer name, industry, and three brand colors. Fields the SE hand-edited are protected from being overwritten. A palette (dark, light, navy shades) is derived from the primary color in code.
3. **Details (all optional; skipped if none apply):**
   - Asked once, across experiences: search terms (up to 4; Cimulate and Retail CAB), chat chips (up to 6; Cimulate and Retail CAB), persona name (Unified Profile, Cimulate, Clienteling, Retail CAB), gender lean (unisex / male / female; Retail CAB only).
   - Clienteling: member promos, recommended products.
   - Help Agent: service inquiry.
4. **Build:** a progress bar with three stages (Research the customer, Build the experiences, Assemble the deck). Only Cancel or Retry. Takes up to about 10 minutes. On Done: a Retail CAB preview in an iframe, plus Download ZIP, Rebuild, and Edit selections.

### The generation pipeline (what happens when the SE clicks Build)
1. Save the SE's answers.
2. **Story extraction** (non-fatal if it fails): a Gemini call grounded with web search researches the customer, then a JSON-parse call extracts story foundations, acts, personas, website/industry, and "script facts" (named products, offers, loyalty program, pickup store, shopper questions and searches).
3. Apply the persona name answer and infer pronouns.
4. **Generate each selected app.** Retail CAB goes first. Config calls run one after another; photo generation overlaps the next config call; the help-agent chat script runs concurrently.
5. Create the app components for the deck.
6. Build the deck: exactly one slide per experience.

### Autopilot
`?autopilot=1` (labeled "Build it for me (experimental)") shows a box under the experience cards. It needs only a website. If nothing is selected it selects all five experiences, runs Analyze (a failure is non-fatal and the customer name falls back to the domain), runs Generate, and auto-downloads the ZIP. It skips the Setup and Details screens.

### The five experiences (deck order is fixed)
1. **Retail CAB storefront.** A branded e-commerce single-page app.
   - 40 SKUs, each with gender, colors, price tier, family, category, price, description. At least 20% unisex.
   - 4 to 6 nav categories.
   - A persona with a rich profile and a real "City, ST" location.
   - 2 to 3 offers, including a birthday tiered-unit offer.
   - 3 to 4 trends and styled posts (up to 8).
   - Exactly 3 chip filters, look complements, a featured item.
   - Copy, including the "our story" panel.
   - Chat chips, a scripted chat funnel, and 4 to 8 demo queries.
   - Cosmetic ratings, reviews, and sale prices.
   - AI-generated images: product photos, styled-post photos, and 2 hero images (signed-out and signed-in).
2. **Clienteling app.** Concierge name and intro scene, nav labels, customer 360, home-store manager and message, event, store KPIs, walk-ins, tasks, a coach, and a 12-SKU catalog. (A walk-in's call-to-action needs a matching coach entry; the generator and template were fixed to keep these in sync.)
3. **Unified Profile slide.** Rendered from the persona and story state.
4. **Help Agent slide.** An agent conversation driven by a generated chat script of at least 2 turns.
5. **Cimulate / Shopper Agent.** 4 search chips with 3 result ids each (the union is 12 SKUs), greet chips, 6 scripted sommelier-style intents, service data, celebs.

**Shared catalog behavior:** Cimulate and Clienteling share one 12-SKU catalog. If Retail CAB is built in the same run, those 12 SKUs are a slice of its catalog and reuse its photos, so no extra image calls are made.

### The handoff package (ZIP)
Named `holodeck-<customer-slug>.zip`, with a root folder of the same name:
```
holodeck-<slug>/
  README.md                  what it is
  HOW_TO_RUN.md              how to run it
  CLAUDE_MODIFY.md           generic Claude-Code handoff: project snapshot, quick
                             start, "edit demo/holodeck.config.js", 12 reusable
                             prompts, safety rules (no invented metrics, use
                             [TODO: ...], keep structure stable)
  serve.js                   zero-dependency Node static server, port 8080
  index.html                 hub linking the deck and each app
  demo/                      the deck: index.html, styles, js renderer,
                             holodeck.config.js, data/holodeck-config.json, assets
  apps/<id>/                 one folder per built experience
     retail-cab: index.html, css/, js/ (router, views, search, orders, persona...),
                 brand-config.js, products.json, baked images
     clienteling: index.html, styles.css, app-config.js, app.js
     cimulate:   index.html, app.css, app-config.js, app.js
  source/
     holodeck-builder.json   round-trippable snapshot for re-import
     builder-export-metadata.json
```
The output is byte-stable (uncompressed ZIP with sorted paths). The ZIP is the only export on the Simple "Done" panel. A hand-written ZIP encoder is used, with no JSZip.

### Multi-user features
Email one-time-code sign-in (@salesforce.com only). Project home with three tabs: My Projects, Shared with me, Team Gallery (with search, sort, and industry filter). Share by email with view or edit permission, including people who haven't logged in yet. Soft-lock presence (90-second TTL with a heartbeat; a read-only session sees a banner with "Take over"). Publish to the team gallery (a toggle in the Share modal); other users see the card and click "Duplicate to my projects". Duplicate, rename, delete. Projects persist to Heroku Postgres with a local cache. Admin-only reporting and a feedback page exist.

### Deterministic vs probabilistic (the core design idea)
| Gemini (probabilistic, roughly 80%) | Code (deterministic, roughly 20%) |
|---|---|
| Story research and parse; brand analysis; catalog gap-fill and tags (gender, colors, price tier, category, family); chips and trends; concierge, help-agent and chat scripts; all images | Palette derivation and on-accent contrast; catalog normalization (cap at 40, gender and price-tier coercion, required-product injection); chip and funnel validation with auto-repair so every chip resolves results; filtering to real families; all copy-fitting; fallback configs; the slide manifest; ZIP and exporters |

AI output is treated as untrusted: validated, repaired, and clamped before it reaches a renderer. If AI fails, industry-neutral fallbacks ship. The runtime apps use scripted, chip-driven replies, not free-text search. That is deliberate: live search returned unreliable results, so Shachi moved to a deterministic lookup approach and then deliberately stripped back functionality ("an intelligent strip-back") to make it repeatable. The 20/80 split is Shachi's own estimate from the 10/5 call.

**Scrape first, Gemini second.** Real SKUs (names and categories, from JSON-LD and image alt text; up to 60 fed to the prompt) are scraped first. Gemini only fills gaps and adds tags. It does not generate everything.

### Architecture
- **No-build vanilla-JS single-page app.** About 40 modules, each an IIFE attaching a `window.HOLO_*` global, loaded by ordered `<script defer>` tags. No bundler, no framework. The pure core can be unit-tested in Node by faking `window`.
- **One Express server** (about 1,800 lines) provides:
  - static serving (JS and CSS served `no-cache` since filenames aren't hashed);
  - a **Gemini proxy**: the API key stays server-side; a model allowlist; the response is streamed as NDJSON (`start`, `ping`, `done`, `error` lines) with an immediate first byte and keep-alive pings so Heroku's 30-second router limit isn't hit; per-user rate limit (30 requests per 60 seconds by default); a cap of 6 in-flight requests per user; global concurrency gates (16 text, 6 images);
  - **site scraping** with an SSRF guard (private and loopback hosts blocked, redirects followed by hand and re-checked, 3 MB HTML cap, 10-minute cache), plus an image proxy for scraped CDN hosts;
  - **asset signing and proxy** for a private Google Cloud Storage bucket;
  - a **Google Slides** endpoint (per-user OAuth, refresh tokens stored in GCS);
  - proxies to the Aubrey demo tools, an admin-only metrics route, and an `/env-config.js` route.
- **A supervisor process** runs the Express server, a self-hosted **PostgREST**, and a small **auth shim** together on one Heroku dyno. It validates env at boot and refuses to start if the database host is wrong.
- **Auth:** Neon Auth (Better Auth) is used for login only (email OTP; magic-link isn't available). The shim verifies Neon's EdDSA token and re-mints a short-lived (15-minute) HS256 JWT that carries the database role. The server and PostgREST both validate it with a shared secret. The `@salesforce.com` check on the client is UX only; the real enforcement is server-side plus a row-level-security predicate on the verified email claim.
- **Data:** Heroku Postgres (the only data store; Neon is auth-only) reached through PostgREST with **FORCE row-level security** keyed to JWT claims. Tables: projects (state as JSON, owner, visibility private or gallery), project shares, project presence, profiles, feedback. A release script applies migrations and asserts RLS is enabled and forced on every table. There is no anonymous role: requests without a token get 401. Writable tables need both a policy and a GRANT.
- **Assets:** AI images are uploaded to a private GCS bucket. Only short `gcs:` tokens are persisted, which keeps project state under the ~1 MB request limit. Signed URLs last 7 days and are re-signed on load and on export. One walk function handles tokenizing and signing, and every asset-bearing field must be covered by it or its images expire.
- **State:** one canonical, JSON-serializable state object (customer, brand, story, personas, selected experiences, per-app generated configs, catalog, images, mode "simple" or "full"). The store writes the local cache synchronously and then upserts to the server. It loads from the cache if the server returns an empty result, not just on error.
- **One slide manifest:** a single pure function turns state into the ordered, deselection-aware deck. The selector UI, the preview, and every exporter read from it. In Simple mode it emits one slide per experience in a fixed order and skips the intro, journey, persona, and business-value slides.
- **BrandConfig wiring (Retail CAB):** one global config is the source of truth. It drives four surfaces: brand color into CSS variables (`--primary`, `--primary-dark`, `--ink`, `--accent`), the nav, hero and section copy, and hero and lifestyle images. Baked defaults live on `:root` only (an override on the element itself would shadow them) and must stay neutral. A "no-bleed" rule says generated storefronts must never show a prior customer's assets or copy.
- **Exporters:** a shared normalized export model feeds thin PPTX, PDF, and Google Slides renderers. They differ mainly in units: PPTX in inches, PDF in points (x72), Slides scaled x0.75 from the PPTX layout.
- **Per-artifact generation pattern:** each experience has a foundations module with `prompt(context)`, a small JSON schema, and a deterministic `normalize()` that applies neutral fallbacks and repair passes.
- **Gemini lessons that bit us:**
  - Large-array `minItems` (dozens) is rejected as an invalid argument. Put the target count in the prompt, enforce the lower bound in code, and slice in code.
  - Without `maxOutputTokens` (65,536 here), a large catalog truncates mid-object and the JSON parse returns null.
  - Don't use `additionalProperties` in schemas.
  - Search grounding and JSON mode are mutually exclusive.
  - Pace image calls (batches of 8) to avoid 429s.
- **Other pitfalls worth a slide:** two copies of one shared module (a canonical copy and a served copy must be re-synced after edits); per-slide editor edits written to manifest *copies* vanish unless routed through the right setter; derived data (such as console-screen panels) must be re-derived inside the manifest or exports render empty; two same-named functions in one file where the later one wins (hoisting); stale PostgREST schema cache and missing GRANTs after migrations.
- **Testing:** a smoke suite loads the browser modules into a fake `window` and tests pure functions (validators, adapter, export model, server helpers). Separate harnesses render each console-screen family with a minimal hand-rolled DOM and check the export capture path.
- **Deployment:** Heroku web dyno (`node` supervisor) plus a `release` step for DB migrations; a postbuild step that vendors the PostgREST binary. Required config (names only): database URL, JWT secret, Neon auth base URL and JWKS URL. AI and storage config: Gemini API key, optional model overrides and concurrency limits, GCS bucket and service-account key. Optional: Google OAuth client for Slides, Aubrey keys, rate-limit settings. Node 20 or 22.
- **Runtime note:** the standalone apps in the ZIP are plain static files plus a zero-dependency Node server. They need no database or login.

### "How to build something similar" (use for the architecture section)
1. Express with static serving, an `/api` router, and env validation at boot.
2. One JSON-serializable state object plus a cache-then-server store.
3. A server-side AI proxy: key never in the browser, model allowlist, streaming with pings, rate limit and in-flight caps.
4. Per-artifact foundations: prompt, small schema, deterministic normalize with neutral fallbacks and a repair pass.
5. Scrape real data first, AI second.
6. One manifest function that drives the selector, the preview, and all exports.
7. A single config contract per generated app (defaults neutral, in `:root`).
8. Thin exporters over a shared export model; keep units explicit.
9. External IdP for login, verified JWT, and RLS in the database (policy and GRANT).
10. Guard rails: a no-brand-bleed check, edit-to-save-to-export value-follow tests, and a two-copy sync check.

### Known limitations (put these on a slide, honestly)
- **Product photos are all AI-generated.** Scraped product names and categories are used, but a scraped-image-to-SKU mapper exists in code and is not wired in. Do not claim "real product imagery".
- If Gemini, the scrape, or image generation fails, Retail CAB silently ships neutral template defaults, with only a warning on the Done panel.
- Cancel can abort photo passes but not in-flight text calls.
- The ZIP must be served over http (not opened from `file://`). Non-Retail-CAB app images may revert to illustrated fallbacks after about 7 days; Retail CAB images are baked into the ZIP.
- Simple mode produces one slide per experience, with no narrative framing.
- Build time can reach about 10 minutes, and each user is rate-limited.
- The signed-in hero in the Retail CAB storefront still shows a baked prior-customer image and some hardcoded loyalty/lifestyle copy (known open issue).
- Autopilot is behind a URL flag and is experimental.
- PPTX and PDF export live in the full builder. Google Slides export appears disabled in the UI. It is **not confirmed** whether either is reachable from Simple mode. Mark any export claim beyond "ZIP" as "To confirm".
- Today an SE must download the ZIP and run a local server (a barrier for less-technical users). Publishing every generated site to Heroku is being explored. The blockers are org infrastructure rather than code: private spaces, internal URL handling, and avoiding duplicate or orphaned apps when an SE re-publishes. Say "exploring", not "shipping".

## Step 3: The Uri partnership (from the 10/5/2026 Shachi / Uri call)

Context: Shachi Kakkar (builder owner) and Uri Botfield spoke for about 27 minutes about how their work fits together. Use only what is below. Do not invent details about Uri's repo. Refer to Uri by name; don't guess pronouns.

- **Two tracks of the same idea, like funnel stages.** Shachi's Simple/Guided builder is stage 1: fast, no org required, a believable branded demo a customer reacts to, built in roughly an hour. Uri's build is stage 3 to 4: after a validated meeting, it builds the real thing in an org.
- **Why stage 1 matters (Shachi):** a recent retail customer meeting wanted the vision a prior CAB demo showed. Another customer's meeting was about reallocating GMV into other products, to show an uncovered need. Another is coming next week with no budget. Shachi's pitch: spin up something good enough to show, talk through every product, and be ready. A stretch idea: by the end of a one-hour discovery call, an SE could ask "is this something you'd want to see?" and pull up the site. Then, if the customer wants more, feed it into Uri's build.
- **The middle gap:** an SE has a meeting in 15 minutes. Use the Simple builder. Once there's a real evaluation, use Uri's tool, and whatever was built earlier feeds into it.
- **AE caution (Shachi):** Shachi can't see AEs intelligently speaking to it with a customer ("I don't know, it's Salesforce"). The target user is an SE, or an SE paired with an AE.
- **Uri's build (in progress, not yet shareable):**
  - Takes the CAB demo framework and fed it use cases across industries (all of "Pace" / Pacemakers verticals).
  - The idea: clone the repo, answer a few questions (industry, use case, the customer's website, discovery notes), spin up an org, drop in credentials, and it builds everything into the org. "One step beyond" what Shachi's builder does. Uri compared it to a Cubic-style bootstrapper and said it could probably be made one.
  - It becomes a functional org that can be handed to an FDE to build out in a sandbox.
  - It is predicated on a real Agentforce agent (agent scripts). Shachi's builder deliberately strips that out so any SE can repeat it with just a UI.
  - Data Cloud does the backend decisioning: it generates a product catalog, fills a DMO, and relies less on Gemini. It can extend into a Data Cloud demo, a Marketing Cloud Personalization demo, a shopper-agent demo, the adaptive website, and loyalty.
  - The agent's cards (sizing, returns, and so on) are **white-labeled** by industry and use case: a candle retailer would get "one, two, three wick" instead of sizing; Bed Bath & Beyond has no sizing. Intended to stretch across all verticals.
  - Uri also said an AE could run a quick door-opener from Shachi's site, while an SE can take Uri's build into their own org and iterate (B2B? other use cases?).
  - Status: Uri is white-labeling, cleaning up, moving it to a different repo, and testing it against different industries to learn what the manual steps are. Possible future: Heroku CLI automation to create the app. **Not available yet.** Uri said they can add Shachi to the repo once tested. Do not tell SEs to clone anything. Say "coming; check with Uri".
- **Hand-off flow:** the Simple output (the ZIP / site) plus the customer's reactions and gaps ("we want this", "we don't have that"), all documented, becomes input context to Uri's build. Discovery notes are another input.
- **Aspirational timeline (Shachi, label as a target):** from about a month to deliver a connected-vision presentation, to quick validation and a quick build; within about two weeks something ready to hand to an FDE; within about three months a customer in a sandbox saying "this is when we want to buy it". Shachi also floated a ladder of versions of this approach: an under-an-hour version, a 5-to-10-hour version, and a production-ready customer flow, to be clarified with leadership.
- **Two-way sync idea:** Shachi would like Uri's innovations (for example, the sizing and return cards) fed back into the Simple builder to improve its output, and the Simple output fed into Uri's build, "as close to one-to-one as possible" for each card.
  - Mechanism discussed: a recurring check-in roughly every three weeks; provisional branches (one for Uri's work pulled into Shachi's project, one for Shachi's updates for Uri); and folding updates into the generated Claude handoff file so an SE's Claude session gets better context.
- **Timberland:** a demo built by an FTE that was touted as the gold standard. Uri had already built the CAB demo and then borrowed its sizing cards and similar pieces. Context only, not a dependency. There is also an agent experience team looking at where agents show up on a website (center, panel, chat bubble), so multiple look-and-feel variants are expected. The Simple builder could define the look and feel and feed it into the demo asset.
- **Hosting discussion:** both agreed the ZIP-plus-local-server step is a barrier. Shachi will explore publishing every site to Heroku (and mobile-friendly sites would help). Uri noted Heroku private spaces and internal URL handling are painful. Shachi's open questions: avoiding multiple Heroku apps per site, and what happens if someone deletes and recreates the project. Shachi intends to raise this with Pacemakers (org-level practices and budgets) once the site is polished. Shachi also plans to raise the Uri collaboration with leadership.

## Step 4: Decision guide (the heart of the microsite)

Build a clear "which tool when" section. Draft from this, then adjust for anything Step 1 turns up:

| Situation | Use |
|---|---|
| Meeting in hours or days; no budget; need something customer-specific to react to | **Simple / Guided** |
| Door opener; first or second call; validating interest | **Simple / Guided** |
| Retail or commerce storefront story, plus Clienteling or Cimulate | **Simple / Guided** |
| A full narrative deck (journey, persona, business value) from a script | **Full builder** (the "Advanced" path) |
| The customer says "show this working end to end", or has real requirements | **Uri's build** (when available) |
| You need Data Cloud, Agentforce, or Marketing Cloud Personalization demonstrably behind the demo | **Uri's build** |
| A non-retail vertical that needs industry-specific cards | **Uri's build** |
| Handing off to an FDE or a sandbox build | **Uri's build** |
| An AE running it alone | Caution: pair with an SE |

Add a "What this is NOT" panel: not a production system, not a live Agentforce agent, not real search (scripted, chip-driven), product photos are generated, one slide per experience in Simple mode.

Add an **SE playbook** slide ("15 minutes before a meeting"): sign in, New project, Simple / Guided, pick experiences, paste the URL and Analyze, optional details, Build, review the preview, download the ZIP, run it with the included server, edit with the included Claude handoff file.

## Step 5: The deliverable

Produce **one self-contained HTML file** (inline CSS, JS, and SVG; no external dependencies, no build step) named `holodeck-enablement.html`. If your environment supports artifacts or file creation, create it that way; otherwise output the complete HTML in a single code block.

- Section-by-section layout with a sticky nav rail, keyboard navigation (arrow keys), smooth scroll, and a print stylesheet so it can be saved as a PDF.
- Responsive and accessible: semantic headings, good contrast, visible focus states, alt text or `aria-label` on diagrams.
- Clean, Salesforce-adjacent look. No emoji. Draw all diagrams yourself in inline SVG: the funnel/two-tracks diagram, the architecture component diagram, the build-pipeline flow, the decision tree.
- Use tables for the decision guide and the deterministic-vs-probabilistic split. Keep text slide-sized: short headlines, tight bullets, details in expandable panels.

Required sections, in order:
1. **Why this exists:** the problem (a month to a connected vision; no budget for speculative builds) and the promise (a branded, customer-specific demo in roughly an hour; label as Shachi's target).
2. **What it is:** the Simple / Guided flow in one visual; the four steps.
3. **What gets built:** the five experiences with what's inside each; the ZIP contents tree.
4. **See it work:** a placeholder panel for a recorded walkthrough and screenshots, labeled "Add video here". Do not fabricate screenshots.
5. **When to use it:** the decision guide, "What this is NOT", and the SE playbook.
6. **Where Uri's build fits:** the two-tracks/funnel visual, the hand-off, and the sync loop. Label status "in progress".
7. **How it's built:** architecture diagram, build-pipeline flow, deterministic vs probabilistic, auth and data, deployment.
8. **Build something similar:** the 10-step pattern plus "things that bit us" (Gemini lessons and pitfalls).
9. **Honest limits and roadmap:** the limitations list, hosting, and the Uri sync.
10. **Latest updates:** from Step 1, newest first, each with date and source channel. If Slack wasn't available, show a clearly marked placeholder.
11. **Get started / who to ask:** the sign-in URL as a labeled placeholder, Shachi Kakkar for the builder, Uri Botfield for the CAB build. No contact details unless found in Slack.

## Rules

- Customer names from the call (the retail customers and the garbled name of next week's meeting) are internal context. Use at most one anonymized example ("a specialty-retail customer") unless I say otherwise. In your final message, list which examples you anonymized.
- Do not include any credentials, keys, or secret values. Env var names are fine.
- Label timelines and "about an hour" claims as targets from Shachi, not measured results.
- Do not claim PPTX, PDF, or Slides export for Simple mode (see limitations).
- Before saying done, re-read your HTML and check that every section from the list exists, navigation works, nothing is cut off, and no placeholder text is left except the ones deliberately marked. State what you checked and what you could not check (for example, whether it renders in a browser).
- At the end, list: open questions for me, every "To confirm" item, and anything from Slack that contradicted Step 2.
