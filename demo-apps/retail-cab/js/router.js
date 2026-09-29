/**
 * Lightweight client-side router using the History API.
 *
 * The site is a single-page app: header, footer, and the Agentforce
 * curation zone stay mounted across navigations so the agent conversation
 * persists. Only the <main id="app-root"> contents swap.
 *
 * Routes are defined in views.js. This file handles: parsing the URL,
 * intercepting internal link clicks, wiring back/forward buttons, and
 * dispatching to the right view renderer.
 */

(function () {
  'use strict';

  // Mount prefix (e.g. "/demo-apps/retail-cab" or "/apps/retail-cab"), set by
  // brand-config.js. Routes below are keyed root-style ("/boots"); strip this
  // prefix before matching against window.location.pathname, and re-add it
  // whenever we push a new URL, so navigation stays inside the app's mount
  // point instead of assuming it's served at the domain root.
  var BASE_PATH = window.APP_BASE_PATH || '';

  function stripBase(pathname) {
    if (BASE_PATH && pathname.indexOf(BASE_PATH) === 0) {
      var rest = pathname.slice(BASE_PATH.length);
      return rest === '' ? '/' : rest;
    }
    return pathname;
  }

  // Route table — pathname prefix -> { family, category, label, subcategory? }
  // Subcategory parsed from the second path segment when present.
  //
  // When BrandConfig carries generated navCategories, derive the routes from
  // them (same slug logic as the header nav in index.html) so a generated
  // brand's category links resolve. The Cavender's set is the fallback when no
  // navCategories are present (baked build).
  function slugCat(label) {
    return '/' + String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  var _navCats = (window.BrandConfig && window.BrandConfig.navCategories) || [];
  var ROUTES;
  if (_navCats.length) {
    ROUTES = {};
    _navCats.forEach(function (label) {
      // navCategories holds CATEGORY-level display labels ("Golf Clubs"), not
      // family values ("Clubs") — a narrow-taxonomy brand's family/category
      // values diverge, so this must match products' `category` field, not
      // `family` (a mismatch here silently zeroes out every category page).
      ROUTES[slugCat(label)] = { category: String(label), label: String(label) };
    });
  } else {
    ROUTES = {
      '/boots':       { family: 'Boots',       label: 'Boots' },
      '/hats':        { family: 'Hats',        label: 'Hats' },
      '/jeans':       { family: 'Jeans',       label: 'Jeans' },
      '/apparel':     { family: 'Apparel',     label: 'Apparel' },
      '/accessories': { family: 'Accessories', label: 'Accessories' },
      '/belts':       { family: 'Belts',       label: 'Belts & Buckles' }
    };
  }

  function parsePath(pathname) {
    if (pathname === '/' || pathname === '/index.html') {
      return { name: 'home' };
    }
    // Search route: /search?q=...
    if (pathname === '/search') {
      var params = new URLSearchParams(window.location.search);
      return { name: 'search', query: params.get('q') || '' };
    }
    // Checkout route
    if (pathname === '/checkout') {
      return { name: 'checkout' };
    }
    // Rachel's profile / virtual jewelry box
    if (pathname === '/profile') {
      return { name: 'profile' };
    }
    // Color Bar (jewelry customizer) retired for Cavender's — "Shop the Look"
    // is served by the social "See It Styled" trending feed instead. Any old
    // /color-bar deep link falls through to the homepage below.
    var parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
    var top = '/' + parts[0];
    if (ROUTES[top]) {
      return {
        name: 'category',
        family: ROUTES[top].family,
        category: ROUTES[top].category,
        label: ROUTES[top].label,
        subcategory: parts[1] ? decodeURIComponent(parts[1]).replace(/-/g, ' ') : null
      };
    }
    return { name: 'home' }; // fallback — render homepage for anything unknown
  }

  function render() {
    var route = parsePath(stripBase(window.location.pathname));
    var root = document.getElementById('app-root');
    if (!root) return;

    // Highlight the active nav link.
    var activePrefix = '/' + (stripBase(window.location.pathname).split('/').filter(Boolean)[0] || '');
    document.querySelectorAll('.nav-link').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      a.classList.toggle('nav-link-active', href === activePrefix);
    });

    // Track current page so the MIAW message can carry it as context.
    window.__currentRoute = route;

    // Fade-in transition: remove then re-add the animation class so CSS
    // replays the @keyframes fadeSlideIn on every route change.
    root.classList.remove('route-enter');
    // Force reflow so the browser sees the removal before re-adding.
    void root.offsetWidth;
    root.classList.add('route-enter');

    // Delegate rendering. Views.js exposes window.Views.
    if (window.Views && typeof window.Views.render === 'function') {
      window.Views.render(route, root);
    }

    window.scrollTo({ top: 0, behavior: 'instant' });

    // Auto-curate: when navigating to a category, ask the agent for recommendations
    if (route.name === 'category' && window.WebCuration && window.WebCuration.autoCurate) {
      window.WebCuration.autoCurate(route);
    }
  }

  // Intercept clicks on internal links. External/anchor links pass through.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href === '#' || href.startsWith('http') || href.startsWith('mailto:')) return;
    if (a.target === '_blank') return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (!href.startsWith('/')) return;

    e.preventDefault();
    var target = BASE_PATH + href;
    if (target !== window.location.pathname) {
      window.history.pushState({}, '', target);
      render();
    }
  });

  window.addEventListener('popstate', render);

  // Expose for programmatic navigation.
  window.Router = {
    navigate: function (href) {
      window.history.pushState({}, '', BASE_PATH + href);
      render();
    },
    render: render,
    currentRoute: function () { return parsePath(stripBase(window.location.pathname)); }
  };

  // Initial render on load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
