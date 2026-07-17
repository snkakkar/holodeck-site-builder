/* =====================================================================
   app-config.js — Cimulate search demo DATA LAYER (config-driven)
   Default = Total Wine data. The builder regenerates this file per
   customer; its shape is the contract. All product imagery is
   procedural SVG (productImages is empty by default → SVG fallback).
   ===================================================================== */

window.APP_CONFIG = {
  brand: {
    logoTop: "Total Wine",
    logoSub: "& More",
    conciergeName: "Somm",
    conciergeSub: "Your Total Wine concierge",
    searchProduct: "Cimulate",
    // Brand tokens (defaults = Total Wine teal/gold). Map to CSS :root --app-* vars.
    colors: {
      primary:   "#008573",
      primaryDk: "#016d5e",
      primaryDeep: "#013b35",
      accent:    "#b8975a",
      promo:     "#e01a2b",
      promoDk:   "#b8121f",
    },
  },
  storeLocation: "Modesto, CA",

  products: [
    // ---- WINE ----
    { id:"caymus", cat:"Wine", name:"Caymus Cabernet Sauvignon", type:"Cabernet Sauvignon", region:"Napa Valley, CA", vintage:"2021",
      price:89.99, rating:94, ratingSource:"Wine Enthusiast", badge:"BOLD RED",
      notes:"Ripe blackberry, cassis & vanilla oak. Plush, full-bodied, velvety tannins — a benchmark steak-night Napa Cab.",
      pairings:["Ribeye steak","Braised short rib","Aged cheddar"], flavors:["bold","full-bodied","dark fruit"], abv:"14.8%",
      capsuleColor:"#3a0d12", capsuleShine:"#6b1f2a", glassColor:"#2a0a10" },
    { id:"silveroak", cat:"Wine", name:"Silver Oak Alexander Valley Cabernet", type:"Cabernet Sauvignon", region:"Alexander Valley, CA", vintage:"2019",
      price:79.99, rating:93, ratingSource:"Wine Spectator", badge:"BOLD RED",
      notes:"Cedar, black cherry & sweet American oak. Elegant, structured & polished — impresses without shouting.",
      pairings:["Grilled steak","Lamb chops","Portobello"], flavors:["bold","structured","oak"], abv:"14.5%",
      capsuleColor:"#4a1018", capsuleShine:"#8b2535", glassColor:"#2a0a10" },
    { id:"meiomi", cat:"Wine", name:"Meiomi Pinot Noir", type:"Pinot Noir", region:"California", vintage:"2022",
      price:24.99, rating:90, ratingSource:"Wine Spectator", badge:"POPULAR",
      notes:"Bright cherry, mocha & toasted oak with a smooth, silky finish. Approachable & food-friendly.",
      pairings:["Grilled salmon","Roast chicken","Charcuterie"], flavors:["smooth","fruit-forward"], abv:"13.7%",
      capsuleColor:"#4a1018", capsuleShine:"#8b2535", glassColor:"#3a0d12" },
    { id:"cakebread", cat:"Wine", name:"Cakebread Cellars Chardonnay", type:"Chardonnay", region:"Napa Valley, CA", vintage:"2022",
      price:52.99, rating:92, ratingSource:"Wine Enthusiast", badge:"CRISP WHITE",
      notes:"Green apple, lemon curd & a creamy, subtly-oaked texture. Crisp acidity, lingering mineral finish.",
      pairings:["Lobster","Roast chicken","Brie","Seafood pasta"], flavors:["crisp","white","citrus"], abv:"14.0%",
      capsuleColor:"#0a5d54", capsuleShine:"#12857a", glassColor:"#3f5f2a" },
    { id:"kimcrawford", cat:"Wine", name:"Kim Crawford Sauvignon Blanc", type:"Sauvignon Blanc", region:"Marlborough, NZ", vintage:"2023",
      price:16.99, rating:90, ratingSource:"Wine Enthusiast", badge:"SUMMER SIP",
      notes:"Zesty grapefruit, passionfruit & fresh-cut herbs. Bright, crisp & thirst-quenching — built for warm afternoons & seafood.",
      pairings:["Oysters","Ceviche","Grilled shrimp","Goat cheese"], flavors:["crisp","white","citrus","summer","seafood"], abv:"13.0%",
      capsuleColor:"#0a5d54", capsuleShine:"#2bb39e", glassColor:"#4f6f2f" },
    { id:"veuve", cat:"Wine", name:"Veuve Clicquot Brut Yellow Label", type:"Champagne", region:"Reims, France", vintage:"NV",
      price:64.99, rating:93, ratingSource:"Wine Spectator", badge:"CELEBRATION",
      notes:"Toasted brioche, white peach & citrus with a fine, persistent mousse. Crisp, dry & celebratory.",
      pairings:["Oysters","Fried chicken","Aged comté","Sushi"], flavors:["crisp","celebration","citrus"], abv:"12.0%",
      capsuleColor:"#b8975a", capsuleShine:"#e4cf95", glassColor:"#2f5f2a" },

    // ---- SPIRITS ----
    { id:"hakushu", cat:"Spirits", name:"Hakushu Distiller's Reserve", type:"Japanese Single Malt Whisky", region:"Yamanashi, Japan", vintage:"NV",
      price:74.99, rating:92, ratingSource:"Whisky Advocate", badge:"SMOKY",
      notes:"Delicate green-apple freshness laced with gentle peat smoke, pine & mint. A refined, lightly smoky Japanese malt.",
      pairings:["Grilled fish","Smoked cheese","Dark chocolate"], flavors:["smoky","japanese","whisky","peat"], abv:"43%",
      capsuleColor:"#2a3d1f", capsuleShine:"#4f7033", glassColor:"#3b5e1a", squat:true },
    { id:"nikka", cat:"Spirits", name:"Nikka Yoichi Single Malt", type:"Japanese Single Malt Whisky", region:"Hokkaido, Japan", vintage:"NV",
      price:69.99, rating:91, ratingSource:"Whisky Advocate", badge:"SMOKY",
      notes:"Coastal peat smoke, brine & baked apple from Nikka's Yoichi distillery — bold, smoky & distinctly Japanese.",
      pairings:["BBQ","Aged gouda","Grilled meats"], flavors:["smoky","japanese","whisky","peat","coastal"], abv:"45%",
      capsuleColor:"#1f1f1f", capsuleShine:"#4a4a4a", glassColor:"#25150a", squat:true },
    { id:"macallan18", cat:"Spirits", name:"The Macallan 18 Sherry Oak", type:"Single Malt Scotch", region:"Speyside, Scotland", vintage:"18 Yr",
      price:399.99, rating:95, ratingSource:"Whisky Advocate", badge:"GRAND RESERVE",
      notes:"Dried fruit, clove & rich sherry sweetness with wood smoke & a long, warming finish.",
      pairings:["Dark chocolate","Aged cheese","Dried figs"], flavors:["smoky","whisky","sherry","aged"], abv:"43%",
      capsuleColor:"#3a2a10", capsuleShine:"#6b4f1f", glassColor:"#5a2f0a", squat:true },
    { id:"casamigos", cat:"Spirits", name:"Casamigos Reposado Tequila", type:"Reposado Tequila", region:"Jalisco, Mexico", vintage:"NV",
      price:54.99, rating:90, ratingSource:"Tasting Panel", badge:"CROWD FAVORITE",
      notes:"Caramel, cocoa & soft oak from 7 months in barrel. Smooth enough to sip, smart in a cocktail.",
      pairings:["Tacos","Grilled corn","Lime"], flavors:["smooth","agave","cocktail"], abv:"40%",
      capsuleColor:"#8b6a2a", capsuleShine:"#c9a24b", glassColor:"#c9c4b5", squat:true },
    { id:"teremanarepo", cat:"Spirits", name:"Teremana Reposado Tequila", type:"Reposado Tequila", region:"Jalisco, Mexico", vintage:"NV",
      price:39.99, rating:91, ratingSource:"Tasting Panel", badge:"CELEBRITY BRAND", celebrity:"Dwayne Johnson",
      notes:"Dwayne “The Rock” Johnson's small-batch tequila. Rested in oak for vanilla, cooked agave & a smooth, honeyed finish.",
      pairings:["Tacos","Grilled steak","Lime"], flavors:["smooth","agave","cocktail","sipping"], abv:"40%",
      capsuleColor:"#4a6b3a", capsuleShine:"#7aa855", glassColor:"#d8d2c2", squat:true },
    { id:"teremanablanco", cat:"Spirits", name:"Teremana Blanco Tequila", type:"Blanco Tequila", region:"Jalisco, Mexico", vintage:"NV",
      price:29.99, rating:90, ratingSource:"Tasting Panel", badge:"CELEBRITY BRAND", celebrity:"Dwayne Johnson",
      notes:"The Rock's crisp, unaged blanco — bright citrus, fresh agave & a clean finish. Built for a top-shelf margarita.",
      pairings:["Margaritas","Ceviche","Guacamole"], flavors:["crisp","agave","cocktail"], abv:"40%",
      capsuleColor:"#4a6b3a", capsuleShine:"#7aa855", glassColor:"#e6e2d6", squat:true },
    { id:"teremanaanejo", cat:"Spirits", name:"Teremana Añejo Tequila", type:"Añejo Tequila", region:"Jalisco, Mexico", vintage:"NV",
      price:54.99, rating:92, ratingSource:"Tasting Panel", badge:"CELEBRITY BRAND", celebrity:"Dwayne Johnson",
      notes:"Dwayne Johnson's barrel-aged añejo — caramel, toasted oak & warm spice from extended rest. A refined sipper.",
      pairings:["Grilled steak","Mole","Dark chocolate"], flavors:["smooth","agave","sipping"], abv:"40%",
      capsuleColor:"#4a6b3a", capsuleShine:"#7aa855", glassColor:"#c9a86a", squat:true },

    // ---- BEER ----
    { id:"sierraneva", cat:"Beer", name:"Sierra Nevada Hazy Little Thing IPA", type:"Hazy IPA · 6-pack", region:"Chico, CA", vintage:"",
      price:11.99, rating:89, ratingSource:"BeerAdvocate", badge:"PARTY READY",
      notes:"Juicy tropical hops, soft body & low bitterness. Easy-drinking, crushable & a guaranteed party crowd-pleaser.",
      pairings:["Burgers","Tacos","Wings"], flavors:["ipa","craft","party","easy-drinking","hoppy"], abv:"6.7%",
      capsuleColor:"#c47d1a", capsuleShine:"#f0a936", glassColor:"#c98a1a", can:true },
    { id:"voodoo", cat:"Beer", name:"Bell's Two Hearted Ale", type:"American IPA · 6-pack", region:"Kalamazoo, MI", vintage:"",
      price:12.99, rating:92, ratingSource:"BeerAdvocate", badge:"TOP RATED",
      notes:"All-Centennial hops deliver bright pine & grapefruit over a smooth malt base. A benchmark, balanced IPA.",
      pairings:["Pizza","Grilled chicken","Sharp cheddar"], flavors:["ipa","craft","party","hoppy","balanced"], abv:"7.0%",
      capsuleColor:"#a4192c", capsuleShine:"#d6394b", glassColor:"#b8551a", can:true },
    { id:"stellabeer", cat:"Beer", name:"Stella Artois Lager", type:"Belgian Lager · 12-pack", region:"Leuven, Belgium", vintage:"",
      price:16.99, rating:86, ratingSource:"BeerAdvocate", badge:"CLASSIC",
      notes:"Crisp, clean & lightly floral. The easy-drinking European lager that suits any gathering.",
      pairings:["Mussels","Fries","Light apps"], flavors:["lager","crisp","party","easy-drinking"], abv:"5.0%",
      capsuleColor:"#c9a24b", capsuleShine:"#e4cf95", glassColor:"#c98a1a", can:true },

    // ---- WINE (added) ----
    { id:"josephphelps", cat:"Wine", name:"Joseph Phelps Insignia", type:"Bordeaux Red Blend", region:"Napa Valley, CA", vintage:"2019",
      price:129.99, rating:97, ratingSource:"Wine Spectator", badge:"COLLECTOR",
      notes:"Cassis, espresso & graphite framed by fine-grained tannins. A cellar-worthy Napa icon — powerful yet polished.",
      pairings:["Prime rib","Venison","Aged gouda"], flavors:["bold","full-bodied","dark fruit","structured","oak"], abv:"14.5%",
      capsuleColor:"#2a0a10", capsuleShine:"#6b1f2a", glassColor:"#22070c" },
    { id:"orinswift", cat:"Wine", name:"Orin Swift Papillon", type:"Bordeaux Red Blend", region:"Napa Valley, CA", vintage:"2021",
      price:84.99, rating:93, ratingSource:"Wine Enthusiast", badge:"BOLD RED",
      notes:"Lush black plum, mocha & sweet spice. A hedonistic, full-throttle Napa blend with a velvety finish.",
      pairings:["Braised beef","Lamb","Blue cheese"], flavors:["bold","full-bodied","dark fruit","oak"], abv:"15.2%",
      capsuleColor:"#1a1a1a", capsuleShine:"#4a4a4a", glassColor:"#22070c" },
    { id:"duckhorn", cat:"Wine", name:"Duckhorn Napa Valley Merlot", type:"Merlot", region:"Napa Valley, CA", vintage:"2020",
      price:59.99, rating:92, ratingSource:"Wine Enthusiast", badge:"BOLD RED",
      notes:"Plush black cherry, cocoa & baking spice. Supple, rounded tannins — a benchmark California Merlot.",
      pairings:["Roast pork","Mushroom risotto","Brie"], flavors:["bold","dark fruit","smooth","oak"], abv:"14.5%",
      capsuleColor:"#3a0d12", capsuleShine:"#6b1f2a", glassColor:"#2a0a10" },
    { id:"austinhope", cat:"Wine", name:"Austin Hope Cabernet Sauvignon", type:"Cabernet Sauvignon", region:"Paso Robles, CA", vintage:"2021",
      price:49.99, rating:93, ratingSource:"Wine Enthusiast", badge:"BOLD RED",
      notes:"Bold blackberry, vanilla & toasted oak with a rich, mouth-coating finish. A crowd-pleasing Paso powerhouse.",
      pairings:["Ribeye","BBQ brisket","Aged cheddar"], flavors:["bold","full-bodied","dark fruit","oak"], abv:"15.0%",
      capsuleColor:"#2a0a10", capsuleShine:"#5a151f", glassColor:"#22070c" },
    { id:"lacrema", cat:"Wine", name:"La Crema Sonoma Coast Pinot Noir", type:"Pinot Noir", region:"Sonoma Coast, CA", vintage:"2022",
      price:29.99, rating:90, ratingSource:"Wine Spectator", badge:"POPULAR",
      notes:"Bright red cherry, baking spice & a silky, cool-climate finish. Elegant and endlessly food-friendly.",
      pairings:["Salmon","Duck","Mushrooms"], flavors:["smooth","fruit-forward","bold"], abv:"13.9%",
      capsuleColor:"#4a1018", capsuleShine:"#8b2535", glassColor:"#3a0d12" },
    { id:"sonomacutrer", cat:"Wine", name:"Sonoma-Cutrer Russian River Chardonnay", type:"Chardonnay", region:"Russian River, CA", vintage:"2022",
      price:27.99, rating:91, ratingSource:"Wine Enthusiast", badge:"CRISP WHITE",
      notes:"Green apple, pear & subtle toasty oak with bright acidity. A polished, food-friendly California Chardonnay.",
      pairings:["Roast chicken","Crab","Creamy pasta"], flavors:["crisp","white","citrus"], abv:"13.5%",
      capsuleColor:"#0a5d54", capsuleShine:"#12857a", glassColor:"#4f6f2f" },
    { id:"whitehaven", cat:"Wine", name:"Whitehaven Sauvignon Blanc", type:"Sauvignon Blanc", region:"Marlborough, NZ", vintage:"2023",
      price:18.99, rating:90, ratingSource:"Wine Spectator", badge:"SUMMER SIP",
      notes:"Vivid passionfruit, lime & fresh herbs. Zesty, crisp & bright — a warm-weather seafood natural.",
      pairings:["Oysters","Ceviche","Goat cheese","Grilled shrimp"], flavors:["crisp","white","citrus","summer","seafood"], abv:"13.0%",
      capsuleColor:"#0a5d54", capsuleShine:"#2bb39e", glassColor:"#4f6f2f" },
    { id:"santamargherita", cat:"Wine", name:"Santa Margherita Pinot Grigio", type:"Pinot Grigio", region:"Alto Adige, Italy", vintage:"2023",
      price:26.99, rating:89, ratingSource:"Wine Enthusiast", badge:"CRISP WHITE",
      notes:"Crisp Golden Delicious apple, citrus & a clean mineral finish. The benchmark Italian Pinot Grigio.",
      pairings:["Antipasti","Seafood risotto","Light salads"], flavors:["crisp","white","citrus","summer"], abv:"12.5%",
      capsuleColor:"#0a5d54", capsuleShine:"#12857a", glassColor:"#5a7a3a" },
    { id:"whisperingangel", cat:"Wine", name:"Whispering Angel Rosé", type:"Provence Rosé", region:"Côtes de Provence, France", vintage:"2023",
      price:22.99, rating:90, ratingSource:"Wine Spectator", badge:"SUMMER SIP",
      notes:"Delicate strawberry, peach & citrus with a dry, crisp finish. The definitive pale Provence rosé.",
      pairings:["Salads","Grilled shrimp","Charcuterie"], flavors:["crisp","summer","citrus","rosé"], abv:"13.0%",
      capsuleColor:"#e8b7b0", capsuleShine:"#f6d9d4", glassColor:"#e9c9c2" },

    // ---- SPIRITS (added) ----
    { id:"toki", cat:"Spirits", name:"Suntory Toki Japanese Whisky", type:"Japanese Blended Whisky", region:"Japan", vintage:"NV",
      price:39.99, rating:88, ratingSource:"Whisky Advocate", badge:"SMOKY",
      notes:"Bright grapefruit, green apple & a whisper of white pepper with gentle smoke. A light, versatile Japanese blend.",
      pairings:["Yakitori","Sushi","Light cheese"], flavors:["smoky","japanese","whisky"], abv:"43%",
      capsuleColor:"#c9c4b5", capsuleShine:"#e8e4d8", glassColor:"#b9932f", squat:true },
    { id:"yamazaki12", cat:"Spirits", name:"The Yamazaki 12 Year Single Malt", type:"Japanese Single Malt Whisky", region:"Osaka, Japan", vintage:"12 Yr",
      price:174.99, rating:96, ratingSource:"Whisky Advocate", badge:"GRAND RESERVE",
      notes:"Honeyed peach, mizunara oak & delicate incense smoke. Japan's benchmark single malt — refined and layered.",
      pairings:["Dark chocolate","Dried fruit","Aged cheese"], flavors:["smoky","japanese","whisky","aged","peat"], abv:"43%",
      capsuleColor:"#3a2a10", capsuleShine:"#6b4f1f", glassColor:"#6a3a12", squat:true },
    { id:"lagavulin16", cat:"Spirits", name:"Lagavulin 16 Year", type:"Islay Single Malt Scotch", region:"Islay, Scotland", vintage:"16 Yr",
      price:109.99, rating:95, ratingSource:"Whisky Advocate", badge:"SMOKY",
      notes:"Intense peat smoke, sea salt & rich dried fruit. A towering, smoky Islay classic for the peat lover.",
      pairings:["Blue cheese","Smoked salmon","Dark chocolate"], flavors:["smoky","whisky","peat","aged"], abv:"43%",
      capsuleColor:"#1f1f1f", capsuleShine:"#4a4a4a", glassColor:"#4a2708", squat:true },
    { id:"titos", cat:"Spirits", name:"Tito's Handmade Vodka", type:"Vodka", region:"Austin, TX", vintage:"NV",
      price:24.99, rating:87, ratingSource:"Tasting Panel", badge:"CROWD FAVORITE",
      notes:"Clean, smooth & subtly sweet corn-based vodka. America's go-to for a crisp cocktail or a simple soda.",
      pairings:["Cocktails","Citrus","Olives"], flavors:["smooth","clean","cocktail"], abv:"40%",
      capsuleColor:"#1f4a6b", capsuleShine:"#3a79a8", glassColor:"#cfd6d9", squat:true },

    // ---- BEER (added) ----
    { id:"lagunitas", cat:"Beer", name:"Lagunitas IPA", type:"American IPA · 6-pack", region:"Petaluma, CA", vintage:"",
      price:10.99, rating:90, ratingSource:"BeerAdvocate", badge:"PARTY READY",
      notes:"Bright citrus & pine hops over a caramel malt backbone. Well-balanced, sessionable & a proven party staple.",
      pairings:["Wings","Burgers","Nachos"], flavors:["ipa","craft","party","easy-drinking","hoppy","balanced"], abv:"6.2%",
      capsuleColor:"#c47d1a", capsuleShine:"#f0a936", glassColor:"#c98a1a", can:true },
    { id:"newbelgium", cat:"Beer", name:"New Belgium Voodoo Ranger Juicy Haze IPA", type:"Hazy IPA · 6-pack", region:"Fort Collins, CO", vintage:"",
      price:11.99, rating:89, ratingSource:"BeerAdvocate", badge:"PARTY READY",
      notes:"Juicy tropical & citrus hops with a soft, hazy body. Smooth, low-bitterness & built for easy party drinking.",
      pairings:["Tacos","Fried chicken","Sharp cheese"], flavors:["ipa","craft","party","easy-drinking","hoppy"], abv:"7.5%",
      capsuleColor:"#e08a1a", capsuleShine:"#f7b64a", glassColor:"#c98a1a", can:true },
    { id:"modelo", cat:"Beer", name:"Modelo Especial", type:"Mexican Lager · 12-pack", region:"Mexico", vintage:"",
      price:16.99, rating:85, ratingSource:"BeerAdvocate", badge:"CLASSIC",
      notes:"Crisp, clean & lightly sweet with a smooth finish. The easy-drinking golden lager for any gathering.",
      pairings:["Tacos","Ceviche","Grilled corn"], flavors:["lager","crisp","party","easy-drinking"], abv:"4.4%",
      capsuleColor:"#c9a24b", capsuleShine:"#e4cf95", glassColor:"#d0a83a", can:true },
    { id:"bluemoon", cat:"Beer", name:"Blue Moon Belgian White", type:"Belgian Witbier · 6-pack", region:"Colorado", vintage:"",
      price:10.99, rating:84, ratingSource:"BeerAdvocate", badge:"EASY DRINKING",
      notes:"Orange peel & coriander over a smooth wheat body. Refreshing, approachable & perfect over a slice of orange.",
      pairings:["Salads","Fish tacos","Fruit"], flavors:["craft","party","easy-drinking","wheat"], abv:"5.4%",
      capsuleColor:"#1f4a8b", capsuleShine:"#3a79c8", glassColor:"#c9a24b", can:true },
  ],

  profile: {
    name:"Lauren", tier:"Premium", store:"Modesto, CA",
    affinities:["Bold red wines","Japanese & smoky whisky","Crisp whites","Entertaining & dinner parties"],
    recent:["Caymus Cabernet (Nov)","Hakushu Distiller's Reserve (Sep)","Veuve Clicquot (Aug)"],
  },

  /* Celebrity → owned brand mapping. Cimulate recognizes the person and surfaces
     their spirits line even though the query names no product or category. */
  celebs: [
    { match:["dwayne johnson","the rock","dwayne","dj johnson"], name:"Dwayne “The Rock” Johnson",
      brand:"Teremana", ids:["teremanablanco","teremanarepo","teremanaanejo"],
      blurb:"Cimulate recognized <b>Dwayne “The Rock” Johnson</b> as a person and connected him to his own tequila label, <b>Teremana</b> — no product keyword required." },
  ],

  // Photo map {id: url}. Empty by default → procedural SVG fallback.
  productImages: {},
};

