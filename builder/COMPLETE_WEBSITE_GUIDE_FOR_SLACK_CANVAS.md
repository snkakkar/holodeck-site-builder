# Holodeck Website Guide (End-User Edition)

## What This Site Does

Holodeck helps you build a polished customer demo quickly, even if you are non-technical.

You can:
- Create demos from notes, scripts, or AI
- Build a complete story and slide flow
- Add branding, links, visuals, and presenter details
- Share projects with teammates
- Export a full interactive demo, plus PowerPoint and PDF

---

## What Is New (Latest Features)

- Project collaboration with **Shared with me**
- Publish projects to **Team Gallery** for team discovery/duplication
- New export options: **PowerPoint (.pptx)** and **PDF (.pdf)**
- AI flow improvements:
  - pre-filled AI inputs
  - **Generate with Gemini** option (when available)
  - clear **Import AI response** handoff
- AI onboarding improvements:
  - one-time AI tour
  - **Take the tour again** replay link
- AI-assisted asset workflow:
  - **Generate all empty slots with AI**
  - fills missing persona copy + placeholder imagery
- Smarter logo handling:
  - tries real logo first
  - falls back to AI-generated lookalike if needed

---

## Quick Start (10 Minutes)

1. Sign in and create a project.
2. Go to **Script & Story** and add your script/notes.
3. Click **Extract Story Foundations**.
4. Fill customer + audience + product details in **Setup**.
5. Keep/edit recommendations in **Slide Selection**.
6. (Optional) Add live links in **CX Components**.
7. (Optional) Add visuals in **Assets**.
8. Do a final check in **Preview**.
9. Download from **Export**.

Fastest default flow:  
Script & Story -> Setup -> Slide Selection -> Preview -> Export

---

## AI Fast Lane (Easiest First Draft)

Use this when you want AI to create a draft quickly.

### Option A: Claude/ChatGPT (copy/paste flow)
1. Open **AI Prompt**.
2. Review the pre-filled inputs.
3. Click **Copy AI Prompt**.
4. Run in Claude/ChatGPT.
5. Copy the JSON result.
6. Return and click **Import AI response**.
7. Paste and import.

### Option B: Gemini (direct generation)
If enabled in your environment, click **Generate with Gemini** to generate directly.

### What AI Can Auto-Fill
- Setup details
- Personas
- Story acts
- Story foundations
- Slide recommendations
- Slide draft content
- Asset suggestions

### Helpful Notes
- AI Prompt has a one-time guided tour.
- You can replay it any time with **Take the tour again**.
- In most cases, the prompt already includes required context, so no extra schema step is needed.

---

## Full Walkthrough

### 1) Login and Account
- Sign in with email + one-time code.
- Resume previous projects automatically.
- Sign out safely when done.

If code does not arrive, check spelling and spam folder.

### 2) Home, Projects, and Team Collaboration

#### My Projects
- Create, open, duplicate, rename, delete
- Search and filter your project list

#### Shared with me
- View projects shared by teammates
- Respect permission type (`view` or `edit`)

#### Team Gallery
- Browse projects published by teammates
- Duplicate team projects into your own workspace
- Publish/unpublish your own projects for the team

### 3) Setup
Fill business context:
- customer
- industry
- audience
- sales stage
- products
- branding mode/colors/logos
- presenter details

This section strongly improves recommendation quality.

### 4) Script & Story
- Paste text or upload script files
- Extract foundations, personas, and acts
- Refine story source material before slide planning

### 5) Story Foundations
Define your strategic narrative:
- business problem
- current pain
- future-state vision
- thesis + executive takeaway
- value drivers
- assumptions/open questions

Run **Story Quality Check** to catch gaps early.

### 6) Slide Selection (Recommended Narrative)
- Keep/remove recommended slides
- Use required/recommended/optional statuses
- Rename titles
- Use section grouping + bulk actions
- Switch view mode as needed

### 7) Assets
- Upload visuals by slot
- See where each slot is used
- Replace/clear uploads

AI helpers:
- **Generate all empty slots with AI** for fast completion
- Persona copy + visuals can be auto-generated
- For animated moments, upload GIF/MP4 if motion is required

### 8) CX Components
- Add live URLs
- Map each link to the right slide/moment
- Accept auto-match suggestions where helpful

### 9) Preview
- Check runtime-like full flow
- Review missing inputs
- Edit text inline for quick polish
- Use keyboard navigation in full preview mode

### 10) Export

#### Primary export
- **Complete Demo ZIP** (recommended)

#### Portable exports
- **Download PowerPoint (.pptx)**
- **Download PDF (.pdf)**

#### Final readiness
- Review warnings
- Export with confirmation if soft warnings remain

Before sharing:
- replace placeholders (`[TODO: ...]`, `XX%`)
- verify live links
- confirm branding/presenter details

### 11) Feedback
Submit:
- bug reports
- complaints/confusing behavior
- likes/dislikes
- improvement suggestions

Best feedback format:
- what you did
- what you expected
- what happened

---

## Troubleshooting

### “Import AI response failed”
- ensure full JSON is pasted
- re-run AI prompt
- retry import

### “Slides are too generic”
- add stronger business problem + outcomes
- set audience and stage clearly
- improve value-driver quality

### “Live links are broken”
- test URL directly
- replace invalid link
- re-map link to correct slide

### “Missing visuals”
- verify upload completed
- verify slot mapping
- re-export

### “Latest edits not visible”
- refresh browser
- confirm you are opening the newest export

---

## AI Prompts For Easy Post-Export Edits

Use these prompts with Claude/ChatGPT after you download your project.

### Basic Prompt Rules
- Ask for small focused updates
- Do not invent customer facts/metrics
- Use `[TODO: ...]` for unknown details
- Ask for a clear summary of changes

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
Keep story flow the same, but update examples and benefits to match the industry.
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

### 9) Localize for region
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

## Glossary (Plain Language)

- **Persona**: main customer character in your story
- **Story acts**: key moments in the journey
- **Slide recommendation**: suggested slide choices based on your inputs
- **CX component**: live URL-based demo moment
- **Asset slot**: place where you can upload an image/media
- **Readiness**: how close content is to being presentation-ready
- **Export package**: downloadable finished demo files
