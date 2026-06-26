# Complete Website Guide for Slack Canvas

## What This Website Does (In 1 Minute)

This website helps you build a polished, customer-ready Salesforce Holodeck demo without heavy coding.

You can:
- Create and manage demo projects
- Turn scripts/notes into a full story and slide plan
- Add branding, personas, journey acts, CX embeds, and assets
- Preview the full flow before presenting
- Export a ready-to-run demo package
- Keep editing later with Claude Code prompts

If you are non-technical, you can still complete the full workflow using the Builder UI.

---

## Quick Start (5-10 Minutes)

1. Open Builder (`/builder/`) and sign in.
2. Create a new project.
3. Go to **Step 2 - Script & Story** and paste your script (or upload `.txt`, `.md`, `.json`, `.pdf`, `.docx`).
4. Click **Extract Story Foundations**.
5. Go to **Step 1 - Setup** and confirm customer, audience, stage, products, and branding.
6. Go to **Step 5 - Slide Selection** and keep the recommended slides (or adjust).
7. Optional: add **Step 6 - CX Component Links** and **Step 7 - Assets**.
8. Use **Step 8 - Preview** to fix any text quickly.
9. Use **Step 9 - Export** and download the complete ZIP.

Default path for most users: Script -> Setup -> Slide Selection -> Preview -> Export.

---

## AI Prompt Fast Lane (Updated Usability Flow)

Use this when you want AI to generate a first-pass config quickly.

### How It Works
- Open the **AI Prompt** page.
- Copy the built-in prompt.
- Paste prompt + your customer context into Claude/ChatGPT.
- Copy the AI JSON output.
- Come back and click **Import AI response**.
- Paste the response and import.

The builder auto-fills setup, personas, story acts, recommendations, slides, and assets.

### New Onboarding Behavior
- AI Prompt has a dedicated one-time guided tour.
- You can replay it anytime with **Take the tour again**.
- The guide text now uses **Import AI response** wording to match the button.

### Pro Tip
You usually do **not** need to manually copy the schema template because the main AI prompt already includes it.

---

## End-to-End Journey

### 1) Access, Login, and Session

### What You Can Do
- Sign in with email + OTP
- Return to existing work
- Sign out securely

### Required
- Valid `@salesforce.com` email for OTP flow

### Common Issues
- OTP not received -> check email spelling and inbox filtering

---

### 2) Home and Project Management

### What You Can Do
- View all projects
- Search/sort/filter projects
- Create project (scratch or AI-assisted path)
- Open, duplicate, rename, and delete projects

### Required
- Project name at creation time

### Optional
- Add metadata early (industry/audience/stage/products) for better recommendations later

---

### 3) Builder 9-Step Workflow

The core authoring journey is a guided 9-step flow.

### Step 1 - Setup
Purpose: define project identity and business context.

You can set:
- Project name
- Customer info (name, website, industry)
- Audience and sales stage
- Product chips
- Branding mode (`salesforce`, `customer`, `cobrand`)
- Presenter details
- Brand colors and logos

Use this first if you already know the customer context.

### Step 2 - Script & Story
Purpose: turn raw narrative into structured content.

You can:
- Paste script directly
- Upload supported files (`.txt`, `.md`, `.json`, `.pdf`, `.docx`)
- Pull script from integrations when available
- Run extraction for story foundations/personas/acts/signals

Best practice: use clear structure in script inputs (customer, persona, journey, value, open questions).

### Step 3 - Story Foundations
Purpose: validate and refine the strategic narrative.

You can edit:
- Business problem
- Current-state pain
- Future-state vision
- Transformation thesis
- Executive takeaway
- Value drivers
- Assumptions and open questions

You can also run **Story Quality Check** here.

### Step 4 - Recommended Narrative
Purpose: review AI/parser-derived story pieces and tune relevance.

You can:
- Validate extracted foundation quality
- Adjust narrative emphasis for your audience
- Prepare cleaner input for slide recommendations

### Step 5 - Slide Selection
Purpose: build the deck plan.

You can:
- Select/deselect recommended slides
- See required/recommended/optional status
- Rename slide titles
- Switch grid/list view
- Use bulk actions by section