/* =====================================================================
   BUILDER PREVIEW OVERRIDE (R3/R4)
   When this app is previewed inside the Holodeck builder, the builder
   writes a generated, per-customer config into sessionStorage under
   "holo-appconfig-<token>" and loads the iframe with "?holo=<token>".
   If that override exists we replace the default APP_CONFIG with it, so
   the same template renders the customer's data. No effect standalone
   or in the exported ZIP (where a real generated app-config.js ships).
   ===================================================================== */
(function () {
  try {
    var m = /[?&]holo=([^&]+)/.exec(window.location.search);
    if (!m) return;
    var raw = window.sessionStorage.getItem("holo-appconfig-" + decodeURIComponent(m[1]));
    if (!raw) return;
    var override = JSON.parse(raw);
    if (override && typeof override === "object") window.APP_CONFIG = override;
  } catch (e) { /* fall back to the default config */ }
})();

/* =====================================================================
   HELPERS (defined on window so app.js can use them; loaded first)
   ===================================================================== */
window.money = (n)=>"$"+Number(n).toFixed(2).replace(/\.00$/,".00");
window.esc = (s)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
window.byId = (id)=>APP_CONFIG.products.find(p=>p.id===id);

/* =====================================================================
   PROCEDURAL PRODUCT SVG — shape varies by category, styled on-brand
   (extended from total-wine-clienteling/data.js)
   ===================================================================== */
