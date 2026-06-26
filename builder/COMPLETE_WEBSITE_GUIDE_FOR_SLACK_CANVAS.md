# Complete End-User Guide for Holodeck Website

## What This Website Is For

This website helps you create a polished, customer-ready demo from your story, customer context, and product goals.

You do **not** need to be technical to use it.

You can:
- Start a project from scratch or with AI help
- Turn notes/scripts into a structured demo story
- Choose slides and demo moments
- Add brand details, live links, and images
- Preview everything before sharing
- Export a complete package

---

## Quick Start (10 Minutes)

If you want the fastest path, do this:

1. Sign in and create a new project.
2. Add your customer script or notes in **Script & Story**.
3. Click **Extract Story Foundations**.
4. Fill customer details in **Setup**.
5. Keep or adjust recommended slides in **Slide Selection**.
6. Add links in **CX Component Links** (optional).
7. Add images in **Assets** (optional).
8. Final check in **Preview**.
9. Download your demo from **Export**.

Default path: Script -> Setup -> Slide Selection -> Preview -> Export.

---

## AI Fast Lane (Easiest Way to Start)

Use this when you want AI to generate your first draft quickly.

### Steps
1. Open **AI Prompt**.
2. Copy the provided prompt.
3. Paste it into Claude/ChatGPT with your customer context.
4. Copy the AI output.
5. Return and click **Import AI response**.
6. Paste the output and import.

### What Happens Next
The tool can auto-fill:
- Setup details
- Personas
- Story acts
- Slide recommendations
- Slide draft content
- Asset suggestions

### Helpful UX
- There is a one-time guided tour for this page.
- You can replay it anytime with **Take the tour again**.
- The schema/template is already included in the main prompt, so extra copy steps are usually unnecessary.

---

## Full Walkthrough (Every Main Feature)

### 1) Login and Account

What you can do:
- Sign in using email + one-time code
- Continue where you left off
- Sign out safely

Tips:
- Check email spelling if code does not arrive.

### 2) Home and Project Management

What you can do:
- See all projects
- Search and filter projects
- Open, duplicate, rename, or delete projects
- Create new project (manual or AI-assisted)

Best practice:
- Use clear project names with customer + theme.

### 3) Setup

What this section does:
- Defines the business context for your demo

What to fill:
- Project name
- Customer name and website
- Industry
- Audience (for example: Executive or Technical)
- Sales stage
- Products in scope
- Branding mode and colors
- Presenter name/title

Why this matters:
- Better setup = better recommendations and cleaner story.

### 4) Script & Story

What this section does:
- Converts your raw script/notes into structured inputs

What you can do:
- Paste script text
- Upload document files
- Run extraction to generate initial demo structure

Best inputs include:
- Customer problem
- Current pain
- Future vision
- Persona
- Journey sequence
- Value/outcome targets

### 5) Story Foundations

What this section does:
- Creates your strategic narrative spine

Key fields:
- Business problem
- Current-state pain
- Future-state vision
- Transformation thesis
- Executive takeaway
- Value drivers
- Assumptions/open questions

Use **Story Quality Check** here to catch narrative gaps early.

### 6) Slide Selection

What this section does:
- Lets you shape the final deck

What you can do:
- Keep or remove recommended slides
- See required vs recommended vs optional status
- Rename slide titles
- Use grid/list views
- Apply bulk actions

Tip:
- Keep the core storyline tight; remove extras only after your story is complete.

### 7) CX Component Links (Optional)

What this section does:
- Adds live experience links (for example product screens or flows)

What you can do:
- Add URLs
- Set frame type
- Link URLs to specific demo slides
- Accept auto-match suggestions

If you have no live links yet, skip this section and continue.

### 8) Assets (Optional)

What this section does:
- Adds visuals to supported slides

What you can do:
- Upload images/media to each asset slot
- See where each image is used
- Replace or clear uploads
- Polish pending text quickly

Tip:
- Pick slides first, then upload only assets those slides actually use.

### 9) Preview

What this section does:
- Gives a realistic final-pass view before export

What you can do:
- Review full flow
- Check for missing inputs
- Navigate through slides
- Edit text inline for quick polish

Tip:
- Use this step for final language cleanup instead of jumping backward.

### 10) Export

What this section does:
- Packages your finished demo

What you can do:
- Run export readiness check
- Download complete demo package (recommended)
- Export even with warnings (after confirmation)

Before sharing:
- Replace placeholders (`XX%`, `[TODO: ...]`, etc.)
- Verify all live links
- Confirm branding and presenter info

### 11) Feedback

Use the feedback feature to:
- Report bugs
- Suggest improvements
- Share likes/dislikes

Best feedback format:
- What you did
- What you expected
- What happened instead

---

## Feature Encyclopedia (Simple, Practical)