Required slides stay locked so the deck remains structurally complete.

### Step 6 - CX Component Links (Optional)
Purpose: connect live experiences (embeds/URLs) to demo moments.

You can:
- Add component URLs
- Set component types and frames
- Link components to specific slides
- Accept auto-match suggestions and make them explicit

If no URLs are available, you can skip this step.

### Step 7 - Assets (Optional Uploads)
Purpose: fill image/media slots used by selected layouts.

You can:
- Upload images/media per slot
- See where each asset is used
- Replace or clear uploads
- Polish pending text inline if needed

If you skip uploads, slides use clean placeholders instead of broken visuals.

### Step 8 - Preview
Purpose: presentation-quality review before export.

You can:
- Review full deck flow
- Check missing inputs
- Open full modal preview
- Navigate with keyboard
- Edit slide text inline directly from preview
- Reorder/remove non-synthetic slides

This is the fastest place for final wording polish.

### Step 9 - Export
Purpose: package your demo for handoff and presenting.

You can:
- Run export readiness checklist
- Download complete ZIP (recommended)
- Download/copy config-only output
- Export even with soft warnings (after confirmation)

The ZIP includes helper docs and `CLAUDE_MODIFY.md` for post-export edits.

---

## Feature Encyclopedia (Simple + Complete)

For each feature: what it is, when to use it, required inputs, common mistake, pro tip.

### OTP Login
- What: passwordless login using email code
- When: every session start
- Required: valid email
- Common mistake: typo in email
- Pro tip: verify login first before long editing sessions

### Project Search/Filter
- What: quickly find specific projects
- When: large project list
- Required: none
- Common mistake: searching with old project name after rename
- Pro tip: filter by customer + stage for fast narrowing

### Script Extraction
- What: parses script into structured demo ingredients
- When: starting a new build from notes
- Required: script text or uploaded file
- Common mistake: unstructured input causing weak extraction
- Pro tip: include journey sequence and persona details explicitly

### Story Quality Check
- What: error/warning/info checks for narrative completeness
- When: after extraction and before final export
- Required: baseline foundations/persona/acts
- Common mistake: ignoring warnings until last minute
- Pro tip: run once before slide selection and once before export

### Slide Recommendation + Selection
- What: proposes and organizes slide plan by section
- When: after foundations are stable
- Required: customer context + products + core narrative
- Common mistake: removing too many context slides for executive audiences
- Pro tip: keep story spine short, then tailor detail depth

### CX Components
- What: links live screens/frames into demo flow
- When: showing real product touchpoints
- Required: valid URLs
- Common mistake: forgetting slide linkage
- Pro tip: set explicit links for critical moments to avoid ambiguity

### Assets
- What: media slots driven by selected layouts
- When: visual polish phase
- Required: files only for slots you care about
- Common mistake: uploading assets before slide plan is stable
- Pro tip: pick slides first, then upload only used assets

### Preview Inline Editing
- What: direct text edits from preview cards/popovers
- When: final language polish
- Required: none
- Common mistake: jumping backward for tiny copy edits
- Pro tip: do micro-edits in preview to save time

### Export Checklist
- What: readiness summary before packaging
- When: final step before ZIP
- Required: minimal narrative/build completeness
- Common mistake: treating all warnings as blockers
- Pro tip: resolve high-impact items first (story gaps, links, major placeholders)

### Feedback
- What: submit product feedback and triage (admin view)
- When: reporting bugs/usability ideas
- Required: short message
- Common mistake: vague reports without context
- Pro tip: include step name + action + expected vs actual

---

## Import, Validation, and Quality

### Accepted Import Formats
- Raw JSON object
- JS assignment style (`window.HOLODECK_CONFIG = {...}`)
- JSON inside markdown fences
- File upload import (`.js`, `.json`, `.txt`)

### What Import Tries to Do for You
- Normalize shape into expected builder state
- Preserve as much usable content as possible
- Show warnings/errors for missing or malformed parts

