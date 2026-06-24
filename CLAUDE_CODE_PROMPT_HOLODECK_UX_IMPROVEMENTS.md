# Claude Code Prompt for Holodeck UX + Content Improvements

Use this document as the canonical implementation prompt for Claude Code.

## 1) Feedback-to-Implementation Mapping

| # | Feedback Theme | Primary Files | State/Config Additions |
|---|---|---|---|
| 1 | Salesforce branding or customer template styling | `builder/builder.js`, `builder/holodeck-shared.js`, `builder/holodeck-adapter.js`, `demo/js/demo-deck-renderer.js` | `project.brandMode`, `brand.templateName`, `brand.tokens`, `brand.validation` |
| 2 | Stronger top ribbon + section/slide navigation | `demo/demo-holodeck-unified.html`, `demo/js/navigation.js`, `demo/js/demo-deck-renderer.js`, `builder/preview-renderer.js` | `navigation.sectionOrder`, `navigation.slideIndexBySection`, `navigation.enableKeyboard`, hash format `#section=<id>&slide=<n>` |
| 3 | Unified profile carousel depth | `builder/preview-renderer.js`, `demo/js/demo-deck-renderer.js`, `builder/holodeck-shared.js` | `unifiedProfile.facets[]`, `unifiedProfile.defaultFacet`, `unifiedProfile.showProgress` |
| 4 | Stronger “Powered by products” parsing/render | `builder/story-parser.js`, `builder/recommendation-rules.js`, `builder/holodeck-shared.js`, `demo/demo-holodeck-unified.html` | `poweredBy.products[]`, `poweredBy.capabilities[]`, `poweredBy.evidence[]` |
| 5 | GIF/Screenshot/Carousel behavior | `builder/builder.js`, `builder/preview-renderer.js`, `demo/js/demo-deck-renderer.js`, `builder/holodeck-adapter.js` | `mediaPolicy.preferredType`, `mediaPolicy.fallbackOrder[]`, `slide.mediaHints` |
| 6 | Claude modify file w/ reusable prompts | `builder/builder.js`, `builder/zip-exporter.js` | Generated file `CLAUDE_MODIFY.md`, `exportOptions.includeClaudeModify` |
| 7 | Canned unified profiles and agent convos | `builder/builder.js`, `builder/holodeck-shared.js`, `demo/assets/` | `starterPacks.unifiedProfiles[]`, `starterPacks.agentConvos[]` |
| 8 | More intuitive per-slide asset assignment | `builder/builder.js`, `builder/holodeck-shared.js`, `builder/preview-renderer.js` | `slide.assetBindings[]`, `assetLibrary.metadata`, `assetUsage.bySlide` |
| 9 | Reduce Aubrey dependency perception | `builder/builder.js`, `README.md` (if needed), builder helper copy surfaces | No required schema change; copy/label policy updates |
| 10 | Guided instructional modals | `builder/builder.js`, `builder.css` | `uxHints.dismissed[]`, `uxHints.version`, `uxHints.neverShowAgain` |

## 2) Claude Code Prompt (Anthropic Best-Practice Format)

Copy everything below into Claude Code:

