// ════════════════════════════════════════════════════════════════
//  HOLODECK BUILDER — main app shell
//  Routes between three top-level views:
//    • home     — projects dashboard (project-home.js)
//    • builder  — the 5-step authoring flow (this file)
//    • aiPrompt — copyable ChatGPT/Claude prompt (this file)
//
//  State lives in localStorage via project-store.js. Imports are
//  parsed + normalized by import-validator.js. Recommendation logic
//  comes from recommendation-rules.js. Wireframes from preview-renderer.js.
//  Exports from config-generator.js.
// ════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  const RULES     = window.HOLO_RULES;
  const PREVIEW   = window.HOLO_PREVIEW;
  const CONFIG    = window.HOLO_CONFIG;
  const STORE     = window.HOLO_STORE;
  const HOME      = window.HOLO_HOME;
  const VALIDATOR = window.HOLO_VALIDATOR;
  const AI_PROMPT = window.HOLO_AI_PROMPT;
  const PARSER    = window.HOLO_PARSER;
  const VALIDATE_STORY = window.HOLO_VALIDATE_STORY;
  const ZIP       = window.HOLO_ZIP;

  // ─── App-level constants ──────────────────────────────────────
  const STEPS = [
    { id: "setup",   num: "1", label: "Project Setup",    help: "Customer, audience, products" },
    { id: "story",   num: "2", label: "Story",            help: "Script + foundations + acts + personas" },
    { id: "cx",      num: "3", label: "CX Components",    help: "AubreyDemo links to embed" },
    { id: "recs",    num: "4", label: "Slide Plan",       help: "Section-grouped recommendations" },
    { id: "preview", num: "5", label: "Preview Plan",     help: "Reorder & confirm slides" },
    { id: "export",  num: "6", label: "Export",           help: "Download config + ZIP" },
  ];
  const INDUSTRIES = ["Retail","Consumer Goods","Hospitality","Travel","Financial Services","Healthcare","Other"];
  const AUDIENCES  = ["Executive","IT","Marketing","Sales","Service","Store Ops","Field Ops","Mixed"];
  const STAGES     = ["Vision","Discovery","Technical Validation","Executive Readout","RFP / POV"];
  const PRODUCTS   = ["Data Cloud","Agentforce","Sales Cloud","Service Cloud","Marketing Cloud","Commerce","Loyalty","MuleSoft","Tableau"];
  const TONES      = ["Executive","Tactical","Visionary","Technical","Playful","Premium"];

  // ─── Top-level app state ──────────────────────────────────────
  // view: which top-level page is showing.
  // state: the active project (only meaningful when view === "builder").
  const app = {
    view: "home",
    state: null,
    previewMode: "compact",     // "compact" | "expanded"
    previewGrouping: "by-section", // "by-section" | "flat"
  };

  // ─── DOM helpers ──────────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "on") {
        Object.keys(attrs[k]).forEach(function (ev) { node.addEventListener(ev, attrs[k][ev]); });
      }
      else if (k === "checked" || k === "disabled" || k === "selected") {
        if (attrs[k]) node.setAttribute(k, k);
      }
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function uid(prefix) { return STORE.uid(prefix); }
  function toast(msg) {
    const t = $("#bxToast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.hidden = true; }, 2400);
  }

  // ─── Persistence ──────────────────────────────────────────────
  function saveActive() {
    if (app.view !== "builder" || !app.state) return;
    STORE.saveProject(app.state);
    setSaveIndicator(false);
  }
  let saveTimer = null;
  function commit() {
    setSaveIndicator(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveActive, 250);
  }
  function setSaveIndicator(dirty) {
    const elIndicator = $("#bxSaveIndicator");
    if (!elIndicator) return;
    if (app.view !== "builder") {
      elIndicator.style.visibility = "hidden";
      return;
    }
    elIndicator.style.visibility = "";
    if (dirty) { elIndicator.classList.add("is-dirty"); elIndicator.textContent = "Saving…"; }
    else       { elIndicator.classList.remove("is-dirty"); elIndicator.textContent = "Autosaved"; }
  }

  // ─── Navigation between views ─────────────────────────────────
  function goHome() {
    if (app.view === "builder" && app.state) saveActive();
    app.view = "home";
    app.state = null;
    STORE.setActiveProjectId(null);
    render();
  }
  function goBuilder(projectId) {
    const state = STORE.loadProject(projectId);
    if (!state) {
      STORE.reconcile();
      toast("That project couldn't be opened.");
      goHome();
      return;
    }
    app.state = state;
    app.view = "builder";
    STORE.setActiveProjectId(projectId);
    recompute();
    render();
  }
  function goAiPrompt() {
    if (app.view === "builder" && app.state) saveActive();
    app.view = "aiPrompt";
    render();
  }
  function newProject() {
    const state = STORE.createProject({});
    app.state = state;
    app.view = "builder";
    STORE.setActiveProjectId(state.id);
    recompute();
    render();
  }

  // ─── Top-level render ─────────────────────────────────────────
  function render() {
    renderTopbar();
    renderShell();
  }

  function renderTopbar() {
    const left  = $("#bxTopbarLeft");
    const right = $("#bxTopbarActions");
    left.innerHTML = "";
    right.innerHTML = "";

    // Mark
    left.appendChild(el("div", { class: "bx-mark" }, [
      el("span", { class: "bx-mark-h", text: "Holodeck" }),
      el("span", { class: "bx-mark-sub", text: "Builder · Salesforce SE Workspace" }),
    ]));

    // Crumb when inside a project
    if (app.view === "builder" && app.state) {
      const sep = el("div", { class: "bx-crumb-sep", text: "/" });
      const crumb = el("button", { class: "bx-crumb",
        on: { click: function () { goHome(); } },
        title: "Back to projects" }, [
        el("span", { class: "bx-crumb-back", text: "← Projects" }),
      ]);
      const projLabel = el("div", { class: "bx-crumb-active" }, [
        el("span", { class: "bx-crumb-name", text: app.state.name || "Untitled" }),
        app.state.project && app.state.project.customerName
          ? el("span", { class: "bx-crumb-customer", text: app.state.project.customerName })
          : null,
      ]);
      left.appendChild(crumb);
      left.appendChild(sep);
      left.appendChild(projLabel);
    }

    // Right-side nav
    [
      ["home",     "Home",      function () { goHome(); }],
      ["aiPrompt", "AI Prompt", function () { goAiPrompt(); }],
    ].forEach(function (n) {
      const isActive = (app.view === n[0]);
      right.appendChild(el("button", {
        class: "bx-nav-link" + (isActive ? " is-active" : ""),
        text: n[1],
        on: { click: n[2] },
      }));
    });

    if (app.view === "home") {
      right.appendChild(actionBtn("Import Config", "bx-btn-ghost", function () { openImportModal(null); }));
      right.appendChild(actionBtn("+ New Project", "bx-btn-primary", function () { newProject(); }));
    } else if (app.view === "builder") {
      right.appendChild(actionBtn("Import", "bx-btn-ghost", function () { openImportModal(app.state.id); }));
      right.appendChild(actionBtn("Save", "bx-btn-secondary", function () { saveActive(); toast("Saved"); }));
      right.appendChild(actionBtn("Export", "bx-btn-primary", function () { openExportModal(); }));
    } else if (app.view === "aiPrompt") {
      right.appendChild(actionBtn("Import Config", "bx-btn-ghost", function () { openImportModal(null); }));
      right.appendChild(actionBtn("+ New Project", "bx-btn-primary", function () { newProject(); }));
    }
  }

  function actionBtn(label, klass, onClick) {
    const b = el("button", { class: "bx-btn " + klass, text: label });
    b.addEventListener("click", onClick);
    return b;
  }

  function renderShell() {
    const shell = $("#bxShell");
    shell.innerHTML = "";

    if (app.view === "home") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      HOME.render(wrap, {
        onOpen:      function (id) { goBuilder(id); },
        onNew:       function () { newProject(); },
        onImport:    function () { openImportModal(null); },
        onAiPrompt:  function () { goAiPrompt(); },
        onDuplicate: function (id, done) { STORE.duplicateProject(id); done && done(); toast("Duplicated"); },
        onRename:    function (id, name, done) { STORE.renameProject(id, name); done && done(); toast("Renamed"); },
        onDelete:    function (id, done) { STORE.deleteProject(id); done && done(); toast("Deleted"); },
      });
      setSaveIndicator(false);
      return;
    }

    if (app.view === "aiPrompt") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      renderAiPromptPage(wrap);
      setSaveIndicator(false);
      return;
    }

    // Builder: stepper | main | side
    shell.classList.remove("is-single");
    const stepper = el("aside", { class: "bx-stepper" }, [
      el("ol", { class: "bx-step-list", id: "bxStepList" }),
      el("div", { class: "bx-stepper-foot" }, [
        el("div", { class: "bx-save-indicator", id: "bxSaveIndicator", text: "Autosaved" }),
        el("div", { class: "bx-help",
          html: "Built for non-technical SEs.<br/>Inputs save locally per project." }),
      ]),
    ]);
    const main = el("section", { class: "bx-main", id: "bxMain" });
    const side = el("aside", { class: "bx-side", id: "bxSide" }, [
      el("div", { class: "bx-side-head" }, [
        el("div", { class: "bx-side-title", id: "bxSideTitle", text: "Live Suggestions" }),
        el("div", { class: "bx-side-sub", id: "bxSideSub", text: "" }),
      ]),
      el("div", { class: "bx-side-body", id: "bxSideBody" }),
    ]);
    shell.appendChild(stepper); shell.appendChild(main); shell.appendChild(side);
    renderStepper(); renderMain(); renderSide();
    setSaveIndicator(false);
  }

  // ─── BUILDER: stepper ─────────────────────────────────────────
  function renderStepper() {
    const list = $("#bxStepList");
    list.innerHTML = "";
    STEPS.forEach(function (s) {
      const isActive = s.id === app.state.step;
      const isDone = stepCompletion(s.id);
      const li = el("li", {
        class: "bx-step" + (isActive ? " is-active" : "") + (isDone && !isActive ? " is-done" : ""),
        on: { click: function () { app.state.step = s.id; renderShell(); commit(); } },
      }, [
        el("div", { class: "bx-step-num", text: isDone && !isActive ? "✓" : s.num }),
        el("div", {}, [
          el("div", { class: "bx-step-label", text: s.label }),
          el("div", { class: "bx-step-help", text: s.help }),
        ]),
      ]);
      list.appendChild(li);
    });
  }

  function stepCompletion(id) {
    const s = app.state;
    if (!s) return false;
    if (id === "setup") {
      const p = s.project;
      return !!(p.customerName && p.industry && p.audience && p.salesStage && (p.products || []).length);
    }
    if (id === "story") {
      const hasFoundations = s.storyFoundations && (s.storyFoundations.businessProblem || s.storyFoundations.futureStateVision);
      const hasManual = (s.story && (s.story.bigProblem || s.story.futureVision));
      return !!(hasFoundations || s.scriptText || hasManual || (s.storyActs || []).length || (s.personas || []).length);
    }
    if (id === "cx") {
      // Optional step — completed if any components added (or explicitly skipped)
      return (s.cxComponents || []).length > 0 || s._cxSkipped;
    }
    if (id === "recs") {
      return Object.keys(s.selectedRecIds || {}).filter(function (k) { return s.selectedRecIds[k]; }).length > 0;
    }
    if (id === "preview") return (s.slides || []).length > 0;
    return false;
  }

  // ─── BUILDER: main + side ─────────────────────────────────────
  function renderMain() {
    const main = $("#bxMain");
    main.innerHTML = "";
    if      (app.state.step === "setup")   main.appendChild(viewSetup());
    else if (app.state.step === "story")   main.appendChild(viewStory());
    else if (app.state.step === "cx")      main.appendChild(viewCxComponents());
    else if (app.state.step === "recs")    main.appendChild(viewRecommendations());
    else if (app.state.step === "preview") main.appendChild(viewPreview());
    else if (app.state.step === "export")  main.appendChild(viewExport());
  }

  function renderSide() {
    const title = $("#bxSideTitle");
    const sub   = $("#bxSideSub");
    const body  = $("#bxSideBody");
    body.innerHTML = "";
    const step = app.state.step;
    if (step === "setup" || step === "story") {
      title.textContent = "Live Suggestions";
      sub.textContent = "We'll keep this updated as you fill things in";
      sideSuggestions(body);
    } else if (step === "recs") {
      title.textContent = "Selected so far";
      sub.textContent = countSelected() + " recommendations on";
      sideSelectedSummary(body);
    } else if (step === "preview") {
      title.textContent = "Plan health";
      sub.textContent = "Missing inputs surface here";
      sidePlanHealth(body);
    } else {
      title.textContent = "Ready to export";
      sub.textContent = "Snapshot of what you've built";
      sideExportSummary(body);
    }
  }

  // ─── Field helpers ────────────────────────────────────────────
  function field(opts) {
    const wrap = el("div", { class: "bx-field" });
    const labelEl = el("label", { class: "bx-label", text: opts.label });
    if (opts.help) labelEl.appendChild(el("span", { class: "bx-help-inline", text: opts.help }));
    wrap.appendChild(labelEl);
    let input;
    if (opts.type === "select") {
      input = el("select", { class: "bx-select" });
      input.appendChild(el("option", { value: "", text: opts.placeholder || "Select…" }));
      (opts.options || []).forEach(function (o) {
        const optEl = el("option", { value: o, text: o });
        if (opts.value === o) optEl.setAttribute("selected", "selected");
        input.appendChild(optEl);
      });
      input.addEventListener("change", function () { opts.onInput(input.value); });
    } else if (opts.type === "textarea") {
      input = el("textarea", { class: "bx-textarea" + (opts.large ? " bx-textarea-l" : ""),
        placeholder: opts.placeholder || "" });
      input.value = opts.value || "";
      input.addEventListener("input", function () { opts.onInput(input.value); });
    } else if (opts.type === "color") {
      input = el("div", { class: "bx-color-row" });
      const swatch = el("input", { type: "color", class: "bx-color-swatch", value: opts.value || "#b22234" });
      const text = el("input", { type: "text", class: "bx-input", value: opts.value || "#b22234" });
      swatch.addEventListener("input", function () { text.value = swatch.value; opts.onInput(swatch.value); });
      text.addEventListener("input", function () {
        if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { swatch.value = text.value; opts.onInput(text.value); }
      });
      input.appendChild(swatch); input.appendChild(text);
    } else {
      input = el("input", { type: "text", class: "bx-input",
        placeholder: opts.placeholder || "", value: opts.value || "" });
      input.addEventListener("input", function () { opts.onInput(input.value); });
    }
    wrap.appendChild(input);
    return wrap;
  }
  function chips(opts) {
    const wrap = el("div", { class: "bx-chips" });
    opts.options.forEach(function (o) {
      const on = (opts.values || []).indexOf(o) !== -1;
      const c = el("button", { type: "button",
        class: "bx-chip" + (on ? " is-on" : "") + (opts.tone ? " tone-" + opts.tone : ""),
        text: o });
      c.addEventListener("click", function () { opts.onToggle(o); });
      wrap.appendChild(c);
    });
    return wrap;
  }

  // ─── STEP 1: SETUP ────────────────────────────────────────────
  function viewSetup() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 1 · Project Setup",
      "Tell us who this demo is for",
      "Five minutes here gives us enough signal to start recommending the right slides, sections, and assets. You can always come back and edit."
    ));
    const s = app.state;

    // Project name
    const c0 = el("div", { class: "bx-card" });
    c0.appendChild(el("div", { class: "bx-card-title", text: "Project name" }));
    c0.appendChild(el("div", { class: "bx-card-sub", text: "Shows up on the home page so you can find this later." }));
    c0.appendChild(field({
      label: "Project name",
      placeholder: "e.g. Acme — Vision deck",
      value: s.name,
      onInput: function (v) { s.name = v; commit(); renderTopbar(); },
    }));
    wrap.appendChild(c0);

    // Customer & demo basics
    const c1 = el("div", { class: "bx-card" });
    c1.appendChild(el("div", { class: "bx-card-title", text: "Customer & demo basics" }));
    c1.appendChild(el("div", { class: "bx-card-sub", text: "These shape the title slide and brand lockup." }));
    const grid1 = el("div", { class: "bx-grid-2" });
    grid1.appendChild(field({ label: "Customer name", placeholder: "e.g. Acme Retail",
      value: s.project.customerName,
      onInput: function (v) { s.project.customerName = v; commit(); renderTopbar(); renderSide(); } }));
    grid1.appendChild(field({ label: "Customer website", placeholder: "https://www.example.com",
      value: s.project.website, onInput: function (v) { s.project.website = v; commit(); } }));
    grid1.appendChild(field({ label: "Industry", type: "select", options: INDUSTRIES,
      value: s.project.industry,
      onInput: function (v) { s.project.industry = v; recompute(); renderShell(); commit(); } }));
    grid1.appendChild(field({ label: "Demo audience", type: "select", options: AUDIENCES,
      value: s.project.audience,
      onInput: function (v) { s.project.audience = v; recompute(); renderShell(); commit(); } }));
    grid1.appendChild(field({ label: "Sales stage", type: "select", options: STAGES,
      value: s.project.salesStage,
      onInput: function (v) { s.project.salesStage = v; recompute(); renderShell(); commit(); } }));
    grid1.appendChild(field({ label: "Tone", help: "(optional)", type: "select", options: TONES,
      value: s.project.tone, onInput: function (v) { s.project.tone = v; commit(); } }));
    c1.appendChild(grid1);
    c1.appendChild(field({ label: "Demo theme / creative direction", help: "(optional)",
      type: "textarea",
      placeholder: "e.g. The agentic guest journey from booking to post-trip",
      value: s.project.theme,
      onInput: function (v) { s.project.theme = v; commit(); } }));
    wrap.appendChild(c1);

    // Products
    const c2 = el("div", { class: "bx-card" });
    c2.appendChild(el("div", { class: "bx-card-title", text: "Salesforce products in the story" }));
    c2.appendChild(el("div", { class: "bx-card-sub", text: "Pick anything that shows up in the demo. The recommendation engine uses these heavily." }));
    c2.appendChild(chips({
      options: PRODUCTS, values: s.project.products || [],
      onToggle: function (v) {
        const arr = s.project.products || [];
        const i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
        s.project.products = arr;
        recompute(); renderShell(); commit();
      },
    }));
    wrap.appendChild(c2);

    // Brand
    const c3 = el("div", { class: "bx-card" });
    c3.appendChild(el("div", { class: "bx-card-title", text: "Brand" }));
    c3.appendChild(el("div", { class: "bx-card-sub", text: "These flow into the generated config's brand block." }));
    const grid3 = el("div", { class: "bx-grid-3" });
    grid3.appendChild(field({ label: "Primary color", type: "color", value: s.brand.primaryColor,
      onInput: function (v) { s.brand.primaryColor = v; commit(); } }));
    grid3.appendChild(field({ label: "Secondary color", type: "color", value: s.brand.secondaryColor,
      onInput: function (v) { s.brand.secondaryColor = v; commit(); } }));
    grid3.appendChild(field({ label: "Accent color", type: "color", value: s.brand.accentColor,
      onInput: function (v) { s.brand.accentColor = v; commit(); } }));
    c3.appendChild(grid3);
    c3.appendChild(field({ label: "Logo path", help: "(drop the file in demo/assets/ first)",
      placeholder: "e.g. assets/acme-logo.png", value: s.brand.logoPath,
      onInput: function (v) { s.brand.logoPath = v; commit(); } }));
    wrap.appendChild(c3);

    // Presenter
    const c4 = el("div", { class: "bx-card" });
    c4.appendChild(el("div", { class: "bx-card-title", text: "Presenter" }));
    c4.appendChild(el("div", { class: "bx-card-sub", text: "Update before every demo. Appears on the intro slides." }));
    const grid4 = el("div", { class: "bx-grid-2" });
    grid4.appendChild(field({ label: "Presenter name", placeholder: "e.g. Jane Smith",
      value: s.project.presenterName, onInput: function (v) { s.project.presenterName = v; commit(); } }));
    grid4.appendChild(field({ label: "Presenter title", placeholder: "e.g. Senior Account Executive",
      value: s.project.presenterTitle, onInput: function (v) { s.project.presenterTitle = v; commit(); } }));
    c4.appendChild(grid4);
    wrap.appendChild(c4);

    wrap.appendChild(stepFooter("setup"));
    return wrap;
  }

  // ─── STEP 2: STORY ────────────────────────────────────────────
  function viewStory() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 2 · Story",
      "Shape the narrative",
      "Paste a script if you have one. Or build the story from guided fields. Then capture the journey acts and personas."
    ));
    const s = app.state;

    const tabs = el("div", { class: "bx-tabs" });
    [["script", "Paste demo script"], ["manual", "Build from fields"]].forEach(function (t) {
      const btn = el("button", { class: "bx-tab" + (s.storyMode === t[0] ? " is-active" : ""), text: t[1] });
      btn.addEventListener("click", function () { s.storyMode = t[0]; renderMain(); commit(); });
      tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    if (s.storyMode === "script") {
      const c = el("div", { class: "bx-card" });
      c.appendChild(el("div", { class: "bx-card-title", text: "Paste your demo script" }));
      c.appendChild(el("div", { class: "bx-card-sub", text: "We'll scan for keywords (agent, profile, segment, store, loyalty, etc.) and use them to drive recommendations. Nothing is sent anywhere — extraction happens locally." }));
      c.appendChild(field({ label: "Script text", type: "textarea", large: true,
        placeholder: "Paste a rough demo script, story outline, or transcript here…",
        value: s.scriptText,
        onInput: function (v) { s.scriptText = v; recompute(); renderSide(); commit(); } }));

      // Extract button — runs the parser, fills foundations + acts + personas.
      c.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
        btn("✨ Extract Story Foundations", "bx-btn-primary", function () {
          if (!PARSER) { toast("Parser not loaded"); return; }
          if (!s.scriptText || !s.scriptText.trim()) { toast("Paste a script first"); return; }
          const f = PARSER.extractStoryFoundations(s.scriptText, s);
          PARSER.mergeExtractedStoryIntoState(f, s);
          // If the script has clean numbered acts + sections, also seed
          // storyActs (only when the SE hasn't already authored them).
          if (!(s.storyActs || []).length) {
            const acts = PARSER.extractStoryActsFromScript(s.scriptText);
            s.storyActs = acts.map(function (a) { return Object.assign({ id: uid("act_") }, a); });
          }
          // Seed a persona from the persona description if we don't have one
          if (!(s.personas || []).length) {
            const desc = PARSER.extractPersonaDescription(s.scriptText);
            if (desc) {
              const name = (desc.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/) || [, ""])[1];
              s.personas.push({
                id: uid("persona_"),
                name: name || "",
                role: "",
                goals: "",
                painPoints: "",
                demoRelevance: desc,
              });
            }
          }
          recompute();
          renderShell();
          commit();
          toast("Foundations extracted from script");
        }),
        btn("Run Story Quality Check", "bx-btn-secondary", function () { openStoryQualityModal(); }),
      ]));

      if (s.scriptText) {
        const sigs = RULES.extractScriptSignals(s.scriptText);
        const keys = Object.keys(sigs);
        if (keys.length) {
          const row = el("div", { class: "bx-row bx-mt-12" });
          row.appendChild(el("div", { class: "bx-rec-pill tone-good", text: "Signals detected" }));
          keys.sort(function (a, b) { return sigs[b] - sigs[a]; }).forEach(function (k) {
            row.appendChild(el("div", { class: "bx-rec-pill", text: k + " · " + sigs[k] }));
          });
          c.appendChild(row);
        }
      }
      wrap.appendChild(c);

      // Foundations summary card — shows what was extracted
      const f = s.storyFoundations || {};
      const hasAny = f.businessProblem || f.futureStateVision || (f.valueDrivers || []).length;
      if (hasAny) {
        const fc = el("div", { class: "bx-card bx-foundation-card" });
        fc.appendChild(el("div", { class: "bx-card-title", text: "Story Foundations (extracted)" }));
        fc.appendChild(el("div", { class: "bx-card-sub", text: "These flow into Step 4's slide plan. Edit anytime in the manual tab below." }));
        if (f.businessProblem)    fc.appendChild(foundationRow("Business problem", f.businessProblem));
        if (f.currentStatePain)   fc.appendChild(foundationRow("Current-state pain", f.currentStatePain));
        if (f.futureStateVision)  fc.appendChild(foundationRow("Future-state vision", f.futureStateVision));
        if (f.transformationThesis) fc.appendChild(foundationRow("Transformation thesis", f.transformationThesis));
        if ((f.valueDrivers || []).length) fc.appendChild(foundationList("Value drivers", f.valueDrivers));
        if ((f.agentforceMoments || []).length) fc.appendChild(foundationList("Agentforce moments", f.agentforceMoments.slice(0, 4)));
        if ((f.dataCloudMoments  || []).length) fc.appendChild(foundationList("Data Cloud moments", f.dataCloudMoments.slice(0, 4)));
        if ((f.serviceMoments    || []).length) fc.appendChild(foundationList("Service moments", f.serviceMoments.slice(0, 4)));
        if ((f.assumptions       || []).length) fc.appendChild(foundationList("Assumptions", f.assumptions));
        wrap.appendChild(fc);
      }
    } else {
      const c = el("div", { class: "bx-card" });
      c.appendChild(el("div", { class: "bx-card-title", text: "Story foundations" }));
      c.appendChild(el("div", { class: "bx-card-sub", text: "Short answers are fine. These flow into intro slides and the executive summary." }));
      const fields = [
        ["bigProblem",            "Big business problem"],
        ["currentPain",           "Current-state pain"],
        ["futureVision",          "Future-state vision"],
        ["keyCustomerMoments",    "Key customer moments"],
        ["operationalMoments",    "Operational moments"],
        ["agentforceMoments",     "AI / Agentforce moments"],
        ["dataCloudMoments",      "Data Cloud / unified profile moments"],
        ["businessValueMoments",  "Business value moments"],
        ["executiveTakeaway",     "Final executive takeaway"],
      ];
      fields.forEach(function (f) {
        c.appendChild(field({ label: f[1], type: "textarea",
          value: s.story[f[0]] || "",
          onInput: function (v) { s.story[f[0]] = v; recompute(); renderSide(); commit(); } }));
      });
      wrap.appendChild(c);
    }

    // Personas
    const personasCard = el("div", { class: "bx-card" });
    personasCard.appendChild(el("div", { class: "bx-card-title", text: "Personas" }));
    personasCard.appendChild(el("div", { class: "bx-card-sub", text: "Who is the demo about? One persona is enough for most demos." }));
    const personaList = el("div", { class: "bx-list" });
    if (!s.personas.length) {
      personaList.appendChild(el("div", { class: "bx-empty",
        html: "No personas yet. <strong>Add your first one</strong> — we'll recommend a Meet-the-Persona slide." }));
    }
    s.personas.forEach(function (p, idx) { personaList.appendChild(personaItem(p, idx)); });
    personasCard.appendChild(personaList);
    const addPersona = el("button", { class: "bx-add-btn", text: "+ Add persona" });
    addPersona.addEventListener("click", function () {
      s.personas.push({ id: uid("persona_"), name: "", role: "", goals: "", painPoints: "", demoRelevance: "" });
      recompute(); renderMain(); commit();
    });
    personasCard.appendChild(addPersona);
    wrap.appendChild(personasCard);

    // Story acts
    const actsCard = el("div", { class: "bx-card" });
    actsCard.appendChild(el("div", { class: "bx-card-title", text: "Journey acts" }));
    actsCard.appendChild(el("div", { class: "bx-card-sub", text: "Three to five acts is the sweet spot. Each act becomes a slide moment downstream." }));
    const actList = el("div", { class: "bx-list" });
    if (!s.storyActs.length) {
      actList.appendChild(el("div", { class: "bx-empty",
        html: "No acts yet. Try something like <strong>Discover → Engage → Recover → Convert</strong> as a starting frame." }));
    }
    s.storyActs.forEach(function (a, idx) { actList.appendChild(actItem(a, idx)); });
    actsCard.appendChild(actList);
    const addAct = el("button", { class: "bx-add-btn", text: "+ Add act" });
    addAct.addEventListener("click", function () {
      s.storyActs.push({ id: uid("act_"), title: "", persona: "", channel: "", summary: "",
        demoMoment: "", salesforceCapabilities: "", businessValue: "", requiredAssets: "", notes: "" });
      recompute(); renderMain(); commit();
    });
    actsCard.appendChild(addAct);
    wrap.appendChild(actsCard);

    wrap.appendChild(stepFooter("story"));
    return wrap;
  }

  function personaItem(p, idx) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: "Persona " + (idx + 1) }),
      el("div", { class: "bx-item-actions" }, [
        upBtn(function () { moveItem(app.state.personas, p.id, -1); }),
        downBtn(function () { moveItem(app.state.personas, p.id, 1); }),
        delBtn(function () { app.state.personas = app.state.personas.filter(function (x) { return x.id !== p.id; }); recompute(); renderMain(); commit(); }),
      ]),
    ]));
    const grid = el("div", { class: "bx-grid-2" });
    grid.appendChild(field({ label: "Name", value: p.name, onInput: function (v) { p.name = v; recompute(); renderSide(); commit(); } }));
    grid.appendChild(field({ label: "Role", value: p.role, onInput: function (v) { p.role = v; commit(); } }));
    item.appendChild(grid);
    item.appendChild(field({ label: "Goals", type: "textarea", value: p.goals, onInput: function (v) { p.goals = v; commit(); } }));
    item.appendChild(field({ label: "Pain points", type: "textarea", value: p.painPoints, onInput: function (v) { p.painPoints = v; commit(); } }));
    item.appendChild(field({ label: "Demo relevance", type: "textarea", value: p.demoRelevance, onInput: function (v) { p.demoRelevance = v; commit(); } }));
    return item;
  }

  function actItem(a, idx) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: "Act " + (idx + 1) }),
      el("div", { class: "bx-item-actions" }, [
        upBtn(function () { moveItem(app.state.storyActs, a.id, -1); }),
        downBtn(function () { moveItem(app.state.storyActs, a.id, 1); }),
        delBtn(function () { app.state.storyActs = app.state.storyActs.filter(function (x) { return x.id !== a.id; }); recompute(); renderMain(); commit(); }),
      ]),
    ]));
    const grid = el("div", { class: "bx-grid-2" });
    grid.appendChild(field({ label: "Act title", value: a.title, onInput: function (v) { a.title = v; recompute(); renderSide(); commit(); } }));
    grid.appendChild(field({ label: "Persona", value: a.persona, onInput: function (v) { a.persona = v; commit(); } }));
    grid.appendChild(field({ label: "Channel / device", placeholder: "e.g. iPhone · SMS · Storefront",
      value: a.channel, onInput: function (v) { a.channel = v; commit(); } }));
    grid.appendChild(field({ label: "Salesforce capability", value: a.salesforceCapabilities,
      onInput: function (v) { a.salesforceCapabilities = v; commit(); } }));
    item.appendChild(grid);
    item.appendChild(field({ label: "What happens", type: "textarea", value: a.summary,
      onInput: function (v) { a.summary = v; recompute(); renderSide(); commit(); } }));
    item.appendChild(field({ label: "Demo asset / moment", value: a.demoMoment,
      onInput: function (v) { a.demoMoment = v; commit(); } }));
    item.appendChild(field({ label: "Business value", value: a.businessValue,
      onInput: function (v) { a.businessValue = v; commit(); } }));
    item.appendChild(field({ label: "Talk-track notes", type: "textarea", value: a.notes,
      onInput: function (v) { a.notes = v; commit(); } }));
    return item;
  }

  function upBtn(onClick)   { const b = el("button", { class: "bx-mini-btn", "aria-label": "Move up", text: "↑" });   b.addEventListener("click", onClick); return b; }
  function downBtn(onClick) { const b = el("button", { class: "bx-mini-btn", "aria-label": "Move down", text: "↓" }); b.addEventListener("click", onClick); return b; }
  function delBtn(onClick)  { const b = el("button", { class: "bx-mini-btn is-danger", "aria-label": "Remove", text: "✕" }); b.addEventListener("click", onClick); return b; }

  function moveItem(arr, id, delta) {
    const i = arr.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    const j = i + delta;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    renderMain(); commit();
  }

  // ─── STEP 3: CX COMPONENTS (AubreyDemo) ───────────────────────
  function viewCxComponents() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 3 · CX Components",
      "Embed AubreyDemo links",
      "Paste links to AubreyDemo CX components you want to embed in the demo. Each one becomes an iframe-based slide in the Demo section. If a site blocks iframes, we'll show a fallback link."
    ));
    const s = app.state;

    const list = el("div", { class: "bx-list" });
    if (!(s.cxComponents || []).length) {
      list.appendChild(el("div", { class: "bx-empty",
        html: "No CX components yet. <strong>Skip this step</strong> if you don't have AubreyDemo links yet — you can come back anytime." }));
    }
    (s.cxComponents || []).forEach(function (c, i) { list.appendChild(cxItem(c, i)); });
    wrap.appendChild(list);

    const addBtn = el("button", { class: "bx-add-btn", text: "+ Add CX component" });
    addBtn.addEventListener("click", function () {
      s.cxComponents = s.cxComponents || [];
      s.cxComponents.push({
        id: uid("cx_"), name: "New component", url: "",
        type: "web", sectionId: "demo",
        linkedStoryActIds: [], linkedSlideIds: [],
        deviceFrame: "desktop", iframeAllowed: true,
        fallbackMode: "link-card", status: "ready", notes: "",
      });
      s._cxSkipped = false;
      recompute(); renderMain(); commit();
    });
    wrap.appendChild(addBtn);

    if (!(s.cxComponents || []).length) {
      const skip = el("button", { class: "bx-btn bx-btn-link bx-mt-12",
        text: "Skip this step — I don't have CX links yet" });
      skip.addEventListener("click", function () { s._cxSkipped = true; commit(); app.state.step = "recs"; renderShell(); });
      wrap.appendChild(skip);
    }

    wrap.appendChild(stepFooter("cx"));
    return wrap;
  }

  function cxItem(c, idx) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: "Component " + (idx + 1) }),
      el("div", { class: "bx-item-actions" }, [
        upBtn(function () { moveItem(app.state.cxComponents, c.id, -1); }),
        downBtn(function () { moveItem(app.state.cxComponents, c.id, 1); }),
        delBtn(function () {
          app.state.cxComponents = app.state.cxComponents.filter(function (x) { return x.id !== c.id; });
          recompute(); renderMain(); commit();
        }),
      ]),
    ]));
    const grid = el("div", { class: "bx-grid-2" });
    grid.appendChild(field({ label: "Name", placeholder: "e.g. Personalized storefront",
      value: c.name, onInput: function (v) { c.name = v; commit(); } }));
    grid.appendChild(field({ label: "URL",
      help: "(http or https only)",
      placeholder: "https://aubreydemo.com/scene/…",
      value: c.url, onInput: function (v) {
        c.url = v;
        // Live URL validation
        const ok = /^https?:\/\//i.test(v);
        c.status = !v ? "needs-review" : (ok ? "ready" : "blocked");
        commit();
      } }));
    grid.appendChild(field({ label: "Type", type: "select",
      options: ["web", "mobile", "agent", "commerce", "service", "marketing", "data", "other"],
      value: c.type, onInput: function (v) { c.type = v; commit(); } }));
    grid.appendChild(field({ label: "Device frame", type: "select",
      options: ["desktop", "mobile", "tablet", "none"],
      value: c.deviceFrame, onInput: function (v) { c.deviceFrame = v; commit(); } }));
    item.appendChild(grid);

    // Linked story act
    const acts = app.state.storyActs || [];
    if (acts.length) {
      const linkSel = el("select", { class: "bx-select" });
      linkSel.appendChild(el("option", { value: "", text: "(not linked)" }));
      acts.forEach(function (a) {
        const opt = el("option", { value: a.id, text: a.title || ("Act " + (acts.indexOf(a) + 1)) });
        if ((c.linkedStoryActIds || []).indexOf(a.id) >= 0) opt.setAttribute("selected", "selected");
        linkSel.appendChild(opt);
      });
      linkSel.addEventListener("change", function () {
        c.linkedStoryActIds = linkSel.value ? [linkSel.value] : [];
        commit();
      });
      item.appendChild(el("div", { class: "bx-field" }, [
        el("label", { class: "bx-label", text: "Linked story act" },
          [el("span", { class: "bx-help-inline", text: "(optional)" })]),
        linkSel,
      ]));
    }
    item.appendChild(field({ label: "Notes", type: "textarea",
      value: c.notes, onInput: function (v) { c.notes = v; commit(); } }));

    // Live status pill
    const isUrl = /^https?:\/\//i.test(c.url || "");
    const status = el("div", { class: "bx-row bx-mt-12" });
    if (!c.url) status.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "URL needed" }));
    else if (!isUrl) status.appendChild(el("span", { class: "bx-rec-pill tone-red", text: "Invalid URL — must be http(s)" }));
    else if (!/aubreydemo\.com/i.test(c.url)) status.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "Not aubreydemo.com — verify iframe support" }));
    else status.appendChild(el("span", { class: "bx-rec-pill tone-good", text: "Ready to embed" }));
    item.appendChild(status);

    return item;
  }

  // ─── STEP 4: RECOMMENDATIONS (section-grouped) ────────────────
  function viewRecommendations() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 4 · Slide Plan",
      "We picked these for you",
      "Each recommendation is scored from your inputs. Toggle anything off you don't want, rename freely. The slide planner in Step 4 only uses what's selected here."
    ));
    const s = app.state;

    if (!s.recommendations.length) {
      wrap.appendChild(el("div", { class: "bx-empty",
        html: "We need a bit more input before we can recommend things. <strong>Go back to Step 1 or 2</strong> and add a customer, audience, or products." }));
      wrap.appendChild(stepFooter("recs"));
      return wrap;
    }

    // Recommended Narrative banner — opinionated default plan
    const plan = RULES.generateRecommendedNarrativePlan ? RULES.generateRecommendedNarrativePlan(s) : null;

    if (plan) {
      const banner = el("div", { class: "bx-card bx-narrative-card" });
      banner.appendChild(el("div", { class: "bx-card-title", text: "Recommended Narrative" }));
      banner.appendChild(el("div", { class: "bx-card-sub", text: "We've picked an opinionated demo flow based on your inputs. You don't need to know which slides to choose — start here, then customize." }));
      const why = el("ul", { class: "bx-numlist", style: "margin-left: 20px;" });
      (plan.reasoning || []).forEach(function (r) { why.appendChild(el("li", { text: r })); });
      banner.appendChild(why);
      banner.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
        btn("Use Recommended Narrative", "bx-btn-primary", function () {
          // Auto-select all anchors + every "required" or "recommended" rule.
          const ids = new Set(plan.anchorSlideIds);
          plan.sections.forEach(function (sec) {
            sec.slides.forEach(function (r) {
              if (r.selectionStatus === "required" || r.selectionStatus === "recommended") {
                ids.add(r.id);
              }
            });
          });
          s.selectedRecIds = {};
          Array.from(ids).forEach(function (id) { s.selectedRecIds[id] = true; });
          // Update recommendation.selected mirrors
          s.recommendations.forEach(function (r) { r.selected = !!s.selectedRecIds[r.id]; });
          buildSlidePlanFromSelections();
          renderMain(); renderSide(); commit();
          toast("Recommended narrative applied (" + ids.size + " slides)");
        }),
        btn("Build slide plan from selections →", "bx-btn-secondary", function () {
          buildSlidePlanFromSelections();
          app.state.step = "preview"; renderShell(); commit();
        }),
        btn("Run Story Quality Check", "bx-btn-ghost", function () { openStoryQualityModal(); }),
      ]));
      wrap.appendChild(banner);

      // Section-grouped recommendation cards
      plan.sections.forEach(function (sec) {
        const c = el("div", { class: "bx-card bx-section-card" });
        const head = el("div", { class: "bx-section-head" }, [
          el("div", { class: "bx-section-num", text: String(sec.order) }),
          el("div", { class: "bx-section-meta" }, [
            el("div", { class: "bx-section-label", text: sec.label }),
            sec.purpose ? el("div", { class: "bx-section-purpose", text: sec.purpose }) : null,
          ]),
          el("div", { class: "bx-section-count", text: sec.slides.length + " options" }),
        ]);
        c.appendChild(head);
        if (!sec.slides.length) {
          c.appendChild(el("div", { class: "bx-empty",
            html: "No suggestions for this section yet. Add inputs in earlier steps." }));
        } else {
          sec.slides.forEach(function (r) { c.appendChild(recCard(r)); });
        }
        wrap.appendChild(c);
      });
    } else {
      // Fallback: flat list (older logic)
      const groups = {
        slide:        { label: "Slides & Sections" },
        deviceMoment: { label: "Device Moments" },
        kpi:          { label: "KPI / Value Cards" },
      };
      const order = ["slide", "deviceMoment", "kpi"];
      order.forEach(function (key) {
        const items = s.recommendations.filter(function (r) { return r.type === key; });
        if (!items.length) return;
        const c = el("div", { class: "bx-card" });
        c.appendChild(el("div", { class: "bx-card-title", text: groups[key].label }));
        items.forEach(function (r) { c.appendChild(recCard(r)); });
        wrap.appendChild(c);
      });
      const action = el("div", { class: "bx-row bx-mt-18" });
      action.appendChild(btn("Build slide plan from selections →", "bx-btn-primary", function () {
        buildSlidePlanFromSelections();
        app.state.step = "preview"; renderShell(); commit();
      }));
      wrap.appendChild(action);
    }

    wrap.appendChild(stepFooter("recs"));
    return wrap;
  }

  function recCard(r) {
    const isOn = !!app.state.selectedRecIds[r.id];
    const card = el("div", { class: "bx-rec" + (isOn ? " is-on" : "") });
    const check = el("div", { class: "bx-rec-check", role: "checkbox" });
    check.addEventListener("click", function () { toggleRec(r.id); });
    const body = el("div", { class: "bx-rec-body" });

    const row = el("div", { class: "bx-rec-row" });
    const titleInput = el("input", { type: "text", class: "bx-input",
      style: "max-width: 380px; padding: 6px 10px; font-size: 13px; font-weight: 700;",
      value: app.state.customRecTitles[r.id] || r.title });
    titleInput.addEventListener("input", function () {
      app.state.customRecTitles[r.id] = titleInput.value; commit();
    });
    row.appendChild(titleInput);

    // Selection status pill
    if (r.selectionStatus === "required")    row.appendChild(el("span", { class: "bx-rec-pill tone-red",  text: "Required" }));
    else if (r.selectionStatus === "recommended") row.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "Recommended" }));
    else if (r.selectionStatus === "optional") row.appendChild(el("span", { class: "bx-rec-pill", text: "Optional" }));

    // Layout pill
    if (r.layout) row.appendChild(el("span", { class: "bx-rec-pill tone-blue", text: layoutLabelShort(r.layout) }));

    // Capabilities
    (r.capabilities || []).slice(0, 3).forEach(function (cap) {
      row.appendChild(el("span", { class: "bx-rec-pill", text: cap }));
    });

    // Audience flag
    if ((r.audienceTags || []).indexOf("IT") >= 0) row.appendChild(el("span", { class: "bx-rec-pill", text: "Technical only" }));

    body.appendChild(row);
    body.appendChild(el("div", { class: "bx-rec-why", text: r.rationale || "Suggested based on your inputs." }));

    // Readiness flags
    const readinessPills = el("div", { class: "bx-rec-row bx-mt-6" });
    if (r.layout === "embeddedCxComponent" && !(app.state.cxComponents || []).length) {
      readinessPills.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "Needs iframe" }));
    }
    if (r.missingInputs && r.missingInputs.length) {
      readinessPills.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "Missing: " + r.missingInputs.join(", ") }));
    }
    if (readinessPills.children.length) body.appendChild(readinessPills);

    card.appendChild(check); card.appendChild(body);
    card.addEventListener("click", function (e) {
      if (e.target === titleInput || e.target === check) return;
      toggleRec(r.id);
    });
    return card;
  }

  function layoutLabelShort(layout) {
    return ({
      hero: "Hero", storyFoundation: "Story Foundation", currentFutureState: "Before/After",
      futureState: "Future State", journeyTimeline: "Journey", demoMap: "Demo Map",
      personaCard: "Persona", agentConversation: "Agent", unifiedProfile: "Profile",
      architecture: "Architecture", deviceMoment: "Device", embeddedCxComponent: "Embedded CX",
      kpiScorecard: "KPI", executiveSummary: "Takeaway", nextSteps: "Roadmap",
    })[layout] || layout;
  }

  function toggleRec(id) {
    app.state.selectedRecIds[id] = !app.state.selectedRecIds[id];
    app.state.recommendations.forEach(function (r) { if (r.id === id) r.selected = app.state.selectedRecIds[id]; });
    renderMain(); renderSide(); commit();
  }

  // ─── STEP 4: PREVIEW PLAN ─────────────────────────────────────
  function viewPreview() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 5 · Preview Plan",
      "Confirm the shape of your demo",
      "Expanded Preview shows a close approximation of the generated holodeck screen — driven by your real customer, story, and brand inputs. Missing content or assets will be flagged."
    ));
    if (!app.state.slides.length) {
      wrap.appendChild(el("div", { class: "bx-empty",
        html: "No slides yet. <strong>Go to Step 4</strong>, pick recommendations, then build the plan." }));
      wrap.appendChild(stepFooter("preview"));
      return wrap;
    }

    // Toolbar: compact/expanded + by-section/flat + Preview Full Demo
    const toolbar = el("div", { class: "bx-row bx-row-between bx-preview-toolbar" }, [
      el("div", { class: "bx-row" }, [
        el("div", { class: "bx-segmented" }, [
          modeBtn("compact",  "Compact Cards"),
          modeBtn("expanded", "Expanded Preview"),
        ]),
        el("div", { class: "bx-segmented" }, [
          groupBtn("by-section", "Show by section"),
          groupBtn("flat",       "Show flat sequence"),
        ]),
      ]),
      btn("▶ Preview Full Demo", "bx-btn-secondary", function () { openFullDemoModal(); }),
    ]);
    wrap.appendChild(toolbar);

    if (app.previewGrouping === "by-section") {
      // Section-grouped preview
      const sections = (RULES.SLIDE_SECTIONS || []);
      sections.forEach(function (sec) {
        const slidesInSection = app.state.slides.filter(function (sl) { return sl.sectionId === sec.id; });
        if (!slidesInSection.length) return;
        const sectionWrap = el("div", { class: "bx-preview-section" });
        const label = RULES.sectionLabelFor(sec, app.state);
        sectionWrap.appendChild(el("div", { class: "bx-preview-section-head" }, [
          el("div", { class: "bx-preview-section-num", text: String(sec.order) }),
          el("div", {}, [
            el("div", { class: "bx-preview-section-label", text: label }),
            sec.purpose ? el("div", { class: "bx-preview-section-purpose", text: sec.purpose }) : null,
          ]),
          el("div", { class: "bx-preview-section-count", text: slidesInSection.length + " slide" + (slidesInSection.length === 1 ? "" : "s") }),
        ]));
        const grid = el("div", { class: "bx-preview-grid bx-preview-" + app.previewMode });
        slidesInSection.forEach(function (sl) {
          const idx = app.state.slides.indexOf(sl);
          const slide = Object.assign({}, sl, { order: idx });
          grid.appendChild(makePreviewCard(slide));
        });
        sectionWrap.appendChild(grid);
        wrap.appendChild(sectionWrap);
      });
    } else {
      // Flat sequence
      const grid = el("div", { class: "bx-preview-grid bx-preview-" + app.previewMode });
      app.state.slides.forEach(function (sl, i) {
        const slide = Object.assign({}, sl, { order: i });
        grid.appendChild(makePreviewCard(slide));
      });
      wrap.appendChild(grid);
    }

    wrap.appendChild(el("div", { class: "bx-row bx-mt-18" }, [
      (function () { const b = el("button", { class: "bx-btn bx-btn-secondary", text: "← Back to slide plan" });
        b.addEventListener("click", function () { app.state.step = "recs"; renderShell(); }); return b; })(),
      (function () { const b = el("button", { class: "bx-btn bx-btn-primary", text: "Continue to export →" });
        b.addEventListener("click", function () { app.state.step = "export"; renderShell(); }); return b; })(),
    ]));
    return wrap;

    function modeBtn(id, label) {
      const isOn = app.previewMode === id;
      const b = el("button", { class: "bx-seg-btn" + (isOn ? " is-on" : ""), text: label });
      b.addEventListener("click", function () { app.previewMode = id; renderMain(); });
      return b;
    }
    function groupBtn(id, label) {
      const isOn = app.previewGrouping === id;
      const b = el("button", { class: "bx-seg-btn" + (isOn ? " is-on" : ""), text: label });
      b.addEventListener("click", function () { app.previewGrouping = id; renderMain(); });
      return b;
    }
    function makePreviewCard(slide) {
      return PREVIEW.renderPreviewCard(slide, app.state, {
        mode: app.previewMode,
        onMoveUp:   function (id) { moveItem(app.state.slides, id, -1); renderSide(); },
        onMoveDown: function (id) { moveItem(app.state.slides, id, 1); renderSide(); },
        onRemove:   function (id) {
          app.state.slides = app.state.slides.filter(function (x) { return x.id !== id; });
          renderMain(); renderSide(); commit();
        },
      });
    }
  }

  // Section ordering used by the slide planner.
  const SECTION_ORDER = ["intro", "journey-map", "meet-persona", "demo", "business-value"];

  function buildSlidePlanFromSelections() {
    const s = app.state;
    const existingById = {};
    (s.slides || []).forEach(function (sl) { existingById[sl.id] = sl; });
    const selectedRecs = s.recommendations.filter(function (r) { return s.selectedRecIds[r.id]; });

    // Sort: first by section order, then by priority within section.
    const ordered = selectedRecs.slice().sort(function (a, b) {
      const sa = SECTION_ORDER.indexOf(a.sectionId || "demo");
      const sb = SECTION_ORDER.indexOf(b.sectionId || "demo");
      if (sa !== sb) return sa - sb;
      // Within section, hero before others, takeaway last
      if (a.id === "slide-hero" && b.id !== "slide-hero") return -1;
      if (b.id === "slide-hero" && a.id !== "slide-hero") return 1;
      if (a.id === "slide-executive-takeaway" && b.id !== "slide-executive-takeaway") return 1;
      if (b.id === "slide-executive-takeaway" && a.id !== "slide-executive-takeaway") return -1;
      return b.priority - a.priority;
    });

    s.slides = ordered.map(function (r) {
      const id = r.id;
      const existing = existingById[id];
      const persona = (s.personas && s.personas[0]) ? s.personas[0].name : null;
      // If this is an embedded CX slide, link the most relevant component
      let linkedCx = [];
      if (r.layout === "embeddedCxComponent" && (s.cxComponents || []).length) {
        linkedCx = s.cxComponents.slice(0, 1).map(function (c) { return c.id; });
      }
      return existing || {
        id: id,
        title: s.customRecTitles[id] || r.title,
        layout: r.layout,
        sectionId: r.sectionId || RULES.layoutToSectionId(r.layout),
        selectionStatus: r.selectionStatus || "",
        selectionRationale: r.rationale || "",
        readinessStatus: (r.missingInputs && r.missingInputs.length) ? "missing-inputs" : "ready",
        capabilities: r.capabilities ? r.capabilities.slice() : [],
        assets: [],
        contentBlocks: ((RULES.LAYOUTS[r.layout] && RULES.LAYOUTS[r.layout].blocks) || []).slice(),
        speakerNotes: "",
        persona: persona,
        linkedCxComponentIds: linkedCx,
        deviceFrame: linkedCx.length ? (s.cxComponents.find(function (c) { return c.id === linkedCx[0]; }).deviceFrame || "") : "",
        missingInputs: r.missingInputs || [],
      };
    });

    // Reconcile slideSections so the home/export shows accurate counts.
    s.slideSections = (RULES.SLIDE_SECTIONS || []).map(function (sec) {
      return {
        id: sec.id,
        label: sec.label,
        order: sec.order,
        required: sec.required,
        purpose: sec.purpose,
        dynamicLabelTemplate: sec.dynamicLabelTemplate || "",
        slideIds: s.slides.filter(function (sl) { return sl.sectionId === sec.id; }).map(function (sl) { return sl.id; }),
      };
    });
    commit();
  }

  // ─── STEP 5: EXPORT ───────────────────────────────────────────
  function viewExport() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 5 · Export",
      "Get your demo",
      "Use Complete Demo ZIP when you want a ready-to-run package. Use Config only when you want to update an existing demo folder."
    ));
    const cfgJs   = CONFIG.toHolodeckConfigJs(app.state);
    const cfgJson = CONFIG.toJsonString(app.state);

    // ── ZIP (the hero action) ──────────────────────────────────
    const zipCard = el("div", { class: "bx-card bx-card-feature" });
    zipCard.appendChild(el("div", { class: "bx-card-title", text: "Complete Demo ZIP" }));
    zipCard.appendChild(el("div", { class: "bx-card-sub",
      text: "A ready-to-run folder mirroring the existing demo/ structure: index.html, config, CSS, JS, assets folder, README, HOW_TO_RUN — everything an SE needs to open and present locally." }));
    const zipFiles = el("ul", { class: "bx-zip-tree" }, [
      el("li", { text: "📄 README.md  ·  HOW_TO_RUN.md" }),
      el("li", { text: "📁 demo/" }, [
        el("ul", {}, [
          el("li", { text: "index.html" }),
          el("li", { text: "holodeck.config.js  ·  data/holodeck-config.json" }),
          el("li", { text: "css/styles.css" }),
          el("li", { text: "js/app.js  ·  js/renderer.js" }),
          el("li", { text: "assets/  (with ASSET_INSTRUCTIONS.md)" }),
        ]),
      ]),
      el("li", { text: "📁 source/  (builder metadata for re-import)" }),
    ]);
    zipCard.appendChild(zipFiles);
    zipCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("⬇ Download Complete Demo ZIP", "bx-btn-primary", function () {
        try {
          window.HOLO_ZIP.downloadCompleteDemoZip(app.state);
          toast("ZIP downloaded");
        } catch (e) { toast("Couldn't build the ZIP: " + e.message); }
      }),
    ]));
    wrap.appendChild(zipCard);

    // ── Config-only options ────────────────────────────────────
    const c1 = el("div", { class: "bx-card" });
    c1.appendChild(el("div", { class: "bx-card-title", text: "Config only" }));
    c1.appendChild(el("div", { class: "bx-card-sub", text: "Use these to update a demo folder you already have." }));
    c1.appendChild(el("div", { class: "bx-row" }, [
      btn("Copy Config JS", "bx-btn-secondary", function () {
        CONFIG.copyToClipboard(cfgJs).then(function () { toast("Copied holodeck.config.js"); });
      }),
      btn("Download Config JS", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck.config.js", cfgJs, "text/javascript");
      }),
      btn("Download JSON", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck-builder.json", cfgJson, "application/json");
      }),
      btn("Copy JSON", "bx-btn-secondary", function () {
        CONFIG.copyToClipboard(cfgJson).then(function () { toast("Copied JSON snapshot"); });
      }),
    ]));
    wrap.appendChild(c1);

    // ── Live config preview ───────────────────────────────────
    const c2 = el("div", { class: "bx-card" });
    c2.appendChild(el("div", { class: "bx-card-title", text: "Preview — holodeck.config.js" }));
    c2.appendChild(el("div", { class: "bx-card-sub", text: "Read-only preview of the generated file." }));
    c2.appendChild(el("pre", { class: "bx-code", text: cfgJs }));
    wrap.appendChild(c2);

    return wrap;
  }

  function btn(label, klass, onClick) {
    const b = el("button", { class: "bx-btn " + klass, text: label });
    b.addEventListener("click", onClick); return b;
  }

  function foundationRow(label, value) {
    return el("div", { class: "bx-foundation-row" }, [
      el("div", { class: "bx-foundation-label", text: label }),
      el("div", { class: "bx-foundation-value", text: value }),
    ]);
  }
  function foundationList(label, items) {
    const ul = el("ul", { class: "bx-foundation-ul" });
    items.forEach(function (it) { ul.appendChild(el("li", { text: it })); });
    return el("div", { class: "bx-foundation-row" }, [
      el("div", { class: "bx-foundation-label", text: label }),
      ul,
    ]);
  }

  // ─── Side panel renderers ─────────────────────────────────────
  function sideSuggestions(body) {
    const s = app.state;
    const p = s.project;
    const missing = [];
    if (!p.customerName) missing.push("Customer name");
    if (!p.industry)     missing.push("Industry");
    if (!p.audience)     missing.push("Audience");
    if (!p.salesStage)   missing.push("Sales stage");
    if (!(p.products || []).length) missing.push("At least one product");
    if (missing.length) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: "To unlock recommendations" }));
      const ul = el("ul", { style: "margin: 6px 0 0 16px; color: var(--bx-ink-2); font-size: 11px; line-height: 1.6;" });
      missing.forEach(function (m) { ul.appendChild(el("li", { text: m })); });
      card.appendChild(ul);
      body.appendChild(card);
    }
    const recs = (s.recommendations || []).slice(0, 6);
    if (recs.length) {
      body.appendChild(el("div", { class: "bx-side-h", text: "Top picks so far" }));
      recs.forEach(function (r) {
        const card = el("div", { class: "bx-side-card" });
        card.appendChild(el("div", { class: "bx-side-card-t", text: r.title }));
        card.appendChild(el("div", { class: "bx-side-card-s", text: r.rationale || "" }));
        body.appendChild(card);
      });
    } else if (!missing.length) {
      body.appendChild(el("div", { class: "bx-side-empty",
        html: "Once you add story acts or products, suggestions will appear here." }));
    }
    if (s.scriptText) {
      const sigs = RULES.extractScriptSignals(s.scriptText);
      const keys = Object.keys(sigs).sort(function (a, b) { return sigs[b] - sigs[a]; });
      if (keys.length) {
        body.appendChild(el("div", { class: "bx-side-h bx-mt-18", text: "Script signals" }));
        const card = el("div", { class: "bx-side-card" });
        const inner = el("div", { class: "bx-row" });
        keys.slice(0, 8).forEach(function (k) {
          inner.appendChild(el("span", { class: "bx-rec-pill", text: k + " · " + sigs[k] }));
        });
        card.appendChild(inner);
        body.appendChild(card);
      }
    }
  }
  function sideSelectedSummary(body) {
    const s = app.state;
    const selected = s.recommendations.filter(function (r) { return s.selectedRecIds[r.id]; });
    if (!selected.length) {
      body.appendChild(el("div", { class: "bx-side-empty",
        html: "Toggle recommendations on to start your slide plan." }));
      return;
    }
    selected.forEach(function (r) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: s.customRecTitles[r.id] || r.title }));
      card.appendChild(el("div", { class: "bx-side-card-s",
        text: (r.capabilities && r.capabilities.length) ? r.capabilities.join(" · ") : (RULES.LAYOUTS[r.layout] && RULES.LAYOUTS[r.layout].label) }));
      body.appendChild(card);
    });
  }
  function sidePlanHealth(body) {
    const s = app.state;
    if (!s.slides.length) {
      body.appendChild(el("div", { class: "bx-side-empty", html: "Build the plan from Step 3 to see health here." }));
      return;
    }
    const issues = [];
    s.slides.forEach(function (sl) {
      (sl.missingInputs || []).forEach(function (k) { issues.push(sl.title + ": " + k); });
    });
    if (!issues.length) {
      body.appendChild(el("div", { class: "bx-side-card" }, [
        el("div", { class: "bx-side-card-t", text: "Plan looks healthy" }),
        el("div", { class: "bx-side-card-s", text: "No missing inputs detected. Ship it." }),
      ]));
      return;
    }
    body.appendChild(el("div", { class: "bx-side-h", text: "Missing inputs" }));
    issues.slice(0, 12).forEach(function (line) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-s", text: line }));
      body.appendChild(card);
    });
  }
  function sideExportSummary(body) {
    const s = app.state;
    [
      ["Slides", s.slides.length],
      ["Personas", s.personas.length],
      ["Story acts", s.storyActs.length],
      ["Selected recs", countSelected()],
      ["Products", (s.project.products || []).length],
    ].forEach(function (c) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: c[1] + " " + c[0] }));
      body.appendChild(card);
    });
    body.appendChild(el("div", { class: "bx-side-h bx-mt-18", text: "Pre-live items" }));
    const items = (CONFIG.buildSnapshot(s).buildNotes || []).slice(0, 6);
    items.forEach(function (i) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-s", text: "• " + i }));
      body.appendChild(card);
    });
  }
  function countSelected() {
    return Object.keys(app.state.selectedRecIds).filter(function (k) { return app.state.selectedRecIds[k]; }).length;
  }

  // ─── Step header / footer ─────────────────────────────────────
  function stepHeader(eyebrow, title, sub) {
    return el("div", { class: "bx-main-head" }, [
      el("div", { class: "bx-main-eyebrow", text: eyebrow }),
      el("h1",  { class: "bx-main-title", text: title }),
      el("p",   { class: "bx-main-sub", text: sub }),
    ]);
  }
  function stepFooter(stepId) {
    const wrap = el("div", { class: "bx-row bx-row-between bx-mt-24" });
    const i = STEPS.findIndex(function (s) { return s.id === stepId; });
    const prev = STEPS[i - 1];
    const next = STEPS[i + 1];
    const left = el("div");
    if (prev) {
      const b = el("button", { class: "bx-btn bx-btn-secondary", text: "← " + prev.label });
      b.addEventListener("click", function () { app.state.step = prev.id; renderShell(); commit(); });
      left.appendChild(b);
    }
    const right = el("div");
    if (next) {
      const b = el("button", { class: "bx-btn bx-btn-primary", text: next.label + " →" });
      b.addEventListener("click", function () { app.state.step = next.id; renderShell(); commit(); });
      right.appendChild(b);
    }
    wrap.appendChild(left); wrap.appendChild(right);
    return wrap;
  }

  // ─── Recompute recommendations from current state ─────────────
  function recompute() {
    if (!app.state) return;
    const s = app.state;
    const ctx = {
      customerName: s.project.customerName,
      website:      s.project.website,
      industry:     s.project.industry,
      audience:     s.project.audience,
      salesStage:   s.project.salesStage,
      products:     s.project.products,
      personas:     s.personas,
      storyActs:    s.storyActs,
      scriptText:   s.scriptText,
      bigProblem:        s.story.bigProblem,
      currentPain:       s.story.currentPain,
      futureVision:      s.story.futureVision,
      executiveTakeaway: s.story.executiveTakeaway,
      bvsMetrics:   s.bvsMetrics,
      scenes:       s.scenes,
    };
    const res = RULES.recommend(ctx);
    s.recommendations = res.recommendations;
    s.recommendations.forEach(function (r) {
      if (s.selectedRecIds[r.id] == null && r.priority >= 80) s.selectedRecIds[r.id] = true;
      r.selected = !!s.selectedRecIds[r.id];
    });
  }

  // ─── AI PROMPT VIEW ───────────────────────────────────────────
  function renderAiPromptPage(container) {
    container.innerHTML = "";
    container.appendChild(stepHeader(
      "AI Prompt",
      "Generate a config with ChatGPT or Claude",
      AI_PROMPT.PAGE_HELPER
    ));

    const c0 = el("div", { class: "bx-card" });
    c0.appendChild(el("div", { class: "bx-card-title", text: "How this works" }));
    c0.appendChild(el("ol", { class: "bx-numlist" }, [
      el("li", { text: "Copy the prompt below." }),
      el("li", { text: "Paste it into ChatGPT or Claude." }),
      el("li", { text: "Underneath the prompt, paste your customer notes, demo script, audience, products, and any context you have." }),
      el("li", { text: "The AI returns a JSON config." }),
      el("li", { html: "Come back here, click <strong>Import Config</strong>, and paste the JSON. The builder will auto-fill setup, personas, story acts, recommendations, slides, and assets." }),
    ]));
    container.appendChild(c0);

    const promptCard = el("div", { class: "bx-card" });
    promptCard.appendChild(el("div", { class: "bx-card-title", text: "AI Prompt" }));
    promptCard.appendChild(el("div", { class: "bx-card-sub", text: "Editable. Copy as-is, or tweak before sending." }));
    const promptArea = el("textarea", { class: "bx-textarea bx-textarea-xl" });
    promptArea.value = AI_PROMPT.getFullPrompt();
    promptCard.appendChild(promptArea);
    promptCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Copy AI Prompt", "bx-btn-primary", function () {
        CONFIG.copyToClipboard(promptArea.value).then(function () { toast("Prompt copied"); });
      }),
      btn("Reset prompt", "bx-btn-secondary", function () {
        promptArea.value = AI_PROMPT.getFullPrompt(); toast("Reset");
      }),
      btn("Open ChatGPT", "bx-btn-ghost", function () { window.open("https://chat.openai.com/", "_blank"); }),
      btn("Open Claude", "bx-btn-ghost", function () { window.open("https://claude.ai/", "_blank"); }),
    ]));
    container.appendChild(promptCard);

    const schemaCard = el("div", { class: "bx-card" });
    schemaCard.appendChild(el("div", { class: "bx-card-title", text: "Config schema / template" }));
    schemaCard.appendChild(el("div", { class: "bx-card-sub", text: "Already inlined in the prompt above. Useful if you want the schema on its own." }));
    schemaCard.appendChild(el("pre", { class: "bx-code", text: AI_PROMPT.CONFIG_TEMPLATE }));
    schemaCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Copy schema", "bx-btn-secondary", function () {
        CONFIG.copyToClipboard(AI_PROMPT.CONFIG_TEMPLATE).then(function () { toast("Schema copied"); });
      }),
    ]));
    container.appendChild(schemaCard);

    const exCard = el("div", { class: "bx-card" });
    exCard.appendChild(el("div", { class: "bx-card-title", text: "Example: what to send the AI alongside the prompt" }));
    exCard.appendChild(el("div", { class: "bx-card-sub", text: "A short example — paste your own version under the prompt." }));
    exCard.appendChild(el("pre", { class: "bx-code", text: AI_PROMPT.EXAMPLE_INPUTS }));
    exCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Copy example", "bx-btn-secondary", function () {
        CONFIG.copyToClipboard(AI_PROMPT.EXAMPLE_INPUTS).then(function () { toast("Example copied"); });
      }),
    ]));
    container.appendChild(exCard);

    const importCard = el("div", { class: "bx-card" });
    importCard.appendChild(el("div", { class: "bx-card-title", text: "Got the AI's response?" }));
    importCard.appendChild(el("div", { class: "bx-card-sub", text: "Bring it in here — we'll create a new project from it." }));
    importCard.appendChild(el("div", { class: "bx-row" }, [
      btn("Import config", "bx-btn-primary", function () { openImportModal(null); }),
    ]));
    container.appendChild(importCard);
  }

  // ─── Modals: Import / Export ──────────────────────────────────
  function openModal(title, bodyNode, modifierClass) {
    $("#bxModalTitle").textContent = title;
    const body = $("#bxModalBody");
    body.innerHTML = "";
    body.appendChild(bodyNode);
    const card = document.querySelector(".bx-modal-card");
    card.className = "bx-modal-card" + (modifierClass ? " " + modifierClass : "");
    $("#bxModal").hidden = false;
  }
  function closeModal() { $("#bxModal").hidden = true; }

  // targetProjectId: string → overwrite that project; null → create new.
  function openImportModal(targetProjectId) {
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Paste a JSON config (from ChatGPT/Claude or a previous export) or the contents of a holodeck.config.js file." }));
    const ta = el("textarea", { class: "bx-textarea bx-textarea-l", placeholder: "Paste here…" });
    wrap.appendChild(ta);
    const fileRow = el("div", { class: "bx-row bx-mt-12" });
    const fileLabel = el("label", { class: "bx-btn bx-btn-secondary", text: "…or pick a file" });
    const fileInput = el("input", { type: "file", style: "display: none;", accept: ".js,.json,.txt" });
    fileInput.addEventListener("change", function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () { ta.value = reader.result; };
      reader.readAsText(f);
    });
    fileLabel.appendChild(fileInput);
    fileRow.appendChild(fileLabel);
    wrap.appendChild(fileRow);

    const status = el("div", { class: "bx-mt-12" });
    wrap.appendChild(status);

    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Import", "bx-btn-primary", function () {
      status.innerHTML = "";
      const result = VALIDATOR.importConfig(ta.value);
      if (result.errors && result.errors.length) {
        result.errors.forEach(function (msg) {
          status.appendChild(el("div", { class: "bx-alert is-error", text: msg }));
        });
        return;
      }
      const imported = result.state;
      if (targetProjectId) {
        imported.id = targetProjectId;
        imported.createdAt = (app.state && app.state.createdAt) || new Date().toISOString();
      } else {
        imported.id = STORE.uid();
      }
      STORE.saveProject(imported);
      (result.warnings || []).forEach(function (msg) {
        status.appendChild(el("div", { class: "bx-alert is-warn", text: msg }));
      });
      closeModal();
      goBuilder(imported.id);
      toast(targetProjectId ? "Project replaced from import" : "New project created from import");
    }));
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Import config", wrap);
  }

  function openExportModal() {
    const cfgJs   = CONFIG.toHolodeckConfigJs(app.state);
    const cfgJson = CONFIG.toJsonString(app.state);
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 14px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Use Complete Demo ZIP for a ready-to-run package. Use Config only when updating an existing demo folder." }));
    wrap.appendChild(el("div", { class: "bx-modal-actions", style: "margin-top: 0; margin-bottom: 14px;" }, [
      btn("⬇ Download Complete Demo ZIP", "bx-btn-primary", function () {
        try { window.HOLO_ZIP.downloadCompleteDemoZip(app.state); toast("ZIP downloaded"); }
        catch (e) { toast("Couldn't build the ZIP: " + e.message); }
      }),
      btn("Download Config JS", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck.config.js", cfgJs, "text/javascript"); toast("Downloaded");
      }),
      btn("Download JSON", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck-builder.json", cfgJson, "application/json"); toast("Downloaded");
      }),
    ]));
    wrap.appendChild(el("pre", { class: "bx-code", text: cfgJs }));
    wrap.appendChild(el("div", { class: "bx-modal-actions" }, [
      btn("Copy Config JS", "bx-btn-secondary", function () { CONFIG.copyToClipboard(cfgJs).then(function () { toast("Copied"); }); }),
      btn("Copy JSON",      "bx-btn-secondary", function () { CONFIG.copyToClipboard(cfgJson).then(function () { toast("Copied"); }); }),
      btn("Close",          "bx-btn-ghost",     closeModal),
    ]));
    openModal("Export", wrap);
  }

  // ── Story Quality Check ──────────────────────────────────────
  function openStoryQualityModal() {
    if (!VALIDATE_STORY) { toast("Validator not loaded"); return; }
    const result = VALIDATE_STORY.validateGeneratedStoryAndSlides(app.state);
    const wrap = el("div");
    const summary = result.summary || { errors: 0, warnings: 0, info: 0 };

    wrap.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      el("span", { class: "bx-rec-pill " + (summary.errors ? "tone-red" : "tone-good"), text: summary.errors + " errors" }),
      el("span", { class: "bx-rec-pill " + (summary.warnings ? "tone-gold" : "tone-good"), text: summary.warnings + " warnings" }),
      el("span", { class: "bx-rec-pill", text: summary.info + " notes" }),
    ]));

    if (!result.issues.length) {
      wrap.appendChild(el("div", { class: "bx-empty bx-mt-18",
        html: "Looking good. <strong>Nothing flagged.</strong> Foundations, story acts, and slide layouts all check out." }));
    } else {
      const list = el("div", { class: "bx-mt-18", style: "display: flex; flex-direction: column; gap: 8px;" });
      result.issues.forEach(function (i) {
        const tone = i.severity === "error" ? "is-error" : (i.severity === "warning" ? "is-warn" : "is-info");
        const card = el("div", { class: "bx-alert " + tone });
        card.appendChild(el("div", { style: "font-weight: 700;", text: i.message }));
        if (i.hint) card.appendChild(el("div", { style: "margin-top: 4px; font-size: 11px; opacity: 0.85;", text: i.hint }));
        list.appendChild(card);
      });
      wrap.appendChild(list);
    }

    wrap.appendChild(el("div", { class: "bx-modal-actions" }, [
      btn("Close", "bx-btn-secondary", closeModal),
    ]));
    openModal("Story Quality Check", wrap);
  }

  // ── Preview Full Demo: a slide-by-slide expanded preview using
  //    the same renderer the exported demo will use ───────────
  function openFullDemoModal() {
    const slides = app.state.slides || [];
    const wrap = el("div", { class: "bx-fulldemo" });
    if (!slides.length) {
      wrap.appendChild(el("div", { class: "bx-empty",
        html: "No slides yet. Build the plan first." }));
      openModal("Preview Full Demo", wrap);
      return;
    }

    const stage = el("div", { class: "bx-fulldemo-stage" });
    const dotRow = el("div", { class: "bx-fulldemo-dots" });
    let current = 0;

    function go(i) {
      current = Math.max(0, Math.min(slides.length - 1, i));
      stage.innerHTML = "";
      const slide = Object.assign({}, slides[current], { order: current });
      stage.appendChild(PREVIEW.renderSlidePreview(slide, app.state, "expanded"));
      Array.prototype.forEach.call(dotRow.children, function (d, idx) {
        d.classList.toggle("is-on", idx === current);
      });
      counter.textContent = (current + 1) + " / " + slides.length;
      titleEl.textContent = slide.title || "Slide " + (current + 1);
    }

    slides.forEach(function (_, i) {
      const d = el("button", { class: "bx-fulldemo-dot", "aria-label": "Slide " + (i + 1) });
      d.addEventListener("click", function () { go(i); });
      dotRow.appendChild(d);
    });

    const head = el("div", { class: "bx-fulldemo-head" });
    const titleEl = el("div", { class: "bx-fulldemo-title", text: "" });
    const counter = el("div", { class: "bx-fulldemo-counter", text: "" });
    head.appendChild(titleEl); head.appendChild(counter);
    wrap.appendChild(head);
    wrap.appendChild(stage);

    const controls = el("div", { class: "bx-fulldemo-controls" });
    controls.appendChild(btn("← Prev", "bx-btn-secondary", function () { go(current - 1); }));
    controls.appendChild(dotRow);
    controls.appendChild(btn("Next →", "bx-btn-primary", function () { go(current + 1); }));
    wrap.appendChild(controls);

    // Keyboard navigation while modal is open
    function onKey(e) {
      if ($("#bxModal").hidden) { document.removeEventListener("keydown", onKey); return; }
      if (e.key === "ArrowRight" || e.key === " ") go(current + 1);
      else if (e.key === "ArrowLeft") go(current - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(slides.length - 1);
    }
    document.addEventListener("keydown", onKey);

    openModal("Preview Full Demo", wrap, "is-fulldemo");
    go(0);
  }

  // ─── Boot ─────────────────────────────────────────────────────
  function boot() {
    const migratedId = STORE.migrateLegacyIfPresent();
    STORE.reconcile();

    $("#bxModal").addEventListener("click", function (e) {
      if (e.target === $("#bxModal")) closeModal();
    });
    document.addEventListener("click", function (e) {
      const action = e.target.getAttribute && e.target.getAttribute("data-action");
      if (action === "close-modal") closeModal();
    });

    if (migratedId) {
      goBuilder(migratedId);
      toast("Your earlier draft is saved as a project.");
      return;
    }
    goHome();
  }

  boot();
})();