### Common Import Issues + Fixes
- Invalid JSON -> validate syntax and remove trailing commas/comments
- Missing required arrays/objects -> re-run with complete template
- Unknown layout names -> use only supported layouts
- Thin narrative data -> add foundations and acts, then re-import

### Supported Layouts (Use Only These)
- `hero`
- `storyFoundation`
- `currentFutureState`
- `futureState`
- `journeyTimeline`
- `demoMap`
- `personaCard`
- `agentConversation`
- `unifiedProfile`
- `architecture`
- `deviceMoment`
- `embeddedCxComponent`
- `kpiScorecard`
- `executiveSummary`
- `nextSteps`

---

## Preview and Export Guidance

### Builder Preview vs Final Runtime
- Builder preview helps with fast authoring decisions.
- Exported runtime is the presentation source of truth.

### Export Options
- **Complete ZIP**: full package for presenting/handoff (recommended)
- **Config-only**: update existing demo environments

### Presenter Checklist (Before You Present)
- Replace all placeholder metrics (`XX%`, `+$XX`, etc.)
- Confirm presenter name/title
- Verify each CX URL loads and is embeddable
- Confirm logo/brand approvals
- Run through all sections once on target device

---

## Troubleshooting (By Symptom)

### “Import failed” or “looks incomplete”
- Confirm output is strict JSON or valid config assignment
- Re-run prompt with stronger constraints and full context
- Ensure allowed layouts only

### “Slides look generic”
- Add sharper business problem/current pain/future vision
- Add explicit audience and stage
- Add concrete value drivers and moments

### “Embedded demo does not load”
- Check URL reachability
- Verify iframe compatibility
- Add fallback messaging/link if needed

### “Assets are missing”
- Verify file paths and uploads
- Re-check which slots are used by selected slides
- Re-export after uploads

### “Export works but output isn’t updated”
- Hard refresh browser
- Confirm you are opening the latest exported folder
- Verify config changes were saved before export

---

## Claude Code Prompt Library (Copy/Paste)

Use these prompts to make future edits safely and quickly.

### Prompting Principles for This Repo
- Prefer config-first edits (`demo/holodeck.config.js`) for content changes.
- Ask for strict JSON/valid JS output.
- Request minimal, reviewable diffs.
- Preserve unknown fields.
- Never invent customer facts; use `[TODO: ...]`.
- Keep slide layouts within allowed list.

### Template A: Extraction-First Config Generation

```text
You are a Salesforce SE generating a Holodeck demo config for this repository.

Return ONE valid JSON object only (no prose, no markdown fences).

Requirements:
- Match the expected shape: project, brand, storyFoundations, personas, storyActs, slideSections, slides, cxComponents, assets, recommendations, buildNotes.
- Extract story foundations first (businessProblem, currentStatePain, futureStateVision, primaryNarrative, transformationThesis, executiveTakeaway, valueDrivers, assumptions, openQuestions).
- Build slides across sections in order: intro, journey-map, meet-persona, demo, business-value.
- Add selectionStatus, selectionRationale, readinessStatus, missingInputs for each slide.
- Use only allowed layouts from this repo.
- Do not invent facts. Use [TODO: ...] for unknowns.
- Stable IDs (persona_1, act_1, slide_1, cx_1, asset_1), contiguous 0-based slide.order.
- If CX URLs are provided, add cxComponents and at least one linked embeddedCxComponent slide.

Inputs:
[PASTE CUSTOMER NOTES + SCRIPT + PRODUCTS + AUDIENCE + BRAND + CX URLs]
```

### Template B: Targeted Config Modification (Diff-First)

```text
Edit only what is requested in demo/holodeck.config.js.

Requested changes:
- [LIST CHANGES]

Rules:
- Preserve existing structure and unknown fields.
- Keep valid JavaScript assignment to window.HOLODECK_CONFIG.
- Keep IDs and ordering stable unless explicitly changing them.
- Use allowed slide layouts only.
- Do not invent facts; use [TODO: ...] where needed.
- Keep edits minimal and show a clear diff-style summary.
```

### Template C: Validation Fix Prompt

