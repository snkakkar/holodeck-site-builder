# At Home + Salesforce — Demo Setup Assets
## Salesforce CX Vision · Agentic Retail Journey

---

### Entry Points

| File | Purpose |
|---|---|
| `at-home-unified.html` | **Primary entry point** — all sections in one file: Journey Map, Intro, Meet Rachel, Business Value |
| `at-home-instore.html` | In-store demo deck — 14-slide journey from December in-store visit to 4th of July checkout |
| `at-home-demo-map.html` | Standalone journey map (also embedded in unified) |
| `at-home-vignette.html` | Standalone intro deck (also embedded in unified) |
| `at-home-meet-rachel.html` | Standalone Meet Rachel deck (also embedded in unified) |
| `at-home-bvs.html` | Standalone Business Value deck (also embedded in unified) |

---

### File Structure

```
demo/
├── at-home-unified.html        # Primary presentation (all sections)
├── at-home-instore.html        # In-store demo journey
├── at-home-demo-map.html       # Journey map standalone
├── at-home-vignette.html       # Intro standalone
├── at-home-meet-rachel.html    # Meet Rachel standalone
├── at-home-bvs.html            # Business Value standalone
├── at-home-demo-story.js       # Shared story/data config
├── styles/
│   ├── tokens.css              # CSS custom properties (colors, spacing, fonts)
│   ├── base.css                # Reset and html/body base styles
│   ├── nav.css                 # .site-nav shared navigation styles
│   ├── deck.css                # .pslide, .pdot, .click-cta slide engine styles
│   └── components.css          # .brand-lockup, .cta-btn, .tag-pill, .demo-card
├── js/
│   ├── dom-utils.js            # DU utility (qs, qsa, el helpers)
│   ├── deck.js                 # makeDeck() slide deck factory
│   └── navigation.js           # setNavActive() helper
├── assets/                     # Images, GIFs, PNGs
└── sf-icon.png
```

---

### Running Locally

```bash
cd demo && python3 -m http.server 8080
```

Then open: `http://localhost:8080/at-home-unified.html`

No build step needed. Pure static HTML + CSS + vanilla JS.

---

### Suggested Presentation Order

1. `at-home-unified.html` — Start here. Use the nav to move between sections:
   - **Journey Map** — orient the audience with the full agentic retail journey
   - **Intro** — executive opening (presenter name/title, three-act structure)
   - **Meet Rachel** — introduce the customer persona before the live demo
   - *(click "Demo" in nav to go to the in-store live demo)*
   - **Business Value** — close with BVS benchmarks and platform capabilities
2. `at-home-instore.html` — The live demo journey (14 slides, click-to-advance)

---

### Where to Update Content

**Presenter name / title** — edit `at-home-demo-story.js`:
```js
presenterName: "[PRESENTER NAME]",
presenterTitle: "[TITLE], Salesforce",
```

**BVS benchmark numbers** — edit `at-home-demo-story.js → bvsMetrics`:
```js
bvsMetrics: [
  { icon:"↑",  value:"XX%",  label:"Conversion Lift" },
  // replace XX% with real numbers
],
```

**Unified page story content** — `at-home-unified.html` has its own inline `STORY` object (intentionally separate from `at-home-demo-story.js` — the step titles differ).

---

### Design Tokens

All pages share CSS custom properties defined in `styles/tokens.css`:

```
--red: #b22234       (patriot red — CTAs, accents)
--navy: #0d1b2e      (primary dark)
--blue: #1a5fa0      (Salesforce blue)
--gold: #f5c06a      (warm accent)
--bg: #f5f7ff        (page background)
--nav-height: 52px
```

---

### Open Items

- [ ] Update `presenterName` and `presenterTitle` in `at-home-demo-story.js`
- [ ] Replace all `XX%` / `+$XX` placeholder BVS benchmark numbers with real data
- [ ] Add product image of the Paloma Outdoor Set patio furniture
- [ ] Confirm live demo URLs for Instagram, Agentforce, and Commerce Cloud scenes
- [ ] Replace Rachel avatar placeholder with approved lifestyle image (assets/Rachel_Hero.gif currently in use)
- [ ] CapGemini architecture alignment with At Home Stores LLC on Agentforce use cases
- [ ] MC SE assigned to assist with MCP demo portion