window.productSVG = function(p, w=80, h=232){
  const cap=p.capsuleColor||"#083b36", shine=p.capsuleShine||"#0a5d54";
  const uid="s"+String(p.id).replace(/\W/g,"");
  const INTER="Inter,system-ui,sans-serif", FRAU="Fraunces,Georgia,serif";
  const shape = p.can ? "can" : (p.cat==="Spirits" ? (p.spiritShape||"whisky") : (p.cat==="Beer"?"beerbottle":"wine"));

  // Glass tint by category — spirits read amber/clear (not port-red).
  const glass = p.glassColor || (
    p.cat==="Spirits" ? "#7a4a12" :   // amber whisky/tequila glass
    p.cat==="Beer"    ? "#5a3410" :   // brown beer glass
    "#3a0d12");                        // wine

  // Label text: the PRODUCT name — brand line + descriptor + vintage/abv.
  // No "TOTAL WINE" text; the label just names the spirit/wine itself.
  const words=(p.name||"").split(" ");
  const brandTop=(words.slice(0,2).join(" ")).toUpperCase();   // e.g. "THE MACALLAN"
  const brandBot=words.slice(2).join(" ");                     // e.g. "18 Sherry Oak"
  const label=(p.region||"").split(",")[0]||"";
  const sub=brandBot || (p.type||"");
  const meta=p.vintage||p.abv||"";

  // truncate to a character budget so text never exceeds the label width
  const fit=(s,n)=>{ s=String(s); return s.length>n ? s.slice(0,Math.max(1,n-1)).trim()+"…" : s; };

  const defs=`<defs>
    <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".30"/>
      <stop offset=".14" stop-color="${glass}"/>
      <stop offset=".32" stop-color="#fff" stop-opacity=".55"/>
      <stop offset=".46" stop-color="${glass}"/>
      <stop offset="1" stop-color="#000" stop-opacity=".34"/>
    </linearGradient>
    <linearGradient id="${uid}c" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".3"/>
      <stop offset=".18" stop-color="${cap}"/>
      <stop offset=".45" stop-color="${shine}"/>
      <stop offset=".7" stop-color="${cap}"/>
      <stop offset="1" stop-color="#000" stop-opacity=".35"/>
    </linearGradient>
  </defs>`;

  // Self-contained paper label. Char budgets are derived from label width so
  // text is guaranteed to sit inside the label — nothing spills over the glass.
  // charBudget ≈ label width / (fontSize * avg glyph aspect ~0.55)
  const labelBlock=(x,y,ww,hh)=>{
    const cx=x+ww/2, pad=3;
    const nBrand = Math.floor((ww-2*pad)/(6.6*0.58)); // Fraunces caps ~0.58 aspect
    const nRegion= Math.floor((ww-2*pad)/(4.2*0.62)); // Inter caps
    const nSub   = Math.floor((ww-2*pad)/(6*0.52));    // Fraunces italic
    let ty=y+13;
    let out=`<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="2.5" fill="#f6f1e8" stroke="#e3d9c4" stroke-width=".6"/>`;
    // brand name (the product itself) — the hero line of the label
    out+=`<text x="${cx}" y="${ty}" text-anchor="middle" font-family="${FRAU}" font-size="6.6" font-weight="700" letter-spacing=".3" fill="#2c2826">${esc(fit(brandTop,nBrand))}</text>`;
    ty+=5; out+=`<line x1="${x+ww*0.3}" y1="${ty-2.5}" x2="${x+ww*0.7}" y2="${ty-2.5}" stroke="#b8975a" stroke-width=".7"/>`;
    if(label){ ty+=8; out+=`<text x="${cx}" y="${ty}" text-anchor="middle" font-family="${INTER}" font-size="4.2" letter-spacing=".4" fill="#8a8378">${esc(fit(label.toUpperCase(),nRegion))}</text>`; }
    if(sub){ ty+=8.5; out+=`<text x="${cx}" y="${ty}" text-anchor="middle" font-family="${FRAU}" font-size="6" font-style="italic" fill="#4a4640">${esc(fit(sub,nSub))}</text>`; }
    if(meta){ ty+=8.5; out+=`<text x="${cx}" y="${ty}" text-anchor="middle" font-family="${INTER}" font-size="5" font-weight="600" fill="#b8975a">${esc(fit(meta,10))}</text>`; }
    return out;
  };

  const shadow=`<ellipse cx="40" cy="227" rx="24" ry="4.2" fill="#000" opacity=".14"/>`;
  const gloss=(x,y,hh)=>`<rect x="${x}" y="${y}" width="3" height="${hh}" rx="1.5" fill="#fff" opacity=".45"/>`;

  let art;
  if(shape==="can"){ // beer / seltzer can — straight sides, rounded rim
    art=`${shadow}
      <rect x="24" y="20" width="32" height="196" rx="3" fill="url(#${uid}g)"/>
      <path d="M25 20 Q25 15 29 15 L51 15 Q55 15 55 20 Z" fill="url(#${uid}c)"/>
      <rect x="24" y="14.5" width="32" height="4" rx="2" fill="#cfcfcf"/>
      <rect x="24" y="212" width="32" height="4.5" rx="2" fill="#000" opacity=".2"/>
      ${gloss(29,22,190)}
      ${labelBlock(25,60,30,118)}`;
  } else if(shape==="whisky"){ // whisky/bourbon/tequila — classic squared decanter: short neck, flat wide shoulders
    art=`${shadow}
      <!-- short neck + collar + cap -->
      <rect x="35" y="34" width="10" height="20" fill="url(#${uid}g)"/>
      <rect x="34" y="30" width="12" height="5" rx="1" fill="#000" opacity=".18"/>
      <rect x="33" y="20" width="14" height="13" rx="1.2" fill="url(#${uid}c)"/>
      <rect x="32.5" y="17" width="15" height="4" rx="1.2" fill="${cap}"/>
      <!-- broad flat shoulders, straight sides, gently rounded base -->
      <path d="M20 60 Q20 54 30 53 L50 53 Q60 54 60 60 L60 208 Q60 217 51 217 L29 217 Q20 217 20 208 Z" fill="url(#${uid}g)"/>
      <!-- warm amber liquid fill to read as whisky, not port -->
      <path d="M21 96 L59 96 L59 207 Q59 216 51 216 L29 216 Q21 216 21 207 Z" fill="#c17a1e" opacity=".34"/>
      <line x1="21" y1="96" x2="59" y2="96" stroke="#e0a24a" stroke-width="1" opacity=".5"/>
      ${gloss(25,60,150)}
      ${labelBlock(24,116,32,88)}`;
  } else if(shape==="gin"){ // gin/vodka — tall, narrow, rounded shoulder
    art=`${shadow}
      <rect x="35" y="18" width="10" height="34" fill="url(#${uid}g)"/>
      <rect x="34" y="10" width="12" height="12" rx="1.5" fill="url(#${uid}c)"/>
      <path d="M35 50 Q35 60 30 68 Q26 74 26 88 L26 206 Q26 217 36 217 L44 217 Q54 217 54 206 L54 88 Q54 74 50 68 Q45 60 45 50 Z" fill="url(#${uid}g)"/>
      ${gloss(31,74,128)}
      ${labelBlock(28,118,24,82)}`;
  } else if(shape==="beerbottle"){ // long-neck beer bottle
    art=`${shadow}
      <rect x="35" y="24" width="10" height="52" fill="url(#${uid}g)"/>
      <path d="M35 20 L45 20 L44 26 L36 26 Z" fill="url(#${uid}c)"/>
      <rect x="34.5" y="16" width="11" height="6" rx="2" fill="${cap}"/>
      <path d="M35 74 Q35 86 27 96 Q22 102 22 116 L22 208 Q22 218 32 218 L48 218 Q58 218 58 208 L58 116 Q58 102 53 96 Q45 86 45 74 Z" fill="url(#${uid}g)"/>
      ${gloss(27,104,104)}
      ${labelBlock(24,132,32,72)}`;
  } else { // wine — tall, gently sloped shoulder
    art=`${shadow}
      <rect x="34" y="18" width="12" height="42" fill="url(#${uid}g)"/>
      <rect x="33" y="9" width="14" height="16" rx="1.5" fill="url(#${uid}c)"/>
      <path d="M34 58 Q34 74 24 86 Q18 94 18 122 L18 208 Q18 219 28 219 L52 219 Q62 219 62 208 L62 122 Q62 94 56 86 Q46 74 46 58 Z" fill="url(#${uid}g)"/>
      ${gloss(27,92,118)}
      ${labelBlock(22,126,36,78)}`;
  }
  return `<svg viewBox="0 0 80 232" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(p.name)}">${defs}${art}</svg>`;
};

