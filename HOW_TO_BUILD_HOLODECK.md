# How to Build a Holodeck Demo

No coding required. No HTML editing. No technical knowledge needed.

You fill in one file. Claude does the rest.

---

## What Is This?

The Holodeck is a polished, interactive sales demo that runs in a browser. It has five sections:

| Section | What it is |
|---|---|
| **Journey Map** | A visual overview of the customer's end-to-end Salesforce journey |
| **Intro** | Executive opening slides — your name, the story you're about to tell |
| **Meet [Persona]** | Introduces the fictional customer persona |
| **Demo** | The main slide-by-slide product demonstration |
| **Business Value** | Salesforce capabilities and BVS metrics |

Each of these sections is driven entirely by one config file: `demo/holodeck.config.js`.

---

## What You Need Before You Start

- [ ] A customer demo script (generate one at [aubreydemo.com](https://aubreydemo.com))
- [ ] The customer's brand colors (hex codes — look like `#b22234`)
- [ ] A customer logo file if you have one (PNG or SVG)
- [ ] Three live demo scene URLs from aubreydemo.com (Instagram ad, SMS, Shopper Agent)
- [ ] BVS metric numbers approved for this customer

You don't need all of these on day one. You can start with just the script and fill in the rest later.

---

## The Big Picture — How It Works

```
Step 1  →  You fill in 6 fields in holodeck.config.js
Step 2  →  You zip this project folder
Step 3  →  You give Claude three things: the zip, your script, and the config
Step 4  →  Claude writes the entire demo for you
Step 5  →  You drop in your customer assets (logo, images)
Step 6  →  You open demo/index.html and present
```

That's it. Steps 1–3 take about 15 minutes. Steps 4–6 take another 10.

---

## Step 1 — Fill In the Config File

Open `demo/holodeck.config.js` in any text editor (TextEdit on Mac, Notepad on Windows, or VS Code).

The file is split into two zones:

### Zone 1 — You Fill This In

This is the only part you touch. There are 6 fields.

---

**The one rule for editing this file:**

> Change the text between the quote marks. Keep the quote marks, the colon, and the comma exactly as they are.

For example, to change the customer name:
```
Before:  name: "At Home",
After:   name: "Acme Retail",
```

---

### Field 1 — Customer

Who is this demo for?

```js
customer: {
  name:        "At Home",        // The company name
  nameDisplay: "AT HOME",        // Same name in ALL CAPS — appears in the nav bar
  website:     "https://www.athome.com/",
  industry:    "Retail",         // e.g. "Retail", "Healthcare", "Financial Services"
},
```

---

### Field 2 — Presenter

Update this before every single demo. This appears on the opening slides.

```js
presenter: {
  name:    "[PRESENTER NAME]",   // Your full name
  title:   "[TITLE]",            // Your title at Salesforce
  company: "Salesforce",
},
```

---

### Field 3 — Brand

The customer's colors and logo. Get hex color codes from aubreydemo.com or the customer's brand guidelines.

```js
brand: {
  logoPath:     null,        // Replace null with "assets/logo.png" once you add the file
                             // Leave as null to show the customer name as text instead
  primaryColor: "#b22234",   // Main brand color — used for buttons and accents
  secondaryColor: "#1a5fa0", // Secondary color — usually keep as Salesforce blue
  accentColor:  "#f5c06a",   // Warm accent color
},
```

A hex color is a `#` followed by 6 characters, like `#b22234`. You can find brand colors at [brandcolors.net](https://brandcolors.net) or from the customer's website.

---

### Field 4 — Live Demo Scene URLs

These are the live interactive scenes that play inside the demo — inside an iPhone or MacBook frame. You can have as many as your story needs.

Build each scene in aubreydemo.com first. Then copy the `/frame` URL and add it here.

Each scene needs three things:
- **id** — a short nickname you make up (no spaces). You'll use this in your deckOutline to tell Claude which scene goes on which slide.
- **label** — the human-readable tag shown in the corner of that slide
- **url** — the `/frame` URL from aubreydemo.com

```js
scenes: [
  {
    id:    "instagramAd",
    label: "MCP · Instagram Ad · June",
    url:   "https://pocketsic.aubreydemo.com/scene/1059/frame",
  },
  {
    id:    "agenticSms",
    label: "Agentforce · Agentic SMS · July",
    url:   "https://pocketsic.aubreydemo.com/scene/1061/frame",
  },
],
```

**To add a new scene:** copy any existing block (the three lines between `{` and `},`), paste it below the last one, and update the id, label, and url.

**To remove a scene:** delete that block entirely or put `//` in front of each line.

**Common scene types you can build in aubreydemo.com:**

| Scene | Slide type to use |
|---|---|
| Instagram ad | `iframe-phone` |
| LinkedIn ad | `iframe-phone` |
| Facebook ad | `iframe-phone` |
| WhatsApp conversation | `iframe-phone` |
| Agentic SMS | `iframe-phone` |
| Email (any type) | `iframe-phone` or `two-panel` |
| Mobile app / Shopper Agent | `iframe-phone` |
| Website / storefront | `iframe-laptop` |
| Retail POS / store associate screen | `iframe-laptop` |
| Service Cloud console | `iframe-laptop` |

If you don't have your scene URLs yet, leave the existing ones in place as placeholders. You can update them in Round 2.

---

### Field 5 — Demo Slide Deck Outline

This is where you decide the shape of your demo. List the slide types you want, in order. Write a one-line note on what each slide is about. Claude reads this and builds the full demo to match.

```js
deckOutline: [
  { type: "title",         note: "Open the demo — in-store moment in December" },
  { type: "two-panel",     note: "The store scene — identity capture at checkout" },
  { type: "timeline",      note: "Six-month channel journey overview" },
  { type: "multi-state",   note: "Product find → email captured (2-beat reveal)" },
  { type: "iframe-phone",  note: "Instagram ad — high-propensity targeting" },
  { type: "iframe-phone",  note: "Agentic SMS — cart recovery and app download" },
  { type: "iframe-phone",  note: "Agentforce Shopper Agent — purchase" },
  { type: "bridge",        note: "Close — link back to Journey Map" },
],
```

**Available slide types:**

| Type | What it looks like | Use it for |
|---|---|---|
| `"title"` | Full-screen headline, no image | Chapter openers, transitions |
| `"two-panel"` | Image or photo left, copy right | Any scene with a visual moment |
| `"multi-state"` | Two-panel that reveals a second scene on click | Moments with two beats (e.g. find product → share email) |
| `"timeline"` | Horizontal channel timeline across months | Showing the full journey arc |
| `"iframe-phone"` | Live aubreydemo.com scene inside an iPhone | SMS, social ads, mobile app scenes |
| `"iframe-laptop"` | Live scene or animated GIF inside a MacBook | Website browse, desktop app scenes |
| `"stat-grid"` | Grid of metric cards | BVS numbers — auto-pulls from Field 6 |
| `"capability-grid"` | Salesforce product cards | Capabilities summary — auto-populated |
| `"bridge"` | Centered closing CTA | Linking to another section at the end |
| `"fireworks"` | Animated celebration | Final closing slide |

The `note` is just for Claude — it tells Claude what story that slide should tell. You don't need to write the actual slide copy. That's Claude's job.

**If a slide uses a live scene, mention the scene `id` in the note** so Claude knows which one to use:

```js
{ type: "iframe-phone", note: "Instagram ad scene — use scene id: instagramAd" },
{ type: "iframe-phone", note: "WhatsApp conversation — use scene id: whatsapp" },
{ type: "iframe-laptop", note: "Storefront browse — use scene id: webBrowse" },
```

---

### Field 6 — BVS Metrics

Replace the `XX%` placeholders with real numbers before any external presentation. Get these from the BVS team.

```js
bvs: {
  metrics: [
    { icon: "↑",  value: "XX%",  label: "Conversion Lift"     },
    { icon: "💳", value: "+$XX", label: "Average Order Value"  },
    { icon: "★",  value: "XX%",  label: "Loyalty Enrollment"   },
    { icon: "🔄", value: "XXx",  label: "Repeat Purchase Rate" },
    { icon: "⚡", value: "XX%",  label: "Service Efficiency"   },
  ],
},
```

Change only the value between the quotes (e.g. `"XX%"` → `"18%"`). Leave everything else alone.

---

## Step 2 — Build Your Scenes in aubreydemo.com

Before you hand off to Claude, you need three live scenes built in aubreydemo.com:

1. Go to **aubreydemo.com** and start a new project for your customer
2. Build the **Instagram ad scene** — copy the `/frame` URL when done
3. Build the **Agentic SMS scene** — copy the `/frame` URL when done
4. Build the **Shopper Agent scene** — copy the `/frame` URL when done
5. Paste all three URLs into Field 4 in the config

While you're in aubreydemo.com:
- Download the **brand kit** (hex colors → go into Field 3)
- Download the **persona images** (drop them in `demo/assets/` — see Step 3)
- Download the **demo script** (you'll upload this to Claude in the next step)

---

## Step 3 — Add Your Assets

Drop any customer image files into the `demo/assets/` folder.

| What to add | File naming tip | Where to set the path |
|---|---|---|
| Customer logo | `acme-logo.png` | `brand.logoPath` in Field 3 |
| Persona background photo | `acme-persona-bg.jpg` | Claude sets this from script |
| Persona GIF | `acme-persona.gif` | Claude sets this from script |
| Store or product photos | `acme-store.jpg` | Claude sets this from script |

**File naming rules:**
- Lowercase only
- No spaces — use a hyphen instead (`acme-logo.png` not `Acme Logo.png`)
- Keep files under 2 MB for fast loading during a live presentation

**Device frames — do not replace these:**
- `assets/iPhone16Pro_FRAME.png` — the iPhone outline used in the demo
- `assets/macbook-transparent.png` — the MacBook outline used in the demo

---

## Step 4 — Hand Off to Claude (Round 1)

This is where Claude does the heavy lifting.

**What to prepare:**
1. Your filled-in `demo/holodeck.config.js`
2. Your demo script from aubreydemo.com
3. A zip of this entire project folder

**Zip the project:**
- Mac: right-click the `Demo Holodeck Template` folder → Compress
- Windows: right-click → Send to → Compressed (zipped) folder

**Upload all three to Claude and use this prompt:**

---

> I'm building a Holodeck demo. I'm attaching three things:
> 1. A zip of the Holodeck project
> 2. My demo script for **[CUSTOMER NAME]**
> 3. My partially filled-in `holodeck.config.js`
>
> Please do the following:
> - Read my `deckOutline` in Zone 1 of the config — that is the slide structure I want
> - Read the script to understand the customer story
> - Build the complete `slides[]` array in Zone 2 to match my `deckOutline`, using the story from the script
> - Populate all other Zone 2 sections: `persona`, `journey`, `demoStructure`, `vignetteSections`, `technologies`, `orbitNodes`, `orbitCopy`
> - For any asset file paths I haven't added yet, use a clearly marked placeholder like `"assets/[TODO: persona-bg.jpg]"`
> - Keep all Zone 1 fields exactly as I filled them in — do not change them
> - Return only the complete updated `holodeck.config.js`

---

When Claude returns the file, replace your `demo/holodeck.config.js` with it.

---

## Step 5 — Review and Round 2

Open `demo/index.html` and do a quick run-through of all five sections.

Start a local server first so the live scenes load correctly:
```
1. Open Terminal (Mac) or Command Prompt (Windows)
2. Type:  cd  then drag the demo/ folder into the window and press Enter
3. Type:  python3 -m http.server 8080  and press Enter
4. Open Chrome and go to:  http://localhost:8080
```

As you click through, look for three things:

**1. Yellow placeholder text that says `[TODO: ...]`**
These are spots where Claude didn't have enough information to fill something in — usually an image file that doesn't exist yet, or a metric you haven't confirmed. Make a note of each one. You'll fix them in Round 2.

**2. Anything that looks wrong**
Slide copy that doesn't match your story, a color that looks off, a name that's incorrect. Write it down exactly — "the headline on slide 3 says X but it should say Y."

**3. Slides you want to change**
Want to add a slide? Remove one? Reorder? Note it here. Claude will rebuild the affected slides.

Once you have your list, go back to Claude. Attach the updated `holodeck.config.js` file (the one Claude returned in Round 1) and use this prompt — fill in your specific changes where indicated:

---

> Here is my updated `holodeck.config.js` after Round 1. Please make these changes:
>
> - presenter.name: "[YOUR FULL NAME]"
> - presenter.title: "[YOUR TITLE AT SALESFORCE]"
> - brand.logoPath: "assets/[EXACT FILENAME OF YOUR LOGO]"
> - [Paste each TODO item and what it should be, e.g.: "The persona background image should be assets/acme-persona-bg.jpg"]
> - [Paste any corrections, e.g.: "The headline on slide 3 says 'Browse' but it should say 'Discover'"]
> - [List any slide changes, e.g.: "Remove the timeline slide" or "Add an iframe-phone slide after slide 4 using scene id: whatsapp"]
>
> Resolve all `[TODO: ...]` placeholders you now have information for.
> Return the complete updated `holodeck.config.js`.

---

Replace the config file with Claude's output. You can do this as many rounds as you need — most demos are done in 2.

---

## Step 6 — Present

Once everything looks good, here's how to run it for a customer:

1. Start the local server (same steps as above)
2. Open Chrome and go to `http://localhost:8080`
3. Use the top navigation to move between sections
4. Use **arrow keys** or **click anywhere** to advance slides

**Presentation order:**
1. Journey Map — orient the audience
2. Intro — your opening, the story you're going to tell
3. Meet [Persona] — introduce the customer persona
4. Demo — the main product demonstration
5. Business Value — capabilities and ROI metrics

**Keyboard shortcuts:**
- `→` or `Space` — next slide
- `←` — previous slide
- Click anywhere — next slide

---

## What Each Section of the Config Controls

| Config section | What it drives in the holodeck |
|---|---|
| `customer` | Name in the nav bar, brand lockup, page title |
| `presenter` | Your name on Intro slide 2 |
| `brand` | Colors, fonts, logo across all slides |
| `scenes` | The three live iPhone/MacBook scenes in the Demo |
| `deckOutline` | The structure Claude uses to build the Demo slides |
| `bvs.metrics` | The numbers on the Business Value metrics slide |
| `persona` | Everything in the Meet [Name] section |
| `journey.steps` | The five circles on the Journey Map |
| `demoStructure` | The three-act breakdown on Intro slide 3 |
| `vignetteSections` | The chapter transition slides at the end of the Intro |
| `slides[]` | The full Demo section — built by Claude from your deckOutline |
| `technologies` | The capability cards on the Business Value slide |
| `orbitNodes` | The rotating channels on the Business Value orbit diagram |
| `orbitCopy` | The copy next to the orbit diagram |

The top half (`customer` through `bvs.metrics`) is Zone 1 — you fill it in.
Everything else is Zone 2 — Claude fills it in from your script.

---

## Troubleshooting

**The live scenes aren't loading**
You need to run a local server. Open Chrome via `http://localhost:8080` — not by opening the file directly. See Step 5 for how to start the server.

**Something says [TODO: ...]**
That's a placeholder Claude left because it didn't have enough information. Go back to Claude with that specific value and ask it to update the config.

**The colors look wrong**
Check that your hex color in `brand.primaryColor` starts with a `#` and has exactly 6 characters after it, like `#b22234`.

**The logo isn't showing**
Make sure the file is in `demo/assets/` and the filename in `brand.logoPath` matches exactly — including capitalization and the file extension (`.png`, `.svg`).

**I want to change a slide after Claude generated it**
Find the slide in the `slides[]` array in the config and edit the text fields directly. Each field has a comment explaining what it controls. Or just tell Claude what to change and ask it to update the config.

---

## Quick Checklist Before Going Live

- [ ] `presenter.name` and `presenter.title` updated
- [ ] Customer name, colors, and logo set in `brand.*`
- [ ] All three `scenes.*` URLs are live and loading correctly
- [ ] All `XX%` and `+$XX` BVS placeholders replaced with real numbers
- [ ] No `[TODO: ...]` placeholders remaining anywhere in the config
- [ ] All asset files exist in `demo/assets/`
- [ ] Tested in Chrome via local server (`http://localhost:8080`)
- [ ] All five sections reviewed top to bottom
