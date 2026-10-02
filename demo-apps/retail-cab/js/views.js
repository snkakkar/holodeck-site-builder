/**
 * View renderers for each route. The router calls Views.render(route, root).
 * Products.json is loaded once and cached for the session.
 */

(function () {
  'use strict';

  var _brand = (window.BrandConfig && window.BrandConfig.brand) || {};
  var BRAND_NAME = _brand.name || "Cavender's";
  var AGENT_NAME = _brand.agentName || 'Coco';
  var SIGNATURE_FEATURE = _brand.signatureFeatureLabel || 'Shop the Look';
  // Social handle for the "See It Styled" rail (#Cavenders default). A
  // generated build supplies brand.socialTag; otherwise derive from the name.
  var SOCIAL_TAG = _brand.socialTag ||
    ('#' + String(BRAND_NAME).replace(/[^A-Za-z0-9]+/g, '') || '#Shop');
  // Editorial copy block. Every string here is customer-specific, so it lives
  // in BrandConfig.copy; the fallbacks keep Cavender's baked when absent.
  var _copyCfg = (window.BrandConfig && window.BrandConfig.copy) || {};

  var productsPromise = null;
  function loadProducts() {
    if (!productsPromise) {
      // Preview override: brand-config.js stashes the generated catalog on
      // window.__HOLO_PREVIEW_PRODUCTS when opened with ?holo=<token>. Prefer it
      // over the baked /js/products.json so the preview shows the generated brand.
      if (Array.isArray(window.__HOLO_PREVIEW_PRODUCTS) && window.__HOLO_PREVIEW_PRODUCTS.length) {
        productsPromise = Promise.resolve(window.__HOLO_PREVIEW_PRODUCTS.slice());
      } else {
        productsPromise = fetch((window.APP_BASE_PATH || '') + '/js/products.json').then(function (r) { return r.json(); });
      }
    }
    return productsPromise;
  }

  // ── Wishlist (sessionStorage) ──
  var _wishlist = JSON.parse(sessionStorage.getItem('nto_wishlist') || '[]');

  function isWishlisted(name) {
    return _wishlist.some(function(w) { return w.name === name; });
  }

  function toggleWishlist(name, image, price) {
    var idx = _wishlist.findIndex(function(w) { return w.name === name; });
    if (idx !== -1) {
      _wishlist.splice(idx, 1);
    } else {
      _wishlist.push({ name: name, image: image || '', price: price || '', addedAt: Date.now() });
    }
    try { sessionStorage.setItem('nto_wishlist', JSON.stringify(_wishlist)); } catch(_) {}
    updateWishlistBadge();
    return idx === -1; // true = added, false = removed
  }

  function updateWishlistBadge() {
    var badge = document.querySelector('.wishlist-count');
    if (badge) {
      badge.textContent = _wishlist.length;
      badge.style.display = _wishlist.length > 0 ? 'flex' : 'none';
    }
  }

  // ── Recently Viewed (sessionStorage) ──
  var _recentlyViewed = JSON.parse(sessionStorage.getItem('nto_recently_viewed') || '[]');
  var MAX_RECENT = 12;

  function addRecentlyViewed(product) {
    if (!product || !product.name) return;
    // Remove if already exists (move to front)
    _recentlyViewed = _recentlyViewed.filter(function(r) { return r.name !== product.name; });
    _recentlyViewed.unshift({
      name: product.name,
      image: product.image || '',
      price: product.price || '',
      category: product.category || '',
      family: product.family || ''
    });
    if (_recentlyViewed.length > MAX_RECENT) _recentlyViewed = _recentlyViewed.slice(0, MAX_RECENT);
    try { sessionStorage.setItem('nto_recently_viewed', JSON.stringify(_recentlyViewed)); } catch(_) {}
  }

  // ── Star ratings (deterministic from product name hash) ──
  function productRating(name) {
    if (!name) return { stars: 4.0, count: 12 };
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = Math.abs(hash);
    var stars = 3.5 + (hash % 15) / 10; // 3.5 – 4.9
    var count = 8 + (hash % 180);       // 8 – 187
    return { stars: Math.round(stars * 10) / 10, count: count };
  }

  function renderStars(rating) {
    var full = Math.floor(rating);
    var half = rating - full >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '<span class="star-empty">' + '☆'.repeat(empty) + '</span>';
  }

  // ── Product badges (New, Trending) ──
  // First 15% of products alphabetically are "New", next 10% are "Trending"
  var _badgeMap = null;
  function getBadge(name, allProducts) {
    if (!_badgeMap && allProducts) {
      _badgeMap = {};
      var sorted = allProducts.slice().sort(function(a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
      var newCount = Math.ceil(sorted.length * 0.15);
      var trendCount = Math.ceil(sorted.length * 0.10);
      // Spread "New" evenly
      for (var i = 0; i < newCount; i++) {
        var idx = Math.floor(i * sorted.length / newCount);
        _badgeMap[sorted[idx].name] = 'new';
      }
      // Spread "Trending" from the end
      for (var j = 0; j < trendCount; j++) {
        var idx2 = sorted.length - 1 - Math.floor(j * sorted.length / trendCount);
        if (!_badgeMap[sorted[idx2].name]) _badgeMap[sorted[idx2].name] = 'trending';
      }
    }
    return (_badgeMap && _badgeMap[name]) || null;
  }

  /**
   * Route NTO CDN images through our server-side proxy to avoid
   * Cloudflare 503s caused by cross-origin requests.
   */
  function proxyImg(url) {
    if (!url) return '';
    if (url.indexOf('northerntrailoutfitters.com') !== -1 ||
        url.indexOf('assets.meshmesh.io') !== -1) {
      return '/api/scrape/img-proxy?url=' + encodeURIComponent(url);
    }
    return url;
  }

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
   * Returns the first letter / emoji for image-error fallback placeholders.
   */
  function productInitial(name) {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  }

  /**
   * Category → icon map for the fallback placeholder.
   */
  // Category → placeholder icon. Western terms are matched first (Cavender's
  // baked build), then generic apparel/outdoor terms, so a generated non-western
  // brand still gets a sensible icon and falls back to a neutral bag — never a
  // cowboy hat.
  var categoryIcons = {
    'work boots': '🥾', 'hiking boots': '🥾', 'booties': '👢', 'western boots': '👢', 'boots': '👢',
    'felt hats': '🤠', 'straw hats': '👒', 'cowboy hats': '🤠', 'beanie': '🧢', 'caps': '🧢', 'hats': '🤠',
    'bootcut': '👖', 'slim': '👖', 'jeans': '👖',
    'buckles': '🥇', 'belts': '🔗',
    'shell jackets': '🧥', 'insulated jackets': '🧥', 'jackets': '🧥',
    'base layers': '👕', 'western shirts': '👔', 'shirts': '👕',
    'dresses': '👗', 'tops': '👚', 'apparel': '👚',
    'daypacks': '🎒', 'backpacks': '🎒', 'packs': '🎒',
    'gloves': '🧤', 'wild rags': '🧣', 'bags': '👜', 'jewelry': '💠', 'accessories': '👜'
  };

  function categoryIcon(category) {
    if (!category) return '🛍';
    var key = category.toLowerCase();
    for (var k in categoryIcons) {
      if (key.indexOf(k) !== -1) return categoryIcons[k];
    }
    return '🛍';
  }

  // ── Trending Topics — now sourced from window.BrandConfig.trends. ──
  //    The generator emits this editorial rail per-brand; the fallback below is
  //    the empty list (an unconfigured build simply renders no trend rail rather
  //    than crashing). Each trend's `filter(p)` resolves over the catalog so
  //    every carousel fills with real products.
  var TRENDING_TOPICS = (window.BrandConfig && window.BrandConfig.trends) || [];

  // ── "See It Styled" — shoppable community lifestyle feed. ──
  // Now sourced from window.BrandConfig.styledPosts. Each post's `products` names
  // must match products.json EXACTLY so a tag click resolves against the loaded
  // catalog and opens the real quick-view. `trendId` must match a TRENDING_TOPICS
  // id — posts render inside that trend's carousel panel only.
  var STYLED_POSTS = (window.BrandConfig && window.BrandConfig.styledPosts) || [];

  /**
   * Build a product card with shimmer placeholder + error fallback.
   * data-* attributes carry product info for the quick-view modal.
   */
  function productCard(p, allProducts) {
    var price = p.price ? '$' + p.price : '';
    var hasImage = !!p.image;
    var proxiedImage = proxyImg(p.image);
    var imgHtml = hasImage
      ? '<div class="img-shimmer">' +
          '<img src="' + escapeHtml(proxiedImage) + '" alt="' + escapeHtml(p.name) + '" loading="lazy" ' +
            'data-retry="0" ' +
            'onload="this.parentElement.classList.add(\'img-loaded\')" ' +
            'onerror="var r=parseInt(this.dataset.retry||0);if(r<2){this.dataset.retry=r+1;' +
              'var img=this,s=img.src;' +
              'setTimeout(function(){img.src=s},900*(r+1));return}' +
              'this.style.display=\'none\';this.parentElement.classList.add(\'img-loaded\');' +
              'this.parentElement.querySelector(\'.img-fallback\')&&(this.parentElement.querySelector(\'.img-fallback\').style.display=\'flex\')">' +
          '<div class="img-fallback" style="display:none">' +
            '<span class="img-fallback-icon">' + categoryIcon(p.category) + '</span>' +
            '<span class="img-fallback-letter">' + escapeHtml(productInitial(p.name)) + '</span>' +
          '</div>' +
        '</div>'
      : '<div class="img-fallback" style="display:flex">' +
          '<span class="img-fallback-icon">' + categoryIcon(p.category) + '</span>' +
          '<span class="img-fallback-letter">' + escapeHtml(productInitial(p.name)) + '</span>' +
        '</div>';

    var categoryTag = p.category
      ? '<span class="product-category-tag">' + categoryIcon(p.category) + ' ' + escapeHtml(p.category) + '</span>'
      : '';

    // Badge (New / Trending)
    var badge = getBadge(p.name, allProducts);
    var badgeHtml = badge === 'new'
      ? '<span class="product-badge badge-new">New</span>'
      : badge === 'trending'
        ? '<span class="product-badge badge-trending">Trending</span>'
        : '';

    // Wishlist heart
    var wishlisted = isWishlisted(p.name);
    var heartHtml = '<button class="product-wishlist-btn' + (wishlisted ? ' wishlisted' : '') + '" ' +
      'data-wishlist-name="' + escapeHtml(p.name) + '" ' +
      'data-wishlist-image="' + escapeHtml(proxiedImage || '') + '" ' +
      'data-wishlist-price="' + escapeHtml(price) + '" ' +
      'aria-label="' + (wishlisted ? 'Remove from' : 'Add to') + ' wishlist">' +
      (wishlisted ? '❤️' : '🤍') + '</button>';

    // Star rating
    var rating = productRating(p.name);
    var ratingHtml = '<div class="product-rating">' +
      '<span class="product-rating-stars">' + renderStars(rating.stars) + '</span>' +
      '<span class="product-rating-count">(' + rating.count + ')</span>' +
      '</div>';

    // "+N colors" chip — set by SiteSearch.collapseVariants so shoppers see one
    // style with a color count instead of the same piece repeated N times.
    var variantHtml = (p._variants && p._variants > 0)
      ? '<span class="product-variants-chip">+' + p._variants + ' color' + (p._variants > 1 ? 's' : '') + '</span>'
      : '';

    return '' +
      '<div class="product-card" ' +
        'data-name="' + escapeHtml(p.name) + '" ' +
        'data-price="' + escapeHtml(price) + '" ' +
        'data-image="' + escapeHtml(proxiedImage || '') + '" ' +
        'data-category="' + escapeHtml(p.category || '') + '" ' +
        'data-family="' + escapeHtml(p.family || '') + '" ' +
        'data-brand="' + escapeHtml(p.brand || BRAND_NAME) + '" ' +
        'data-description="' + escapeHtml(p.description || '') + '">' +
        '<div class="product-image-wrap">' + imgHtml + badgeHtml + heartHtml +
          '<div class="product-quick-view-hint">Quick View</div>' +
        '</div>' +
        '<div class="product-info">' +
          categoryTag +
          '<h3 class="product-name">' + escapeHtml(p.name) + '</h3>' +
          '<p class="product-price">' + escapeHtml(price) + variantHtml + '</p>' +
          ratingHtml +
        '</div>' +
      '</div>';
  }

  /**
   * Apply stagger animation to product cards inside a grid.
   */
  function staggerCards(gridEl) {
    if (!gridEl) return;
    var cards = gridEl.querySelectorAll('.product-card');
    cards.forEach(function (card, i) {
      card.classList.add('card-animate');
      card.style.animationDelay = (i * 60) + 'ms';
    });
  }

  // ── Trending Banner ──

  function renderTrendingBanner() {
    var pills = TRENDING_TOPICS.map(function(topic) {
      // trendId is never spliced into the onclick JS text (HTML-entity
      // decoding happens before an inline handler is compiled, so escaping
      // alone can't stop a quote from breaking out of the string literal);
      // read it back off data-trend-id instead, where it's just inert text.
      return '<button class="trend-pill" data-trend-id="' + escapeHtml(topic.id) + '" ' +
        'onclick="window.openTrend(this.dataset.trendId)" ' +
        'aria-label="Shop ' + escapeHtml(topic.label) + '">' +
        '<span class="trend-pill-icon">' + escapeHtml(topic.icon) + '</span>' +
        '<span class="trend-pill-label">' + escapeHtml(topic.label) + '</span>' +
        '</button>';
    }).join('');

    return '<section id="trending-banner">' +
      '<div class="trending-header">' +
        '<span class="trending-eyebrow">What\'s Trending</span>' +
        '<span class="trending-divider"></span>' +
      '</div>' +
      '<div class="trend-pills-row">' + pills + '</div>' +
      '<div id="trend-carousel" class="trend-carousel">' +
        '<div class="trend-carousel-header">' +
          '<div id="trend-carousel-label" class="trend-carousel-label"></div>' +
          '<button class="trend-carousel-close" onclick="window.closeTrendCarousel()" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="trend-carousel-grid" id="trend-carousel-grid"></div>' +
        '<div class="trend-styled-section" id="trend-styled-section" hidden>' +
          '<div class="trend-styled-header">See It Styled <span>' + escapeHtml(SOCIAL_TAG) + '</span></div>' +
          '<div class="trend-styled-feed" id="trend-styled-feed"></div>' +
        '</div>' +
        '<div class="trend-carousel-footer">' +
          '<a id="trend-see-all" href="#" class="btn btn-dark">See All</a>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  // Preset tag-dot coordinates (%) so tags sit naturally over the photo.
  var STYLED_TAG_SPOTS = [
    [{ left: 40, top: 42 }, { left: 63, top: 66 }],
    [{ left: 34, top: 55 }, { left: 60, top: 34 }],
    [{ left: 50, top: 38 }, { left: 44, top: 68 }]
  ];

  // Render the "See It Styled" feed for a trend into #trend-styled-feed and wire
  // each shoppable tag dot to open the real product quick-view.
  function renderStyledFeed(topic, products) {
    var section = document.getElementById('trend-styled-section');
    var feed = document.getElementById('trend-styled-feed');
    if (!section || !feed) return;

    var posts = STYLED_POSTS.filter(function (p) { return p.trendId === topic.id; });
    if (!posts.length) { section.hidden = true; feed.innerHTML = ''; return; }

    // Index the loaded catalog by exact name for tag resolution.
    var byName = {};
    products.forEach(function (p) { byName[p.name] = p; });

    feed.innerHTML = posts.map(function (post, pi) {
      var spots = STYLED_TAG_SPOTS[pi % STYLED_TAG_SPOTS.length];
      var dots = (post.products || []).map(function (name, di) {
        var prod = byName[name];
        if (!prod) return '';
        var spot = spots[di % spots.length];
        var price = prod.price ? '$' + prod.price : '';
        return '<button class="styled-tag-dot" style="left:' + spot.left + '%;top:' + spot.top + '%" ' +
          'data-product-name="' + escapeHtml(name) + '" aria-label="Shop ' + escapeHtml(prod.name) + '">' +
          '<span class="styled-tag-ring"></span>' +
          '<span class="styled-tag-pop">' + escapeHtml(prod.name) +
            (price ? '<span class="styled-tag-price">' + escapeHtml(price) + '</span>' : '') +
          '</span>' +
          '</button>';
      }).join('');

      var likeStr = (post.likes || 0).toLocaleString();
      return '<div class="styled-post">' +
        '<div class="styled-post-media">' +
          '<div class="img-shimmer">' +
            '<img src="' + escapeHtml(post.image) + '" alt="' + escapeHtml(post.caption || 'Styled look') + '" ' +
              'loading="lazy" onload="this.parentElement.classList.add(\'img-loaded\')" ' +
              'onerror="var c=this.closest(\'.styled-post\'); if(c) c.style.display=\'none\'">' +
          '</div>' +
          dots +
          '<div class="styled-post-meta">' +
            '<div class="styled-post-toprow">' +
              '<span class="styled-post-handle">' + escapeHtml(post.handle || SOCIAL_TAG.replace('#', '@')) + '</span>' +
              '<span class="styled-post-likes">❤ ' + likeStr + '</span>' +
            '</div>' +
            '<p class="styled-post-caption">' + escapeHtml(post.caption || '') + '</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    section.hidden = false;

    // Wire tag dots → the full quick-view shopping modal (large image, brand,
    // name, rating, price, description, Add to Cart, Wishlist, and "Complete the
    // Look"). The modal is a fixed overlay on <body>, so it pops up over the feed
    // rather than being constrained to the post image. Build a transient element
    // carrying the product's data-* attributes that openQuickView() reads.
    feed.querySelectorAll('.styled-tag-dot').forEach(function (dot) {
      dot.addEventListener('click', function (e) {
        e.stopPropagation();
        var prod = byName[dot.getAttribute('data-product-name')];
        if (!prod) return;

        var tmp = document.createElement('div');
        tmp.setAttribute('data-name', prod.name);
        // openQuickView expects a DISPLAY price (it strips to numeric for the cart).
        tmp.setAttribute('data-price', prod.price ? '$' + prod.price : '');
        tmp.setAttribute('data-image', prod.image || '');
        tmp.setAttribute('data-category', prod.category || '');
        tmp.setAttribute('data-family', prod.family || '');
        tmp.setAttribute('data-description', prod.description || '');
        openQuickView(tmp);
      });
    });
  }

  // Build a curated LOOK for a trend: collapse " in <Color>" variants to one
  // representative (recording the color count for the "+N colors" chip), then
  // spread across families (Boots → Hats → Jeans → Apparel → Belts → Accessories,
  // up to 2 each, cap 6) so the panel shows a full head-to-toe outfit — not the
  // same piece repeated.
  var TREND_LOOK_ORDER = ['Boots', 'Hats', 'Jeans', 'Apparel', 'Belts', 'Accessories'];
  function buildTrendLook(products, filter) {
    // Derived (brand-agnostic) family order when a generated catalog is
    // loaded — falls back to the baked-demo TREND_LOOK_ORDER otherwise.
    var lookOrder = (window.SiteSearch && window.SiteSearch.getLookFamilies && window.SiteSearch.getLookFamilies().length)
      ? window.SiteSearch.getLookFamilies() : TREND_LOOK_ORDER;
    var styleKey = function (p) {
      return (p.family || '') + '|' + (p.name || '').toLowerCase().replace(/\s+in\s+.+$/i, '').trim();
    };
    var reps = {};   // styleKey → representative product (mutated with _variants)
    var order = [];  // preserve first-seen order per family
    products.filter(filter).forEach(function (p) {
      if (!p.image) return;
      var k = styleKey(p);
      if (!reps[k]) {
        reps[k] = p;
        p._variants = 0;
        order.push(k);
      } else {
        reps[k]._variants = (reps[k]._variants || 0) + 1;
      }
    });
    // Group representatives by family, preserving order.
    var byFamily = {};
    order.forEach(function (k) {
      var p = reps[k];
      (byFamily[p.family] = byFamily[p.family] || []).push(p);
    });
    // Round-robin across families (1 per family per pass, up to 2 each) so a
    // 6-item look keeps its cross-family spread instead of front-loading one family.
    var look = [];
    for (var pass = 0; pass < 2 && look.length < 6; pass++) {
      for (var fi = 0; fi < lookOrder.length && look.length < 6; fi++) {
        var fam = byFamily[lookOrder[fi]];
        if (fam && fam[pass]) { look.push(fam[pass]); }
      }
    }
    // Top up from any remaining distinct styles if the look is still short.
    if (look.length < 6) {
      var picked = {};
      look.forEach(function (p) { picked[styleKey(p)] = 1; });
      order.forEach(function (k) {
        if (look.length < 6 && !picked[k]) { look.push(reps[k]); picked[k] = 1; }
      });
    }
    return look.slice(0, 6);
  }

  window.openTrend = function(trendId) {
    var topic = null;
    for (var i = 0; i < TRENDING_TOPICS.length; i++) {
      if (TRENDING_TOPICS[i].id === trendId) { topic = TRENDING_TOPICS[i]; break; }
    }
    if (!topic) return;

    var carousel = document.getElementById('trend-carousel');
    var currentActive = document.querySelector('.trend-pill.active');

    if (currentActive && currentActive.getAttribute('data-trend-id') === trendId) {
      currentActive.classList.remove('active');
      if (carousel) carousel.classList.remove('trend-carousel--open');
      return;
    }

    document.querySelectorAll('.trend-pill').forEach(function(p) { p.classList.remove('active'); });
    var pill = document.querySelector('[data-trend-id="' + trendId + '"]');
    if (pill) pill.classList.add('active');

    loadProducts().then(function(products) {
      var matches = buildTrendLook(products, topic.filter);
      var grid = document.getElementById('trend-carousel-grid');
      var labelEl = document.getElementById('trend-carousel-label');
      var seeAll = document.getElementById('trend-see-all');

      if (!grid || !carousel) return;

      if (labelEl) {
        labelEl.innerHTML =
          '<span class="trend-carousel-title">' + escapeHtml(topic.label) + '</span>' +
          '<span class="trend-carousel-tag">' + escapeHtml(topic.tag) + '</span>';
      }

      if (matches.length === 0) {
        grid.innerHTML = '<p class="trend-no-results">No products found for this trend yet — check back soon.</p>';
      } else {
        grid.innerHTML = matches.map(function(p) { return productCard(p, products); }).join('');
        staggerCards(grid);
        wireQuickView(grid);
      }

      grid.querySelectorAll('.product-wishlist-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var name = btn.getAttribute('data-wishlist-name');
          var img  = btn.getAttribute('data-wishlist-image');
          var prc  = btn.getAttribute('data-wishlist-price');
          var added = toggleWishlist(name, img, prc);
          btn.classList.toggle('wishlisted', added);
          btn.textContent = added ? '❤️' : '🤍';
          btn.setAttribute('aria-label', (added ? 'Remove from' : 'Add to') + ' wishlist');
        });
      });

      if (seeAll) {
        var familyRoutes = { boots: '/boots', hats: '/hats', jeans: '/jeans', apparel: '/apparel', accessories: '/accessories', belts: '/belts' };
        var firstFamily = matches[0] ? (matches[0].family || '').toLowerCase() : '';
        seeAll.href = familyRoutes[firstFamily] || '/boots';
      }

      // "See It Styled" shoppable lifestyle feed for this aesthetic.
      renderStyledFeed(topic, products);

      carousel.classList.add('trend-carousel--open');
      carousel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  window.closeTrendCarousel = function() {
    var carousel = document.getElementById('trend-carousel');
    if (carousel) carousel.classList.remove('trend-carousel--open');
    document.querySelectorAll('.trend-pill').forEach(function(p) { p.classList.remove('active'); });
    // Clear the styled feed so a re-open never flashes the previous aesthetic.
    var styledSection = document.getElementById('trend-styled-section');
    var styledFeed = document.getElementById('trend-styled-feed');
    if (styledFeed) styledFeed.innerHTML = '';
    if (styledSection) styledSection.hidden = true;
  };

  window.copyBdayCode = function() {
    var codeEl = document.getElementById('bday-code');
    var btn = document.querySelector('.birthday-offer-copy');
    if (!codeEl || !btn) return;
    var code = codeEl.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function() {
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
    }
  };

  /**
   * Open the quick-view modal for a product card.
   */
  function openQuickView(cardEl) {
    // Remove any existing modal
    var existing = document.querySelector('.quickview-overlay');
    if (existing) existing.remove();

    var name = cardEl.getAttribute('data-name') || 'Product';
    var price = cardEl.getAttribute('data-price') || '';
    var image = cardEl.getAttribute('data-image') || '';
    var category = cardEl.getAttribute('data-category') || '';
    var family = cardEl.getAttribute('data-family') || '';
    var brand = cardEl.getAttribute('data-brand') || BRAND_NAME;
    var description = cardEl.getAttribute('data-description') || '';

    // Track recently viewed
    addRecentlyViewed({ name: name, image: image, price: price, category: category, family: family });

    // Rating
    var rating = productRating(name);
    var ratingHtml = '<div class="product-rating" style="margin-bottom:16px">' +
      '<span class="product-rating-stars" style="font-size:1rem">' + renderStars(rating.stars) + '</span>' +
      '<span class="product-rating-count" style="font-size:0.85rem"> ' + rating.stars + ' (' + rating.count + ' reviews)</span>' +
      '</div>';

    var imageHtml = image
      ? '<img class="quickview-img" src="' + escapeHtml(image) + '" alt="' + escapeHtml(name) + '" loading="lazy">'
      : '<div class="img-fallback" style="display:flex;width:100%;min-height:400px">' +
          '<span class="img-fallback-icon" style="font-size:64px">' + categoryIcon(category) + '</span>' +
          '<span class="img-fallback-letter" style="font-size:48px">' + escapeHtml(productInitial(name)) + '</span>' +
        '</div>';

    var wishlisted = isWishlisted(name);

    var overlay = document.createElement('div');
    overlay.className = 'quickview-overlay';
    overlay.innerHTML =
      '<div class="quickview-modal">' +
        '<button class="quickview-close" aria-label="Close">&times;</button>' +
        '<div class="quickview-image">' + imageHtml + '</div>' +
        '<div class="quickview-body">' +
          '<p class="quickview-brand">' + escapeHtml(brand) + '</p>' +
          '<h2 class="quickview-name">' + escapeHtml(name) + '</h2>' +
          ratingHtml +
          (price ? '<p class="quickview-price">' + escapeHtml(price) + '</p>' : '') +
          (category || family
            ? '<p class="quickview-category">' +
                escapeHtml(category) +
                (category && family ? ' · ' : '') +
                escapeHtml(family) +
              '</p>'
            : '') +
          (description ? '<p class="quickview-description">' + escapeHtml(description) + '</p>' : '') +
          '<div class="quickview-actions">' +
            '<button class="quickview-add-cart btn btn-dark">Add to Cart</button>' +
            '<button class="quickview-wishlist btn btn-white-outline">' + (wishlisted ? '❤️ Wishlisted' : '♡ Wishlist') + '</button>' +
          '</div>' +
          '<div class="quickview-look" id="quickview-look"></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // "Complete the Look" — suggest complementary pieces from other families
    loadProducts().then(function (products) {
      var slot = overlay.querySelector('#quickview-look');
      if (!slot) return;
      var current = { name: name, category: category, family: family, description: description };
      var looks = completeTheLook(current, products);
      if (!looks.length) return;
      slot.innerHTML =
        '<h3 class="quickview-look-title">Complete the Look</h3>' +
        '<div class="quickview-look-rail">' +
          looks.map(function (p) { return productCard(p, products); }).join('') +
        '</div>';
      var rail = slot.querySelector('.quickview-look-rail');
      staggerCards(rail);
      wireQuickView(rail);
    });

    // Trigger animation (force reflow)
    overlay.offsetHeight;
    overlay.classList.add('quickview-visible');

    // Wire close
    var closeModal = function () {
      overlay.classList.remove('quickview-visible');
      setTimeout(function () { overlay.remove(); }, 300);
    };
    overlay.querySelector('.quickview-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handler);
      }
    });

    // Add to Cart — pass full product data
    var cartBtn = overlay.querySelector('.quickview-add-cart');
    cartBtn.addEventListener('click', function () {
      // Cart stores a bare numeric price; the card's data-price is display-
      // formatted ("$88.00"), so strip it here to avoid a $0/NaN subtotal.
      var numericPrice = String(price).replace(/[^0-9.]/g, '');
      var productData = { name: name, image: image, price: numericPrice, category: category, family: family };
      if (window.WebCuration && window.WebCuration._addToCart) {
        window.WebCuration._addToCart(productData);
      } else {
        // Fallback: store directly with full data
        var cart = JSON.parse(sessionStorage.getItem('nto_cart') || '[]');
        var existing = cart.find(function(c) { return c.name === name; });
        if (existing) {
          existing.quantity = (existing.quantity || 1) + 1;
        } else {
          cart.push({ name: name, image: image, price: numericPrice, category: category, family: family, quantity: 1, addedAt: Date.now() });
        }
        sessionStorage.setItem('nto_cart', JSON.stringify(cart));
        var badge = document.querySelector('.cart-count');
        if (badge) {
          var count = 0; cart.forEach(function(c) { count += (c.quantity || 1); });
          badge.textContent = count;
          badge.style.display = 'flex';
          badge.classList.remove('cart-bounce');
          void badge.offsetWidth;
          badge.classList.add('cart-bounce');
        }
      }
      cartBtn.textContent = '✓ Added';
      cartBtn.classList.add('added');
      setTimeout(function () {
        cartBtn.textContent = 'Add to Cart';
        cartBtn.classList.remove('added');
      }, 1500);
    });

    // Wishlist button in quickview
    var wishBtn = overlay.querySelector('.quickview-wishlist');
    wishBtn.addEventListener('click', function () {
      var added = toggleWishlist(name, image, price);
      wishBtn.innerHTML = added ? '❤️ Wishlisted' : '♡ Wishlist';
      // Update card heart if visible
      refreshWishlistHearts();
    });
  }

  /** Refresh all visible wishlist heart buttons to match current state */
  function refreshWishlistHearts() {
    document.querySelectorAll('.product-wishlist-btn').forEach(function(btn) {
      var n = btn.getAttribute('data-wishlist-name');
      var w = isWishlisted(n);
      btn.classList.toggle('wishlisted', w);
      btn.innerHTML = w ? '❤️' : '🤍';
    });
  }

  /**
   * Attach quick-view click handlers to all product cards in a grid.
   */
  function wireQuickView(gridEl) {
    if (!gridEl) return;
    gridEl.addEventListener('click', function (e) {
      // Handle wishlist heart clicks
      var wishBtn = e.target.closest('.product-wishlist-btn');
      if (wishBtn) {
        e.stopPropagation();
        var n = wishBtn.getAttribute('data-wishlist-name');
        var img = wishBtn.getAttribute('data-wishlist-image');
        var pr = wishBtn.getAttribute('data-wishlist-price');
        var added = toggleWishlist(n, img, pr);
        wishBtn.classList.toggle('wishlisted', added);
        wishBtn.innerHTML = added ? '❤️' : '🤍';
        wishBtn.classList.remove('wishlist-pop');
        void wishBtn.offsetWidth;
        wishBtn.classList.add('wishlist-pop');
        return;
      }

      var card = e.target.closest('.product-card');
      if (!card) return;
      if (e.target.closest('button') || e.target.closest('a')) return;
      openQuickView(card);
    });
  }

  /**
   * "Complete the Look" — suggest 3–4 complementary pieces from OTHER families,
   * ranked by shared distinctive descriptors (stone / metal / "statement") then
   * by shared name/description tokens. Deterministic (stable per product) and
   * variety-aware so a pair of boots pulls a hat + jeans + belt.
   * There is no outfit field in the catalog, so this heuristic stands in for one.
   */
  var _lookStopWords = { 'the': 1, 'and': 1, 'for': 1, 'with': 1, 'women': 1, 'womens': 1, 'in': 1, 'of': 1, 'a': 1, 'to': 1 };
  var _lookDescriptors = ['western', 'turquoise', 'fringe', 'concho', 'tooled', 'suede', 'leather', 'aztec', 'serape', 'rhinestone', 'studded', 'metallic', 'floral', 'embroidered', 'distressed'];

  function _lookTokens(product) {
    var text = ((product.name || '') + ' ' + (product.description || '') + ' ' + (product.category || '')).toLowerCase();
    var words = text.split(/[^a-z0-9]+/);
    var set = {};
    words.forEach(function (w) {
      if (w.length > 2 && !_lookStopWords[w]) set[w] = 1;
    });
    return set;
  }

  function completeTheLook(product, allProducts) {
    if (!allProducts || !allProducts.length) return [];
    var srcTokens = _lookTokens(product);
    var srcFamily = product.family || '';
    var srcName = product.name || '';

    var scored = allProducts.filter(function (p) {
      return p.family && p.family !== srcFamily && p.name !== srcName && p.price;
    }).map(function (p) {
      var pTokens = _lookTokens(p);
      var score = 0;
      Object.keys(pTokens).forEach(function (t) {
        if (srcTokens[t]) score += (_lookDescriptors.indexOf(t) !== -1 ? 3 : 1);
      });
      return { p: p, score: score };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.p.name || '').localeCompare(b.p.name || ''); // deterministic tie-break
    });

    // Enforce family variety: one piece per other family first, then fill.
    var picked = [];
    var usedFamily = {};
    scored.forEach(function (s) {
      if (picked.length >= 4) return;
      if (usedFamily[s.p.family]) return;
      usedFamily[s.p.family] = 1;
      picked.push(s.p);
    });
    for (var i = 0; i < scored.length && picked.length < 4; i++) {
      if (picked.indexOf(scored[i].p) === -1) picked.push(scored[i].p);
    }
    return picked.slice(0, 4);
  }

  function escapeRegexLiteral(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // For a generated brand, derive the signed-out homepage grid's category
  // picks from the catalog's own (family, category) pairs instead of the
  // static Western-wear table below — up to 2 categories per family, in
  // catalog order, capped at 12. Falls back to the baked-demo table when no
  // generated BrandConfig is present (same gated pattern as router.js).
  function deriveCategoryPicks(products) {
    var byFamily = {};
    var order = [];
    products.forEach(function (p) {
      if (!p.family || !p.category) return;
      if (!byFamily[p.family]) { byFamily[p.family] = []; order.push(p.family); }
      if (byFamily[p.family].indexOf(p.category) === -1) byFamily[p.family].push(p.category);
    });
    var picks = [];
    order.forEach(function (fam) {
      byFamily[fam].slice(0, 2).forEach(function (cat) {
        picks.push({ family: fam, category: new RegExp('^' + escapeRegexLiteral(cat) + '$', 'i'), label: cat });
      });
    });
    return picks.slice(0, 12);
  }

  function deriveOrDefaultCategoryPicks(products) {
    var bc = window.BrandConfig || {};
    if (bc.navCategories && bc.navCategories.length) {
      var derived = deriveCategoryPicks(products);
      if (derived.length) return derived;
    }
    return [
      { family: 'Boots', category: /western/i, label: 'Western Boots' },
      { family: 'Boots', category: /bootie/i, label: 'Booties' },
      { family: 'Hats', category: /felt/i, label: 'Felt Hats' },
      { family: 'Hats', category: /straw/i, label: 'Straw Hats' },
      { family: 'Jeans', category: /bootcut/i, label: 'Bootcut' },
      { family: 'Jeans', category: /slim/i, label: 'Slim' },
      { family: 'Belts', category: /buckle/i, label: 'Buckles' },
      { family: 'Belts', category: /belt/i, label: 'Belts' },
      { family: 'Apparel', category: /western shirt/i, label: 'Western Shirts' },
      { family: 'Apparel', category: /top/i, label: 'Tops' },
      { family: 'Accessories', category: /jewelry/i, label: 'Jewelry' },
      { family: 'Accessories', category: /bag/i, label: 'Bags' }
    ];
  }

  /**
   * Select ~9 products spanning all families for the visual "Shop the Look"
   * mosaic. One representative per family (dedupe by name, require price),
   * then top up. Each gets a synthetic _size for tile-span variety.
   */
  function buildLooks(products) {
    var families = (window.SiteSearch && window.SiteSearch.getLookFamilies && window.SiteSearch.getLookFamilies().length)
      ? window.SiteSearch.getLookFamilies() : ['Boots', 'Hats', 'Jeans', 'Apparel', 'Belts', 'Accessories'];
    var looks = [];
    var used = {};
    families.forEach(function (fam) {
      var match = products.filter(function (p) {
        return !used[p.name] && p.price && p.image && p.family === fam;
      })[0];
      if (match) { looks.push(match); used[match.name] = true; }
    });
    // Top up to 9 with any remaining priced products
    for (var i = 0; i < products.length && looks.length < 9; i++) {
      if (!used[products[i].name] && products[i].price && products[i].image) {
        looks.push(products[i]); used[products[i].name] = true;
      }
    }
    // Assign size variety by position for a masonry rhythm
    var sizes = ['lg', 'md', 'md', 'sm', 'md', 'sm', 'md', 'md', 'lg'];
    looks.forEach(function (p, idx) { p._size = sizes[idx % sizes.length]; });
    return looks;
  }

  /**
   * Mosaic tile for the visual feed. Keeps the `.product-card` data-* contract
   * (so wireQuickView / staggerCards / openQuickView work unchanged) plus a
   * `.look-tile` modifier for mosaic layout. Renders the real product photo
   * (with a glyph/gradient fallback underneath) and a caption overlay.
   */
  function lookTile(p, size) {
    var price = p.price ? '$' + p.price : '';
    var proxied = proxyImg(p.image || '');
    var sizeClass = 'look-tile-' + (size || 'md');
    // Real photo layered over the glyph fallback: on load it covers the glyph;
    // on error (after 2 retries) it hides itself and the glyph shows through.
    var imgHtml = proxied
      ? '<img class="look-tile-img" src="' + escapeHtml(proxied) + '" alt="' + escapeHtml(p.name) + '" loading="lazy" ' +
          'data-retry="0" ' +
          'onerror="var r=parseInt(this.dataset.retry||0);if(r<2){this.dataset.retry=r+1;' +
            'var img=this,s=img.src.split(\'&_r=\')[0];' +
            'setTimeout(function(){img.src=s+\'&_r=\'+Date.now()},900*(r+1));return}' +
            'this.style.display=\'none\'">'
      : '';
    return '' +
      '<div class="product-card look-tile ' + sizeClass + '" ' +
        'data-name="' + escapeHtml(p.name) + '" ' +
        'data-price="' + escapeHtml(price) + '" ' +
        'data-image="' + escapeHtml(proxied || '') + '" ' +
        'data-category="' + escapeHtml(p.category || '') + '" ' +
        'data-family="' + escapeHtml(p.family || '') + '" ' +
        'data-brand="' + escapeHtml(p.brand || BRAND_NAME) + '" ' +
        'data-description="' + escapeHtml(p.description || '') + '">' +
        '<div class="look-tile-bg">' +
          '<span class="img-fallback-icon">' + categoryIcon(p.category) + '</span>' +
          '<span class="img-fallback-letter">' + escapeHtml(productInitial(p.name)) + '</span>' +
          imgHtml +
        '</div>' +
        '<div class="look-tile-overlay">' +
          '<span class="look-tile-family">' + escapeHtml(p.family || '') + '</span>' +
          '<span class="look-tile-name">' + escapeHtml(p.name) + '</span>' +
          (price ? '<span class="look-tile-price">' + escapeHtml(price) + '</span>' : '') +
        '</div>' +
        '<div class="product-quick-view-hint">Quick View</div>' +
      '</div>';
  }

  /**
   * Occasion-first discovery band. Each chip's `q` maps to an existing
   * CONCEPT_MAP key in search-engine.js, so clicking one runs the
   * client-side SiteSearch (works with the agent offline) and, when the
   * agent is live, also nudges Coco to curate.
   */
  var _occasions = [
    { label: 'Rodeo', q: 'rodeo' },
    { label: 'Country Concert', q: 'festival fringe' },
    { label: 'Ranch Work', q: 'work boots' },
    { label: 'Two-Steppin\'', q: 'cowboy boots' },
    { label: 'Everyday', q: 'jeans' }
  ];

  // Neutral, brand-agnostic occasion chips derived from the generated brand's
  // OWN nav-category vocabulary, so a non-western brand never shows Cavender's
  // "Rodeo / Ranch Work" labels when it supplies no chipFilterTable. Each
  // chip's `q` is a real catalog category so the client-side SiteSearch
  // resolves it. Returns [] when there are no nav categories to derive from
  // (the baked Cavender's demo), which keeps its western _occasions default.
  function neutralOccasions() {
    var bc = window.BrandConfig || {};
    var cats = Array.isArray(bc.navCategories) ? bc.navCategories : [];
    return cats.slice(0, 5).map(function (c) {
      return { label: String(c), q: String(c) };
    });
  }

  // Generated brands supply agent chips via BrandConfig.chipFilterTable
  // ({ label, filter:{family,category,priceTier,...} }). Map each chip to an
  // occasion whose search query is the chip's most specific filter value (or
  // the label), so clicking it runs the same client-side SiteSearch. Signed-in
  // -only chips (loggedIn:true) are shown only when Rachel is identified.
  function occasionsFromConfig() {
    var table = (window.BrandConfig && window.BrandConfig.chipFilterTable) || [];
    var signedIn = isIdentified();
    var mapped = table
      .filter(function (c) { return !c.loggedIn || signedIn; })
      .map(function (c) {
        var f = c.filter || {};
        var q = f.category || f.family || f.color ||
          (Array.isArray(f.colors) ? f.colors[0] : '') || c.label;
        return { label: c.label, q: String(q || c.label) };
      });
    if (mapped.length) return mapped;
    // No usable chip table → derive neutral chips from the brand's own nav
    // categories rather than leaking Cavender's western occasions. Falls back
    // to the baked western _occasions ONLY when there are no nav categories
    // either (i.e. the baked Cavender's demo), leaving that reference intact.
    var neutral = neutralOccasions();
    return neutral.length ? neutral : _occasions;
  }

  function occasionChips() {
    var _occasionsResolved = occasionsFromConfig();
    return '' +
      '<section class="occasion-discovery">' +
      '  <div class="container">' +
      '    <h2 class="occasion-discovery-heading">What brings you here today?</h2>' +
      '    <div class="occasion-chips">' +
           _occasionsResolved.map(function (o) {
             return '<button class="occasion-chip" data-occasion="' + escapeHtml(o.q) + '" ' +
               'data-label="' + escapeHtml(o.label) + '">' + escapeHtml(o.label) + '</button>';
           }).join('') +
      '    </div>' +
      '  </div>' +
      '</section>';
  }

  function wireOccasionChips(sectionEl) {
    if (!sectionEl) return;
    sectionEl.addEventListener('click', function (e) {
      var chip = e.target.closest('.occasion-chip');
      if (!chip) return;
      var q = chip.getAttribute('data-occasion');
      var label = chip.getAttribute('data-label') || q;
      // Nudge the agent when it's live — never the sole path to results.
      try {
        if (window.WebCuration && window.WebCuration.sendMessage) {
          window.WebCuration.sendMessage('Show me pieces for a ' + label);
        }
      } catch (err) { /* agent offline — client search below still runs */ }
      // Always run the client-side occasion search.
      window.Router.navigate('/search?q=' + encodeURIComponent(q));
    });
  }

  /** True when Rachel is signed in. */
  function isIdentified() {
    return !!(window.WebCuration && window.WebCuration.isUserIdentified && window.WebCuration.isUserIdentified());
  }

  // ---------- Homepage ----------
  function renderHome(root) {
    var personalized = isIdentified();
    var identity = personalized && window.WebCuration.getUserIdentity ? window.WebCuration.getUserIdentity() : null;
    var firstName = (identity && (identity.firstName || identity.name)) || 'You';

    // Generated brands supply hero + section copy via BrandConfig.copy; fall
    // back to the baked Cavender's strings when a field is absent.
    var _copy = (window.BrandConfig && window.BrandConfig.copy) || {};
    var _navCats = (window.BrandConfig && window.BrandConfig.navCategories) || [];
    function _catHref(i, fallback) {
      var label = _navCats[i];
      if (!label) return fallback;
      return '/' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    var featuredHeading = personalized
      ? 'Recommended for You, ' + escapeHtml(firstName) +
        ' <span class="personalized-badge">✨ Personalized · Based on your closet</span>'
      : escapeHtml(_copy.heroEyebrow || 'New Arrivals');
    var featuredSubtitle = personalized
      ? 'Picked to match your style.'
      : escapeHtml(_copy.heroSub || 'Authentic western wear built to last — boots, hats, denim, and everything for the ranch, the rodeo, and the road.');

    // Signed-in Insiders see their birthday reward front-and-center in the hero.
    // Rendered as brand-driven TEXT (offer copy + code from BirthdayPromo /
    // BrandConfig.offer) over the brand-color gradient — NOT a baked raster —
    // so a generated brand's reward, not Cavender's, always shows.
    var promo = window.BirthdayPromo;
    var showInsiderHero = personalized && promo && promo.isEligible();
    var insiderName = escapeHtml(firstName || 'there');
    var insiderCode = escapeHtml(promo ? (promo.code || '') : '');
    var insiderShort = escapeHtml(promo ? (promo.offerShort || 'a birthday reward') : 'a birthday reward');
    var insiderLabel = escapeHtml((promo && promo.label) || 'Birthday Reward');
    var heroHtml = showInsiderHero
      ? '<section class="hero hero-insider">' +
        '  <div class="hero-overlay"></div>' +
        '  <div class="hero-content">' +
        '    <span class="hero-eyebrow">' + escapeHtml('My ' + BRAND_NAME) + ' · ' + insiderLabel + '</span>' +
        '    <h1 class="hero-title">Happy birthday, ' + insiderName + '.</h1>' +
        '    <p class="hero-subtitle">Your reward is waiting — ' + insiderShort + '.</p>' +
        (insiderCode
          ? '    <div class="hero-reward-code">Use code <strong>' + insiderCode + '</strong></div>'
          : '') +
        '    <div class="hero-actions">' +
        '      <a href="' + _catHref(0, '/boots') + '" class="btn btn-white">Shop your reward</a>' +
        '    </div>' +
        '  </div>' +
        '</section>'
      : '<section class="hero hero-ks">' +
        '  <div class="hero-overlay"></div>' +
        '  <div class="hero-content">' +
        '    <h1 class="hero-title">' + escapeHtml(_copy.heroTitle || 'The West, Worn Well') + '</h1>' +
        '    <p class="hero-subtitle">' + escapeHtml(_copy.heroSub || 'Discover the new arrivals — boots, hats, and denim built for the long haul.') + '</p>' +
        '    <div class="hero-actions">' +
        '      <a href="' + _catHref(0, '/boots') + '" class="btn btn-white">' + escapeHtml(_copy.heroCta || ('Shop ' + (_navCats[0] || 'Boots'))) + '</a>' +
        (_navCats[1] || !_navCats.length
          ? '      <a href="' + _catHref(1, '/hats') + '" class="btn btn-white-outline">Shop ' + escapeHtml(_navCats[1] || 'Hats') + '</a>'
          : '') +
        '    </div>' +
        '  </div>' +
        '</section>';

    root.innerHTML =
      renderTrendingBanner() +
      heroHtml +
      occasionChips() +
      '<section class="section">' +
      '  <div class="container">' +
      '    <h2 class="section-heading">' + featuredHeading + '</h2>' +
      '    <p class="section-subtitle">' + featuredSubtitle + '</p>' +
      '    <div class="product-grid" id="featured-grid">' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '    </div>' +
      '  </div>' +
      '</section>' +
      '<section class="section curated-feed">' +
      '  <div class="container">' +
      '    <h2 class="section-heading">' + escapeHtml(SIGNATURE_FEATURE) + '</h2>' +
      '    <p class="section-subtitle">' + escapeHtml(_copy.lookSubtitle || 'Curated pairings across our collections — mix, layer, and make it yours.') + '</p>' +
      '    <div class="look-mosaic" id="look-mosaic">' +
      '      <div class="curation-loading" style="height:300px"></div>' +
      '      <div class="curation-loading" style="height:300px"></div>' +
      '      <div class="curation-loading" style="height:300px"></div>' +
      '    </div>' +
      '  </div>' +
      '</section>' +
      '<section class="lifestyle-split">' +
      '  <div class="lifestyle-image-side lifestyle-image-ks"></div>' +
      '  <div class="lifestyle-copy-side">' +
      '    <div class="lifestyle-label">' + escapeHtml(_copy.ourStoryLabel || 'OUR STORY') + '</div>' +
      '    <h2 class="lifestyle-heading">' + escapeHtml(_copy.ourStoryHeading || 'Family, Heritage & the West.') + '</h2>' +
      '    <p>' + escapeHtml(_copy.ourStoryBody || ('Since 1965, ' + BRAND_NAME + ' has outfitted families in authentic western wear — boots, hats, and denim built to last and made to be lived in. Every piece is chosen to help you express what makes you, you.')) + '</p>' +
      '    <a href="' + _catHref(0, '/boots') + '" class="btn btn-dark">' + escapeHtml(_copy.ourStoryCta || 'Shop the Collection') + '</a>' +
      '  </div>' +
      '</section>';

    loadProducts().then(function (products) {
      // Signed-in: strongly personalized grid driven by Rachel's jewelry box.
      if (personalized && window.Persona) {
        var box = window.Persona.getJewelryBox(products);
        var recs = window.Persona.recommendFromBox(box, products, 8);
        var pGrid = document.getElementById('featured-grid');
        if (pGrid && recs.length) {
          pGrid.innerHTML = recs.map(function (p) { return productCard(p, products); }).join('');
          staggerCards(pGrid);
          wireQuickView(pGrid);
        }
        var pMosaic = document.getElementById('look-mosaic');
        if (pMosaic) {
          pMosaic.innerHTML = buildLooks(products).map(function (l) { return lookTile(l, l._size); }).join('');
          staggerCards(pMosaic);
          wireQuickView(pMosaic);
        }
        wireOccasionChips(document.querySelector('.occasion-discovery'));
        renderRecentlyViewed();
        return;
      }

      var categoryPicks = deriveOrDefaultCategoryPicks(products);

      var featured = [];
      var usedNames = {};

      categoryPicks.forEach(function (pick) {
        var match = products.filter(function (p) {
          if (usedNames[p.name]) return false;
          if (!p.price || !p.image) return false;
          if (p.family !== pick.family) return false;
          return pick.category.test(p.category || '');
        })[0];
        if (match) {
          featured.push(match);
          usedNames[match.name] = true;
        }
      });

      if (featured.length < 8) {
        var extras = products.filter(function (p) {
          return !usedNames[p.name] && p.price && p.image;
        });
        for (var i = 0; i < extras.length && featured.length < 8; i++) {
          featured.push(extras[i]);
          usedNames[extras[i].name] = true;
        }
      }

      var grid = document.getElementById('featured-grid');
      if (grid) {
        grid.innerHTML = featured.map(function(p) { return productCard(p, products); }).join('');
        staggerCards(grid);
        wireQuickView(grid);
      }

      // Visual "Shop the Look" mosaic
      var mosaic = document.getElementById('look-mosaic');
      if (mosaic) {
        mosaic.innerHTML = buildLooks(products).map(function(l) { return lookTile(l, l._size); }).join('');
        staggerCards(mosaic);
        wireQuickView(mosaic);
      }

      // Occasion discovery chips
      wireOccasionChips(document.querySelector('.occasion-discovery'));

      // Render recently viewed rail if there are items
      renderRecentlyViewed();
    });
  }

  /** Render the recently viewed rail below the main content */
  function renderRecentlyViewed() {
    // Remove existing rail
    var existing = document.getElementById('recently-viewed-section');
    if (existing) existing.remove();

    if (_recentlyViewed.length === 0) return;

    var main = document.getElementById('app-root');
    if (!main) return;

    var section = document.createElement('section');
    section.className = 'recently-viewed-section';
    section.id = 'recently-viewed-section';

    var cards = _recentlyViewed.map(function(item) {
      var imgSrc = proxyImg(item.image);
      return '<div class="recently-viewed-card" data-name="' + escapeHtml(item.name) + '" ' +
        'data-image="' + escapeHtml(imgSrc || '') + '" ' +
        'data-price="' + escapeHtml(item.price || '') + '" ' +
        'data-category="' + escapeHtml(item.category || '') + '" ' +
        'data-family="' + escapeHtml(item.family || '') + '" ' +
        'data-brand="' + escapeHtml(BRAND_NAME) + '" data-description="">' +
        (imgSrc
          ? '<img class="recently-viewed-card-img" src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">'
          : '<div class="recently-viewed-card-img" style="display:flex;align-items:center;justify-content:center;background:#f0f0f0">' +
              '<span style="font-size:2rem">' + categoryIcon(item.category) + '</span>' +
            '</div>') +
        '<p class="recently-viewed-card-name">' + escapeHtml(item.name) + '</p>' +
        (item.price ? '<p class="recently-viewed-card-price">' + escapeHtml(String(item.price).replace(/^\$?/, '$')) + '</p>' : '') +
      '</div>';
    }).join('');

    section.innerHTML = '<div class="container">' +
      '<div class="recently-viewed-header">' +
        '<h3 class="recently-viewed-title">Recently Viewed</h3>' +
        '<button class="recently-viewed-clear" id="clear-recently-viewed">Clear All</button>' +
      '</div>' +
      '<div class="recently-viewed-rail">' + cards + '</div>' +
    '</div>';

    // Insert after main content, before curation zone
    main.parentNode.insertBefore(section, main.nextSibling);

    // Wire click → quickview
    section.querySelector('.recently-viewed-rail').addEventListener('click', function(e) {
      var card = e.target.closest('.recently-viewed-card');
      if (card) openQuickView(card);
    });

    // Wire clear button
    section.querySelector('#clear-recently-viewed').addEventListener('click', function() {
      _recentlyViewed = [];
      try { sessionStorage.setItem('nto_recently_viewed', JSON.stringify([])); } catch(_) {}
      section.remove();
    });
  }

  // ---------- Category ----------
  function renderCategory(route, root) {
    root.innerHTML =
      '<section class="category-hero">' +
      '  <div class="container">' +
      '    <h1 class="category-title">' + escapeHtml(route.label) +
           (route.subcategory ? ' / ' + escapeHtml(route.subcategory) : '') + '</h1>' +
      '    <p class="category-subtitle">Ask ' + escapeHtml(AGENT_NAME) + ' below to help you find the perfect piece.</p>' +
      '  </div>' +
      '</section>' +
      '<section class="section">' +
      '  <div class="container">' +
      '    <div class="product-grid" id="category-grid"><p class="loading-text">Loading…</p></div>' +
      '  </div>' +
      '</section>';

    loadProducts().then(function (products) {
      var filtered = products.filter(function (p) {
        // Generated routes carry `category` (navCategories are category-level
        // labels); the legacy baked Cavender's fallback route table carries
        // `family` instead — match whichever one this route actually set.
        if (route.category) {
          if (p.category !== route.category) return false;
        } else if (p.family !== route.family) {
          return false;
        }
        if (route.subcategory) {
          var sub = route.subcategory.toLowerCase();
          return (p.category || '').toLowerCase().indexOf(sub) !== -1;
        }
        return true;
      });
      var grid = document.getElementById('category-grid');
      if (!grid) return;
      if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">No products yet in this category. Try asking the AI assistant.</p>';
      } else {
        grid.innerHTML = filtered.map(function(p) { return productCard(p, products); }).join('');
        staggerCards(grid);
        wireQuickView(grid);
      }

      // Render recently viewed rail
      renderRecentlyViewed();
    });
  }

  // Initialize wishlist badge on load
  document.addEventListener('DOMContentLoaded', updateWishlistBadge);

  // Brand stores near a shipped-to address, now sourced from
  // window.BrandConfig.stores (directory + pickupWindows). A few metros are
  // hand-listed by the generator; anywhere else falls back to plausible local
  // stores built from the city name. Each store carries a same-/next-day pickup
  // window (< 24h). Shared by the regular checkout and Coco's inline checkout.
  var _bcStores = (window.BrandConfig && window.BrandConfig.stores) || {};
  var STORE_DIRECTORY = _bcStores.directory || {};
  var PICKUP_WINDOWS = _bcStores.pickupWindows || ['Ready in 2 hours', 'Ready today by 5:00 PM', 'Ready tomorrow by 10:00 AM'];

  function nearbyStores(city, state) {
    var key = (city || '').trim().toLowerCase();
    var list = STORE_DIRECTORY[key];
    if (!list) {
      var c = (city || '').trim() || 'Downtown';
      list = [
        { name: c + ' Galleria', addr: 'Galleria Mall, ' + c },
        { name: 'Downtown ' + c, addr: '100 Main St, ' + c },
        { name: c + ' Town Center', addr: 'Town Center Blvd, ' + c }
      ];
    }
    return list.slice(0, 3).map(function (s, i) {
      return {
        name: BRAND_NAME + ' — ' + s.name,
        addr: s.addr + (state ? ', ' + state : ''),
        ready: PICKUP_WINDOWS[i] || 'Ready within 24 hours',
        distance: (2.4 + i * 3.1).toFixed(1) + ' mi'
      };
    });
  }

  // ============================================================
  // Checkout Flow — 3-step: Shipping → Payment → Confirmation
  // ============================================================
  function renderCheckout(root) {
    var WC = window.WebCuration;
    var cart = WC && WC._getCart ? WC._getCart() : JSON.parse(sessionStorage.getItem('nto_cart') || '[]');

    // Pre-fill shipping from the demo persona (Rachel Morris, TX) so checkout
    // matches sign-in / profile. Fall back to sensible TX defaults.
    var _ckR = (window.Persona && window.Persona.RACHEL) || {};
    var _ckLoc = ((window.Persona && window.Persona.PROFILE && window.Persona.PROFILE.location) || 'Austin, TX').split(',');
    var _ckName = _ckR.name || 'Rachel Morris';
    var _ckEmail = _ckR.email || 'rmorris@example.com';
    var _ckCity = (_ckLoc[0] || 'Austin').trim();
    var _ckState = (_ckLoc[1] || 'TX').trim();

    // If cart is empty, redirect home
    if (cart.length === 0) {
      root.innerHTML =
        '<section class="checkout-page"><div class="container" style="text-align:center;padding:80px 20px">' +
          '<div style="font-size:3rem;margin-bottom:16px">🛒</div>' +
          '<h2>Your cart is empty</h2>' +
          '<p style="color:#6b7280;margin:8px 0 24px">Add some items before checking out.</p>' +
          '<a href="/" class="checkout-continue-btn">Start Shopping</a>' +
        '</div></section>';
      return;
    }

    var _step = 1; // 1=Shipping, 2=Payment, 3=Confirmation
    var _shippingData = {};
    var _deliveryMethod = 'ship';   // 'ship' | 'pickup'
    var _pickupStore = null;        // selected store object when picking up

    // Quote-safe (delegates to the module-level escapeHtml) — this local's
    // results are used inside double-quoted HTML attributes (data-offer-id,
    // img src), where the old textContent-based escape left quotes raw.
    function esc(s) { return escapeHtml(s); }

    function getTotal() {
      return WC && WC._getCartTotal ? WC._getCartTotal() : 0;
    }

    var promo = window.BirthdayPromo;
    var Offers = window.Offers;
    var BASE_SHIPPING = 9.95; // standard shipping, waived by the Free Shipping offer

    function buildSidebar() {
      var total = getTotal();
      var shipping = _deliveryMethod === 'pickup'
        ? 0
        : (Offers ? Offers.shippingFor(BASE_SHIPPING) : BASE_SHIPPING);
      var shipFree = shipping === 0;
      var discount = Offers ? Offers.discountFor(cart) : 0;
      var taxable = Math.max(0, total - discount);
      var tax = Math.round(taxable * 0.0875 * 100) / 100;
      var grandTotal = Math.round((taxable + shipping + tax) * 100) / 100;

      var html = '<h3 class="checkout-sidebar-title">Order Summary</h3>';
      cart.forEach(function(item) {
        var priceNum = parseFloat(item.price) || 0;
        var qty = item.quantity || 1;
        html += '<div class="checkout-sidebar-item">' +
          '<div class="checkout-sidebar-item-img">' +
            (item.image ? '<img src="' + esc(item.image) + '" alt="" loading="lazy">' : '') +
          '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="checkout-sidebar-item-name">' + esc(item.name) + '</div>' +
            '<div class="checkout-sidebar-item-qty">Qty: ' + qty + '</div>' +
          '</div>' +
          '<div class="checkout-sidebar-item-price">$' + (priceNum * qty).toFixed(2) + '</div>' +
        '</div>';
      });

      // Activatable offers: one control per eligible offer. Up to two stack;
      // a control conflicting with an active offer is greyed out (disabled).
      if (Offers) {
        var offerList = Offers.list();
        var conflicted = Offers.conflictedIds();
        if (offerList.length) {
          html += '<div class="checkout-promos">';
          offerList.forEach(function (offer) {
            var emoji = offer.emoji || '🎁';
            if (Offers.isActive(offer.id)) {
              html += '<div class="checkout-promo checkout-promo--applied" data-offer-id="' + esc(offer.id) + '">' +
                '<span class="checkout-promo-tag">' + emoji + ' ' + esc(offer.label) + ' applied</span>' +
                '<button type="button" class="checkout-promo-remove" data-offer-deactivate="' + esc(offer.id) + '">Remove</button>' +
              '</div>';
            } else {
              var isDisabled = conflicted.indexOf(offer.id) !== -1;
              html += '<button type="button" class="checkout-promo-apply' +
                (isDisabled ? ' checkout-promo--disabled' : '') + '"' +
                (isDisabled ? ' disabled' : ' data-offer-activate="' + esc(offer.id) + '"') +
                '>' +
                emoji + ' Apply ' + esc(offer.label) + ' — ' + esc(offer.short) +
                '<small class="checkout-promo-code">CODE ' + esc(offer.code) + '</small>' +
                (isDisabled ? '<small class="checkout-promo-note">Can’t combine with an active offer</small>' : '') +
              '</button>';
            }
          });
          html += '</div>';
        }
      }

      html += '<div class="checkout-sidebar-totals">' +
        '<div class="checkout-sidebar-row"><span>Subtotal</span><span>$' + total.toFixed(2) + '</span></div>';
      // One discount line per active discount offer.
      if (Offers) {
        Offers.list().forEach(function (offer) {
          if (!Offers.isActive(offer.id)) return;
          var c = Offers.contribution(offer, cart);
          if (c > 0) {
            html += '<div class="checkout-sidebar-row checkout-sidebar-row--discount"><span>' +
              esc(offer.label) + ' (' + esc(offer.code) + ')</span><span>−$' + c.toFixed(2) + '</span></div>';
          }
        });
      }
      html += '<div class="checkout-sidebar-row"><span>' +
          (_deliveryMethod === 'pickup' ? 'Store Pickup' : 'Shipping') + '</span><span>' +
          (shipFree
            ? (_deliveryMethod === 'pickup' ? 'Free' : '<s class="ship-strike">$' + BASE_SHIPPING.toFixed(2) + '</s> Free')
            : '$' + shipping.toFixed(2)) +
          '</span></div>' +
        '<div class="checkout-sidebar-row"><span>Tax</span><span>$' + tax.toFixed(2) + '</span></div>' +
        '<div class="checkout-sidebar-row total-row"><span>Total</span><span>$' + grandTotal.toFixed(2) + '</span></div>' +
      '</div>';
      return html;
    }

    // Re-render just the sidebar in place (keeps the current checkout step) and
    // re-wire its promo controls.
    function refreshSidebar() {
      var aside = document.querySelector('.checkout-sidebar');
      if (!aside) return;
      aside.innerHTML = buildSidebar();
      wirePromo();
    }
    function wirePromo() {
      if (!Offers) return;
      var aside = document.querySelector('.checkout-sidebar');
      if (!aside) return;
      aside.querySelectorAll('[data-offer-activate]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          Offers.activate(btn.getAttribute('data-offer-activate'));
          refreshSidebar();
        });
      });
      aside.querySelectorAll('[data-offer-deactivate]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          Offers.deactivate(btn.getAttribute('data-offer-deactivate'));
          refreshSidebar();
        });
      });
    }

    function buildSteps(activeStep) {
      var labels = ['Shipping', 'Payment', 'Confirmation'];
      var html = '<div class="checkout-steps">';
      labels.forEach(function(label, i) {
        var num = i + 1;
        var cls = num === activeStep ? 'step-active' : (num < activeStep ? 'step-done' : '');
        html += '<div class="checkout-step ' + cls + '">' +
          '<span class="checkout-step-num">' + (num < activeStep ? '✓' : num) + '</span>' +
          '<span>' + label + '</span>' +
        '</div>';
      });
      html += '</div>';
      return html;
    }

    function renderStep() {
      if (_step === 1) renderShipping();
      else if (_step === 2) renderPayment();
      else renderConfirmation();
    }

    function renderShipping() {
      root.innerHTML =
        '<section class="checkout-page"><div class="container">' +
          '<div class="checkout-container">' +
            buildSteps(1) +
            '<div class="checkout-form-area">' +
              '<h2 class="checkout-section-title">Delivery Method</h2>' +
              '<div class="checkout-delivery">' +
                '<label class="delivery-option' + (_deliveryMethod === 'ship' ? ' delivery-option--active' : '') + '" id="delivery-ship">' +
                  '<input type="radio" name="ck-delivery" value="ship"' + (_deliveryMethod === 'ship' ? ' checked' : '') + '>' +
                  '<div class="delivery-option-body">' +
                    '<div class="delivery-option-title">🚚 Standard Shipping</div>' +
                    '<div class="delivery-option-sub">Arrives in 3–5 business days</div>' +
                  '</div>' +
                  '<span class="delivery-option-price">' +
                    (Offers && Offers.shippingFor(BASE_SHIPPING) === 0
                      ? '<s class="ship-strike">$' + BASE_SHIPPING.toFixed(2) + '</s> Free'
                      : '$' + BASE_SHIPPING.toFixed(2)) +
                  '</span>' +
                '</label>' +
                '<label class="delivery-option' + (_deliveryMethod === 'pickup' ? ' delivery-option--active' : '') + '" id="delivery-pickup">' +
                  '<input type="radio" name="ck-delivery" value="pickup"' + (_deliveryMethod === 'pickup' ? ' checked' : '') + '>' +
                  '<div class="delivery-option-body">' +
                    '<div class="delivery-option-title">🏬 Pick Up In Store <span class="delivery-badge">Ready in 24 hrs</span></div>' +
                    '<div class="delivery-option-sub">Skip the wait — grab it today or tomorrow</div>' +
                  '</div>' +
                  '<span class="delivery-option-price">Free</span>' +
                '</label>' +
              '</div>' +
              '<div id="ck-store-list" class="checkout-store-list"></div>' +
              '<h2 class="checkout-section-title" id="ck-addr-title">Shipping Address</h2>' +
              '<div class="checkout-form-group">' +
                '<label>Full Name</label>' +
                '<input type="text" id="ck-name" value="' + escapeHtml(_ckName) + '" placeholder="Full name">' +
              '</div>' +
              '<div class="checkout-form-group">' +
                '<label>Email</label>' +
                '<input type="email" id="ck-email" value="' + escapeHtml(_ckEmail) + '" placeholder="Email">' +
              '</div>' +
              '<div class="checkout-form-group">' +
                '<label>Address</label>' +
                '<input type="text" id="ck-address" value="100 Main St" placeholder="Street address">' +
              '</div>' +
              '<div class="checkout-form-row">' +
                '<div class="checkout-form-group">' +
                  '<label>City</label>' +
                  '<input type="text" id="ck-city" value="' + escapeHtml(_ckCity) + '" placeholder="City">' +
                '</div>' +
                '<div class="checkout-form-group">' +
                  '<label>State</label>' +
                  '<input type="text" id="ck-state" value="' + escapeHtml(_ckState) + '" placeholder="State">' +
                '</div>' +
              '</div>' +
              '<div class="checkout-form-row">' +
                '<div class="checkout-form-group">' +
                  '<label>ZIP Code</label>' +
                  '<input type="text" id="ck-zip" value="00000" placeholder="ZIP">' +
                '</div>' +
                '<div class="checkout-form-group">' +
                  '<label>Phone</label>' +
                  '<input type="text" id="ck-phone" value="(817) 555-0142" placeholder="Phone">' +
                '</div>' +
              '</div>' +
              '<button class="checkout-btn" id="ck-to-payment">Continue to Payment</button>' +
              '<button class="checkout-back-btn" id="ck-back-shop">← Back to Shopping</button>' +
            '</div>' +
            '<aside class="checkout-sidebar">' + buildSidebar() + '</aside>' +
          '</div>' +
        '</div></section>';

      // Render the nearby-store picker from the address currently in the form
      // (the most recent shipped-to address), then wire selection.
      function renderStoreList() {
        var listEl = document.getElementById('ck-store-list');
        if (!listEl) return;
        var city = (document.getElementById('ck-city') || {}).value || '';
        var state = (document.getElementById('ck-state') || {}).value || '';
        var stores = nearbyStores(city, state);
        // Keep a valid selection: default to the first (fastest) store.
        if (!_pickupStore || stores.every(function (s) { return s.name !== _pickupStore.name; })) {
          _pickupStore = stores[0];
        }
        listEl.innerHTML =
          '<p class="checkout-store-intro">Stores near <strong>' + esc(city || 'your address') + '</strong> with pickup in the next 24 hours:</p>' +
          stores.map(function (s, i) {
            var active = _pickupStore && _pickupStore.name === s.name;
            return '<label class="store-card' + (active ? ' store-card--active' : '') + '" data-idx="' + i + '">' +
              '<input type="radio" name="ck-store"' + (active ? ' checked' : '') + '>' +
              '<div class="store-card-body">' +
                '<div class="store-card-name">' + esc(s.name) + '</div>' +
                '<div class="store-card-addr">' + esc(s.addr) + ' · ' + esc(s.distance) + ' away</div>' +
              '</div>' +
              '<span class="store-card-ready">✓ ' + esc(s.ready) + '</span>' +
            '</label>';
          }).join('');
        listEl.querySelectorAll('.store-card').forEach(function (card) {
          card.addEventListener('click', function () {
            _pickupStore = stores[parseInt(card.getAttribute('data-idx'), 10)] || stores[0];
            renderStoreList();
          });
        });
      }

      function setDeliveryMethod(method) {
        _deliveryMethod = method;
        var shipOpt = document.getElementById('delivery-ship');
        var pickOpt = document.getElementById('delivery-pickup');
        if (shipOpt) shipOpt.classList.toggle('delivery-option--active', method === 'ship');
        if (pickOpt) pickOpt.classList.toggle('delivery-option--active', method === 'pickup');
        var listEl = document.getElementById('ck-store-list');
        var addrTitle = document.getElementById('ck-addr-title');
        var goBtn = document.getElementById('ck-to-payment');
        if (method === 'pickup') {
          if (addrTitle) addrTitle.textContent = 'Contact & Pickup Details';
          if (goBtn) goBtn.textContent = 'Continue to Payment';
          renderStoreList();
          if (listEl) listEl.style.display = 'block';
        } else {
          _pickupStore = null;
          if (listEl) { listEl.style.display = 'none'; listEl.innerHTML = ''; }
          if (addrTitle) addrTitle.textContent = 'Shipping Address';
        }
        refreshSidebar();
      }

      var shipRadio = document.querySelector('#delivery-ship input');
      var pickRadio = document.querySelector('#delivery-pickup input');
      if (shipRadio) shipRadio.addEventListener('change', function () { setDeliveryMethod('ship'); });
      if (pickRadio) pickRadio.addEventListener('change', function () { setDeliveryMethod('pickup'); });
      // Restore panel state on re-render (e.g. returning from Payment).
      setDeliveryMethod(_deliveryMethod);

      document.getElementById('ck-to-payment').addEventListener('click', function() {
        _shippingData = {
          name: document.getElementById('ck-name').value,
          email: document.getElementById('ck-email').value,
          address: document.getElementById('ck-address').value,
          city: document.getElementById('ck-city').value,
          state: document.getElementById('ck-state').value,
          zip: document.getElementById('ck-zip').value,
          phone: document.getElementById('ck-phone').value,
          deliveryMethod: _deliveryMethod,
          pickupStore: _deliveryMethod === 'pickup' ? _pickupStore : null
        };
        _step = 2;
        renderStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      document.getElementById('ck-back-shop').addEventListener('click', function() {
        if (window.Router) window.Router.navigate('/');
      });
      wirePromo();
    }

    function renderPayment() {
      root.innerHTML =
        '<section class="checkout-page"><div class="container">' +
          '<div class="checkout-container">' +
            buildSteps(2) +
            '<div class="checkout-form-area">' +
              '<h2 class="checkout-section-title">Payment Method</h2>' +
              '<div class="checkout-shipping-summary">' +
                (_deliveryMethod === 'pickup' && _pickupStore
                  ? '<strong>🏬 Pick up at:</strong>' +
                    esc(_pickupStore.name) + '<br>' +
                    esc(_pickupStore.addr) + '<br>' +
                    '<span class="checkout-pickup-ready">✓ ' + esc(_pickupStore.ready) + '</span>'
                  : '<strong>Shipping to:</strong>' +
                    esc(_shippingData.name) + '<br>' +
                    esc(_shippingData.address) + '<br>' +
                    esc(_shippingData.city) + ', ' + esc(_shippingData.state) + ' ' + esc(_shippingData.zip)) +
              '</div>' +
              '<div class="checkout-card-visual">' +
                '<div class="checkout-card-number">•••• •••• •••• 4242</div>' +
                '<div class="checkout-card-name">' + esc(_shippingData.name) + '</div>' +
              '</div>' +
              '<div class="checkout-form-group">' +
                '<label>Card Number</label>' +
                '<input type="text" value="•••• •••• •••• 4242" disabled style="background:#f3f4f6">' +
              '</div>' +
              '<div class="checkout-form-row">' +
                '<div class="checkout-form-group">' +
                  '<label>Expiry</label>' +
                  '<input type="text" value="12/28" disabled style="background:#f3f4f6">' +
                '</div>' +
                '<div class="checkout-form-group">' +
                  '<label>CVV</label>' +
                  '<input type="text" value="•••" disabled style="background:#f3f4f6">' +
                '</div>' +
              '</div>' +
              '<button class="checkout-btn" id="ck-place-order">🔒 Place Order</button>' +
              '<button class="checkout-back-btn" id="ck-back-shipping">← Back to Shipping</button>' +
            '</div>' +
            '<aside class="checkout-sidebar">' + buildSidebar() + '</aside>' +
          '</div>' +
        '</div></section>';

      document.getElementById('ck-place-order').addEventListener('click', function() {
        var btn = this;
        btn.textContent = 'Processing...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        // Simulate processing delay
        setTimeout(function() {
          _step = 3;
          renderStep();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 1500);
      });

      document.getElementById('ck-back-shipping').addEventListener('click', function() {
        _step = 1;
        renderStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      wirePromo();
    }

    function renderConfirmation() {
      var total = getTotal();
      var discount = promo ? promo.discountFor(cart) : 0;
      var taxable = Math.max(0, total - discount);
      var tax = Math.round(taxable * 0.0875 * 100) / 100;
      var grandTotal = Math.round((taxable + tax) * 100) / 100;
      // Order-number prefix derives from THIS brand's own name/socialTag —
      // never a hardcoded reference-brand prefix left over from a prior demo.
      var _brandForOrder = (window.BrandConfig && window.BrandConfig.brand) || {};
      var orderPrefix = String(_brandForOrder.socialTag || _brandForOrder.name || 'ORD')
        .replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'ORD';
      var orderNum = orderPrefix + '-' + new Date().getFullYear() + '-' + String(Math.floor(10000 + Math.random() * 90000));

      var itemsHtml = '';
      cart.forEach(function(item) {
        var priceNum = parseFloat(item.price) || 0;
        var qty = item.quantity || 1;
        itemsHtml += '<div class="checkout-conf-item">' +
          (item.image ? '<img src="' + esc(item.image) + '" alt="" loading="lazy">' : '<span style="font-size:1.5rem">📦</span>') +
          '<span class="checkout-conf-item-name">' + esc(item.name) + (qty > 1 ? ' ×' + qty : '') + '</span>' +
          '<span class="checkout-conf-item-price">$' + (priceNum * qty).toFixed(2) + '</span>' +
        '</div>';
      });

      root.innerHTML =
        '<section class="checkout-page"><div class="container">' +
          '<div class="checkout-container">' +
            buildSteps(3) +
            '<div class="checkout-confirmation">' +
              '<div class="checkout-success-icon">✓</div>' +
              '<h2 style="margin:0 0 8px">Order Confirmed!</h2>' +
              '<p class="checkout-order-number">Order Number: <span>' + orderNum + '</span></p>' +
              '<div class="checkout-conf-summary">' +
                itemsHtml +
                (discount > 0 ?
                  '<div class="checkout-conf-item checkout-conf-item--discount">' +
                    '<span style="font-size:1.5rem">🎂</span>' +
                    '<span class="checkout-conf-item-name">' + esc(promo.label) + ' (' + esc(promo.code) + ')</span>' +
                    '<span class="checkout-conf-item-price">−$' + discount.toFixed(2) + '</span>' +
                  '</div>' : '') +
                '<div class="checkout-conf-total">' +
                  '<span>Total</span>' +
                  '<span>$' + grandTotal.toFixed(2) + '</span>' +
                '</div>' +
              '</div>' +
              '<p class="checkout-conf-address">' +
                (_deliveryMethod === 'pickup' && _pickupStore
                  ? '🏬 Pick up at ' + esc(_pickupStore.name) + ' · ' + esc(_pickupStore.addr) +
                    ' — ' + esc(_pickupStore.ready)
                  : 'Shipping to: ' + esc(_shippingData.name) + ' · ' +
                    esc(_shippingData.address) + ', ' +
                    esc(_shippingData.city) + ', ' + esc(_shippingData.state) + ' ' + esc(_shippingData.zip)) +
              '</p>' +
              '<button class="checkout-continue-btn" id="ck-continue-shopping">Continue Shopping</button>' +
            '</div>' +
          '</div>' +
        '</div></section>';

      // Clear cart
      if (WC && WC._clearCart) WC._clearCart();

      // Confetti celebration
      launchConfetti();

      document.getElementById('ck-continue-shopping').addEventListener('click', function() {
        if (window.Router) window.Router.navigate('/');
      });
    }

    function launchConfetti() {
      var container = document.createElement('div');
      container.className = 'checkout-confetti';
      document.body.appendChild(container);
      var colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
      for (var i = 0; i < 60; i++) {
        var piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = (Math.random() * 2) + 's';
        piece.style.animationDuration = (2 + Math.random() * 2) + 's';
        var size = 6 + Math.random() * 8;
        piece.style.width = size + 'px';
        piece.style.height = size + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        container.appendChild(piece);
      }
      setTimeout(function() { container.remove(); }, 5000);
    }

    // Initial render
    renderStep();
  }

  /**
   * Render search results inline (for /search?q=... route).
   */
  function renderSearch(route, root) {
    var query = route.query || '';
    root.innerHTML =
      '<section class="category-hero">' +
      '  <div class="container">' +
      '    <h1 class="category-title">🔍 Search Results</h1>' +
      '    <p class="category-subtitle">Showing results for "' + escapeHtml(query) + '"</p>' +
      '  </div>' +
      '</section>' +
      '<section class="section">' +
      '  <div class="container">' +
      '    <div class="product-grid" id="search-inline-grid"><p class="loading-text">Searching…</p></div>' +
      '  </div>' +
      '</section>';

    if (!query || !window.SiteSearch) {
      document.getElementById('search-inline-grid').innerHTML =
        '<p class="empty-state">Enter a search term to find products.</p>';
      return;
    }

    // Wait for products to load
    window.SiteSearch.loadProducts().then(function () {
      var result = window.SiteSearch.search(query);
      var grid = document.getElementById('search-inline-grid');
      if (!grid) return;
      if (result.total === 0) {
        grid.innerHTML = '<p class="empty-state">No products found for "' + escapeHtml(query) + '". Try asking the AI assistant.</p>';
        renderRecentlyViewed();
        return;
      }

      var look = result.look || {};
      var families = (result.families || []).filter(function (f) { return look[f] && look[f].length; });

      // Query named a specific product type/style ("earrings", "hoops") → show
      // ONLY that type, with a small "Frequently bought with" row beneath it.
      if (result.typeScoped) {
        var section0 = grid.closest('.section');
        var leadItems = look[result.leadFamily] || result.results;
        var fbw = result.frequentlyBoughtWith || [];
        var leadCards = leadItems.map(function (p) { return productCard(p, result.results); }).join('');
        var html = '<div class="look-row">' +
          '<h2 class="look-row-title">' + escapeHtml(result.leadFamily) + '</h2>' +
          '<div class="product-grid look-row-grid">' + leadCards + '</div>' +
          '</div>';
        if (fbw.length) {
          var fbwCards = fbw.map(function (p) { return productCard(p, result.results); }).join('');
          html += '<div class="look-row">' +
            '<h2 class="look-row-title"><span class="look-row-lead">Frequently bought with</span></h2>' +
            '<div class="product-grid look-row-grid">' + fbwCards + '</div>' +
            '</div>';
        }
        if (section0) {
          section0.innerHTML = '<div class="container">' +
            '<div class="look-builder" id="search-look-builder">' + html + '</div>' +
            '</div>';
          var scopedBuilder = document.getElementById('search-look-builder');
          scopedBuilder.querySelectorAll('.product-grid').forEach(function (g) {
            staggerCards(g);
            wireQuickView(g);
          });
        }
        renderRecentlyViewed();
        return;
      }

      // Multi-family result → "Build Your Look": a labeled row per family so the
      // shopper explores a curated look (lead piece + complements), not a color
      // wall. Single-family → the tight grid, as before.
      if (families.length > 1) {
        // Replace the whole section with a look layout.
        var section = grid.closest('.section');
        var labels = { lead: '· styled 3 ways', pair: 'Pair with', add: 'Add' };
        var rowsHtml = families.map(function (fam, idx) {
          var heading = idx === 0
            ? escapeHtml(fam) + ' <span class="look-row-sub">' + labels.lead + '</span>'
            : '<span class="look-row-lead">' + (idx === 1 ? labels.pair : labels.add) + '</span> ' + escapeHtml(fam);
          var cards = look[fam].map(function (p) { return productCard(p, result.results); }).join('');
          return '<div class="look-row">' +
            '<h2 class="look-row-title">' + heading + '</h2>' +
            '<div class="product-grid look-row-grid">' + cards + '</div>' +
            '</div>';
        }).join('');
        if (section) {
          section.innerHTML = '<div class="container">' +
            '<div class="look-builder" id="search-look-builder">' + rowsHtml + '</div>' +
            '</div>';
          var builder = document.getElementById('search-look-builder');
          builder.querySelectorAll('.product-grid').forEach(function (g) {
            staggerCards(g);
            wireQuickView(g);
          });
        }
      } else {
        grid.innerHTML = result.results.map(function (p) { return productCard(p, result.results); }).join('');
        staggerCards(grid);
        wireQuickView(grid);
      }
      renderRecentlyViewed();
    });
  }

  // ---------- Profile (Dakota Reyes — customer-facing Data Cloud profile) ----------
  function renderProfile(root) {
    // Signed-out: gentle empty state that invites sign-in.
    if (!isIdentified()) {
      root.innerHTML =
        '<section class="profile-empty">' +
        '  <div class="container">' +
        '    <div class="profile-empty-icon">✨</div>' +
        '    <h1 class="profile-empty-title">Your Profile Awaits</h1>' +
        '    <p class="profile-empty-text">Sign in to see your closet, style profile, and recommendations tailored just for you.</p>' +
        '    <button class="btn btn-dark" id="profile-signin-btn">Sign In</button>' +
        '  </div>' +
        '</section>';
      var btn = document.getElementById('profile-signin-btn');
      if (btn) btn.addEventListener('click', function () {
        if (window.openSignInModal) window.openSignInModal();
      });
      return;
    }

    var identity = window.WebCuration.getUserIdentity();
    var P = (window.Persona && window.Persona.PROFILE) || {};
    var R = (window.Persona && window.Persona.RACHEL) || {};
    // Single fixed persona: always present as Rachel Morris regardless of the
    // email typed at sign-in (the stored identity may hold a derived name).
    var name = R.name || 'Rachel Morris';
    var email = R.email || (identity && identity.email) || '';
    var avatarInitials = name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
    var wishlist = _wishlist || [];

    // Trait rows for the "Style Profile" attributes panel.
    var favCats = (P.favoriteCategories || []).map(function (c) {
      return '<span class="profile-chip">' + escapeHtml(c) + '</span>';
    }).join('');
    var colorChips = (P.colorPreferences || []).map(function (c) {
      return '<span class="profile-color-chip">' +
        '<span class="profile-color-dot" style="background:' + escapeHtml(c.hex) + '"></span>' +
        escapeHtml(c.name) + '</span>';
    }).join('');

    function trait(label, value) {
      return '<div class="profile-trait">' +
        '<span class="profile-trait-label">' + escapeHtml(label) + '</span>' +
        '<span class="profile-trait-value">' + value + '</span>' +
      '</div>';
    }

    root.innerHTML =
      // Hero
      '<section class="profile-hero">' +
      '  <div class="container profile-hero-inner">' +
      '    <div class="profile-avatar">' + escapeHtml(avatarInitials) + '</div>' +
      '    <div class="profile-hero-info">' +
      '      <span class="profile-tier">★ ' + escapeHtml(P.loyaltyTier || ('My ' + BRAND_NAME)) + '</span>' +
      '      <h1 class="profile-name">' + escapeHtml(name) + '</h1>' +
      '      <p class="profile-meta">Member since ' + escapeHtml(P.memberSince || '2023') +
             (P.location ? ' · ' + escapeHtml(P.location) : '') +
             (email ? ' · ' + escapeHtml(email) : '') + '</p>' +
      '      <div class="profile-stats">' +
      '        <div class="profile-stat"><span class="profile-stat-num" id="profile-pieces">—</span><span class="profile-stat-label">Pieces Owned</span></div>' +
      '        <div class="profile-stat"><span class="profile-stat-num">' + wishlist.length + '</span><span class="profile-stat-label">Wishlist</span></div>' +
      '        <div class="profile-stat"><span class="profile-stat-num">' + escapeHtml(P.lifetimeValue || '—') + '</span><span class="profile-stat-label">Lifetime Value</span></div>' +
      (P.birthday ? '        <div class="profile-stat"><span class="profile-stat-num">' + escapeHtml(P.birthday) + '</span><span class="profile-stat-label">Birthday</span></div>' : '') +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</section>' +

      // My Offers — multiple activatable rewards the shopper can turn on. Two
      // stack at checkout; conflicting offers grey each other out. The cards are
      // rendered/refreshed by renderOffersSection() below so the activate
      // animation and conflict greying can re-run on 'offers:changed'.
      '<section class="section offers-section" id="profile-offers-section">' +
      '  <div class="container">' +
      '    <h2 class="section-heading">My Offers</h2>' +
      '    <p class="section-subtitle">Activate your rewards — stack up to two at checkout.</p>' +
      '    <div class="offers-grid" id="profile-offers-grid"></div>' +
      '  </div>' +
      '</section>' +

      // Style Profile / attributes panel
      '<section class="section">' +
      '  <div class="container">' +
      '    <div class="profile-traits-card">' +
      '      <div class="profile-traits-head">' +
      '        <h2 class="profile-section-title">Your Style Profile</h2>' +
      '        <span class="profile-powered">Powered by Data Cloud</span>' +
      '      </div>' +
      '      <div class="profile-traits-grid">' +
             trait('Style Persona', '<strong>' + escapeHtml(P.stylePersona || '') + '</strong>') +
             trait('Favorite Categories', '<div class="profile-chip-row">' + favCats + '</div>') +
             trait('COLOR & STONE PREFERENCES', '<div class="profile-chip-row">' + colorChips + '</div>') +
             trait('Birthday', escapeHtml(P.birthday || '')) +
             trait('Metal Preference', escapeHtml(P.metalPreference || '')) +
             trait('Preferred Channel', escapeHtml(P.preferredChannel || '')) +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</section>' +

      // Jewelry box
      '<section class="section">' +
      '  <div class="container">' +
      '    <h2 class="section-heading">My Closet</h2>' +
      '    <p class="section-subtitle">The gear you\'ve collected and love.</p>' +
      '    <div class="product-grid" id="profile-box-grid">' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '    </div>' +
      '  </div>' +
      '</section>' +

      // Wishlist
      '<section class="section">' +
      '  <div class="container">' +
      '    <h2 class="section-heading">My Wishlist</h2>' +
      '    <div class="product-grid" id="profile-wishlist-grid"></div>' +
      '  </div>' +
      '</section>' +

      // Recommendations
      '<section class="section">' +
      '  <div class="container">' +
      '    <h2 class="section-heading">Recommended for You ' +
             '<span class="personalized-badge">✨ Based on your closet</span></h2>' +
      '    <p class="section-subtitle">' + escapeHtml(_copyCfg.recsSubtitle || 'More pieces we think you\'ll love.') + '</p>' +
      '    <div class="product-grid" id="profile-recs-grid">' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '      <div class="curation-loading" style="height:260px"></div>' +
      '    </div>' +
      '  </div>' +
      '</section>';

    // ── My Offers: render N activatable cards, animate activation, and grey out
    // conflicting offers. Re-runs on every 'offers:changed'.
    var Offers = window.Offers;
    function offerCardHtml(offer, opts) {
      opts = opts || {};
      var active = Offers.isActive(offer.id);
      var disabled = !active && Offers.conflictedIds().indexOf(offer.id) !== -1;
      var cls = 'offer-card' + (active ? ' is-activated' : '') +
        (disabled ? ' is-disabled' : '') + (opts.animate ? ' is-activating' : '');
      var action = active
        ? '<div class="offer-card-code-row">' +
            '<span class="offer-card-badge">✓ Activated</span>' +
            '<span class="offer-card-code">' + escapeHtml(offer.code || '') + '</span>' +
            '<button class="offer-card-deactivate" data-offer-deactivate="' + escapeHtml(offer.id) + '">Turn off</button>' +
          '</div>'
        : '<button class="offer-activate-btn btn btn-dark" data-offer-activate="' + escapeHtml(offer.id) + '"' +
            (disabled ? ' disabled' : '') + '>' + (disabled ? 'Unavailable with active reward' : 'Activate') + '</button>';
      return '<div class="' + cls + '" data-offer-id="' + escapeHtml(offer.id) + '">' +
        '<div class="offer-card-glow"></div>' +
        '<div class="offer-card-emoji" aria-hidden="true">' + escapeHtml(offer.emoji || '🏷️') + '</div>' +
        '<span class="offer-card-eyebrow">' + escapeHtml(offer.label || '') + '</span>' +
        '<p class="offer-card-body">' + escapeHtml(offer.long || offer.short || '') + '</p>' +
        action +
      '</div>';
    }
    function wireOffersSection(animateId) {
      var grid = document.getElementById('profile-offers-grid');
      if (!grid || !Offers) return;
      grid.innerHTML = Offers.list().map(function (o) {
        return offerCardHtml(o, { animate: animateId === o.id });
      }).join('');
      // Run the activate animation: force reflow, then drop the priming class so
      // the CSS transition to the activated state plays.
      if (animateId) {
        var justCard = grid.querySelector('.offer-card.is-activating');
        if (justCard) { void justCard.offsetWidth; justCard.classList.remove('is-activating'); }
      }
      grid.querySelectorAll('[data-offer-activate]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          var id = btn.getAttribute('data-offer-activate');
          Offers.activate(id);
          wireOffersSection(id);
        });
      });
      grid.querySelectorAll('[data-offer-deactivate]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          Offers.deactivate(btn.getAttribute('data-offer-deactivate'));
          wireOffersSection();
        });
      });
    }
    if (Offers) wireOffersSection();

    loadProducts().then(function (products) {
      var box = window.Persona ? window.Persona.getJewelryBox(products) : [];
      var recs = window.Persona ? window.Persona.recommendFromBox(box, products, 8) : [];

      var piecesEl = document.getElementById('profile-pieces');
      if (piecesEl) piecesEl.textContent = box.length;

      var boxGrid = document.getElementById('profile-box-grid');
      if (boxGrid) {
        boxGrid.innerHTML = box.map(function (p) { return productCard(p, products); }).join('');
        staggerCards(boxGrid);
        wireQuickView(boxGrid);
      }

      // Wishlist — map saved names to full catalog products where possible.
      var wishGrid = document.getElementById('profile-wishlist-grid');
      if (wishGrid) {
        if (!wishlist.length) {
          wishGrid.innerHTML = '<p class="empty-state">Your wishlist is empty. ♡ Tap the heart on any product to save it here.</p>';
        } else {
          var wishProducts = wishlist.map(function (w) {
            var found = products.filter(function (p) { return p.name === w.name; })[0];
            return found || { name: w.name, image: w.image, price: String(w.price || '').replace(/[^0-9.]/g, ''), category: '', family: '', description: '' };
          });
          wishGrid.innerHTML = wishProducts.map(function (p) { return productCard(p, products); }).join('');
          staggerCards(wishGrid);
          wireQuickView(wishGrid);
        }
      }

      var recsGrid = document.getElementById('profile-recs-grid');
      if (recsGrid) {
        recsGrid.innerHTML = recs.map(function (p) { return productCard(p, products); }).join('');
        staggerCards(recsGrid);
        wireQuickView(recsGrid);
      }

      renderRecentlyViewed();
    });
  }

  window.Views = {
    render: function (route, root) {
      if (route.name === 'checkout') renderCheckout(root);
      else if (route.name === 'search') renderSearch(route, root);
      else if (route.name === 'profile') renderProfile(root);
      else if (route.name === 'category') renderCategory(route, root);
      else renderHome(root);
    },
    openQuickView: openQuickView,
    staggerCards: staggerCards,
    toggleWishlist: toggleWishlist,
    isWishlisted: isWishlisted,
    getWishlist: function() { return _wishlist; },
    nearbyStores: nearbyStores,
    updateWishlistBadge: updateWishlistBadge,
    refreshWishlistHearts: refreshWishlistHearts,
    addRecentlyViewed: addRecentlyViewed,
    renderRecentlyViewed: renderRecentlyViewed,
    productRating: productRating,
    renderStars: renderStars,
    productCard: productCard,
    lookTile: lookTile,
    staggerCards: staggerCards,
    wireQuickView: wireQuickView,
    loadProducts: loadProducts
  };
})();