/* Photo (from APP_CONFIG.productImages) with procedural-SVG fallback */
window.productImage = function(p, w, h){
  const src = (APP_CONFIG.productImages||{})[p.id];
  return src
    ? `<img class="prod-img" src="${src}" width="${w}" height="${h}" alt="${esc(p.name)}" loading="lazy"/>`
    : productSVG(p, w, h);
};

/* Apply per-customer brand colors to the CSS --app-* tokens */
window.applyBrandColors = function(){
  const c=(APP_CONFIG.brand&&APP_CONFIG.brand.colors)||{};
  const r=document.documentElement.style;
  if(c.primary)     r.setProperty("--app-primary",c.primary);
  if(c.primaryDk)   r.setProperty("--app-primary-dk",c.primaryDk);
  if(c.primaryDeep) r.setProperty("--app-primary-deep",c.primaryDeep);
  if(c.accent)      r.setProperty("--app-accent",c.accent);
  if(c.promo)       r.setProperty("--app-promo",c.promo);
  if(c.promoDk)     r.setProperty("--app-promo-dk",c.promoDk);
};

/* Populate brand/store text into the static markup */
window.applyBrandText = function(){
  const B=APP_CONFIG.brand||{};
  document.querySelectorAll(".logo .l-top").forEach(el=>{ el.textContent=B.logoTop||el.textContent; });
  document.querySelectorAll(".logo .l-sub").forEach(el=>{ el.textContent=B.logoSub||el.textContent; });
  document.querySelectorAll("[data-store-location]").forEach(el=>{ el.textContent=APP_CONFIG.storeLocation||el.textContent; });
  const badge=document.getElementById("search-ai-badge"); if(badge&&B.searchProduct) badge.textContent=B.searchProduct;
  const fabName=document.getElementById("somm-fab-name"); if(fabName&&B.conciergeName) fabName.textContent=`Chat with ${B.conciergeName}`;
  const shName=document.getElementById("somm-head-name"); if(shName&&B.conciergeName) shName.textContent=B.conciergeName;
  const shSub=document.getElementById("somm-head-sub"); if(shSub&&B.conciergeSub) shSub.textContent=B.conciergeSub;
  if(B.logoTop) document.title=`${B.logoTop} · ${B.searchProduct||"Search"} Demo`;
};