```markdown
You are a senior frontend/product engineer working in this repository:
`/Users/shachi.kakkar/Desktop/Work Projects/Scale Projects/Demo Holodeck Template Website`

## Objective
Implement the following product feedback end-to-end across Builder + Demo runtime while preserving existing export compatibility:
1) enforce Salesforce/customer branding modes
2) significantly improve section + slide navigation
3) add a unified-profile carousel experience
4) strengthen and better parse/render "Powered by Salesforce products"
5) define consistent GIF/screenshot/carousel media behavior
6) add a reusable Claude modify file with prewritten prompts (website agents + agent experiences)
7) add canned unified-profile and agent-conversation asset packs
8) make asset assignment more intuitive and slide-centric
9) remove any impression AubreyDemo is required
10) add guided instructional modals

## Success criteria
- Builder and exported demo both work with zero Aubrey credentials and no Aubrey URLs.
- Navigation supports section jumps + slide-level movement with clear current location.
- Unified profile carousel supports multi-facet content with graceful fallback.
- "Powered by Salesforce" copy is sourced from parsed product/capability evidence.
- Asset assignment is understandable at the slide level, not only slot level.
- Guided help is contextual and dismissible.
- Export remains static-hosting compatible and backward compatible.

## Hard constraints
- Keep static hosting compatibility (no build tooling dependency).
- Keep existing import/export behavior backward compatible. If schema is extended, support missing fields gracefully.
- Keep vanilla JS style consistent with existing architecture.
- Keep Aubrey connector functionality available but explicitly optional.
- Do not regress existing builder steps (setup, script, foundations, recs, cx, assets, preview, export).

## Files to inspect first
- `builder/builder.js`
- `builder/holodeck-shared.js`
- `builder/recommendation-rules.js`
- `builder/holodeck-adapter.js`
- `builder/story-parser.js`
- `builder/preview-renderer.js`
- `builder/zip-exporter.js`
- `builder/ai-config-prompt.js`
- `demo/demo-holodeck-unified.html`
- `demo/js/demo-deck-renderer.js`
- `demo/js/navigation.js`

## Required approach
1. Produce a concise implementation plan mapping each feedback item to specific files and new/updated state fields.
2. Implement in small, reviewable commits by feature slice.
3. Validate Builder preview and exported Demo parity for each major feature.

## Detailed requirements

### A) Branding and template mode
- In Setup, add `Brand Mode`: `Salesforce default` or `Customer template`.
- Add shared token application rules used by both preview and exported runtime.
- Add lightweight validation warnings (contrast/accessibility and missing logo in customer mode).

### B) Stronger navigation
- Add persistent top ribbon improvements + slide-level controls (prev/next, breadcrumbs, section jump).
- Support keyboard shortcuts:
  - Left/Right: slide navigation
  - Number shortcuts or quick menu: section navigation
- Add deep-link/hash support for section + slide.

### C) Unified profile carousel
- Add or enhance `unifiedProfile` to support multi-facet card carousel.
- Include active state, controls, progress indicator, and single-item fallback.
- Keep behavior aligned between Builder preview and exported runtime.

### D) Powered-by products
- Improve script parsing from story inputs into explicit products/capabilities evidence.
- Render stronger "Powered by Salesforce" block in Business Value and/or relevant demo layouts.
- Avoid generic copy; tie to parsed evidence from selected products and story acts.

### E) Media strategy (GIF/Screenshot/Carousel)
- Add per-slide media policy with fallback order.
- In Assets UX, show recommended media type and dimension hints by layout.
- Runtime should gracefully degrade with polished placeholders when assets are missing.

### F) Claude modify file
- Generate a markdown file (e.g., `CLAUDE_MODIFY.md`) with prewritten prompts for:
  - website-agent modifications
  - agent-conversation modifications
  - branding refresh
  - navigation refinement
- Expose this generation through Builder (helper action and/or export option).

### G) Canned assets
- Provide starter packs for unified profile data and agent conversation examples.
- Make packs selectable without requiring Aubrey.
- Persist selected pack content in project state.

### H) Asset assignment UX
- Add per-slide asset binding UI, not just global slot rows.
- Show:
  - where an asset is used
  - which selected slides are missing required/recommended media
- Keep compatibility with existing `assetLibrary` slot model.

### I) De-emphasize Aubrey
- Update labels/help text from Aubrey-first wording to optional connector wording.
- Ensure manual flow is first-class in copy and default CTAs.
- Keep Aubrey pull actions as secondary enhancements.

### J) Guided modals
- Add contextual guided modals/tooltips for Setup, Script, Assets, Preview, Export.
- Include dismiss and never-show-again behavior persisted in local project/user state.

## Backward compatibility requirements
- Existing configs with no new fields must still render and export correctly.
- New fields must have defaults in adapter/shared helpers.
- Do not require migration scripts for baseline operation.

## Validation checklist (must run)
- Start local preview server and verify both:
  - `http://localhost:4173/builder/`
  - `http://localhost:4173/demo/`
- Test Builder flow with no Aubrey keys and no Aubrey links.
- Test flow with Aubrey links still works.
- Validate deep-link navigation state restore from URL hash.
- Validate unified-profile carousel interactions in preview and exported demo.
- Validate "Powered by" block with parsed script evidence.
- Validate per-slide asset assignment and fallback behavior.
- Confirm no console errors in core paths.

## Output format
When complete, return:
1) Summary of changes by file
2) New/updated state and config fields
3) Backward-compatibility notes
4) Manual QA results
5) Remaining follow-ups (if any)
```

## 3) Acceptance Gates (Release Readiness)

- **Gate 1: No-Aubrey viability**
  - A complete demo can be authored, previewed, and exported without Aubrey credentials or Aubrey URLs.
- **Gate 2: Navigation usability**
  - User can move across sections and within slide stacks from persistent controls and keyboard shortcuts.
  - URL deep link restores the same section/slide.
- **Gate 3: Content depth**
  - Unified profile carousel supports at least 3 facets and has correct fallback when only 1 is present.
- **Gate 4: Product attribution quality**
  - Powered-by block renders parsed product/capability mappings from script inputs, not static filler.
- **Gate 5: Media resilience**
  - Missing media does not break layout; fallback chain and placeholders render cleanly.
- **Gate 6: Asset ergonomics**
  - Slide-level asset assignment is visible, actionable, and reports missing assets for selected slides.
- **Gate 7: Guided UX**
  - Instructional modals appear contextually, can be dismissed, and honor never-show-again preference.
- **Gate 8: Backward compatibility**
  - Legacy project JSON imports without new fields continue to function.

