/**
 * Cimulate-Style Search Overlay
 *
 * Full-screen search overlay with:
 * - Large centered search bar with voice input
 * - Live type-ahead suggestions as user types
 * - Categorized product results grid
 * - "Ask Coco" handoff to Agentforce agent
 * - Recent searches in sessionStorage
 * - Data Cloud beacon tracking
 */

(function () {
  'use strict';

  // Brand identity — single source of truth is window.BrandConfig (brand-config.js).
  var _brand = (window.BrandConfig && window.BrandConfig.brand) || {};
  var AGENT_NAME = _brand.agentName || 'Coco';
  var AGENT_ROLE = _brand.agentRole || 'stylist';
  // Western-wear-specific emoji (baked Cavender's demo only) vs. a neutral
  // AI icon for any generated brand — mirrors the gated fallback pattern in
  // search-engine.js's getCategoryIcon()/web-curation-component.js.
  function overlayHasGeneratedBrand() {
    var bc = window.BrandConfig || {};
    return !!((bc.navCategories && bc.navCategories.length) || (bc.trends && bc.trends.length));
  }
  var AGENT_ICON = overlayHasGeneratedBrand() ? '✨' : '🤠';
  var BRAND_NAME = _brand.name || "Cavender's";

  var RECENT_KEY = 'nto_recent_searches';
  var MAX_RECENT = 6;
  var _overlay = null;
  var _debounceTimer = null;
  var _isOpen = false;

  // Browse-category chips travel with the brand's own nav, not a fixed
  // Western-wear list — falls back to a generic default only if the
  // generated config somehow has no nav categories.
  function browseCategories(max) {
    var cats = (window.BrandConfig && window.BrandConfig.navCategories) || [];
    cats = cats.filter(function (c) { return c && c !== 'All'; });
    if (!cats.length) cats = ['New Arrivals', 'Best Sellers', 'Sale'];
    return cats.slice(0, max);
  }

  function searchPlaceholder() {
    var cats = browseCategories(3);
    return cats.length ? 'Search for ' + cats.join(', ').toLowerCase() + '…' : 'Search products…';
  }

  // ── Recent Searches ──
  function getRecentSearches() {
    try {
      return JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
    } catch (_) { return []; }
  }

  function addRecentSearch(query) {
    var recent = getRecentSearches().filter(function (r) { return r !== query; });
    recent.unshift(query);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (_) {}
  }

  function clearRecentSearches() {
    try { sessionStorage.removeItem(RECENT_KEY); } catch (_) {}
  }

  // ── Build Overlay DOM ──
  function createOverlay() {
    if (_overlay) return _overlay;

    var el = document.createElement('div');
    el.className = 'search-overlay';
    el.id = 'search-overlay';
    el.innerHTML =
      '<div class="search-overlay-backdrop"></div>' +
      '<div class="search-overlay-content">' +
        '<div class="search-overlay-header">' +
          '<div class="search-overlay-bar-wrap">' +
            '<svg class="search-overlay-icon" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' +
            '<input type="text" id="search-overlay-input" class="search-overlay-input" placeholder="' + escapeHtml(searchPlaceholder()) + '" autocomplete="off" spellcheck="false" />' +
            '<button id="search-overlay-clear" class="search-overlay-clear" aria-label="Clear" style="display:none">&times;</button>' +
            '<button id="search-overlay-voice" class="search-overlay-voice" aria-label="Voice search">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>' +
            '</button>' +
          '</div>' +
          '<button id="search-overlay-close" class="search-overlay-close-btn" aria-label="Close search">Cancel</button>' +
        '</div>' +
        '<div id="search-overlay-body" class="search-overlay-body">' +
          '<div id="search-suggestions" class="search-suggestions"></div>' +
          '<div id="search-results" class="search-results"></div>' +
        '</div>' +
        '<div class="search-overlay-powered">' +
          '<span class="search-powered-badge">⚡ Powered by AI Contextual Search</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);
    _overlay = el;

    // Wire events
    var input = el.querySelector('#search-overlay-input');
    var clearBtn = el.querySelector('#search-overlay-clear');
    var closeBtn = el.querySelector('#search-overlay-close');
    var voiceBtn = el.querySelector('#search-overlay-voice');
    var backdrop = el.querySelector('.search-overlay-backdrop');

    input.addEventListener('input', function () {
      clearBtn.style.display = this.value ? 'flex' : 'none';
      clearTimeout(_debounceTimer);
      var val = this.value;
      _debounceTimer = setTimeout(function () {
        handleInputChange(val);
      }, 150);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = this.value.trim();
        if (q) executeSearch(q);
      }
      if (e.key === 'Escape') closeOverlay();
    });

    clearBtn.addEventListener('click', function () {
      input.value = '';
      clearBtn.style.display = 'none';
      showDefaultState();
      input.focus();
    });

    closeBtn.addEventListener('click', closeOverlay);
    backdrop.addEventListener('click', closeOverlay);

    // Voice input
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      voiceBtn.addEventListener('click', function () {
        if (voiceBtn.classList.contains('voice-active')) return;
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        var rec = new SR();
        rec.lang = 'en-US';
        rec.interimResults = false;
        voiceBtn.classList.add('voice-active');
        rec.start();
        rec.onresult = function (e) {
          input.value = e.results[0][0].transcript;
          clearBtn.style.display = 'flex';
          voiceBtn.classList.remove('voice-active');
          executeSearch(input.value.trim());
        };
        rec.onerror = function () { voiceBtn.classList.remove('voice-active'); };
        rec.onend = function () { voiceBtn.classList.remove('voice-active'); };
      });
    } else {
      voiceBtn.style.display = 'none';
    }

    return el;
  }

  // ── Show Default State (trending + recent) ──
  function showDefaultState() {
    var sugBox = document.getElementById('search-suggestions');
    var resBox = document.getElementById('search-results');
    if (!sugBox || !resBox) return;
    resBox.innerHTML = '';

    var html = '';

    // Recent searches
    var recent = getRecentSearches();
    if (recent.length > 0) {
      html += '<div class="search-section">' +
        '<div class="search-section-header"><span class="search-section-title">🕐 Recent Searches</span>' +
        '<button class="search-clear-recent" id="search-clear-recent">Clear</button></div>' +
        '<div class="search-chips">';
      recent.forEach(function (r) {
        html += '<button class="search-chip search-chip-recent" data-query="' + escapeHtml(r) + '">' + escapeHtml(r) + '</button>';
      });
      html += '</div></div>';
    }

    // Trending searches
    var trending = window.SiteSearch.getTrendingSearches();
    html += '<div class="search-section">' +
      '<span class="search-section-title">🔥 Trending Searches</span>' +
      '<div class="search-trending-list">';
    trending.forEach(function (t) {
      // Trend-derived chips (t.id set) apply their trend's already-catalog-
      // validated filter directly on click, instead of re-parsing t.text as
      // a free-text search query — see the data-trend-id click handler
      // below. Nav-category fallback chips (no id) keep the old text-query
      // path since their text IS a literal category name.
      html += '<button class="search-trending-item" data-query="' + escapeHtml(t.text) + '"' +
        (t.id ? ' data-trend-id="' + escapeHtml(t.id) + '"' : '') + '>' +
        '<span class="search-trending-icon">' + t.icon + '</span>' +
        '<span class="search-trending-text">' + escapeHtml(t.text) + '</span>' +
        '<svg class="search-trending-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>' +
      '</button>';
    });
    html += '</div></div>';

    // Browse categories
    html += '<div class="search-section">' +
      '<span class="search-section-title">📂 Browse Categories</span>' +
      '<div class="search-chips">';

    var catList = browseCategories(10);
    catList.forEach(function (cat) {
      var icon = window.SiteSearch.getCategoryIcon(cat);
      html += '<button class="search-chip" data-query="' + escapeHtml(cat) + '">' + icon + ' ' + escapeHtml(cat) + '</button>';
    });
    html += '</div></div>';

    sugBox.innerHTML = html;

    // Wire chip clicks
    sugBox.querySelectorAll('[data-query]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = this.getAttribute('data-query');
        var trendId = this.getAttribute('data-trend-id');
        document.getElementById('search-overlay-input').value = q;
        document.getElementById('search-overlay-clear').style.display = 'flex';
        if (trendId) executeTrendSearch(trendId, q);
        else executeSearch(q);
      });
    });

    // Wire clear recent
    var clearRecentBtn = sugBox.querySelector('#search-clear-recent');
    if (clearRecentBtn) {
      clearRecentBtn.addEventListener('click', function () {
        clearRecentSearches();
        showDefaultState();
      });
    }
  }

  // ── Handle Live Input (type-ahead) ──
  function handleInputChange(value) {
    var sugBox = document.getElementById('search-suggestions');
    var resBox = document.getElementById('search-results');
    if (!sugBox) return;

    if (!value || value.length < 2) {
      showDefaultState();
      return;
    }

    var suggestions = window.SiteSearch.suggest(value);
    if (suggestions.length === 0) {
      sugBox.innerHTML = '<p class="search-no-suggestions">No suggestions — press Enter to search</p>';
      return;
    }

    var html = '<div class="search-suggestion-list">';
    suggestions.forEach(function (s) {
      if (s.type === 'category') {
        html += '<button class="search-suggestion-item" data-query="' + escapeHtml(s.text) + '">' +
          '<span class="search-suggestion-icon">' + (s.icon || '📂') + '</span>' +
          '<span class="search-suggestion-text">' + highlightMatch(s.text, value) + '</span>' +
          '<span class="search-suggestion-count">' + s.count + ' products</span>' +
        '</button>';
      } else if (s.type === 'activity') {
        html += '<button class="search-suggestion-item" data-query="' + escapeHtml(s.text) + '">' +
          '<span class="search-suggestion-icon">' + (s.icon || '🔍') + '</span>' +
          '<span class="search-suggestion-text">' + highlightMatch(s.text, value) + '</span>' +
          '<span class="search-suggestion-badge">AI Suggested</span>' +
        '</button>';
      } else if (s.type === 'product') {
        html += '<button class="search-suggestion-item search-suggestion-product" data-query="' + escapeHtml(s.text) + '">' +
          (s.image ? '<img class="search-suggestion-thumb" src="' + escapeHtml(proxyImg(s.image)) + '" alt="" loading="lazy">' :
            '<span class="search-suggestion-icon">💎</span>') +
          '<span class="search-suggestion-text">' + highlightMatch(s.text, value) + '</span>' +
          (s.price ? '<span class="search-suggestion-price">$' + escapeHtml(s.price) + '</span>' : '') +
        '</button>';
      }
    });
    html += '</div>';

    // "Search for" option
    html += '<button class="search-suggestion-item search-suggestion-enter" data-query="' + escapeHtml(value) + '">' +
      '<span class="search-suggestion-icon">🔍</span>' +
      '<span class="search-suggestion-text">Search for <strong>"' + escapeHtml(value) + '"</strong></span>' +
      '<kbd class="search-suggestion-kbd">↵</kbd>' +
    '</button>';

    sugBox.innerHTML = html;
    resBox.innerHTML = '';

    // Wire clicks
    sugBox.querySelectorAll('[data-query]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = this.getAttribute('data-query');
        document.getElementById('search-overlay-input').value = q;
        executeSearch(q);
      });
    });
  }

  // ── Execute Trend Search (deterministic — bypasses free-text search) ──
  // A trending-search chip's filterSpec is already validated to match >=1
  // catalog product (builder/behavioral-harness.js's empty-trend check), and
  // toBrandConfigJs compiles that SAME filterSpec into a live `trend.filter`
  // predicate baked onto window.BrandConfig.trends. Applying it directly
  // guarantees the chip always returns real results — it never depends on
  // whether the chip's display label happens to tokenize-match the catalog.
  function executeTrendSearch(trendId, label) {
    var sugBox = document.getElementById('search-suggestions');
    var resBox = document.getElementById('search-results');
    if (!sugBox || !resBox) return;

    sugBox.textContent = '';
    addRecentSearch(label);
    trackSearchEvent(label);
    window.__lastSearchQuery = label;

    var trends = (window.BrandConfig && window.BrandConfig.trends) || [];
    var trend = trends.filter(function (t) { return t && t.id === trendId; })[0];

    if (!trend || typeof trend.filter !== 'function') { executeSearch(label); return; }

    window.SiteSearch.loadProducts().then(function (products) {
      var matched = products.filter(trend.filter);
      var categories = {};
      matched.forEach(function (p) {
        var cat = p.category || 'Other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(p);
      });
      var result = {
        results: matched,
        categories: categories,
        suggestions: [],
        intent: { activity: null },
        total: matched.length
      };
      if (result.total === 0) { renderEmptyState(resBox, label, result); return; }
      renderResults(resBox, label, result);
    });
  }

  // ── Execute Search ──
  function executeSearch(query) {
    if (!query) return;

    var sugBox = document.getElementById('search-suggestions');
    var resBox = document.getElementById('search-results');
    if (!sugBox || !resBox) return;

    sugBox.innerHTML = '';
    addRecentSearch(query);

    // Track search event with Data Cloud
    trackSearchEvent(query);

    // Store for agent context
    window.__lastSearchQuery = query;

    var result = window.SiteSearch.search(query);

    if (result.total === 0) {
      renderEmptyState(resBox, query, result);
      return;
    }

    renderResults(resBox, query, result);
  }

  // ── Render Results ──
  function renderResults(container, query, result) {
    var intent = result.intent;
    var html = '';

    // Intent banner
    var activityLabel = intent.activity
      ? intent.activity.charAt(0).toUpperCase() + intent.activity.slice(1)
      : query;

    var intentIcon = '🔍';
    if (intent.activity) {
      var icons = { 'gift': '🎁', 'gift for her': '💝', 'wedding': '💍', 'bridal': '👰', 'everyday': '✨', 'date night': '💎', 'layering': '📿', 'birthday': '🎂', 'anniversary': '💝', 'holiday': '🎄' };
      intentIcon = icons[intent.activity] || '🔍';
    }

    html += '<div class="search-intent-banner">' +
      '<span class="search-intent-icon">' + intentIcon + '</span>' +
      '<div class="search-intent-text">' +
        '<span class="search-intent-label">Showing results for</span>' +
        '<span class="search-intent-query">' + escapeHtml(activityLabel) + '</span>' +
      '</div>' +
      '<span class="search-result-count">' + result.total + ' products</span>' +
    '</div>';

    // Category chips
    var catKeys = Object.keys(result.categories).sort(function (a, b) {
      return result.categories[b].length - result.categories[a].length;
    });

    html += '<div class="search-category-chips">' +
      '<button class="search-cat-chip search-cat-chip-active" data-cat="all">All (' + result.total + ')</button>';
    catKeys.forEach(function (cat) {
      var icon = window.SiteSearch.getCategoryIcon(cat);
      html += '<button class="search-cat-chip" data-cat="' + escapeHtml(cat) + '">' +
        icon + ' ' + escapeHtml(cat) + ' (' + result.categories[cat].length + ')' +
      '</button>';
    });
    html += '</div>';

    // Product grid
    html += '<div class="search-product-grid" id="search-product-grid">';
    result.results.forEach(function (p) {
      html += buildProductCard(p);
    });
    html += '</div>';

    // Ask Coco CTA
    html += '<div class="search-agent-cta">' +
      '<div class="search-agent-cta-inner">' +
        '<span class="search-agent-cta-icon">' + AGENT_ICON + '</span>' +
        '<div class="search-agent-cta-text">' +
          '<strong>Want personalized recommendations?</strong>' +
          '<span>Ask ' + AGENT_NAME + ', our AI ' + AGENT_ROLE + ', for curated picks tailored to you.</span>' +
        '</div>' +
        '<button class="search-agent-cta-btn" id="search-ask-trail">Ask ' + AGENT_NAME + ' →</button>' +
      '</div>' +
    '</div>';

    container.innerHTML = html;

    // Wire category chip filtering
    container.querySelectorAll('.search-cat-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        container.querySelectorAll('.search-cat-chip').forEach(function (c) { c.classList.remove('search-cat-chip-active'); });
        this.classList.add('search-cat-chip-active');
        var cat = this.getAttribute('data-cat');
        filterResultsByCategory(container, cat, result);
      });
    });

    // Wire Ask Trail
    var askTrailBtn = container.querySelector('#search-ask-trail');
    if (askTrailBtn) {
      askTrailBtn.addEventListener('click', function () {
        handoffToAgent(query);
      });
    }

    // Wire quick-view on product cards
    container.querySelectorAll('.product-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('a')) return;
        if (window.Views && window.Views.openQuickView) {
          window.Views.openQuickView(card);
        }
      });
    });

    // Stagger animation
    var grid = container.querySelector('#search-product-grid');
    if (grid && window.Views && window.Views.staggerCards) {
      window.Views.staggerCards(grid);
    }
  }

  // ── Filter Results by Category ──
  function filterResultsByCategory(container, cat, result) {
    var grid = container.querySelector('#search-product-grid');
    if (!grid) return;

    var products = cat === 'all' ? result.results : (result.categories[cat] || []);
    grid.innerHTML = products.map(function (p) { return buildProductCard(p); }).join('');

    // Re-wire quick-view
    grid.querySelectorAll('.product-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('a')) return;
        if (window.Views && window.Views.openQuickView) {
          window.Views.openQuickView(card);
        }
      });
    });

    if (window.Views && window.Views.staggerCards) {
      window.Views.staggerCards(grid);
    }
  }

  // ── Proxy external images through our server to avoid CORS / hotlink issues ──
  function proxyImg(url) {
    if (!url) return '';
    if (url.indexOf('kendrascott.com') !== -1 ||
        url.indexOf('assets.meshmesh.io') !== -1) {
      return '/img-proxy?url=' + encodeURIComponent(url);
    }
    return url;
  }

  // ── Build Product Card (mirrors views.js productCard) ──
  function buildProductCard(p) {
    var price = p.price ? '$' + p.price : '';
    var icon = window.SiteSearch.getCategoryIcon(p.category);
    var initial = (p.name || '?').charAt(0).toUpperCase();
    var imgUrl = proxyImg(p.image);
    var hasImage = !!imgUrl;

    var imgHtml = hasImage
      ? '<div class="img-shimmer">' +
          '<img src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(p.name) + '" loading="lazy" ' +
            'data-retry="0" ' +
            'onload="this.parentElement.classList.add(\'img-loaded\')" ' +
            'onerror="var r=parseInt(this.dataset.retry||0);if(r<2){this.dataset.retry=r+1;' +
              'var img=this,s=img.src.split(\'&_r=\')[0];' +
              'setTimeout(function(){img.src=s+\'&_r=\'+Date.now()},900*(r+1));return}' +
              'this.style.display=\'none\';this.parentElement.classList.add(\'img-loaded\');' +
              'var fb=this.parentElement.querySelector(\'.img-fallback\');if(fb)fb.style.display=\'flex\'">' +
          '<div class="img-fallback" style="display:none">' +
            '<span class="img-fallback-icon">' + icon + '</span>' +
            '<span class="img-fallback-letter">' + escapeHtml(initial) + '</span>' +
          '</div>' +
        '</div>'
      : '<div class="img-fallback" style="display:flex">' +
          '<span class="img-fallback-icon">' + icon + '</span>' +
          '<span class="img-fallback-letter">' + escapeHtml(initial) + '</span>' +
        '</div>';

    var categoryTag = p.category
      ? '<span class="product-category-tag">' + icon + ' ' + escapeHtml(p.category) + '</span>'
      : '';

    return '<div class="product-card" ' +
      'data-name="' + escapeHtml(p.name) + '" ' +
      'data-price="' + escapeHtml(price) + '" ' +
      'data-image="' + escapeHtml(p.image || '') + '" ' +
      'data-category="' + escapeHtml(p.category || '') + '" ' +
      'data-family="' + escapeHtml(p.family || '') + '" ' +
      'data-brand="' + escapeHtml(BRAND_NAME) + '" ' +
      'data-description="' + escapeHtml(p.description || '') + '">' +
      '<div class="product-image-wrap">' + imgHtml + '</div>' +
      '<div class="product-info">' +
        categoryTag +
        '<h3 class="product-name">' + escapeHtml(p.name) + '</h3>' +
        (price ? '<p class="product-price">' + escapeHtml(price) + '</p>' : '') +
      '</div>' +
    '</div>';
  }

  // ── Render Empty State ──
  function renderEmptyState(container, query, result) {
    var html = '<div class="search-empty">' +
      '<div class="search-empty-icon">🔍</div>' +
      '<h3 class="search-empty-title">No results for "' + escapeHtml(query) + '"</h3>' +
      '<p class="search-empty-text">We couldn\'t find products matching your search. Try different keywords or ask our AI assistant.</p>';

    // Suggestions
    if (result.suggestions.length > 0) {
      html += '<div class="search-empty-suggestions">' +
        '<p class="search-empty-suggestions-label">Did you mean?</p>' +
        '<div class="search-chips">';
      result.suggestions.forEach(function (s) {
        html += '<button class="search-chip" data-query="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
      });
      html += '</div></div>';
    }

    // Browse categories
    html += '<div class="search-chips" style="margin-top:16px">';
    browseCategories(4).forEach(function (cat) {
      var icon = window.SiteSearch.getCategoryIcon(cat);
      html += '<button class="search-chip" data-query="' + escapeHtml(cat) + '">' + icon + ' Browse ' + escapeHtml(cat) + '</button>';
    });
    html += '</div>';

    // Agent handoff
    html += '<button class="search-agent-handoff" id="search-empty-ask-trail">' +
      AGENT_ICON + ' Ask ' + AGENT_NAME + ', our AI ' + AGENT_ROLE + ' →' +
    '</button>';

    html += '</div>';
    container.innerHTML = html;

    // Wire clicks
    container.querySelectorAll('[data-query]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = this.getAttribute('data-query');
        document.getElementById('search-overlay-input').value = q;
        executeSearch(q);
      });
    });

    var askTrailBtn = container.querySelector('#search-empty-ask-trail');
    if (askTrailBtn) {
      askTrailBtn.addEventListener('click', function () {
        handoffToAgent(query);
      });
    }
  }

  // ── Agent Handoff ──
  function handoffToAgent(query) {
    closeOverlay();
    // Hand the query to Coco. WebCuration.ask() routes through the deterministic
    // engine by default (no org dependency, no hang) and only falls back to the
    // live agent when USE_LIVE_AGENT is true.
    if (window.WebCuration && window.WebCuration.ask) {
      window.WebCuration.ask('I\'m looking for ' + query + '. Can you help me find the best options?');
    } else if (window.WebCuration && window.WebCuration.expand) {
      // Older API fallback — just open the panel.
      window.WebCuration.expand();
    }
  }

  // ── Search breadcrumb (client-only; no external tracking) ──
  function trackSearchEvent(query) {
    console.log('[SiteSearch] Search: "' + query + '"');
  }

  // ── Helpers ──
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var q = query.toLowerCase();
    var idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return escaped;
    return escapeHtml(text.slice(0, idx)) +
      '<mark>' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>' +
      escapeHtml(text.slice(idx + query.length));
  }

  // ── Open / Close ──
  function openOverlay() {
    createOverlay();
    _isOpen = true;
    _overlay.classList.add('search-overlay-open');
    document.body.style.overflow = 'hidden';
    showDefaultState();
    var input = document.getElementById('search-overlay-input');
    if (input) {
      // Restore last search if any
      if (input.value) {
        document.getElementById('search-overlay-clear').style.display = 'flex';
      }
      setTimeout(function () { input.focus(); }, 100);
    }
  }

  function closeOverlay() {
    _isOpen = false;
    if (_overlay) _overlay.classList.remove('search-overlay-open');
    document.body.style.overflow = '';
  }

  function toggleOverlay() {
    if (_isOpen) closeOverlay();
    else openOverlay();
  }

  // ── Keyboard shortcut: Cmd/Ctrl + K ──
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleOverlay();
    }
    if (e.key === 'Escape' && _isOpen) {
      closeOverlay();
    }
  });

  // ── Public API ──
  window.SearchOverlay = {
    open: openOverlay,
    close: closeOverlay,
    toggle: toggleOverlay,
    isOpen: function () { return _isOpen; }
  };

})();
