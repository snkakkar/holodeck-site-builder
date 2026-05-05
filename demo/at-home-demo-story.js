/**
 * At Home + Salesforce CX Vision Demo — Shared Story Config
 * Update presenterName / presenterTitle before each presentation.
 * TODO: Replace XX% placeholder BVS benchmark values with real numbers.
 *
 * CORE PRODUCT FOCUS:
 *   1. Marketing Cloud Personalization — onsite, in-app, email, SMS
 *   2. Agentforce Shopper Agent — conversational commerce on Commerce Cloud
 *   3. Cimulate — contextual AI search (acquired by Salesforce)
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
        tag: "AI SEARCH MATCH",
        detail: "Contextual search · weather-resistant",
        emoji: "⛱️",
      },
      {
        id: "lights",
        name: "Outdoor String Lights",
        tag: "COMPLETE THE LOOK",
        detail: "Added by Agentforce Shopper Agent",
        emoji: "✨",
      },
    ],
  },

  // 5-step journey — centered on MCP and Agentforce
  steps: [
    {
      id: 1,
      title: "Anticipate",
      badge: "MCP Audience Segmentation",
      headline: "Know Rachel before she arrives.",
      eyebrow: "MARKETING CLOUD PERSONALIZATION",
      description: "Rachel sees a personalized 4th of July patio promotion on Instagram, powered by MCP audience segments.",
      detail: "Marketing Cloud Personalization identifies Rachel as a high-propensity outdoor furniture buyer and serves a targeted promotion — the right message, at the right moment, before she ever visits the site.",
      technologies: ["Marketing Cloud Personalization", "Email", "SMS"],
      emoji: "📸",
      colorClass: "step-anticipate",
    },
    {
      id: 2,
      title: "Engage",
      badge: "Onsite Personalization",
      headline: "The site knows her before she logs in.",
      eyebrow: "MARKETING CLOUD PERSONALIZATION",
      description: "The At Home website adapts in real time to Rachel's outdoor entertaining intent — anonymous or known.",
      detail: "Marketing Cloud Personalization serves a personalized 4th of July hero banner, tailored patio recommendations, and AI-powered contextual search results the moment Rachel lands on the Commerce Cloud storefront.",
      technologies: ["Marketing Cloud Personalization", "Commerce Cloud"],
      emoji: "🛍️",
      colorClass: "step-engage",
    },
    {
      id: 3,
      title: "Guide",
      badge: "Agentforce Shopper Agent",
      headline: "The right message. Then the right agent.",
      eyebrow: "MCP MULTI-CHANNEL + AGENTFORCE",
      description: "A price-drop SMS brings Rachel back. The Agentforce Shopper Agent helps her build the perfect outdoor setup.",
      detail: "Marketing Cloud Personalization fires a proactive SMS when the Catalina Set price drops. Rachel opens the chat, meets the Agentforce Shopper Agent — asks about weather resistance, gets full product answers, and the agent builds her cart.",
      technologies: ["Marketing Cloud Personalization", "SMS", "Agentforce Shopper Agent"],
      emoji: "🤖",
      colorClass: "step-guide",
    },
    {
      id: 4,
      title: "Convert",
      badge: "Higher Conversion & AOV",
      headline: "One conversation. Full cart. Checkout.",
      eyebrow: "AGENTFORCE + COMMERCE CLOUD",
      description: "The Agentforce Shopper Agent bundles the patio set, umbrella, and string lights. Rachel checks out.",
      detail: "In a single agentic conversation on the Commerce Cloud storefront, the Shopper Agent builds Rachel's complete outdoor setup and guides her to checkout — or an exit-intent offer saves the sale with 10% off.",
      technologies: ["Agentforce Shopper Agent", "Commerce Cloud"],
      emoji: "✅",
      colorClass: "step-convert",
    },
    {
      id: 5,
      title: "Delight",
      badge: "Lifecycle Personalization",
      headline: "The journey doesn't end at checkout.",
      eyebrow: "MARKETING CLOUD PERSONALIZATION",
      description: "Rachel receives 'Top 5 Tips for Hosting the Ultimate 4th of July BBQ' — proactive, helpful, personal.",
      detail: "Marketing Cloud Personalization delivers a post-purchase email tied to her purchase context — outdoor entertaining content, complementary products, and care tips. Every interaction makes the next one smarter.",
      technologies: ["Marketing Cloud Personalization", "Email Automation"],
      emoji: "🌟",
      colorClass: "step-delight",
    },
  ],

  // Vignette / section intro slides
  vignetteSections: [
    {
      eyebrow: "MARKETING CLOUD PERSONALIZATION",
      title: "Anticipate & Engage",
      subtitle: "From anonymous interest to personalized onsite experience — before Rachel even identifies herself.",
    },
    {
      eyebrow: "AGENTFORCE SHOPPER AGENT",
      title: "Guide & Convert",
      subtitle: "The right re-engagement message, then the right AI agent to build the cart and close the sale.",
    },
    {
      eyebrow: "MARKETING CLOUD PERSONALIZATION",
      title: "Delight",
      subtitle: "Post-purchase personalization that builds loyalty and drives the next visit.",
    },
  ],

  platform: {
    title: "Salesforce Platform",
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

  technologies: [
    { label: "Marketing Cloud Personalization", description: "Real-time onsite, in-app, email, and SMS personalization — anonymous to known, always relevant." },
    { label: "Agentforce Shopper Agent",        description: "Conversational AI agent on the Commerce Cloud storefront — answers questions, builds carts, drives conversion." },
    { label: "Commerce Cloud",                  description: "Personalized storefront with AI-powered contextual search built in — from browse to checkout." },
    { label: "SMS & Email Automation",          description: "Proactive re-engagement and post-purchase nurture — price-drop alerts, hosting tips, lifecycle moments." },
    { label: "Onsite Personalization",          description: "Dynamic banners, product carousels, and recommendations that adapt in real time to shopper intent." },
    { label: "AI-Powered Search",               description: "Contextual search built into Commerce Cloud — surfaces the right product for every shopper intent." },
    { label: "Post-Purchase Nurture",           description: "Context-aware content and product recommendations that extend the relationship beyond the transaction." },
  ],

  demoStructure: [
    {
      part: 1,
      icon: "01",
      title: "Marketing Cloud Personalization",
      description: "See how MCP personalizes every touchpoint — Instagram ad, onsite hero, price-drop SMS, and post-purchase email — all from one platform.",
      tags: ["Onsite", "Email", "SMS", "In-App", "Anonymous → Known"],
    },
    {
      part: 2,
      icon: "02",
      title: "Agentforce Shopper Agent",
      description: "Meet the At Home Shopper Agent — a conversational AI built on Agentforce that answers product questions, recommends bundles, and builds carts.",
      tags: ["Agentforce", "Commerce Cloud", "Clicks not code", "GA today"],
    },
    {
      part: 3,
      icon: "03",
      title: "Commerce Cloud + AI Search",
      description: "See how AI-powered contextual search — built into Commerce Cloud — surfaces exactly the right products based on Rachel's intent, not just her keywords.",
      tags: ["Commerce Cloud", "AI Search", "Personalized Results"],
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
    agentDemo: null,        // TODO: add Agentforce Shopper Agent URL
  },

  openItems: [
    "Update presenterName and presenterTitle in at-home-demo-story.js",
    "Replace all XX% BVS benchmark placeholders with real numbers",
    "Add product images for Rachel's wishlist (Catalina Set, Umbrella, String Lights)",
    "Add Rachel persona lifestyle photo to Meet Rachel slide",
    "Confirm live demo URLs and add to liveLinks",
    "Confirm Cimulate demo availability and integration point",
    "Confirm Agentforce Shopper Agent demo URL on Commerce Cloud storefront",
  ],
};

if (typeof module !== "undefined") module.exports = AT_HOME_DEMO_STORY;
