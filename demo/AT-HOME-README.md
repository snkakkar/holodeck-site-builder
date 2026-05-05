# At Home + Salesforce — Demo Setup Assets
## Salesforce CX Vision · Agentic Retail Journey

---

### What was created

Five files in `/demo/`:

| File | Type | Purpose |
|---|---|---|
| `at-home-demo-story.js` | Shared data config | Single source of truth for all story content, persona, journey stages, technologies, metrics |
| `at-home-demo-map.html` | Hub page | Full journey map with deck vs. live-demo labeling; navigation to all deck assets |
| `at-home-intro.html` | Deck Asset 1 | Executive intro — presenter name/title, demo theme, technology pills |
| `at-home-vision.html` | Deck Asset 2 | Three-part demo structure: customer journey → data foundation → agent creation |
| `at-home-meet-rachel.html` | Deck Asset 3 | Persona setup — Rachel Morris, signals, retail opportunity, journey preview |
| `at-home-bvs.html` | Deck Asset 4 | Business Value close — BVS metrics (placeholders), key capabilities |

---

### Which script rows these support

| Script Row (Device = Deck) | Asset created |
|---|---|
| Intro: "Hi everyone, my name is…" | `at-home-intro.html` |
| Intro: "I'm going to start off by showing you what an AI-driven experience looks like…" | `at-home-vision.html` |
| Agentic CX: "To put the customer at the center of this vision, let's take a look through the perspective of Rachel…" | `at-home-meet-rachel.html` |
| Section Close: "BVS Benchmarks & Key Capabilities (Coming Soon)" | `at-home-bvs.html` |

The iPhone and MacBook live-demo steps are referenced in the journey map but not rebuilt — those are the live demo.

---

### How to run locally

No build step needed. Open any file directly in a browser:

```
open /path/to/demo/at-home-demo-map.html
```

Or use a simple local server:

```bash
cd demo
python3 -m http.server 8080
# then open http://localhost:8080/at-home-demo-map.html
```

---

### Suggested presentation order

1. `at-home-demo-map.html` — Orient the audience with the full journey overview
2. `at-home-intro.html` — Executive opening (replaces the intro deck slide)
3. `at-home-vision.html` — What the demo will show (3-part structure)
4. `at-home-meet-rachel.html` — Introduce Rachel before the Instagram/iPhone live demo
5. *(Live demo: Instagram → Website → Cart → SMS → AI Design Assistant → Checkout → Email)*
6. `at-home-bvs.html` — Business value close

---

### Where to update presenter name / title

Edit `at-home-demo-story.js`:

```js
presenterName: "[PRESENTER NAME]",   // replace this
presenterTitle: "[TITLE], Salesforce", // replace this
```

Changes propagate to `at-home-intro.html` and `at-home-demo-map.html` automatically.

---

### Where to update live demo links

Edit `at-home-demo-story.js`:

```js
liveLinks: {
  atHomeWebsite: null,    // TODO: add live At Home demo site URL
  instagramWrapper: null, // TODO: add Instagram wrapper app URL
  agentDemo: null,        // TODO: add Agentforce / AI Design Assistant demo URL
},
```

---

### Where to replace placeholder visuals

- **Rachel's avatar**: `at-home-meet-rachel.html` — find the `.persona-avatar` div with the 🌟 emoji. Replace the entire div with an `<img>` tag pointing to an approved lifestyle image. A `TODO: img` badge marks this location.
- **Intro background**: `at-home-intro.html` — the dark background uses CSS gradients. Replace or layer a real At Home lifestyle/outdoor image using `background-image` on `.slide-wrap` if desired.
- **BVS slide images**: `at-home-bvs.html` — the metrics section uses placeholder "XX%" values. See below.

---

### Where to add real BVS benchmark numbers

Edit `at-home-demo-story.js`:

```js
bvsMetrics: [
  { label: "Conversion Lift",     value: "XX%",  note: "TODO: insert real benchmark", icon: "↑" },
  { label: "Average Order Value", value: "+$XX", note: "TODO: insert real benchmark", icon: "💳" },
  // ...
],
```

Replace the `value` fields with real numbers. The yellow TODO banner in `at-home-bvs.html` will be removed once values are populated — or remove the `.todo-banner` div manually.

---

### Design tokens

All pages share these CSS variables (defined inline per page for zero-dependency portability):

```css
--brand-navy:      #0B1F3A   /* primary dark background */
--brand-graphite:  #1C2B3A
--patriot-red:     #B22234   /* accent / CTA / holiday red */
--patriot-blue:    #1A3F6F   /* link / highlight blue */
--cream:           #FAF7F2   /* warm white page background */
--patio-green:     #3B6E52   /* outdoor / nature accent */
--sky-blue:        #2E6DA4   /* secondary accent */
--warm-amber:      #C47E1A   /* TODO / warning accent */
```

---

### Open items (from script)

- [ ] Update `presenterName` and `presenterTitle` in `at-home-demo-story.js`
- [ ] Add slide images for Intro and BVS Benchmarks sections
- [ ] Obtain iMessage screenshots for Order Servicing section (currently on hold)
- [ ] CapGemini architecture alignment with At Home Stores LLC on Agentforce use cases
- [ ] MC SE assigned to assist with MCP demo portion
- [ ] Confirm executive attendees for Wednesday May 20th Top-to-Top dinner
- [ ] **TODO: Replace all `XX%` / `+$XX` placeholder BVS benchmark numbers with real data**
- [ ] **TODO: Add product image of the Catalina Outdoor Set patio furniture**
- [ ] **TODO: Confirm whether Exit Intent banner (Option 2 checkout) is a Shopper Agent** (per @Aaron Riley / @Shachi Kakkar note in script)
- [ ] **TODO: Add live demo URLs to `liveLinks` in `at-home-demo-story.js`**
- [ ] **TODO: Replace Rachel avatar placeholder (🌟) with approved lifestyle image**

---

### Tech stack

- Pure static HTML + CSS + vanilla JS
- Google Fonts: Inter + Playfair Display (loaded from CDN — requires internet at runtime)
- No build step, no bundler, no framework dependencies
- Single shared data file: `at-home-demo-story.js` (loaded via `<script src>` in each page)