```text
Given this config and these quality/validation issues, make minimal edits to resolve them.

Issues:
[PASTE ISSUES]

Fix priorities:
1) Missing story foundations
2) Persona/story act completeness
3) Slide readiness and missing inputs
4) Embedded CX linkage correctness
5) Placeholder cleanup where possible

Constraints:
- Keep narrative intent
- Preserve structure
- Do not rewrite unrelated sections
- Return updated config content only
```

### Template D: Script-to-Config Conversion

```text
Convert this script into a builder-importable config JSON for this repository.

Must include:
- 1+ persona
- 3-4 story acts
- 5-8 slides minimum
- valueDrivers (3+)
- assumptions and openQuestions
- sectioned slide plan (intro, journey-map, meet-persona, demo, business-value)

No invented facts. Use [TODO: ...] placeholders when uncertain.

Script:
[PASTE SCRIPT]
```

### Template E: Asset / CX Binding Update

```text
Update the config to bind these new assets and CX URLs to the right slides.

Assets:
[LIST FILES + TARGET SLIDES]

CX URLs:
[LIST URL + TYPE + TARGET SLIDE OR ACT]

Rules:
- Keep existing slide structure unless linkage requires a minimal addition.
- For commerce/web use desktop frame; for SMS/agent use mobile frame unless specified.
- Ensure embeddedCxComponent slides are linked explicitly.
- Return only config changes.
```

### Template F: UX Copy Polish

```text
Polish copy for executive clarity and brevity without changing storyline.

Scope:
- [LIST SLIDES OR SECTIONS]

Rules:
- Keep tone concise and outcome-oriented
- No invented metrics
- Preserve meaning and structure
- Mark unknown specifics with [TODO: ...]
```

### Template G: Export Troubleshooting

```text
Diagnose this export/run issue using this repository's runtime expectations.

Context:
- Error: [PASTE]
- Steps performed: [PASTE]
- Environment: [localhost URL or other]

Please provide:
1) Likely root cause
2) Exact remediation steps
3) Whether fix is config-only or runtime/template-level
4) Minimal safe fix
```

### Template H: Validation Gate Prompt (Final Pass)

```text
Review this config as a final gate and return pass/fail with concise fixes.

Checklist:
- Valid JSON/JS structure for import/runtime
- Allowed layouts only
- Section ordering and slide order integrity
- selectionStatus/readinessStatus/missingInputs consistency
- CX components linked correctly
- Placeholder inventory ([TODO:], XX%, +$XX)
- No invented customer facts

Output:
- PASS or FAIL
- If FAIL: numbered minimal fixes
```

---

## Good Prompt vs Weak Prompt

### Good
“Update only `demo/holodeck.config.js` to rebrand for Acme, keep slide structure unchanged, use `[TODO: ...]` for unknown metrics, and show a minimal diff summary.”

Why good: scoped, safe, and compatible with repo behavior.

### Weak
“Rewrite the whole demo to be better.”

Why weak: ambiguous, high risk of breaking structure, likely to invent facts.

---

## Glossary (Non-Technical Friendly)

- **Builder**: the guided UI for creating/editing demos.
- **Config**: the structured data file that powers all content.
- **Story Foundations**: your business problem, pain, vision, and value backbone.
- **Persona**: the featured end-user/customer character in the story.
- **Story Acts**: key moments in the customer journey.
- **Slide Layout**: predefined visual format a slide uses.
- **CX Component**: a live or linked external experience shown in the demo.
- **Readiness Status**: signal showing if a slide is presentation-ready.
- **Missing Inputs**: required details still needed for a strong output.
- **Placeholder**: temporary text like `[TODO: ...]`, `XX%`, or `+$XX`.
- **Preview**: in-builder quality check view before export.
- **Export ZIP**: complete packaged demo for sharing and presenting.

---

## What Changed Recently (Usability)

Recent updates emphasize smoother AI onboarding:
- Dedicated AI Prompt tour segment
- One-time auto-tour behavior with replay option
- Clearer “Import AI response” action language
- Better guidance that schema is already included in the prompt

These changes make first-time AI-assisted setup easier while keeping manual/script-first workflows fully supported.

