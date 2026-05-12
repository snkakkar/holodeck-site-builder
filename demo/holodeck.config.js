// ╔═══════════════════════════════════════════════════════════════╗
//  HOLODECK CONFIG
//  Full guide: HOW_TO_BUILD_HOLODECK.md at the repo root
// ╚═══════════════════════════════════════════════════════════════╝
//
//  HOW THIS FILE WORKS
//  ───────────────────
//  This file has two zones:
//
//  ┌─────────────────────────────────────────────────────────────┐
//  │  ZONE 1 — YOU FILL THIS IN  (~ 10 fields)                   │
//  │  Customer name, brand colors, scene URLs, BVS numbers       │
//  └─────────────────────────────────────────────────────────────┘
//
//  ┌─────────────────────────────────────────────────────────────┐
//  │  ZONE 2 — CLAUDE FILLS THIS IN  (from your script + zip)    │
//  │  Persona, journey map, demo slides, orbit, capabilities     │
//  └─────────────────────────────────────────────────────────────┘
//
//  TO BUILD A NEW DEMO:
//  1. Fill in Zone 1 below
//  2. Zip this project folder
//  3. Give Claude: the zip + your demo script + this file
//     Claude writes all of Zone 2 and returns the complete config
//  4. Replace this file with Claude's output
//  5. Drop assets in demo/assets/
//  6. Open demo/index.html
//
// ════════════════════════════════════════════════════════════════

