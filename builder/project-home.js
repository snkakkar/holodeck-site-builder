// ════════════════════════════════════════════════════════════════
//  PROJECT HOME
//  Renders the dashboard of holodeck projects: search, sort, create,
//  open, duplicate, rename, delete. Also surfaces the empty state
//  and the AI-prompt entry point.
//
//  Hooks back into the builder shell via callbacks the builder wires
//  in on boot (open / create / etc.) — keeping persistence (store),
//  validation (validator), and navigation (builder) cleanly separate.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const STORE = global.HOLO_STORE;

  // ─── Tiny DOM helper (local copy so this file is independent) ─
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "on") {
        Object.keys(attrs[k]).forEach(function (ev) { node.addEventListener(ev, attrs[k][ev]); });
      } else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // ─── Render the home page into the given container ─────────────
  // handlers: { onOpen, onNew, onImport, onAiPrompt, onDuplicate,
  //             onRename, onDelete, onChange }
  function render(container, handlers) {
    container.innerHTML = "";

    // Header band
    const header = el("div", { class: "bx-home-head" }, [
      el("div", {}, [
        el("div", { class: "bx-main-eyebrow", text: "Your Projects" }),
        el("h1", { class: "bx-main-title", text: "Holodeck Builder" }),
        el("p", { class: "bx-main-sub",
          text: "Create, reopen, duplicate, or rename your customer-specific demos. Everything saves to your account and syncs across devices." }),
      ]),
      el("div", { class: "bx-home-actions" }, [
        primaryBtn("+ New Holodeck Project", function () { handlers.onNew && handlers.onNew(); }),
      ]),
    ]);
    container.appendChild(header);

    // Tab bar — My Projects | Shared with me. Shared is populated lazily the
    // first time it's opened (and refreshed on tab switch) so the default
    // view stays as fast as before.
    const tabBar = el("div", { class: "bx-home-tabs" });
    function tabBtn(key, label) {
      const b = el("button", {
        class: "bx-home-tab" + (state.tab === key ? " is-active" : ""),
        text: label,
      });
      b.addEventListener("click", function () {
        if (state.tab === key) return;
        state.tab = key;
        Array.prototype.forEach.call(tabBar.children, function (c) { c.classList.remove("is-active"); });
        b.classList.add("is-active");
        renderGrid();
        if (key === "shared") loadShared();
      });
      return b;
    }
    tabBar.appendChild(tabBtn("mine", "My Projects"));
    tabBar.appendChild(tabBtn("shared", "Shared with me"));
    container.appendChild(tabBar);

    // Projects load asynchronously (online-first). We render the toolbar
    // immediately and fill the grid + industry filter once they resolve.
    // `loaded` holds MY projects; `shared` holds projects shared with me.
    // Both re-render client-side (search/sort/filter) with no extra calls.
    let loaded = [];
    let shared = [];
    let sharedLoaded = false;

    // Toolbar — search + sort + filter
    const toolbar = el("div", { class: "bx-home-toolbar" });
    const searchInput = el("input", { type: "text", class: "bx-input bx-home-search",
      placeholder: "Search by project, customer, industry…" });
    const sortSelect = el("select", { class: "bx-select" });
    [
      ["updatedAt",     "Recently updated"],
      ["customerName",  "Customer name"],
      ["industry",      "Industry"],
      ["createdAt",     "Recently created"],
    ].forEach(function (s) {
      const opt = el("option", { value: s[0], text: s[1] });
      sortSelect.appendChild(opt);
    });
    sortSelect.value = state.sortKey;
    const filterSelect = el("select", { class: "bx-select" });
    function refreshIndustryOptions() {
      filterSelect.innerHTML = "";
      const industries = uniqueValues(loaded, "industry");
      [["", "All industries"]].concat(industries.map(function (i) { return [i, i]; })).forEach(function (o) {
        filterSelect.appendChild(el("option", { value: o[0], text: o[1] }));
      });
      filterSelect.value = state.filterIndustry;
    }
    refreshIndustryOptions();

    searchInput.value = state.search;
    searchInput.addEventListener("input",   function () { state.search = searchInput.value; renderGrid(); });
    sortSelect.addEventListener("change",   function () { state.sortKey = sortSelect.value; renderGrid(); });
    filterSelect.addEventListener("change", function () { state.filterIndustry = filterSelect.value; renderGrid(); });

    toolbar.appendChild(searchInput);
    toolbar.appendChild(el("div", { class: "bx-home-toolbar-right" }, [
      labeledControl("Sort", sortSelect),
      labeledControl("Industry", filterSelect),
    ]));
    container.appendChild(toolbar);

    const gridWrap = el("div");
    container.appendChild(gridWrap);

    // Initial skeleton, then fetch + paint.
    gridWrap.appendChild(el("div", { class: "bx-empty", text: "Loading your projects…" }));
    STORE.listProjects().then(function (all) {
      loaded = all || [];
      refreshIndustryOptions();
      renderGrid();
    });

    function renderGrid() {
      gridWrap.innerHTML = "";
      const isShared = state.tab === "shared";
      const all = isShared ? shared : loaded;

      if (isShared && !sharedLoaded) {
        gridWrap.appendChild(el("div", { class: "bx-empty", text: "Loading projects shared with you…" }));
        return;
      }
      if (!all.length) {
        if (isShared) {
          gridWrap.appendChild(el("div", { class: "bx-empty",
            html: "No projects have been shared with you yet. When a teammate shares one, it'll appear here." }));
        } else {
          gridWrap.appendChild(emptyState(handlers));
        }
        return;
      }
      const filtered = all
        .filter(function (p) { return matchesSearch(p, state.search); })
        .filter(function (p) { return !state.filterIndustry || p.industry === state.filterIndustry; })
        .sort(byKey(state.sortKey));

      if (!filtered.length) {
        gridWrap.appendChild(el("div", { class: "bx-empty",
          html: "Nothing matches that filter. <strong>Clear the search</strong> or pick a different industry." }));
        return;
      }

      const grid = el("div", { class: "bx-proj-grid" });
      filtered.forEach(function (p) {
        grid.appendChild(projectCard(p, handlers, function () { reloadAndRender(); handlers.onChange && handlers.onChange(); }, isShared));
      });
      gridWrap.appendChild(grid);
    }

    // Lazily fetch projects shared with me (RLS returns them; my_shares RPC
    // labels each with view/edit). Cached after the first successful load.
    function loadShared() {
      if (!STORE.listSharedWithMe) { sharedLoaded = true; renderGrid(); return; }
      STORE.listSharedWithMe().then(function (rows) {
        shared = rows || [];
        sharedLoaded = true;
        if (state.tab === "shared") renderGrid();
      }).catch(function () {
        shared = [];
        sharedLoaded = true;
        if (state.tab === "shared") renderGrid();
      });
    }

    // After a mutating action (duplicate/rename/delete) refetch so the
    // grid reflects the server, then repaint the active tab.
    function reloadAndRender() {
      STORE.listProjects().then(function (all) {
        loaded = all || [];
        refreshIndustryOptions();
        renderGrid();
      });
      if (state.tab === "shared") loadShared();
    }
  }

  // Module-local sort/search/filter state — survives re-renders within
  // a single home-page session, resets between sessions.
  const state = {
    search: "",
    sortKey: "updatedAt",
    filterIndustry: "",
    tab: "mine", // "mine" | "shared"
  };

  // ─── Project card ──────────────────────────────────────────────
  function projectCard(p, handlers, onLocalChange, isShared) {
    const card = el("div", { class: "bx-proj-card" + (isShared ? " is-shared" : ""),
      on: { click: function (e) {
        if (e.target.closest("[data-no-open]")) return;
        handlers.onOpen && handlers.onOpen(p.id);
      } } });

    // Status pill — for shared projects, show the permission badge instead.
    if (isShared) {
      const canEdit = p.sharedPermission === "edit";
      card.appendChild(el("div", { class: "bx-proj-status bx-proj-shared-badge",
        text: canEdit ? "Shared · can edit" : "Shared · view only" }));
    } else {
      card.appendChild(el("div", { class: "bx-proj-status", text: p.status || "New" }));
    }

    // Title + customer
    card.appendChild(el("div", { class: "bx-proj-title", text: p.name || p.customerName || "Untitled project" }));
    if (p.customerName && p.customerName !== p.name) {
      card.appendChild(el("div", { class: "bx-proj-customer", text: p.customerName }));
    }

    // Meta row
    const meta = el("div", { class: "bx-proj-meta" });
    if (p.industry)   meta.appendChild(el("span", { class: "bx-proj-pill", text: p.industry }));
    if (p.audience)   meta.appendChild(el("span", { class: "bx-proj-pill", text: p.audience }));
    if (p.salesStage) meta.appendChild(el("span", { class: "bx-proj-pill", text: p.salesStage }));
    card.appendChild(meta);

    // Products row
    if (p.products && p.products.length) {
      const prods = el("div", { class: "bx-proj-prods" });
      p.products.slice(0, 5).forEach(function (prod) {
        prods.appendChild(el("span", { class: "bx-proj-prod", text: prod }));
      });
      if (p.products.length > 5) {
        prods.appendChild(el("span", { class: "bx-proj-prod", text: "+" + (p.products.length - 5) }));
      }
      card.appendChild(prods);
    }

    // Footer — counts + updated + actions
    const foot = el("div", { class: "bx-proj-foot" });
    const counts = el("div", { class: "bx-proj-counts" });
    counts.appendChild(el("span", { text: (p.slidesCount || 0) + " slides" }));
    counts.appendChild(el("span", { text: " · " }));
    counts.appendChild(el("span", { text: (p.personasCount || 0) + " personas" }));
    counts.appendChild(el("span", { class: "bx-proj-updated", text: "Updated " + formatRelative(p.updatedAt) }));
    foot.appendChild(counts);

    const actions = el("div", { class: "bx-proj-actions", "data-no-open": "1" });
    actions.appendChild(miniBtn("Open", function () { handlers.onOpen && handlers.onOpen(p.id); }));
    if (!isShared) {
      // Owner-only actions. On a project shared with me I can only open it
      // (RLS blocks duplicate-writes to another owner's row / delete anyway).
      if (global.HOLO_SHARE) {
        actions.appendChild(miniBtn("Share", function () {
          global.HOLO_SHARE.open(p.id, p.name || p.customerName || "Untitled project");
        }));
      }
      actions.appendChild(miniBtn("Duplicate", function () { handlers.onDuplicate && handlers.onDuplicate(p.id, onLocalChange); }));
      actions.appendChild(miniBtn("Rename",    function () { promptRename(p, handlers, onLocalChange); }));
      actions.appendChild(miniBtn("Delete",    function () { confirmDelete(p, handlers, onLocalChange); }, "is-danger"));
    }
    foot.appendChild(actions);

    card.appendChild(foot);
    return card;
  }

  // ─── Empty state ───────────────────────────────────────────────
  // First-run experience: explain what the tool does, what to bring,
  // and the fastest path to value. Three CTAs ranked by likelihood.
  function emptyState(handlers) {
    const root = el("div", { class: "bx-home-firstrun" });

    // Hero pitch
    root.appendChild(el("div", { class: "bx-firstrun-hero" }, [
      el("div", { class: "bx-firstrun-mark", text: "🪐" }),
      el("h2", { class: "bx-firstrun-title", text: "Build a customer-specific Salesforce Holodeck" }),
      el("p", { class: "bx-firstrun-sub",
        html: "Paste a demo script — the builder extracts the story, picks the right slides, and packages a ready-to-run demo folder. <strong>No code, no JSON, no slide editor.</strong>" }),
      el("div", { class: "bx-row bx-firstrun-ctas" }, [
        primaryBtn("+ New Holodeck Project", function () { handlers.onNew && handlers.onNew(); }),
      ]),
    ]));

    // What you'll need
    root.appendChild(el("div", { class: "bx-firstrun-needs" }, [
      el("div", { class: "bx-firstrun-needs-title", text: "What you'll need" }),
      el("ul", { class: "bx-firstrun-needs-list" }, [
        el("li", { text: "A demo script or rough story outline (paste or upload)" }),
        el("li", { text: "Customer name, industry, audience, and Salesforce products in scope" }),
        el("li", { text: "Optional: AubreyDemo links to embed live screens" }),
      ]),
    ]));

    // Five-step preview
    root.appendChild(el("div", { class: "bx-firstrun-steps" }, [
      el("div", { class: "bx-firstrun-steps-title", text: "How it works" }),
      el("ol", { class: "bx-firstrun-steps-list" }, [
        firstrunStep("1", "Add customer details", "Industry, audience, products — sets the recommendation tone."),
        firstrunStep("2", "Paste your demo script", "We extract foundations, personas, and journey acts locally in your browser."),
        firstrunStep("3", "Apply the recommended narrative", "Eight to ten slides grouped into Intro / Journey / Persona / Demo / Business Value."),
        firstrunStep("4", "Preview the demo", "Realistic previews — what you see is what ships."),
        firstrunStep("5", "Download the complete ZIP", "A runnable demo/ folder with HTML, CSS, JS, config, and a README."),
      ]),
    ]));

    return root;
  }

  function firstrunStep(num, title, body) {
    return el("li", { class: "bx-firstrun-step" }, [
      el("div", { class: "bx-firstrun-step-num", text: num }),
      el("div", {}, [
        el("div", { class: "bx-firstrun-step-title", text: title }),
        el("div", { class: "bx-firstrun-step-body", text: body }),
      ]),
    ]);
  }

  // ─── Tiny prompts (no native dialogs that look ugly) ──────────
  function promptRename(p, handlers, onDone) {
    const next = window.prompt("Rename project", p.name || "");
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === p.name) return;
    handlers.onRename && handlers.onRename(p.id, trimmed, onDone);
  }
  function confirmDelete(p, handlers, onDone) {
    const ok = window.confirm("Delete \"" + (p.name || "this project") + "\"? This can't be undone.");
    if (!ok) return;
    handlers.onDelete && handlers.onDelete(p.id, onDone);
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function primaryBtn(label, onClick) {
    const b = el("button", { class: "bx-btn bx-btn-primary", text: label });
    b.addEventListener("click", onClick); return b;
  }
  function ghostBtn(label, onClick) {
    const b = el("button", { class: "bx-btn bx-btn-ghost", text: label });
    b.addEventListener("click", onClick); return b;
  }
  function miniBtn(label, onClick, extraClass) {
    const b = el("button", { class: "bx-btn bx-btn-secondary bx-proj-mini" + (extraClass ? " " + extraClass : ""),
      text: label });
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
    return b;
  }
  function labeledControl(label, control) {
    return el("label", { class: "bx-home-toolbar-label" }, [
      el("span", { class: "bx-help-inline", style: "margin-right: 6px;", text: label }),
      control,
    ]);
  }
  function uniqueValues(arr, key) {
    const seen = {};
    return arr.map(function (a) { return a[key]; }).filter(function (v) {
      if (!v || seen[v]) return false; seen[v] = true; return true;
    }).sort();
  }
  function matchesSearch(p, q) {
    if (!q) return true;
    const t = q.trim().toLowerCase();
    return [p.name, p.customerName, p.industry, p.audience, p.salesStage]
      .concat(p.products || [])
      .filter(Boolean)
      .some(function (s) { return String(s).toLowerCase().indexOf(t) !== -1; });
  }
  function byKey(key) {
    if (key === "updatedAt" || key === "createdAt") {
      return function (a, b) { return (b[key] || "").localeCompare(a[key] || ""); };
    }
    return function (a, b) { return (a[key] || "").localeCompare(b[key] || ""); };
  }
  function formatRelative(iso) {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "—";
    const diff = Date.now() - then;
    const min = 60 * 1000, hr = 60 * min, day = 24 * hr;
    if (diff < min)      return "just now";
    if (diff < hr)       return Math.round(diff / min) + "m ago";
    if (diff < day)      return Math.round(diff / hr)  + "h ago";
    if (diff < 7 * day)  return Math.round(diff / day) + "d ago";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  global.HOLO_HOME = { render: render };
})(window);
