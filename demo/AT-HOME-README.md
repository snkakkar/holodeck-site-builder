# DEMO-HOLODECK-TEMPLATE
## Salesforce CX Vision · Agentic Retail Journey

---

### Entry Point

| File | Purpose |
|---|---|
| `at-home-unified.html` | **Single presenter entry point** — all sections in one file: Journey Map, Intro, Meet Rachel, Demo (14-slide instore journey), Business Value |

---

### File Structure

```
demo/
├── at-home-unified.html        # Primary presentation (all sections)
├── styles/
│   ├── tokens.css              # CSS custom properties (colors, spacing, fonts)
│   ├── base.css                # Reset and html/body base styles
│   ├── slides.css              # Section containers, slide engine, all section layout/typography
│   ├── components.css          # .brand-lockup, .cta-btn, .tag-pill, .demo-card
│   ├── animations.css          # @keyframes + per-slide animation triggers
│   └── at-home-theme.css       # Slide background gradients, dot patterns, circle fills
├── js/
│   ├── dom-utils.js            # DU utility (qs, qsa, el helpers)
│   └── navigation.js           # setNavActive() helper
├── assets/                     # Images, GIFs, PNGs
└── sf-icon.png                 # Salesforce logo fallback
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

Use the top nav to move between sections in `at-home-unified.html`:

1. **Journey Map** — orient the audience with the full agentic retail journey
2. **Intro** — executive opening (presenter name/title, three-act structure)
3. **Meet Rachel** — introduce the customer persona before the live demo
4. **Demo** — 14-slide in-store journey from December visit to 4th of July checkout
5. **Business Value** — close with BVS benchmarks and platform capabilities

---

### Where to Update Content

**Presenter name / title** — edit the `STORY` object in `at-home-unified.html`:
```js
const STORY = {
  presenterName: "[PRESENTER NAME]",
  presenterTitle: "[TITLE], Salesforce",
  ...
}
```

**BVS benchmark numbers** — edit `STORY.bvsMetrics` in `at-home-unified.html`:
```js
bvsMetrics: [
  { icon:"↑",  value:"XX%",  label:"Conversion Lift" },
  // replace XX% with real numbers
],
```

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

- [ ] Update `presenterName` and `presenterTitle` in `at-home-unified.html → STORY`
- [ ] Replace all `XX%` / `+$XX` placeholder BVS benchmark numbers with real data
- [ ] Add product image of the Paloma Outdoor Set patio furniture
- [ ] Confirm live demo URLs for Instagram, Agentforce, and Commerce Cloud scenes
- [ ] Replace Rachel avatar placeholder with approved lifestyle image (assets/Rachel_Hero.gif currently in use)
- [ ] CapGemini architecture alignment with At Home Stores LLC on Agentforce use cases
- [ ] MC SE assigned to assist with MCP demo portion