window.HOLODECK_CONFIG = {

// ╔═══════════════════════════════════════════════════════════════╗
// ║  ZONE 1 — YOU FILL THIS IN                                    ║
// ║  These are the only fields you touch before handing off       ║
// ║  to Claude. Everything else gets generated from your script.  ║
// ╚═══════════════════════════════════════════════════════════════╝

  // ┌─────────────────────────────────────────────────────────────┐
  // │  HOW TO EDIT THESE FIELDS                                   │
  // │  • Change the text between the quote marks  "like this"     │
  // │  • Keep the quote marks, the colon, and the comma           │
  // │  • Don't change anything outside the quote marks            │
  // │  • If a field says  null  (no quotes), leave it or replace  │
  // │    it with  "assets/your-file.png"  including the quotes    │
  // └─────────────────────────────────────────────────────────────┘

  // ── 1. Customer ───────────────────────────────────────────────
  //  Who is this demo for?
  customer: {
    name:        "At Home",     // ← Customer company name
    nameDisplay: "AT HOME",     // ← Same name in ALL CAPS (used in nav bar)
    website:     "https://www.athome.com/",  // ← Customer website URL
    industry:    "Retail",      // ← Industry, e.g. "Retail", "Healthcare", "Financial Services"
  },

  // ── 2. Presenter ─────────────────────────────────────────────
  //  Update this before every single demo.
  presenter: {
    name:    "[PRESENTER NAME]",  // ← Your full name, e.g. "Jane Smith"
    title:   "[TITLE]",           // ← Your title, e.g. "Senior Account Executive"
    company: "Salesforce",        // ← Usually leave this as "Salesforce"
  },

  // ── 3. Brand ─────────────────────────────────────────────────
  //  Colors and logo. Get hex color codes from aubreydemo.com
  //  or the customer's brand kit.
  //  A hex color looks like this: "#b22234"  (# then 6 characters)
  brand: {
    //  Logo file — drop the file in demo/assets/ first, then replace null below
    //  Example: "assets/acme-logo.png"
    //  Leave as  null  (no quotes) to show the customer name as text instead
    logoPath: null,

    primaryColor:   "#b22234",  // ← Main brand color — used for buttons, accents
    secondaryColor: "#1a5fa0",  // ← Secondary color — usually keep as Salesforce blue
    accentColor:    "#f5c06a",  // ← Warm accent color — orbit diagram, highlights
    navyColor:      "#0d1b2e",  // ← Text color — usually keep dark
    bgColor:        "#f5f7ff",  // ← Page background — usually keep light

    //  Fonts — leave these unless you have a specific brand font
    fontHeading:    "'Playfair Display', Georgia, serif",
    fontBody:       "'Inter', -apple-system, sans-serif",
    googleFontsUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700;800&display=swap",
  },

  // ── 4. Live demo scene URLs ───────────────────────────────────
  //  Add one entry for every live scene in your demo.
  //  Build each scene in aubreydemo.com, then copy the /frame URL
  //  and paste it as the "url" value below.
  //
  //  The "id" is a short nickname you make up — no spaces, no special
  //  characters. You'll reference this id in your deckOutline notes
  //  so Claude knows which scene goes on which slide.
  //
  //  The "label" is the human-readable name shown in the slide tag.
  //
  //  You can have as many or as few scenes as your demo needs.
  //  Delete the ones you don't use. Add new ones by copying any
  //  existing entry and changing the id, label, and url.
  //
  //  COMMON SCENE TYPES — add as many as you need:
  //    Instagram ad, LinkedIn ad, Facebook ad
  //    SMS (agentic or one-way)
  //    WhatsApp conversation
  //    Email (personalized, abandon cart, post-purchase)
  //    Website / storefront browse
  //    Mobile app (shopper agent, service agent)
  //    Retail POS / in-store associate screen
  //    Service Cloud console
  //    Slack / Teams notification
  //
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
    {
      id:    "shopperAgent",
      label: "Agentforce Shopper Agent · July",
      url:   "https://pocketsic.aubreydemo.com/scene/1060/frame",
    },

    // ── Add more scenes below — copy any block above as a template ──

    // { id: "email",       label: "MCP · Abandon Cart Email",        url: "[TODO: paste URL]" },
    // { id: "linkedin",    label: "MCP · LinkedIn Ad",               url: "[TODO: paste URL]" },
    // { id: "whatsapp",    label: "Agentforce · WhatsApp",           url: "[TODO: paste URL]" },
    // { id: "pos",         label: "Retail POS · Store Associate",    url: "[TODO: paste URL]" },
    // { id: "serviceCloud",label: "Service Cloud · Agent Console",   url: "[TODO: paste URL]" },
    // { id: "webBrowse",   label: "Commerce Cloud · Storefront",     url: "[TODO: paste URL]" },
  ],

  // ── 5. Demo slide deck outline ───────────────────────────────
  //  This is where YOU decide the shape of your demo.
  //  List the slide types you want, in order.
  //  Claude reads this and builds the full slides[] array to match.
  //
  //  AVAILABLE SLIDE TYPES — pick from these:
  //
  //  "title"           Full-screen headline. Good for chapter openers.
  //  "two-panel"       Photo or store image left | narrative copy right.
  //                    Use for any scene that has a visual moment.
  //  "multi-state"     Two-panel that reveals a second scene on click.
  //                    Use when one moment has two beats (e.g. find product → share email).
  //  "timeline"        Horizontal channel timeline across months.
  //                    Use to show the full journey arc at a glance.
  //  "iframe-phone"    Live aubreydemo.com scene inside an iPhone frame.
  //                    Use for SMS, social ad, or mobile app scenes.
  //  "iframe-laptop"   Live scene or animated GIF inside a MacBook frame.
  //                    Use for website browse or desktop app scenes.
  //  "stat-grid"       Grid of metric cards. Use for BVS numbers.
  //                    Auto-pulls from bvs.metrics above — no extra work needed.
  //  "capability-grid" Salesforce product/capability cards.
  //                    Auto-pulls from technologies[] — no extra work needed.
  //  "bridge"          Centered closing CTA. Links to another section.
  //  "fireworks"       Animated celebration. Always last if you use it.
  //
  //  EXAMPLE — a typical retail demo arc:
  //    "title"           → open the demo section
  //    "two-panel"       → in-store scene / identity capture
  //    "timeline"        → show the six-month journey
  //    "two-panel"       → in-store browse
  //    "multi-state"     → product find + email capture (2-beat reveal)
  //    "multi-state"     → time passes + spring email (2-beat reveal)
  //    "iframe-laptop"   → personalized website browse
  //    "iframe-phone"    → Instagram ad
  //    "two-panel"       → abandon cart email
  //    "iframe-phone"    → agentic SMS
  //    "iframe-phone"    → Shopper Agent purchase
  //    "bridge"          → link back to Journey Map
  //
  //  You can add a note next to each type to tell Claude what that
  //  slide should be about. Claude handles all the copy and content.
  //
  deckOutline: [
    { type: "title",          note: "Open the demo — in-store moment in December" },
    { type: "two-panel",      note: "The store scene — identity capture at checkout" },
    { type: "timeline",       note: "Six-month channel journey overview" },
    { type: "two-panel",      note: "In-store browse — Rachel finds the sectional" },
    { type: "multi-state",    note: "Product find → email captured (2-beat reveal)" },
    { type: "multi-state",    note: "Time passes → spring email arrives (2-beat reveal)" },
    { type: "iframe-laptop",  note: "Personalized website browse" },
    { type: "iframe-phone",   note: "Instagram ad — high-propensity targeting" },
    { type: "two-panel",      note: "Abandon cart email" },
    { type: "iframe-phone",   note: "Agentic SMS — cart recovery + app download" },
    { type: "iframe-phone",   note: "Agentforce Shopper Agent — purchase" },
    { type: "bridge",         note: "Close — link back to Journey Map" },
  ],

  // ── 6. BVS metrics ──────────────────────────────────────────
  //  ⚠️  Replace XX% and +$XX with real numbers before any
  //  external presentation. Get these from the BVS team.
  //  The "icon" is just an emoji — feel free to change it.
  //  The "label" is the metric name shown below the number.
  bvs: {
    disclaimer: "Replace placeholders with BVS-approved values before presenting externally.",
    metrics: [
      { icon: "↑",  value: "XX%",  label: "Conversion Lift"     },  // ← replace XX%
      { icon: "💳", value: "+$XX", label: "Average Order Value"  },  // ← replace +$XX
      { icon: "★",  value: "XX%",  label: "Loyalty Enrollment"   },  // ← replace XX%
      { icon: "🔄", value: "XXx",  label: "Repeat Purchase Rate" },  // ← replace XXx
      { icon: "⚡", value: "XX%",  label: "Service Efficiency"   },  // ← replace XX%
    ],
  },