### Script Extraction
- What: turns script into structured story data
- Use when: starting from notes or transcript
- Needs: script input
- Common mistake: vague inputs
- Pro tip: include persona + journey + value in your script

### Story Quality Check
- What: checks completeness and consistency
- Use when: after extraction and before export
- Needs: basic foundations
- Common mistake: waiting until final step
- Pro tip: run twice (early and final)

### Slide Recommendations
- What: suggests slide structure based on your story
- Use when: choosing your narrative flow
- Needs: setup + story basics
- Common mistake: over-trimming context slides
- Pro tip: keep must-have story slides first, optimize later

### CX Links
- What: embeds or links live experiences
- Use when: showing real journey moments
- Needs: valid URLs
- Common mistake: not linking URL to the right slide
- Pro tip: explicitly map mission-critical moments

### Asset Slots
- What: image/media placement for selected slides
- Use when: visual polish phase
- Needs: uploaded files (optional)
- Common mistake: uploading too early
- Pro tip: only upload what selected slides require

### Preview Inline Edits
- What: quick on-slide wording edits
- Use when: final polish
- Needs: none
- Common mistake: over-editing in earlier steps
- Pro tip: reserve this for final pass speed

### Export Readiness
- What: final health check before download
- Use when: last step
- Needs: complete enough story
- Common mistake: ignoring high-impact warnings
- Pro tip: prioritize story gaps, broken links, and placeholders

---

## Troubleshooting (If You See X, Do Y)

### “Import did not work”
- Re-run AI with strict JSON output
- Paste full output (not partial)
- Retry import

### “Slides feel too generic”
- Add clearer business problem, pain, and desired outcome
- Specify audience and sales stage
- Add stronger value drivers

### “Live demo link does not load”
- Confirm URL is reachable
- Try opening in new tab
- Replace with fallback link if needed

### “Images are missing”
- Re-check uploads
- Confirm images were attached to the right slot
- Re-export after changes

### “My updates are not visible”
- Refresh browser
- Confirm you exported the newest version

---

## Claude Code Prompts for Ongoing Edits

Use these copy-paste prompts to keep improving your demo after first export.

### Prompting Rules (Simple)
- Ask for small, focused edits
- Ask for no invented facts
- Keep unknowns as `[TODO: ...]`
- Ask for clear change summary

### A) Generate a Full First Draft

```text
Create a complete Holodeck draft from my inputs.

Requirements:
- Build a clear end-to-end story
- Include setup, persona, story acts, and slide plan
- Keep outputs realistic and executive-friendly
- If something is unknown, use [TODO: ...] instead of making it up

Inputs:
[PASTE CUSTOMER CONTEXT + SCRIPT + PRODUCTS + AUDIENCE + GOALS + LINKS]
```

### B) Make Focused Content Edits

```text
Update only the following parts of my demo:
- [LIST EXACT CHANGES]

Rules:
- Keep everything else unchanged
- Do not invent customer facts
- Use [TODO: ...] when details are missing
- Return a concise summary of exactly what changed
```

### C) Fix Validation and Quality Gaps

```text
Review this demo draft and fix only quality gaps:
- missing story clarity
- weak value drivers
- unclear persona relevance
- missing readiness details

Do not rewrite unrelated sections.
Keep structure intact.
```

### D) Improve Story for Executive Audience

```text
Rewrite this demo copy for executive clarity.

Goals:
- shorter, sharper language
- business outcomes first
- confident but realistic tone

Do not add invented metrics.
Use [TODO: ...] where needed.
```

### E) Update Assets and Live Links

```text
Apply these updates:
- assets: [LIST]
- live links: [LIST]

Ensure each item is mapped to the correct demo moment.
Keep all existing structure unless a minimal change is needed.
```

### F) Final Gate Before Sharing

```text
Run a final review and return PASS or FAIL.

Check:
- no obvious placeholders left
- story is coherent end-to-end
- links are mapped correctly
- messaging fits the target audience

If FAIL, provide only the smallest required fixes.
```

### Good vs Weak Prompt

Good:
“Update only the executive summary and value slides for Acme, keep all other sections unchanged, and keep unknown metrics as `[TODO: ...]`.”

Weak:
“Make this whole demo better.”

---

## Glossary (Plain English)

- **Persona**: the main customer character in your story
- **Story Acts**: the major moments in the journey
- **Slide Recommendation**: system-suggested slide choices based on your content
- **CX Link**: a live URL shown during the demo
- **Asset Slot**: a place where an image/media file can be added
- **Readiness**: whether a slide is presentation-ready
- **Placeholder**: temporary text like `[TODO: ...]` or `XX%`
- **Export Package**: the final downloadable demo bundle

---

## What Changed Recently (Usability)

Recent improvements make AI-assisted setup easier:
- Dedicated AI onboarding tour
- Replay option with **Take the tour again**
- Clearer **Import AI response** wording
- Better guidance that the prompt already includes needed schema context

