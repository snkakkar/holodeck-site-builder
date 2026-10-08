/**
 * Web Curation Component for Agentforce Adaptive Websites
 *
 * Renders curated content from the Agentforce agent into the website.
 * Supports the "retailProductRecs" template for product recommendation cards.
 *
 * The agent returns JSON with three sections:
 *   - text: friendly summary message
 *   - curation: array of product objects with template field
 *   - options: array of follow-up suggestion objects
 */

(function() {
  'use strict';

  var _brand = (window.BrandConfig && window.BrandConfig.brand) || {};
  var AGENT_NAME = _brand.agentName || 'Coco';
  var BRAND_NAME = _brand.name || "Cavender's";
  var AGENT_ROLE = _brand.agentRole || 'stylist';
  // Help Agent speaker label — brand-driven so it reskins with the generated
  // brand instead of showing "Cavender's Help".
  var HELP_LABEL = _brand.helpAgentLabel || (BRAND_NAME + ' Help');

  // The signed-in shopper's real identity (BrandConfig.persona.identity),
  // falling back to the baked Cavender's persona only when neither exists —
  // so help-flow/checkout copy never shows Rachel Morris/rmorris@example.com
  // inside a generated brand's storefront.
  function cocoPersonaIdentity() {
    var p = (window.BrandConfig && window.BrandConfig.persona) || {};
    return p.identity || (window.Persona && window.Persona.RACHEL) || {};
  }
  function cocoPersonaName() { return cocoPersonaIdentity().name || 'Rachel Morris'; }
  function cocoPersonaEmail() { return cocoPersonaIdentity().email || 'rmorris@example.com'; }

  // Category words for copy that needs to name a few product types — travels
  // with the brand's own nav instead of a fixed Western-wear list.
  function navWords(max) {
    var cats = (window.BrandConfig && window.BrandConfig.navCategories) || [];
    cats = cats.filter(function (c) { return c && c !== 'All'; });
    if (!cats.length) cats = ['great finds'];
    return cats.slice(0, max).join(', ').toLowerCase();
  }

  const CURATION_CONTAINER_ID = 'web-curation-container';

  // Template registry - maps template names to render functions
  const templateRegistry = {
    retailProductRecs: renderRetailProductRecs,
    heroBanner: renderHeroBanner,
    promoCard: renderPromoCard,
    productComparison: renderProductComparison
  };

  // ── Deterministic Coco engine ──
  // 100% client-side, deterministic scripted flow (see `cocoRespond` /
  // `cocoScript`) — no live Salesforce/Agentforce/MIAW/Data Cloud call path
  // exists in this file; that stack was fully removed for v1. USE_LIVE_AGENT
  // is kept only as the existing gate on the bootstrap/welcome/identity
  // listeners below and must stay false.
  var USE_LIVE_AGENT = false;

  // Multi-turn conversation state for the deterministic Coco engine.
  // step: current scripted step; intent: merged intent accumulated across turns.
  var _cocoConvo = { step: 'greet', intent: {}, turns: 0 };

  // Persona homepage bias (e.g. 'Boots'), seeded on sign-in. Kept OUT of
  // _cocoConvo.intent so it never leaks into composed search queries — see
  // setUserIdentity() for why. Consumed only by homepage/persona curation.
  var _personaFamily = null;

  // ── Universal budget guard ──────────────────────────────────────────────
  // A price cap the shopper has stated ("gifts under $75") that must be honored
  // by EVERY curation path — the main funnel, the gift grid, and any
  // agent-style payload — not just the one that happens to parse it. It's set
  // from any query mentioning a price and enforced centrally in renderCuration,
  // so no product over the cap can reach the panel or the page grid. Sticky
  // across turns until the shopper starts over or states a new budget.
  var _cocoBudget = { max: null, min: null };

  // Read a price phrase from free text / a tapped chip and update the active
  // budget. Clears the budget on an explicit reset ("no budget", "any price").
  function cocoUpdateBudget(text) {
    var q = (text || '').toLowerCase();
    if (/no budget|any price|price is no|start over|start again|new search|reset|restart/.test(q)) {
      _cocoBudget = { max: null, min: null };
      return;
    }
    // NOTE: "treat myself" is deliberately NOT a budget trigger. It's the WHO
    // chip (shopping for oneself), and reading it as a splurge floor collided
    // with color picks — "Treat myself" → "Black" left only the 1 black item over
    // budget. Only explicit splurge language sets the floor — see
    // cocoParseBudgetPhrase (defined further below, alongside cocoBudgetThresholds).
    var parsed = cocoParseBudgetPhrase(q);
    if (parsed) _cocoBudget = parsed;
  }

  // Drop any curation item whose catalog price falls outside the active budget.
  // Non-product cards (hero banners, promo cards) carry no price and are kept.
  // Accuracy over count: if nothing survives, the grid is simply smaller/empty.
  function enforceBudget(curation) {
    if (!Array.isArray(curation)) return curation;
    if (_cocoBudget.max == null && _cocoBudget.min == null) return curation;
    var priceByName = {};
    (_productCatalog || []).forEach(function (p) {
      priceByName[p.name] = parseFloat(p.price) || 0;
    });
    // Cap (max) is enforced strictly — nothing over budget gets through.
    var capped = curation.filter(function (item) {
      if (!item || item.template === 'heroBanner' || item.template === 'promoCard') return true;
      var price = priceByName[item.ProductName];
      if (price == null) return true; // not a known catalog product — leave it
      return _cocoBudget.max == null || price <= _cocoBudget.max;
    });
    if (_cocoBudget.min == null) return capped;
    // Floor (min) is soft: the catalog tops out under $100, so a high "splurge"
    // minimum must never blank the grid. Apply it only if something survives.
    var floored = capped.filter(function (item) {
      if (!item || item.template === 'heroBanner' || item.template === 'promoCard') return true;
      var price = priceByName[item.ProductName];
      if (price == null) return true;
      return price >= _cocoBudget.min;
    });
    var hasProduct = floored.some(function (item) {
      return item && item.template !== 'heroBanner' && item.template !== 'promoCard' &&
        priceByName[item.ProductName] != null;
    });
    return hasProduct ? floored : capped;
  }

  // ── Guard: only allow grid replacement after the user actively asks ──
  var _userHasAsked = false;

  // ── Guard: protect checkout view from being overwritten by agent messages ──
  var _isInCheckout = false;

  // ── Safety-net timer for showLoading (cleared whenever real content renders) ──
  var _loadingTimer = null;

  // ── Conversation memory — track products already shown to avoid repeats ──
  var _shownProducts = []; // Array of product names shown in this session
  var MAX_MEMORY = 50;     // Cap to avoid unbounded growth

  function recordShownProducts(data) {
    if (!data || !Array.isArray(data.curation)) return;
    data.curation.forEach(function (item) {
      var name = item.ProductName || '';
      if (name && _shownProducts.indexOf(name) === -1) {
        _shownProducts.push(name);
        // Keep memory bounded
        if (_shownProducts.length > MAX_MEMORY) {
          _shownProducts = _shownProducts.slice(-MAX_MEMORY);
        }
      }
    });
    console.log('[WebCuration] Memory: ' + _shownProducts.length + ' products tracked');
  }

  function getMemoryHint() {
    if (_shownProducts.length === 0) return '';
    // Send last 12 shown product names as context (keeps message size reasonable)
    var recent = _shownProducts.slice(-12);
    return ' [Already shown: ' + recent.join(', ') + ']';
  }

  // ── User identity for personalization ──
  var _userIdentity = JSON.parse(sessionStorage.getItem('nto_user_identity') || 'null');
  // e.g. { email: "jane@example.com", name: "Jane" }

  function setUserIdentity(identity) {
    _userIdentity = identity;
    try {
      if (identity) sessionStorage.setItem('nto_user_identity', JSON.stringify(identity));
      else sessionStorage.removeItem('nto_user_identity');
    } catch(_) {}
    console.log('[WebCuration] User identified:', identity ? identity.email : 'anonymous');

    // When the shopper signs in, softly bias Cash's homepage curation toward her
    // signature family (western boots). This bias is stored SEPARATELY from the
    // conversation intent (`_personaFamily`, not `intent.family`) on purpose:
    //   - `intent.family` is the family the SHOPPER named this turn; it's appended
    //     to every composed search query (cocoComposeQuery). Seeding it made a
    //     bare color pick like "Black" become "black Boots" — a family-scoped
    //     search that collapsed a full color grid down to one or two boots.
    //   - `intent.color` we likewise never seed: it's treated everywhere as a
    //     color the shopper explicitly chose (drives the query, headline, and
    //     stone hard-filter), so seeding it skipped the color question entirely.
    // Keeping the persona bias out of `intent` lets the conversational funnel
    // start clean while homepage recs still lean on-persona. Sign-out clears it.
    if (identity && window.Persona && window.Persona.INTERESTS) {
      var interests = window.Persona.INTERESTS;
      if (!_cocoConvo.intent) _cocoConvo.intent = {};
      _personaFamily = interests.families && interests.families[0];
      _cocoConvo.intent._personalized = true;
    } else if (!identity && _cocoConvo.intent) {
      _personaFamily = null;
      delete _cocoConvo.intent._personalized;
      delete _cocoConvo.intent.family;
    }
  }

  function getUserIdentity() {
    return _userIdentity;
  }

  function isUserIdentified() {
    return _userIdentity && _userIdentity.email;
  }

  // ── Cart state (demo only — sessionStorage) ──
  // Enhanced: each item stores { name, image, price, category, family, quantity, addedAt }
  var _cart = JSON.parse(sessionStorage.getItem('nto_cart') || '[]');

  // Migrate legacy cart items that only had { name, addedAt }
  function migrateCartItems() {
    var changed = false;
    _cart.forEach(function(item) {
      if (!item.price && !item.image) {
        // Attempt to enrich from product catalog if loaded
        if (_productCatalog) {
          var found = findProductByName(item.name);
          if (found) {
            item.image = found.image || '';
            item.price = found.price || '';
            item.category = found.category || '';
            item.family = found.family || '';
            if (!item.quantity) item.quantity = 1;
            changed = true;
          }
        }
        if (!item.quantity) { item.quantity = 1; changed = true; }
      }
    });
    if (changed) {
      try { sessionStorage.setItem('nto_cart', JSON.stringify(_cart)); } catch(_) {}
    }
  }

  function getCartItemCount() {
    var total = 0;
    _cart.forEach(function(item) { total += (item.quantity || 1); });
    return total;
  }

  function updateCartBadge() {
    var badge = document.querySelector('.cart-count');
    if (badge) {
      var count = getCartItemCount();
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
    // Dispatch event so cart drawer can re-render if open
    window.dispatchEvent(new CustomEvent('cart:updated'));
  }

  /**
   * Add a product to the cart.
   * Accepts either a string (product name) or an object { name, image, price, category, family }.
   * If item already in cart, increments quantity.
   */
  function addToCart(productNameOrObj) {
    var item;
    if (typeof productNameOrObj === 'string') {
      // Legacy string signature — look up full product data from catalog
      var productData = findProductByName ? findProductByName(productNameOrObj) : null;
      item = {
        name: productNameOrObj,
        image: productData ? proxyImg(productData.image) : '',
        price: productData ? productData.price : '',
        category: productData ? productData.category : '',
        family: productData ? productData.family : '',
        quantity: 1,
        addedAt: Date.now()
      };
    } else {
      item = {
        name: productNameOrObj.name || '',
        image: productNameOrObj.image ? proxyImg(productNameOrObj.image) : '',
        price: productNameOrObj.price || '',
        category: productNameOrObj.category || '',
        family: productNameOrObj.family || '',
        quantity: 1,
        addedAt: Date.now()
      };
    }

    // Normalize price to a bare numeric string ("$88.00" | "88.00" → "88.00")
    // so every add path (quick-view, curation, Color Bar) stores a value that
    // parseFloat can read. A mismatched format here silently totals to $0.
    item.price = String(item.price == null ? '' : item.price).replace(/[^0-9.]/g, '');

    // Check if already in cart — increment quantity
    var existing = null;
    for (var i = 0; i < _cart.length; i++) {
      if (_cart[i].name === item.name) { existing = _cart[i]; break; }
    }
    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
      // Update image/price if missing (migration)
      if (!existing.image && item.image) existing.image = item.image;
      if (!existing.price && item.price) existing.price = item.price;
      if (!existing.category && item.category) existing.category = item.category;
    } else {
      _cart.push(item);
    }

    try { sessionStorage.setItem('nto_cart', JSON.stringify(_cart)); } catch(_) {}
    updateCartBadge();
    // Bounce the cart badge
    var badge = document.querySelector('.cart-count');
    if (badge) {
      badge.classList.remove('cart-bounce');
      void badge.offsetWidth; // force reflow
      badge.classList.add('cart-bounce');
    }
  }

  function removeFromCart(productName) {
    _cart = _cart.filter(function(item) { return item.name !== productName; });
    try { sessionStorage.setItem('nto_cart', JSON.stringify(_cart)); } catch(_) {}
    updateCartBadge();
  }

  function updateCartQuantity(productName, qty) {
    for (var i = 0; i < _cart.length; i++) {
      if (_cart[i].name === productName) {
        if (qty <= 0) {
          _cart.splice(i, 1);
        } else {
          _cart[i].quantity = qty;
        }
        break;
      }
    }
    try { sessionStorage.setItem('nto_cart', JSON.stringify(_cart)); } catch(_) {}
    updateCartBadge();
  }

  function getCart() { return _cart; }

  function getCartTotal() {
    var total = 0;
    _cart.forEach(function(item) {
      var price = parseFloat(item.price) || 0;
      var qty = item.quantity || 1;
      total += price * qty;
    });
    return Math.round(total * 100) / 100;
  }

  function clearCart() {
    _cart = [];
    try { sessionStorage.setItem('nto_cart', JSON.stringify(_cart)); } catch(_) {}
    updateCartBadge();
  }

  /**
   * Route NTO CDN images through our server-side proxy to avoid
   * Cloudflare 503s caused by cross-origin requests.
   */
  function proxyImg(url) {
    if (!url) return '';
    if (url.indexOf('northerntrailoutfitters.com') !== -1) {
      return '/api/scrape/img-proxy?url=' + encodeURIComponent(url);
    }
    return url;
  }

  /**
   * Look up price from the product catalog for a given product name.
   */
  function getProductPrice(productName) {
    if (!_productCatalog) return null;
    var key = normaliseName(productName);
    if (!key) return null;
    if (_productNameIndex[key] && _productNameIndex[key].price) return _productNameIndex[key].price;
    for (var i = 0; i < _productCatalog.length; i++) {
      var catKey = normaliseName(_productCatalog[i].name);
      if ((catKey.indexOf(key) !== -1 || key.indexOf(catKey) !== -1) && _productCatalog[i].price) {
        return _productCatalog[i].price;
      }
    }
    return null;
  }

  /**
   * Renders a retail product recommendation card
   */
  /**
   * Category → icon for fallback placeholders (shared with views.js logic).
   */
  var _categoryIcons = {
    'work boots': '🥾', 'booties': '👢', 'western boots': '👢', 'boots': '👢',
    'felt hats': '🤠', 'straw hats': '👒', 'cowboy hats': '🤠', 'caps': '🧢', 'hats': '🤠',
    'bootcut': '👖', 'slim': '👖', 'jeans': '👖',
    'buckles': '🥇', 'belts': '🔗',
    'western shirts': '👔', 'dresses': '👗', 'tops': '👚', 'apparel': '👚',
    'wild rags': '🧣', 'bags': '👜', 'jewelry': '💠', 'accessories': '👜'
  };

  function curationCategoryIcon(category) {
    // The Western-specific keys above never match a generated brand's own
    // categories, so only the default emoji actually leaks — swap it for a
    // brand-neutral one once a real generated catalog is loaded.
    var fallbackIcon = cocoHasGeneratedBrand() ? '🛍️' : '🤠';
    if (!category) return fallbackIcon;
    var key = category.toLowerCase();
    for (var k in _categoryIcons) {
      if (key.indexOf(k) !== -1) return _categoryIcons[k];
    }
    return fallbackIcon;
  }

  function renderRetailProductRecs(product) {
    const card = document.createElement('div');
    card.className = 'curation-product-card';

    // Store data attributes for quick-view modal
    var proxiedImage = proxyImg(product.ImageURL);
    card.setAttribute('data-name', product.ProductName || '');
    card.setAttribute('data-image', proxiedImage || '');
    card.setAttribute('data-category', product.ProductCategory || '');
    card.setAttribute('data-family', product.ProductFamily || '');
    card.setAttribute('data-brand', product.ProductBrand || BRAND_NAME);
    card.setAttribute('data-description', product.ProductDescription || '');

    var initial = (product.ProductName || '?').charAt(0).toUpperCase();
    var catIcon = curationCategoryIcon(product.ProductCategory);

    const imageHtml = product.ImageURL
      ? '<div class="img-shimmer">' +
          '<img src="' + escapeHtml(proxiedImage) + '" alt="' + escapeHtml(product.ProductName || '') + '" loading="lazy" ' +
            'data-retry="0" ' +
            'onload="this.parentElement.classList.add(\'img-loaded\')" ' +
            'onerror="var r=parseInt(this.dataset.retry||0);if(r<2){this.dataset.retry=r+1;' +
              'var img=this,s=img.src;' +
              'setTimeout(function(){img.src=s},900*(r+1));return}' +
              'this.style.display=\'none\';this.parentElement.classList.add(\'img-loaded\');' +
              'var fb=this.parentElement.querySelector(\'.img-fallback\');if(fb)fb.style.display=\'flex\'">' +
          '<div class="img-fallback" style="display:none">' +
            '<span class="img-fallback-icon">' + catIcon + '</span>' +
            '<span class="img-fallback-letter">' + escapeHtml(initial) + '</span>' +
          '</div>' +
        '</div>'
      : '<div class="img-fallback" style="display:flex">' +
          '<span class="img-fallback-icon">' + catIcon + '</span>' +
          '<span class="img-fallback-letter">' + escapeHtml(initial) + '</span>' +
        '</div>';

    // Look up price from catalog
    var price = getProductPrice(product.ProductName);
    var priceHtml = price ? `<p class="curation-product-price">$${escapeHtml(String(price))}</p>` : '';

    var wishlisted = window.Views && window.Views.isWishlisted && window.Views.isWishlisted(product.ProductName || '');
    card.innerHTML = `
      <div class="curation-product-image">
        ${imageHtml}
        <button class="curation-wishlist-btn${wishlisted ? ' wishlisted' : ''}" data-product="${escapeHtml(product.ProductName || '')}"
          data-image="${escapeHtml(proxiedImage || '')}" data-price="${escapeHtml(price ? String(price) : '')}"
          aria-label="${wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}" title="Add to wishlist">${wishlisted ? '❤️' : '🤍'}</button>
      </div>
      <div class="curation-product-body">
        ${product.ProductBrand ? `<p class="curation-product-brand">${escapeHtml(product.ProductBrand)}</p>` : ''}
        <h3 class="curation-product-name">${escapeHtml(product.ProductName || 'Product')}</h3>
        ${product.ProductDescription ? `<p class="curation-product-desc">${escapeHtml(product.ProductDescription)}</p>` : ''}
        ${priceHtml}
        <div class="curation-card-footer">
          ${product.ProductCategory ? `<span class="curation-product-category">${escapeHtml(product.ProductCategory)}</span>` : ''}
          ${product.ProductFamily ? `<span class="curation-product-category" style="margin-left:4px">${escapeHtml(product.ProductFamily)}</span>` : ''}
        </div>
        <button class="curation-add-cart-btn" data-product="${escapeHtml(product.ProductName || '')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          Add to Cart
        </button>
      </div>
    `;

    // Wire up Add to Cart
    var btn = card.querySelector('.curation-add-cart-btn');
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var name = this.getAttribute('data-product');
      addToCart(name);
      this.innerHTML = '✓ Added';
      this.classList.add('added');
      var self = this;
      setTimeout(function() {
        self.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg> Add to Cart';
        self.classList.remove('added');
      }, 1500);
    });

    // Wire up the wishlist heart — delegates to the shared Views wishlist store
    var wishBtn = card.querySelector('.curation-wishlist-btn');
    if (wishBtn) {
      wishBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var active = false;
        if (window.Views && window.Views.toggleWishlist) {
          active = window.Views.toggleWishlist(
            this.getAttribute('data-product'),
            this.getAttribute('data-image'),
            this.getAttribute('data-price')
          );
          if (window.Views.refreshWishlistHearts) window.Views.refreshWishlistHearts();
        }
        this.classList.toggle('wishlisted', !!active);
        this.textContent = active ? '❤️' : '🤍';
        this.setAttribute('aria-label', active ? 'Remove from wishlist' : 'Add to wishlist');
        this.classList.remove('wishlist-pop');
        void this.offsetWidth;
        this.classList.add('wishlist-pop');
      });
    }

    return card;
  }

  /**
   * Renders a hero banner — displayed full-width above the main grid
   */
  function renderHeroBanner(item) {
    var banner = document.createElement('div');
    banner.className = 'curation-hero-banner';
    var bgStyle = item.ImageURL ? 'background-image:url(' + escapeHtml(proxyImg(item.ImageURL)) + ')' : '';
    banner.innerHTML = '\
      <div class="curation-hero-bg" style="' + bgStyle + '">\
        <div class="curation-hero-overlay"></div>\
        <div class="curation-hero-content">\
          <h2 class="curation-hero-title">' + escapeHtml(item.Title || '') + '</h2>\
          ' + (item.Subtitle ? '<p class="curation-hero-subtitle">' + escapeHtml(item.Subtitle) + '</p>' : '') + '\
          ' + (item.CTALabel ? '<button class="curation-hero-cta btn btn-white">' + escapeHtml(item.CTALabel) + '</button>' : '') + '\
        </div>\
      </div>\
    ';
    if (item.CTARoute) {
      var cta = banner.querySelector('.curation-hero-cta');
      if (cta) {
        cta.addEventListener('click', function() {
          if (window.Router) window.Router.navigate(item.CTARoute);
        });
      }
    }
    return banner;
  }

  /**
   * Renders a promotional card (highlighted deal/offer)
   */
  function renderPromoCard(item) {
    var card = document.createElement('div');
    card.className = 'curation-promo-card';
    card.innerHTML = '\
      <div class="curation-promo-badge">SPECIAL OFFER</div>\
      <h3 class="curation-promo-title">' + escapeHtml(item.Title || '') + '</h3>\
      ' + (item.Description ? '<p class="curation-promo-desc">' + escapeHtml(item.Description) + '</p>' : '') + '\
      ' + (item.ExpiryDate ? '<p class="curation-promo-expiry">Ends ' + escapeHtml(item.ExpiryDate) + '</p>' : '') + '\
    ';
    return card;
  }

  /**
   * Renders a product comparison card (side-by-side layout for 2 products).
   * Expected item structure:
   *   { template: 'productComparison', products: [ { ProductName, ImageURL, ... }, ... ] }
   */
  function renderProductComparison(item) {
    var container = document.createElement('div');
    container.className = 'curation-comparison';

    var products = item.products || [];
    if (products.length < 2) {
      // Fallback: not enough products for comparison
      if (products.length === 1) return renderRetailProductRecs(products[0]);
      return document.createTextNode('');
    }

    // Header
    var header = document.createElement('div');
    header.className = 'curation-comparison-header';
    header.innerHTML = '<span class="curation-comparison-badge">⚖️ Compare</span>' +
      '<h3 class="curation-comparison-title">' +
        escapeHtml(products[0].ProductName || 'Product A') + ' vs ' +
        escapeHtml(products[1].ProductName || 'Product B') +
      '</h3>';
    container.appendChild(header);

    // Cards row
    var row = document.createElement('div');
    row.className = 'curation-comparison-items';

    for (var i = 0; i < 2; i++) {
      var p = products[i];
      var initial = (p.ProductName || '?').charAt(0).toUpperCase();
      var catIcon = curationCategoryIcon(p.ProductCategory);
      var price = getProductPrice(p.ProductName);

      var imgHtml = p.ImageURL
        ? '<img src="' + escapeHtml(proxyImg(p.ImageURL)) + '" alt="' + escapeHtml(p.ProductName || '') + '" loading="lazy">'
        : '<div class="img-fallback" style="display:flex;min-height:200px">' +
            '<span class="img-fallback-icon">' + catIcon + '</span>' +
            '<span class="img-fallback-letter">' + escapeHtml(initial) + '</span>' +
          '</div>';

      var card = document.createElement('div');
      card.className = 'curation-comparison-item';
      card.innerHTML =
        '<div class="curation-comparison-img">' + imgHtml + '</div>' +
        '<div class="curation-comparison-details">' +
          '<p class="curation-product-brand">' + escapeHtml(p.ProductBrand || BRAND_NAME) + '</p>' +
          '<h4 class="curation-product-name">' + escapeHtml(p.ProductName || '') + '</h4>' +
          (price ? '<p class="curation-product-price">$' + escapeHtml(String(price)) + '</p>' : '') +
          (p.ProductCategory ? '<span class="curation-product-category">' + escapeHtml(p.ProductCategory) + '</span>' : '') +
          (p.ProductDescription ? '<p class="curation-product-desc">' + escapeHtml(p.ProductDescription) + '</p>' : '') +
        '</div>';
      row.appendChild(card);
    }

    // Add VS divider between the two items
    var vsDivider = document.createElement('div');
    vsDivider.className = 'curation-comparison-vs';
    vsDivider.textContent = 'VS';
    row.appendChild(vsDivider);

    container.appendChild(row);
    return container;
  }

  /**
   * Main render function - processes the full curation payload
   */
  function renderCuration(payload) {
    // Real content is arriving — cancel the showLoading safety-net timer.
    if (_loadingTimer) { clearTimeout(_loadingTimer); _loadingTimer = null; }
    const container = document.getElementById(CURATION_CONTAINER_ID);
    if (!container) {
      console.warn('[WebCuration] Container not found:', CURATION_CONTAINER_ID);
      return;
    }

    // Parse payload if string
    let data = payload;
    if (typeof payload === 'string') {
      try {
        data = JSON.parse(payload);
      } catch (e) {
        console.error('[WebCuration] Failed to parse curation payload:', e);
        return;
      }
    }

    // Validate structure
    if (!data || (!data.text && !data.curation)) {
      console.warn('[WebCuration] Invalid curation payload structure');
      return;
    }

    // Universal budget gate: no matter which path built this payload, strip any
    // product over the shopper's stated price cap before it's shown or recorded.
    if (data.curation) data.curation = enforceBudget(data.curation);
    if (data.bundleSuggestions) data.bundleSuggestions = enforceBudget(data.bundleSuggestions);

    // Build the curation wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'curation-wrapper';

    // Help Agent replies share this same panel but read as a distinct service
    // agent: a "Cavender's Help" speaker label + service badge, and none of the
    // shopping-only chrome (Shop the Look / checkout button). Handing back to
    // Cash renders a normal shopper payload, so the label simply disappears.
    var isHelp = data.mode === 'help';

    // Header with AI badge — clickable to expand when collapsed
    const header = document.createElement('div');
    header.className = 'curation-header';
    var badgeLabel = data.isPersonalized ? 'Personalized for You' : 'AI Curated';
    var badgeIcon = data.isPersonalized
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
    if (isHelp) {
      badgeLabel = data.speaker || HELP_LABEL;
      badgeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>';
    }
    header.innerHTML = '<span class="curation-badge' + (isHelp ? ' curation-badge-help' : (data.isPersonalized ? ' curation-badge-personalized badge-pulse' : '')) + '">' +
      '<span class="curation-badge-inner">' + badgeIcon + ' ' + escapeHtml(badgeLabel) + '</span></span>' +
      (data.isPersonalized && !isHelp ? '<p class="curation-personalize-hint">Based on your closet</p>' : '');
    wrapper.appendChild(header);

    // Text summary
    if (data.text) {
      const title = document.createElement('p');
      title.className = 'curation-title' + (isHelp ? ' curation-title--help' : '');
      title.textContent = data.text;
      wrapper.appendChild(title);
    }

    // Curation product cards
    if (data.curation && Array.isArray(data.curation) && data.curation.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'curation-products';

      data.curation.forEach(function (item, idx) {
        const templateName = item.template;
        const renderFn = templateRegistry[templateName];

        var card;
        if (renderFn) {
          card = renderFn(item);
        } else {
          console.warn('[WebCuration] Unknown template:', templateName);
          card = renderRetailProductRecs(item);
        }

        // Stagger animation on each card
        if (card && card.classList) {
          card.classList.add('card-animate');
          card.style.animationDelay = (idx * 60) + 'ms';
        }
        grid.appendChild(card);
      });

      // Wire quick-view on product card clicks (not buttons inside cards)
      grid.addEventListener('click', function (e) {
        var card = e.target.closest('.curation-product-card');
        if (!card) return;
        if (e.target.closest('button') || e.target.closest('a')) return;
        if (window.Views && window.Views.openQuickView) {
          window.Views.openQuickView(card);
        }
      });

      wrapper.appendChild(grid);

      // For a signed-in shopper, always offer to complete the outfit via
      // Shop the Look — shown below every set of recommendations and persistent
      // across the whole session (gated only on sign-in, not on any
      // promo/birthday eligibility).
      if (isUserIdentified() && !isHelp) {
        try {
          var cbCta = document.createElement('a');
          cbCta.className = 'curation-colorbar-cta';
          // "Shop the Look" is served by the home See-It-Styled trending rail.
          var lookLabel = _brand.signatureFeatureLabel || 'Shop the Look';
          cbCta.setAttribute('href', '/#trending-banner');
          cbCta.innerHTML = '✨ Want the whole look? <strong>' + escapeHtml(lookLabel) + ' →</strong>';
          wrapper.appendChild(cbCta);
        } catch (e) { /* non-critical enhancement */ }
      }
    }

    // Bundle suggestions ("Complete the Look" row)
    if (data.bundleSuggestions && Array.isArray(data.bundleSuggestions) && data.bundleSuggestions.length > 0) {
      var bundlesSection = document.createElement('div');
      bundlesSection.className = 'curation-bundles';
      bundlesSection.innerHTML = '<p class="curation-bundles-title">✨ Complete the Look</p>';

      var bundlesRow = document.createElement('div');
      bundlesRow.className = 'curation-bundles-row';

      data.bundleSuggestions.forEach(function (item) {
        var bCard = document.createElement('div');
        bCard.className = 'curation-bundle-item';
        var bImgHtml = item.ImageURL
          ? '<img src="' + escapeHtml(proxyImg(item.ImageURL)) + '" alt="' + escapeHtml(item.ProductName || '') + '" loading="lazy">'
          : '<div class="img-fallback" style="display:flex;width:100px;height:100px;border-radius:8px"><span class="img-fallback-icon">' + curationCategoryIcon(item.ProductCategory) + '</span></div>';
        bCard.innerHTML = bImgHtml + '<p class="curation-bundle-name">' + escapeHtml(item.ProductName || '') + '</p>';

        // Click bundle item to search for that product (deterministic-safe).
        bCard.addEventListener('click', function () {
          if (window.WebCuration && window.WebCuration.ask) {
            window.WebCuration.ask('Show me ' + (item.ProductName || ''));
          }
        });

        bundlesRow.appendChild(bCard);
      });

      bundlesSection.appendChild(bundlesRow);
      wrapper.appendChild(bundlesSection);
    }

    // Option buttons
    if (data.options && Array.isArray(data.options) && data.options.length > 0) {
      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'curation-options';

      data.options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'curation-option-btn';
        btn.textContent = option.name || option;
        btn.addEventListener('click', () => {
          handleOptionClick(option.name || option);
        });
        optionsContainer.appendChild(btn);
      });

      // Always inject checkout button — for the gift flow the user may not
      // have items yet but the button should be available for the demo.
      // Help Agent replies are service, not shopping, so skip the checkout CTA.
      if (!isHelp) {
        var checkoutOpt = document.createElement('button');
        checkoutOpt.className = 'curation-option-btn curation-option-checkout';
        checkoutOpt.textContent = '🛒 View Cart & Checkout';
        checkoutOpt.addEventListener('click', function() {
          renderAgentCheckout();
        });
        optionsContainer.appendChild(checkoutOpt);
      }

      wrapper.appendChild(optionsContainer);
    } else if (!isHelp) {
      // Even if no agent options, always show checkout button (shopping only)
      var optionsContainer = document.createElement('div');
      optionsContainer.className = 'curation-options';
      var checkoutOpt = document.createElement('button');
      checkoutOpt.className = 'curation-option-btn curation-option-checkout';
      checkoutOpt.textContent = '🛒 View Cart & Checkout';
      checkoutOpt.addEventListener('click', function() {
        renderAgentCheckout();
      });
      optionsContainer.appendChild(checkoutOpt);
      wrapper.appendChild(optionsContainer);
    }

    // Segment tags (if agent returns segment data from Data Cloud)
    if (data.segments && Array.isArray(data.segments) && data.segments.length > 0) {
      var segSection = document.createElement('div');
      segSection.className = 'curation-segments';
      segSection.innerHTML = '<p class="curation-segments-label">Your Profile</p>';
      var segRow = document.createElement('div');
      segRow.className = 'curation-segments-row';
      data.segments.forEach(function (seg) {
        var tag = document.createElement('span');
        tag.className = 'curation-segment-tag';
        tag.textContent = seg.name || seg;
        segRow.appendChild(tag);
      });
      segSection.appendChild(segRow);
      wrapper.appendChild(segSection);
    }

    // Identification card — prompt anonymous users to sign in for personalized recs
    if (!isUserIdentified() && data.curation && data.curation.length > 0) {
      var idCard = document.createElement('div');
      idCard.className = 'curation-identify-card';
      idCard.innerHTML =
        '<p class="curation-identify-text">👤 Sign in to get personalized recommendations powered by Salesforce Data Foundations</p>' +
        '<button class="curation-identify-btn">Sign In</button>';

      var signInBtn = idCard.querySelector('.curation-identify-btn');
      signInBtn.addEventListener('click', function () {
        showIdentificationForm(container);
      });
      wrapper.appendChild(idCard);
    }

    // Record shown products for conversation memory
    recordShownProducts(data);

    // Clear and render
    container.innerHTML = '';
    container.appendChild(wrapper);

    // Adaptive moment: pulse the curation zone to draw attention
    var section = document.querySelector('.curation-section');
    if (section && data.curation && data.curation.length > 0) {
      section.classList.remove('curation-entering');
      void section.offsetWidth;
      section.classList.add('curation-entering');
    }

    // Always add the chat input bar at the bottom — INSIDE the white wrapper
    // so it sits on the panel's background, not on the transparent page.
    appendChatInput(wrapper);
    ensureCloseButton();
    // Anchor the panel at the TOP of the new response so the shopper reads
    // from the headline down — not jumped to the bottom as cards/images load in.
    wrapper.scrollTop = 0;
    requestAnimationFrame(function () { wrapper.scrollTop = 0; });

    // Also update the main page product grid so the adaptive-website story
    // lands — the floating panel is a preview; the page itself should reflect
    // what the agent curated. Homepage uses #featured-grid; category pages
    // use #category-grid. If neither is mounted (e.g. unknown route), skip.
    updateMainGrid(data);
  }

  /**
   * Update the active main-page product grid with curated items.
   * Cards use the same .product-card / .product-image-wrap / .product-info
   * structure as views.js so existing CSS applies. We surface brand +
   * description instead of price since curation items don't carry price.
   */
  function updateMainGrid(data) {
    if (!data || !Array.isArray(data.curation) || data.curation.length === 0) {
      return;
    }
    // Only replace the page grid after the user has actively asked the agent
    // something. Auto-responses (greeting, personalization) must not destroy
    // the curated homepage grid.
    if (!_userHasAsked) {
      console.log('[WebCuration] Skipping grid update — user has not asked yet');
      return;
    }
    var grid = document.getElementById('featured-grid') ||
               document.getElementById('category-grid');
    if (!grid) return;

    // Render hero banners above the grid if present
    var heroBanners = data.curation.filter(function(i) { return i.template === 'heroBanner'; });
    var products = data.curation.filter(function(i) { return i.template !== 'heroBanner' && i.template !== 'promoCard'; });

    // Insert hero banners before the grid
    if (heroBanners.length > 0) {
      var heroContainer = document.getElementById('hero-banner-slot');
      if (heroContainer) {
        heroContainer.innerHTML = heroBanners.map(function(item) {
          var bgStyle = item.ImageURL ? 'background-image:url(' + escapeHtml(proxyImg(item.ImageURL)) + ')' : '';
          return '<div class="main-hero-banner" style="' + bgStyle + '">' +
            '<div class="main-hero-overlay"></div>' +
            '<div class="main-hero-content">' +
              '<h2>' + escapeHtml(item.Title || '') + '</h2>' +
              (item.Subtitle ? '<p>' + escapeHtml(item.Subtitle) + '</p>' : '') +
            '</div></div>';
        }).join('');
      }
    }

    var html = products.map(function (item) {
      var name = item.ProductName || 'Product';
      var brand = item.ProductBrand || '';
      var price = getProductPrice(name);
      var category = item.ProductCategory || '';
      var family = item.ProductFamily || '';
      var description = item.ProductDescription || '';
      var initial = name.charAt(0).toUpperCase();
      var catIcon = curationCategoryIcon(category);

      var proxied = proxyImg(item.ImageURL);
      var img = item.ImageURL
        ? '<div class="img-shimmer">' +
            '<img src="' + escapeHtml(proxied) + '" alt="' + escapeHtml(name) + '" loading="lazy" ' +
              'data-retry="0" ' +
              'onload="this.parentElement.classList.add(\'img-loaded\')" ' +
              'onerror="var r=parseInt(this.dataset.retry||0);if(r<2){this.dataset.retry=r+1;' +
                'var img=this,s=img.src.split(\'&_r=\')[0];' +
                'setTimeout(function(){img.src=s+\'&_r=\'+Date.now()},900*(r+1));return}' +
                'this.style.display=\'none\';this.parentElement.classList.add(\'img-loaded\');' +
                'var fb=this.parentElement.querySelector(\'.img-fallback\');if(fb)fb.style.display=\'flex\'">' +
            '<div class="img-fallback" style="display:none">' +
              '<span class="img-fallback-icon">' + catIcon + '</span>' +
              '<span class="img-fallback-letter">' + escapeHtml(initial) + '</span>' +
            '</div>' +
          '</div>'
        : '<div class="img-fallback" style="display:flex">' +
            '<span class="img-fallback-icon">' + catIcon + '</span>' +
            '<span class="img-fallback-letter">' + escapeHtml(initial) + '</span>' +
          '</div>';

      return '' +
        '<div class="product-card" ' +
          'data-name="' + escapeHtml(name) + '" ' +
          'data-price="' + escapeHtml(price ? '$' + price : '') + '" ' +
          'data-image="' + escapeHtml(proxied || '') + '" ' +
          'data-category="' + escapeHtml(category) + '" ' +
          'data-family="' + escapeHtml(family) + '" ' +
          'data-brand="' + escapeHtml(brand || BRAND_NAME) + '" ' +
          'data-description="' + escapeHtml(description) + '">' +
          '<div class="product-image-wrap">' + img + '</div>' +
          '<div class="product-info">' +
            '<h3 class="product-name">' + escapeHtml(name) + '</h3>' +
            (price ? '<p class="product-price">$' + escapeHtml(String(price)) + '</p>' : '') +
            (brand ? '<p class="product-brand-label">' + escapeHtml(brand) + '</p>' : '') +
          '</div>' +
        '</div>';
    }).join('');

    grid.innerHTML = html;

    // Re-merchandise the "Shop the Look" mosaic (homepage) so it reflects the
    // curated set too. The mosaic uses glyph tiles (Views.lookTile) with a
    // masonry size rhythm; map curation items into the product shape it expects.
    var mosaic = document.getElementById('look-mosaic');
    if (mosaic && window.Views && window.Views.lookTile && products.length) {
      var mosaicSizes = ['lg', 'md', 'md', 'sm', 'md', 'sm', 'md', 'md', 'lg'];
      var mosaicHtml = products.slice(0, 9).map(function (item, idx) {
        var n = item.ProductName || 'Product';
        return window.Views.lookTile({
          name: n,
          price: getProductPrice(n),
          image: item.ImageURL || '',
          category: item.ProductCategory || '',
          family: item.ProductFamily || '',
          brand: item.ProductBrand || BRAND_NAME,
          description: item.ProductDescription || ''
        }, mosaicSizes[idx % mosaicSizes.length]);
      }).join('');
      mosaic.innerHTML = mosaicHtml;
      if (window.Views.staggerCards) window.Views.staggerCards(mosaic);
      if (window.Views.wireQuickView) window.Views.wireQuickView(mosaic);
    }

    // Apply stagger animation + quick-view to the main grid
    if (window.Views) {
      if (window.Views.staggerCards) window.Views.staggerCards(grid);
      // wireQuickView is handled by Views' delegation, but for curated main grid
      // cards we also need data attrs. The product-card elements from updateMainGrid
      // already have data attributes from productCard() in views.js, so we just
      // need to add the click handler.
      grid.addEventListener('click', function (e) {
        var card = e.target.closest('.product-card');
        if (!card) return;
        if (e.target.closest('button') || e.target.closest('a')) return;
        if (window.Views.openQuickView) window.Views.openQuickView(card);
      });
    }
    console.log('[WebCuration] Main grid updated with ' + data.curation.length + ' curated products');
  }

  /**
   * Append a chat input bar to the curation container
   */
  function appendChatInput(container) {
    var inputBar = document.createElement('div');
    inputBar.className = 'curation-chat-input';
    inputBar.innerHTML = '\
      <div class="curation-chat-input-wrapper">\
        <input type="text" id="curation-chat-field" class="curation-chat-field" placeholder="Ask ' + AGENT_NAME + ' about ' + navWords(2) + '..." autocomplete="off" />\
        <button id="curation-chat-send" class="curation-chat-send" aria-label="Send message">\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\
            <line x1="22" y1="2" x2="11" y2="13"></line>\
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>\
          </svg>\
        </button>\
      </div>\
    ';
    container.appendChild(inputBar);

    var field = inputBar.querySelector('#curation-chat-field');
    var sendBtn = inputBar.querySelector('#curation-chat-send');

    function handleSend() {
      var text = field.value.trim();
      if (!text) return;
      field.value = '';
      _userHasAsked = true; // Allow grid updates now that user is actively chatting
      cocoUpdateBudget(text); // track any stated price cap for the universal gate
      console.log('[WebCuration] User message:', text);

      // Intercept checkout intent — handle locally without sending to agent
      if (isCheckoutIntent(text)) {
        renderAgentCheckout();
        return;
      }

      // Intercept gift intent — build curated product grid locally with
      // pinned buckle + jewelry picks. Do NOT send to agent because the
      // agent response would overwrite the pinned products.
      if (isGiftIntent(text)) {
        var giftPayload = buildGiftCuration(text);
        if (giftPayload) {
          window.WebCuration.render(giftPayload);
          expandPanel();
          return;
        }
      }

      // Intercept post-purchase service intent — the Help Agent handles it in
      // this same panel (returns, order status, loyalty, care, cancellation).
      if (isHelpIntent(text)) {
        helpRespond(text);
        return;
      }

      _lastUserQuery = text;

      // Deterministic, client-side engine. No org dependency.
      cocoRespond(text);
    }

    sendBtn.addEventListener('click', handleSend);
    field.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    });

    // Voice agent — launch NGA via the global lazy-init function.

    // preventScroll: focusing the input (which sits at the bottom of the
    // scrollable wrapper) would otherwise scroll the panel to the bottom,
    // fighting the scrollTop=0 that anchors each new response at the top.
    setTimeout(function() { field.focus({ preventScroll: true }); }, 100);
  }

  // ── Gift Intent Detection ──
  // Matches queries like "what else should I gift?",
  // "gift ideas", "gift guide", "gift for him/her", etc. — Cavender's outfits the
  // whole family, so gift intent is unisex (buckles, belts, hats, wild rags, jewelry).
  function isGiftIntent(text) {
    if (!text) return false;
    var q = text.toLowerCase().trim();
    return /\b(gift|gifts|present|gifting)\b/.test(q) &&
           /\b(need|else|idea|ideas|guide|for her|for him|show|recommend|suggest|best|under)\b/.test(q);
  }

  // Gift-worthy keyword regex. For a generated brand, derive from the
  // persona's own interests (categories + stones) — already Gemini-generated
  // and harness-guaranteed to match ≥1 product — plus universal gift words.
  // Falls back to the static Western-wear regex for the baked demo / when no
  // persona interests are available.
  function buildGiftKeywords() {
    var interests = window.Persona && window.Persona.INTERESTS;
    var terms = []
      .concat((interests && interests.categories) || [])
      .concat((interests && interests.stones) || [])
      .filter(Boolean)
      .map(function (t) { return String(t); });
    if (!terms.length) {
      if (!cocoHasGeneratedBrand()) {
        return /buckle|belt|wild rag|scarf|jewelry|turquoise|bag|cap|hat|gift|concho|tooled|leather/i;
      }
      // No stated persona interests for a generated brand — fall back to the
      // catalog's own colors + nav categories rather than the Western default.
      var bc = window.BrandConfig || {};
      var catalogTerms = derivedCatalogColors()
        .concat((Array.isArray(bc.navCategories) ? bc.navCategories : []))
        .filter(Boolean)
        .map(function (t) { return String(t); });
      var escapedCatalogTerms = catalogTerms.map(escapeRegExp).concat(['gift']);
      return new RegExp(escapedCatalogTerms.join('|'), 'i');
    }
    var escaped = terms.map(escapeRegExp).concat(['gift']);
    return new RegExp(escaped.join('|'), 'i');
  }

  /**
   * Build a curated gift product grid from the local catalog.
   * Returns a curation payload with buckles, belts, western jewelry, wild rags, etc.
   */
  function buildGiftCuration(query) {
    if (!_productCatalog || _productCatalog.length === 0) return null;

    var giftKeywords = buildGiftKeywords();

    // A price cap named in the triggering query ("gifts under $75") must be
    // honored here too — this gift path doesn't go through cocoPickProducts, so
    // without this it used to return pieces over budget. Accuracy over count.
    var q = (query || '').toLowerCase();
    var giftBudget = cocoParseBudgetPhrase(q);
    var priceMax = giftBudget ? giftBudget.max : null;
    var priceMin = giftBudget ? giftBudget.min : null;
    // Fall back to the sticky active budget (e.g. re-render from updateMainGrid,
    // which passes no query) so the cap holds across the whole gift flow.
    if (priceMax == null && priceMin == null) { priceMax = _cocoBudget.max; priceMin = _cocoBudget.min; }

    // Gender target for this gift grid. A GENERIC gift is intentionally unisex
    // (Cavender's outfits the whole family), but an explicit "gift for him/her"
    // must exclude the opposite gender — otherwise "a gift for him" surfaces
    // women's dresses. This path runs BEFORE cocoMergeIntent updates the
    // conversation, so derive the recipient from the query text itself (with the
    // accumulated intent as a fallback for follow-up chips that drop the phrase).
    var giftGender = /\bfor (?:him|men)\b|\bhis\b/.test(q) ? 'Men'
      : /\bfor (?:her|women)\b|\bhers\b/.test(q) ? 'Women'
      : (_cocoConvo.intent.recipient === 'him' ? 'Men'
        : _cocoConvo.intent.recipient === 'her' ? 'Women' : null);
    var giftOpposite = giftGender === 'Men' ? 'women' : giftGender === 'Women' ? 'men' : null;
    var giftIsOpposite = function (p) {
      if (!giftOpposite || !window.SiteSearch || !window.SiteSearch.productGender) return false;
      return window.SiteSearch.productGender(p) === giftOpposite;
    };

    // Filter products matching gift keywords (and any stated budget + gender).
    var matches = _productCatalog.filter(function(p) {
      var haystack = (p.name || '') + ' ' + (p.category || '') + ' ' + (p.description || '');
      if (!giftKeywords.test(haystack)) return false;
      if (giftIsOpposite(p)) return false; // honor explicit "for him/her"
      if (priceMax != null && (parseFloat(p.price) || 0) > priceMax) return false;
      if (priceMin != null && (parseFloat(p.price) || 0) < priceMin) return false;
      return true;
    });

    // ── Pin two standout categories for the flow ── Search from full pool
    // BEFORE filtering shown products so pins always appear. Baked Cavender's
    // demo pins a buckle (#1) and a piece of western jewelry (#2); a generated
    // brand has no such fixed pair, so it pins from the persona's own top-2
    // favorite/interest categories instead (already Gemini-generated and
    // catalog-validated fields).
    var pinCategories = ['buckle', 'jewelry'];
    if (cocoHasGeneratedBrand()) {
      var interests = window.Persona && window.Persona.INTERESTS;
      pinCategories = []
        .concat((interests && interests.favoriteCategories) || [])
        .concat((interests && interests.categories) || [])
        .filter(Boolean)
        .map(function (c) { return String(c).toLowerCase(); })
        .slice(0, 2);
    }
    var pinned = [];
    var pendant = null;
    var secondPin = null;
    for (var i = 0; i < matches.length; i++) {
      var c = (matches[i].category || '').toLowerCase();
      if (!pendant && pinCategories[0] && c.indexOf(pinCategories[0]) !== -1) {
        pendant = matches[i];
      }
      if (!secondPin && pinCategories[1] && c.indexOf(pinCategories[1]) !== -1) {
        secondPin = matches[i];
      }
      if (pendant && secondPin) break;
    }
    if (pendant) pinned.push(pendant);
    if (secondPin) pinned.push(secondPin);

    // Remove already-shown products from the remaining pool (but never remove pinned)
    var remaining = matches.filter(function(p) {
      return p !== pendant && p !== secondPin;
    });
    if (_shownProducts.length > 0) {
      remaining = remaining.filter(function(p) {
        return _shownProducts.indexOf(p.name) === -1;
      });
    }
    remaining = remaining.sort(function() { return Math.random() - 0.5; });
    matches = pinned.concat(remaining).slice(0, 8);

    if (matches.length === 0) return null;

    // ── Also update the page product grid (featured or category) ──
    var pageGrid = document.getElementById('featured-grid') ||
                   document.getElementById('category-grid');
    if (pageGrid && window.Views && window.Views.productCard) {
      var gridProducts = matches.slice(0, 12); // show up to 12 on page
      pageGrid.innerHTML = gridProducts.map(function(p) {
        return window.Views.productCard(p, _productCatalog);
      }).join('');
      if (window.Views.staggerCards) window.Views.staggerCards(pageGrid);
      if (window.Views.wireQuickView) window.Views.wireQuickView(pageGrid);
    }

    var curation = matches.map(function(p) {
      return {
        template: 'retailProductRecs',
        ProductName: p.name,
        ProductBrand: BRAND_NAME,
        ProductDescription: p.description || '',
        ProductCategory: p.category || '',
        ProductFamily: p.family || '',
        ImageURL: p.image || ''
      };
    });

    var giftText = giftGender === 'Men'
      ? "Here are some finds he'll love unwrapping! 🎁 Thoughtful gifts for the guy on your list."
      : giftGender === 'Women'
      ? "Here are some finds she'll love unwrapping! 🎁 Thoughtful gifts she'll reach for."
      : "Here are some finds they'll love unwrapping! 🎁 Thoughtful gifts for everyone on your list.";
    return {
      text: giftText,
      curation: curation,
      options: [
        { name: 'Show me more gift ideas' },
        { name: 'What about gifts under $75?' },
        { name: 'Show me ' + navWords(2) },
        { name: 'Start over' }
      ]
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // HELP AGENT — deterministic post-purchase service engine
  //
  // Shares Cash's panel and chip pipeline (no new buttons). isHelpIntent()
  // is checked BEFORE cocoRespond in both routing seams (the text input's
  // handleSend and the webcuration:option chip listener). helpRespond()
  // classifies the message into one of five service topics, renders a
  // renderCuration() payload with mode:'help' (a "Cavender's Help" speaker
  // label + service chips), and — the revenue-retention beat — hands control
  // back to Cash via handBackToShopping() whenever the shopper is ready to buy.
  // All data comes from the mocked window.Orders; every flow is client-side.
  // ══════════════════════════════════════════════════════════════════

  // Care / warranty / repair knowledge — baked Cavender's western basics. Keyed
  // by a topic word found in the question.
  var HELP_KNOWLEDGE = {
    condition: 'For full-grain leather boots: brush off dirt, apply a thin coat of ' +
      'leather conditioner (like Bick 4) with a soft cloth, let it absorb, then buff. ' +
      'Condition every few weeks of wear — more often in dry climates.',
    resole: 'Yes — most welt-constructed western boots can be resoled. Bring them to any ' +
      BRAND_NAME + ' with a repair counter, or we can arrange a mail-in cobbler service. Turnaround ' +
      'is typically 2–3 weeks.',
    reshape: 'To reshape a felt hat, steam the crown and brim over a kettle for a few seconds, ' +
      'then gently mold it back and let it dry on a hat stand. Never store a hat brim-down — rest ' +
      'it on the crown or hang it.',
    clean: 'For a straw hat, wipe with a barely-damp cloth and mild soap; for felt, use a soft ' +
      'brush in the direction of the nap. Avoid soaking either.',
    warranty: 'Most brands we carry (Ariat, Justin, Lucchese and more) include a manufacturer ' +
      'warranty against defects in materials and workmanship. If your item has a defect, we’ll help ' +
      'you file a claim — just have your order number handy.'
  };

  // Care knowledge for a generated brand: prefer Gemini's own
  // BrandConfig.chatChips.careFaq (see builder/storefront-foundations.js),
  // matched to the routed topic key below; else a generic family-driven
  // blurb that never names a real competitor brand. Falls back gracefully
  // for a project generated before the chatChips field existed.
  function cocoHelpKnowledge() {
    if (!cocoHasGeneratedBrand()) return HELP_KNOWLEDGE;
    var bc = window.BrandConfig || {};
    var faqs = (bc.chatChips && Array.isArray(bc.chatChips.careFaq))
      ? bc.chatChips.careFaq.filter(function (f) { return f && f.topic && f.answer; })
      : [];
    var fam = defaultFamilyFallback().toLowerCase();
    var generic = {
      condition: 'Follow the care label for your ' + fam + ' — spot-clean as needed and store ' +
        'away from direct heat or sun.',
      resole: 'Bring it to any ' + BRAND_NAME + ' with a repair counter, or ask about a mail-in ' +
        'repair service.',
      reshape: 'Gently reshape structured pieces by hand and let them rest flat or on a stand — ' +
        'avoid direct heat.',
      clean: 'Wipe with a soft, barely-damp cloth and mild soap; avoid soaking.',
      warranty: 'Most items we carry include a manufacturer warranty against defects in materials ' +
        'and workmanship. If your item has a defect, we’ll help you file a claim — just have your ' +
        'order number handy.'
    };
    var resolved = {};
    Object.keys(generic).forEach(function (key) {
      var match = faqs.filter(function (f) { return String(f.topic).toLowerCase().indexOf(key) !== -1; })[0];
      resolved[key] = (match && match.answer) || generic[key];
    });
    return resolved;
  }

  // Which service topic does this text belong to? Returns a topic key or null.
  function helpTopic(text) {
    if (!text) return null;
    var q = text.toLowerCase();
    // Modify/cancel is checked before returns so an "I picked the wrong size,
    // change my order" (still-in-fulfillment fix) routes to modify, not a return.
    if (/\b(cancel|change my order|modify|update my order|edit my order)\b/.test(q) ||
        /change (my )?(shipping|address|quantity|size)/.test(q) ||
        /wrong (size|quantity|color|address|shipping)/.test(q)) return 'modify';
    if (/\b(return|returned|exchange|refund|does\s*n['’]?t fit|too small|too big|too tight|wrong size|send (it )?back)\b/.test(q)) return 'returns';
    if (/\b(where('?s| is| are)?\s+my|order status|track|tracking|shipped|shipping status|delivery|deliver|ready (for|to) pick ?up|pick ?up|bopis|arriv)\w*/.test(q)) return 'status';
    var loyaltyRe = new RegExp('\\b(points|rewards?|loyalty|redeem|my cavender|my ' +
      escapeRegExp(BRAND_NAME.toLowerCase()) + '|tier|birthday reward)\\b');
    if (loyaltyRe.test(q)) return 'loyalty';
    // Trailing \w* lets inflections match (resoled, reshaping, conditioning, repairs).
    if (/\b(condition|resole|re-?sole|reshape|re-?shape|clean|care|warranty|repair|guarantee|maintain)\w*/.test(q)) return 'care';
    return null;
  }

  function isHelpIntent(text) {
    return helpTopic(text) !== null;
  }

  // Broader matcher for tapped chips: catches the in-flow action chips the
  // Help Agent itself renders (which aren't plain topic keywords), so a tapped
  // "Redeem …" / "Track package" / "Find the right fit →" stays inside Help.
  function isHelpChip(name) {
    if (!name) return false;
    if (isHelpIntent(name)) return true;
    var q = name.toLowerCase().trim();
    // Prefix actions (may carry a label, e.g. "Redeem $25 Off Reward").
    if (/^(redeem |shop with my reward|find the right (fit|size)|find a better match|track package|track my order|exchange for a different (size|option)|return for refund|return or exchange|start a return|change size|change item|change shipping|start a warranty claim|find a repair option|care for something else|back to shopping)/.test(q)) return true;
    // Exact-match chips.
    return q === 'cancel order' || q === 'my rewards' || q === 'sign in' || q === 'keep shopping';
  }

  // Signed-out guard: every service flow needs the shopper's identity.
  function helpRequireSignIn() {
    renderHelp({
      text: 'I can pull up your orders, delivery status, and rewards once you’re signed in. ' +
        'Want to sign in? It only takes a second.',
      options: [{ name: 'Sign in' }, { name: 'Back to shopping' }]
    });
  }

  // Render a Help Agent reply (mode:'help' → speaker label + no shopping chrome),
  // and make sure the panel is open so the shopper sees the handoff.
  function renderHelp(payload) {
    payload.mode = 'help';
    if (!payload.speaker) payload.speaker = HELP_LABEL;
    renderCuration(payload);
    expandPanel();
  }

  // Hand back to Cash to keep shopping — seed a hint and let the shopper agent
  // curate. This is the service→commerce bridge.
  function handBackToShopping(query) {
    if (window.WebCuration && window.WebCuration.ask) {
      window.WebCuration.ask(query || 'Show me personalized recommendations');
    } else {
      cocoRespond(query || '');
    }
  }

  // Build a curation card array from real catalog products (for exchange /
  // "find the right fit" picks). Reuses the retailProductRecs template.
  function helpProductCards(products) {
    return (products || []).slice(0, 4).map(function (p) {
      return {
        template: 'retailProductRecs',
        ProductName: p.name,
        ProductBrand: BRAND_NAME,
        ProductDescription: p.description || '',
        ProductCategory: p.category || '',
        ProductFamily: p.family || '',
        ImageURL: p.image || ''
      };
    });
  }

  // Compact one-line summary of an order's hero item, for headlines.
  function helpOrderLine(order) {
    if (!order || !order.items || !order.items.length) return '';
    var it = order.items[0];
    var size = it.size ? ' · size ' + it.size + (it.width ? ' ' + it.width : '') : '';
    return order.id + ' — ' + it.name + size;
  }

  // ── The service router ────────────────────────────────────────────────────
  function helpRespond(text) {
    var Orders = window.Orders;
    if (!Orders) { handBackToShopping(text); return; }
    if (!isUserIdentified()) { helpRequireSignIn(); return; }

    var topic = helpTopic(text) || 'status';
    var q = (text || '').toLowerCase();

    // Direct chip actions (from a prior help reply) short-circuit classification.
    if (/^exchange for a different (size|option)/.test(q) || /^change (size|item)/.test(q)) return helpExchange();
    if (/^return or exchange/.test(q) || /^start a return/.test(q)) return helpReturnsIntro();
    if (/^return for refund/.test(q)) return helpReturn();
    if (/^find the right (fit|size)/.test(q) || /^find a better match/.test(q)) return helpFindFit();
    if (/^track package/.test(q) || /^track my order/.test(q)) return helpStatus(true);
    if (/^cancel (my )?order/.test(q) || q === 'cancel order') return helpCancel();
    if (/^change shipping/.test(q)) { window.Orders.modify(null, { shipping: 'changed' }); return helpModifyConfirm('shipping method'); }
    if (/^redeem/.test(q) || /^my rewards/.test(q)) { if (/^redeem/.test(q)) return helpRedeem(q); return helpLoyalty(); }
    if (/^shop with my reward/.test(q)) { handBackToShopping('Show me boots I can use my reward on'); return; }
    if (/^start a warranty claim/.test(q)) return helpWarrantyClaim();
    if (/^find a repair option/.test(q)) return helpRepair();
    if (/^care for something else/.test(q)) return helpCareMenu();
    if (/^back to shopping$/.test(q) || /^keep shopping$/.test(q)) { handBackToShopping('Show me personalized recommendations'); return; }
    if (q === 'sign in') { showIdentificationForm(document.getElementById(CURATION_CONTAINER_ID)); return; }

    switch (topic) {
      case 'returns': return helpReturnsIntro();
      case 'status':  return helpStatus(false);
      case 'loyalty': return helpLoyalty();
      case 'care':    return helpCare(text);
      case 'modify':  return helpModify();
      default:        return helpStatus(false);
    }
  }

  // Resolve "my boots" / most relevant order for the current question.
  function helpTargetOrder(prefFamily) {
    var Orders = window.Orders;
    return (prefFamily && Orders.byFamily(prefFamily)) || Orders.latest() || (Orders.list()[0] || null);
  }

  // The help-flow default when no specific family is named this turn: the
  // shopper's own persona family (already dynamic per brand via
  // setUserIdentity), else the family of their most recent order, else the
  // literal 'Boots' as a last-resort (baked-demo parity).
  function defaultHelpFamily() {
    var list = window.Orders && window.Orders.list();
    var lastOrderFamily = list && list[0] && list[0].items && list[0].items[0] && list[0].items[0].family;
    return _personaFamily || lastOrderFamily || defaultFamilyFallback();
  }

  // The absolute last-resort family name when nothing else is known: the
  // baked Cavender's literal 'Boots' for parity, else a generated brand's
  // own first real nav category / catalog family.
  function defaultFamilyFallback() {
    if (!cocoHasGeneratedBrand()) return 'Boots';
    var bc = window.BrandConfig || {};
    var cats = (Array.isArray(bc.navCategories) ? bc.navCategories : [])
      .filter(function (c) { return c && c !== 'All'; });
    if (cats.length) return cats[0];
    return (_productCatalog && _productCatalog[0] && _productCatalog[0].family) || 'items';
  }

  // Whether the shopper's order genuinely has a sizing concept — checked
  // against the catalog product's sizes[] (Gemini emits [] for non-sized
  // families like golf clubs). Baked Cavender's demo always has sizing.
  function orderHasSizing(order) {
    if (!cocoHasGeneratedBrand()) return true;
    if (!order || !order.items || !order.items.length) return true;
    var it = order.items[0];
    if (it.size) return true;
    var p = _productNameIndex[normaliseName(it.name)];
    return !!(p && Array.isArray(p.sizes) && p.sizes.length);
  }

  // 1. Returns & exchanges — fit-driven
  function helpReturnsIntro() {
    var order = helpTargetOrder(defaultHelpFamily());
    if (!order) { handBackToShopping(); return; }
    var sized = orderHasSizing(order);
    renderHelp({
      text: 'Sorry the fit isn’t right! I found ' + helpOrderLine(order) + '. Since it’s within ' +
        'the 60-day window, you can exchange it for ' + (sized ? 'another size/width' : 'a different option') +
        ' at no cost, or return it for a full refund. What would you like to do?',
      curation: helpProductCards(order.items.map(function (it) { return { name: it.name, image: it.image, family: it.family, description: '', category: '' }; })),
      options: [
        { name: sized ? 'Exchange for a different size' : 'Exchange for a different option' },
        { name: 'Return for refund' },
        { name: sized ? 'Find the right fit →' : 'Find a better match →' }
      ]
    });
  }

  function helpExchange() {
    var order = helpTargetOrder(defaultHelpFamily());
    var sized = orderHasSizing(order);
    var res = window.Orders.startExchange(order && order.id, null);
    renderHelp({
      text: (res.ok ? '✅ ' : '') + res.message,
      options: res.ok
        ? [{ name: sized ? 'Find the right fit →' : 'Find a better match →' }, { name: 'Back to shopping' }]
        : [{ name: 'Return for refund' }, { name: 'Back to shopping' }]
    });
  }

  function helpReturn() {
    var order = helpTargetOrder(defaultHelpFamily());
    var sized = orderHasSizing(order);
    var res = window.Orders.startReturn(order && order.id);
    renderHelp({
      text: (res.ok ? '✅ ' : '') + res.message,
      options: res.ok
        ? [{ name: sized ? 'Find the right fit →' : 'Find a better match →' }, { name: 'Back to shopping' }]
        : [{ name: 'Back to shopping' }]
    });
  }

  // The revenue-retention beat: hand back to Cash to find the correct
  // size/width/alternative in the same family.
  function helpFindFit() {
    var order = helpTargetOrder(defaultHelpFamily());
    var fam = (order && order.items[0] && order.items[0].family) || defaultFamilyFallback();
    var suffix = orderHasSizing(order) ? ' in the right size' : ' like this one';
    handBackToShopping('Show me ' + fam.toLowerCase() + ' like my last pair' + suffix);
  }

  // 2. Order status & pickup tracking (WISMO/BOPIS)
  function helpStatus(tracking) {
    var Orders = window.Orders;
    var order = helpTargetOrder(defaultHelpFamily());
    if (!order) { handBackToShopping(); return; }
    var s = order._state || {};
    var effStatus = s.status || order.status;
    var line;
    if (order.shipping && order.shipping.storePickup) {
      var sp = order.shipping.storePickup;
      line = sp.ready
        ? 'Your order is ready for pickup at the ' + sp.store + ' store — bring a photo ID.'
        : 'Your pickup order at ' + sp.store + ' is being prepared. ' + (sp.readyEta || 'We’ll text you when it’s ready.');
    } else if (effStatus === 'delivered') {
      line = 'Delivered — ' + (order.shipping ? order.shipping.eta : '') + '. Everything look good?';
    } else if (effStatus === 'canceled') {
      line = 'This order was canceled and your card was never charged.';
    } else {
      line = order.statusLabel + ' via ' + (order.shipping ? order.shipping.carrier : 'carrier') +
        '. Estimated arrival ' + (order.shipping ? order.shipping.eta : 'soon') + '.' +
        (tracking && order.shipping && order.shipping.tracking ? ' Tracking #' + order.shipping.tracking + '.' : '');
    }
    renderHelp({
      text: helpOrderLine(order) + '\n' + line,
      curation: helpProductCards(order.items.map(function (it) { return { name: it.name, image: it.image, family: it.family, description: '', category: '' }; })),
      options: [
        { name: 'Track package' },
        { name: 'Return or exchange' },
        { name: 'Back to shopping' }
      ]
    });
  }

  // 3. Loyalty points & rewards
  function helpLoyalty() {
    var l = window.Orders.loyalty();
    if (!l) { helpRequireSignIn(); return; }
    var pct = Math.round((l.pointsBalance / (l.nextRewardAt || (l.pointsBalance + l.pointsToNextReward))) * 100);
    var opts = l.rewards.filter(function (r) { return r.cost <= l.pointsBalance; })
      .map(function (r) { return { name: 'Redeem ' + r.label }; });
    opts.push({ name: 'Back to shopping' });
    renderHelp({
      speaker: HELP_LABEL + ' · ' + l.tier,
      text: 'You have ' + l.pointsBalance.toLocaleString() + ' points — just ' + l.pointsToNextReward +
        ' more to your next ' + (((window.BrandConfig || {}).loyalty || {}).rewardLabel || '$25 reward') + ' (' + pct + '% of the way there). Here’s what you can redeem right now:',
      segments: l.rewards.map(function (r) {
        return { name: r.label + (r.cost > l.pointsBalance ? ' · ' + r.cost + ' pts' : ' · ready') };
      }),
      options: opts
    });
  }

  function helpRedeem(q) {
    var l = window.Orders.loyalty();
    var reward = null;
    if (l) {
      for (var i = 0; i < l.rewards.length; i++) {
        if (q.indexOf(l.rewards[i].label.toLowerCase()) !== -1) { reward = l.rewards[i]; break; }
      }
    }
    var res = window.Orders.redeem(reward ? reward.id : 'birthday');
    renderHelp({
      text: (res.ok ? '🎉 ' : '') + res.message,
      options: res.ok
        ? [{ name: 'Shop with my reward →' }, { name: 'Back to shopping' }]
        : [{ name: 'Back to shopping' }]
    });
  }

  // 4. Product care, warranty & repair
  function helpCare(text) {
    var q = (text || '').toLowerCase();
    var key = /warranty|guarantee|defect/.test(q) ? 'warranty'
      : /resole|re-?sole/.test(q) ? 'resole'
      : /reshape|re-?shape/.test(q) ? 'reshape'
      : /clean/.test(q) ? 'clean'
      : 'condition';
    var knowledge = cocoHelpKnowledge();
    var answer = knowledge[key] || knowledge.condition;
    var opts = (key === 'warranty' || key === 'resole')
      ? [{ name: key === 'warranty' ? 'Start a warranty claim' : 'Find a repair option' }, { name: 'Back to shopping' }]
      : [{ name: 'Care for something else' }, { name: 'Back to shopping' }];
    renderHelp({ text: answer, options: opts });
  }

  function helpWarrantyClaim() {
    var order = helpTargetOrder(defaultHelpFamily());
    renderHelp({
      text: '✅ Warranty claim opened for ' + (order ? order.id : 'your order') + '. Our team will email ' +
        cocoPersonaEmail() + ' within one business day with a prepaid shipping label and next steps. ' +
        'You’ll keep wearing your other boots in the meantime.',
      options: [{ name: 'Back to shopping' }]
    });
  }

  function helpRepair() {
    renderHelp({
      text: '✅ I’ve queued a mail-in cobbler repair. Print the label we’ll email you, drop the boots ' +
        'at any FedEx location, and expect them back resoled in about 2–3 weeks.',
      options: [{ name: 'Back to shopping' }]
    });
  }

  // 5. Order modification / cancellation
  function helpModify() {
    var Orders = window.Orders;
    // The just-placed order is the one that can still change.
    var order = null, list = Orders.list();
    for (var i = 0; i < list.length; i++) { if (list[i].modifiable || list[i].cancelWindowOpen) { order = list[i]; break; } }
    order = order || Orders.latest();
    if (!order) { handBackToShopping(); return; }
    var st = order._state || {};
    if (st.canceled) {
      renderHelp({ text: order.id + ' is already canceled — your card was never charged.', options: [{ name: 'Back to shopping' }] });
      return;
    }
    var canChange = order.modifiable && !st.modified;
    renderHelp({
      text: helpOrderLine(order) + '\n' + (canChange
        ? 'This order is still ' + order.statusLabel.toLowerCase() + ', so I can still change it. What needs to change?'
        : 'This order has already entered fulfillment, so it can’t be modified — but I can help you start a free return once it arrives.'),
      options: canChange
        ? [{ name: orderHasSizing(order) ? 'Change size' : 'Change item' }, { name: 'Change shipping' }, { name: 'Cancel order' }, { name: 'Back to shopping' }]
        : [{ name: 'Return or exchange' }, { name: 'Back to shopping' }]
    });
  }

  function helpModifyConfirm(what) {
    renderHelp({
      text: '✅ Updated your ' + (what || 'order') + '. You’ll get a confirmation email at ' +
        cocoPersonaEmail() + '. Anything else?',
      options: [{ name: 'Cancel order' }, { name: 'Back to shopping' }]
    });
  }

  function helpCareMenu() {
    var fam = defaultFamilyFallback().toLowerCase();
    var options = cocoHasGeneratedBrand()
      ? [
          { name: 'How do I care for my ' + fam + '?' },
          { name: 'Can it be repaired?' },
          { name: 'How do I clean it?' },
          { name: 'Back to shopping' }
        ]
      : [
          { name: 'How do I condition my boots?' },
          { name: 'Can my boots be resoled?' },
          { name: 'How do I reshape my hat?' },
          { name: 'Back to shopping' }
        ];
    renderHelp({
      text: 'Happy to help with care. What can I walk you through?',
      options: options
    });
  }

  function helpCancel() {
    var Orders = window.Orders, list = Orders.list(), order = null;
    for (var i = 0; i < list.length; i++) { if (list[i].cancelWindowOpen) { order = list[i]; break; } }
    order = order || Orders.latest();
    var res = Orders.cancel(order && order.id);
    renderHelp({
      text: (res.ok ? '✅ ' : '') + res.message,
      options: res.ok
        ? [{ name: 'Back to shopping' }]
        : [{ name: 'Return or exchange' }, { name: 'Back to shopping' }]
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // DETERMINISTIC "COCO" CONVERSATION ENGINE
  // A 100% client-side, scripted multi-turn stylist. Every turn parses
  // the user's text (or tapped chip) with SiteSearch.parseIntent, merges
  // it into _cocoConvo.intent, and either asks one short follow-up (with
  // tappable quick-reply chips) or curates. It emits the SAME payload
  // shape the org would (`{text, curation:[retailProductRecs...], options}`)
  // and feeds it through renderCuration → updateMainGrid, so the panel AND
  // the homepage re-merchandise together. No network, fully deterministic.
  // ══════════════════════════════════════════════════════════════════

  // Quick-reply chip sets, keyed by step. Chips are click-first; the text
  // input stays available for free-form queries that skip ahead.
  var COCO_CHIPS = {
    who:      ['Treat myself', 'A gift for him', 'A gift for her', 'Just browsing'],
    occasion: ['Everyday', 'Wedding guest', 'Date night', 'Birthday gift', 'Vacation', 'Work'],
    color:    ['Brown', 'Black', 'Tan', 'Turquoise', 'Surprise me'],
    budget:   ['Under $75', '$75–150', 'Splurge-worthy']
  };

  function cocoHasGeneratedBrand() {
    var bc = window.BrandConfig || {};
    return !!((bc.navCategories && bc.navCategories.length) || (bc.trends && bc.trends.length));
  }

  // Top catalog colors by frequency, Title-cased. Derived so the color chips
  // (and COLOR_ALIASES below) always match colors that actually exist in the
  // loaded catalog — never a Western-wear default list for a generated brand.
  function derivedCatalogColors() {
    if (!_productCatalog || !_productCatalog.length) return [];
    var counts = {};
    _productCatalog.forEach(function (p) {
      (p.colors || []).forEach(function (c) {
        var cl = String(c || '').toLowerCase().trim();
        if (cl) counts[cl] = (counts[cl] || 0) + 1;
      });
    });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  }

  function cocoColorChipList() {
    if (!cocoHasGeneratedBrand()) return COCO_CHIPS.color;
    var colors = derivedCatalogColors().slice(0, 4).map(function (c) {
      return c.charAt(0).toUpperCase() + c.slice(1);
    });
    if (!colors.length) return COCO_CHIPS.color;
    return colors.concat('Surprise me');
  }

  // Occasion chips, derived from the brand's own trends[] (harness-guaranteed
  // to match >=1 real catalog product) so a golf/outdoor/etc. brand never
  // sees Western-wear occasions ("Wedding guest", "Date night") — mirrors the
  // cocoColorChipList()/derivedCatalogColors() pattern above.
  function cocoOccasionChipList() {
    if (!cocoHasGeneratedBrand()) return COCO_CHIPS.occasion;
    var bc = window.BrandConfig || {};
    var fromTrends = (Array.isArray(bc.trends) ? bc.trends : [])
      .map(function (t) { return t && t.label; })
      .filter(Boolean)
      .slice(0, 4);
    if (!fromTrends.length) return COCO_CHIPS.occasion;
    return ['Everyday', 'Gift'].concat(fromTrends);
  }

  // Whether asking about color/finish makes sense for this brand. Prefers
  // Gemini's own judgment (BrandConfig.chatFunnel.colorRelevant, already
  // safety-netted server-side against real catalog color diversity — see
  // storefront-config-generator.js); for brands generated before chatFunnel
  // existed (no chatFunnel.stages at all), fall back to the same safety-net
  // rule applied client-side so old configs get the fix without regenerating.
  function cocoColorRelevant() {
    if (!cocoHasGeneratedBrand()) return true; // baked Cavender's demo: unchanged.
    var bc = window.BrandConfig || {};
    var cf = bc.chatFunnel;
    if (cf && Array.isArray(cf.stages) && cf.stages.length) return !!cf.colorRelevant;
    return derivedCatalogColors().length >= 3;
  }

  // The AI chat funnel's stage order/vocabulary for this brand: an ordered
  // list of { key, question, chips }. Prefers Gemini's own authored funnel
  // (BrandConfig.chatFunnel.stages) when present/non-empty; otherwise falls
  // back to the legacy hardcoded who → occasion → color tree, with the
  // attribute (color) stage gated on cocoColorRelevant() — see cocoRespond().
  function cocoFunnelStages() {
    var bc = window.BrandConfig || {};
    var cf = bc.chatFunnel;
    if (cf && Array.isArray(cf.stages) && cf.stages.length) {
      var stages = cf.stages.slice();
      if (!stages.some(function (s) { return s.key === 'recipient'; })) {
        stages.unshift({
          key: 'recipient',
          question: 'Happy to help you find something special! Who are we shopping for?',
          chips: cocoWhoChipList()
        });
      } else {
        stages.sort(function (a, b) {
          return (a.key === 'recipient' ? -1 : 0) - (b.key === 'recipient' ? -1 : 0);
        });
      }
      return stages;
    }
    var legacy = [
      { key: 'recipient', question: 'Happy to help you find something special! Who are we shopping for?', chips: cocoWhoChipList() },
      { key: 'occasion', question: "Lovely. What's the occasion?", chips: cocoOccasionChipList() }
    ];
    if (cocoColorRelevant()) {
      legacy.push({ key: 'attribute', question: "Any color or finish you're drawn to? (Or I can surprise you.)", chips: cocoColorChipList() });
    }
    return legacy;
  }

  // Real dollar cut points for a generated brand's budget chips, derived from
  // the catalog's own stored priceTier field (budget/mid/premium — see
  // behavioral-harness.js's TIERS) instead of Cavender's $75/$150 literals.
  function catalogPriceBands() {
    if (!_productCatalog || !_productCatalog.length) return null;
    var budgetMax = 0, midMax = 0;
    _productCatalog.forEach(function (p) {
      var price = parseFloat(p.price) || 0;
      if (!price) return;
      if (p.priceTier === 'budget' && price > budgetMax) budgetMax = price;
      else if (p.priceTier === 'mid' && price > midMax) midMax = price;
    });
    if (!budgetMax || !midMax || midMax <= budgetMax) return null;
    return { lowMax: Math.round(budgetMax), midMax: Math.round(midMax) };
  }

  // The active low/mid price boundary — catalog-derived for a generated
  // brand, else the baked Cavender's $75/$150 split. Single source of truth
  // so the budget chip labels and every budget-phrase parser below (which
  // used to each hardcode their own copy of the same numbers) stay in sync.
  function cocoBudgetThresholds() {
    if (cocoHasGeneratedBrand()) {
      var bands = catalogPriceBands();
      if (bands) return bands;
    }
    return { lowMax: 75, midMax: 150 };
  }

  function cocoBudgetChipList() {
    if (!cocoHasGeneratedBrand()) return COCO_CHIPS.budget;
    var t = cocoBudgetThresholds();
    return ['Under $' + t.lowMax, '$' + t.lowMax + '–' + t.midMax, 'Splurge-worthy'];
  }

  // Parse a stated price phrase ("gifts under $75", "$75-150", "splurge")
  // into {max, min}, or null if the text states no price signal at all.
  // Generic (no baked-in dollar amounts) so it recognizes whatever numbers
  // cocoBudgetChipList() actually put on the chip the shopper tapped, for
  // ANY brand's thresholds — not just Cavender's 75/150.
  function cocoParseBudgetPhrase(q) {
    var range = q.match(/\$?(\d+)\s*(?:[–\-]|to)\s*\$?(\d+)/);
    if (range) return { max: parseFloat(range[2]), min: parseFloat(range[1]) };
    var under = q.match(/(?:under|below)\s*\$?(\d+)|\$?(\d+)\s+or\s+under/);
    if (under) return { max: parseFloat(under[1] || under[2]), min: null };
    // "treat myself" is deliberately excluded — see cocoUpdateBudget's history;
    // it's the WHO chip (shopping for oneself), not a splurge budget floor.
    if (/splurge|no budget|price is no object|money no object/.test(q)) {
      return { max: null, min: cocoBudgetThresholds().midMax };
    }
    return null;
  }

  // Colors/finishes we can detect in a product's description (mirrors the
  // catalog). Every term here is verified to appear in products.json, so a
  // detected color never dead-ends on an empty result.
  var COCO_STONES = ['turquoise', 'brown', 'black', 'tan', 'red', 'blue',
                     'pink', 'silver', 'leather', 'suede'];

  // Label (lowercased) -> sparse intent patch, populated whenever a chip list
  // is rendered from BrandConfig's baked {label, intent} shape (see
  // builder/storefront-foundations.js chip schema). cocoApplyChipIntent()
  // looks a clicked label up here so the click resolves via real,
  // generation-time-validated data instead of re-deriving meaning from the
  // label text through regexes tuned to a different reference brand.
  var _cocoChipIntents = {};

  function cocoRegisterChipIntent(label, intent) {
    if (!label || !intent) return;
    var hasField = intent.recipient || intent.occasion || intent.family || intent.type || intent.color;
    if (!hasField) return;
    _cocoChipIntents[String(label).toLowerCase()] = intent;
  }

  // Normalizes a chip list entry — a legacy bare string, or the baked
  // {label, intent} shape — to the {name} shape the DOM renderer expects,
  // registering any baked intent along the way for cocoApplyChipIntent().
  function cocoChips(names) {
    return (names || []).map(function (n) {
      if (n && typeof n === 'object') {
        cocoRegisterChipIntent(n.label, n.intent);
        return { name: n.label };
      }
      return { name: n };
    });
  }

  // Applies a clicked chip's baked intent (if the label matches one
  // registered by cocoChips()) directly onto the accumulated conversation
  // intent — bypassing free-text inference entirely for chip-driven turns.
  // Returns true when a baked intent was found and applied.
  function cocoApplyChipIntent(label) {
    var patch = _cocoChipIntents[String(label || '').toLowerCase()];
    if (!patch) return false;
    var it = _cocoConvo.intent;
    if (patch.recipient) it.recipient = patch.recipient;
    if (patch.occasion) it.occasion = patch.occasion;
    if (patch.family) it.family = patch.family;
    if (patch.type) it.type = patch.type;
    if (patch.color) it.color = patch.color;
    it._hasProductSignal = it._hasProductSignal || !!(patch.family || patch.type);
    it._lastText = label;
    return true;
  }

  // The standard "welcome"/reset chip set: the who-shopping chips, PLUS the
  // signed-in service chips (Track my order / Start a return / My rewards) when
  // a shopper is identified. Centralized so EVERY entry point that rebuilds the
  // welcome (showWelcome, Start Over, "a gift instead", the "who?" step) shows
  // the same options — signed-in shoppers never lose their help buttons after a
  // reset. Optionally append extra chips (e.g. 'Start over') via `extra`.
  // "Who's this for" chips: no catalog attribute to derive this from (it's
  // about the shopper's relationship to the purchase, not a product trait),
  // so a generated brand sources it from Gemini's own BrandConfig.chatChips.who
  // (see builder/storefront-foundations.js), with a brand-neutral generic
  // fallback when that field is missing/malformed.
  function cocoWhoChipList() {
    if (!cocoHasGeneratedBrand()) return COCO_CHIPS.who;
    var bc = window.BrandConfig || {};
    var chatWho = bc.chatChips && Array.isArray(bc.chatChips.who) ? bc.chatChips.who.filter(Boolean) : [];
    if (chatWho.length) return chatWho;
    return ['Treat myself', 'A gift', 'Just browsing'];
  }

  function cocoWelcomeOptions(extra) {
    var opts = cocoChips(cocoWhoChipList());
    if (isUserIdentified()) {
      opts = opts.concat(cocoChips(['Track my order', 'Start a return', 'My rewards']));
    }
    if (extra && extra.length) opts = opts.concat(cocoChips(extra));
    return opts;
  }

  // Detect a stone/metal word in free text (chips like "Turquoise" or a
  // sentence like "something in blues"). Returns a lowercase stone term or null.
  function cocoDetectColor(text) {
    if (!text) return null;
    var q = text.toLowerCase();
    // For a generated brand, match directly against the catalog's own colors[]
    // vocabulary first (identity — the chip text in cocoColorChipList() comes
    // from this same list, so a tapped chip always resolves).
    if (cocoHasGeneratedBrand()) {
      var catalogColors = derivedCatalogColors();
      for (var ci = 0; ci < catalogColors.length; ci++) {
        if (q.indexOf(catalogColors[ci]) !== -1) return catalogColors[ci];
      }
    }
    if (/surprise|any|whatever|don'?t care|no preference/.test(q)) return 'any';
    // Friendly color/stone words → a term that ACTUALLY appears in the baked
    // Cavender's catalog's name/description text (there is no color field).
    // For a generated brand, derivedCatalogColors() above (plus the
    // surprise-me catch-all just before this) is the only source of truth —
    // these Western-specific words (turquoise/saddle/suede/leather) would
    // otherwise leak into a non-Western catalog's color detection.
    if (cocoHasGeneratedBrand()) return null;
    var COLOR_ALIASES = {
      'blue': 'blue', 'blues': 'blue', 'teal': 'turquoise', 'aqua': 'turquoise',
      'navy': 'blue', 'turquoise': 'turquoise',
      'pink': 'pink', 'blush': 'pink', 'rose': 'pink',
      'red': 'red', 'burgundy': 'red', 'wine': 'red',
      'brown': 'brown', 'chocolate': 'brown', 'cognac': 'brown', 'saddle': 'brown',
      'tan': 'tan', 'sand': 'tan', 'camel': 'tan', 'honey': 'tan',
      'black': 'black', 'silver': 'silver'
    };
    for (var alias in COLOR_ALIASES) {
      if (q.indexOf(alias) !== -1) return COLOR_ALIASES[alias];
    }
    for (var i = 0; i < COCO_STONES.length; i++) {
      if (q.indexOf(COCO_STONES[i]) !== -1) return COCO_STONES[i];
    }
    return null;
  }

  // Merge a user turn into the accumulated conversation intent.
  function cocoMergeIntent(text) {
    var it = _cocoConvo.intent;
    var parsed = (window.SiteSearch && window.SiteSearch.parseIntent)
      ? window.SiteSearch.parseIntent(text) : null;
    var q = (text || '').toLowerCase();

    // Recipient (Cavender's outfits the whole family — men, women & kids)
    if (/for her|for women|her\b|my (sister|mom|mother|wife|girlfriend|friend|daughter|bff)/.test(q)) it.recipient = 'her';
    else if (/for him|for men|his\b|my (brother|dad|father|husband|boyfriend|son)/.test(q)) it.recipient = 'him';
    else if (/treat myself|for myself|for me\b/.test(q)) it.recipient = 'self';
    else if (/a gift|gift|present/.test(q) && !it.recipient) it.recipient = 'gift';

    // Occasion (from parseIntent's CONCEPT_MAP activity, plus a few phrasings)
    if (parsed && parsed.activity) it.occasion = parsed.activity;
    if (/beach wedding/.test(q)) it.occasion = 'wedding';
    else if (/\bwedding\b/.test(q) && !it.occasion) it.occasion = 'wedding';
    else if (/\beveryday\b|every day|daily/.test(q) && !it.occasion) it.occasion = 'everyday';

    // Color / stone
    var color = cocoDetectColor(text);
    if (color) it.color = color;

    // Budget
    if (parsed && parsed.priceMax != null) it.priceMax = parsed.priceMax;
    if (parsed && parsed.priceMin != null) it.priceMin = parsed.priceMin;
    // "treat myself" excluded on purpose — it's the WHO chip (shopping for
    // oneself), not a splurge budget. Reading it as a floor collapsed color
    // picks (e.g. "Treat myself" → "Black" left the single black item over budget).
    var budgetPhrase = cocoParseBudgetPhrase(q);
    if (budgetPhrase) { it.priceMax = budgetPhrase.max; it.priceMin = budgetPhrase.min; }

    // Did the query name a concrete thing to shop for? Only a specific style
    // category (e.g. "booties") or a product family (e.g. "Boots") counts —
    // NOT the loose typeCategories/keywords that CONCEPT_MAP also expands for
    // occasion words ("everyday", "gift"), which must still run the funnel.
    it._hasProductSignal = !!(parsed && (
      (parsed.categories && parsed.categories.length) ||
      parsed.family
    ));
    // Let a newly-named family overwrite the prior turn's — each new message
    // should be treated as its own query (matching the plain search bar),
    // not perpetually re-biased toward whatever family the first turn named.
    // BUT only on a genuine, specific product signal (a real style category),
    // not a loose concept/activity match (e.g. "everyday"/"gift" can set
    // parsed.family via a single-family trend hit) — otherwise an unrelated
    // later turn can drift the family to one with zero matching SKUs and
    // silently zero out results.
    if (parsed && parsed.family && parsed.categories && parsed.categories.length) it.family = parsed.family;

    // Carry the last free-text so the search query is descriptive
    it._lastText = text;
    return it;
  }

  // Resolve a chip-baked occasion label to its real, catalog-validated trend
  // (with its compiled `.filter`, the same mechanism toBrandConfigJs wires up
  // for the trending-search chips) — so an occasion can be applied as a
  // direct structured filter instead of re-tokenized as free text. Returns
  // null when the label doesn't match any real trend (e.g. a free-typed or
  // misauthored occasion) so callers can fall back safely.
  function cocoResolveOccasionTrend(occasionLabel) {
    var trends = (window.BrandConfig && window.BrandConfig.trends) || [];
    for (var i = 0; i < trends.length; i++) {
      if (trends[i].label === occasionLabel && typeof trends[i].filter === 'function') return trends[i];
    }
    return null;
  }

  // Build a natural-language search query from the accumulated intent so we
  // can reuse SiteSearch's stable ranking.
  function cocoComposeQuery() {
    var it = _cocoConvo.intent;
    var parts = [];
    if (it.occasion) parts.push(it.occasion);
    if (it.recipient === 'her') parts.push('for her');
    else if (it.recipient === 'him') parts.push('for him');
    else if (it.recipient === 'gift') parts.push('gift');
    if (it.color && it.color !== 'any') parts.push(it.color);
    if (it.priceMax) parts.push('under $' + it.priceMax);
    // Fall back to the raw text so a bare "boots" still searches.
    if (parts.length === 0 && it._lastText) parts.push(it._lastText);
    var q = parts.join(' ').trim() || (it._lastText || 'popular items');
    // Soft bias toward the family the shopper is currently browsing (seeded by
    // autoCurate on category nav). Appended, never overriding their own words.
    if (it.family && q.toLowerCase().indexOf(it.family.toLowerCase()) === -1) {
      q = q + ' ' + it.family;
    }
    // A chip-baked sub-type ("Driver") is MORE authoritative than family —
    // append it too so SiteSearch's type-aware scoring (search-engine.js)
    // narrows the row instead of returning the whole family.
    if (it.type && q.toLowerCase().indexOf(it.type.toLowerCase()) === -1) {
      q = q + ' ' + it.type;
    }
    return q;
  }

  // Collapse "<Style> ... in <Color>" duplicates so Coco never lists one piece
  // in eight colors. Keeps first (best-ranked) representative per style.
  function cocoStyleKey(p) {
    return ((p.family || '') + '|' + (p.name || '').toLowerCase().replace(/\s+in\s+.+$/i, '').trim());
  }
  function cocoCollapse(list) {
    var seen = {}, out = [];
    list.forEach(function (p) {
      var k = cocoStyleKey(p);
      if (!seen[k]) { seen[k] = 1; out.push(p); }
    });
    return out;
  }

  // Turn a slice of catalog products into a curation payload.
  function cocoBuildCuration(products, headline, options) {
    // The Cash agent panel is hard-capped at 6 products for ANY query, so
    // widening the search engine's grid (search-bar color queries) never
    // enlarges the panel. "Complete the Look" bundleSuggestions below are
    // separate extras and are NOT counted against this 6.
    var picks = cocoCollapse(products).slice(0, 6);
    if (picks.length === 0) return null;

    // Re-merchandise the homepage grid + heading in the same pass.
    var pageGrid = document.getElementById('featured-grid') ||
                   document.getElementById('category-grid');
    if (pageGrid && window.Views && window.Views.productCard) {
      var gridProducts = picks.slice(0, 12);
      pageGrid.innerHTML = gridProducts.map(function (p) {
        return window.Views.productCard(p, _productCatalog);
      }).join('');
      if (window.Views.staggerCards) window.Views.staggerCards(pageGrid);
      if (window.Views.wireQuickView) window.Views.wireQuickView(pageGrid);
      cocoRelabelGrid(pageGrid);
    }

    var curation = picks.map(function (p) {
      return {
        template: 'retailProductRecs',
        ProductName: p.name,
        ProductBrand: BRAND_NAME,
        ProductDescription: p.description || '',
        ProductCategory: p.category || '',
        ProductFamily: p.family || '',
        ImageURL: p.image || ''
      };
    });

    // A couple of "Complete the Look" suggestions from a different family —
    // deduped by style so they're distinct pieces, not color variants.
    var bundles = [];
    var firstFamily = picks[0] && picks[0].family;
    var pickKeys = {};
    picks.forEach(function (p) { pickKeys[cocoStyleKey(p)] = 1; });
    var bundleKeys = {};
    // Honor the chosen color/stone for bundle picks too, so an opal look isn't
    // completed with off-color earrings. If nothing in a complement family
    // matches the stone, we simply show no bundle rather than a mismatched one.
    var bundleColor = (_cocoConvo.intent.color && _cocoConvo.intent.color !== 'any')
      ? _cocoConvo.intent.color : null;
    var bundleMax = _cocoConvo.intent.priceMax;
    var bundleMin = _cocoConvo.intent.priceMin;
    // Which families complete firstFamily's look — reuses the SAME derived
    // lookComplements map search-engine.js builds (from BrandConfig.lookComplements
    // or a round-robin over the real catalog families), so this bundle picker
    // never stays hardwired to Belts/Accessories/Hats for a generated brand.
    var completeFamilies = (window.SiteSearch && window.SiteSearch.getLookComplements
      ? window.SiteSearch.getLookComplements()[firstFamily] : null) || ['Belts', 'Accessories', 'Hats'];
    var complements = cocoCollapse(_productCatalog).filter(function (cp) {
      if (!(cp.family && cp.family !== firstFamily && cp.image &&
        completeFamilies.indexOf(cp.family) !== -1)) return false;
      // Keep bundle picks inside the shopper's budget too.
      if (bundleMax != null && (cp.price || 0) > bundleMax) return false;
      if (bundleMin != null && (cp.price || 0) < bundleMin) return false;
      if (bundleColor) {
        var d = ((cp.description || '') + ' ' + (cp.name || '')).toLowerCase();
        if (d.indexOf(bundleColor) === -1) return false;
      }
      return true;
    });
    for (var i = 0; i < complements.length && bundles.length < 2; i++) {
      var cp = complements[i];
      var k = cocoStyleKey(cp);
      if (pickKeys[k] || bundleKeys[k]) continue;
      bundleKeys[k] = 1;
      bundles.push({
        ProductName: cp.name,
        ProductCategory: cp.category || '',
        ProductFamily: cp.family || '',
        ImageURL: cp.image || ''
      });
    }

    var defaultOptions = ['Show me something else'];
    if (cocoColorRelevant()) defaultOptions.push('Different color');
    defaultOptions.push('Start over');
    return {
      text: headline,
      curation: curation,
      bundleSuggestions: bundles,
      options: cocoChips(options || defaultOptions)
    };
  }

  // Re-label the "New Arrivals" heading above the featured grid to match intent.
  function cocoRelabelGrid(grid) {
    var it = _cocoConvo.intent;
    var section = grid.closest('.section');
    if (!section) return;
    var heading = section.querySelector('.section-heading');
    if (!heading) return;
    var label = 'Curated for You';
    var occLabels = {
      wedding: 'For the Wedding', birthday: 'Birthday Picks', graduation: 'Graduation Gifts',
      anniversary: 'Anniversary Keepsakes', 'date night': 'Date Night Ready',
      everyday: 'Everyday Favorites', work: 'Workday Essentials', vacation: 'Vacation Ready',
      party: 'Party Perfect', 'wedding guest': 'Wedding Guest Picks',
      'gift for her': 'Gifts for Her', holiday: 'Holiday Gifting'
    };
    if (it.occasion && occLabels[it.occasion]) label = occLabels[it.occasion];
    else if (it.recipient === 'gift') label = 'Gift Ideas';
    else if (it.recipient === 'self') label = 'Just for You';
    if (it.color && it.color !== 'any') {
      var pretty = it.color.charAt(0).toUpperCase() + it.color.slice(1);
      label = pretty + ' Picks';
    }
    heading.textContent = label;
  }

  // ── Shared gender targeting ──────────────────────────────────────────────
  // Single source of truth for "which gender should this curation surface?",
  // used by EVERY product-selection path (cocoPickProducts, buildGiftCuration)
  // so they can't disagree. Rules, in order:
  //   - explicit recipient 'him' → Men, 'her' → Women (always wins);
  //   - 'gift' → null: this brand outfits any shopper, so a generic gift is
  //     intentionally unisex (no exclusion) regardless of the signed-in persona's gender;
  //   - 'self' or no recipient → the signed-in persona's OWN gender
  //     (BrandConfig.persona.gender), else null when signed out (neutral search).
  // Mirrors the hard-exclusions in search-engine.js so all paths agree.
  function cocoTargetGender() {
    var it = _cocoConvo.intent;
    if (it.recipient === 'him') return 'Men';
    if (it.recipient === 'her') return 'Women';
    if (it.recipient === 'gift') return null;
    if (!isUserIdentified()) return null;
    var g = (window.BrandConfig && window.BrandConfig.persona && window.BrandConfig.persona.gender) || '';
    return g === 'men' ? 'Men' : g === 'women' ? 'Women' : null;
  }
  // True when product p is the opposite of the target gender. Untagged/unisex
  // items are never excluded. Safe if SiteSearch isn't ready yet.
  function cocoIsOppositeGender(p) {
    var target = cocoTargetGender();
    var opposite = target === 'Men' ? 'women' : target === 'Women' ? 'men' : null;
    if (!opposite || !window.SiteSearch || !window.SiteSearch.productGender) return false;
    return window.SiteSearch.productGender(p) === opposite;
  }

  // Filter the catalog by the accumulated color + budget, using SiteSearch's
  // ranking for the occasion/recipient query. Deterministic: same intent → same picks.
  function cocoPickProducts() {
    var it = _cocoConvo.intent;
    var isOppositeGender = cocoIsOppositeGender;

    var results = [];
    // Structured signals first, direct catalog filters, no free-text search —
    // same principle as the trending-search chip fix: apply a real, already-
    // validated filter directly instead of re-tokenizing it as prose.
    var occasionTrend = it.occasion ? cocoResolveOccasionTrend(it.occasion) : null;
    if (occasionTrend) {
      results = _productCatalog.filter(occasionTrend.filter);
    } else if (it.type) {
      var wantedType = String(it.type).toLowerCase();
      results = _productCatalog.filter(function (p) { return String(p.type || '').toLowerCase() === wantedType; });
    }
    if (results.length === 0 && window.SiteSearch && window.SiteSearch.search) {
      var res = window.SiteSearch.search(cocoComposeQuery());
      results = (res && res.results) ? res.results.slice() : [];
    }
    // Fallback to the full catalog if search came up empty.
    if (results.length === 0) results = _productCatalog.slice();

    // Enforce the target gender on the PRIMARY result set — not just the
    // backfills below. SiteSearch already hard-excludes the opposite gender for
    // explicit "for him/her" queries, but the catalog fallback above and any
    // query that doesn't surface a gender word would otherwise leak opposite-
    // gender items straight through. One filter here guarantees every path agrees.
    results = results.filter(function (p) { return !isOppositeGender(p); });

    // Post-filter by detected stone/color (lives in name/description, not a
    // field). Accuracy over count: when a color/stone is explicitly chosen we
    // ALWAYS narrow to the exact matches — even if that leaves only one or two —
    // rather than keeping off-color items to hit a target number. If nothing
    // matches, results goes empty and the caller shows a graceful "no match".
    if (it.color && it.color !== 'any') {
      var stone = it.color;
      var stoneMatch = function (p) {
        var d = ((p.description || '') + ' ' + (p.name || '')).toLowerCase();
        return d.indexOf(stone) !== -1;
      };
      results = results.filter(stoneMatch);
      // SiteSearch assembles results into family "look" rows, which can drop
      // most of a stone's inventory when it lives outside the lead family (e.g.
      // turquoise sits in jewelry/belts/hats, not boots). When the color filter
      // leaves us thin, backfill with the SAME color from the full catalog so we
      // surface every matching piece — never relaxing the color, and honoring the
      // target gender so no opposite-gender items leak in.
      if (results.length < 8) {
        var haveName = {};
        results.forEach(function (p) { haveName[p.name] = 1; });
        _productCatalog.forEach(function (p) {
          if (haveName[p.name] || !stoneMatch(p)) return;
          if (isOppositeGender(p)) return; // honor recipient/persona gender
          haveName[p.name] = 1;
          results.push(p);
        });
      }
    }
    // Post-filter by budget. Accuracy over count, same as color: when the
    // shopper sets a price cap ("gifts under $75") we ALWAYS drop anything over
    // it — never keep pricier pieces just to fill the grid. Fewer accurate
    // results (or a graceful "no match") beats an out-of-budget item.
    if (it.priceMax != null) {
      results = results.filter(function (p) { return (parseFloat(p.price) || 0) <= it.priceMax; });
    }
    // Price FLOOR is soft: catalog tops out under $100, so a high "splurge"
    // minimum could wipe everything. Only narrow if it leaves something.
    if (it.priceMin != null) {
      var premium = results.filter(function (p) { return (parseFloat(p.price) || 0) >= it.priceMin; });
      if (premium.length) results = premium;
    }

    // Drop already-shown products for freshness across turns. When the narrow
    // query is exhausted (e.g. repeated "Show me more like this" taps), backfill
    // with other unseen catalog pieces — respecting color/budget where possible —
    // so a repeat tap always surfaces something new instead of the same grid.
    if (_shownProducts.length > 0) {
      var fresh = results.filter(function (p) { return _shownProducts.indexOf(p.name) === -1; });
      if (fresh.length < 8) {
        var seen = {};
        fresh.forEach(function (p) { seen[p.name] = 1; });
        // Backfill pool: full catalog minus shown, filtered by the same
        // color/budget constraints the shopper set (falls back to any unseen).
        var backfill = _productCatalog.filter(function (p) {
          if (seen[p.name] || _shownProducts.indexOf(p.name) !== -1) return false;
          if (isOppositeGender(p)) return false; // honor recipient/persona gender
          if (it.color && it.color !== 'any') {
            var d = ((p.description || '') + ' ' + (p.name || '')).toLowerCase();
            if (d.indexOf(it.color) === -1) return false;
          }
          if (it.priceMax != null && (p.price || 0) > it.priceMax) return false;
          if (it.priceMin != null && (p.price || 0) < it.priceMin) return false;
          return true;
        });
        // If constrained backfill is thin, relax to any unseen catalog piece —
        // but ONLY when no specific color/stone was chosen. With a color set we
        // never relax the constraint (that's what used to leak off-color items
        // once the stone's pool was exhausted across "show me more" taps);
        // instead we surface fewer, accurate pieces.
        var colorLocked = it.color && it.color !== 'any';
        var budgetLocked = it.priceMax != null || it.priceMin != null;
        if (!colorLocked && !budgetLocked && fresh.length + backfill.length < 4) {
          backfill = _productCatalog.filter(function (p) {
            if (isOppositeGender(p)) return false; // still honor gender
            return !seen[p.name] && _shownProducts.indexOf(p.name) === -1;
          });
        }
        fresh = fresh.concat(backfill);
      }
      if (fresh.length > 0) results = fresh;
    }
    return results;
  }

  // Warm, on-brand headline for the curated result.
  function cocoResultHeadline() {
    var it = _cocoConvo.intent;
    var occ = it.occasion;
    var color = (it.color && it.color !== 'any')
      ? it.color.charAt(0).toUpperCase() + it.color.slice(1) : null;
    if (occ === 'wedding') return "Here's what I'd wear to the wedding ✨" + (color ? ' — leaning into ' + color + '.' : '');
    if (occ === 'graduation') return "Perfect finds to mark the moment 🎓" + (color ? ' In ' + color + ', just like you asked.' : '');
    if (occ === 'birthday') return "Birthday-worthy gear they'll love 🎂" + (color ? ' Featuring ' + color + '.' : '');
    if (occ === 'anniversary') return "Timeless pieces for a milestone worth celebrating ✨";
    if (occ === 'date night') return "Date-night-ready picks 💃" + (color ? ' In ' + color + '.' : '');
    if (occ === 'everyday') return "Effortless everyday gear to reach for on repeat ☀️";
    if (it.recipient === 'self') return "Treat-yourself picks — you earned it ✨" + (color ? ' All in ' + color + '.' : '');
    if (it.recipient === 'gift' || it.recipient === 'her' || it.recipient === 'him')
      return "Great finds they'll love unwrapping 🎁" + (color ? ' In ' + color + '.' : '');
    if (color) return "Great pieces in " + color + " — hand-picked for you ✨";
    return "Here are some great finds I think you'll love ✨";
  }

  // Pure funnel-stage satisfaction predicate — the ONE place that decides
  // whether a given stage (recipient/occasion/attribute) is satisfied by
  // the accumulated intent `it` (+ turn count). Exported as
  // window.WebCuration.cocoStageSatisfiedBy so the Node harness can import
  // the REAL predicate instead of reimplementing it (Tier 3 — see 2.4,
  // where a chip's intent.occasion was silently ignored because nothing
  // checked it against what the "occasion" stage's real logic reads).
  function cocoStageSatisfiedBy(stageKey, it, turns) {
    it = it || {};
    turns = turns || 0;
    // How much do we know? We curate as soon as we have EITHER an occasion
    // or a recipient plus (color known OR the user has answered >=2 turns).
    var hasFocus = !!(it.occasion || it.recipient || it._hasProductSignal);
    var hasColor = !!it.color;
    // A concrete product query (e.g. "gold hoops") is enough on its own —
    // curate right away rather than asking who/occasion/color and
    // discarding the search.
    var enough = (hasFocus && (hasColor || turns >= 3)) || it._hasProductSignal;
    if (stageKey === 'recipient') return hasFocus;
    if (stageKey === 'occasion') return !!it.occasion || enough || turns >= 2;
    // A chosen occasion that resolves to a real, catalog-validated trend
    // filter is already a complete answer — skip the generic gear-type
    // follow-up rather than offer chips that can conflict with the
    // occasion's own theme (e.g. "Drivers" after an apparel-only occasion).
    if (stageKey === 'attribute') return hasColor || !!it.type || !!it.family || enough || !!cocoResolveOccasionTrend(it.occasion);
    return true;
  }

  // Decide the next scripted step and emit the reply payload.
  // Flow: (recipient?) → (occasion?) → (color?) → curate. First rich message
  // can skip straight to curate. Every step offers tappable chips.
  function cocoRespond(userText) {
    _userHasAsked = true; // unlock homepage grid re-merchandising
    _cocoConvo.turns++;

    // Post-curation follow-up chips: re-open a specific question instead of
    // re-parsing the chip label as a fresh query.
    var q = (userText || '').toLowerCase();
    if (/start over|start again|new search|reset|restart/.test(q)) {
      _cocoConvo = { step: 'who', intent: {}, turns: 0 };
      _shownProducts = [];
      window.WebCuration.render({
        text: "Fresh start! Who are we shopping for?",
        options: cocoWelcomeOptions()
      });
      expandPanel();
      return;
    }
    if (/different color|another color|change (the )?color/.test(q)) {
      if (cocoColorRelevant()) {
        delete _cocoConvo.intent.color;
        _cocoConvo.step = 'color';
        window.WebCuration.render({
          text: "Sure! What color or finish should I lean into?",
          options: cocoChips(cocoColorChipList().concat('Start over'))
        });
        expandPanel();
        return;
      }
      // Color isn't a relevant attribute for this brand — treat a stray typed
      // "different color" the same as "show me more like this" rather than
      // asking a question that doesn't apply.
      q = 'show me more like this';
    }
    if (/a gift instead|gift instead|shopping for someone|for someone else/.test(q)) {
      _cocoConvo = { step: 'who', intent: {}, turns: 1 };
      window.WebCuration.render({
        text: "Of course — who are we treating?",
        options: cocoWelcomeOptions()
      });
      expandPanel();
      return;
    }
    // "Just browsing" / "Show me popular products" / "Show me personalized
    // pieces" — vague chips that shouldn't loop back to "who?". Curate a
    // general bestseller grid so they always land on products.
    if (/just browsing|show me popular|popular products|personalized piece/.test(q)) {
      _cocoConvo.step = 'curate';
      _cocoConvo.intent._lastText = 'popular items';
      var browseProducts = cocoPickProducts();
      var browsePayload = cocoBuildCuration(
        browseProducts,
        "A few of our most-loved finds to get you started ✨",
        ['Show me more like this', 'A gift for her', 'Start over']
      );
      if (browsePayload) {
        window.WebCuration.render(browsePayload);
        expandPanel();
        return;
      }
    }

    // "Show me more like this" / "something else" — keep the accumulated intent
    // and re-curate, leaning on cocoPickProducts' freshness backfill to surface
    // NEW pieces rather than re-asking a question or repeating the same grid.
    if (/more like this|show me more(?! gift)|something else|see more|more options/.test(q)) {
      _cocoConvo.step = 'curate';
      var moreProducts = cocoPickProducts();
      var moreFollowups = ['Show me more like this'];
      if (cocoColorRelevant()) moreFollowups.push('Try a different color');
      moreFollowups.push('Something under $' + cocoBudgetThresholds().lowMax, 'Start over');
      var morePayload = cocoBuildCuration(
        moreProducts,
        "A few more you might love ✨",
        moreFollowups
      );
      if (morePayload) {
        window.WebCuration.render(morePayload);
        expandPanel();
        return;
      }
    }

    // Chip-driven turns resolve via real, generation-time-baked intent — the
    // turn-count safety net below is only ever needed for genuinely typed
    // free text, which stays on the regex-based cocoMergeIntent path.
    var chipMatched = userText ? cocoApplyChipIntent(userText) : false;
    if (userText && !chipMatched) cocoMergeIntent(userText);
    else if (userText) console.log('[WebCuration] Chip "' + userText + '" resolved via baked intent — skipping free-text parsing.');
    var it = _cocoConvo.intent;

    // Steps 1-3: walk this brand's funnel stages (recipient → occasion →
    // attribute/color, or a Gemini-authored order/vocabulary via
    // BrandConfig.chatFunnel) and ask the first one not yet satisfied.
    // cocoStageSatisfiedBy is the ONE satisfaction predicate — shared with
    // the Node harness (behavioral-harness.js's stage-satisfaction
    // invariant) so a chip's baked intent field is checked against the
    // exact same logic the live funnel uses, not a second guess at it.
    var funnelStages = cocoFunnelStages();
    for (var fsi = 0; fsi < funnelStages.length; fsi++) {
      var stage = funnelStages[fsi];
      var satisfied = cocoStageSatisfiedBy(stage.key, it, _cocoConvo.turns);
      if (!satisfied) {
        _cocoConvo.step = stage.key === 'recipient' ? 'who' : (stage.key === 'attribute' ? 'color' : stage.key);
        window.WebCuration.render({
          text: stage.question,
          options: stage.key === 'recipient' ? cocoWelcomeOptions() : cocoChips((stage.chips || []).concat('Start over'))
        });
        expandPanel();
        return;
      }
    }

    // Step 4: curate.
    _cocoConvo.step = 'curate';
    var products = cocoPickProducts();
    var colorRelevant = cocoColorRelevant();
    var followups = ['Show me more like this'];
    if (colorRelevant) followups.push('Try a different color');
    followups.push('Something under $' + cocoBudgetThresholds().lowMax, 'Start over');
    var payload = cocoBuildCuration(products, cocoResultHeadline(), followups);
    if (!payload) {
      window.WebCuration.render({
        text: colorRelevant
          ? "Hmm, I couldn't find a match for that — want to try a different color or occasion?"
          : "Hmm, I couldn't find a match for that — want to try a different occasion?",
        options: cocoChips(['Everyday', 'A gift', 'Surprise me'])
      });
      expandPanel();
      return;
    }
    window.WebCuration.render(payload);
    expandPanel();
  }

  // ── Checkout Intent Detection ──
  function isCheckoutIntent(text) {
    if (!text) return false;
    var q = text.toLowerCase().trim();
    return /\b(check\s*out|checkout|place\s*order|buy\s*now|purchase|complete\s*order|view\s*cart\s*&?\s*checkout|proceed\s*to\s*checkout)\b/.test(q);
  }

  // ── Agent In-Panel Checkout Flow ──
  var _agentCheckoutStep = 0; // 0=summary, 1=shipping, 2=confirm
  var _agentShippingData = {};
  var _agentDeliveryMethod = 'ship'; // 'ship' | 'pickup'
  var _agentPickupStore = null;

  function renderAgentCheckout() {
    console.log('[WebCuration] Rendering agent checkout, step:', _agentCheckoutStep);
    expandPanel();

    var container = document.getElementById(CURATION_CONTAINER_ID);
    if (!container) return;

    if (_cart.length === 0) {
      // Empty cart
      container.innerHTML =
        '<div class="curation-panel-wrapper">' +
          '<div class="curation-header">' +
            '<div class="curation-ai-badge"><span class="curation-ai-icon">🛒</span> Cart</div>' +
          '</div>' +
          '<p class="curation-text" style="text-align:center;padding:24px">Your cart is empty. Add some items first!</p>' +
          '<div class="curation-options">' +
            '<button class="curation-option-btn" onclick="window.dispatchEvent(new CustomEvent(\'webcuration:option\',{detail:{name:\'Show me popular products\'}}))">Show me popular products</button>' +
          '</div>' +
        '</div>';
      return;
    }

    if (_agentCheckoutStep === 0) renderAgentCartSummary(container);
    else if (_agentCheckoutStep === 1) renderAgentShipping(container);
    else renderAgentConfirmation(container);
  }

  function renderAgentCartSummary(container) {
    var total = getCartTotal();
    var tax = Math.round(total * 0.0875 * 100) / 100;
    var grandTotal = Math.round((total + tax) * 100) / 100;

    var html = '<div class="curation-panel-wrapper">' +
      '<div class="curation-header">' +
        '<div class="curation-ai-badge"><span class="curation-ai-icon">🛒</span> Your Cart</div>' +
      '</div>' +
      '<p class="curation-text">Here\'s what\'s in your cart. Ready to check out?</p>' +
      '<div class="agent-cart-items">';

    _cart.forEach(function(item) {
      var priceNum = parseFloat(item.price) || 0;
      var qty = item.quantity || 1;
      var imgSrc = item.image || '';
      html += '<div class="agent-cart-item">' +
        (imgSrc ? '<img class="agent-cart-item-img" src="' + escapeHtml(imgSrc) + '" alt="">' :
          '<div class="agent-cart-item-img" style="display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-size:1.2rem">🛍️</div>') +
        '<div class="agent-cart-item-info">' +
          '<div class="agent-cart-item-name">' + escapeHtml(item.name) + '</div>' +
          '<div class="agent-cart-item-meta">Qty: ' + qty + '</div>' +
          '<button class="agent-cart-item-wishlist" ' +
            'data-name="' + escapeHtml(item.name) + '" ' +
            'data-image="' + escapeHtml(imgSrc) + '" ' +
            'data-price="' + escapeHtml(String(item.price || '')) + '">' +
            (window.Views && window.Views.isWishlisted && window.Views.isWishlisted(item.name)
              ? '❤️ Wishlisted' : '🤍 Add to Wishlist') +
          '</button>' +
        '</div>' +
        '<div class="agent-cart-item-price">$' + (priceNum * qty).toFixed(2) + '</div>' +
      '</div>';
    });

    html += '</div>' +
      '<div class="agent-cart-totals">' +
        '<div class="agent-cart-total-row"><span>Subtotal</span><span>$' + total.toFixed(2) + '</span></div>' +
        '<div class="agent-cart-total-row"><span>Tax</span><span>$' + tax.toFixed(2) + '</span></div>' +
        '<div class="agent-cart-total-row agent-cart-grand-total"><span>Total</span><span>$' + grandTotal.toFixed(2) + '</span></div>' +
      '</div>' +
      '<div class="curation-options">' +
        '<button class="curation-option-btn curation-option-checkout" id="agent-ck-proceed">✅ Complete Order</button>' +
        '<button class="curation-option-btn" id="agent-ck-fullpage">🖥️ Full Checkout Page</button>' +
        '<button class="curation-option-btn" id="agent-ck-continue">Continue Shopping</button>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    // Wire up per-item Add to Wishlist buttons
    container.querySelectorAll('.agent-cart-item-wishlist').forEach(function(wb) {
      wb.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.Views && window.Views.toggleWishlist) {
          var added = window.Views.toggleWishlist(
            this.getAttribute('data-name'),
            this.getAttribute('data-image'),
            this.getAttribute('data-price')
          );
          this.textContent = added ? '❤️ Wishlisted' : '🤍 Add to Wishlist';
          this.classList.toggle('wishlisted', !!added);
          if (window.Views.refreshWishlistHearts) window.Views.refreshWishlistHearts();
        }
      });
    });

    document.getElementById('agent-ck-proceed').addEventListener('click', function() {
      _agentCheckoutStep = 1;
      renderAgentCheckout();
    });
    document.getElementById('agent-ck-fullpage').addEventListener('click', function() {
      _agentCheckoutStep = 0;
      if (window.Router) window.Router.navigate('/checkout');
    });
    document.getElementById('agent-ck-continue').addEventListener('click', function() {
      _agentCheckoutStep = 0;
      // Back to the chat: re-render the greeting, then keep the panel open
      // (showWelcome collapses to the bubble by default).
      window.WebCuration.showWelcome();
      expandPanel();
    });
  }

  function renderAgentShipping(container) {
    var _p = (window.BrandConfig && window.BrandConfig.persona) || {};
    var _pid = _p.identity || {};
    var _pprof = _p.profile || {};
    // Parse "Fort Worth, TX" → city / state; fall back to the demo default.
    var _loc = (_pprof.location || 'Fort Worth, TX').split(',');
    _agentShippingData = {
      name: _pid.name || cocoPersonaName(),
      // No street-address field exists in the persona schema (see
      // builder/storefront-foundations.js) — a generic placeholder, never a
      // real competitor's HQ address, regardless of which brand is loaded.
      address: '100 Main St',
      city: (_loc[0] || 'Fort Worth').trim(),
      state: (_loc[1] || 'TX').trim(),
      zip: '00000',
      email: _pid.email || cocoPersonaEmail()
    };

    var html = '<div class="curation-panel-wrapper">' +
      '<div class="curation-header">' +
        '<div class="curation-ai-badge"><span class="curation-ai-icon">📦</span> Delivery</div>' +
      '</div>' +
      '<p class="curation-text">How would you like to get it? Store pickup is ready in the next 24 hours.</p>' +
      '<div class="agent-delivery">' +
        '<label class="agent-delivery-option' + (_agentDeliveryMethod === 'ship' ? ' agent-delivery-option--active' : '') + '" id="agent-delivery-ship">' +
          '<input type="radio" name="agent-delivery" value="ship"' + (_agentDeliveryMethod === 'ship' ? ' checked' : '') + '>' +
          '<div><div class="agent-delivery-title">🚚 Standard Shipping</div>' +
            '<div class="agent-delivery-sub">Arrives in 3–5 business days · Free</div></div>' +
        '</label>' +
        '<label class="agent-delivery-option' + (_agentDeliveryMethod === 'pickup' ? ' agent-delivery-option--active' : '') + '" id="agent-delivery-pickup">' +
          '<input type="radio" name="agent-delivery" value="pickup"' + (_agentDeliveryMethod === 'pickup' ? ' checked' : '') + '>' +
          '<div><div class="agent-delivery-title">🏬 Pick Up In Store <span class="agent-delivery-badge">24 hrs</span></div>' +
            '<div class="agent-delivery-sub">Skip the wait — grab it today or tomorrow · Free</div></div>' +
        '</label>' +
      '</div>' +
      '<div id="agent-store-list" class="agent-store-list"></div>' +
      '<div class="agent-shipping-card" id="agent-ship-card">' +
        '<div class="agent-shipping-row"><strong>' + escapeHtml(_agentShippingData.name) + '</strong></div>' +
        '<div class="agent-shipping-row">' + escapeHtml(_agentShippingData.address) + '</div>' +
        '<div class="agent-shipping-row">' + escapeHtml(_agentShippingData.city + ', ' + _agentShippingData.state + ' ' + _agentShippingData.zip) + '</div>' +
        '<div class="agent-shipping-row">' + escapeHtml(_agentShippingData.email) + '</div>' +
        '<div class="agent-shipping-row" style="margin-top:8px;color:#10b981;font-weight:600">🚚 Free Shipping · Arrives in 3-5 business days</div>' +
      '</div>' +
      '<div class="agent-payment-card">' +
        '<div class="agent-payment-visual">' +
          '<span>•••• •••• •••• 4242</span>' +
          '<span style="font-size:0.8rem;opacity:0.7">12/28</span>' +
        '</div>' +
      '</div>' +
      '<div class="curation-options">' +
        '<button class="curation-option-btn curation-option-checkout" id="agent-ck-confirm">🔒 Place Order</button>' +
        '<button class="curation-option-btn" id="agent-ck-back">← Back to Cart</button>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    function getStores() {
      return (window.Views && window.Views.nearbyStores)
        ? window.Views.nearbyStores(_agentShippingData.city, _agentShippingData.state)
        : [];
    }
    function renderAgentStoreList() {
      var listEl = document.getElementById('agent-store-list');
      if (!listEl) return;
      var stores = getStores();
      if (!_agentPickupStore || stores.every(function (s) { return s.name !== _agentPickupStore.name; })) {
        _agentPickupStore = stores[0] || null;
      }
      listEl.innerHTML = stores.map(function (s, i) {
        var active = _agentPickupStore && _agentPickupStore.name === s.name;
        return '<label class="agent-store-card' + (active ? ' agent-store-card--active' : '') + '" data-idx="' + i + '">' +
          '<input type="radio" name="agent-store"' + (active ? ' checked' : '') + '>' +
          '<div class="agent-store-body"><div class="agent-store-name">' + escapeHtml(s.name) + '</div>' +
            '<div class="agent-store-addr">' + escapeHtml(s.addr) + ' · ' + escapeHtml(s.distance) + ' away</div></div>' +
          '<span class="agent-store-ready">✓ ' + escapeHtml(s.ready) + '</span>' +
        '</label>';
      }).join('');
      listEl.querySelectorAll('.agent-store-card').forEach(function (card) {
        card.addEventListener('click', function () {
          _agentPickupStore = stores[parseInt(card.getAttribute('data-idx'), 10)] || stores[0];
          renderAgentStoreList();
        });
      });
    }
    function setAgentDelivery(method) {
      _agentDeliveryMethod = method;
      var shipOpt = document.getElementById('agent-delivery-ship');
      var pickOpt = document.getElementById('agent-delivery-pickup');
      if (shipOpt) shipOpt.classList.toggle('agent-delivery-option--active', method === 'ship');
      if (pickOpt) pickOpt.classList.toggle('agent-delivery-option--active', method === 'pickup');
      var listEl = document.getElementById('agent-store-list');
      var shipCard = document.getElementById('agent-ship-card');
      if (method === 'pickup') {
        renderAgentStoreList();
        if (listEl) listEl.style.display = 'block';
        if (shipCard) shipCard.style.display = 'none';
      } else {
        _agentPickupStore = null;
        if (listEl) { listEl.style.display = 'none'; listEl.innerHTML = ''; }
        if (shipCard) shipCard.style.display = 'block';
      }
    }
    var aShip = document.querySelector('#agent-delivery-ship input');
    var aPick = document.querySelector('#agent-delivery-pickup input');
    if (aShip) aShip.addEventListener('change', function () { setAgentDelivery('ship'); });
    if (aPick) aPick.addEventListener('change', function () { setAgentDelivery('pickup'); });
    setAgentDelivery(_agentDeliveryMethod);

    document.getElementById('agent-ck-confirm').addEventListener('click', function() {
      var btn = this;
      btn.textContent = 'Processing...';
      btn.disabled = true;
      btn.style.opacity = '0.7';
      setTimeout(function() {
        _agentCheckoutStep = 2;
        renderAgentCheckout();
      }, 1200);
    });
    document.getElementById('agent-ck-back').addEventListener('click', function() {
      _agentCheckoutStep = 0;
      renderAgentCheckout();
    });
  }

  function renderAgentConfirmation(container) {
    var total = getCartTotal();
    var tax = Math.round(total * 0.0875 * 100) / 100;
    var grandTotal = Math.round((total + tax) * 100) / 100;
    var orderNum = 'CAV-2026-' + String(Math.floor(10000 + Math.random() * 90000));

    var itemsList = '';
    _cart.forEach(function(item) {
      var qty = item.quantity || 1;
      itemsList += escapeHtml(item.name) + (qty > 1 ? ' ×' + qty : '') + ', ';
    });
    itemsList = itemsList.replace(/, $/, '');

    var html = '<div class="curation-panel-wrapper">' +
      '<div class="curation-header">' +
        '<div class="curation-ai-badge"><span class="curation-ai-icon">✨</span> Order Confirmed</div>' +
      '</div>' +
      '<div class="agent-confirmation">' +
        '<div class="agent-conf-icon">✓</div>' +
        '<h3 style="margin:0 0 4px">Order Placed!</h3>' +
        '<p class="agent-conf-order-num">Order: <strong>' + orderNum + '</strong></p>' +
        '<div class="agent-conf-details">' +
          '<p><strong>Items:</strong> ' + itemsList + '</p>' +
          '<p><strong>Total:</strong> $' + grandTotal.toFixed(2) + '</p>' +
          (_agentDeliveryMethod === 'pickup' && _agentPickupStore
            ? '<p><strong>🏬 Pick up at:</strong> ' + escapeHtml(_agentPickupStore.name) + ' · ' +
                escapeHtml(_agentPickupStore.ready) + '</p>'
            : '<p><strong>Ships to:</strong> ' + escapeHtml(_agentShippingData.name || cocoPersonaName()) + ', ' +
                escapeHtml(_agentShippingData.city || 'Fort Worth') + ', ' +
                escapeHtml(_agentShippingData.state || 'TX') + '</p>') +
          '<p style="color:#10b981;font-weight:600;margin-top:8px">📧 Confirmation sent to ' + escapeHtml(_agentShippingData.email || cocoPersonaEmail()) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="curation-options">' +
        '<button class="curation-option-btn" id="agent-ck-done">Continue Shopping</button>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    // Clear cart
    clearCart();
    _agentCheckoutStep = 0;

    document.getElementById('agent-ck-done').addEventListener('click', function() {
      window.WebCuration.showWelcome();
      expandPanel();
    });
  }

  /**
   * Handle option button clicks - sends message back to agent
   */
  function handleOptionClick(optionName) {
    console.log('[WebCuration] Option clicked:', optionName);
    // Dispatch custom event for the agent script to pick up
    window.dispatchEvent(new CustomEvent('webcuration:option', {
      detail: { name: optionName }
    }));
  }

  /**
   * Escape HTML to prevent XSS. Safe for both element-body and attribute
   * contexts — the textContent→innerHTML trick only escapes &, <, >, which
   * leaves quote-based attribute breakouts (e.g. alt=" onerror=...") viable.
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Clear the curation zone
   */
  function clearCuration() {
    const container = document.getElementById(CURATION_CONTAINER_ID);
    if (container) {
      container.innerHTML = '';
    }
  }

  /**
   * The launcher is a small circular chat bubble that lives in the bottom-right
   * corner, independent of the panel. Collapsed = only the bubble shows; the
   * whole chat interface is tucked away. Clicking it opens the full chat box
   * (which scales out of the bubble's corner). It's created once and reused.
   */
  function ensureLauncher() {
    var launcher = document.getElementById('curation-launcher');
    if (launcher) return launcher;
    launcher = document.createElement('button');
    launcher.id = 'curation-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Chat with ' + AGENT_NAME);
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>' +
      '</svg>';
    launcher.addEventListener('click', function () { expandPanel(); });
    document.body.appendChild(launcher);
    return launcher;
  }

  /**
   * A single persistent close button, anchored just outside the top-right
   * corner of the chat panel. Lives on the panel's .container (a sibling of the
   * scrolling wrapper) so it never scrolls out of reach — the shopper can exit
   * from any scroll position without scrolling back to the top.
   */
  function ensureCloseButton() {
    var container = document.querySelector('.curation-section > .container');
    if (!container) return null;
    var btn = container.querySelector('.curation-close-btn-fixed');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.className = 'curation-close-btn-fixed';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Close chat');
    btn.innerHTML = '&times;';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      collapsePanel();
    });
    container.appendChild(btn);
    return btn;
  }

  function collapsePanel() {
    var section = document.querySelector('.curation-section');
    if (section) section.classList.add('curation-collapsed');
    var launcher = ensureLauncher();
    launcher.classList.remove('curation-launcher-hidden');
  }

  function expandPanel() {
    // Keep the panel collapsed (bubble only) while NGA voice agent is active
    if (document.body.classList.contains('nga-voice-active')) return;
    var section = document.querySelector('.curation-section');
    if (section) section.classList.remove('curation-collapsed');
    var launcher = ensureLauncher();
    launcher.classList.add('curation-launcher-hidden');
    ensureCloseButton();
  }

  // ── Smart loading messages based on query context ──
  var _lastUserQuery = '';

  // Per-category messages are keyed off the generated brand's own nav
  // categories, so the vocabulary travels with the brand instead of being
  // fixed to one vertical. A few universal (non-category) messages round it out.
  function buildLoadingMessages() {
    var msgs = {
      everyday:  'Curating easy everyday pieces… ✨',
      compare:   'Setting up a side-by-side… ⚖️',
      recommend: 'Handpicking recommendations… ✨',
      personal:  'Tailoring picks just for you… 🎯'
    };
    var cats = (window.BrandConfig && window.BrandConfig.navCategories) || [];
    cats.filter(function (c) { return c && c !== 'All'; }).forEach(function (cat) {
      var key = String(cat).toLowerCase();
      msgs[key] = 'Finding the perfect ' + key + '… ✨';
    });
    return msgs;
  }
  var _loadingMessages = buildLoadingMessages();

  function getSmartLoadingMessage(query) {
    if (!query) return AGENT_NAME + ' is finding the perfect pieces for you…';
    var q = query.toLowerCase();
    for (var keyword in _loadingMessages) {
      if (q.indexOf(keyword) !== -1) return _loadingMessages[keyword];
    }
    return AGENT_NAME + ' is finding the perfect pieces for you… ✨';
  }

  /**
   * Show loading state in curation zone (keeps chat input interactive).
   */
  function showLoading(query) {
    if (query) _lastUserQuery = query;
    const container = document.getElementById(CURATION_CONTAINER_ID);
    if (!container) return;
    container.innerHTML = '';
    var loadingText = getSmartLoadingMessage(_lastUserQuery);
    var wrapper = document.createElement('div');
    wrapper.className = 'curation-wrapper';
    wrapper.innerHTML = '\
      <div class="curation-header">\
        <span class="curation-badge">\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>\
          </svg>\
          AI Curated\
        </span>\
      </div>\
      <p class="curation-loading-text">' + escapeHtml(loadingText) + '</p>\
      <div class="curation-products">\
        <div class="curation-product-card skeleton-card"><div class="curation-product-image curation-loading"></div><div class="curation-product-body"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:80%"></div><div class="skeleton-line short" style="width:40%"></div></div></div>\
        <div class="curation-product-card skeleton-card"><div class="curation-product-image curation-loading"></div><div class="curation-product-body"><div class="skeleton-line" style="width:70%"></div><div class="skeleton-line" style="width:55%"></div><div class="skeleton-line short" style="width:35%"></div></div></div>\
      </div>\
    ';
    container.appendChild(wrapper);
    appendChatInput(wrapper);
    expandPanel();
    wrapper.scrollTop = 0;

    // Safety net: if something painted this skeleton and no response ever
    // replaces it (e.g. a live-agent send that silently fails), don't hang
    // forever — after 8s, if the skeleton is still on screen, degrade to a
    // graceful retry prompt.
    if (_loadingTimer) { clearTimeout(_loadingTimer); }
    _loadingTimer = setTimeout(function () {
      _loadingTimer = null;
      var c = document.getElementById(CURATION_CONTAINER_ID);
      if (!c || !c.querySelector('.skeleton-card')) return; // already replaced
      window.WebCuration.render({
        text: "Sorry — I couldn't pull that up just now. Want to try again?",
        options: cocoChips(['Start over', 'Everyday', 'A gift'])
      });
    }, 8000);
  }

  /**
   * Show email identification form inside the curation panel.
   * On submit, stores identity and tells the agent so future queries can be personalized.
   */
  function showIdentificationForm(parentContainer) {
    var form = document.createElement('div');
    form.className = 'curation-identify-form';
    form.innerHTML =
      '<div class="curation-identify-form-inner">' +
        '<p class="curation-identify-form-title">🔒 Sign in for personalized recommendations</p>' +
        '<p class="curation-identify-form-subtitle">Your email connects your browsing with Data Cloud for a tailored experience.</p>' +
        '<input type="email" class="curation-identify-input" placeholder="Enter your email address" autocomplete="email" />' +
        '<div class="curation-identify-form-actions">' +
          '<button class="curation-identify-submit btn btn-dark">Get Personalized Recs</button>' +
          '<button class="curation-identify-skip">Skip for now</button>' +
        '</div>' +
      '</div>';

    // Replace identification card with the form
    var existingCard = parentContainer.querySelector('.curation-identify-card');
    if (existingCard) {
      existingCard.replaceWith(form);
    } else {
      var wrapper = parentContainer.querySelector('.curation-wrapper');
      if (wrapper) wrapper.appendChild(form);
    }

    var emailInput = form.querySelector('.curation-identify-input');
    var submitBtn = form.querySelector('.curation-identify-submit');
    var skipBtn = form.querySelector('.curation-identify-skip');

    submitBtn.addEventListener('click', function () {
      var email = emailInput.value.trim();
      if (!email || email.indexOf('@') === -1) {
        emailInput.style.borderColor = '#ef4444';
        emailInput.setAttribute('placeholder', 'Please enter a valid email');
        return;
      }
      // Single demo persona: any email signs in as Rachel Morris.
      var rachel = (window.Persona && window.Persona.RACHEL) || { name: 'Rachel Morris', firstName: 'Rachel' };
      var identity = { email: email, name: rachel.name, firstName: rachel.firstName, memberSince: rachel.memberSince };
      setUserIdentity(identity);
      window.dispatchEvent(new CustomEvent('identity:changed', { detail: identity }));

      // Replace form with success message
      form.innerHTML =
        '<div class="curation-identify-success">' +
          '<p>✅ Welcome, ' + escapeHtml(rachel.firstName) + '! Your experience is now personalized.</p>' +
        '</div>';

      // Re-render the current route so every surface reflects Rachel's persona.
      if (window.Router && window.Router.render) window.Router.render();

      // The 'identity:changed' listener (below) re-renders the welcome now that
      // we're signed in, so the greeting, shopping chips, AND service chips
      // (Track my order / Start a return / My rewards) appear immediately — no
      // page refresh — and the panel opens to show them.
    });

    skipBtn.addEventListener('click', function () {
      form.remove();
    });

    emailInput.focus();
  }

  /**
   * Render a neutral welcome state with the chat input ready.
   * Called once SSE is up. Starts collapsed to a pill so the page content
   * is visible; user clicks the pill to expand and chat.
   */
  function getSeasonalGreeting() {
    var month = new Date().getMonth(); // 0-11
    var name = isUserIdentified() ? ', ' + (_userIdentity.firstName || _userIdentity.name) : '';
    var intro = "Hi" + name + "! %EMOJI% I'm " + AGENT_NAME + ", your " + BRAND_NAME + " " + AGENT_ROLE + ". ";
    var cats = navWords(2);
    if (month >= 11 || month <= 1) {
      // Winter (Dec-Feb)
      return intro.replace('%EMOJI%', '❄️') + "Let's get you geared up for the season. Try \"Show me " + cats + "\" or \"What's new?\"";
    } else if (month >= 2 && month <= 4) {
      // Spring (Mar-May)
      return intro.replace('%EMOJI%', '🌸') + "New season, new favorites — let me help you find your look. Try \"Show me " + cats + "\" or \"What's new this season?\"";
    } else if (month >= 5 && month <= 7) {
      // Summer (Jun-Aug)
      return intro.replace('%EMOJI%', '☀️') + "Perfect time to find your next favorite. Try \"Show me " + cats + "\" or \"What's trending?\"";
    } else {
      // Fall (Sep-Nov)
      return intro.replace('%EMOJI%', '🍂') + "Great picks are calling. Try \"Show me " + cats + "\" or \"What makes a great gift?\"";
    }
  }

  function showWelcome(keepOpen) {
    // In deterministic mode, offer tappable "who" chips on the very first
    // turn so the whole demo is driveable by clicking (typing stays optional).
    var welcome = { text: getSeasonalGreeting() };
    if (!USE_LIVE_AGENT) {
      _cocoConvo = { step: 'who', intent: {}, turns: 0 };
      // who-chips + (when signed in) the service chips, so the Help Agent is
      // reachable without a dedicated button (chips-only).
      welcome.options = cocoWelcomeOptions();
    }
    renderCuration(welcome);
    sessionStorage.setItem('nto_chat_seen', '1');
    // Default: start collapsed as a small chat bubble so the greeting/chips are
    // ready but don't take screen space until opened. On sign-in (keepOpen) we
    // expand instead, so the freshly-added service chips are visible at once.
    if (keepOpen) expandPanel();
    else collapsePanel();
  }

  // Expose global API
  window.WebCuration = {
    render: renderCuration,
    clear: clearCuration,
    showLoading: showLoading,
    showWelcome: showWelcome,
    collapse: collapsePanel,
    expand: expandPanel,
    registerTemplate: function(name, renderFn) {
      templateRegistry[name] = renderFn;
    },
    setUserIdentity: setUserIdentity,
    getUserIdentity: getUserIdentity,
    isUserIdentified: isUserIdentified,
    _addToCart: addToCart,
    _removeFromCart: removeFromCart,
    _updateCartQuantity: updateCartQuantity,
    _getCart: getCart,
    _getCartTotal: getCartTotal,
    _getCartItemCount: getCartItemCount,
    _clearCart: clearCart
  };

  // This script loads asynchronously (after the header's inline script has
  // already run its one-time syncHeader() call on page load), so a returning
  // shopper's identity hydrated from sessionStorage above wouldn't otherwise
  // reach the header. Re-announce it via the same 'identity:changed' event the
  // header already listens for, so it stays in sync on refresh.
  if (_userIdentity && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('identity:changed', { detail: _userIdentity }));
  }

  // ──────────────────────────────────────────────────────────────────────
  // Product catalog cache for prose → curation recovery.
  // Loaded once from /js/products.json (the same file views.js uses).
  // ──────────────────────────────────────────────────────────────────────
  var _productCatalog = null;       // Array once loaded
  var _productCatalogPromise = null; // dedup fetches
  var _productNameIndex = {};       // lowercase name → product object

  function loadProductCatalog() {
    if (_productCatalog) return Promise.resolve(_productCatalog);
    if (_productCatalogPromise) return _productCatalogPromise;
    // Generated brands stash their catalog on window.__HOLO_PREVIEW_PRODUCTS
    // (see brand-config.js) — prefer it so a ?holo= preview never falls back
    // to the baked Cavender's catalog, mirroring search-engine.js/views.js/orders.js.
    var fetchProducts = (Array.isArray(window.__HOLO_PREVIEW_PRODUCTS) && window.__HOLO_PREVIEW_PRODUCTS.length)
      ? Promise.resolve(window.__HOLO_PREVIEW_PRODUCTS.slice())
      : fetch((window.APP_BASE_PATH || '') + '/js/products.json').then(function (r) { return r.json(); });
    _productCatalogPromise = fetchProducts
      .then(function (products) {
        _productCatalog = products;
        // Build a lookup index keyed by normalised product name.
        // Normalise: lowercase, collapse smart-quotes / accents, trim.
        products.forEach(function (p) {
          var key = normaliseName(p.name);
          if (key && !_productNameIndex[key]) {
            _productNameIndex[key] = p;
          }
        });
        console.log('[WebCuration] Product catalog loaded (' + products.length + ' items)');
        // Enrich any legacy cart items now that catalog is available
        migrateCartItems();
        return products;
      })
      .catch(function (err) {
        console.warn('[WebCuration] Could not load product catalog:', err);
        _productCatalog = [];
        return [];
      });
    return _productCatalogPromise;
  }

  function normaliseName(s) {
    if (!s) return '';
    return s.replace(/&#39;/g, "'")                         // HTML entity apostrophe
            .replace(/&amp;/g, '&')                         // HTML entity ampersand
            .replace(/&quot;/g, '"')                        // HTML entity quote
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')   // HTML entity angle brackets
            .toLowerCase()
            .replace(/[\u2018\u2019\u201C\u201D]/g, "'")   // smart quotes
            .replace(/[^a-z0-9' ]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
  }

  /**
   * Look up a product from the local catalog by name.
   * Uses fuzzy matching: exact first, then substring containment.
   */
  function findProductByName(name) {
    if (!_productCatalog) return null;
    var key = normaliseName(name);
    if (!key) return null;

    // Exact match
    if (_productNameIndex[key]) return _productNameIndex[key];

    // Substring containment (catalog name contains search or vice-versa)
    for (var i = 0; i < _productCatalog.length; i++) {
      var catKey = normaliseName(_productCatalog[i].name);
      if (catKey.indexOf(key) !== -1 || key.indexOf(catKey) !== -1) {
        return _productCatalog[i];
      }
    }
    return null;
  }

  /**
   * Attempt to parse an agent prose response into a curation payload.
   *
   * The Atlas planner can reformat the Apex JSON into several prose styles:
   *
   * Style A — Numbered list:
   *   1. Elisa Pendant Necklace
   *   Category: Necklaces / Pendants. Description text...
   *
   * Style B — Freeform paragraph (no numbers):
   *   Here are products matching your search. Elisa Pendant Necklace Category:
   *   Necklaces / Pendants. A dainty everyday layer... Tessa Statement Earrings
   *   Category: Earrings / Drops. Bold, sculptural drops...
   *
   * Style C — Product names embedded in conversational prose:
   *   I found some great options! The Elisa Pendant is perfect for layering...
   *
   * We use three strategies in order:
   *   1. Numbered-list regex
   *   2. "ProductName Category:" pattern splitting
   *   3. Catalog-scan: match all known product names from the catalog
   */
  function tryParseProseProducts(text) {
    if (typeof text !== 'string') return null;

    var curation = null;

    // ── Strategy 1: Numbered list (e.g. "1. Product Name") ──
    curation = parseNumberedList(text);
    if (curation && curation.length > 0) {
      console.log('[WebCuration] Prose parser (numbered list) found ' + curation.length + ' products');
      return buildProsePayload(text, curation);
    }

    // ── Strategy 2: "Name Category:" pattern splitting ──
    curation = parseCategoryPattern(text);
    if (curation && curation.length > 0) {
      console.log('[WebCuration] Prose parser (category pattern) found ' + curation.length + ' products');
      return buildProsePayload(text, curation);
    }

    // ── Strategy 3: Catalog scan — find known product names in text ──
    curation = parseCatalogScan(text);
    if (curation && curation.length > 0) {
      console.log('[WebCuration] Prose parser (catalog scan) found ' + curation.length + ' products');
      return buildProsePayload(text, curation);
    }

    return null;
  }

  /**
   * Strategy 1: Parse numbered items like "1. Product Name"
   */
  function parseNumberedList(text) {
    var itemRegex = /(?:^|\n)\s*\d+\.\s+(.+)/g;
    var matches = [];
    var match;
    while ((match = itemRegex.exec(text)) !== null) {
      var productName = match[1].trim().replace(/[:\-–—]+$/, '').trim();
      if (productName) matches.push(productName);
    }
    if (matches.length === 0) return null;
    return matchProductNames(matches, text);
  }

  /**
   * Strategy 2: Split on "ProductName Category:" patterns.
   * Handles freeform prose like: "Northstar 4 Category: Gear / Camping. ..."
   */
  function parseCategoryPattern(text) {
    // Look for patterns: "SomeText Category:" — split on "Category:" boundaries
    // to extract product names that precede each occurrence.
    var segments = text.split(/\bCategory:\s*/i);
    if (segments.length < 2) return null; // No "Category:" found

    var productNames = [];
    for (var i = 0; i < segments.length - 1; i++) {
      // The product name is at the end of the segment before "Category:"
      // Work backwards from the end of the segment to find the product name.
      var segment = segments[i].trim();
      // Remove trailing periods or ellipsis
      segment = segment.replace(/\.{1,3}$/, '').trim();

      // Try matching against the catalog first — take the longest matching
      // catalog name found at the end of this segment.
      var bestMatch = findCatalogNameAtEnd(segment);
      if (bestMatch) {
        productNames.push(bestMatch);
      } else {
        // Heuristic: take the last sentence/phrase. Split on periods and
        // take the last non-empty chunk.
        var chunks = segment.split(/\.\s+/);
        var lastChunk = '';
        for (var j = chunks.length - 1; j >= 0; j--) {
          var c = chunks[j].trim();
          if (c.length > 2) { lastChunk = c; break; }
        }
        if (lastChunk) productNames.push(lastChunk);
      }
    }

    if (productNames.length === 0) return null;
    return matchProductNames(productNames, text);
  }

  /**
   * Strategy 3: Scan the text for any known product names from the catalog.
   * This is the most resilient approach — works regardless of formatting.
   */
  function parseCatalogScan(text) {
    if (!_productCatalog || _productCatalog.length === 0) return null;

    var textLower = text.toLowerCase();
    var found = [];
    var foundPositions = []; // Track positions to maintain order & avoid overlaps

    // Sort catalog by name length descending so longer names match first
    // (prevents "Homestead" matching before "Homestead Roomy 2")
    var sorted = _productCatalog.slice().sort(function(a, b) {
      return (b.name || '').length - (a.name || '').length;
    });

    for (var i = 0; i < sorted.length; i++) {
      var pName = sorted[i].name;
      if (!pName) continue;
      var pNameLower = pName.toLowerCase();
      // Skip very short names (3 chars or less) to avoid false positives
      if (pNameLower.length <= 3) continue;

      var pos = textLower.indexOf(pNameLower);
      if (pos === -1) continue;

      // Check that this position doesn't overlap with an already-found product
      var overlaps = false;
      for (var j = 0; j < foundPositions.length; j++) {
        var fp = foundPositions[j];
        if (pos < fp.end && pos + pNameLower.length > fp.start) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      found.push({ product: sorted[i], position: pos });
      foundPositions.push({ start: pos, end: pos + pNameLower.length });
    }

    if (found.length === 0) return null;

    // Sort by position in text (maintain the order the agent listed them)
    found.sort(function(a, b) { return a.position - b.position; });

    var curation = [];
    var seen = {};
    for (var k = 0; k < found.length; k++) {
      var p = found[k].product;
      var key = p.name.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      curation.push({
        template: 'retailProductRecs',
        ProductName: p.name,
        ProductBrand: BRAND_NAME,
        ProductDescription: p.description || '',
        ProductCategory: p.category || '',
        ProductFamily: p.family || '',
        ImageURL: p.image || ''
      });
      console.log('[WebCuration] Catalog scan matched: "' + p.name + '" at position ' + found[k].position);
    }

    return curation.length > 0 ? curation : null;
  }

  /**
   * Find the longest catalog product name that appears at the end of a text segment.
   */
  function findCatalogNameAtEnd(segment) {
    if (!_productCatalog || !segment) return null;
    var segLower = segment.toLowerCase();
    var bestName = null;
    var bestLen = 0;

    for (var i = 0; i < _productCatalog.length; i++) {
      var pName = _productCatalog[i].name;
      if (!pName || pName.length <= bestLen) continue;
      var pLower = pName.toLowerCase();
      if (segLower.endsWith(pLower) || segLower.endsWith(pLower + '.') || segLower.endsWith(pLower + '...')) {
        bestName = pName;
        bestLen = pName.length;
      }
    }
    return bestName;
  }

  /**
   * Given a list of extracted product names, match them to catalog and build curation items.
   */
  function matchProductNames(names, fullText) {
    var curation = [];
    var seen = {};
    for (var i = 0; i < names.length; i++) {
      var catalogProduct = findProductByName(names[i]);
      var key = catalogProduct ? catalogProduct.name.toLowerCase() : names[i].toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;

      if (catalogProduct) {
        curation.push({
          template: 'retailProductRecs',
          ProductName: catalogProduct.name,
          ProductBrand: BRAND_NAME,
          ProductDescription: catalogProduct.description || '',
          ProductCategory: catalogProduct.category || '',
          ProductFamily: catalogProduct.family || '',
          ImageURL: catalogProduct.image || ''
        });
        console.log('[WebCuration] Matched "' + names[i] + '" → image: ' + (catalogProduct.image || '(none)'));
      } else {
        // No catalog match — extract what we can from the prose
        var category = '';
        try {
          var catRegex = new RegExp(
            escapeRegExp(names[i]) + '[\\s\\S]*?Category:\\s*([^.\\n]+)', 'i'
          );
          var catMatch = fullText.match(catRegex);
          category = catMatch ? catMatch[1].trim() : '';
        } catch (regexErr) {
          console.warn('[WebCuration] RegExp error for "' + names[i] + '":', regexErr.message);
        }

        curation.push({
          template: 'retailProductRecs',
          ProductName: names[i],
          ProductBrand: BRAND_NAME,
          ProductDescription: '',
          ProductCategory: category,
          ProductFamily: '',
          ImageURL: ''
        });
        console.warn('[WebCuration] No catalog match for "' + names[i] + '" — card will lack image');
      }
    }
    return curation.length > 0 ? curation : null;
  }

  /**
   * Build a curation payload from parsed curation items.
   */
  function buildProsePayload(text, curation) {
    // Extract a summary line (text before first product reference)
    var summary = 'Here are some product recommendations.';
    // Try to grab text before the first numbered item or first product mention
    var summaryMatch = text.match(/^([\s\S]*?)(?=\s*\d+\.)/);
    if (summaryMatch && summaryMatch[1].trim()) {
      summary = summaryMatch[1].trim();
    } else if (curation.length > 0 && curation[0].ProductName) {
      // Grab text before first product name
      var firstIdx = text.indexOf(curation[0].ProductName);
      if (firstIdx > 0) {
        var before = text.substring(0, firstIdx).trim();
        // Clean up trailing punctuation
        before = before.replace(/[,;:\-–—]+$/, '').trim();
        if (before.length > 5) summary = before;
      }
    }

    return {
      text: summary,
      curation: curation,
      options: [
        { name: 'Show me more options' },
        { name: 'Different category' },
        { name: 'Tell me more about these' }
      ]
    };
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Try to extract a curation JSON envelope from an agent reply.
  // Agents sometimes wrap it in prose or ```json code fences.
  // Falls back to prose parsing when the Atlas planner reformats JSON
  // into a numbered product list (Adaptive Responses behavior).
  function tryParseCuration(text) {
    if (typeof text !== 'string') return null;
    // Strip ``` / ```json / ```JSON code fences if present.
    var stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
    try { return JSON.parse(stripped.trim()); } catch (_) {}
    // Fall back to the first {...} block in the original text (greedy — OK
    // for the happy path; mixed prose + JSON may fail and surface as text).
    var m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (_) {}
    }
    // ── Prose fallback ──────────────────────────────────────────────────
    // The Atlas planner may reformat the Apex JSON into a numbered list.
    // Parse product names from prose and recover images from the catalog.
    var proseParsed = tryParseProseProducts(text);
    if (proseParsed) {
      console.log('[WebCuration] Prose fallback recovered ' + proseParsed.curation.length + ' products');
      return proseParsed;
    }
    return null;
  }

  // Listen for option button clicks and route them to the deterministic engine
  window.addEventListener('webcuration:option', function(event) {
    if (event.detail && event.detail.name) {
      cocoUpdateBudget(event.detail.name); // track price cap before any intercept
      // Intercept checkout intent from option buttons
      if (isCheckoutIntent(event.detail.name)) {
        renderAgentCheckout();
        return;
      }
      // Intercept gift intent from option buttons — don't send to agent
      // so the pinned buckle + jewelry picks stay in position.
      if (isGiftIntent(event.detail.name)) {
        var giftBtnPayload = buildGiftCuration(event.detail.name);
        if (giftBtnPayload) {
          window.WebCuration.render(giftBtnPayload);
          expandPanel();
          return;
        }
      }
      // Intercept Help Agent service chips (returns/status/loyalty/care/cancel
      // and their in-flow actions like "Redeem …", "Track package").
      if (isHelpChip(event.detail.name)) {
        helpRespond(event.detail.name);
        return;
      }
      // Deterministic engine handles the tapped chip.
      cocoRespond(event.detail.name);
    }
  });

  // Expose the deterministic engine so other surfaces (e.g. the search overlay
  // "Ask" handoff) route through the same client-side path.
  window.WebCuration.USE_LIVE_AGENT = USE_LIVE_AGENT;
  window.WebCuration.cocoRespond = cocoRespond;
  window.WebCuration.cocoStageSatisfiedBy = cocoStageSatisfiedBy;
  // Exposed for the Node harness's persona-gender regression test (4.3) —
  // the real predicate, not a reimplementation.
  window.WebCuration.cocoTargetGender = cocoTargetGender;
  // Exposed for the Node harness's Tier 5 occasion-curation regression tests —
  // the real product-selection function and occasion→trend resolver, not a
  // reimplementation.
  window.WebCuration.cocoPickProducts = cocoPickProducts;
  window.WebCuration.cocoResolveOccasionTrend = cocoResolveOccasionTrend;
  window.WebCuration._setIntent = function (intent) { _cocoConvo.intent = intent || {}; };
  window.WebCuration._setCatalog = function (catalog) { _productCatalog = catalog || []; };

  // Single entry point for "ask the agent something" — deterministic engine.
  window.WebCuration.ask = function (text) {
    expandPanel();
    cocoUpdateBudget(text || ''); // always capture any stated price cap before routing
    cocoRespond(text || '');
  };

  // ── Auto-curate on category navigation ──
  // When the router navigates to a category, seed a soft intent bias.
  var _lastAutoCurateRoute = null;
  window.WebCuration.autoCurate = function(route) {
    if (!route || route.name !== 'category') return;
    // Generated routes carry `category` (a category-level label like "Golf
    // Clubs"), not `family` — resolve the coarser family via the search
    // engine's derived category→family map so the bias below is always a
    // real family value, never the category label itself.
    var family = route.family ||
      (route.category && window.SiteSearch && window.SiteSearch.getCategoryFamily
        ? window.SiteSearch.getCategoryFamily()[String(route.category).toLowerCase()]
        : null);
    if (!family) return;
    // Prevent re-firing for the same route
    var routeKey = family + '|' + (route.subcategory || '');
    if (routeKey === _lastAutoCurateRoute) return;
    _lastAutoCurateRoute = routeKey;

    // Seed the browsed family/subcategory as a soft bias on the agent's intent
    // so a subsequent chat leans toward what the shopper is looking at (see
    // cocoComposeQuery). We intentionally do NOT repaint or shrink the category
    // grid or force-open the panel — passive navigation must not wipe the full
    // browsing grid (mirrors the _userHasAsked gate).
    if (!_cocoConvo.intent) _cocoConvo.intent = {};
    _cocoConvo.intent.family = family;
    if (route.subcategory) _cocoConvo.intent.subcategory = route.subcategory;
    console.log('[WebCuration] Seeded family bias for route:', routeKey);
  };

  // Initialize cart badge on load
  document.addEventListener('DOMContentLoaded', function() {
    updateCartBadge();
  });

  // ── Deterministic agent bootstrap (default demo path) ──────────────
  // Show the agent's greeting on load, client-side only (no org calls).
  var _cocoCatalogRequested = false;
  function cocoBootstrap() {
    if (USE_LIVE_AGENT) return;
    // Kick off the catalog load.
    if (!_cocoCatalogRequested) {
      _cocoCatalogRequested = true;
      loadProductCatalog();
    }
    // Wait until the catalog is loaded so the first curation can pick products.
    if (!_productCatalog || _productCatalog.length === 0) {
      setTimeout(cocoBootstrap, 150);
      return;
    }
    if (window.WebCuration && window.WebCuration.showWelcome) {
      console.log('[' + AGENT_NAME + '] Deterministic engine ready — showing welcome (no org dependency)');
      window.WebCuration.showWelcome();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cocoBootstrap);
  } else {
    cocoBootstrap();
  }

  // Safety net: if identity changes via any path other than the in-panel
  // sign-in form (which already re-renders), regenerate the welcome so the
  // signed-in service chips appear without a page refresh.
  if (!USE_LIVE_AGENT) {
    window.addEventListener('identity:changed', function () {
      showWelcome(true);
    });
  }


})();
