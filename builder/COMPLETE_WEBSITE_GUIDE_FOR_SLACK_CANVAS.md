# Holodeck Website Guide (End User)

## What Holodeck Is

Holodeck is a guided website for building polished customer demos quickly, even if you are not technical.

You can:
- Create and manage demo projects
- Use AI to generate a first draft
- Build story, slides, assets, and live moments
- Collaborate with teammates
- Export a complete interactive demo, plus PowerPoint and PDF

---

## Latest Features You Should Know

- Collaboration tabs: **Shared with me** and **Team Gallery**
- Publish/unpublish projects to the team gallery
- New portable export formats: **PowerPoint (.pptx)** and **PDF (.pdf)**
- AI improvements:
  - pre-filled AI inputs from your project
  - direct **Generate with Gemini** option (when enabled)
  - clear **Import AI response** handoff
  - one-time tour + **Take the tour again**
- Asset AI improvements:
  - **Generate all empty slots with AI**
  - auto-fills missing persona copy and placeholder visuals
- Smarter logo handling:
  - tries real logo first
  - falls back to AI-generated lookalike if needed

---

## Quick Start (10 Minutes)

1. Sign in and create a project.
2. Add script/notes in **Script & Story**.
3. Click **Extract Story Foundations**.
4. Fill customer + audience + products in **Setup**.
5. Keep/edit recommendations in **Slide Selection**.
6. Optional: add links in **CX Components**.
7. Optional: add visuals in **Assets**.
8. Final check in **Preview**.
9. Download from **Export**.

Fast default path:  
Script & Story -> Setup -> Slide Selection -> Preview -> Export

---

## AI Fast Lane

Use this when you want a quick first draft.

### Option A: Claude/ChatGPT
1. Open **AI Prompt**.
2. Review pre-filled inputs.
3. Click **Copy AI Prompt**.
4. Run in Claude/ChatGPT.
5. Copy the JSON output.
6. Return and click **Import AI response**.
7. Paste and import.

### Option B: Gemini
If available, click **Generate with Gemini** for direct generation.

### What AI Can Fill
- Setup details
- Personas
- Story acts
- Story foundations
- Slide recommendations
- Slide draft content
- Asset suggestions

### Helpful Notes
- AI Prompt includes a one-time guided tour.
- Use **Take the tour again** any time.
- Prompt context is usually already included for you.

---

## Full Walkthrough

### 1) Login and Account
- Sign in with one-time code
- Resume where you left off
- Sign out safely

If code does not arrive, check spelling and spam folder.

### 2) Home, Projects, and Collaboration

#### My Projects
- Create, open, duplicate, rename, delete
- Search and filter projects

#### Shared with me
- View projects shared by teammates
- Respect permissions (`view` or `edit`)

#### Team Gallery
- Browse published team projects
- Duplicate gallery projects into your own workspace
- Publish/unpublish your own projects

### 3) Setup
Fill business context:
- customer
- industry
- audience
- sales stage
- products
- branding mode/colors/logo
- presenter details

This improves recommendation quality.

### 4) Script & Story
- Paste text or upload files
- Extract foundations, personas, and acts
- Refine source story before slide planning

### 5) Story Foundations
Define narrative backbone:
- business problem
- current pain
- future vision
- thesis + executive takeaway
- value drivers
- assumptions/open questions

Run **Story Quality Check** to catch gaps early.

### 6) Slide Selection
- Keep/remove recommended slides
- Rename slide titles
- Use section grouping + bulk actions
- Switch views as needed
- Use required/recommended/optional status signals

### 7) Assets
- Upload visuals by slot
- See where each slot is used
- Replace/clear uploads

AI helpers:
- **Generate all empty slots with AI**
- Persona copy and visuals can be auto-generated
- Upload GIF/MP4 when you need true animation

### 8) CX Components
- Add live URLs
- Map each URL to the right slide/moment
- Use auto-match suggestions when helpful

### 9) Preview
- Review full flow
- Check missing inputs
- Edit text inline
- Use keyboard navigation in full preview mode

### 10) Export

Primary:
- **Complete Demo ZIP** (recommended)

Portable:
- **Download PowerPoint (.pptx)**
- **Download PDF (.pdf)**

Before sharing:
- replace placeholders (`[TODO: ...]`, `XX%`)
- verify links
- confirm branding/presenter details

### 11) Feedback
Submit:
- bugs
- confusing behavior
- dislikes/likes
- improvement ideas

Best format:
- what you did
- what you expected
- what happened

---

## Troubleshooting

### Import AI response failed
- paste complete JSON
- re-run AI prompt
- retry import

### Slides are too generic
- strengthen business problem and outcomes
- set audience and stage clearly
- improve value drivers

### Live links do not load
- test URL directly
- replace invalid links
- re-map to correct slide

### Visuals are missing
- verify upload completed
- verify slot mapping
- re-export

### Latest edits not visible
- refresh browser
- open newest export

---

## Easy AI Prompts For Post-Export Edits

### Ground Rules
- ask for small focused changes
- do not invent facts/metrics
- use `[TODO: ...]` for unknown details
- ask for a clear summary of what changed

### 1) Rename customer everywhere
```text
Update the customer name everywhere in my demo to [NEW CUSTOMER NAME].
Keep structure and slide flow unchanged.
Show exactly what changed.
```

### 2) Rewrite for executives
```text
Rewrite this demo for executive leaders:
- shorter language
- outcomes first
- minimal jargon

Keep the same storyline.
```

### 3) Adapt to a new industry
```text
Adapt this demo for [INDUSTRY].
Keep story flow the same, but update examples and benefits for that industry.
Do not invent customer facts.
```

### 4) Shift product emphasis
```text
Rebalance this demo to emphasize [PRODUCT A] and [PRODUCT B].
Keep deck length similar and avoid unnecessary structural changes.
```

### 5) Simplify for first meeting
```text
Rewrite content so a first-time audience can understand it quickly.
Use plain language and explain acronyms when needed.
```

### 6) Create a 5-minute version
```text
Trim this demo to a clear 5-minute flow.
Keep only essential slides and smooth transitions.
```

### 7) Add safe outcome placeholders
```text
Where impact is discussed, add placeholders like [TODO: metric].
Do not invent numbers.
```

### 8) Refresh persona
```text
Replace persona with:
- Name: [NAME]
- Role: [ROLE]
- Goals: [GOALS]
- Pain points: [PAINS]

Update related slides so details stay consistent.
```

### 9) Localize by region
```text
Adjust wording for [REGION/COUNTRY] audience (tone, spelling, terminology).
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

Map each item to the correct demo moment.
Keep everything else unchanged.
```

### 12) Final quality gate
```text
Run a final review and return PASS or FAIL.

Check:
- placeholders removed or intentional
- coherent story start-to-finish
- links mapped correctly
- wording fits target audience

If FAIL, return only minimal required fixes.
```

---

## Glossary

- **Persona**: main customer character in your story
- **Story acts**: key moments in the journey
- **Slide recommendation**: suggested slide choices from your inputs
- **CX component**: live URL-based demo moment
- **Asset slot**: place where you upload image/media
- **Readiness**: how close content is to presentation-ready
- **Export package**: downloadable final demo files
