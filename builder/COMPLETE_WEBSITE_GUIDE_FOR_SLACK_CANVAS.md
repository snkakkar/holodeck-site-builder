# Holodeck Storytelling Coach Guide

This guide is for SEs who want to build a strong, customer-specific demo without getting buried in technical setup. It is written to be practical: enough detail to run the full app confidently, but structured so you can skim and execute quickly.

The core mindset: Holodeck is not just a slide builder. It is a storytelling workflow. The best results come from being intentional about message, flow, and proof, not from adding more screens or more text.

---

## What Holodeck Does, In Plain Terms

Holodeck takes raw input and turns it into a presentation-ready experience. Your input can be rough notes, a talk track, a script, or AI-generated JSON. Holodeck then helps you convert that into a coherent narrative with customer context, storyline, slides, live moments, and export-ready output.

A strong Holodeck output has three traits:

- The opening makes the customer problem obvious.
- The middle demonstrates believable transformation.
- The ending lands business value and a clear next step.

If one of those is weak, the demo is not done yet, even if all fields are filled.

---

## The Operating Model: Four Phases

The easiest way to avoid overwhelm is to think in four phases instead of many individual steps.

### Phase 1: Foundation
Work in `Script & Story` and `Setup`.

This phase is where you establish source material and context: who the customer is, who the audience is, what stage the sale is in, and which products matter. Most generic demos are caused by weak foundation input.

### Phase 2: Narrative Arc
Work in `Story Foundations` and `Slide Selection`.

This is where you shape the “before -> change -> after” motion. Keep required structure, tune recommended slides, and remove optional content that does not advance the message.

### Phase 3: Proof
Work in `Assets`, `CX Components`, and optional apps.

This is where credibility is built. Choose visuals and live links that support specific claims, not just aesthetic polish.

### Phase 4: Delivery
Work in `Preview` and `Export`.

This is your rehearsal and packaging phase. Tighten wording, verify transitions, remove unresolved placeholders, and choose the right output format.

Quick diagnostic:

- If the story feels generic, revisit Phase 1 and 2.
- If the demo feels unconvincing, revisit Phase 3.
- If the demo feels messy in presentation, revisit Phase 4.

---

## Collaboration: How Teams Move Faster

Holodeck has three distinct collaboration surfaces. Use each one on purpose.

`My Projects` is your working area for active drafts and iteration.  
`Shared with me` is for handoff and co-authoring with teammates.  
`Team Gallery` is for reusable, polished examples that others can duplicate.

To keep quality high at team scale, treat Team Gallery as a curated library, not a storage bin. Publish demos that are understandable, reusable, and mostly free of unresolved placeholder clutter.

Permission strategy:

- use `view` for review and alignment
- use `edit` when someone is truly co-authoring

This keeps ownership clear and prevents accidental drift.

---

## Building The Core Story (Most Important Section)

The highest-value work in Holodeck happens in core story formation.

In `Script & Story`, extraction creates the initial skeleton. In `Setup`, you anchor that skeleton to real customer and audience context. In `Story Foundations`, you tighten narrative logic so the transformation is explicit and commercially meaningful. In `Slide Selection`, you control pacing and keep only what strengthens the argument.

A simple quality check you can run after this phase:

- Can I describe the problem in one sentence?
- Can I describe the change in one sentence?
- Can I describe the business value in one sentence?

If any answer is unclear, refine foundations before adding more polish.

---

## Proof Layer: Assets, Live Moments, Clienteling, and Cimulate

Once the core story works, proof is what makes the audience trust it.

In `Assets`, select visuals that reinforce claims. AI generation (`Generate all empty slots with AI`) is great for speed, but final curation still matters. In `CX Components`, map links to exact story moments. Precision is better than volume: fewer live moments with strong relevance usually outperform many loosely related ones.

### Clienteling: When and Why

Use Clienteling when your narrative emphasizes associate-led or advisor-style selling. It is especially strong for in-store relationship moments, guided recommendations, and “human + AI” service interactions.

Clienteling works best when it feels like a natural continuation of your main story, not a disconnected side experience.

### Cimulate: When and Why

Use Cimulate when your narrative emphasizes intent-aware discovery and concierge-style search. It is strongest when you need to show that the experience understands meaning and context rather than just matching keywords.

Cimulate is effective when you explicitly connect discovery quality to downstream outcomes (relevance, conversion confidence, service quality).

### Should You Use One or Both?

Use Clienteling if the hero moment is associate-led.
Use Cimulate if the hero moment is search/discovery intelligence.
Use both only when your story genuinely spans discovery and assisted conversion.

---

## Preview and Export: Rehearse, Then Ship

Use `Preview` as your final rehearsal environment. Validate transitions, simplify dense lines, and remove “almost good” language. Inline editing is useful here because it lets you correct copy where you see it in context.

Use `Export` to package for actual use:

- ZIP: best default for full interactive experience
- PPTX: best when the presentation setting expects slide-native flow
- PDF: best for static review and async stakeholder circulation

Before final export, run a credibility pass: placeholders, links, branding consistency, and presenter framing.

---

## Troubleshooting (High-Signal Fixes)

`Import AI response` failed: most commonly malformed or incomplete JSON. Re-run prompt with strict output and paste full result.

Slides feel generic: improve audience specificity, sharpen business problem, and tighten value drivers. Do this before visual polish.

Live links fail: check reachability first, then remap to the intended narrative moment.

Visuals missing: verify asset slot mapping and re-export.

Clienteling/Cimulate missing in output: verify app is enabled and configured before export.

Latest changes not visible: refresh and confirm you are opening newest exported output.

---

## Post-Export Editing With AI (Keep Control)

AI can accelerate iteration after export if prompts stay constrained.

Best pattern: request one change type at a time (tone, industry adaptation, product emphasis, persona update, editorial cleanup). Require a change summary. Use `[TODO: ...]` for unknown metrics instead of fabrication.

Useful prompt categories include:

- rename customer globally
- rewrite for executives
- adapt for industry
- shift product emphasis
- simplify for first meeting
- compress to 5-minute flow
- refresh persona details
- localize wording for region
- final editorial cleanup
- update assets and links
- final quality gate (PASS/FAIL with minimal fixes)

Rule of thumb: narrative consistency beats novelty.

---

## What’s New (Latest End-User Features)

Recent upgrades include stronger collaboration (`Shared with me`, `Team Gallery`, publish/unpublish), smoother AI flow (pre-filled context, Gemini path, clearer import handoff, replayable tour), faster asset acceleration (`Generate all empty slots with AI` and improved logo behavior), optional app support (Clienteling and Cimulate), and expanded delivery formats (ZIP, PPTX, PDF).

These features are most powerful when used in order: strong foundations first, selective proof second, disciplined delivery last.

---

## Glossary (Plain English)

Persona: the customer character your audience follows.  
Story acts: the major journey moments from current state to future state.  
Slide recommendation: the system’s suggested narrative structure from your inputs.  
CX component: a live URL-based moment in your demo flow.  
Asset slot: a location where visual/media content is uploaded and mapped.  
Clienteling: optional associate-led guided-selling experience.  
Cimulate: optional intent-aware search and concierge experience.  
Readiness: how close a section is to presentation-ready.  
Export package: your final downloadable demo output.
