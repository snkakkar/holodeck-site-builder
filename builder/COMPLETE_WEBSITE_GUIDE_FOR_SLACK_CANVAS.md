# Holodeck Complete End-User Guide (Slack Canvas Master)

## Start Here

This guide is for anyone using the Holodeck website, from first-time users to power users.

You can use it to:
- Build a full demo from scratch
- Use AI to create a fast first draft
- Improve story, slides, links, and visuals
- Export and share confidently
- Keep making easy edits after download with Claude/ChatGPT prompts

If you only read one section first, read **Quick Start**.

---

## Quick Start (10 Minutes)

1. Sign in and create a new project.
2. Add your script or notes in **Script & Story**.
3. Click **Extract Story Foundations**.
4. Fill customer and audience details in **Setup**.
5. Keep/edit recommended slides in **Slide Selection**.
6. (Optional) Add live links in **CX Component Links**.
7. (Optional) Add images in **Assets**.
8. Do a final pass in **Preview**.
9. Download from **Export**.

Default flow for most people:  
Script -> Setup -> Slide Selection -> Preview -> Export

---

## AI Fast Lane (Fastest Way To Draft)

Use this if you want AI to generate your first version quickly.

### Option A: Copy Prompt To Claude/ChatGPT
1. Open **AI Prompt**.
2. Review the pre-filled inputs (already pulled from your project where possible).
3. Click **Copy AI Prompt**.
4. Paste into Claude/ChatGPT and run it.
5. Copy the JSON result.
6. Return and click **Import AI response**.
7. Paste and import.

### Option B: Generate With Gemini
If your environment supports Gemini, you can click **Generate with Gemini** and skip manual copy/paste.

### What Gets Auto-Filled
- Setup details
- Personas
- Story acts
- Story foundations
- Slide recommendations
- Slide draft content
- Asset suggestions

### Helpful Onboarding
- There is a one-time guided tour on AI Prompt.
- You can replay it anytime with **Take the tour again**.
- You usually do not need extra schema copy steps because prompt context is already included.

---

## Full Website Walkthrough

### 1) Login and Account
What you can do:
- Sign in with one-time code
- Resume previous projects
- Sign out

If code does not arrive:
- Check email spelling
- Check spam/filtered inbox folders

### 2) Home and Projects
What you can do:
- Create a project
- Search/filter your projects
- Open, duplicate, rename, delete

Naming tip:
- Use `Customer + Theme` for easy searching later.

### 3) Setup
Use this to set the business context.

Fill:
- Customer name and website
- Industry
- Audience type
- Sales stage
- Products
- Branding mode/colors/logo
- Presenter details

Why it matters:
- Better setup gives better AI output and better slide recommendations.

### 4) Script & Story
Use this to transform notes into structure.

You can:
- Paste text
- Upload document files
- Extract story foundations, personas, and acts

Best input includes:
- Business problem
- Current pain
- Future vision
- Persona
- Journey steps
- Value outcomes

### 5) Story Foundations
Use this to shape your narrative backbone.

Key fields:
- Business problem
- Current-state pain
- Future-state vision
- Transformation thesis
- Executive takeaway
- Value drivers
- Assumptions/open questions

Run **Story Quality Check** here to catch issues early.

### 6) Slide Selection
Use this to control what the audience will see.

You can:
- Keep/remove recommendations
- Rename titles
- Use bulk actions
- Switch view styles
- See required/recommended/optional status

Tip:
- Keep required and story-spine slides first, trim optional slides second.

### 7) CX Component Links (Optional)
Use this to connect live experiences.

You can:
- Add live URLs
- Map links to the right slides
- Accept auto-match suggestions

If you do not have links yet, skip and continue.

### 8) Assets (Optional)
Use this to add visuals.

You can:
- Upload images/media by slot
- See where each slot is used
- Replace/clear uploads

AI asset helper:
- **Generate all empty slots with AI** can fill persona copy and placeholder images quickly.
- For animated moments, AI usually generates still images; upload your GIF/MP4 if animation is required.
- For logos, the system tries real brand logo retrieval first, then falls back to AI-generated lookalike.

### 9) Preview
Use this for final polish.

You can:
- Review full flow
- Check missing inputs
- Navigate all slides
- Edit slide text inline

Tip:
- Do final language cleanups here for speed.

### 10) Export
Use this to package your finished demo.

You can:
- Run readiness checks
- Download complete package (recommended)
- Export even with warnings (after confirmation)

Before sharing:
- Replace placeholders (`[TODO: ...]`, `XX%`, etc.)
- Confirm links work
- Confirm brand and presenter details

### 11) Feedback
Use feedback to report:
- Bugs
- Confusing UX
- Improvement ideas

Best format:
- What you did
- What you expected
- What happened

---

## Feature Guide (Quick Reference)

### Script Extraction
- Use when: starting from notes
- Needs: script text/file
- Mistake: vague inputs
- Tip: include persona + journey + value

### Story Quality Check
- Use when: after extraction and before export
- Needs: foundations filled
- Mistake: waiting until the end
- Tip: run early and late