// ╔═══════════════════════════════════════════════════════════════╗
// ║  ZONE 2 — CLAUDE FILLS THIS IN                                ║
// ║  Give Claude: this file + the project zip + your demo script  ║
// ║  Claude generates everything below from your script.          ║
// ║  You should not need to edit this zone manually.              ║
// ║                                                               ║
// ║  What lives here:                                             ║
// ║    persona      →  Meet [Name] section                        ║
// ║    journey      →  Journey Map circles                        ║
// ║    demoStructure →  Intro "what you'll see today"             ║
// ║    vignetteSections → Intro chapter transition slides         ║
// ║    slides[]     →  The full Demo section  ← dynamic array     ║
// ║    technologies →  BV capabilities slide                      ║
// ║    orbitNodes   →  BV orbit diagram channels                  ║
// ║    orbitCopy    →  BV orbit copy block                        ║
// ║    demoAssets   →  Image paths for demo slides                ║
// ╚═══════════════════════════════════════════════════════════════╝

  // ─────────────────────────────────────────────────────────────
  //  PERSONA  →  "Meet [Name]" section
  //  ⚑ CLAUDE-GENERATED from script
  // ─────────────────────────────────────────────────────────────
  persona: {
    name:         "Rachel",
    fullName:     "Rachel Morris",
    role:         "Enthusiastic Entertainer",
    jobTitle:     "Annual Host & Outdoor Entertaining Enthusiast",
    customerOf:   "At Home",
    journeyArc:   "Her journey starts in December and ends at the perfect 4th of July BBQ",
    quote:        "My 4th of July BBQ is the event of the summer. This year, I want the backyard to be perfect.",
    stats: [
      { value: "4th of July", label: "The Event"        },
      { value: "Annual",      label: "BBQ Tradition"    },
      { value: "High Intent", label: "Purchase Signal"  },
    ],
    wishlist: [
      { name: "Paloma Outdoor Set",    tag: "PRIMARY CONSIDERATION", detail: "Saved to cart · price-drop trigger",    emoji: "🪑" },
      { name: "Market Patio Umbrella", tag: "AI SEARCH MATCH",       detail: "Contextual search · weather-resistant", emoji: "⛱️" },
      { name: "Outdoor String Lights", tag: "COMPLETE THE LOOK",     detail: "Added by Agentforce Shopper Agent",     emoji: "✨" },
    ],
    wishlistHeadline: "Her top 3. <strong>Perfect for the 4th.</strong>",
    wishlistLabel:    "Rachel's Patio Wishlist",
    ctaLabel:         "BEGIN THE JOURNEY &nbsp;→",
    ctaHeadline:      "Let's follow Rachel's journey<br/>to the <span class=\"accent\">perfect 4th.</span>",
    ctaSub:           "From a December in-store visit to the ultimate 4th of July backyard",
    heroBackground:   "assets/Rachel_Hero-Background.jpg",
    heroGif:          "assets/Rachel_Hero.gif",
    phoneGif:         "assets/Rachel_Phone.gif",
  },

  // ─────────────────────────────────────────────────────────────
  //  JOURNEY MAP  →  The five circles on the Journey Map section
  //  ⚑ CLAUDE-GENERATED from script
  // ─────────────────────────────────────────────────────────────
  journey: {
    headline: "Agentic <strong>Retail Journey</strong>",
    steps: [
      {
        title:        "Know",
        badge:        "CDP · Unified Profile",
        emoji:        "🏪",
        circleClass:  "circle-anticipate",
        description:  "An in-store visit seeds Rachel's profile. A personalized spring email sparks the first agentic conversation.",
        detail:       "Rachel's December in-store visit is captured in CDP, building her unified profile. Months later, a personalized spring email — grounded in her homeowner affinity — triggers a two-way agentic reply that recommends patio sets for 8+. Marketing channel becomes sales channel.",
        technologies: ["CDP", "Marketing Cloud Personalization", "Email"],
      },
      {
        title:        "Reach",
        badge:        "Paid Media · MCP",
        emoji:        "📸",
        circleClass:  "circle-engage",
        description:  "June: Marketing Cloud Personalization identifies Rachel as high-propensity. A targeted Instagram ad finds her at exactly the right moment.",
        detail:       "Marketing Cloud Personalization connects Rachel's in-store visit and email engagement, scoring her as a high-propensity outdoor furniture buyer. A targeted 4th of July ad on Instagram surfaces at the perfect moment — powered by her unified profile.",
        technologies: ["Marketing Cloud Personalization", "Paid Media"],
      },
      {
        title:        "Engage",
        badge:        "Onsite Personalization",
        emoji:        "🛍️",
        circleClass:  "circle-guide",
        description:  "Rachel lands on a personalized B2C Commerce homepage — hero and recommendations already tailored to her intent.",
        detail:       "The Commerce Cloud storefront adapts in real time: a 4th of July hero banner, product recommendations that include the patio sets suggested to her over email, and AI-powered contextual search. Rachel finds the patio set, adds it to her cart — then life happens and she steps away.",
        technologies: ["Marketing Cloud Personalization", "Commerce Cloud", "AI-Powered Search"],
      },
      {
        title:        "Recover",
        badge:        "Agentic SMS · App Download",
        emoji:        "💬",
        circleClass:  "circle-convert",
        description:  "An Agentic SMS initiates a two-way conversation, surfaces a Flash Sale in the app, and guides Rachel to download.",
        detail:       "The next day, Rachel receives an Agentic SMS — not a static reminder. The AI agent proactively surfaces a Flash Sale exclusive to the At Home app, Rachel replies 'That sounds great!', and the agent sends a direct download link. Recovery becomes a channel deepening moment.",
        technologies: ["Marketing Cloud Personalization", "SMS", "Agentforce"],
      },
      {
        title:        "Convert",
        badge:        "Agentforce Shopper Agent",
        emoji:        "🤖",
        circleClass:  "circle-delight",
        description:  "The Agentforce Shopper Agent answers her questions, builds the full cart, and closes the sale. The journey doesn't end at checkout.",
        detail:       "Inside the app, the Agentforce Shopper Agent answers Rachel's questions about weather resistance, recommends the umbrella and string lights, and adds everything to her cart with one tap. She checks out. Post-purchase, a personalized email with hosting tips and care content extends the relationship.",
        technologies: ["Agentforce Shopper Agent", "Commerce Cloud", "Marketing Cloud Personalization"],
      },
    ],
    platform: {
      title:    "Salesforce Platform",
      subtitle: "MARKETING CLOUD PERSONALIZATION · AGENTFORCE · COMMERCE CLOUD",
      capabilities: [
        "Marketing Cloud Personalization",
        "Agentforce Shopper Agent",
        "Commerce Cloud",
        "SMS & Email Automation",
        "Onsite Personalization",
        "AI-Powered Search",
        "Post-Purchase Nurture",
      ],
    },
  },

  // ─────────────────────────────────────────────────────────────
  //  INTRO DECK  →  "What you'll see today" + chapter vignettes
  //  ⚑ CLAUDE-GENERATED from script
  // ─────────────────────────────────────────────────────────────
  customer_narrative: {
    demoTitle:     "Salesforce CX Vision",
    demoSubtitle:  "Agentic Retail Journey",
    journeyTagline: "PERSONALIZED • AGENTIC • CONNECTED",
    heroHeadline:  "A connected, <em>agentic</em><br/>retail journey.",
    heroSub:       "At Home + Salesforce",
    storyHook:     "See how At Home turns<br/>a single visit into a loyal customer.",
    storyHookSub:  "From a December in-store visit to a 4th of July purchase — every interaction builds context. Every context makes the next experience more personal.",
    closingQuote:  "From inspiration to purchase to loyalty — every moment is connected.",
  },

  demoStructure: [
    {
      title:       "Know & Reach",
      description: "CDP unifies Rachel's in-store identity with every digital signal — powering a personalized spring email, an agentic two-way conversation, and a targeted Instagram ad.",
      tags:        ["CDP", "Email", "Paid Media", "Anonymous → Known"],
    },
    {
      title:       "Engage & Recover",
      description: "The Commerce Cloud storefront adapts to Rachel's intent in real time. When she abandons her cart, an Agentic SMS — not a static reminder — recovers the sale and drives an app download.",
      tags:        ["Commerce Cloud", "AI Search", "Agentic SMS", "MCP"],
    },
    {
      title:       "Convert",
      description: "The Agentforce Shopper Agent answers questions, builds the full cart, and closes the sale — then post-purchase personalization extends the relationship beyond the transaction.",
      tags:        ["Agentforce", "Commerce Cloud", "Clicks not code", "GA today"],
    },
  ],

  vignetteSections: [
    {
      eyebrow:  "MARKETING CLOUD PERSONALIZATION",
      title:    "Know & Reach",
      subtitle: "From in-store identity capture to a targeted ad — MCP connects every touchpoint before Rachel ever visits the site.",
    },
    {
      eyebrow:  "MARKETING CLOUD PERSONALIZATION · COMMERCE CLOUD",
      title:    "Engage & Recover",
      subtitle: "A personalized storefront, an abandoned cart, and an Agentic SMS that turns recovery into a relationship.",
    },
    {
      eyebrow:  "AGENTFORCE SHOPPER AGENT",
      title:    "Convert",
      subtitle: "One conversation. Full cart. Checkout. Then post-purchase personalization that makes the next visit smarter.",
    },
  ],

  // ─────────────────────────────────────────────────────────────
  //  SLIDES  →  The full Demo section — built slide by slide
  //  ⚑ CLAUDE-GENERATED from script
  //
  //  This is the dynamic array that drives the entire demo.
  //  Claude assembles it from your script using the slide types
  //  defined below. Add, remove, or reorder slides freely.
  //
  //  AVAILABLE SLIDE TYPES:
  //
  //  "title"           Full-screen headline. No image.
  //                    Fields: eyebrow, headline, sub
  //
  //  "two-panel"       Photo or background left | copy block right
  //                    Fields: left{imagePath, tag}
  //                            right{eyebrow, headline, sub, stats[], quote}
  //
  //  "multi-state"     Two-panel with click-through reveal.
  //                    Each click advances to the next state.
  //                    Fields: states[ {left, right}, {left, right}, ... ]
  //                    (same left/right shape as two-panel)
  //
  //  "timeline"        Horizontal channel timeline.
  //                    Fields: eyebrow, headline, sub,
  //                            above[ {month, icon, label, sub} ],
  //                            below[ {month, icon, label, sub, hero?} ]
  //
  //  "iframe-phone"    Live aubreydemo.com scene in iPhone frame.
  //                    Fields: left{backgroundPath, iframeSrc, tag}
  //                            right{eyebrow, headline, sub, stats[], quote}
  //
  //  "iframe-laptop"   Live scene or GIF in MacBook frame.
  //                    Fields: left{backgroundPath, contentGifPath,
  //                                 personGifPath, tag}
  //                            right{eyebrow, headline, sub, stats[], quote}
  //
  //  "stat-grid"       BVS metrics or any number cards.
  //                    Fields: eyebrow, headline, disclaimer?, stats[]
  //                    Note: auto-pulls from bvs.metrics if no stats given
  //
  //  "capability-grid" Salesforce product/feature cards.
  //                    Fields: eyebrow, headline
  //                    Note: auto-pulls from technologies[] — no extra fields needed
  //
  //  "bridge"          Centered closing CTA linking to another section.
  //                    Fields: eyebrow, headline, sub, ctaLabel, ctaTarget
  //                    ctaTarget: "map" | "intro" | "persona" | "bv"
  //
  //  "fireworks"       Animated celebration close.
  //                    Fields: eyebrow, headline, ctaLabel, ctaTarget
  // ─────────────────────────────────────────────────────────────
  slides: [

    // ── Slide 1 — Chapter opener ──────────────────────────────
    {
      type:     "title",
      eyebrow:  "In-Store Experience · December",
      headline: "Every relationship begins<br/>with a single moment.",
      sub:      "<strong>December.</strong> An At Home store. <strong>Rachel's</strong> holiday shopping.",
    },

    // ── Slide 2 — The Scene ───────────────────────────────────
    {
      type: "two-panel",
      left: {
        imagePath: "assets/At-Home-stores-retail.png",
        tag:       "December · At Home Store",
      },
      right: {
        eyebrow:  "The Moment That Starts Everything",
        headline: "One visit.<br/>One email.",
        sub:      "A digital receipt becomes the first data point in Rachel's unified profile.",
        stats: [
          { value: "December", label: "Holiday Season"    },
          { value: "In-Store", label: "At Home Visit"     },
          { value: "Known",    label: "Anonymous → Known" },
        ],
        quote: "The bridge that makes every future touchpoint personal.",
      },
    },

    // ── Slide 3 — Six-month timeline ──────────────────────────
    {
      type:    "timeline",
      eyebrow: "Marketing Cloud Personalization · Agentforce · Commerce Cloud",
      headline: "One journey. Every channel.<br/><span class=\"accent\">Always personal.</span>",
      sub:     "From a single in-store moment, Marketing Cloud Personalization and Agentforce turn Rachel's identity into six months of personalized, agentic engagement.",
      above: [
        { month: "FEB", icon: "🖥️", label: "Visits Website",  sub: "Browses outdoor furniture, abandons" },
        { month: "JUN", icon: "🖥️", label: "Visits Website",  sub: "Adds outdoor set to cart, abandons"  },
        { month: "JUL", icon: "📱", label: "Downloads App",   sub: "Talks to Shopper Agent"              },
      ],
      below: [
        { month: "DEC", icon: "🏪", label: "In-Store Visit",     sub: "Identity captured",        hero: true },
        { month: "FEB", icon: "📧", label: "Spring Email",       sub: "Agentic conversation"                },
        { month: "APR", icon: "📧", label: "4th of July Email",  sub: "Start shopping early"               },
        { month: "JUN", icon: "📸", label: "Instagram Ad",       sub: "High-propensity signal"             },
        { month: "JUN", icon: "📧", label: "Abandon Cart Email", sub: "Re-engagement trigger"              },
        { month: "JUL", icon: "💬", label: "Agentic SMS",        sub: "Cart recovery agent"                },
        { month: "JUL", icon: "🛒", label: "Purchase",           sub: "Agentforce closes sale",   hero: true },
      ],
    },

    // ── Slide 4 — In-store browse ─────────────────────────────
    {
      type: "two-panel",
      left: {
        imagePath: "assets/AtHomeStore.png",
        tag:       "At Home Store · December",
      },
      right: {
        eyebrow:  "The Browse",
        headline: "She's not just shopping.<br/>She's <em>inspired.</em>",
        sub:      "Rachel shops for new furniture and home décor to refresh her space for the holiday season.",
        stats: [
          { value: "December",   label: "Holiday Season"   },
          { value: "In-Store",   label: "At Home Visit"    },
          { value: "High Intent",label: "Purchase Signal"  },
        ],
        quote: "I'll know it when I see it. And when I see it, I want it to be perfect.",
      },
    },

    // ── Slide 5 — Checkout (2-click reveal) ───────────────────
    {
      type: "multi-state",
      states: [
        {
          left: {
            imagePath: "assets/barrett-storage-sectional-brown.jpg",
            tag:       "At Home Store · Home Furnishings",
          },
          right: {
            eyebrow:  "The Find",
            headline: "She finds it.<br/>She's <em>ready to buy.</em>",
            sub:      "The Barrett Storage Sectional. Perfect for her home. It goes in the cart.",
            stats: [
              { value: "Sectional",  label: "Added to Cart"  },
              { value: "Considered", label: "Purchase Type"  },
              { value: "Ready",      label: "To Buy"         },
            ],
            quote: "This is the one. It's exactly what my living room needs.",
          },
        },
        {
          left: {
            backgroundPath:   "assets/Rachel_Hero-Background.jpg",
            overlayGifPath:   "assets/Rachel_Phone.gif",
            overlayImagePath: "assets/AtHome_iPhone_Rec.png",
            tag:              "At Home Store · Email Captured",
          },
          right: {
            eyebrow:  "The Pivotal Moment",
            headline: "She shares<br/>her <em>email.</em>",
            sub:      "A digital receipt offer. Rachel says yes. One action connects every future touchpoint.",
            stats: [
              { value: "Email",   label: "Captured"          },
              { value: "Profile", label: "Created in CDP"    },
              { value: "Known",   label: "Anonymous → Known" },
            ],
            quote: "The bridge that makes every future touchpoint personal. The journey starts here.",
          },
        },
      ],
    },

    // ── Slide 6 — Spring email (2-click reveal) ───────────────
    {
      type: "multi-state",
      states: [
        {
          left: {
            backgroundPath: "assets/Rachel_Hero-Background.jpg",
            tag:            "February · Two Months Later",
          },
          right: {
            eyebrow:  "The Journey Continues",
            headline: "Two months<br/><em>have passed.</em>",
            sub:      "December's in-store visit quietly seeded Rachel's profile. CDP has been building a picture of who she is, what she loves, and when she buys.",
            stats: [
              { value: "December", label: "In-Store Visit"  },
              { value: "→ February",label: "Two Months Later"},
              { value: "Profile",  label: "Built in CDP"    },
            ],
            quote: "One email address. Six months of potential. MCP is ready to act.",
          },
        },
        {
          left: {
            backgroundPath:   "assets/Rachel_Hero-Background.jpg",
            overlayImagePath: "assets/AtHome_iPhone_Rec.png",
            tag:              "MCP · Spring Email · February",
          },
          right: {
            eyebrow:  "Marketing Cloud Personalization",
            headline: "The right message.<br/><em>Right moment.</em>",
            sub:      "February. Rachel receives a personalized spring email — grounded in her in-store visit and homeowner profile. She clicks through to browse.",
            stats: [
              { value: "Personalized", label: "Email Content"   },
              { value: "Seasonal",     label: "Spring Trigger"  },
              { value: "Known",        label: "Profile Match"   },
            ],
            quote: "Six months after her in-store visit — MCP delivers the right message at exactly the right moment.",
          },
        },
      ],
    },

    // ── Slide 7 — Website browse (MacBook) ────────────────────
    {
      type: "iframe-laptop",
      left: {
        backgroundPath: "assets/Rachel_Hero-Background.jpg",
        contentGifPath: "assets/AtHome_Generic_webBrowse.gif",
        personGifPath:  "assets/Laptop Happy Browsing.gif",
        tag:            "Commerce Cloud · Personalized Storefront",
      },
      right: {
        eyebrow:  "Marketing Cloud Personalization · Commerce Cloud",
        headline: "She visits.<br/>The site <em>knows her.</em>",
        sub:      "Rachel lands on a personalized Commerce Cloud storefront — the hero banner, product recommendations, and search results all reflect her outdoor entertaining intent.",
        stats: [
          { value: "Personalized", label: "Homepage"          },
          { value: "AI Search",    label: "Contextual Results" },
          { value: "Anonymous",    label: "→ Known"            },
        ],
        quote: "The site adapts before she says a word. Every product reflects what she's already told us.",
      },
    },

    // ── Slide 8 — MCP onsite (3-click: banner → recs → search) ─
    // Note: uses mcpStates[] defined below for the three click states
    {
      type:        "iframe-laptop",
      isMcpSlide:  true,           // signals renderer to use mcpStates[]
      left: {
        backgroundPath: "assets/Rachel_Hero-Background.jpg",
        personGifPath:  "assets/Laptop Happy Browsing.gif",
      },
      right: {
        eyebrow: "Marketing Cloud Personalization",
      },
    },

    // ── Slide 9 — 4th of July email ───────────────────────────
    {
      type: "two-panel",
      left: {
        backgroundPath:   "assets/Rachel_Hero-Background.jpg",
        overlayImagePath: "assets/AtHome_iPhone_Rec.png",
        tag:              "MCP · 4th of July Email · April",
      },
      right: {
        eyebrow:  "Marketing Cloud Personalization",
        headline: "Start planning<br/><em>early.</em>",
        sub:      "April. MCP fires a proactive 4th of July email — timed to Rachel's purchase window and outdoor entertaining profile.",
        stats: [
          { value: "April",    label: "Early Signal"  },
          { value: "Seasonal", label: "Trigger"       },
          { value: "Proactive",label: "Outreach"      },
        ],
        quote: "The best time to reach Rachel is before she starts searching. MCP knows exactly when that is.",
      },
    },

    // ── Slide 10 — Instagram ad (iPhone iframe) ───────────────
    {
      type: "iframe-phone",
      left: {
        backgroundPath: "assets/Rachel_Hero-Background.jpg",
        iframeSrc:      "{{scenes.instagramAd}}",   // auto-filled from scenes above
        tag:            "MCP · Instagram Ad · June",
      },
      right: {
        eyebrow:  "Marketing Cloud Personalization · Paid Media",
        headline: "She sees it<br/><em>on Instagram.</em>",
        sub:      "June. MCP identifies Rachel as high-propensity and fires a targeted 4th of July ad — the right product, the right platform, the right moment.",
        stats: [
          { value: "High Intent", label: "Propensity Score" },
          { value: "Targeted",    label: "Paid Media"       },
          { value: "June",        label: "Perfect Timing"   },
        ],
        quote: "Six months of signals. One perfectly timed ad. Rachel clicks.",
      },
    },

    // ── Slide 11 — Abandon cart email ─────────────────────────
    {
      type: "two-panel",
      left: {
        backgroundPath:   "assets/Rachel_Hero-Background.jpg",
        overlayImagePath: "assets/AtHome_iPhone_Rec.png",
        tag:              "MCP · Abandon Cart Email · June",
      },
      right: {
        eyebrow:  "Marketing Cloud Personalization",
        headline: "She left.<br/><em>We noticed.</em>",
        sub:      "Rachel added the Paloma Outdoor Set to her cart — then life happened. MCP fires a personalized abandon cart email to bring her back.",
        stats: [
          { value: "Paloma Set", label: "In Cart"            },
          { value: "Triggered",  label: "Abandon Signal"     },
          { value: "Recovery",   label: "Opportunity"        },
        ],
        quote: "The cart remembers. MCP makes sure Rachel does too.",
      },
    },

    // ── Slide 12 — Agentic SMS (iPhone iframe) ────────────────
    {
      type: "iframe-phone",
      left: {
        backgroundPath: "assets/Rachel_Hero-Background.jpg",
        iframeSrc:      "{{scenes.agenticSms}}",    // auto-filled from scenes above
        tag:            "Agentforce · Agentic SMS · July",
      },
      right: {
        eyebrow:  "Marketing Cloud Personalization · Agentforce",
        headline: "Not a reminder.<br/><em>A conversation.</em>",
        sub:      "July. An Agentic SMS reaches Rachel — not a static push. The AI agent surfaces a Flash Sale exclusive to the At Home app and drives the download.",
        stats: [
          { value: "Agentic",    label: "Two-Way SMS"        },
          { value: "Flash Sale", label: "App Exclusive"      },
          { value: "Download",   label: "Channel Deepening"  },
        ],
        quote: "Recovery becomes a relationship. Rachel downloads the app.",
      },
    },

    // ── Slide 13 — Shopper Agent / Purchase (iPhone iframe) ───
    {
      type: "iframe-phone",
      left: {
        backgroundPath: "assets/Rachel_Hero-Background.jpg",
        iframeSrc:      "{{scenes.shopperAgent}}",  // auto-filled from scenes above
        tag:            "Agentforce Shopper Agent · July",
      },
      right: {
        eyebrow:  "Agentforce Shopper Agent · Commerce Cloud",
        headline: "One conversation.<br/><em>Full cart. Checkout.</em>",
        sub:      "Inside the app, the Agentforce Shopper Agent answers Rachel's questions, recommends the umbrella and string lights, and adds everything to her cart. She checks out.",
        stats: [
          { value: "Paloma Set", label: "In Cart"            },
          { value: "+2 Items",   label: "Recommended"        },
          { value: "Purchased",  label: "Agentforce Closes"  },
        ],
        quote: "One agent. One conversation. The backyard is ready for the 4th.",
      },
    },

    // ── Slide 14 — Bridge back to Journey Map ─────────────────
    {
      type:      "bridge",
      eyebrow:   "The Journey Begins",
      headline:  "Six months of data.<br/>One <span class=\"accent\">perfect moment.</span>",
      sub:       "Rachel is ready. CDP knows who she is, what she loves, and exactly when to reach her. The agentic journey starts now.",
      ctaLabel:  "VIEW THE JOURNEY MAP &nbsp;→",
      ctaTarget: "map",
    },

  ],

  // ─────────────────────────────────────────────────────────────
  //  MCP ONSITE STATES  →  Three click-through states on slide 8
  //  ⚑ CLAUDE-GENERATED from script
  // ─────────────────────────────────────────────────────────────
  mcpStates: [
    {
      tag:      "MCP · Onsite Personalization · Screen 1 of 3",
      headline: "Personalized<br/><em>hero banner.</em>",
      sub:      "MCP serves a tailored 4th of July hero banner the moment Rachel lands — outdoor furniture, her style, her moment.",
      quote:    "Every visit starts with a signal. MCP turns that signal into a moment.",
      counter:  "1 / 3",
    },
    {
      tag:      "MCP · Product Recommendations · Screen 2 of 3",
      headline: "Products she<br/><em>already wants.</em>",
      sub:      "MCP surfaces patio sets recommended to Rachel over email — her browse history and purchase intent shaping every tile.",
      quote:    "Recommendations aren't guesses. They're built from six months of Rachel's story.",
      counter:  "2 / 3",
    },
    {
      tag:      "MCP · AI-Powered Search · Screen 3 of 3",
      headline: "Search that<br/><em>understands her.</em>",
      sub:      "Contextual AI search built into Commerce Cloud surfaces exactly the right products for Rachel's outdoor entertaining intent.",
      quote:    "She typed 'patio'. MCP heard '4th of July BBQ for 8'.",
      counter:  "3 / 3",
    },
  ],

  // ─────────────────────────────────────────────────────────────
  //  TECHNOLOGIES  →  BV capabilities slide
  //  ⚑ CLAUDE-GENERATED from script
  // ─────────────────────────────────────────────────────────────
  technologies: [
    { label: "Marketing Cloud Personalization", description: "Real-time onsite, in-app, email, and SMS personalization — anonymous to known, always relevant." },
    { label: "Agentforce Shopper Agent",        description: "Conversational AI agent on the Commerce Cloud storefront — answers questions, builds carts, drives conversion." },
    { label: "Commerce Cloud",                  description: "Personalized storefront with AI-powered contextual search built in — from browse to checkout." },
    { label: "SMS & Email Automation",          description: "Proactive re-engagement and post-purchase nurture — price-drop alerts, hosting tips, lifecycle moments." },
    { label: "Onsite Personalization",          description: "Dynamic banners, product carousels, and recommendations that adapt in real time to shopper intent." },
    { label: "AI-Powered Search",               description: "Contextual search built into Commerce Cloud — surfaces the right product for every shopper intent." },
    { label: "Post-Purchase Nurture",           description: "Context-aware content and product recommendations that extend the relationship beyond the transaction." },
  ],

  // ─────────────────────────────────────────────────────────────
  //  ORBIT  →  BV animated orbit diagram
  //  ⚑ CLAUDE-GENERATED from script
  // ─────────────────────────────────────────────────────────────
  orbitNodes: [
    { icon: "📸", label: "Instagram Ad",        r: 210, startDeg:   0, dur: 200, dir:  1 },
    { icon: "🔍", label: "AI-Powered Search",   r: 210, startDeg: 120, dur: 200, dir:  1 },
    { icon: "💬", label: "Price-Drop SMS",      r: 185, startDeg: 240, dur: 200, dir:  1 },
    { icon: "🤖", label: "Shopper Agent",       r: 120, startDeg:  60, dur: 200, dir: -1 },
    { icon: "🛒", label: "Commerce Cloud",      r: 120, startDeg: 180, dur: 200, dir: -1 },
    { icon: "📧", label: "Post-Purchase Email", r: 100, startDeg: 300, dur: 200, dir: -1 },
  ],

  orbitCenter: { emoji: "🏠", label: "AT HOME" },

  orbitCopy: {
    eyebrow:  "One Connected Platform",
    headline: "Personalized at every<br/><span class=\"accent\">touchpoint.</span>",
    body:     "Marketing Cloud Personalization powers every channel — onsite banners, price-drop SMS, post-purchase email. Commerce Cloud's AI-powered search surfaces the right product. Agentforce closes the sale. All connected, all on Salesforce.",
    stats: [
      { val: "MCP",        label: "Personalization" },
      { val: "Commerce",   label: "AI Search"       },
      { val: "Agentforce", label: "Shopper Agent"   },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  //  DEMO ASSETS  →  Image paths used across demo slides
  //  ⚑ CLAUDE-GENERATED — update paths when assets change
  // ─────────────────────────────────────────────────────────────
  demoAssets: {
    storeExterior:     "assets/At-Home-stores-retail.png",
    storeInterior:     "assets/AtHomeStore.png",
    productHero:       "assets/barrett-storage-sectional-brown.jpg",
    iPhoneRec:         "assets/AtHome_iPhone_Rec.png",
    webBrowseGif:      "assets/AtHome_Generic_webBrowse.gif",
    laptopBrowsingGif: "assets/Laptop Happy Browsing.gif",
    macbookFrame:      "assets/macbook-transparent.png",
    iPhoneFrame:       "assets/iPhone16Pro_FRAME.png",
  },

  // ─────────────────────────────────────────────────────────────
  //  OPEN ITEMS  →  Pre-live checklist (does not affect rendering)
  // ─────────────────────────────────────────────────────────────
  openItems: [
    "Update presenter.name and presenter.title",
    "Replace all XX% / +$XX BVS placeholder values with real benchmarks",
    "Confirm scenes URLs are live and loading",
    "Add customer logo to assets/ and set brand.logoPath",
  ],

  // ─────────────────────────────────────────────────────────────
  //  BUILDER PLAN  →  Drives the Demo deck renderer
  //  ⚑ The Demo section reads builderPlan.slides[] and renders one
  //  asset-independent slide per entry. This default plan keeps the
  //  template self-demoing when /demo/ is opened directly.
  // ─────────────────────────────────────────────────────────────
  builderPlan: {
    audience:   "Mixed",
    salesStage: "Discovery",
    products:   ["Marketing Cloud", "Commerce Cloud", "Agentforce", "Data Cloud"],
    storyFoundations: {
      businessProblem:    "At Home knows their customers in stores but loses them online — every channel is a fresh start.",
      currentStatePain:   "Anonymous browsers, abandoned carts, and disconnected service touchpoints leave revenue on the table.",
      futureStateVision:  "One unified profile turns every channel into a continuation of the same customer relationship.",
      transformationThesis: "Identity + AI + agents = personalized, agentic commerce on a single platform.",
      executiveTakeaway:  "A single Salesforce platform compounds Marketing, Commerce, and Service into measurable lift.",
    },
    personas: [
      {
        name: "Rachel",
        role: "Holiday shopper turned loyalist",
        goals: "Refresh her home for the holidays without spending hours comparing stores online and in-app.",
        painPoints: "She browses on multiple devices and hates re-explaining her taste every time she switches channels.",
        demoRelevance: "Rachel's December store visit is the seed identity that powers six months of personalized, agentic engagement.",
      },
    ],
    storyActs: [
      { title: "In-store identity capture", channel: "POS", summary: "Rachel's first store visit creates a unified profile from a digital receipt.", salesforceCapabilities: "Data Cloud · Loyalty", businessValue: "Convert anonymous to known", demoMoment: "Email-on-receipt prompt" },
      { title: "Personalized website re-entry", channel: "Web", summary: "She returns online and the storefront greets her with the products she touched in-store.", salesforceCapabilities: "Commerce Cloud · MCP", businessValue: "+ session value", demoMoment: "Personalized hero" },
      { title: "Agentic SMS recovery", channel: "SMS", summary: "An agent reaches out via text when she abandons a cart with high intent signal.", salesforceCapabilities: "Agentforce · Marketing Cloud", businessValue: "Cart recovery", demoMoment: "Agent SMS thread" },
      { title: "Mobile app shopper agent", channel: "Mobile", summary: "She switches to the app where the shopper agent helps her finalize the order.", salesforceCapabilities: "Agentforce · Commerce", businessValue: "Conversion lift", demoMoment: "Agent chat to checkout" },
      { title: "Post-purchase loyalty", channel: "Email", summary: "After purchase, loyalty rewards and tailored follow-ups extend the relationship.", salesforceCapabilities: "Loyalty · MCP", businessValue: "Repeat AOV", demoMoment: "Branded confirmation email" },
    ],
    cxComponents: [],
    slides: [
      { order: 1, id: "demo-hero",       title: "Six months. One agentic journey.", layout: "hero",            sectionId: "demo", capabilities: ["Marketing Cloud", "Commerce Cloud", "Agentforce"] },
      { order: 2, id: "demo-foundation", title: "Why this matters",                  layout: "storyFoundation", sectionId: "demo" },
      { order: 3, id: "demo-timeline",   title: "Rachel's timeline",                 layout: "journeyTimeline", sectionId: "demo" },
      { order: 4, id: "demo-profile",    title: "One customer · many signals",       layout: "unifiedProfile",  sectionId: "demo" },
      { order: 5, id: "demo-agent",      title: "Agentforce · live moment",          layout: "agentConversation", sectionId: "demo" },
      { order: 6, id: "demo-arch",       title: "Platform map",                      layout: "architecture",    sectionId: "demo" },
      { order: 7, id: "demo-kpi",        title: "Why it matters",                    layout: "kpiScorecard",    sectionId: "demo" },
      { order: 8, id: "demo-exec",       title: "The takeaway",                      layout: "executiveSummary",sectionId: "demo" },
    ],
  },

};
