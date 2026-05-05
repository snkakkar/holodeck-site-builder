/**
 * At Home + Salesforce CX Vision Demo — Shared Story Config
 * Update presenterName / presenterTitle before each presentation.
 * TODO: Replace XX% placeholder BVS benchmark values with real numbers.
 */
const AT_HOME_DEMO_STORY = {
  customerName: "At Home",
  demoTitle: "Salesforce CX Vision",
  demoTheme: "Agentic Retail Journey",
  presenterName: "[PRESENTER NAME]",       // TODO: update before presenting
  presenterTitle: "[TITLE], Salesforce",   // TODO: update before presenting

  persona: {
    name: "Rachel Morris",
    firstName: "Rachel",
    role: "Enthusiastic Entertainer",
    quote: "My 4th of July BBQ is the event of the summer. This year, I want the backyard to be perfect.",
    motivation: "Hosting her annual 4th of July barbecue — the highlight of her year.",
    need: "New patio furniture and outdoor decor for the ultimate summer entertaining setup.",
    urgency: "July 4th is approaching. The decision window is now.",
    retailOpportunity: "High-intent outdoor furniture shopper with clear seasonal urgency and emotional motivation.",
    stats: [
      { value: "4th of July", label: "The Event" },
      { value: "Annual", label: "BBQ Tradition" },
      { value: "High Intent", label: "Purchase Signal" },
    ],
    wishlist: [
      {
        id: "catalina",
        name: "Catalina Outdoor Set",
        tag: "PRIMARY CONSIDERATION",
        detail: "Saved to cart · price-drop trigger",
        emoji: "🪑",
      },
      {
        id: "umbrella",
        name: "Market Patio Umbrella",
        tag: "AI-RECOMMENDED",
        detail: "Weather-resistant · all-season",
        emoji: "⛱️",
      },
      {
        id: "lights",
        name: "Outdoor String Lights",
        tag: "COMPLETE THE LOOK",
        detail: "Added by AI Design Assistant",
        emoji: "✨",
      },
    ],
  },

  // 5-step journey (used by demo map and vignette)
  steps: [
    {
      id: 1,
      title: "Anticipate",
      badge: "Anonymous Personalization",
      headline: "Know Rachel before she knows you.",
      eyebrow: "DISCOVER INTENT",
      description: "Rachel sees a personalized 4th of July patio promotion on Instagram.",
      detail: "Data Cloud identifies Rachel as a high-propensity outdoor furniture buyer based on her browsing history — and serves the right ad at the right moment.",
      technologies: ["Data Cloud", "Marketing Cloud"],
      emoji: "📸",
      colorClass: "step-anticipate",
    },
    {
      id: 2,
      title: "Engage",
      badge: "Real-Time Commerce Personalization",
      headline: "The site knows her before she logs in.",
      eyebrow: "PERSONALIZE THE EXPERIENCE",
      description: "The At Home website adapts to Rachel's outdoor entertaining intent — even as an anonymous visitor.",
      detail: "B2C Commerce surfaces a personalized 4th of July hero banner and tailored patio recommendations. Rachel browses, finds the Catalina Outdoor Set, and saves it to her cart.",
      technologies: ["B2C Commerce", "MCP Recommendations", "Data Cloud"],
      emoji: "🛍️",
      colorClass: "step-engage",
    },
    {
      id: 3,
      title: "Guide",
      badge: "Conversational Shopping Guidance",
      headline: "The right message. Then the right agent.",
      eyebrow: "RE-ENGAGE & ASSIST",
      description: "A price-drop SMS brings Rachel back. The AI Design Assistant helps her choose the perfect outdoor setup.",
      detail: "Marketing Cloud fires a proactive SMS when the Catalina Set price drops. Rachel chats with Agentforce — asks about weather resistance, gets full product answers, and the agent builds her cart.",
      technologies: ["Marketing Cloud", "Agentforce", "MCP", "SMS"],
      emoji: "🤖",
      colorClass: "step-guide",
    },
    {
      id: 4,
      title: "Convert",
      badge: "Higher Conversion & AOV",
      headline: "One conversation. Full cart. Checkout.",
      eyebrow: "DRIVE THE PURCHASE",
      description: "The agent adds the patio set, umbrella, and string lights to cart. Rachel checks out.",
      detail: "The agent bundles the perfect outdoor set in one interaction. Rachel proceeds to checkout — or an exit-intent offer saves the sale with 10% off in 5 minutes.",
      technologies: ["Agentforce", "B2C Commerce"],
      emoji: "✅",
      colorClass: "step-convert",
    },
    {
      id: 5,
      title: "Delight",
      badge: "Lifecycle Engagement",
      headline: "The journey doesn't end at checkout.",
      eyebrow: "BUILD LOYALTY",
      description: "Rachel receives 'Top 5 Tips for Hosting the Ultimate 4th of July BBQ' — proactive, helpful, personal.",
      detail: "A follow-up email delivers hosting content tied to her purchase context. Agentforce isn't just reactive — it nurtures the customer relationship and drives lifetime value.",
      technologies: ["Marketing Cloud", "Email Automation"],
      emoji: "🌟",
      colorClass: "step-delight",
    },
  ],

  // Vignette / section intro slides
  vignetteSections: [
    {
      eyebrow: "PERSISTENT PERSONALIZATION",
      title: "Anticipate & Engage",
      subtitle: "From anonymous interest to personalized commerce — before Rachel even identifies herself.",
    },
    {
      eyebrow: "AGENTIC ASSISTANCE",
      title: "Guide & Convert",
      subtitle: "The right message at the right time, followed by the right agent to close the sale.",
    },
    {
      eyebrow: "LIFECYCLE ENGAGEMENT",
      title: "Delight",
      subtitle: "The relationship extends well beyond the transaction.",
    },
  ],

  platform: {
    title: "Salesforce Platform",
    subtitle: "AGENTFORCE TRUST LAYER · ALL CAPABILITIES GA · USED BY CUSTOMERS TODAY",
    capabilities: [
      "Data Cloud",
      "Agentforce",
      "B2C Commerce",
      "Marketing Cloud",
      "MCP & AI Recommendations",
      "SMS & Email Automation",
      "Personalization",
    ],
  },

  technologies: [
    { label: "Data Cloud",                description: "Unified customer profile from every signal and source — anonymous to known." },
    { label: "Agentforce",               description: "AI agents that act across channels, grounded in product data and customer context." },
    { label: "B2C Commerce",             description: "Personalized commerce experience — from anonymous browse to checkout." },
    { label: "Marketing Cloud",          description: "Right message, right channel, right moment — SMS, email, and beyond." },
    { label: "MCP & AI Recommendations", description: "Contextual product and content recommendations powered by AI." },
    { label: "SMS & Email Automation",   description: "Proactive re-engagement and post-purchase nurture at scale." },
    { label: "Personalization",          description: "Anonymous to known — always relevant, never generic." },
  ],

  demoStructure: [
    {
      part: 1,
      icon: "01",
      title: "AI-Driven Customer Journey",
      description: "Follow Rachel from personalized Instagram ad through the AI Design Assistant to checkout and post-purchase nurture.",
      tags: ["Instagram", "Website", "SMS", "AI Agent", "Email"],
    },
    {
      part: 2,
      icon: "02",
      title: "Connected Data Foundation",
      description: "See how Data Cloud unifies every signal — browsing, ad click, cart save, SMS, agent chat — into one living customer profile.",
      tags: ["Data Cloud", "360° customer view", "Real-time activation"],
    },
    {
      part: 3,
      icon: "03",
      title: "Agent Creation with Clicks, Not Code",
      description: "See how the At Home AI Design Assistant was built on Agentforce — grounded in product data, deployed without engineering.",
      tags: ["Agentforce", "Clicks not code", "No new infrastructure"],
    },
  ],

  // TODO: Replace XX% values with real BVS benchmarks before presenting
  bvsMetrics: [
    { icon: "↑", value: "XX%", label: "Conversion Lift" },
    { icon: "💳", value: "+$XX", label: "Average Order Value" },
    { icon: "★", value: "XX%", label: "Loyalty Enrollment" },
    { icon: "🔄", value: "XXx", label: "Repeat Purchase Rate" },
    { icon: "⚡", value: "XX%", label: "Service Efficiency" },
  ],

  liveLinks: {
    atHomeWebsite: null,    // TODO: add live At Home demo site URL
    instagramWrapper: null, // TODO: add Instagram wrapper app URL
    agentDemo: null,        // TODO: add Agentforce AI Design Assistant URL
  },

  openItems: [
    "Update presenterName and presenterTitle in at-home-demo-story.js",
    "Replace all XX% BVS benchmark placeholders with real numbers",
    "Add product images for Rachel's wishlist (Catalina Set, Umbrella, String Lights)",
    "Add Rachel persona lifestyle photo to Meet Rachel slide",
    "Confirm live demo URLs and add to liveLinks",
    "Confirm whether Exit Intent checkout banner is a Shopper Agent (per script note)",
    "CapGemini architecture alignment with At Home Stores LLC team",
  ],
};

if (typeof module !== "undefined") module.exports = AT_HOME_DEMO_STORY;