### Slide Recommendations
- Use when: shaping narrative flow
- Needs: setup + story context
- Mistake: removing too much context
- Tip: trim only after storyline is clear

### CX Links
- Use when: demo has live moments
- Needs: valid URLs
- Mistake: unmapped links
- Tip: explicitly map critical moments

### Asset Slots
- Use when: visual polish
- Needs: uploads (optional)
- Mistake: uploading before slide plan is final
- Tip: pick slides first, then assets

### Preview Inline Editing
- Use when: final wording pass
- Needs: none
- Mistake: over-editing too early
- Tip: use preview for speed

### Export Readiness
- Use when: final step
- Needs: coherent story and key fields
- Mistake: ignoring major warnings
- Tip: prioritize placeholders and broken links first

---

## Troubleshooting (If You See X, Do Y)

### “Import AI response failed”
- Re-run AI with strict JSON output
- Paste full output, not partial
- Retry import

### “Slides feel generic”
- Clarify business problem and desired outcomes
- Add audience and sales stage
- Add stronger value drivers

### “Live link does not load”
- Check URL works directly
- Try fallback/open in new tab
- Replace dead links

### “Images are missing”
- Verify upload completed
- Verify slot mapping
- Re-export

### “Changes do not appear”
- Refresh browser
- Confirm you exported newest version

---

## Downloaded Project Editing Guide (Also Included In Canvas)

When you export, your package includes a markdown file with AI edit prompts.  
This section mirrors that guidance so everything is also available here in Slack Canvas.

## Simple Rules Before You Prompt AI
- Ask for small, focused updates
- Keep unknown details as `[TODO: ...]`
- Do not invent customer facts or metrics
- Ask for a clear summary of what changed
- Keep structure stable unless you request structural change

## Everyday Prompt Templates (Copy/Paste)

### 1) Rename the customer everywhere
```text
Update the customer name everywhere in my demo to [NEW CUSTOMER NAME].
Keep the same structure and slide flow.
Show exactly what changed.
```

### 2) Rewrite for executives
```text
Rewrite the demo text for executive leaders:
- shorter sentences
- business outcomes first
- no unnecessary technical jargon

Keep the same story flow.
```

### 3) Adapt to a different industry
```text
Adapt this demo for [INDUSTRY].
Keep the same storyline, but update examples, challenges, and benefits to fit that industry.
Do not invent customer facts.
```

### 4) Shift product focus
```text
Rebalance the story to emphasize [PRODUCT A] and [PRODUCT B].
Keep deck length similar and avoid adding new sections unless required.
```

### 5) Simplify for a first meeting
```text
Rewrite content so a first-time audience can understand it quickly.
Use plain language and explain acronyms where needed.
```

### 6) Create a 5-minute version
```text
Trim this demo to a clear 5-minute flow.
Keep only the most important slides and smooth transitions between them.
```

### 7) Add outcome placeholders safely
```text
Where impact is discussed, add placeholders like [TODO: metric].
Do not invent numbers or claims.
```

### 8) Refresh persona
```text
Replace the persona with:
- Name: [NAME]
- Role: [ROLE]
- Goals: [GOALS]
- Pain points: [PAINS]

Update related slides so they stay consistent.
```

### 9) Localize wording by region
```text
Adjust wording for [REGION/COUNTRY] audience (tone, terminology, spelling).
Keep structure and storyline unchanged.
```

### 10) Editorial cleanup pass
```text
Do a final polish pass:
- improve clarity
- remove repetition
- fix grammar

Keep facts and structure unchanged.
```

### 11) Update assets and links
```text
Apply these updates:
- Assets: [LIST]
- Live links: [LIST]

Map each one to the correct demo moment.
Keep everything else unchanged.
```

### 12) Final quality gate
```text
Run a final review and return PASS or FAIL.

Check:
- no obvious placeholders left
- coherent story from start to finish
- links mapped correctly
- wording matches target audience

If FAIL, provide only the smallest required fixes.
```

## Good Prompt vs Weak Prompt

Good:
“Update only the executive summary and value slides for Acme, keep everything else unchanged, and use `[TODO: ...]` for unknown metrics.”

Weak:
“Make this demo better.”

---

## Glossary (Plain English)

- **Persona**: main customer character in the story
- **Story Acts**: key journey moments
- **Slide Recommendation**: suggested slide options
- **CX Link**: live URL shown during demo
- **Asset Slot**: place where an image/media can be added
- **Readiness**: how close a slide is to presentation-ready
- **Placeholder**: temporary text like `[TODO: ...]`
- **Export Package**: downloadable finished demo bundle

---

## Latest Usability Updates Included In This Guide

- AI Prompt now supports pre-filled input context
- Two AI lanes: copy/paste prompt or direct Gemini generation
- Clearer handoff with **Import AI response**
- One-time AI tour plus **Take the tour again**
- Better AI help in Assets for empty slots and persona copy
- Real-logo-first behavior with fallback if unavailable
