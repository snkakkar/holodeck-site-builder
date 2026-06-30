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
  const AUBREY    = window.HOLO_AUBREY;
  const AUTH      = window.HOLO_AUTH;
  const FEEDBACK  = window.HOLO_FEEDBACK;

  // ─── App-level constants ──────────────────────────────────────
  // 8-step guided flow. Story used to be one step doing three things
  // (paste, foundations, regenerate). Splitting it into Script /
  // Foundations / Narrative makes each user decision its own surface
  // with one obvious next action.
  const STEPS = [
    { id: "connect",     num: "1",  label: "Connect (optional)",    help: "Optional shortcut — connect Aubrey to auto-fill. Skip and add everything by hand." },
    { id: "script",      num: "2",  label: "Script & Story",        help: "Paste or upload your demo script (or pull it from Aubrey if connected)" },
    { id: "setup",       num: "3",  label: "Setup",                 help: "Customer, audience, products" },
    { id: "foundations", num: "4",  label: "Story Foundations",     help: "Review what was extracted" },
    { id: "recs",        num: "5",  label: "Slide Selection",       help: "Customize the slide plan by section" },
    { id: "assets",      num: "6",  label: "Assets",                help: "Upload images for the slides you selected (optional)" },
    { id: "cx",          num: "7",  label: "CX Components",         help: "Optionally embed live web screens (AubreyDemo or any URL)" },
    { id: "preview",     num: "8",  label: "Preview",               help: "Review the full demo before exporting" },
    { id: "export",      num: "9",  label: "Export",                help: "Download the complete demo ZIP" },
  ];
  const INDUSTRIES = ["Retail","Consumer Goods","Hospitality","Travel","Financial Services","Healthcare","Other"];
  const AUDIENCES  = ["Executive","IT","Marketing","Sales","Service","Store Ops","Field Ops","Mixed"];
  const STAGES     = ["Vision","Discovery","Technical Validation","Executive Readout","RFP / POV"];
  const PRODUCTS   = ["Data Cloud","Agentforce","Sales Cloud","Service Cloud","Marketing Cloud","Commerce","Loyalty","Slack","Einstein","MuleSoft","Tableau"];
  const TONES      = ["Executive","Tactical","Visionary","Technical","Playful","Premium"];

  // ─── Top-level app state ──────────────────────────────────────
  // view: which top-level page is showing.
  // state: the active project (only meaningful when view === "builder").
  const app = {
    view: "home",
    state: null,
    // The signed-in user's synced profile {name,title,role} (Neon `profiles`).
    // Loaded once on auth; used to pre-populate the presenter name/title on a
    // fresh project. null until loaded.
    profile: null,
    previewMode: "expanded",       // "compact" | "expanded"
    previewGrouping: "by-section", // "by-section" | "flat"
    // First-launch product tour. Lives here (not in the DOM) so it survives the
    // home→builder view switch, which tears down and rebuilds #bxShell.
    tour: { active: false, segment: null, index: 0, resumeOnBuilder: false },
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
  // Small reusable progress widget. Returns { node, set, indeterminate }.
  //  • set(frac, label)      → determinate: fill width = frac (0..1)
  //  • indeterminate(label)  → animated sweep (for single long calls)
  function progressBar(initialLabel) {
    const fill = el("div", { class: "bx-progress-fill" });
    const track = el("div", { class: "bx-progress" }, [fill]);
    const label = el("div", { class: "bx-progress-label", text: initialLabel || "" });
    const node = el("div", { class: "bx-progress-wrap" }, [track, label]);
    return {
      node: node,
      set: function (frac, text) {
        track.classList.remove("is-indeterminate");
        const pct = Math.max(0, Math.min(1, frac || 0)) * 100;
        fill.style.width = Math.round(pct) + "%";
        if (text != null) label.textContent = text;
      },
      indeterminate: function (text) {
        track.classList.add("is-indeterminate");
        fill.style.width = "";
        if (text != null) label.textContent = text;
      },
    };
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
    if (app.view !== "builder" || !app.state) return Promise.resolve();
    // The store writes the local cache synchronously inside saveProject,
    // so the indicator can flip to "Autosaved" immediately; the returned
    // Promise resolves when the Neon write-through completes (or falls
    // back to the dirty queue). Callers that tear down state await it.
    const p = STORE.saveProject(app.state);
    setSaveIndicator(false);
    // The local cache write inside saveProject can fail silently if the
    // localStorage quota is exhausted. Surface it once so the user isn't
    // left believing autosave succeeded when the device cache didn't take.
    if (p && typeof p.then === "function") {
      p.then(function () {
        // saveProject resolves even when the Neon write-through failed (it
        // queues the row dirty and retries later). Surface it: the work IS saved
        // on this device, it just hasn't reached the account yet. Log the real
        // status + PostgREST message so a persistent failure is diagnosable.
        const failed = STORE.lastSyncFailed && STORE.lastSyncFailed();
        // Refine the persistent indicator now that the write-through resolved.
        setSaveIndicator(false, !failed);
        if (failed) {
          const e = STORE.lastSyncError && STORE.lastSyncError();
          if (e) {
            console.warn("[holodeck] cloud save failed:", e.status || "(net)", e.message);
            if (e.offline) {
              toast("Saved on this device — sign in to sync to your account.");
            } else {
              toast("Saved on this device — couldn't sync to your account" +
                (e.status ? " (error " + e.status + ")" : "") + ". Retrying later.");
            }
          } else {
            toast("Saved on this device — not yet synced to your account.");
          }
        }
      }).catch(function () { /* network/dirty-queue handled in store */ });
    }
    if (STORE.lastCacheWriteFailed && STORE.lastCacheWriteFailed()) {
      toast("Couldn't save locally — storage may be full.");
    }
    return p;
  }
  let saveTimer = null;
  function commit() {
    setSaveIndicator(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveActive, 250);
  }
  // state: true = "Saving…"; false = optimistic local save done; the optional
  // `synced` arg (set once the async write resolves) distinguishes a confirmed
  // cloud save ("Saved to cloud") from a local-only fallback ("Saved locally").
  function setSaveIndicator(dirty, synced) {
    const elIndicator = $("#bxSaveIndicator");
    if (!elIndicator) return;
    if (app.view !== "builder") {
      elIndicator.style.visibility = "hidden";
      return;
    }
    elIndicator.style.visibility = "";
    if (dirty) {
      elIndicator.classList.add("is-dirty");
      elIndicator.textContent = "Saving…";
    } else {
      elIndicator.classList.remove("is-dirty");
      elIndicator.textContent = synced === false ? "Saved locally" : "Saved to cloud";
    }
  }

  // ─── Navigation between views ─────────────────────────────────
  // A rejected store Promise (e.g. loadProject/saveProject failing) used to
  // strand the UI mid-transition with no feedback. This handler lands the
  // user safely back home with a toast so navigation never dead-ends.
  function navFailed(message) {
    return function (err) {
      if (typeof console !== "undefined" && console.warn) console.warn("[holo] navigation failed:", err);
      toast(message || "Something went wrong. Returning to projects.");
      app.view = "home";
      app.state = null;
      try { STORE.setActiveProjectId(null); } catch (e) { /* ignore */ }
      render();
    };
  }
  function goHome() {
    // Save BEFORE tearing down state. The cache write is synchronous so
    // data is safe instantly; we still chain so a slow Neon write can't
    // be cancelled by the teardown.
    const save = (app.view === "builder" && app.state) ? saveActive() : Promise.resolve();
    save.then(function () {
      app.view = "home";
      app.state = null;
      STORE.setActiveProjectId(null);
      render();
    }).catch(navFailed("Couldn't save before leaving. Returning to projects."));
  }
  function goBuilder(projectId) {
    STORE.loadProject(projectId).then(function (state) {
      if (!state) {
        STORE.reconcile();
        toast("That project couldn't be opened.");
        goHome();
        return;
      }
      // AI images persist as "gcs:" tokens; mint fresh signed URLs into the
      // live state so the editor/preview can display them. signAssets never
      // rejects — on failure it leaves tokens (renderer shows a placeholder).
      return STORE.signAssets(state).then(function () {
        app.state = state;
        app.view = "builder";
        STORE.setActiveProjectId(projectId);
        // Seed presenter name/title from the synced profile if still blank.
        if (prepopulatePresenterFromProfile(state)) saveActive();
        recompute();
        render();
      });
    }).catch(navFailed("That project couldn't be opened."));
  }
  function goAiPrompt() {
    const save = (app.view === "builder" && app.state) ? saveActive() : Promise.resolve();
    save.then(function () {
      app.view = "aiPrompt";
      render();
    }).catch(navFailed("Couldn't open the AI prompt. Returning to projects."));
  }
  function goFeedback() {
    const save = (app.view === "builder" && app.state) ? saveActive() : Promise.resolve();
    save.then(function () {
      app.view = "feedback";
      render();
    }).catch(navFailed("Couldn't open feedback. Returning to projects."));
  }
  function goProfile() {
    const save = (app.view === "builder" && app.state) ? saveActive() : Promise.resolve();
    save.then(function () {
      app.view = "profile";
      render();
    }).catch(navFailed("Couldn't open your profile. Returning to projects."));
  }
  function newProject() {
    STORE.createProject({}).then(function (state) {
      app.state = state;
      app.view = "builder";
      STORE.setActiveProjectId(state.id);
      if (prepopulatePresenterFromProfile(state)) saveActive();
      recompute();
      render();
    }).catch(navFailed("Couldn't create a new project. Please try again."));
  }

  // ─── Top-level render ─────────────────────────────────────────
  function render() {
    renderTopbar();
    renderShell();
  }

  let _topbarSig = null;
  function renderTopbar() {
    const left  = $("#bxTopbarLeft");
    const right = $("#bxTopbarActions");

    // The topbar reflects: current view, the active project's name +
    // customer, the signed-in user, and the Aubrey key count (on the keys
    // button). renderTopbar fires on every commit (each keystroke); skip the
    // full innerHTML rebuild when none of those changed. The Aubrey count is
    // included because the keys modal calls renderTopbar() on close to
    // refresh it. Any visible-state change busts the signature.
    const s = app.state;
    const u = (AUTH && AUTH.isAuthed && AUTH.isAuthed()) ? AUTH.currentUser() : null;
    let aubreyCount = "";
    if (AUBREY && (app.view === "home" || app.view === "builder")) {
      const ak = getAubreyGlobalKeys();
      aubreyCount = ["email", "demoforgeKey", "scriptwriterKey", "pocketsicKey"]
        .filter(function (k) { return !!ak[k]; }).length;
    }
    const sig = [
      app.view,
      s && s.id,
      s && s.name,
      s && s.project && s.project.customerName,
      u && u.email,
      app.profile && app.profile.name,
      aubreyCount,
    ].join("");
    if (sig === _topbarSig && left.firstChild) return;
    _topbarSig = sig;

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
      ["feedback", "Feedback",  function () { goFeedback(); }],
    ].forEach(function (n) {
      const isActive = (app.view === n[0]);
      right.appendChild(el("button", {
        class: "bx-nav-link" + (isActive ? " is-active" : ""),
        text: n[1],
        on: { click: n[2] },
      }));
    });

    if (app.view === "builder") {
      right.appendChild(actionBtn("Import", "bx-btn-ghost", function () { openImportModal(app.state.id); }));
      right.appendChild(actionBtn("Save", "bx-btn-secondary", function () { saveActive().then(function () { toast("Saved"); }); }));
      right.appendChild(actionBtn("Export", "bx-btn-primary", function () { openExportModal(); }));
    }

    // Sign-out is always available once authenticated (any non-login view).
    if (AUTH && AUTH.isAuthed() && app.view !== "login") {
      const u = AUTH.currentUser();
      if (u && u.email) {
        // Initials avatar replaces both the Profile nav link and the email
        // text — clicking it opens the profile page. Title shows the email.
        right.appendChild(profileAvatarButton(u));
      }
      right.appendChild(actionBtn("Sign out", "bx-btn-ghost", function () { signOut(); }));
    }
  }

  // Round avatar showing the user's initials. Source order for the name:
  // synced profile name → auth name → email local-part. Clicking opens the
  // profile page; marked active when that page is showing.
  function profileAvatarButton(u) {
    const name = (app.profile && app.profile.name) || (u && u.name) || "";
    const initials = initialsFor(name, u && u.email);
    const b = el("button", {
      class: "bx-avatar" + (app.view === "profile" ? " is-active" : ""),
      title: (u && u.email) ? ("Profile · " + u.email) : "Profile",
      "aria-label": "Open your profile",
      text: initials,
      on: { click: function () { goProfile(); } },
    });
    return b;
  }

  // Up to two initials. Prefers the first letters of the first two name
  // words; falls back to the first two letters of the email local-part,
  // then "?". Always uppercase.
  function initialsFor(name, email) {
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    if (words.length === 1 && words[0]) return words[0].slice(0, 2).toUpperCase();
    const local = String(email || "").split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
    if (local) return local.slice(0, 2).toUpperCase();
    return "?";
  }

  function actionBtn(label, klass, onClick) {
    const b = el("button", { class: "bx-btn " + klass, text: label });
    b.addEventListener("click", onClick);
    return b;
  }

  function renderShell() {
    const shell = $("#bxShell");
    shell.innerHTML = "";

    // The quality footer belongs only to the builder view. For other views
    // strip it; for the builder, leave it so renderQualityFooter can update
    // it in place (avoids a remove + re-append on every shell re-render).
    if (app.view !== "builder") {
      const stale = $("#bxQualityFooter");
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    }

    if (app.view === "login") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      renderLoginPage(wrap);
      setSaveIndicator(false);
      return;
    }

    if (app.view === "home") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      HOME.render(wrap, {
        onOpen:      function (id) { goBuilder(id); },
        onNew:       function () { openNewProjectChooser(); },
        onImport:    function () { openImportModal(null); },
        onAiPrompt:  function () { goAiPrompt(); },
        onDuplicate: function (id, done) { STORE.duplicateProject(id).then(function () { done && done(); toast("Duplicated"); }); },
        onRename:    function (id, name, done) { STORE.renameProject(id, name).then(function () { done && done(); toast("Renamed"); }); },
        onDelete:    function (id, done) { STORE.deleteProject(id).then(function () { done && done(); toast("Deleted"); }); },
      });
      setSaveIndicator(false);
      // First-launch tour: walk the home view, then hand off to the builder.
      var ob = STORE.getOnboarding();
      if (!ob.tourDone && !ob.neverShowAgain && !app.tour.active) {
        setTimeout(function () { startTour("home"); }, 0);
      }
      return;
    }

    if (app.view === "aiPrompt") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      renderAiPromptPage(wrap);
      setSaveIndicator(false);
      // First-visit guided tour for the AI setup (replay link ignores the flag).
      const ob = STORE.getOnboarding();
      if (!ob.aiPromptTourSeen && !ob.neverShowAgain && !app.tour.active)
        setTimeout(function () { startTour("aiPrompt"); }, 0);
      return;
    }

    if (app.view === "feedback") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      renderFeedbackPage(wrap);
      setSaveIndicator(false);
      return;
    }

    if (app.view === "profile") {
      shell.classList.add("is-single");
      const wrap = el("section", { class: "bx-page", id: "bxPage" });
      shell.appendChild(wrap);
      renderProfilePage(wrap);
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

    // Persistent Quality Check strip — always visible while in the
    // builder so SEs see issues before reaching the export step.
    renderQualityFooter(shell);

    // Resume the tour's builder segment after the home hand-off.
    if (app.tour.resumeOnBuilder) {
      app.tour.resumeOnBuilder = false;
      setTimeout(function () { startTour("builder"); }, 0);
    }
  }

  function renderQualityFooter(shell) {
    if (!VALIDATE_STORY || !app.state) return;
    const result = VALIDATE_STORY.validateGeneratedStoryAndSlides(app.state);
    const { errors = 0, warnings = 0 } = result.summary || {};

    const cls  = "bx-quality-footer" + (errors ? " has-errors" : warnings ? " has-warnings" : " is-clean");
    const tone = "bx-quality-dot " + (errors ? "tone-red" : (warnings ? "tone-gold" : "tone-good"));
    const text = errors  ? errors + " issue" + (errors === 1 ? "" : "s") + " to fix"
               : warnings? warnings + " warning" + (warnings === 1 ? "" : "s")
                         : "Story looks healthy";

    // Update in place across re-renders instead of removing + re-appending
    // the footer on every shell render (it lives on document.body and was
    // thrashing the DOM each keystroke). Only the class + text vary.
    let footer = $("#bxQualityFooter");
    if (footer && footer.parentNode) {
      const dot = footer.querySelector(".bx-quality-dot");
      const txt = footer.querySelector(".bx-quality-text");
      if (footer.className !== cls) footer.className = cls;
      if (dot && dot.className !== tone) dot.className = tone;
      if (txt && txt.textContent !== text) txt.textContent = text;
      return;
    }

    footer = el("button", {
      id: "bxQualityFooter",
      class: cls,
      "aria-label": "Open Story Quality Check",
    });
    footer.appendChild(el("span", { class: tone }));
    footer.appendChild(el("span", { class: "bx-quality-text", text: text }));
    footer.appendChild(el("span", { class: "bx-quality-cta", text: "Run Story Quality Check →" }));
    footer.addEventListener("click", function () { openStoryQualityModal(); });
    document.body.appendChild(footer);
  }

  // ─── BUILDER: stepper ─────────────────────────────────────────
  function renderStepper() {
    const list = $("#bxStepList");
    list.innerHTML = "";
    STEPS.forEach(function (s) {
      const isActive = s.id === app.state.step;
      const status = stepStatus(s.id);
      const isLocked = status.state === "locked";
      const cls = "bx-step bx-step-" + status.state +
                  (isActive ? " is-active" : "") +
                  (isLocked ? " is-locked" : "");
      const li = el("li", {
        class: cls,
        "aria-current": isActive ? "step" : undefined,
        on: {
          click: function () {
            if (isLocked) {
              toast(status.lockReason || "Complete the previous step first");
              return;
            }
            app.state.step = s.id;
            renderShell();
            commit();
          },
        },
      }, [
        el("div", { class: "bx-step-num " + status.numClass, text: status.numText || s.num }),
        el("div", { class: "bx-step-meta" }, [
          el("div", { class: "bx-step-label", text: s.label }),
          el("div", { class: "bx-step-help", text: s.help }),
          el("div", { class: "bx-step-status bx-step-status-" + status.state, text: status.label }),
        ]),
      ]);
      list.appendChild(li);
    });
  }

  // ─── Step status engine ───────────────────────────────────────
  // Returns { state, label, numText, numClass, lockReason }
  // Possible states: not-started | needs-input | ready | generated
  //                  | review-needed | complete | optional | locked
  function stepStatus(id) {
    const s = app.state;
    if (!s) return { state: "not-started", label: "Not started" };

    const setupReady = !!(s.project.customerName && s.project.industry && s.project.audience && s.project.salesStage && (s.project.products || []).length);
    const hasScript      = !!(s.scriptText && s.scriptText.trim().length > 50);
    const foundationsHaveContent = !!(s.storyFoundations && (s.storyFoundations.businessProblem || s.storyFoundations.futureStateVision));
    const hasPersona     = (s.personas || []).length > 0;
    const hasActs        = (s.storyActs || []).length > 0;
    const slideCount     = (s.slides || []).length;
    const hasCx          = (s.cxComponents || []).length > 0;
    const hasSelections  = Object.keys(s.selectedRecIds || {}).filter(function (k) { return s.selectedRecIds[k]; }).length > 0;

    if (id === "connect") {
      const creds = getAubreyGlobalKeys();
      const haveAny = !!(creds.demoforgeKey || creds.scriptwriterKey || creds.pocketsicKey);
      if (haveAny) return st("complete", "Connected");
      return st("optional", "Optional");
    }
    if (id === "setup") {
      if (!s.project.customerName) return st("needs-input", "Add customer details");
      if (!setupReady)              return st("needs-input", "Needs input");
      return st("complete", "Complete");
    }
    if (id === "script") {
      // Script step is unlocked from the start now — Aubrey-driven
      // projects can land here directly from Connect without filling
      // out Setup first. (Setup still gates downstream recommendations.)
      if (!s.scriptText) return st("not-started", "Not started");
      if (!hasScript)    return st("needs-input", "Script too short");
      return st("complete", "Script captured");
    }
    if (id === "foundations") {
      if (!hasScript) return locked("Paste a script first");
      if (!foundationsHaveContent) return st("review-needed", "Run extract to populate");
      return st("generated", "Extracted from script");
    }
    if (id === "cx") {
      // Treated as optional — never locks downstream.
      if (hasCx)            return st("complete", (s.cxComponents.length) + " linked");
      if (s._cxSkipped)     return st("optional", "Skipped");
      return st("optional", "Optional");
    }
    if (id === "recs") {
      if (!foundationsHaveContent && !hasSelections && !slideCount) return locked("Review Story Foundations first");
      if (!slideCount) return st("review-needed", "Build slide plan");
      return st("complete", slideCount + " slides selected");
    }
    if (id === "assets") {
      const relevant = relevantAssetItems(s);
      if (relevant.length === 0) return st("optional", "No assets needed");
      const filled = relevant.filter(function (it) {
        if (it.slot === "brand.logoPath") return !!(s.brand && s.brand.logoPath);
        return !!(s.assetLibrary && s.assetLibrary[it.slot]);
      }).length;
      if (filled === 0) return st("optional", "Optional");
      if (filled < relevant.length) return st("review-needed", filled + " of " + relevant.length + " added");
      return st("complete", "All assets added");
    }
    if (id === "preview") {
      if (!slideCount) return locked("Build a slide plan first");
      return st("ready", "Ready to review");
    }
    if (id === "export") {
      if (!slideCount) return locked("Build a slide plan first");
      return st("ready", "Ready to export");
    }
    return st("not-started", "Not started");

    function st(state, label) {
      return { state: state, label: label, numText: numFor(state), numClass: classFor(state) };
    }
    function locked(reason) {
      return { state: "locked", label: "Locked", lockReason: reason, numText: "🔒", numClass: "is-locked" };
    }
    function numFor(state) {
      if (state === "complete" || state === "generated") return "✓";
      if (state === "ready")     return "→";
      if (state === "optional")  return "—";
      return null; // use default number
    }
    function classFor(state) {
      return ({
        "complete":      "is-complete",
        "generated":     "is-complete",
        "review-needed": "is-warn",
        "needs-input":   "is-warn",
        "ready":         "is-ready",
        "optional":      "is-optional",
        "not-started":   "is-default",
        "locked":        "is-locked",
      })[state] || "is-default";
    }
  }

  // ─── BUILDER: main + side ─────────────────────────────────────
  function renderMain() {
    const main = $("#bxMain");
    main.innerHTML = "";
    // Migrate any legacy state.step values (older projects had "story";
    // "narrative" was removed when Recommended Narrative was retired).
    if (app.state.step === "story") app.state.step = "script";
    if (app.state.step === "narrative") app.state.step = "recs";
    const step = app.state.step;
    if      (step === "connect")     main.appendChild(viewConnect());
    else if (step === "setup")       main.appendChild(viewSetup());
    else if (step === "script")      main.appendChild(viewScript());
    else if (step === "foundations") main.appendChild(viewFoundations());
    else if (step === "cx")          main.appendChild(viewCxComponents());
    else if (step === "recs")        main.appendChild(viewRecommendations());
    else if (step === "assets")      main.appendChild(viewAssets());
    else if (step === "preview")     main.appendChild(viewPreview());
    else if (step === "export")      main.appendChild(viewExport());
    else                             main.appendChild(viewSetup());
    maybeStepGuide(step);
  }

  // Per-step contextual onboarding — a one-time tip the FIRST time each step
  // is opened (device-level, once ever; see stepTipSeen). Each anchors to the
  // step's primary element so the tip points at it (coach-mark); a missing
  // anchor falls back to a centered modal. Short, skippable, never blocking.
  const STEP_TIPS = {
    connect: {
      anchor: "#bxMain .bx-card-feature",
      title: "Connect (optional)",
      lines: [
        "Aubrey is an optional shortcut that can pre-fill your script, foundations, and CX screens.",
        "Everything in the builder also works entirely by hand — skip this step any time.",
      ],
    },
    script: {
      anchor: "#bxMain .bx-card-feature",
      title: "Add your script",
      lines: [
        "Paste a demo script, or upload a PDF/DOCX. We extract the customer, persona, products, acts, and value drivers automatically.",
        "Nothing is sent anywhere — extraction happens locally in your browser.",
      ],
    },
    setup: {
      anchor: "#bxMain .bx-card",
      title: "Welcome to the Holodeck Builder",
      lines: [
        "You'll turn a demo script into a runnable, customer-branded Salesforce demo in nine quick steps.",
        "Start by setting the customer, audience, and products here. The right-hand panel keeps live suggestions as you go.",
      ],
    },
    foundations: {
      anchor: "#bxMain .bx-extract-card",
      title: "Review the extracted story",
      lines: [
        "This is the narrative, persona, acts, and value drivers we pulled from your script.",
        "Edit anything that's off — these foundations drive every slide downstream.",
      ],
    },
    cx: {
      anchor: "#bxMain .bx-card",
      title: "iFrame CX Components (optional)",
      lines: [
        "These are live, click-through demo screens embedded via an iFrame — not images. Link an Aubrey scene (or a URL) to drop the real interactive screen into the deck.",
        "Static imagery is handled separately on the Assets step — including the still images these CX slots fall back to. Skip a component and its slide shows a clean, brand-styled placeholder.",
      ],
    },
    recs: {
      anchor: "#bxMain .bx-rec-gcard",
      title: "Choosing slides",
      lines: [
        "These recommendations come straight from your script. Toggle any slide off to drop it from the demo and the preview.",
      ],
    },
    assets: {
      anchor: "#bxMain .bx-asset-row",
      title: "About assets",
      lines: [
        "Assets are shared by slot, not per slide. Each slot below lists the slides it feeds.",
        "Scroll to the CX imagery section to pick which still image backs each iFrame CX Component (a still shows whenever the live embed can't load).",
        "Skip any slot and that slide shows a clean, brand-styled placeholder instead — your demo always renders.",
      ],
    },
    preview: {
      anchor: "#bxMain .bx-preview-summary",
      title: "Preview & deep-links",
      lines: [
        "This is the exact deck you'll export. In the exported demo you can navigate with arrow keys, jump between sections, and deep-link to any slide via the URL hash.",
      ],
    },
    export: {
      anchor: "#bxMain .bx-card-feature",
      title: "Export your demo",
      lines: [
        "Download a self-contained ZIP you can host anywhere, or copy the config to regenerate later.",
      ],
    },
  };
  function maybeStepGuide(step) {
    const tip = STEP_TIPS[step];
    if (!tip) return;
    const body = el("div", {}, tip.lines.map(function (t) { return el("p", { text: t }); }));
    guide("intro-" + step, tip.title, body, tip.anchor, "device");
  }

  function renderSide() {
    const title = $("#bxSideTitle");
    const sub   = $("#bxSideSub");
    const body  = $("#bxSideBody");
    body.innerHTML = "";
    const step = app.state.step;
    if (step === "connect") {
      title.textContent = "Quick start";
      sub.textContent = "Aubrey-driven projects need almost no typing";
      sideConnectHint(body);
      return;
    }
    if (step === "setup" || step === "script" || step === "foundations") {
      title.textContent = "Live Suggestions";
      sub.textContent = "We'll keep this updated as you fill things in";
      sideSuggestions(body);
    } else if (step === "recs") {
      title.textContent = "Selected so far";
      sub.textContent = countSelected() + " slides included";
      sideSelectedSummary(body);
    } else if (step === "preview") {
      title.textContent = "Plan health";
      sub.textContent = "Missing inputs surface here";
      sidePlanHealth(body);
    } else if (step === "cx") {
      title.textContent = "CX Components";
      sub.textContent = ((app.state.cxComponents || []).length) + " linked so far";
      sideCxSummary(body);
    } else if (step === "assets") {
      const lib = app.state.assetLibrary || {};
      const filled = Object.keys(lib).filter(function (k) { return lib[k]; }).length;
      title.textContent = "Assets";
      sub.textContent = filled
        ? filled + " uploaded so far"
        : "Upload anything you want to ship with the demo";
      sideAssetSummary(body);
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
      "Step 1 · Setup",
      "Set up the customer demo",
      "Add the basic customer, audience, and Salesforce product context so the builder can recommend the right story structure. Two minutes here saves twenty later."
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
    // Show a hint when products were auto-ticked from a script pull.
    // Only shows ones still ticked (so a manual uncheck makes it disappear).
    const autoTicked = (s._aubreyAutoTickedProducts || []).filter(function (p) {
      return (s.project.products || []).indexOf(p) !== -1;
    });
    if (autoTicked.length) {
      c2.appendChild(el("div", { class: "bx-help bx-mt-12",
        text: "✨ Auto-detected from Aubrey script: " + autoTicked.join(", ") +
              ". Uncheck anything that doesn't fit." }));
    }
    wrap.appendChild(c2);

    // Brand
    const c3 = el("div", { class: "bx-card" });
    const c3Head = el("div", { class: "bx-row bx-row-between" });
    const c3HeadL = el("div");
    c3HeadL.appendChild(el("div", { class: "bx-card-title", text: "Brand" }));
    c3HeadL.appendChild(el("div", { class: "bx-card-sub", text: "These flow into the generated config's brand block." }));
    c3Head.appendChild(c3HeadL);
    c3Head.appendChild(btn("✨ Pull brand from Aubrey", "bx-btn-secondary",
      function () { openAubreyBrandPicker(); }));
    c3.appendChild(c3Head);

    // Branding mode — how the demo reads: pure Salesforce, the customer's
    // world, or both co-branded. Default "salesforce" keeps old demos identical.
    const brandMode = s.brand.mode || "salesforce";
    const modeWrap = el("div", { class: "bx-field" });
    const modeLabel = el("label", { class: "bx-label", text: "Branding mode" });
    modeLabel.appendChild(el("span", { class: "bx-help-inline",
      text: "(how the demo lockup reads)" }));
    modeWrap.appendChild(modeLabel);
    const modeRow = el("div", { class: "bx-chips" });
    [
      { v: "salesforce", t: "Salesforce", h: "Salesforce-branded throughout" },
      { v: "customer", t: "Customer", h: "Lead with the customer's world" },
      { v: "cobrand", t: "Co-brand", h: "Salesforce + customer together" },
    ].forEach(function (o) {
      const c = el("button", { type: "button",
        class: "bx-chip" + (brandMode === o.v ? " is-on tone-blue" : ""),
        text: o.t, title: o.h });
      c.addEventListener("click", function () {
        s.brand.mode = o.v; commit(); renderMain(); renderSide();
      });
      modeRow.appendChild(c);
    });
    modeWrap.appendChild(modeRow);
    c3.appendChild(modeWrap);

    const grid3 = el("div", { class: "bx-grid-3" });
    grid3.appendChild(field({ label: "Primary color", type: "color", value: s.brand.primaryColor,
      onInput: function (v) { s.brand.primaryColor = v; commit(); } }));
    grid3.appendChild(field({ label: "Secondary color", type: "color", value: s.brand.secondaryColor,
      onInput: function (v) { s.brand.secondaryColor = v; commit(); } }));
    grid3.appendChild(field({ label: "Accent color", type: "color", value: s.brand.accentColor,
      onInput: function (v) { s.brand.accentColor = v; commit(); } }));
    c3.appendChild(grid3);
    // Logo: text path OR direct file upload (embedded as a data URL so it
    // travels with the project — no need to drop a file in demo/assets/ first).
    const logoWrap = el("div", { class: "bx-field" });
    const logoLabel = el("label", { class: "bx-label", text: "Logo" });
    logoLabel.appendChild(el("span", { class: "bx-help-inline",
      text: "(upload a file or paste a path)" }));
    logoWrap.appendChild(logoLabel);
    const logoRow = el("div", { class: "bx-color-row" });
    const logoText = el("input", { type: "text", class: "bx-input",
      placeholder: "e.g. assets/acme-logo.png", value: s.brand.logoPath || "" });
    logoText.addEventListener("input", function () {
      s.brand.logoPath = logoText.value; commit();
    });
    const logoFile = el("input", { type: "file", accept: "image/*",
      class: "bx-file-input", "aria-label": "Upload logo file" });
    logoFile.addEventListener("change", function () {
      const f = logoFile.files && logoFile.files[0];
      if (!f) return;
      const mb = f.size / (1024 * 1024);
      const sizeNote = mb > 8 ? " (" + mb.toFixed(1) + "MB — config will be larger)" : "";
      const reader = new FileReader();
      reader.onload = function () {
        s.brand.logoPath = String(reader.result || "");
        logoText.value = s.brand.logoPath;
        commit();
        toast("Logo uploaded" + sizeNote);
      };
      reader.onerror = function () { toast("Could not read that file"); };
      reader.readAsDataURL(f);
    });
    logoRow.appendChild(logoText);
    logoRow.appendChild(logoFile);
    logoWrap.appendChild(logoRow);
    c3.appendChild(logoWrap);

    // Customer logo — only meaningful when the demo leads with (or co-brands)
    // the customer. Hidden in pure-Salesforce mode so nothing changes there.
    if (brandMode !== "salesforce") {
      const custWrap = el("div", { class: "bx-field" });
      const custLabel = el("label", { class: "bx-label", text: "Customer logo" });
      custLabel.appendChild(el("span", { class: "bx-help-inline",
        text: brandMode === "cobrand"
          ? "(shown alongside Salesforce)"
          : "(leads the demo lockup)" }));
      custWrap.appendChild(custLabel);
      const custRow = el("div", { class: "bx-color-row" });
      const custText = el("input", { type: "text", class: "bx-input",
        placeholder: "e.g. assets/customer-logo.png", value: s.brand.customerLogoPath || "" });
      custText.addEventListener("input", function () {
        s.brand.customerLogoPath = custText.value; commit();
      });
      const custFile = el("input", { type: "file", accept: "image/*",
        class: "bx-file-input", "aria-label": "Upload customer logo file" });
      custFile.addEventListener("change", function () {
        const f = custFile.files && custFile.files[0];
        if (!f) return;
        const mb = f.size / (1024 * 1024);
        const sizeNote = mb > 8 ? " (" + mb.toFixed(1) + "MB — config will be larger)" : "";
        const reader = new FileReader();
        reader.onload = function () {
          s.brand.customerLogoPath = String(reader.result || "");
          custText.value = s.brand.customerLogoPath;
          commit();
          toast("Customer logo uploaded" + sizeNote);
        };
        reader.onerror = function () { toast("Could not read that file"); };
        reader.readAsDataURL(f);
      });
      custRow.appendChild(custText);
      custRow.appendChild(custFile);
      custWrap.appendChild(custRow);
      c3.appendChild(custWrap);
    }

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

  // ═══════════════════════════════════════════════════════════════
  //  Shared script-extraction helper (used by Step 2 + Step 3)
  //  Single source of truth: same parser pipeline, same logging,
  //  same toast messages on success / failure.
  // ═══════════════════════════════════════════════════════════════
  function runScriptExtraction() {
    const s = app.state;
    if (window.HOLO_DEBUG) console.log("[holo] SCRIPT_INPUT_RECEIVED", { length: (s.scriptText || "").length, source: "extract-button" });
    if (!PARSER) { toast("Story parser is not loaded — check your install"); return false; }
    if (!s.scriptText || !s.scriptText.trim()) {
      toast("Script text is empty — paste a script first");
      app.state.step = "script"; renderShell();
      return false;
    }
    let f;
    try {
      if (window.HOLO_DEBUG) console.log("[holo] PARSER_CALLED extractStoryFoundations", { length: s.scriptText.length });
      f = PARSER.extractStoryFoundations(s.scriptText, s);
    } catch (e) {
      toast("Parser threw: " + e.message);
      return false;
    }
    // Act-only labeled scripts (ACT 1/2/3 with no Synopsis) still carry
    // signal — accept them if acts will be extracted below.
    const willHaveActs = !(s.storyActs || []).length
      && (PARSER.extractScriptActs(s.scriptText).length
        || PARSER.extractStoryActsFromScript(s.scriptText).length);
    if (!f || (!f.businessProblem && !willHaveActs)) {
      toast("Parser ran but found no story signals — check the script has a Problem/Plot, Synopsis, ACT blocks, or numbered steps");
      return false;
    }
    if (window.HOLO_DEBUG) console.log("[holo] PARSER_RESULT", {
      businessProblem: f.businessProblem.slice(0, 60),
      valueDrivers: f.valueDrivers.length,
      agentforceMoments: f.agentforceMoments.length,
      dataCloudMoments: f.dataCloudMoments.length,
    });
    return applyExtractionToState(f, s);
  }

  // ─── Apply a parsed packet (regex OR Gemini) to builder state ──
  // Single source of truth for turning an `extracted` foundations
  // object into populated state. The acts/persona/customer/product
  // steps only fill gaps — when a caller (e.g. the Gemini parser)
  // has already populated s.storyActs / s.personas / customerName /
  // products, the script-based extractors below are skipped, so the
  // richer structured result wins.
  function applyExtractionToState(f, s) {
    PARSER.mergeExtractedStoryIntoState(f, s);
    s.project = s.project || {};

    // ── Story acts (prefer labeled ACT blocks, fall back to steps) ──
    if (!(s.storyActs || []).length) {
      let acts = PARSER.extractScriptActs(s.scriptText);
      if (!acts.length) acts = PARSER.extractStoryActsFromScript(s.scriptText);
      s.storyActs = acts.map(function (a) { return Object.assign({ id: uid("act_") }, a); });
    }

    // ── Primary persona (only when none exist yet) ──
    if (!(s.personas || []).length) {
      const ppl = PARSER.extractPersonasFromScript(s.scriptText);
      if (ppl.length) {
        s.personas = ppl.map(function (p) { return Object.assign({ id: uid("persona_") }, p); });
      } else {
        // Fallback: the older "Persona Description:" header form.
        const desc = PARSER.extractPersonaDescription(s.scriptText);
        if (desc) {
          const name = (desc.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/) || [, ""])[1];
          s.personas.push({
            id: uid("persona_"),
            name: name || "",
            role: "", goals: "", painPoints: "",
            demoRelevance: desc,
          });
        }
      }
    }

    // ── Customer name (don't clobber; exclude the persona first name
    //    so "Sarah's" isn't mistaken for the customer) ──
    if (!s.project.customerName) {
      const persona0 = (s.personas && s.personas[0]) || null;
      const cust = PARSER.extractCustomerName(s.scriptText, persona0 && persona0.name);
      if (cust) s.project.customerName = cust;
    }

    // ── Products (merge into the canonical list, no clobber) ──
    s.project.products = s.project.products || [];
    const newProducts = [];
    (PARSER.extractProducts(s.scriptText) || []).forEach(function (p) {
      if (s.project.products.indexOf(p) === -1) { s.project.products.push(p); newProducts.push(p); }
    });

    recompute();
    commit();
    const vdCount = (s.storyFoundations && s.storyFoundations.valueDrivers || []).length;
    const custNote = s.project.customerName ? (" · " + s.project.customerName) : "";
    const prodNote = newProducts.length ? (" · " + newProducts.length + " product" + (newProducts.length === 1 ? "" : "s")) : "";
    toast("Foundations extracted — " + vdCount + " value drivers, "
          + s.storyActs.length + " acts, " + s.personas.length + " persona" + (s.personas.length === 1 ? "" : "s")
          + custNote + prodNote);
    return true;
  }

  // ─── BETA: Gemini-powered script extraction ───────────────────
  // An AI alternative to the regex parser for messier scripts. Asks
  // Gemini to parse the script into the storyFoundations shape (plus
  // acts/personas/customer/products), then funnels the result through
  // the SAME applyExtractionToState pipeline the manual button uses.
  // The manual extractor stays the reliable default; this is opt-in.
  function runGeminiScriptExtraction(button, status) {
    const GEMINI = window.HOLO_GEMINI;
    const AI_PROMPT = window.HOLO_AI_PROMPT;
    const s = app.state;
    if (!GEMINI || !AI_PROMPT) { toast("Gemini is not available"); return; }
    if (!PARSER) { toast("Story parser is not loaded — check your install"); return; }
    if (!s.scriptText || !s.scriptText.trim()) {
      toast("Script text is empty — paste a script first");
      return;
    }

    if (status) status.innerHTML = "";
    const origText = button.textContent;
    button.disabled = true;
    button.textContent = "Parsing with Gemini…";

    // A single long call, so an animated (indeterminate) bar is the
    // honest representation. Lives in the status div; cleared on the
    // success render or replaced by the error alert below.
    let pb = null;
    if (status) {
      pb = progressBar("Parsing your script with Gemini…");
      pb.indeterminate("Parsing your script with Gemini…");
      status.appendChild(pb.node);
    }
    const clearBar = function () { if (pb && pb.node.parentNode) pb.node.parentNode.removeChild(pb.node); };

    const showErr = function (msg) {
      clearBar();
      if (status) status.appendChild(el("div", { class: "bx-alert is-error", text: "Gemini: " + msg }));
      else toast("Gemini: " + msg);
    };

    GEMINI.generate({
      prompt: AI_PROMPT.getStoryParsePrompt(s.scriptText),
      jsonMode: true,
      fast: true,            // disable the model's thinking pass — big latency win
      temperature: 0.2,      // extraction is deterministic, not creative
      maxOutputTokens: 4096, // comfortably covers the storyFoundations JSON
    })
      .then(function (text) {
        const cleaned = String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
        let data;
        try { data = JSON.parse(cleaned); }
        catch (_) { showErr("returned text that wasn't valid JSON — try the manual extractor."); return; }
        if (!data || typeof data !== "object") { showErr("returned an unexpected shape."); return; }

        // Coerce into the storyFoundations shape mergeExtractedStory-
        // IntoState expects — every array MUST exist (it calls .join
        // on several), and strings must be strings.
        const str = function (v) { return typeof v === "string" ? v : ""; };
        const arr = function (v) { return Array.isArray(v) ? v.filter(function (x) { return x != null && x !== ""; }) : []; };
        const f = {
          businessProblem:      str(data.businessProblem),
          currentStatePain:     str(data.currentStatePain),
          futureStateVision:    str(data.futureStateVision),
          primaryNarrative:     str(data.primaryNarrative),
          transformationThesis: str(data.transformationThesis),
          executiveTakeaway:    str(data.executiveTakeaway),
          threeActTitles:       arr(data.threeActTitles),
          customerMoments:      arr(data.customerMoments),
          operationalMoments:   arr(data.operationalMoments),
          agentforceMoments:    arr(data.agentforceMoments),
          dataCloudMoments:     arr(data.dataCloudMoments),
          commerceMoments:      arr(data.commerceMoments),
          marketingMoments:     arr(data.marketingMoments),
          serviceMoments:       arr(data.serviceMoments),
          loyaltyMoments:       arr(data.loyaltyMoments),
          valueDrivers:         arr(data.valueDrivers),
          assumptions:          arr(data.assumptions),
          openQuestions:        arr(data.openQuestions),
        };

        // Pre-populate acts/personas/customer/products from the
        // Gemini result so applyExtractionToState's regex fallbacks
        // are skipped and the structured output wins.
        s.project = s.project || {};
        const acts = arr(data.storyActs);
        if (acts.length && !(s.storyActs || []).length) {
          s.storyActs = acts.map(function (a) {
            return {
              id: uid("act_"),
              title: str(a && a.title), persona: str(a && a.persona), channel: str(a && a.channel),
              summary: str(a && a.summary), demoMoment: str(a && a.demoMoment),
              salesforceCapabilities: str(a && a.salesforceCapabilities),
              businessValue: str(a && a.businessValue),
              requiredAssets: str(a && a.requiredAssets), notes: str(a && a.notes),
            };
          });
        }
        const ppl = arr(data.personas);
        if (ppl.length && !(s.personas || []).length) {
          s.personas = ppl.map(function (p) {
            return {
              id: uid("persona_"),
              name: str(p && p.name), role: str(p && p.role), goals: str(p && p.goals),
              painPoints: str(p && p.painPoints), demoRelevance: str(p && p.demoRelevance),
            };
          });
        }
        if (!s.project.customerName && str(data.customerName) && !/^\[TODO/i.test(data.customerName)) {
          s.project.customerName = str(data.customerName);
        }

        // ─── Setup-field gap-fills (Gemini-only) ─────────────────
        // Fill Step-1 Setup fields the parser could infer, but only
        // where the SE hasn't already typed a value (never clobber).
        // Constrained dropdowns must match an allowed value exactly
        // (case-insensitive, normalized) or we leave them blank.
        const pickAllowed = function (value, list) {
          const v = String(value || "").trim().toLowerCase();
          if (!v) return "";
          const hit = list.filter(function (opt) { return opt.toLowerCase() === v; })[0];
          return hit || "";
        };
        const free = function (v) {
          const s2 = str(v).trim();
          return (!s2 || /^\[TODO/i.test(s2)) ? "" : s2;
        };
        if (!s.project.website)    { const w = free(data.website); if (w) s.project.website = w; }
        if (!s.project.theme)      { const t = free(data.theme);   if (t) s.project.theme = t; }
        if (!s.project.industry)   { const x = pickAllowed(data.industry,   INDUSTRIES); if (x) s.project.industry = x; }
        if (!s.project.audience)   { const x = pickAllowed(data.audience,   AUDIENCES);  if (x) s.project.audience = x; }
        if (!s.project.salesStage) { const x = pickAllowed(data.salesStage, STAGES);     if (x) s.project.salesStage = x; }
        if (!s.project.tone)       { const x = pickAllowed(data.tone,       TONES);      if (x) s.project.tone = x; }

        // products[] — intersect with the allowed PRODUCTS chips so
        // the multi-select stays valid; gap-fill without duplicates.
        if (Array.isArray(data.products)) {
          s.project.products = s.project.products || [];
          arr(data.products).forEach(function (p) {
            const match = pickAllowed(p, PRODUCTS);
            if (match && s.project.products.indexOf(match) === -1) s.project.products.push(match);
          });
        }

        if (!f.businessProblem && !(s.storyActs || []).length) {
          showErr("couldn't find a business problem or any acts in the script.");
          return;
        }

        applyExtractionToState(f, s);
        app.state.step = "foundations";
        renderShell();
      })
      .catch(function (err) {
        showErr((err && err.message) || String(err));
      })
      .then(function () {
        button.disabled = false;
        button.textContent = origText;
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 2: SCRIPT & STORY
  //  One job: capture the script. Personas + acts live here too
  //  because they often need manual edits even after extraction.
  // ═══════════════════════════════════════════════════════════════
  function viewScript() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 2 · Script & Story",
      "Add your demo script",
      "Paste or upload the rough demo story. The builder extracts the narrative, personas, journey moments, and business value automatically."
    ));
    const s = app.state;

    // ── Paste / Upload card ──────────────────────────────────
    const c = el("div", { class: "bx-card bx-card-feature" });
    c.appendChild(el("div", { class: "bx-card-title", text: "Paste your demo script" }));
    c.appendChild(el("div", { class: "bx-card-sub", text: "Nothing is sent anywhere — extraction happens locally in your browser. The more structure your script has (Script Synopsis, CX Summary, numbered journey steps), the better the result." }));
    c.appendChild(field({
      label: "Script text",
      type: "textarea",
      large: true,
      placeholder: "Paste a rough demo script, story outline, or transcript here…",
      value: s.scriptText,
      onInput: function (v) { s.scriptText = v; recompute(); renderSide(); commit(); },
    }));
    // Upload-from-file shortcut. Text/PDF/DOCX are all extracted to
    // plain text locally in the browser via HOLO_DOC_EXTRACT.
    const EXTRACT = window.HOLO_DOC_EXTRACT;
    const accept = (EXTRACT && EXTRACT.ACCEPT) || ".txt,.md,.json";
    const uploadRow = el("div", { class: "bx-row bx-mt-12 bx-row-center" });
    const fileLabel = el("label", { class: "bx-btn bx-btn-secondary", text: "📎 Upload from file" });
    const fileInput = el("input", { type: "file", style: "display: none;", accept: accept });
    fileInput.addEventListener("change", function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const isDoc = /\.(pdf|docx)$/i.test(f.name);
      if (isDoc) { fileLabel.classList.add("is-loading"); fileLabel.textContent = "Reading " + f.name + "…"; }
      const done = function () {
        fileLabel.classList.remove("is-loading");
        fileLabel.textContent = "📎 Upload from file";
        fileInput.value = ""; // allow re-picking the same file
      };
      const handle = EXTRACT
        ? EXTRACT.extract(f)
        : new Promise(function (res, rej) {
            const r = new FileReader();
            r.onload = function () { res({ text: String(r.result || "") }); };
            r.onerror = function () { rej(r.error); };
            r.readAsText(f);
          });
      handle.then(function (result) {
        const text = (result && result.text) || "";
        if (!text.trim()) {
          done();
          toast("No text found in " + f.name + " — try pasting it instead");
          return;
        }
        s.scriptText = text;
        recompute(); commit(); renderShell();
        toast("Loaded " + f.name);
      }).catch(function (err) {
        done();
        const msg = (err && err.__soft && err.message) || ("Couldn't read " + f.name + " — paste the text instead");
        toast(msg);
      });
    });
    fileLabel.appendChild(fileInput);
    uploadRow.appendChild(fileLabel);
    uploadRow.appendChild(btn("✨ Pull script from Aubrey", "bx-btn-secondary",
      function () { openAubreyScriptPicker(); }));
    uploadRow.appendChild(el("div", { class: "bx-help bx-help-inline", text: "or drop in a .txt, .md, .json, .pdf, or .docx file" }));
    c.appendChild(uploadRow);

    // Live signal preview
    if (s.scriptText) {
      const sigs = RULES.extractScriptSignals(s.scriptText);
      const keys = Object.keys(sigs);
      if (keys.length) {
        c.appendChild(el("div", { class: "bx-help bx-mt-12", text: "Signals detected in your script:" }));
        const row = el("div", { class: "bx-row bx-mt-6" });
        keys.sort(function (a, b) { return sigs[b] - sigs[a]; }).forEach(function (k) {
          row.appendChild(el("div", { class: "bx-rec-pill tone-good", text: k + " · " + sigs[k] }));
        });
        c.appendChild(row);
      }
    }
    wrap.appendChild(c);

    // ── Extract action ──────────────────────────────────────
    const action = el("div", { class: "bx-card bx-extract-card" });
    action.appendChild(el("div", { class: "bx-card-title", text: "Extract Story Foundations" }));
    action.appendChild(el("div", { class: "bx-card-sub",
      text: s.scriptText
        ? "Run the parser on your script to generate the business problem, future-state vision, story acts, personas, and value drivers."
        : "Paste a script above first, then click Extract." }));
    const extractRow = el("div", { class: "bx-row bx-mt-12" }, [
      btn("✨ Extract Story Foundations", "bx-btn-primary", function () {
        if (runScriptExtraction()) {
          app.state.step = "foundations";
          renderShell();
        }
      }),
    ]);
    action.appendChild(extractRow);

    // ── BETA: AI parse with Gemini (manual extractor stays the
    //    default). Shown only when the server has a Gemini key. ──
    const GEMINI = window.HOLO_GEMINI;
    if (GEMINI && window.HOLO_AI_PROMPT) {
      const geminiExtractBtn = btn("✦ Extract with Gemini (BETA)", "bx-btn-secondary", function () {
        runGeminiScriptExtraction(geminiExtractBtn, geminiExtractStatus);
      });
      geminiExtractBtn.style.display = "none";
      const betaPill = el("span", { class: "bx-rec-pill tone-gold", text: "BETA", style: "display: none; margin-left: 8px;" });
      const geminiExtractStatus = el("div", { class: "bx-mt-12" });
      extractRow.appendChild(geminiExtractBtn);
      extractRow.appendChild(betaPill);
      action.appendChild(el("div", { class: "bx-help bx-mt-6", id: "bxGeminiBetaNote",
        text: "Beta — uses AI to parse messier scripts. Review the results; the manual extractor above is still the reliable default.",
        style: "display: none;" }));
      const betaNote = action.querySelector("#bxGeminiBetaNote");
      action.appendChild(geminiExtractStatus);
      GEMINI.isConfigured().then(function (ok) {
        if (!ok) return;
        geminiExtractBtn.style.display = "";
        betaPill.style.display = "";
        if (betaNote) betaNote.style.display = "";
      });
    }
    wrap.appendChild(action);

    // ── Personas ───────────────────────────────────────────
    const personasCard = el("div", { class: "bx-card" });
    personasCard.appendChild(el("div", { class: "bx-card-title", text: "Personas" }));
    personasCard.appendChild(el("div", { class: "bx-card-sub", text: "Who is the demo about? One persona is usually enough." }));
    const personaList = el("div", { class: "bx-list" });
    if (!s.personas.length) {
      personaList.appendChild(el("div", { class: "bx-empty",
        html: "No personas yet. They'll be auto-added after extraction, or <strong>add one manually</strong> below." }));
    }
    s.personas.forEach(function (p, idx) { personaList.appendChild(personaItem(p, idx)); });
    personasCard.appendChild(personaList);
    const personaActions = el("div", { class: "bx-row bx-mt-12" });
    const addPersona = el("button", { class: "bx-add-btn", text: "+ Add persona" });
    addPersona.addEventListener("click", function () {
      s.personas.push({ id: uid("persona_"), name: "", role: "", goals: "", painPoints: "", demoRelevance: "" });
      recompute(); renderMain(); commit();
    });
    personaActions.appendChild(addPersona);
    personaActions.appendChild(btn("✨ Pull persona from Aubrey", "bx-btn-secondary",
      function () { openAubreyPersonaPicker(); }));
    personasCard.appendChild(personaActions);
    wrap.appendChild(personasCard);

    // ── Story acts ─────────────────────────────────────────
    const actsCard = el("div", { class: "bx-card" });
    actsCard.appendChild(el("div", { class: "bx-card-title", text: "Journey acts" }));
    actsCard.appendChild(el("div", { class: "bx-card-sub", text: "Three to five acts is the sweet spot. Each act becomes a slide moment downstream." }));
    const actList = el("div", { class: "bx-list" });
    if (!s.storyActs.length) {
      actList.appendChild(el("div", { class: "bx-empty",
        html: "No acts yet. They'll be auto-extracted from numbered script steps. Or try a simple frame like <strong>Discover → Engage → Recover → Convert</strong>." }));
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

    wrap.appendChild(stepFooter("script"));
    return wrap;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 3: STORY FOUNDATIONS
  //  A clean review panel grouped into Core Narrative / Key Moments
  //  / Business Value. Every field shows "Extracted" or "Missing"
  //  with a clear hint about how to fix it.
  // ═══════════════════════════════════════════════════════════════
  function viewFoundations() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 3 · Story Foundations",
      "Review the extracted story",
      "These are the core narrative ingredients that will power the recommended slide plan. Edit any field — your changes are saved automatically."
    ));
    const s = app.state;
    const f = s.storyFoundations || {};
    const hasContent = !!(f.businessProblem || f.futureStateVision || (f.valueDrivers || []).length);

    // ── Action bar: re-run extract / quality check ────────
    const actionBar = el("div", { class: "bx-card bx-extract-card" });
    actionBar.appendChild(el("div", { class: "bx-card-title",
      text: hasContent ? "Story Foundations are ready" : "Run extraction to populate this step" }));
    actionBar.appendChild(el("div", { class: "bx-card-sub",
      text: hasContent
        ? "Looks good. You can edit fields below, or move on to Slide Selection."
        : "Paste a script in Step 2 and click Extract to populate the foundations." }));
    actionBar.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      hasContent
        ? btn("Re-run extraction", "bx-btn-secondary", function () {
            if (runScriptExtraction()) renderShell();
          })
        : btn("← Back to Script", "bx-btn-primary", function () {
            app.state.step = "script"; renderShell();
          }),
      btn("Run Story Quality Check", "bx-btn-secondary", function () { openStoryQualityModal(); }),
    ]));
    wrap.appendChild(actionBar);

    if (!hasContent) {
      wrap.appendChild(el("div", { class: "bx-empty bx-mt-18",
        html: "<strong>Nothing extracted yet.</strong> Paste a script in Step 2 and click Extract Story Foundations. The app fills the fields below automatically." }));
      wrap.appendChild(stepFooter("foundations"));
      return wrap;
    }

    // ── Extracted from script (read-only summary) ─────────
    wrap.appendChild(extractedFactsCard(s, f));

    // ── Core Narrative ────────────────────────────────────
    const coreFields = [
      ["businessProblem",      "Business problem"],
      ["currentStatePain",     "Current-state pain"],
      ["futureStateVision",    "Future-state vision"],
      ["primaryNarrative",     "Primary narrative"],
      ["transformationThesis", "Transformation thesis"],
      ["executiveTakeaway",    "Executive takeaway"],
    ];
    wrap.appendChild(foundationCard("Core Narrative",
      "The story arc that powers the Intro and Business Value sections.",
      coreFields, f, false));

    // ── Key Moments ────────────────────────────────────────
    const momentFields = [
      ["customerMoments",    "Customer moments"],
      ["operationalMoments", "Operational moments"],
      ["agentforceMoments",  "Agentforce moments"],
      ["dataCloudMoments",   "Data Cloud moments"],
      ["commerceMoments",    "Commerce moments"],
      ["marketingMoments",   "Marketing moments"],
      ["serviceMoments",     "Service moments"],
      ["loyaltyMoments",     "Loyalty moments"],
    ];
    wrap.appendChild(foundationCard("Key Moments",
      "Pull-out moments by capability area. These shape Demo-section slides.",
      momentFields, f, true));

    // ── Business Value ─────────────────────────────────────
    const valueFields = [
      ["valueDrivers",   "Value drivers"],
      ["assumptions",    "Assumptions"],
      ["openQuestions",  "Open questions"],
    ];
    wrap.appendChild(foundationCard("Business Value",
      "What outcomes the demo proves out, plus any flagged uncertainties.",
      valueFields, f, true));

    wrap.appendChild(stepFooter("foundations"));
    return wrap;
  }

  // Read-only "what we pulled from your script" summary. Surfaces the
  // facts that live on Steps 1/2 (customer, products, persona) plus the
  // act titles, so the SE can confirm extraction at a glance. Edits still
  // happen on Step 1 (customer/products), Step 2 (persona), Step 8 (act titles).
  function extractedFactsCard(s, f) {
    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: "Extracted from script" }));
    card.appendChild(el("div", { class: "bx-card-sub",
      text: "What the builder pulled from your script. Edit the customer & products in Setup, the persona in Step 2, and act titles in Preview." }));

    const persona = (s.personas && s.personas[0]) || null;
    const actTitles = Array.isArray(f.threeActTitles) ? f.threeActTitles.filter(Boolean) : [];
    const rows = [
      ["Customer", (s.project && s.project.customerName) || ""],
      ["Products", ((s.project && s.project.products) || []).join(", ")],
      ["Primary persona", persona ? [persona.name, persona.role].filter(Boolean).join(" · ") : ""],
      ["Act titles", actTitles.join(" → ")],
    ];

    rows.forEach(function (r) {
      const label = r[0], val = r[1];
      const populated = !!(val && String(val).trim());
      const row = el("div", { class: "bx-foundation-field" });
      row.appendChild(el("div", { class: "bx-foundation-head" }, [
        el("label", { class: "bx-label", text: label }),
        populated
          ? el("span", { class: "bx-rec-pill tone-good", text: "✓ Extracted" })
          : el("span", { class: "bx-rec-pill tone-gold", text: "Missing — add it manually" }),
      ]));
      row.appendChild(el("div", { class: "bx-foundation-value",
        text: populated ? String(val) : "—" }));
      card.appendChild(row);
    });
    return card;
  }

  // Render one foundation card with grouped fields. listMode=true
  // means the field is a list (joined with "; " for editing).
  function foundationCard(title, sub, fields, foundationObj, listMode) {
    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: title }));
    card.appendChild(el("div", { class: "bx-card-sub", text: sub }));
    fields.forEach(function (entry) {
      const key = entry[0];
      const label = entry[1];
      const raw = foundationObj[key];
      const isPopulated = listMode ? (Array.isArray(raw) && raw.length > 0)
                                    : (typeof raw === "string" && raw.trim().length > 0);
      const value = listMode
        ? (Array.isArray(raw) && raw.length ? raw.join("\n") : "")
        : (raw || "");

      const wrap = el("div", { class: "bx-foundation-field" });
      const head = el("div", { class: "bx-foundation-head" }, [
        el("label", { class: "bx-label", text: label }),
        isPopulated
          ? el("span", { class: "bx-rec-pill tone-good", text: "✓ Extracted" })
          : el("span", { class: "bx-rec-pill tone-gold", text: "Missing — add this to improve slide quality" }),
      ]);
      wrap.appendChild(head);

      if (listMode) {
        // Editable textarea, one item per line. Strip leading "• ".
        const editable = (Array.isArray(raw) ? raw.join("\n") : "");
        const ta = el("textarea", { class: "bx-textarea", placeholder: "One item per line",
          rows: Math.max(3, Math.min(8, (Array.isArray(raw) ? raw.length : 0) + 1)) });
        ta.value = editable;
        ta.addEventListener("input", function () {
          const items = ta.value.split(/\n/).map(function (l) { return l.replace(/^[-•*\s]+/, "").trim(); }).filter(Boolean);
          foundationObj[key] = items;
          recompute(); renderSide(); commit();
        });
        wrap.appendChild(ta);
      } else {
        const ta = el("textarea", { class: "bx-textarea",
          placeholder: "Edit if you want to refine the extracted text…",
          rows: Math.max(2, Math.min(6, Math.ceil((value || "").length / 80))) });
        ta.value = value;
        ta.addEventListener("input", function () {
          foundationObj[key] = ta.value;
          // Mirror to legacy state.story for downstream readers.
          mirrorFoundationField(key, ta.value);
          recompute(); renderSide(); commit();
        });
        wrap.appendChild(ta);
      }
      card.appendChild(wrap);
    });
    return card;
  }

  // Keep the legacy state.story.* in sync when the SE edits a
  // foundation field directly. recompute() reads from state.story
  // today; the long-term refactor (P1-3) collapses these.
  function mirrorFoundationField(key, value) {
    const s = app.state;
    const map = {
      "businessProblem":   "bigProblem",
      "currentStatePain":  "currentPain",
      "futureStateVision": "futureVision",
      "executiveTakeaway": "executiveTakeaway",
    };
    if (map[key]) s.story[map[key]] = value;
  }

  // (The standalone "Recommended Narrative" step was removed — every slide
  //  is now selectable and on by default in Step 5 · Slide Selection.)

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
    grid.appendChild(field({
      label: "Pronouns", help: "drives the wishlist headline (\"Her top 3\" vs. \"His top 3\")",
      type: "select", value: p.pronouns || "",
      placeholder: "she/her (default)",
      options: ["she/her", "he/him", "they/them"],
      onInput: function (v) { p.pronouns = v; commit(); },
    }));
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
      "Step 7 · iFrame CX Components",
      "Embed live, interactive demo screens (optional)",
      "These are live iFrame embeds — an AubreyDemo scene, a storefront, a Salesforce screen — shown as interactive screens in the Demo section. This is different from Assets (static images / GIFs you upload or generate): use Assets for imagery, use this step for interactive embeddable URLs. Skip if you don't have any; your demo works fine without it."
    ));
    const s = app.state;
    const components = s.cxComponents || [];

    // Strong empty state if nothing added yet — explains the value
    // and offers a clear "Skip" path so the user isn't stuck.
    if (!components.length) {
      const empty = el("div", { class: "bx-card" });
      empty.appendChild(el("div", { class: "bx-card-title", text: "No CX components yet" }));
      empty.appendChild(el("div", { class: "bx-card-sub",
        text: "Embeddable URLs let your Demo section show live screens — agentic chat, storefront flows, service consoles. AubreyDemo scenes work great here, but so does any embeddable page. Don't have one? Skip this step." }));
      empty.appendChild(el("div", { class: "bx-help bx-mt-12",
        html: "<strong>How it works:</strong> Paste a /scene/.../frame URL → it shows up as an iframe slide in the Demo section. If a site blocks embedding, we'll show an open-in-new-tab fallback automatically." }));
      empty.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
        btn("+ Add CX Component Link", "bx-btn-primary", function () { addCxComponent(); }),
        btn("✨ Pull CX components from Aubrey", "bx-btn-secondary",
          function () { openAubreyCxPicker(); }),
        btn("Skip — I don't have CX links yet", "bx-btn-secondary", function () {
          s._cxSkipped = true; commit();
          app.state.step = "assets"; renderShell();
        }),
      ]));
      wrap.appendChild(empty);
      wrap.appendChild(stepFooter("cx"));
      return wrap;
    }

    // Has components: list them.
    const list = el("div", { class: "bx-list" });
    components.forEach(function (c, i) { list.appendChild(cxItem(c, i)); });
    wrap.appendChild(list);

    const addRow = el("div", { class: "bx-row bx-mt-12" });
    const addBtn = el("button", { class: "bx-add-btn", text: "+ Add CX Component Link" });
    addBtn.addEventListener("click", function () { addCxComponent(); });
    addRow.appendChild(addBtn);
    addRow.appendChild(btn("✨ Pull CX components from Aubrey", "bx-btn-secondary",
      function () { openAubreyCxPicker(); }));
    wrap.appendChild(addRow);

    // Inline note about iframe behavior — sets expectations
    wrap.appendChild(el("div", { class: "bx-help bx-mt-18",
      html: "<strong>Note:</strong> Some websites block iframe embedding via X-Frame-Options or CSP. If that happens, the exported demo will automatically show an open-in-new-tab fallback link instead." }));

    wrap.appendChild(stepFooter("cx"));
    return wrap;

    function addCxComponent() {
      s.cxComponents = s.cxComponents || [];
      s.cxComponents.push({
        id: uid("cx_"), name: "New component", url: "",
        type: "web", sectionId: "demo",
        linkedStoryActIds: [], linkedSlideIds: [],
        deviceFrame: "desktop", iframeAllowed: true,
        fallbackMode: "link-card", status: "ready", notes: "",
        imageSlot: "",  // "" = auto-match by type/name; else an explicit CX-still slot
      });
      s._cxSkipped = false;
      recompute(); renderMain(); commit();
    }
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
      options: ["web", "mobile", "agent", "commerce", "service", "marketing", "data", "ad", "other"],
      value: c.type, onInput: function (v) { c.type = v; commit(); } }));
    grid.appendChild(field({ label: "Device frame", type: "select",
      options: ["desktop", "mobile", "tablet", "none"],
      value: c.deviceFrame, onInput: function (v) { c.deviceFrame = v; commit(); } }));
    item.appendChild(grid);

    // Linked slide — only the slides the SE put in the Demo section.
    // CX components are screens that live inside the demo flow, so
    // linking to a non-demo slide would never render correctly anyway.
    const demoSlides = (app.state.slides || []).filter(function (sl) {
      return sl.sectionId === "demo";
    });
    if (demoSlides.length) {
      const linkSel = el("select", { class: "bx-select" });
      linkSel.appendChild(el("option", { value: "", text: "(not linked)" }));

      const currentLink = (c.linkedSlideIds && c.linkedSlideIds[0]) || "";
      demoSlides.forEach(function (sl) {
        const label = (sl.title || "Untitled") + " · " + layoutLabelShort(sl.layout || "");
        const opt = el("option", { value: sl.id, text: label });
        if (currentLink === sl.id) opt.setAttribute("selected", "selected");
        linkSel.appendChild(opt);
      });
      linkSel.addEventListener("change", function () {
        c.linkedSlideIds = linkSel.value ? [linkSel.value] : [];
        // Rebuild so the slide's linkedCxComponentIds reflects the change
        buildSlidePlanFromSelections();
        commit();
      });
      item.appendChild(el("div", { class: "bx-field" }, [
        el("label", { class: "bx-label", text: "Linked demo slide" },
          [el("span", { class: "bx-help-inline", text: "(optional)" })]),
        linkSel,
      ]));

      // Show the auto-match so the SE knows where an unlinked component
      // will land, and let them lock it in with one click. Uses the same
      // helper the build uses, so the displayed target is the real target.
      if (!currentLink) {
        const autoMap = computeCxAutoAssignments(app.state);
        const autoSlideId = autoMap[c.id];
        const matchRow = el("div", { class: "bx-cx-match bx-mt-6" });
        if (autoSlideId) {
          const autoSlide = demoSlides.find(function (sl) { return sl.id === autoSlideId; });
          const autoTitle = autoSlide ? (autoSlide.title || "Untitled") : autoSlideId;
          matchRow.appendChild(el("span", { class: "bx-cx-match-label",
            text: "Auto-matched to: " + autoTitle }));
          matchRow.appendChild(btn("Make explicit", "bx-btn-link", function () {
            c.linkedSlideIds = [autoSlideId];
            buildSlidePlanFromSelections();
            commit();
            renderMain();
          }));
        } else {
          matchRow.appendChild(el("span", { class: "bx-cx-match-label bx-cx-match-muted",
            text: "Not auto-matched — link it above to place it on a demo slide." }));
        }
        item.appendChild(matchRow);
      } else {
        item.appendChild(el("div", { class: "bx-cx-match bx-mt-6" }, [
          el("span", { class: "bx-rec-pill tone-good", text: "Explicit" }),
          el("span", { class: "bx-cx-match-label", text: "You set this link manually." }),
        ]));
      }
    } else {
      item.appendChild(el("div", { class: "bx-help bx-mt-6",
        html: "<strong>Tip:</strong> Pick demo slides in Step 5 first, then come back here to link this component to a specific demo screen." }));
    }
    item.appendChild(field({ label: "Notes", type: "textarea",
      value: c.notes, onInput: function (v) { c.notes = v; commit(); } }));

    // Live status pill
    const isUrl = /^https?:\/\//i.test(c.url || "");
    const status = el("div", { class: "bx-row bx-mt-12" });
    if (!c.url) status.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "URL needed" }));
    else if (!isUrl) status.appendChild(el("span", { class: "bx-rec-pill tone-red", text: "Invalid URL — must be http(s)" }));
    else if (!/aubreydemo\.com/i.test(c.url)) status.appendChild(el("span", { class: "bx-rec-pill tone-blue", text: "Custom URL — verify it allows iframe embedding" }));
    else status.appendChild(el("span", { class: "bx-rec-pill tone-good", text: "Ready to embed" }));
    item.appendChild(status);

    return item;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP 7: ASSETS — uploads keyed by slot, scoped to selected slides
  // ═══════════════════════════════════════════════════════════════
  // Catalog of every shared asset slot the polished template /demo
  // can consume.  Keys MUST match what holodeck-adapter.asset(state, slot)
  // looks up.  layouts[] = which slide layouts make this slot visible
  // (so SEs only see what's relevant to the deck they built).
  // Persona slots auto-show whenever a persona exists OR a persona-
  // related slide is selected.
  const ASSET_CATALOG = [
    // Brand
    { slot: "brand.logoPath", group: "Brand", label: "Customer logo",
      help: "Shown in the top-left navigation and on the title slide.",
      always: true, accept: "image/*" },
    // Persona — surfaces whenever a persona card is in the deck.
    { slot: "persona.portrait", group: "Persona", label: "Persona portrait",
      help: "Square photo used on the persona card.",
      layouts: ["personaCard"], accept: "image/*" },
    { slot: "persona.heroBackground", group: "Persona", label: "Persona hero background",
      help: "Full-bleed environment shot behind the persona on the 'Meet the persona' page.",
      layouts: ["personaCard"], accept: "image/*" },
    { slot: "persona.heroGif", group: "Persona", label: "Persona hero GIF",
      help: "Looping moment of the persona — overlays the hero background.",
      layouts: ["personaCard"], accept: "image/*,video/mp4" },
    { slot: "persona.phoneGif", group: "Persona", label: "Persona phone GIF",
      help: "Animated screen shown inside the iPhone frame on persona slides.",
      layouts: ["personaCard", "deviceMoment"], accept: "image/*,video/mp4" },
    // Demo library — used by the polished demo Section's slide library.
    { slot: "storeExterior", group: "Demo backdrops", label: "Store exterior",
      help: "Photo of the customer's location / storefront.",
      layouts: ["deviceMoment", "embeddedCxComponent", "currentFutureState"], accept: "image/*" },
    { slot: "storeInterior", group: "Demo backdrops", label: "Store interior",
      help: "In-store moment used as a background panel.",
      layouts: ["deviceMoment", "embeddedCxComponent"], accept: "image/*" },
    { slot: "productHero", group: "Demo backdrops", label: "Product hero image",
      help: "The featured product / SKU shown on the right-rail card.",
      layouts: ["deviceMoment", "unifiedProfile", "embeddedCxComponent"], accept: "image/*" },
    { slot: "iPhoneRec", group: "Demo screens", label: "iPhone recommendation screen",
      help: "Static screenshot for the 'app recommends' moment.",
      layouts: ["deviceMoment", "agentConversation"], accept: "image/*" },
    { slot: "webBrowseGif", group: "Demo screens", label: "Web browse GIF",
      help: "Looping browse session for the storefront moment.",
      layouts: ["deviceMoment", "embeddedCxComponent"], accept: "image/*,video/mp4" },
    { slot: "laptopBrowsingGif", group: "Demo screens", label: "Laptop browsing GIF",
      help: "Looping desktop browse for laptop-frame slides.",
      layouts: ["deviceMoment", "embeddedCxComponent"], accept: "image/*,video/mp4" },

    // CX component stills — optional AI/uploaded screenshots that render
    // INSIDE the device frame in place of the live HTML mock / blank
    // iframe. When empty, the existing mock renders unchanged. Image-only
    // (no Gif suffix → no "still image" note).
    // always:true — these surface in Step 7 regardless of the current deck
    // layouts (like Brand/Persona). Generation is non-destructive: an empty
    // slot leaves the existing HTML mock unchanged, so always-on is safe.
    { slot: "cxUnifiedProfile", group: "CX component stills", label: "Unified profile still",
      help: "Stylized Data Cloud unified-profile screen. Shows inside the laptop frame on the Unified Profile slide (replaces the HTML mock).",
      layouts: ["unifiedProfile"], always: true, accept: "image/*" },
    { slot: "cxInstagramAd", group: "CX component stills", label: "Instagram ad still",
      help: "Paid-social / Instagram ad creative. Shows inside the phone frame on Embedded CX / device slides.",
      layouts: ["embeddedCxComponent", "deviceMoment"], always: true, accept: "image/*" },
    { slot: "cxShopperAgent", group: "CX component stills", label: "Shopper agent still",
      help: "Shopper / commerce agent chat screenshot. Shows inside the phone frame.",
      layouts: ["embeddedCxComponent", "deviceMoment"], always: true, accept: "image/*" },
    { slot: "cxTextConvo", group: "CX component stills", label: "Agentic text thread still",
      help: "SMS / agentic text-message thread. Shows inside the phone frame on the Agent Conversation slide (replaces the chat mock).",
      layouts: ["agentConversation", "embeddedCxComponent"], always: true, accept: "image/*" },
  ];

  // Compute which assets should show given the current slide plan.
  // We always surface "Brand" and (if any persona exists or any
  // selected slide is persona-related) the Persona group.  The rest
  // is derived from the layouts present in the deck.
  function relevantAssetItems(state) {
    const slides = state.slides || [];
    const layoutsInDeck = {};
    slides.forEach(function (sl) { if (sl.layout) layoutsInDeck[sl.layout] = true; });
    const hasPersona = (state.personas || []).length > 0;
    return ASSET_CATALOG.filter(function (item) {
      if (item.always) return true;
      if (item.group === "Persona" && hasPersona) return true;
      if (!item.layouts) return false;
      return item.layouts.some(function (l) { return layoutsInDeck[l]; });
    });
  }

  // Which SELECTED slides actually consume a given asset slot — used for the
  // "Used by:" caption on Step 6 so SEs see why a slot exists and where it
  // shows up. Brand/persona slots that aren't layout-scoped get a friendly
  // catch-all. Returns an array of slide titles (deduped, in deck order).
  function slidesUsingSlot(state, item) {
    // state.slides[] are the demo-library slides the SE assembled; all are in
    // the deck (fixed-section Step-5 selection lives in selectedRecIds, not here).
    const slides = state.slides || [];
    if (item.always && item.slot === "brand.logoPath") return ["Title slide", "Top navigation"];
    if (item.group === "Persona" && !item.layouts) return ["Meet the persona"];
    const layouts = item.layouts || [];
    const titles = [];
    slides.forEach(function (sl) {
      if (sl.layout && layouts.indexOf(sl.layout) !== -1) {
        const t = sl.title || layoutLabel(sl.layout) || "Untitled slide";
        if (titles.indexOf(t) === -1) titles.push(t);
      }
    });
    return titles;
  }
  // Friendly label for a layout id (fallback when a slide has no title).
  function layoutLabel(layout) {
    const map = {
      personaCard: "Meet the persona", deviceMoment: "Device moment",
      scenePhoto: "Scene", embeddedCxComponent: "Live CX screen",
      unifiedProfile: "Unified profile", agentConversation: "Agent conversation",
      currentFutureState: "Current → future state",
    };
    return map[layout] || layout;
  }

  // ─── Persona stat / wishlist helpers ─────────────────────────
  // Stats and wishlist are arrays. The adapter has [TODO] defaults
  // for missing slots; the editors here read whatever the SE has
  // typed and lazily allocate the slot on first edit so we don't
  // serialize empty placeholders into state.
  function statValue(p, idx) {
    const row = (p.stats && p.stats[idx]) || {};
    return row.value || "";
  }
  function statLabel(p, idx) {
    const row = (p.stats && p.stats[idx]) || {};
    return row.label || "";
  }
  function setStat(p, idx, key, v) {
    p.stats = Array.isArray(p.stats) ? p.stats : [];
    while (p.stats.length <= idx) p.stats.push({ value: "", label: "" });
    p.stats[idx][key] = v;
  }
  function wishField(p, idx, key) {
    const row = (p.wishlist && p.wishlist[idx]) || {};
    return row[key] || "";
  }
  function setWish(p, idx, key, v) {
    p.wishlist = Array.isArray(p.wishlist) ? p.wishlist : [];
    while (p.wishlist.length <= idx) p.wishlist.push({ name: "", tag: "", detail: "", emoji: "" });
    p.wishlist[idx][key] = v;
  }

  // BVS metric overrides — kept on storyFoundations.bvsMetrics so
  // they round-trip through import/export alongside the rest of
  // foundations. Same lazy-allocate pattern as persona stats.
  function bvsField(f, idx, key) {
    const arr = (f && Array.isArray(f.bvsMetrics)) ? f.bvsMetrics : [];
    const row = arr[idx] || {};
    return row[key] || "";
  }
  function setBvs(f, idx, key, v) {
    f.bvsMetrics = Array.isArray(f.bvsMetrics) ? f.bvsMetrics : [];
    while (f.bvsMetrics.length <= idx) f.bvsMetrics.push({ value: "", label: "" });
    f.bvsMetrics[idx][key] = v;
  }
  // Mirror of the adapter's shortenLabel — kept local so we can show
  // the SE the same source chip as the slide will use.
  function shortenForUi(s) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    const m = s.match(/^(?:higher|increased|improved|reduced|faster)\s+([\w\s\/]+?)(\s+through|\s+via|\s+from|$)/i);
    if (m) return m[1].trim().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return s.split(/[.;]/)[0].slice(0, 32);
  }

  // Pending text fields the SE should still tweak. Each entry is an
  // editor descriptor: { label, source, type, get, set }. We render
  // them as inline form fields on Step 6 so the SE can polish copy
  // without bouncing back through canonical steps. `source` is just
  // a hint label so SEs know where the value normally lives.
  // Editors bind directly to the canonical state path, so edits show
  // up identically on Step 1/3/4/5 — no duplication, no drift.
  function pendingTextItems(state) {
    const out = [];
    const personas = state.personas || [];
    const f = state.storyFoundations = state.storyFoundations || {};

    if (!state.project.presenterName) {
      out.push({
        label: "Presenter name", source: "Step 1 · Setup",
        placeholder: "e.g. Jane Smith", type: "input",
        get: function () { return state.project.presenterName || ""; },
        set: function (v) { state.project.presenterName = v; },
      });
    }
    if (!state.project.presenterTitle) {
      out.push({
        label: "Presenter title", source: "Step 1 · Setup",
        placeholder: "e.g. Senior Account Executive", type: "input",
        get: function () { return state.project.presenterTitle || ""; },
        set: function (v) { state.project.presenterTitle = v; },
      });
    }
    if (!personas.length) {
      out.push({
        label: "No personas added", source: "Step 4 · Personas",
        readonly: true, hint: "Personas are needed for the 'Meet the persona' slide. Add one on Step 4.",
      });
    } else {
      personas.forEach(function (p, i) {
        const tag = p.name ? p.name : "Persona " + (i + 1);
        if (!p.name) {
          out.push({
            label: tag + " name", source: "Step 4 · Personas",
            placeholder: "e.g. Rachel Chen", type: "input",
            get: function () { return p.name || ""; },
            set: function (v) { p.name = v; },
          });
        }
        if (!p.role) {
          out.push({
            label: tag + " role", source: "Step 4 · Personas",
            placeholder: "e.g. Loyalty member · Suburban mom", type: "input",
            get: function () { return p.role || ""; },
            set: function (v) { p.role = v; },
          });
        }
        if (!p.painPoints && !p.goals) {
          out.push({
            label: tag + " quote / pain points", source: "Step 4 · Personas",
            placeholder: "What's the unspoken thing on their mind?",
            type: "textarea",
            get: function () { return p.painPoints || ""; },
            set: function (v) { p.painPoints = v; },
          });
        }
        // Pronouns drive the wishlist headline ("Her top 3..."
        // vs. "His top 3..."). We always surface this so the SE
        // can change it from the she/her default — the slide
        // emits hard-coded pronouns otherwise. It has a working
        // default, so it's shown but does NOT count as "still to
        // update" (pending:false).
        out.push({
          label: tag + " pronouns", source: "Step 4 · Personas",
          type: "select", pending: false,
          options: [
            { value: "",          label: "she/her (default)" },
            { value: "she/her",   label: "she/her" },
            { value: "he/him",    label: "he/him" },
            { value: "they/them", label: "they/them" },
          ],
          hint: "Used for the wishlist headline — \"Her top 3\" vs. \"His top 3\".",
          get: function () { return p.pronouns || ""; },
          set: function (v) { p.pronouns = v; },
        });
        // Persona stats — three slots that render above "Top
        // Moment / Tradition / Signal" on the persona card. The
        // adapter falls back to "[TODO]" when these are empty,
        // so each blank slot is genuinely worth surfacing here.
        ["Top Moment", "Tradition", "Signal"].forEach(function (defaultLabel, idx) {
          out.push({
            label: tag + " · stat #" + (idx + 1) + " value",
            source: "Persona card · " + defaultLabel,
            placeholder: "e.g. \"4th of July\"", type: "input",
            hint: "Big text shown on the persona card stat tile.",
            get: function () { return statValue(p, idx); },
            set: function (v) { setStat(p, idx, "value", v); },
          });
          out.push({
            label: tag + " · stat #" + (idx + 1) + " label",
            source: "Persona card · " + defaultLabel,
            placeholder: defaultLabel, type: "input",
            hint: "Small caption under the stat value.",
            get: function () { return statLabel(p, idx); },
            set: function (v) { setStat(p, idx, "label", v); },
          });
        });
        // Persona wishlist — three product slots. Each row has a
        // name and a detail line (the tag/emoji are decoration
        // and stay on their defaults).
        ["Top product", "Companion", "Complete the look"].forEach(function (defaultLabel, idx) {
          out.push({
            label: tag + " · wishlist #" + (idx + 1) + " name",
            source: "Persona card · " + defaultLabel,
            placeholder: "e.g. Paloma Outdoor Set", type: "input",
            get: function () { return wishField(p, idx, "name"); },
            set: function (v) { setWish(p, idx, "name", v); },
          });
          out.push({
            label: tag + " · wishlist #" + (idx + 1) + " detail",
            source: "Persona card · " + defaultLabel,
            placeholder: "e.g. Saved to cart · price-drop trigger", type: "input",
            get: function () { return wishField(p, idx, "detail"); },
            set: function (v) { setWish(p, idx, "detail", v); },
          });
        });
      });
    }
    // BVS metrics — five tiles on the Business Value slide. The
    // adapter falls back to "XX%" / "+$XX" / etc. when these are
    // empty, which is the fastest way to spot them in the live demo.
    // Default labels mirror the adapter so the source chip is honest
    // even before the SE writes anything.
    const bvsDefaults = [
      { value: "XX%",  label: "Conversion Lift"      },
      { value: "+$XX", label: "Average Order Value"  },
      { value: "XX%",  label: "Loyalty Enrollment"   },
      { value: "XXx",  label: "Repeat Purchase Rate" },
      { value: "XX%",  label: "Service Efficiency"   },
    ];
    const drivers = (f.valueDrivers || []);
    bvsDefaults.forEach(function (def, idx) {
      const driverLabel = drivers[idx] ? shortenForUi(drivers[idx]) : "";
      const sourceLabel = "Business Value tile · " + (driverLabel || def.label);
      out.push({
        label: "BVS metric #" + (idx + 1) + " value",
        source: sourceLabel,
        placeholder: def.value, type: "input",
        hint: "Big number on the Business Value slide (e.g. \"23%\", \"+$340\").",
        get: function () { return bvsField(f, idx, "value"); },
        set: function (v) { setBvs(f, idx, "value", v); },
      });
      out.push({
        label: "BVS metric #" + (idx + 1) + " label",
        source: sourceLabel,
        placeholder: driverLabel || def.label, type: "input",
        hint: "Small caption under the metric.",
        get: function () { return bvsField(f, idx, "label"); },
        set: function (v) { setBvs(f, idx, "label", v); },
      });
    });

    if (!f.executiveTakeaway) {
      out.push({
        label: "Executive takeaway", source: "Step 3 · Story Foundations",
        placeholder: "One-line summary the executive should walk away with",
        type: "textarea",
        get: function () { return f.executiveTakeaway || ""; },
        set: function (v) { f.executiveTakeaway = v; },
      });
    }
    if (!f.transformationThesis) {
      out.push({
        label: "Transformation thesis", source: "Step 3 · Story Foundations",
        placeholder: "From X today → to Y tomorrow",
        type: "textarea",
        get: function () { return f.transformationThesis || ""; },
        set: function (v) { f.transformationThesis = v; },
      });
    }
    (state.slides || []).forEach(function (sl) {
      const customised = state.customRecTitles && state.customRecTitles[sl.id];
      if (!customised && /^Slide \d/.test(sl.title)) {
        out.push({
          label: "Title for '" + sl.title + "'", source: "Step 5 · Slide Selection",
          placeholder: "Give this slide a real title",
          type: "input",
          get: function () { return sl.title || ""; },
          set: function (v) {
            sl.title = v;
            state.customRecTitles = state.customRecTitles || {};
            state.customRecTitles[sl.id] = v;
          },
        });
      }
    });
    // Normalize the `pending` flag so the "Text still to update" counter is
    // honest: an item counts only if it's editable AND genuinely empty AND
    // not explicitly opted out (e.g. pronouns, which always have a default).
    // Read-only hints never count. Every item stays in the list so the SE can
    // still polish it; only the COUNT is filtered to what truly needs work.
    out.forEach(function (it) {
      if (it.readonly) { it.pending = false; return; }
      if (it.pending === false) return;            // explicit opt-out (e.g. pronouns)
      const val = it.get ? String(it.get() || "").trim() : "";
      it.pending = !val;                            // empty → still needs attention
    });
    return out;
  }
  // Count of items that genuinely still need the SE's attention (drives the
  // "Text still to update (N)" header). See pendingTextItems' normalization.
  function pendingTextCount(items) {
    return (items || []).filter(function (it) { return it.pending; }).length;
  }

  // ─── AI asset prompt builder ─────────────────────────────────
  // Composes a concise image prompt for one asset slot. Beyond the
  // structured Setup fields, it weaves in the RELEVANT extracted
  // story signals for that slot (e.g. productHero pulls products +
  // commerceMoments; persona slots pull goals/painPoints; store slots
  // pull the script's setting) so images are specific to this demo —
  // without dumping the whole script, which image models handle
  // poorly. We still don't fabricate wordmarks/metrics; the customer
  // name is used only when the SE has actually entered it.
  // Try to fetch the REAL brand logo from the customer's website via
  // the same-origin /api/logo proxy (which hits a public logo service
  // server-side). Resolves to a self-contained data: URL on success,
  // or "" if there's no usable domain or the fetch fails — so callers
  // can cleanly fall back to AI generation.
  // Best-effort guess of a company's primary domain from its name, used
  // only when the SE left the Website field blank. Strips punctuation,
  // spaces, and common legal suffixes, then appends .com — e.g.
  // "TopGolf" → topgolf.com, "At Home" → athome.com. Returns "" if
  // nothing usable. A wrong guess is harmless: fetchRealLogo's proxy
  // simply 404s and the caller falls back to AI generation.
  function domainFromName(name) {
    let base = String(name || "").trim().toLowerCase();
    if (!base || /^\[todo/i.test(base)) return "";
    base = base
      .replace(/&/g, " and ")
      .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|plc|gmbh)\b\.?/g, "")
      .replace(/[^a-z0-9]+/g, "");
    return base ? base + ".com" : "";
  }

  function fetchRealLogo(website) {
    const domain = String(website || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./i, "")
      .toLowerCase();
    if (!domain || domain.indexOf(".") === -1) return Promise.resolve("");
    if (!AUBREY || !AUBREY.inlineImageAsDataUrl) return Promise.resolve("");
    return AUBREY.inlineImageAsDataUrl("/api/logo?domain=" + encodeURIComponent(domain))
      .catch(function () { return ""; });
  }

  function buildAssetPrompt(s, item) {
    const p = (s && s.project) || {};
    const brand = (s && s.brand) || {};
    const f = (s && s.storyFoundations) || {};
    const persona = (Array.isArray(s && s.personas) && s.personas[0]) || {};
    const customer = (p.customerName && !/^\[TODO/i.test(p.customerName)) ? p.customerName : "";
    const industry = p.industry || "";
    const theme = p.theme || "";
    const products = (Array.isArray(p.products) ? p.products : []).filter(Boolean);

    // Helpers: drop [TODO:] placeholders, take the first N array
    // entries, and trim a long paragraph to a short visual cue.
    const clean = function (v) { const t = String(v || "").trim(); return /^\[TODO/i.test(t) ? "" : t; };
    const firstFew = function (a, n) {
      return (Array.isArray(a) ? a : []).map(clean).filter(Boolean).slice(0, n || 2);
    };
    const snippet = function (v, n) { const t = clean(v); return t ? t.slice(0, n || 160) : ""; };

    // Shared art direction for synthetic UI-mockup slots (CX stills,
    // phone/laptop screens). STYLIZED, minimal-text — avoids the dense
    // small copy image models render as garble. No device bezel: the
    // demo renderer already wraps these in a phone/laptop frame.
    const UI_ART = "Stylized, high-fidelity product UI mockup — clean modern SaaS design, " +
      "generous whitespace, large rounded cards, soft shadows, one clear focal element. " +
      "Use the brand's real colors and tone. Minimal text: at most a few short large-type labels; " +
      "represent body copy as abstract gray placeholder bars, never real paragraphs. " +
      "Screen content only — no device bezel in the image.";
    // Negative clause appended to every prompt (photographic slots
    // benefit too — keeps watermarks/garbled text out).
    const NO_GARBLE = "Avoid: tiny or dense text, lorem-ipsum, misspelled/garbled words, watermarks, " +
      "UI clutter, fake third-party logos, broken layouts.";

    const personaName = clean(persona.name);
    const personaRole = clean(persona.role);
    const personaGoals = snippet(persona.goals, 120);
    const personaPain = snippet(persona.painPoints, 120);

    // Per-slot intent. The image model returns a still; for animated
    // slots we generate a representative frame. Each pulls only the
    // signals relevant to that image.
    const intents = {
      "brand.logoPath": customer
        ? ("the real, existing official logo of the company \"" + customer + "\"" +
           (p.website ? " (" + p.website + ")" : "") +
           " — reproduce it faithfully and exactly as the brand is actually known," +
           " with the correct wordmark, symbol, and brand colors. Do NOT invent a" +
           " new or different design. Flat, on a transparent or solid background, no extra text")
        : "a clean, modern, minimalist brand logo mark, flat vector style on a" +
          " transparent or solid background, no extra text",
      "persona.portrait": "a professional, friendly square headshot portrait of " +
        ((personaName || "a customer persona") + (personaRole ? ", a " + personaRole : "")) +
        ", natural lighting, neutral background",
      "persona.heroBackground": "a full-bleed, cinematic environment photo that fits the persona's world" +
        (industry ? " in the " + industry + " industry" : "") +
        (personaGoals ? ", evoking " + personaGoals : "") + ", no people in focus, room for an overlay",
      "persona.heroGif": "a candid lifestyle moment featuring " +
        (personaName || "the persona") + (personaRole ? " (" + personaRole + ")" : "") +
        (personaGoals ? ", pursuing " + personaGoals : "") + ", warm and editorial",
      "persona.phoneGif": UI_ART + " A mobile app home screen for " +
        (personaName || "the customer") +
        (personaPain ? ", helping with " + personaPain : "") +
        (products.length ? " (powered by " + products.slice(0, 2).join(", ") + ")" : "") +
        ". 9:16 vertical mobile composition.",
      "storeExterior": "an inviting storefront / building exterior photo" +
        (customer ? " for \"" + customer + "\"" : "") +
        (industry ? " in the " + industry + " industry" : "") + ", daytime, no people",
      "storeInterior": "a bright, modern interior photo of a " +
        (industry ? industry + " " : "") + "retail or service space, no people, clean composition",
      "productHero": "a premium product hero shot" +
        (theme ? " illustrating \"" + theme + "\"" : "") +
        (firstFew(f.commerceMoments, 1).length ? " — " + firstFew(f.commerceMoments, 1)[0] : "") +
        ", studio lighting on a clean background",
      "iPhoneRec": UI_ART + " A mobile app product-recommendation screen" +
        (firstFew(f.customerMoments, 1).length ? " showing " + firstFew(f.customerMoments, 1)[0] : "") +
        (products.length ? " (powered by " + products.slice(0, 2).join(", ") + ")" : "") +
        ". 9:16 vertical mobile composition.",
      "webBrowseGif": UI_ART + " A modern e-commerce / web storefront browsing screen" +
        (customer ? " for \"" + customer + "\"" : "") +
        (firstFew(f.commerceMoments, 1).length ? " showing " + firstFew(f.commerceMoments, 1)[0] : "") +
        ". 16:10 desktop browser composition.",
      "laptopBrowsingGif": UI_ART + " A modern web application screen on a laptop" +
        (firstFew(f.customerMoments, 1).length ? " showing " + firstFew(f.customerMoments, 1)[0] : "") +
        ". 16:10 desktop composition.",

      "cxUnifiedProfile": UI_ART + " A Salesforce Data Cloud unified customer profile dashboard for " +
        (personaName || "the customer") + (personaRole ? " (" + personaRole + ")" : "") +
        ". Left rail: circular avatar monogram, name, segment, two large KPI tiles (Lifetime Value, Orders). " +
        "Main pane: a few labeled attribute fields and a simple affinity/score visual" +
        (personaGoals ? " reflecting " + personaGoals : "") +
        (industry ? ", in a " + industry + " context" : "") +
        ". Salesforce console aesthetic, light theme, brand-accent highlights. 16:10 desktop composition.",
      "cxInstagramAd": UI_ART + " A single Instagram-style paid social ad creative" +
        (customer ? " for \"" + customer + "\"" : "") +
        ". A bold hero product/lifestyle image filling the frame, a small brand handle row at top, " +
        "like/comment/share icons, a 'Sponsored' tag, one short large headline and a Shop Now button" +
        (firstFew(f.commerceMoments, 1).length ? " promoting " + firstFew(f.commerceMoments, 1)[0] : "") +
        ". 9:16 vertical mobile composition.",
      "cxShopperAgent": UI_ART + " A shopping/commerce assistant chat screen on a phone" +
        (customer ? " for \"" + customer + "\"" : "") +
        ". Header with an agent name, two or three short chat bubbles, and a horizontal row of product " +
        "recommendation cards (image + short price-style label)" +
        (personaPain ? " helping with " + personaPain : "") +
        ". Friendly, on-brand. 9:16 vertical mobile composition.",
      "cxTextConvo": UI_ART + " An SMS / iMessage-style text thread on a phone between " +
        (personaName || "a customer") + " and a brand assistant" +
        (customer ? " from \"" + customer + "\"" : "") +
        ". Three or four short bubbles (incoming gray, outgoing brand-color), a typing indicator, " +
        "and a message input bar" +
        (personaPain ? ", resolving " + personaPain : "") +
        ". Short realistic messages only. 9:16 vertical mobile composition.",
    };
    const intent = intents[item.slot] || ("an on-brand image for \"" + item.label + "\"");

    // Shared context line — the structured Setup fields plus a short
    // narrative cue so even generic slots reflect this demo.
    const ctx = [];
    if (customer) ctx.push("Customer: " + customer);
    if (industry) ctx.push("Industry: " + industry);
    if (theme) ctx.push("Demo theme: " + theme);
    if (products.length) ctx.push("Salesforce products in play: " + products.join(", "));
    if (snippet(f.futureStateVision, 180)) ctx.push("Vision: " + snippet(f.futureStateVision, 180));
    if (personaName) ctx.push("Persona: " + personaName + (personaRole ? " (" + personaRole + ")" : ""));
    if (personaGoals) ctx.push("Persona goal: " + personaGoals);
    if (brand.primaryColor) ctx.push("Brand colors: " + [brand.primaryColor, brand.secondaryColor, brand.accentColor].filter(Boolean).join(", "));

    return [
      "Generate " + intent + ".",
      ctx.length ? ("Context — " + ctx.join("; ") + ".") : "",
      "High quality, professional, suitable for a sales presentation.",
      NO_GARBLE,
    ].filter(Boolean).join(" ");
  }

  // ─── AI persona-card copy fill ───────────────────────────────
  // Fills the small persona-card text fields (quote/painPoints, the
  // three stat tiles, the three wishlist rows) for every persona that
  // still has gaps — gap-fill only, never clobbering SE-entered copy.
  // One Gemini text call per persona. Resolves to the number of
  // personas updated. Used by the Assets-step "Generate all".
  function runPersonaCopyFill(s) {
    const GEMINI = window.HOLO_GEMINI;
    const AI_PROMPT = window.HOLO_AI_PROMPT;
    const personas = Array.isArray(s.personas) ? s.personas : [];
    if (!GEMINI || !GEMINI.generate || !AI_PROMPT || !AI_PROMPT.getPersonaCopyPrompt) return Promise.resolve(0);
    if (!personas.length) return Promise.resolve(0);

    const f = s.storyFoundations || {};
    const p = s.project || {};
    const context = [
      p.customerName ? ("Customer: " + p.customerName) : "",
      p.industry ? ("Industry: " + p.industry) : "",
      p.theme ? ("Demo theme: " + p.theme) : "",
      f.futureStateVision ? ("Vision: " + String(f.futureStateVision).slice(0, 200)) : "",
      (Array.isArray(p.products) && p.products.length) ? ("Products: " + p.products.join(", ")) : "",
    ].filter(Boolean).join("\n");

    const str = function (v) { return typeof v === "string" ? v.trim() : ""; };

    // A persona "needs" copy if any of its small fields are empty.
    const needsCopy = function (per) {
      if (!str(per.painPoints) && !str(per.goals)) return true;
      for (let i = 0; i < 3; i++) {
        if (!statValue(per, i)) return true;
        if (!wishField(per, i, "name")) return true;
      }
      return false;
    };

    const targets = personas.filter(needsCopy);
    if (!targets.length) return Promise.resolve(0);

    let updated = 0;
    // Sequential — one persona at a time, same as the image chain.
    return targets.reduce(function (chain, per) {
      return chain.then(function () {
        const prompt = AI_PROMPT.getPersonaCopyPrompt(per, context);
        return GEMINI.generate({ prompt: prompt, jsonMode: true })
          .then(function (text) {
            const cleaned = String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
            let data;
            try { data = JSON.parse(cleaned); } catch (_) { return; }
            if (!data || typeof data !== "object") return;
            let touched = false;

            // Quote / pain points — only if both pain and goals empty.
            if (!str(per.painPoints) && !str(per.goals) && str(data.painPoints)) {
              per.painPoints = str(data.painPoints); touched = true;
            }
            // Stats — fill empty value/label per tile.
            const stats = Array.isArray(data.stats) ? data.stats : [];
            for (let i = 0; i < 3; i++) {
              const row = stats[i] || {};
              if (!statValue(per, i) && str(row.value)) { setStat(per, i, "value", str(row.value)); touched = true; }
              if (!statLabel(per, i) && str(row.label)) { setStat(per, i, "label", str(row.label)); touched = true; }
            }
            // Wishlist — fill empty name/detail per row.
            const wl = Array.isArray(data.wishlist) ? data.wishlist : [];
            for (let i = 0; i < 3; i++) {
              const row = wl[i] || {};
              if (!wishField(per, i, "name") && str(row.name)) { setWish(per, i, "name", str(row.name)); touched = true; }
              if (!wishField(per, i, "detail") && str(row.detail)) { setWish(per, i, "detail", str(row.detail)); touched = true; }
            }
            if (touched) updated++;
          })
          .catch(function () { /* skip this persona on error */ });
      });
    }, Promise.resolve()).then(function () { return updated; });
  }

  function viewAssets() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 6 · Assets",
      "Upload images for your deck (optional)",
      "We only show the slots that the slides you picked actually use. Anything you skip leaves a clean placeholder in the demo — you can still export and present without uploading anything."
    ));
    const s = app.state;
    s.assetLibrary = s.assetLibrary || {};

    const items = relevantAssetItems(s);
    if (!items.length) {
      const empty = el("div", { class: "bx-card" });
      empty.appendChild(el("div", { class: "bx-card-title", text: "No image slots needed yet" }));
      empty.appendChild(el("div", { class: "bx-card-sub",
        text: "Pick slides on Step 5 (Slide Selection) and we'll list out every image slot those slides can use. You can still polish text below." }));
      wrap.appendChild(empty);
    } else {
      // Group items by their `group` property in catalog order.
      const groups = [];
      const groupIndex = {};
      items.forEach(function (it) {
        if (groupIndex[it.group] == null) {
          groupIndex[it.group] = groups.length;
          groups.push({ label: it.group, items: [] });
        }
        groups[groupIndex[it.group]].items.push(it);
      });

      // Collect every rendered row so a "Generate all" driver can
      // reach each row's exposed _aiGenerate / _hasValue helpers. Rows
      // are built into `allRows` below; the driver reads it on click,
      // after every row exists — so the bar can be appended to the top
      // of the section even though the rows render beneath it.
      const allRows = [];
      const groupCards = groups.map(function (g) {
        const card = el("div", { class: "bx-card" });
        card.appendChild(el("div", { class: "bx-card-title", text: g.label }));
        card.appendChild(el("div", { class: "bx-card-sub",
          text: g.label === "Brand"
            ? "Travels with the exported config — no need to drop into demo/assets/."
            : "Each slot lists the slides it feeds. Skip any and that slide shows a clean branded placeholder instead." }));
        g.items.forEach(function (it) {
          const row = assetRow(s, it);
          allRows.push(row);
          card.appendChild(row);
        });
        return card;
      });

      // "Generate all with AI" — fills empty persona-card copy (one
      // text call per persona) AND every empty image slot, sequentially,
      // skipping anything already filled / uploaded / Aubrey-seeded.
      // Shown only when Gemini is configured. Appended to the TOP of the
      // section (before the group cards) so it's the first thing the SE
      // sees on this step.
      if (window.HOLO_GEMINI && window.HOLO_GEMINI.isConfigured) {
        const genAllBar = el("div", { class: "bx-card bx-asset-genall", hidden: true });
        const genAllText = el("div", { class: "bx-card-sub",
          text: "Fill empty persona copy and generate placeholder images with Gemini for every empty slot below. Animated (GIF) slots get a still frame — upload a GIF/MP4 to animate. You can replace anything afterwards." });
        const genAllBtn = el("button", { class: "bx-btn bx-btn-ghost bx-ai-btn", type: "button" }, [
          el("span", { class: "bx-ai-spark", text: "✦" }),
          el("span", { class: "bx-genall-label", text: "Generate all empty slots with AI" }),
        ]);
        const genAllLabel = genAllBtn.querySelector(".bx-genall-label");
        genAllBtn.addEventListener("click", function () {
          const imgTargets = allRows.filter(function (r) { return r._aiGenerate && r._hasValue && !r._hasValue(); });
          genAllBtn.disabled = true;
          const origText = genAllLabel.textContent;
          let imgOk = 0;
          toast("Generating with AI…");

          // Progress bar lives just below the button; the post-run
          // renderShell() rebuilds this whole section and clears it.
          const pb = progressBar("Filling persona copy…");
          genAllBar.appendChild(pb.node);

          // A few images at a time is ~3x faster than one-at-a-time while
          // staying well under Gemini's rate limits. Advance to the next
          // batch only once the current one fully settles.
          const IMG_BATCH = 3;
          let done = 0;
          const total = imgTargets.length;
          const updateProgress = function () {
            genAllLabel.textContent = "Generating image " + done + " / " + total + "…";
            pb.set(total ? done / total : 1, "Generating image " + done + " / " + total + "…");
          };
          const runBatch = function (start) {
            const slice = imgTargets.slice(start, start + IMG_BATCH);
            if (!slice.length) return Promise.resolve();
            return Promise.all(slice.map(function (r) {
              // _aiGenerate catches its own errors and resolves to a
              // boolean, so one slow/failed slot won't reject the batch.
              return r._aiGenerate().then(function (success) {
                done++; if (success) imgOk++; updateProgress();
              });
            })).then(function () { return runBatch(start + IMG_BATCH); });
          };

          // 1) Empty image slots first, in batched-parallel waves, then
          // 2) persona copy (writes to state in place).
          if (total) {
            genAllLabel.textContent = "Generating image 0 / " + total + "…";
            pb.set(0, "Generating image 0 / " + total + "…");
          } else {
            pb.set(0, "No empty image slots");
          }
          runBatch(0)
            .then(function () {
              genAllLabel.textContent = "Filling persona copy…";
              pb.indeterminate("Filling persona copy…");
              return runPersonaCopyFill(s);
            })
            .then(function (personasUpdated) {
              commit();
              const parts = [];
              if (personasUpdated) parts.push(personasUpdated + " persona" + (personasUpdated === 1 ? "" : "s") + " filled");
              parts.push(imgOk + " of " + total + " image" + (total === 1 ? "" : "s") + " generated");
              toast("AI: " + parts.join(" · "));
              genAllBtn.disabled = false; genAllLabel.textContent = origText;
              // Re-render so filled persona copy shows in the pending-
              // text card and new images show their thumbnails.
              renderShell();
            })
            .catch(function (err) {
              if (pb.node.parentNode) pb.node.parentNode.removeChild(pb.node);
              genAllBtn.disabled = false; genAllLabel.textContent = origText;
              toast("AI: " + ((err && err.message) || String(err)));
            });
        });
        genAllBar.appendChild(genAllText);
        genAllBar.appendChild(genAllBtn);
        wrap.appendChild(genAllBar);
        window.HOLO_GEMINI.isConfigured().then(function (configured) {
          if (configured) genAllBar.hidden = false;
        });
      }

      // Group cards render beneath the "Generate all" bar.
      groupCards.forEach(function (card) { wrap.appendChild(card); });

      // CX imagery assignment — explicitly map each iFrame CX component to a
      // still-image slot above (instead of relying on the type/name heuristic).
      const cxCard = cxImageAssignmentCard(s);
      if (cxCard) wrap.appendChild(cxCard);
    }

    // Pending text fields card — inline editors. None of these are
    // required to export; they're surfaced here so the SE can polish
    // default / empty copy in one place. Edits write straight to the
    // canonical state path, so changes show up on the source step too.
    const pending = pendingTextItems(s);
    const pendingCount = pendingTextCount(pending);
    const card = el("div", { class: "bx-card" });
    // Collapsed by default: the Preview step (Step 8) is now the primary
    // place to edit slide copy. These inline editors stay available as a
    // flat list, but tucked behind a disclosure so this step reads as
    // "assets" first. Edits still write straight to the canonical path.
    const details = el("details", { class: "bx-pending-details" });
    const summary = el("summary", { class: "bx-pending-summary" });
    const summaryTitle = el("span", { class: "bx-pending-summary-title" });
    const summaryHint  = el("span", { class: "bx-pending-summary-hint" });
    // Live recount: edits in this card flip an item's `pending` flag, so the
    // header (N) and hint stay honest without a full re-render.
    function refreshSummary() {
      const n = pendingTextCount(pending);
      summaryTitle.textContent = n ? "Text still to update (" + n + ")" : "Text still to update";
      summaryHint.textContent  = n ? " — optional, edit here or in Preview (Step 8)" : " — all defaults filled in";
    }
    refreshSummary();
    summary.appendChild(summaryTitle);
    summary.appendChild(summaryHint);
    details.appendChild(summary);
    const body = el("div", { class: "bx-pending-body" });
    body.appendChild(el("div", { class: "bx-card-sub",
      text: pendingCount
        ? "Default copy you might want to replace before presenting. Saved as you type — none of this blocks export. You can also edit any of this directly on each slide in Step 8 · Preview."
        : "Every field has a value — nothing's blank. You can still fine-tune any of these below or in Step 8 · Preview." }));
    pending.forEach(function (item) {
      body.appendChild(pendingTextRow(item, refreshSummary));
    });
    details.appendChild(body);
    card.appendChild(details);
    wrap.appendChild(card);

    wrap.appendChild(stepFooter("assets"));
    return wrap;
  }

  // Single asset slot row: thumbnail + filename + file picker + clear.
  function assetRow(s, item) {
    // Brand assets live on state.brand.* for back-compat with the
    // Step 1 logo picker — everything else lives on assetLibrary.
    function read() {
      if (item.slot === "brand.logoPath") return s.brand.logoPath || "";
      return (s.assetLibrary && s.assetLibrary[item.slot]) || "";
    }
    function write(value) {
      if (item.slot === "brand.logoPath") { s.brand.logoPath = value; }
      else { s.assetLibrary[item.slot] = value; }
    }

    const wrap = el("div", { class: "bx-asset-row" });
    const thumb = el("div", { class: "bx-asset-thumb" });
    function refreshThumb() {
      thumb.innerHTML = "";
      const v = read();
      if (v) {
        const img = el("img", {
          src: v, alt: item.label, class: "bx-asset-img",
          title: "Click to view larger", role: "button", tabindex: "0",
        });
        const openLightbox = function () {
          const box = el("div", { class: "bx-lightbox-body" }, [
            el("img", { src: v, alt: item.label, class: "bx-lightbox-img" }),
          ]);
          openModal(item.label, box, "bx-asset-lightbox");
        };
        img.addEventListener("click", openLightbox);
        img.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(); }
        });
        thumb.appendChild(img);
      } else {
        thumb.appendChild(el("div", { class: "bx-asset-thumb-placeholder", text: "No file" }));
      }
    }
    refreshThumb();
    wrap.appendChild(thumb);

    // Animated slots (GIF/MP4) — the Gemini image model only returns a
    // still frame, so make that limitation clear up front, not just in a
    // post-generate toast.
    const isAnimated = /Gif$/i.test(item.slot);

    const meta = el("div", { class: "bx-asset-meta" });
    meta.appendChild(el("div", { class: "bx-asset-label", text: item.label }));
    meta.appendChild(el("div", { class: "bx-asset-help", text: item.help }));
    if (isAnimated) {
      meta.appendChild(el("div", { class: "bx-asset-note",
        text: "AI generates a still frame only — upload a GIF or MP4 to animate." }));
    }
    // "Used by:" — show which selected slides this slot feeds, so the SE
    // knows what an upload (or a skip) affects in the running demo.
    const usedBy = slidesUsingSlot(s, item);
    if (usedBy.length) {
      const more = usedBy.length > 4 ? " +" + (usedBy.length - 4) + " more" : "";
      const usedByEl = el("div", { class: "bx-asset-usedby" }, [
        el("span", { class: "bx-asset-usedby-lbl", text: "Used by: " }),
        el("span", { text: usedBy.slice(0, 4).join(" · ") + more }),
      ]);
      meta.appendChild(usedByEl);
    }
    const status = el("div", { class: "bx-asset-status" });
    function refreshStatus() {
      status.innerHTML = "";
      const v = read();
      if (!v) {
        status.appendChild(el("span", { class: "bx-rec-pill tone-gold", text: "Empty" }));
      } else if (/^data:/i.test(v)) {
        status.appendChild(el("span", { class: "bx-rec-pill tone-good", text: "Uploaded" }));
      } else {
        status.appendChild(el("span", { class: "bx-rec-pill tone-good", text: "Path set" }));
      }
      // Surface the Aubrey origin if this slot was seeded by a CX pull
      // and the user hasn't replaced it. Cleared once the slot is empty
      // or has a different value than what Aubrey provided.
      if (item.slot === "productHero" && v && s._aubreySeededProductHero) {
        status.appendChild(el("span", { class: "bx-rec-pill tone-blue", text: "✨ Seeded from Aubrey" }));
      }
    }
    refreshStatus();
    meta.appendChild(status);
    wrap.appendChild(meta);

    const controls = el("div", { class: "bx-asset-controls" });
    const file = el("input", { type: "file", accept: item.accept || "image/*",
      class: "bx-file-input", "aria-label": "Upload " + item.label });
    file.addEventListener("change", function () {
      const f = file.files && file.files[0];
      if (!f) return;
      const mb = f.size / (1024 * 1024);
      // Soft warning over 8MB — data URLs are base64, so config size
      // grows ~33% on top of file size. We let SEs upload anyway since
      // GIFs and persona videos can legitimately be large; we just
      // surface that the export will be a chunky file.
      const sizeNote = mb > 8 ? " (" + mb.toFixed(1) + "MB — heads up, the export config will be larger)" : "";
      const reader = new FileReader();
      reader.onload = function () {
        write(String(reader.result || ""));
        if (item.slot === "productHero") s._aubreySeededProductHero = false;
        refreshThumb(); refreshStatus();
        commit();
        toast(item.label + " uploaded" + sizeNote);
      };
      reader.onerror = function () { toast("Could not read that file"); };
      reader.readAsDataURL(f);
    });
    controls.appendChild(file);

    // ─── Generate with AI (Gemini) ─────────────────────────────
    // Sits alongside the manual uploader. Hidden until the Gemini
    // availability probe resolves true; writes the returned data URL
    // through the same write() path the uploader uses. Exposed via
    // assetRow so "Generate all" can drive it programmatically.
    const aiBtn = el("button", {
      class: "bx-btn bx-btn-ghost bx-ai-btn", type: "button", hidden: true,
      title: isAnimated
        ? "Generates a still frame only — upload a GIF/MP4 to animate"
        : "Generate this image with AI",
    }, [
      el("span", { class: "bx-ai-spark", text: "✦" }),
      el("span", { class: "bx-asset-ai-label",
        text: isAnimated ? "Generate still with AI" : "Generate with AI" }),
    ]);
    const aiLabel = aiBtn.querySelector(".bx-asset-ai-label");
    // Apply a generated/fetched data URL to this slot.
    function applyImage(dataUrl, doneMsg) {
      write(dataUrl);
      if (item.slot === "productHero") s._aubreySeededProductHero = false;
      file.value = "";
      refreshThumb(); refreshStatus(); commit();
      toast(doneMsg);
    }
    function runAiGenerate() {
      const GEMINI = window.HOLO_GEMINI;
      if (!GEMINI || !GEMINI.generateImage) { toast("Gemini is not available"); return Promise.resolve(false); }
      const origText = aiLabel.textContent;
      aiBtn.disabled = true; aiLabel.textContent = "Generating…";

      // AI-generate via Gemini and apply, with a slot-aware note.
      const generate = function () {
        return GEMINI.generateImage({ prompt: buildAssetPrompt(s, item) })
          .then(function (dataUrl) {
            const note = item.slot === "brand.logoPath"
              ? " (AI look-alike)"
              : (/Gif$/i.test(item.slot) ? " (still image — upload a GIF/MP4 to animate)" : "");
            applyImage(dataUrl, item.label + " generated with AI" + note);
            return true;
          });
      };

      // For the logo, try the REAL brand logo first; fall back to AI.
      // Prefer the SE-entered Website; if blank, derive a candidate
      // domain from the customer name (e.g. "TopGolf" → topgolf.com).
      const proj = (s && s.project) || {};
      const logoDomain = (proj.website && String(proj.website).trim())
        ? proj.website
        : domainFromName(proj.customerName);
      const run = (item.slot === "brand.logoPath")
        ? fetchRealLogo(logoDomain).then(function (real) {
            if (real) { applyImage(real, "Real logo fetched"); return true; }
            return generate();
          })
        : generate();

      return run
        .catch(function (err) {
          toast("AI: " + ((err && err.message) || String(err)));
          return false;
        })
        .then(function (ok) {
          aiBtn.disabled = false; aiLabel.textContent = origText;
          return ok;
        });
    }
    aiBtn.addEventListener("click", runAiGenerate);
    if (window.HOLO_GEMINI && window.HOLO_GEMINI.isConfigured) {
      window.HOLO_GEMINI.isConfigured().then(function (ok) { if (ok) aiBtn.hidden = false; });
    }
    controls.appendChild(aiBtn);
    // Expose for the "Generate all" driver in viewAssets.
    wrap._aiGenerate = runAiGenerate;
    wrap._assetSlot = item.slot;
    wrap._hasValue = function () { return Boolean(read()); };

    const clear = el("button", { class: "bx-mini-btn is-danger",
      type: "button", "aria-label": "Clear", text: "Clear" });
    clear.addEventListener("click", function () {
      write(""); file.value = "";
      if (item.slot === "productHero") s._aubreySeededProductHero = false;
      refreshThumb(); refreshStatus(); commit();
    });
    controls.appendChild(clear);

    wrap.appendChild(controls);
    return wrap;
  }

  // The CX-still slots an iFrame CX component can be assigned to. Keep the
  // slot ids in sync with ASSET_CATALOG's "CX component stills" group; the
  // renderer (embeddedCxComponent) reads c.imageSlot to pick the still.
  const CX_IMAGE_SLOTS = [
    { slot: "cxUnifiedProfile", label: "Unified profile still" },
    { slot: "cxInstagramAd",    label: "Instagram ad still" },
    { slot: "cxShopperAgent",   label: "Shopper agent still" },
    { slot: "cxTextConvo",      label: "Agentic text thread still" },
  ];

  // Assets-page panel: one row per iFrame CX component letting the SE
  // explicitly choose which still-image slot it uses, instead of relying on
  // the type/name heuristic. Returns null when there are no CX components.
  function cxImageAssignmentCard(s) {
    const comps = (s.cxComponents || []).filter(Boolean);
    if (!comps.length) return null;
    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: "CX component imagery" }));
    card.appendChild(el("div", { class: "bx-card-sub",
      text: "Assign each iFrame CX component a still image from the slots above. \"Auto\" matches by the component's type/name. Upload or generate the still in the \"CX component stills\" group above; pick which one each component shows here." }));
    comps.forEach(function (c) {
      const row = el("div", { class: "bx-asset-row" });
      const meta = el("div", { class: "bx-asset-meta" });
      meta.appendChild(el("div", { class: "bx-asset-label", text: c.name || "Untitled component" }));
      meta.appendChild(el("div", { class: "bx-asset-help",
        text: (c.type ? c.type + " · " : "") + (c.url || "no URL yet") }));
      row.appendChild(meta);

      const sel = el("select", { class: "bx-select" });
      sel.appendChild(el("option", { value: "", text: "Auto (match by type/name)" }));
      CX_IMAGE_SLOTS.forEach(function (opt) {
        const o = el("option", { value: opt.slot, text: opt.label });
        if ((c.imageSlot || "") === opt.slot) o.setAttribute("selected", "selected");
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        c.imageSlot = sel.value || "";
        commit();
      });
      const controls = el("div", { class: "bx-asset-controls" }, [
        el("div", { class: "bx-field" }, [
          el("label", { class: "bx-label", text: "Image slot" }),
          sel,
        ]),
      ]);
      row.appendChild(controls);
      card.appendChild(row);
    });
    return card;
  }

  // Single pending-text row: label + source chip + inline editor.
  // Read-only items just show a hint (e.g. "no personas added yet").
  function pendingTextRow(item, onChange) {
    const wrap = el("div", { class: "bx-pending-row" });
    const head = el("div", { class: "bx-pending-head" }, [
      el("div", { class: "bx-pending-label", text: item.label }),
      item.source ? el("span", { class: "bx-pending-source", text: item.source }) : null,
    ]);
    wrap.appendChild(head);

    if (item.readonly) {
      wrap.appendChild(el("div", { class: "bx-pending-hint", text: item.hint || "" }));
      return wrap;
    }

    let input;
    if (item.type === "textarea") {
      input = el("textarea", { class: "bx-textarea", placeholder: item.placeholder || "" });
      input.value = item.get();
    } else if (item.type === "select") {
      input = el("select", { class: "bx-input" });
      (item.options || []).forEach(function (opt) {
        const o = el("option", { value: opt.value, text: opt.label });
        input.appendChild(o);
      });
      input.value = item.get();
    } else {
      input = el("input", { type: "text", class: "bx-input",
        placeholder: item.placeholder || "", value: item.get() });
    }
    const status = el("span", { class: "bx-rec-pill tone-gold bx-pending-pill", text: "Empty" });
    function refreshStatus() {
      const filled = !!String(input.value || "").trim();
      // Selects with a sensible blank default ("she/her") shouldn't
      // read as "Empty" — they read as "Default" instead.
      if (item.type === "select" && !filled) {
        status.textContent = "Default";
        status.className = "bx-rec-pill bx-pending-pill tone-gold";
        return;
      }
      status.textContent = filled ? "Saved" : "Empty";
      status.className = "bx-rec-pill bx-pending-pill " + (filled ? "tone-good" : "tone-gold");
    }
    refreshStatus();
    const evt = (item.type === "select") ? "change" : "input";
    input.addEventListener(evt, function () {
      item.set(input.value);
      // Keep `pending` honest so a live recount reflects this edit (empty →
      // filled drops it from the count; pronouns stay opted-out).
      if (item.pending !== false) item.pending = !String(input.value || "").trim();
      refreshStatus();
      commit();
      if (typeof onChange === "function") onChange();
    });
    head.appendChild(status);
    wrap.appendChild(input);
    if (item.hint) wrap.appendChild(el("div", { class: "bx-pending-hint", text: item.hint }));
    return wrap;
  }

  // Side panel for Step 6: short progress summary.
  function sideAssetSummary(body) {
    const s = app.state;
    const items = relevantAssetItems(s);
    if (!items.length) {
      body.appendChild(el("div", { class: "bx-side-empty",
        text: "Pick slides on Step 5 — we'll surface every image slot they use." }));
      return;
    }
    const filled = items.filter(function (it) {
      if (it.slot === "brand.logoPath") return !!(s.brand && s.brand.logoPath);
      return !!(s.assetLibrary && s.assetLibrary[it.slot]);
    }).length;
    body.appendChild(el("div", { class: "bx-side-card" }, [
      el("div", { class: "bx-side-card-title", text: filled + " of " + items.length + " uploaded" }),
      el("div", { class: "bx-side-card-sub",
        text: filled === items.length
          ? "Every relevant slot has an asset. You're ready to preview."
          : "Anything left empty stays as a clean placeholder in the demo." }),
    ]));
  }

  // ─── STEP 6: SLIDE SELECTION (section-grouped) ────────────────
  // Two view modes: "grid" (card thumbnails, default) and "list"
  // (vertical rows with full title + status pill). Persists per
  // browser via localStorage so SEs don't have to re-pick each time.
  function getRecsViewMode() {
    try {
      const v = localStorage.getItem("bx-recs-view");
      return v === "list" ? "list" : "grid";
    } catch (e) { return "grid"; }
  }
  function setRecsViewMode(mode) {
    try { localStorage.setItem("bx-recs-view", mode); } catch (e) {}
  }

  function viewRecommendations() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 5 · Slide Selection",
      "Every slide in your demo — toggle any off",
      "These are the exact slides that will be generated, grouped by section, all on by default. Turn off anything you don't want, rename inline, or expand a card for details."
    ));
    const s = app.state;

    if (!s.recommendations.length) {
      wrap.appendChild(el("div", { class: "bx-empty",
        html: "We need a bit more input before we can recommend things. <strong>Go back to Step 1 or 2</strong> and add a customer, audience, or products." }));
      wrap.appendChild(stepFooter("recs"));
      return wrap;
    }

    // Section-grouped plan (fixed sections from the manifest + demo from RULES).
    const plan = RULES.generateRecommendedNarrativePlan ? RULES.generateRecommendedNarrativePlan(s) : null;

    if (plan) {
      const banner = el("div", { class: "bx-card" });
      banner.appendChild(el("div", { class: "bx-card-title", text: "Your slide plan" }));
      banner.appendChild(el("div", { class: "bx-card-sub", text: "Every generated slide appears below, pre-selected. Unchecking a slide hides it from the preview and the exported deck — it stays here so you can add it back any time." }));
      banner.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
        btn("Build slide plan from selections →", "bx-btn-primary", function () {
          buildSlidePlanFromSelections();
          app.state.step = "preview"; renderShell(); commit();
        }),
        btn("Run Story Quality Check", "bx-btn-ghost", function () { openStoryQualityModal(); }),
      ]));
      wrap.appendChild(banner);

      // View-mode toggle (Grid / List)
      const mode = getRecsViewMode();
      wrap.appendChild(viewModeToggle(mode));

      // Section-grouped recommendation cards
      plan.sections.forEach(function (sec) {
        const c = el("div", { class: "bx-card bx-section-card" });
        const selectedCount = sec.slides.filter(function (r) {
          return r.selectionStatus === "required" || !!s.selectedRecIds[r.id];
        }).length;
        const hiddenCount = sec.slides.length - selectedCount;
        const countText = selectedCount + " of " + sec.slides.length + " selected"
          + (hiddenCount > 0 ? " · " + hiddenCount + " hidden" : "");
        const head = el("div", { class: "bx-section-head" }, [
          el("div", { class: "bx-section-num", text: String(sec.order) }),
          el("div", { class: "bx-section-meta" }, [
            el("div", { class: "bx-section-label", text: sec.label }),
            sec.purpose ? el("div", { class: "bx-section-purpose", text: sec.purpose }) : null,
          ]),
          el("div", { class: "bx-section-count", text: countText }),
        ]);
        c.appendChild(head);

        // Per-section bulk actions
        if (sec.slides.length) {
          c.appendChild(sectionBulkActions(sec));
        }

        if (!sec.slides.length) {
          c.appendChild(el("div", { class: "bx-empty",
            html: "No suggestions for this section yet. Add inputs in earlier steps." }));
        } else if (mode === "grid") {
          const grid = el("div", { class: "bx-rec-grid" });
          sec.slides.forEach(function (r) { grid.appendChild(recGridCard(r)); });
          c.appendChild(grid);
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

  // ─── View-mode segmented toggle (Grid / List) ────────────────
  function viewModeToggle(active) {
    const wrap = el("div", { class: "bx-recs-toolbar" });
    const seg = el("div", { class: "bx-segmented" });
    ["grid", "list"].forEach(function (mode) {
      const b = el("button", {
        type: "button",
        class: "bx-seg-btn" + (mode === active ? " is-on" : ""),
        text: mode === "grid" ? "Grid" : "List",
      });
      b.addEventListener("click", function () {
        if (mode === active) return;
        setRecsViewMode(mode);
        renderMain();
      });
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
    return wrap;
  }

  // ─── Per-section "Select all / Clear" actions ───────────────
  function sectionBulkActions(sec) {
    const s = app.state;
    const bar = el("div", { class: "bx-section-actions" });
    const allLink = el("button", { type: "button", class: "bx-btn-link bx-section-link", text: "Select all" });
    const noneLink = el("button", { type: "button", class: "bx-btn-link bx-section-link", text: "Clear" });
    allLink.addEventListener("click", function () {
      sec.slides.forEach(function (r) { s.selectedRecIds[r.id] = true; });
      s.recommendations.forEach(function (r) { if (s.selectedRecIds[r.id]) r.selected = true; });
      buildSlidePlanFromSelections();
      renderMain(); renderSide(); commit();
    });
    noneLink.addEventListener("click", function () {
      // Set false rather than delete: absent synthetic ids default back ON in
      // recompute(), so a deliberate Clear must record an explicit off-state.
      // Required slides are locked on and skipped — Clear can't remove them.
      sec.slides.forEach(function (r) {
        if (r.selectionStatus === "required") { s.selectedRecIds[r.id] = true; return; }
        s.selectedRecIds[r.id] = false;
      });
      s.recommendations.forEach(function (r) { if (!s.selectedRecIds[r.id]) r.selected = false; });
      buildSlidePlanFromSelections();
      renderMain(); renderSide(); commit();
    });
    bar.appendChild(allLink);
    bar.appendChild(noneLink);
    return bar;
  }

  function recCard(r) {
    const required = r.selectionStatus === "required";
    // Required slides are always on; everything else honours the stored flag.
    const isOn = required || !!app.state.selectedRecIds[r.id];
    const card = el("div", { class: "bx-rec" + (isOn ? " is-on" : "") + (required ? " is-locked" : "") });

    // Real checkbox — keyboard- and screen-reader-accessible.
    const checkboxId = "bx-rec-cb-" + r.id;
    const check = el("input", { type: "checkbox", class: "bx-rec-check", id: checkboxId });
    if (isOn) check.setAttribute("checked", "checked");
    if (required) {
      // Locked on: not user-toggleable, but keep it visibly checked.
      check.setAttribute("disabled", "disabled");
      check.setAttribute("aria-label", "Required slide — always included");
      check.setAttribute("title", "Required slide — always included");
    } else {
      check.addEventListener("change", function () { toggleRec(r.id); });
    }
    check.addEventListener("click", function (e) { e.stopPropagation(); });

    const body = el("div", { class: "bx-rec-body" });

    // Header row: title + a single status pill. Capabilities, layout,
    // audience, and missing-inputs detail moves into the disclosure.
    const row = el("div", { class: "bx-rec-row" });
    const titleInput = el("input", { type: "text", class: "bx-input",
      style: "max-width: 380px; padding: 6px 10px; font-size: 13px; font-weight: 700;",
      "aria-label": "Slide title",
      value: app.state.customRecTitles[r.id] || r.title });
    titleInput.addEventListener("input", function () {
      app.state.customRecTitles[r.id] = titleInput.value; commit();
    });
    titleInput.addEventListener("click", function (e) { e.stopPropagation(); });
    row.appendChild(titleInput);

    // One single status badge — derived from the most important signal.
    row.appendChild(statusPill(r));

    // When deselected, show a muted "Hidden from deck" tag so it reads as
    // parked (re-selectable), not lost.
    if (!isOn) {
      row.appendChild(el("span", { class: "bx-rec-hidden-tag", text: "Hidden from deck" }));
    }

    body.appendChild(row);
    body.appendChild(el("div", { class: "bx-rec-why", text: r.rationale || "Suggested based on your inputs." }));

    // ── Details disclosure (collapsed by default) ─────────────
    const detailsRow = el("details", { class: "bx-rec-details" });
    const summary = el("summary", { class: "bx-rec-details-summary", text: "Details" });
    detailsRow.appendChild(summary);
    const detailsBody = el("div", { class: "bx-rec-details-body" });

    if (r.layout) {
      detailsBody.appendChild(detailRow("Layout", layoutLabelShort(r.layout)));
    }
    if ((r.capabilities || []).length) {
      detailsBody.appendChild(detailRow("Capabilities", r.capabilities.join(" · ")));
    }
    if ((r.audienceTags || []).length) {
      detailsBody.appendChild(detailRow("Audience", r.audienceTags.join(", ")));
    }
    if (r.missingInputs && r.missingInputs.length) {
      detailsBody.appendChild(detailRow("Missing", r.missingInputs.join(", ")));
    }
    if (r.layout === "embeddedCxComponent" && !(app.state.cxComponents || []).length) {
      detailsBody.appendChild(detailRow("Status", "Needs an AubreyDemo URL"));
    }
    if (typeof r.priority === "number") {
      detailsBody.appendChild(detailRow("Score", String(r.priority)));
    }
    detailsRow.appendChild(detailsBody);
    summary.addEventListener("click", function (e) { e.stopPropagation(); });
    body.appendChild(detailsRow);

    // The card itself is a label so clicking anywhere toggles the
    // checkbox — except inputs/buttons/details, which stop propagation.
    const label = el("label", { class: "bx-rec-label", for: checkboxId });
    label.appendChild(check);
    label.appendChild(body);
    card.appendChild(label);
    return card;
  }

  // ─── Grid-mode card: thumbnail + title + corner select badge ──
  // Stays state-compatible with recCard: same selectedRecIds key,
  // same toggleRec call. The thumbnail uses the existing PREVIEW
  // pipeline scaled inside a fixed-aspect frame so all cards align.
  function recGridCard(r) {
    const s = app.state;
    const required = r.selectionStatus === "required";
    const isOn = required || !!s.selectedRecIds[r.id];

    // Build a transient "slide" shape so the preview renderer can
    // run before the user has built the slide plan. This mirrors
    // the real shape buildSlidePlanFromSelections would produce.
    const transientSlide = {
      id: r.id,
      title: s.customRecTitles[r.id] || r.title,
      layout: r.layout,
      sectionId: r.sectionId || (RULES.layoutToSectionId ? RULES.layoutToSectionId(r.layout) : ""),
      capabilities: r.capabilities ? r.capabilities.slice() : [],
      assets: [],
      contentBlocks: ((RULES.LAYOUTS && RULES.LAYOUTS[r.layout] && RULES.LAYOUTS[r.layout].blocks) || []).slice(),
      persona: (s.personas && s.personas[0]) ? s.personas[0].name : null,
      linkedCxComponentIds: [],
      missingInputs: r.missingInputs || [],
      // Per-vignette index so the three intro vignette cards render
      // distinct content instead of all falling back to index 0.
      runtimeIndex: (typeof r.runtimeIndex === "number") ? r.runtimeIndex : 0,
    };

    const cardAttrs = {
      class: "bx-rec-gcard surface" + (isOn ? " is-on" : "") + (required ? " is-locked" : ""),
      role: required ? "img" : "button",
      tabindex: required ? "-1" : "0",
    };
    if (required) cardAttrs["aria-label"] = "Required slide — always included";
    else cardAttrs["aria-pressed"] = isOn ? "true" : "false";
    const card = el("div", cardAttrs);

    // Click anywhere on the card toggles selection (except inputs).
    // Required cards are locked on and never toggle.
    if (!required) {
      const toggle = function (e) { if (e) e.stopPropagation(); toggleRec(r.id); };
      card.addEventListener("click", function (e) {
        if (e.target.closest("input, button, summary, .bx-rec-gcard-title")) return;
        toggle();
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
      });
    }

    // Corner select badge (acts as a visual checkbox / lock indicator)
    const badge = el("span", {
      class: "bx-rec-gcard-badge" + (isOn ? " is-on" : "") + (required ? " is-locked" : ""),
      "aria-hidden": "true",
      title: required ? "Required slide — always included" : "",
    });
    if (required) badge.textContent = "🔒";
    else if (isOn) badge.textContent = "✓";
    card.appendChild(badge);

    // Single status pill in top-right (re-uses existing styles)
    card.appendChild(statusPill(r));

    // Deselected grid card: a corner "Hidden from deck" label, dimmed via CSS.
    if (!isOn) {
      card.appendChild(el("span", { class: "bx-rec-hidden-tag bx-rec-gcard-hidden", text: "Hidden from deck" }));
    }

    // Thumbnail frame holds a scaled-down .hp preview
    const thumb = el("div", { class: "bx-rec-gcard-thumb" });
    try {
      const inner = PREVIEW.renderSlidePreview(transientSlide, s, "compact");
      thumb.appendChild(inner);
    } catch (err) {
      thumb.appendChild(el("div", { class: "bx-rec-gcard-fallback", text: layoutLabelShort(r.layout) }));
    }
    card.appendChild(thumb);

    // Editable title (same field as list mode)
    const title = el("input", {
      type: "text",
      class: "bx-rec-gcard-title",
      "aria-label": "Slide title",
      value: s.customRecTitles[r.id] || r.title,
    });
    title.addEventListener("input", function () {
      s.customRecTitles[r.id] = title.value;
      commit();
    });
    title.addEventListener("click", function (e) { e.stopPropagation(); });
    card.appendChild(title);

    // Subline: layout label
    card.appendChild(el("div", { class: "bx-rec-gcard-meta", text: layoutLabelShort(r.layout) }));

    return card;
  }

  // Single derived status badge. Order of precedence: missing-input >
  // needs-iframe > required > recommended > optional.
  function statusPill(r) {
    if (r.missingInputs && r.missingInputs.length) {
      return el("span", { class: "bx-rec-pill tone-gold", text: "Needs input" });
    }
    if (r.layout === "embeddedCxComponent" && !(app.state.cxComponents || []).length) {
      return el("span", { class: "bx-rec-pill tone-gold", text: "Needs iframe" });
    }
    if (r.selectionStatus === "required")    return el("span", { class: "bx-rec-pill tone-red",  text: "Required" });
    if (r.selectionStatus === "recommended") return el("span", { class: "bx-rec-pill tone-good", text: "Recommended" });
    return el("span", { class: "bx-rec-pill", text: "Optional" });
  }

  function detailRow(label, value) {
    return el("div", { class: "bx-rec-detail-row" }, [
      el("span", { class: "bx-rec-detail-label", text: label }),
      el("span", { class: "bx-rec-detail-value", text: value }),
    ]);
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

  // A required slide is structural to the narrative and cannot be unchecked.
  // Required is derived from the recommendation's selectionStatus.
  function isRequiredRec(id) {
    const list = app.state.recommendations || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].selectionStatus === "required";
    }
    return false;
  }

  function toggleRec(id) {
    // Required slides are locked on — they can never be unchecked, and since
    // they default ON they stay ON. Force-set true defensively and bail.
    if (isRequiredRec(id)) { app.state.selectedRecIds[id] = true; return; }
    app.state.selectedRecIds[id] = !app.state.selectedRecIds[id];
    app.state.recommendations.forEach(function (r) { if (r.id === id) r.selected = app.state.selectedRecIds[id]; });
    // Rebuild the slide plan from the current selections so Preview
    // and Export see exactly what the SE picked.  Without this, the
    // stored state.slides stays frozen at whatever was last built and
    // additional selections never reach the preview / ZIP.
    buildSlidePlanFromSelections();
    renderMain(); renderSide(); commit();
  }

  // ─── STEP 7: PREVIEW ──────────────────────────────────────────
  function viewPreview() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 8 · Preview",
      "Preview the holodeck",
      "Review how the story will feel before downloading the complete demo package. What you see here is what the exported demo will render."
    ));

    // Runtime manifest: every slide the polished /demo template renders,
    // including the hardcoded intro / persona / journey-map / business-value
    // slides — merged with state.slides for the Demo section. SEs see the
    // full deck even before they pick layouts in Step 5.
    const runtimeSlides = (PREVIEW.enumerateRuntimeSlides ? PREVIEW.enumerateRuntimeSlides(app.state) : (app.state.slides || []));

    // ── Summary panel: total / sections / missing / ready? ──
    const s = app.state;
    const slides = s.slides || [];
    const cx = (s.cxComponents || []);
    const cxWithoutUrl = cx.filter(function (c) { return !c.url; }).length;
    const slidesNeedingCx = slides.filter(function (sl) {
      return sl.layout === "embeddedCxComponent" && (!(sl.linkedCxComponentIds || []).length);
    }).length;
    const slidesWithMissing = slides.filter(function (sl) { return (sl.missingInputs || []).length > 0; }).length;
    const sectionsCovered = new Set(runtimeSlides.map(function (sl) { return sl.sectionId; })).size;
    const summary = el("div", { class: "bx-card bx-preview-summary" });
    summary.appendChild(el("div", { class: "bx-card-title", text: "Demo summary" }));
    summary.appendChild(el("div", { class: "bx-summary-grid" }, [
      summaryStat(runtimeSlides.length, "slides total"),
      summaryStat(sectionsCovered + " / 5", "sections covered"),
      summaryStat(cx.length, "CX component" + (cx.length === 1 ? "" : "s")),
      summaryStat(slidesWithMissing, "slides need attention", slidesWithMissing > 0 ? "warn" : "good"),
    ]));
    if (slidesNeedingCx || cxWithoutUrl || slidesWithMissing) {
      const issues = el("ul", { class: "bx-preview-issues" });
      if (slidesNeedingCx)   issues.appendChild(el("li", { text: slidesNeedingCx + " embedded CX slide" + (slidesNeedingCx === 1 ? "" : "s") + " need a link" }));
      if (cxWithoutUrl)      issues.appendChild(el("li", { text: cxWithoutUrl + " CX component" + (cxWithoutUrl === 1 ? "" : "s") + " missing a URL" }));
      if (slidesWithMissing) issues.appendChild(el("li", { text: slidesWithMissing + " slide" + (slidesWithMissing === 1 ? "" : "s") + " flagged with missing inputs" }));
      summary.appendChild(issues);
    } else {
      summary.appendChild(el("div", { class: "bx-help bx-mt-12 bx-help-good",
        text: "✓ Everything looks good. Move on to Export when you're ready." }));
    }
    summary.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Continue to Export →", "bx-btn-primary", function () {
        app.state.step = "export"; renderShell();
      }),
      btn("▶ Preview Full Demo", "bx-btn-secondary", function () { openFullDemoModal(); }),
    ]));
    wrap.appendChild(summary);

    function summaryStat(value, label, tone) {
      return el("div", { class: "bx-summary-stat " + (tone ? "is-" + tone : "") }, [
        el("div", { class: "bx-summary-value", text: String(value) }),
        el("div", { class: "bx-summary-label", text: label }),
      ]);
    }

    // View controls: compact/expanded + by-section/flat
    // (Preview Full Demo button now lives in the summary card above.)
    const toolbar = el("div", { class: "bx-preview-toolbar" }, [
      el("div", { class: "bx-row" }, [
        el("div", { class: "bx-segmented" }, [
          modeBtn("compact",  "Compact"),
          modeBtn("expanded", "Expanded"),
        ]),
        el("div", { class: "bx-segmented" }, [
          groupBtn("by-section", "By section"),
          groupBtn("flat",       "Flat sequence"),
        ]),
      ]),
    ]);
    wrap.appendChild(toolbar);

    if (app.previewGrouping === "by-section") {
      // Section-grouped preview — uses the runtime manifest so SEs see
      // every slide the polished template will render, including the
      // intro / persona / BV slides that aren't in state.slides.
      const sections = (RULES.SLIDE_SECTIONS || []);
      sections.forEach(function (sec) {
        const slidesInSection = runtimeSlides.filter(function (sl) { return sl.sectionId === sec.id; });
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
        slidesInSection.forEach(function (sl, i) {
          const slide = Object.assign({}, sl, { order: i });
          grid.appendChild(makePreviewCard(slide));
        });
        sectionWrap.appendChild(grid);
        wrap.appendChild(sectionWrap);
      });
    } else {
      // Flat sequence — same merged manifest, in order.
      const grid = el("div", { class: "bx-preview-grid bx-preview-" + app.previewMode });
      runtimeSlides.forEach(function (sl, i) {
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
      // Synthetic runtime slides (intro hero, persona spotlight, BV
      // closing, etc.) aren't in state.slides — they're rendered by
      // the template at runtime. Move/remove don't apply to them.
      const handlers = { mode: app.previewMode };
      handlers.onEdit = function (s, anchorBtn) {
        openSlideTextPopover(s, anchorBtn);
      };
      if (!slide.synthetic) {
        handlers.onMoveUp   = function (id) { moveItem(app.state.slides, id, -1); renderSide(); };
        handlers.onMoveDown = function (id) { moveItem(app.state.slides, id, 1); renderSide(); };
        handlers.onRemove   = function (id) {
          app.state.slides = app.state.slides.filter(function (x) { return x.id !== id; });
          renderMain(); renderSide(); commit();
        };
      }
      return PREVIEW.renderPreviewCard(slide, app.state, handlers);
    }
  }

  // ─── Step 8 popover editor (Option #2) ────────────────────────
  // Renders the inline text editor next to whichever preview card
  // the SE clicked "Edit text" on. Edits flow through state-path
  // bindings (synthetic slides) or direct slide fields (state.slides),
  // and re-render the preview card in place so the SE sees their
  // change immediately.
  let _activePopover = null;
  function closeSlidePopover() {
    if (_activePopover && _activePopover.parentNode) {
      _activePopover.parentNode.removeChild(_activePopover);
    }
    _activePopover = null;
    document.removeEventListener("click", onDocClickForPopover, true);
    document.removeEventListener("keydown", onEscForPopover, true);
  }
  function onDocClickForPopover(e) {
    if (!_activePopover) return;
    if (_activePopover.contains(e.target)) return;
    // The Edit-text button itself toggles. If they clicked another
    // Edit button on a different card, let it through (the openSlide…
    // call below will close + reopen).
    if (e.target.closest && e.target.closest(".bx-mini-btn-edit")) return;
    closeSlidePopover();
  }
  function onEscForPopover(e) { if (e.key === "Escape") closeSlidePopover(); }
  function openSlideTextPopover(slide, anchorBtn) {
    closeSlidePopover();
    const card = anchorBtn.closest(".bx-preview");
    if (!card) return;
    const pop = PREVIEW.buildEditorPopover(slide, app.state, {
      onChange: function () {
        commit();
        // Re-render the preview body in place — keeps the popover open
        // and avoids tearing down the whole preview grid on each keystroke.
        const body = card.querySelector(".hp");
        if (body && body.parentNode) {
          const fresh = PREVIEW.renderSlidePreview(slide, app.state, app.previewMode);
          body.parentNode.replaceChild(fresh, body);
        }
      },
      onClose: closeSlidePopover,
    });
    // Anchor the popover absolutely so it sits beside the card no
    // matter where the SE has scrolled. We position it via getBoundingClientRect
    // and let CSS handle responsive collapse (under the card on narrow viewports).
    pop.style.position = "absolute";
    document.body.appendChild(pop);
    const r = card.getBoundingClientRect();
    const popW = 360;
    const margin = 12;
    let left = r.right + margin + window.scrollX;
    let top  = r.top + window.scrollY;
    // If we'd overflow the viewport on the right, flip to the left side.
    if (left + popW > window.innerWidth + window.scrollX - 12) {
      left = Math.max(12 + window.scrollX, r.left + window.scrollX - popW - margin);
    }
    pop.style.left = left + "px";
    pop.style.top  = top  + "px";
    pop.style.width = popW + "px";
    _activePopover = pop;
    // Defer doc-click binding so this very click doesn't close it.
    setTimeout(function () {
      document.addEventListener("click", onDocClickForPopover, true);
      document.addEventListener("keydown", onEscForPopover, true);
    }, 0);
  }

  // Section ordering used by the slide planner.
  const SECTION_ORDER = ["intro", "journey-map", "meet-persona", "demo", "business-value"];

  // Single source of truth for the CX→slide auto-match fallback.
  // Returns a map of cxComponentId -> slideId for every component the
  // SE has NOT explicitly linked but that the builder would auto-assign
  // to an empty embeddedCxComponent slot. Mirrors the fallback inside
  // buildSlidePlanFromSelections (first unassigned component fills the
  // first unlinked embedded slide) so Step 7 can SHOW the same match the
  // build will make — no drift between display and behavior.
  // slideList lets the build pass its freshly-ordered demo slides (before
  // s.slides is reassigned); callers that just want to display the match
  // (Step 7) omit it and we read the current s.slides.
  function computeCxAutoAssignments(state, slideList) {
    const s = state || app.state;
    const out = {};
    const cxAll = s.cxComponents || [];
    const unassignedCx = cxAll.filter(function (c) {
      return !(c.linkedSlideIds && c.linkedSlideIds[0]);
    });
    if (!unassignedCx.length) return out;

    // Slides already linked explicitly by some component are not auto targets.
    const explicitlyTargeted = {};
    cxAll.forEach(function (c) {
      const sid = (c.linkedSlideIds && c.linkedSlideIds[0]) || "";
      if (sid) explicitlyTargeted[sid] = true;
    });

    // Walk demo slides in deck order; the first embeddedCxComponent slide
    // with no explicit link is the auto target for the first unassigned CX.
    const demoSlides = (slideList || s.slides || []).filter(function (sl) {
      return (sl.sectionId || "") === "demo";
    });
    const target = demoSlides.find(function (sl) {
      return sl.layout === "embeddedCxComponent" && !explicitlyTargeted[sl.id];
    });
    if (target) out[unassignedCx[0].id] = target.id;
    return out;
  }

  function buildSlidePlanFromSelections() {
    const s = app.state;
    const existingById = {};
    (s.slides || []).forEach(function (sl) { existingById[sl.id] = sl; });
    // Only DEMO-section recommendations become state.slides. The synthetic
    // intro/journey/persona/bv slides are rendered by buildSlideManifest from
    // the selection directly (they must NOT be pushed into state.slides, or
    // they'd be treated as authored demo slides and double-render).
    const fixedSections = RULES.MANIFEST_SECTIONS || ["intro", "journey-map", "meet-persona", "business-value"];
    const selectedRecs = s.recommendations.filter(function (r) {
      return s.selectedRecIds[r.id] && !r.synthetic && fixedSections.indexOf(r.sectionId || "demo") < 0;
    });

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

    // Build map of slide.id -> [cxComponentId] from explicit user links.
    // Components without a linkedSlideIds entry fall back to "first embedded slot".
    const cxAll = s.cxComponents || [];
    const explicitBySlide = {};
    cxAll.forEach(function (c) {
      const slideId = (c.linkedSlideIds && c.linkedSlideIds[0]) || "";
      if (slideId) {
        explicitBySlide[slideId] = explicitBySlide[slideId] || [];
        explicitBySlide[slideId].push(c.id);
      }
    });
    // Auto-match map (cxId -> slideId) computed once from the SAME helper
    // Step 7 uses to display "Auto-matched to: …", so the slot we fill here
    // is exactly the one shown to the SE. Invert it to slideId -> [cxId].
    const autoBySlide = {};
    // Pass the freshly-ordered recs (each carries id/layout/sectionId, the
    // only fields the helper reads) so the match reflects THIS build, not
    // the previous s.slides.
    const autoMap = computeCxAutoAssignments(s, ordered.map(function (r) {
      return { id: r.id, layout: r.layout, sectionId: r.sectionId || RULES.layoutToSectionId(r.layout) };
    }));
    Object.keys(autoMap).forEach(function (cxId) {
      const sid = autoMap[cxId];
      (autoBySlide[sid] = autoBySlide[sid] || []).push(cxId);
    });

    s.slides = ordered.map(function (r) {
      const id = r.id;
      const existing = existingById[id];
      const persona = (s.personas && s.personas[0]) ? s.personas[0].name : null;
      // Resolve linked CX components for this slide:
      //   1) Honor explicit user links (cxComponent.linkedSlideIds[0] === slide.id).
      //   2) For embeddedCxComponent slides with no explicit link, fall back
      //      to the auto-match map so we don't leave the slot empty.
      let linkedCx = (explicitBySlide[id] || []).slice();
      if (!linkedCx.length && autoBySlide[id]) {
        linkedCx = autoBySlide[id].slice();
      }
      const firstCx = linkedCx.length ? cxAll.find(function (c) { return c.id === linkedCx[0]; }) : null;
      const deviceFrame = firstCx ? (firstCx.deviceFrame || "") : "";

      // PROMOTION RULE: the demo runtime only renders an iframe when
      // slide.layout === "embeddedCxComponent". So if the SE explicitly
      // linked a CX component to this slide, promote the layout — the
      // user's intent is "this slide should be the live screen". We
      // remember the original layout so a later un-link can revert it.
      let effectiveLayout = r.layout;
      const wasExplicitlyLinked = !!(explicitBySlide[id] && explicitBySlide[id].length);
      if (wasExplicitlyLinked && effectiveLayout !== "embeddedCxComponent") {
        effectiveLayout = "embeddedCxComponent";
      }

      // Reuse existing slide so the user's edits (title, notes, assets) survive
      // re-renders, but always refresh the CX wiring from the current links.
      if (existing) {
        existing.linkedCxComponentIds = linkedCx;
        existing.deviceFrame = deviceFrame || existing.deviceFrame || "";
        if (wasExplicitlyLinked) {
          // Record the original layout once so we can revert if the SE
          // later clears the link.
          if (existing.layout !== "embeddedCxComponent" && !existing._originalLayout) {
            existing._originalLayout = existing.layout;
          }
          existing.layout = "embeddedCxComponent";
        } else if (existing._originalLayout && !linkedCx.length) {
          // Link removed — revert to the original recommendation layout.
          existing.layout = existing._originalLayout;
          delete existing._originalLayout;
        }
        return existing;
      }
      return {
        id: id,
        title: s.customRecTitles[id] || r.title,
        layout: effectiveLayout,
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
        deviceFrame: deviceFrame,
        missingInputs: r.missingInputs || [],
        _originalLayout: (wasExplicitlyLinked && r.layout !== "embeddedCxComponent") ? r.layout : undefined,
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
      "Step 9 · Export",
      "Download your demo",
      "Use Complete Demo ZIP for a ready-to-run package. Use Config only when you want to update an existing demo folder."
    ));
    const s = app.state;
    // Use the polished adapter's output for the visible config — this
    // is the file that drives the /demo template, so the SE sees the
    // exact shape they'll get inside the ZIP.  Fall back to the legacy
    // builder config only if the adapter isn't loaded.
    const cfgJs   = (window.HOLO_ADAPTER && window.HOLO_ADAPTER.toPolishedHolodeckConfigJs)
      ? window.HOLO_ADAPTER.toPolishedHolodeckConfigJs(s)
      : CONFIG.toHolodeckConfigJs(s);
    const cfgJson = CONFIG.toJsonString(s);

    // ── Readiness checklist ───────────────────────────────────
    const checks = buildExportChecklist(s);
    const incomplete = checks.filter(function (c) { return !c.done; }).length;
    const checkCard = el("div", { class: "bx-card" });
    checkCard.appendChild(el("div", { class: "bx-card-title", text: "Export readiness" }));
    checkCard.appendChild(el("div", { class: "bx-card-sub",
      text: incomplete === 0
        ? "Everything looks good. You're ready to download."
        : incomplete + " item" + (incomplete === 1 ? "" : "s") + " still need attention. You can export anyway — the placeholders will be flagged in the README." }));
    const list = el("ul", { class: "bx-checklist" });
    checks.forEach(function (c) {
      list.appendChild(el("li", { class: "bx-checklist-item " + (c.done ? "is-done" : "is-pending") }, [
        el("span", { class: "bx-checklist-icon", text: c.done ? "✓" : "○" }),
        el("span", { class: "bx-checklist-label", text: c.label }),
        c.hint ? el("span", { class: "bx-checklist-hint", text: c.hint }) : null,
      ]));
    });
    checkCard.appendChild(list);
    wrap.appendChild(checkCard);

    // ── Primary: Complete Demo ZIP ────────────────────────────
    const zipCard = el("div", { class: "bx-card bx-card-feature" });
    zipCard.appendChild(el("div", { class: "bx-card-title", text: "Download Complete Demo ZIP" }));
    zipCard.appendChild(el("div", { class: "bx-card-sub",
      text: "Use this when you want a ready-to-run demo folder with HTML, CSS, JS, config, assets, and instructions." }));
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
        if (incomplete > 0) {
          if (!confirm("You can export now, but " + incomplete + " item" + (incomplete === 1 ? "" : "s") +
                       " still need attention. Export anyway?")) return;
        }
        toast("Building polished demo ZIP…");
        Promise.resolve(window.HOLO_ZIP.downloadCompleteDemoZip(s)).then(function () {
          toast("Polished demo ZIP downloaded");
        }).catch(function (e) {
          toast("Couldn't build the ZIP: " + (e && e.message || e));
        });
      }),
    ]));
    wrap.appendChild(zipCard);

    // ── Secondary: config-only ─────────────────────────────────
    const c1 = el("div", { class: "bx-card" });
    c1.appendChild(el("div", { class: "bx-card-title", text: "Config only" }));
    c1.appendChild(el("div", { class: "bx-card-sub", text: "Use these to update a demo folder you already have." }));
    c1.appendChild(el("div", { class: "bx-row" }, [
      btn("Download Config JS", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck.config.js", cfgJs, "text/javascript"); toast("Downloaded");
      }),
      btn("Download JSON", "bx-btn-secondary", function () {
        CONFIG.downloadFile("holodeck-builder.json", cfgJson, "application/json"); toast("Downloaded");
      }),
      btn("Copy Config JS", "bx-btn-link", function () {
        CONFIG.copyToClipboard(cfgJs).then(function () { toast("Copied"); });
      }),
      btn("Copy JSON", "bx-btn-link", function () {
        CONFIG.copyToClipboard(cfgJson).then(function () { toast("Copied"); });
      }),
    ]));
    wrap.appendChild(c1);

    // ── Live config preview ───────────────────────────────────
    const c2 = el("div", { class: "bx-card" });
    c2.appendChild(el("div", { class: "bx-card-title", text: "Generated config" }));
    c2.appendChild(el("div", { class: "bx-card-sub", text: "Read-only preview of the holodeck.config.js that will ship in the ZIP." }));
    c2.appendChild(el("pre", { class: "bx-code", text: cfgJs }));
    wrap.appendChild(c2);

    return wrap;
  }

  // Export readiness — the user-facing checklist surfaced on Step 8.
  // Each item has { label, done, hint? }. Order matches the wizard.
  function buildExportChecklist(s) {
    const out = [];
    const setupReady = !!(s.project.customerName && s.project.industry && s.project.audience && s.project.salesStage && (s.project.products || []).length);
    const f = s.storyFoundations || {};
    const foundationsReady = !!(f.businessProblem && f.futureStateVision);
    out.push({ label: "Project setup complete", done: setupReady, hint: setupReady ? "" : "Customer, industry, audience, stage, and products" });
    out.push({ label: "Story foundations populated", done: foundationsReady, hint: foundationsReady ? "" : "Run Extract Story Foundations on Step 2" });
    out.push({ label: "Personas added", done: (s.personas || []).length > 0 });
    out.push({ label: "Story acts captured", done: (s.storyActs || []).length >= 3, hint: ((s.storyActs || []).length >= 3) ? "" : "3+ acts recommended" });
    out.push({ label: "Recommended narrative applied", done: (s.slides || []).length > 0 });
    const cx = s.cxComponents || [];
    out.push({ label: "CX components ready or skipped", done: cx.length > 0 || s._cxSkipped,
               hint: cx.filter(function (c) { return !c.url; }).length > 0 ? "Some components are missing URLs" : "" });
    out.push({ label: "Slide plan reviewed", done: (s.slides || []).length >= 5,
               hint: ((s.slides || []).length >= 5) ? "" : "5+ slides recommended" });

    // Asset readiness — derived from the Step 6 Assets panel. We
    // count how many of the SLOTS THAT MATTER for this deck have an
    // upload, so a deck with no persona doesn't get penalised for an
    // empty persona image. "Done" when at least one of the relevant
    // slots is filled (the rest stay as clean placeholders).
    const cxUrls = cx.filter(function (c) { return c.url; }).length;
    const relevantAssets = relevantAssetItems(s);
    const filledAssets = relevantAssets.filter(function (it) {
      if (it.slot === "brand.logoPath") return !!(s.brand && s.brand.logoPath);
      return !!(s.assetLibrary && s.assetLibrary[it.slot]);
    }).length;
    out.push({
      label: "Demo assets uploaded",
      done: relevantAssets.length === 0 || filledAssets > 0,
      hint: relevantAssets.length === 0
        ? "No image slots needed for this deck."
        : filledAssets + " of " + relevantAssets.length + " uploaded · upload more on Step 6",
    });
    if (cx.length === 0) {
      out.push({
        label: "Live CX scene URLs added",
        done: false,
        hint: "Optional — paste AubreyDemo /frame URLs in Step 7 to embed live screens",
      });
    } else if (cxUrls < cx.length) {
      out.push({
        label: "All CX components have URLs",
        done: false,
        hint: (cx.length - cxUrls) + " of " + cx.length + " missing URLs",
      });
    }

    return out;
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
  function sideCxSummary(body) {
    const s = app.state;
    const components = s.cxComponents || [];
    if (!components.length) {
      body.appendChild(el("div", { class: "bx-side-empty",
        html: "<strong>Optional step.</strong> AubreyDemo CX components let the demo embed live screens. Skip if you don't have any yet." }));
      return;
    }
    components.forEach(function (c) {
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: c.name || "(unnamed)" }));
      const sub = c.url ? (c.type || "web") + " · " + (c.deviceFrame || "desktop") : "URL needed";
      card.appendChild(el("div", { class: "bx-side-card-s", text: sub }));
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
    // Merge the synthetic manifest slides (intro/journey/persona/bv) into the
    // recommendation list so the selector is 1:1 with what gets generated.
    // RULES entries for those four fixed sections never render (the export
    // uses the synthetic slides), so drop them to avoid phantom cards.
    const manifestRecs = RULES.manifestRecommendations ? RULES.manifestRecommendations(s) : [];
    const fixedSections = RULES.MANIFEST_SECTIONS || ["intro", "journey-map", "meet-persona", "business-value"];
    const demoRules = res.recommendations.filter(function (r) {
      return fixedSections.indexOf(r.sectionId || "demo") < 0;
    });
    s.recommendations = manifestRecs.concat(demoRules);
    s.recommendations.forEach(function (r) {
      // Synthetic slides default ON (everything generated is selected);
      // demo recommendations keep the priority>=80 auto-select heuristic.
      if (s.selectedRecIds[r.id] == null) {
        if (r.synthetic || r.priority >= 80) s.selectedRecIds[r.id] = true;
      }
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
    const c0Head = el("div", { class: "bx-row bx-row-between" }, [
      el("div", { class: "bx-card-title", text: "How this works" }),
      btn("Take the tour again", "bx-btn-link", function () { startTour("aiPrompt"); }),
    ]);
    c0.appendChild(c0Head);
    c0.appendChild(el("ol", { class: "bx-numlist" }, [
      el("li", { html: "Review the <strong>SE Inputs</strong> below — we pre-fill them from your project (script, setup fields, extracted foundations). Edit or add anything." }),
      el("li", { text: "Copy the prompt below (your inputs are already baked into it)." }),
      el("li", { text: "Paste it into ChatGPT or Claude." }),
      el("li", { text: "The AI returns a JSON config." }),
      el("li", { html: "Come back here, click <strong>Import AI response</strong>, and paste the JSON. The builder will auto-fill setup, personas, story acts, recommendations, slides, and assets." }),
      el("li", { html: "Or, if Gemini is configured, skip the copy-paste and click <strong>Generate with Gemini</strong>." }),
    ]));
    container.appendChild(c0);

    // ── SE Inputs card — pre-filled from the project, editable ──
    // This is what actually gets injected into the prompt, replacing
    // the old "[Paste customer notes…]" placeholder so the AI works
    // from real context instead of inventing a demo.
    const inputsCard = el("div", { class: "bx-card" });
    inputsCard.appendChild(el("div", { class: "bx-card-title", text: "SE Inputs (what we send the AI)" }));
    inputsCard.appendChild(el("div", { class: "bx-card-sub", text: "Pulled from your project — edit or add anything before generating. Empty here means the AI has nothing to work from." }));
    const inputsArea = el("textarea", { class: "bx-textarea bx-textarea-l" });
    inputsArea.value = AI_PROMPT.buildInputsBlock(app.state);
    inputsCard.appendChild(inputsArea);
    container.appendChild(inputsCard);

    const promptCard = el("div", { class: "bx-card" });
    promptCard.appendChild(el("div", { class: "bx-card-title", text: "AI Prompt" }));
    promptCard.appendChild(el("div", { class: "bx-card-sub", text: "Auto-built from your SE Inputs above. Editing the inputs refreshes this; you can also tweak the prompt directly." }));
    const promptArea = el("textarea", { class: "bx-textarea bx-textarea-xl" });
    promptArea.value = AI_PROMPT.getFullPrompt(inputsArea.value);
    promptCard.appendChild(promptArea);

    // Keep the prompt derived from the inputs box. We track whether
    // the user hand-edited the prompt; once they do, we stop
    // clobbering their edits on every keystroke in the inputs box.
    let promptHandEdited = false;
    promptArea.addEventListener("input", function () { promptHandEdited = true; });
    inputsArea.addEventListener("input", function () {
      if (!promptHandEdited) promptArea.value = AI_PROMPT.getFullPrompt(inputsArea.value);
    });

    const promptRow = el("div", { class: "bx-row bx-mt-12" }, [
      btn("Copy AI Prompt", "bx-btn-primary", function () {
        CONFIG.copyToClipboard(promptArea.value).then(function () { toast("Prompt copied"); });
      }),
      btn("Reset prompt", "bx-btn-secondary", function () {
        promptArea.value = AI_PROMPT.getFullPrompt(inputsArea.value);
        promptHandEdited = false;
        toast("Reset");
      }),
      btn("Import AI response", "bx-btn-primary", function () { openImportModal(null); }),
    ]);
    promptCard.appendChild(promptRow);

    // ── Live Gemini path ──────────────────────────────────────
    // Shown only when the server has GEMINI_API_KEY configured;
    // otherwise the copy-paste flow above is the only option, so
    // we don't surface a button that can't work. The button sends
    // the (possibly edited) prompt straight to Gemini, then routes
    // the JSON it returns through the same import validator the
    // Import modal uses — no second code path for ingestion. We pass
    // the inputs box too so the empty-context guard can check it.
    const GEMINI = window.HOLO_GEMINI;
    if (GEMINI) {
      const geminiBtn = btn("✦ Generate with Gemini", "bx-btn-primary", function () {
        runGeminiFillFields(promptArea.value, inputsArea.value, geminiBtn, geminiStatus);
      });
      geminiBtn.style.display = "none";
      const geminiStatus = el("div", { class: "bx-mt-12" });
      promptRow.appendChild(geminiBtn);
      promptCard.appendChild(geminiStatus);
      GEMINI.isConfigured().then(function (ok) {
        if (ok) geminiBtn.style.display = "";
      });
    }

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

  }

  // ── Gemini: fill fields from the prompt ──────────────────────
  // Sends the prompt to the server proxy with CONFIG_TEMPLATE as the
  // response schema, then feeds the returned JSON through the same
  // VALIDATOR.importConfig seam openImportModal uses, so a generated
  // config and a pasted/imported one travel identical validation.
  function runGeminiFillFields(promptText, inputsText, button, status) {
    const GEMINI = window.HOLO_GEMINI;
    if (!GEMINI) return;
    if (!promptText || !promptText.trim()) { toast("Prompt is empty"); return; }

    status.innerHTML = "";

    // Empty-context guard: without real inputs the AI invents the
    // whole demo, which is worse than useless. Block when the SE
    // Inputs box is effectively empty AND there's no script on state.
    const hasInputs = inputsText && inputsText.trim();
    const hasScript = app.state && app.state.scriptText && app.state.scriptText.trim();
    if (!hasInputs && !hasScript) {
      status.appendChild(el("div", { class: "bx-alert is-error",
        text: "Add a demo script or some context first — go to Step 2 (Script & Story) to paste a script, or fill in the SE Inputs box above. Without it the AI will invent the whole demo." }));
      return;
    }

    const origText = button.textContent;
    button.disabled = true;
    button.textContent = "Generating…";

    // jsonMode (not a responseSchema): the prompt already inlines
    // CONFIG_TEMPLATE and instructs "return ONE valid JSON object".
    // CONFIG_TEMPLATE is a sample config, not an OpenAPI schema, so
    // it can't be a responseSchema — JSON mode + the prompt is the
    // reliable path, and VALIDATOR.importConfig enforces the shape.
    GEMINI.generate({ prompt: promptText, jsonMode: true })
      .then(function (text) {
        // Strip a stray ```json … ``` fence if the model added one.
        const cleaned = String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
        const result = VALIDATOR.importConfig(cleaned);
        if (result.errors && result.errors.length) {
          result.errors.forEach(function (msg) {
            status.appendChild(el("div", { class: "bx-alert is-error", text: msg }));
          });
          return;
        }
        const imported = result.state;
        imported.id = STORE.uid();
        return STORE.saveProject(imported).then(function () {
          (result.warnings || []).forEach(function (msg) {
            status.appendChild(el("div", { class: "bx-alert is-warn", text: msg }));
          });
          goBuilder(imported.id);
          toast("Project created from Gemini");
        });
      })
      .catch(function (err) {
        status.appendChild(el("div", { class: "bx-alert is-error",
          text: "Gemini: " + ((err && err.message) || err) }));
      })
      .then(function () {
        button.disabled = false;
        button.textContent = origText;
      });
  }

  // ─── Feedback view ────────────────────────────────────────────
  // One page, two roles. Everyone gets the submit form; the admin
  // (gated by HOLO_FEEDBACK.isAdmin(), authoritative check is RLS)
  // also gets the triage inbox below it.
  const FEEDBACK_TYPE_LABELS = {
    like: "👍 Like", dislike: "👎 Don't like",
    bug: "🐞 Bug / ticket", complaint: "⚠️ Complaint",
  };
  const FEEDBACK_STATUS_LABELS = {
    new: "New", in_progress: "In progress", resolved: "Resolved",
  };

  // ─── PROFILE PAGE ─────────────────────────────────────────────
  // Two sections:
  //  • Your details (name / title / role) — synced to Neon (`profiles`),
  //    so they follow the SE across devices and pre-populate the presenter
  //    name on new projects.
  //  • Aubrey Demo keys — device-local (localStorage), the canonical entry
  //    point for managing them (moved here from the topbar).
  function renderProfilePage(container) {
    container.replaceChildren();
    container.appendChild(stepHeader(
      "Profile",
      "Your presenter details & connections",
      "Your name, title, and role sync to your account and pre-fill the presenter name on new demos. Aubrey keys stay on this device only."
    ));

    // Working copy edited in place; persisted on Save.
    const draft = Object.assign({ name: "", title: "", role: "" }, app.profile || {});

    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: "Your details" }));
    card.appendChild(el("div", { class: "bx-card-sub",
      text: "Synced to your account. Used to pre-fill the presenter name/title on new projects when you haven't set one." }));

    const grid = el("div", { class: "bx-grid-2 bx-mt-12" });
    grid.appendChild(field({
      label: "Full name", placeholder: "Jordan Rivera", value: draft.name,
      onInput: function (v) { draft.name = v; },
    }));
    grid.appendChild(field({
      label: "Title", help: "(as it should appear when presenting)",
      placeholder: "Principal Solution Engineer", value: draft.title,
      onInput: function (v) { draft.title = v; },
    }));
    grid.appendChild(field({
      label: "Role", help: "(optional — your function/team)",
      placeholder: "Solution Engineering", value: draft.role,
      onInput: function (v) { draft.role = v; },
    }));
    card.appendChild(grid);

    const actions = el("div", { class: "bx-row bx-mt-12" });
    const saveBtn = btn("Save profile", "bx-btn-primary", function () {
      saveBtn.setAttribute("disabled", "disabled");
      const clean = {
        name: String(draft.name || "").trim(),
        title: String(draft.title || "").trim(),
        role: String(draft.role || "").trim(),
      };
      STORE.saveProfile(clean).then(function (saved) {
        app.profile = saved;
        // Refresh the topbar so the avatar initials follow the new name.
        renderTopbar();
        // If a project is open and its presenter fields are still blank,
        // back-fill them now so the just-saved details take effect without
        // needing to reopen the project.
        if (app.state && prepopulatePresenterFromProfile(app.state)) {
          saveActive();
          if (app.view === "builder") renderShell();
        }
        toast("Profile saved");
      }).catch(function () {
        toast("Couldn't save your profile — try again.");
      }).then(function () {
        saveBtn.removeAttribute("disabled");
      });
    });
    actions.appendChild(saveBtn);
    card.appendChild(actions);
    container.appendChild(card);

    // Aubrey Demo keys — device-local. This is now the canonical place to
    // manage them (removed from the topbar).
    container.appendChild(aubreyConnectionsCard("inline"));
  }

  function renderFeedbackPage(container) {
    container.innerHTML = "";
    container.appendChild(stepHeader(
      "Feedback",
      "Tell us what's working — and what isn't",
      "Share what you like, what you don't, or log a bug, ticket, or complaint. The team reads every note."
    ));

    // Admin sees the triage inbox first (top of the page), then the form.
    // Everyone else just gets the form.
    if (FEEDBACK && FEEDBACK.isAdmin()) {
      renderFeedbackInbox(container);
    }

    renderFeedbackForm(container);
  }

  function renderFeedbackForm(container) {
    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: "Send feedback" }));
    card.appendChild(el("div", { class: "bx-card-sub", text: "Your email and the time are attached automatically." }));

    const form = el("div", { class: "bx-feedback-form" });

    // Type — chip-style radio group.
    form.appendChild(el("label", { class: "bx-feedback-flabel", text: "Type" }));
    const typeRow = el("div", { class: "bx-feedback-types" });
    const state = { type: "", rating: 0 };
    FEEDBACK.TYPES.forEach(function (t) {
      const chip = el("button", {
        class: "bx-feedback-type-chip",
        type: "button",
        text: FEEDBACK_TYPE_LABELS[t] || t,
      });
      chip.addEventListener("click", function () {
        state.type = t;
        Array.prototype.forEach.call(typeRow.children, function (c) { c.classList.remove("is-active"); });
        chip.classList.add("is-active");
      });
      typeRow.appendChild(chip);
    });
    form.appendChild(typeRow);

    // Message.
    form.appendChild(el("label", { class: "bx-feedback-flabel", text: "Message" }));
    const message = el("textarea", {
      class: "bx-textarea",
      placeholder: "What happened, what you'd change, or what you liked…",
    });
    form.appendChild(message);

    // Rating — optional 1–5 stars.
    form.appendChild(el("label", { class: "bx-feedback-flabel", text: "Rating (optional)" }));
    const stars = el("div", { class: "bx-feedback-stars" });
    function paintStars() {
      Array.prototype.forEach.call(stars.children, function (s, i) {
        s.classList.toggle("is-on", i < state.rating);
      });
    }
    for (let i = 1; i <= 5; i++) {
      (function (val) {
        const star = el("button", { class: "bx-feedback-star", type: "button", text: "★" });
        star.addEventListener("click", function () {
          state.rating = (state.rating === val) ? 0 : val; // click same star again clears
          paintStars();
        });
        stars.appendChild(star);
      })(i);
    }
    form.appendChild(stars);

    // Context — optional.
    form.appendChild(el("label", { class: "bx-feedback-flabel", text: "Where / context (optional)" }));
    const context = el("input", {
      class: "bx-input",
      type: "text",
      placeholder: "e.g. the Recommendations step, or a specific demo",
    });
    form.appendChild(context);

    // Submit.
    const submitBtn = btn("Send feedback", "bx-btn-primary", function () {
      submitBtn.disabled = true;
      FEEDBACK.submit({
        type: state.type,
        message: message.value,
        rating: state.rating,
        context: context.value,
      }).then(function () {
        toast("Thanks — your feedback was sent");
        // Reset the form.
        state.type = ""; state.rating = 0;
        Array.prototype.forEach.call(typeRow.children, function (c) { c.classList.remove("is-active"); });
        message.value = ""; context.value = ""; paintStars();
      }).catch(function (err) {
        toast(err && err.message ? err.message : "Couldn't send — try again");
      }).then(function () {
        submitBtn.disabled = false;
      });
    });
    form.appendChild(el("div", { class: "bx-row bx-mt-12" }, [submitBtn]));

    card.appendChild(form);
    container.appendChild(card);
  }

  function renderFeedbackInbox(container) {
    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: "Feedback inbox (admin)" }));
    card.appendChild(el("div", { class: "bx-card-sub", text: "All submissions. Filter, then mark each as triaged." }));

    const filter = { type: "", status: "" };

    // Filter bar.
    const bar = el("div", { class: "bx-feedback-filters" });
    function selectFilter(label, key, options, labels) {
      const sel = el("select", { class: "bx-select" });
      sel.appendChild(el("option", { value: "", text: label }));
      options.forEach(function (o) {
        sel.appendChild(el("option", { value: o, text: labels[o] || o }));
      });
      sel.addEventListener("change", function () { filter[key] = sel.value; renderRows(); });
      return sel;
    }
    bar.appendChild(selectFilter("All types", "type", FEEDBACK.TYPES, FEEDBACK_TYPE_LABELS));
    bar.appendChild(selectFilter("All statuses", "status", FEEDBACK.STATUSES, FEEDBACK_STATUS_LABELS));
    card.appendChild(bar);

    const listHost = el("div", { class: "bx-feedback-list" });
    card.appendChild(listHost);
    container.appendChild(card);

    let allRows = [];

    function fmtDate(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    }

    function renderRows() {
      listHost.innerHTML = "";
      const rows = allRows.filter(function (r) {
        if (filter.type && r.type !== filter.type) return false;
        if (filter.status && r.status !== filter.status) return false;
        return true;
      });
      if (!rows.length) {
        listHost.appendChild(el("div", { class: "bx-feedback-empty", text: "No feedback yet." }));
        return;
      }
      rows.forEach(function (r) {
        const row = el("div", { class: "bx-feedback-row" });

        const head = el("div", { class: "bx-feedback-row-head" }, [
          el("span", { class: "bx-feedback-type-tag bx-feedback-type-" + r.type, text: FEEDBACK_TYPE_LABELS[r.type] || r.type }),
          el("span", { class: "bx-feedback-row-email", text: r.submitter_email || "" }),
          r.rating ? el("span", { class: "bx-feedback-row-rating", text: "★".repeat(r.rating) }) : null,
          el("span", { class: "bx-feedback-row-date", text: fmtDate(r.created_at) }),
        ]);
        row.appendChild(head);

        row.appendChild(el("div", { class: "bx-feedback-row-msg", text: r.message || "" }));
        if (r.context) {
          row.appendChild(el("div", { class: "bx-feedback-row-context", text: "Context: " + r.context }));
        }

        // Status control.
        const statusSel = el("select", { class: "bx-select bx-feedback-status-sel" });
        FEEDBACK.STATUSES.forEach(function (s) {
          const opt = el("option", { value: s, text: FEEDBACK_STATUS_LABELS[s] || s });
          if (r.status === s) opt.setAttribute("selected", "selected");
          statusSel.appendChild(opt);
        });
        statusSel.addEventListener("change", function () {
          const next = statusSel.value;
          statusSel.disabled = true;
          FEEDBACK.setStatus(r.id, next).then(function () {
            r.status = next;
            toast("Status updated");
          }).catch(function (err) {
            statusSel.value = r.status; // revert on failure
            toast(err && err.message ? err.message : "Couldn't update status");
          }).then(function () {
            statusSel.disabled = false;
          });
        });
        row.appendChild(el("div", { class: "bx-feedback-row-foot" }, [
          el("span", { class: "bx-feedback-row-foot-label", text: "Status" }),
          statusSel,
        ]));

        listHost.appendChild(row);
      });
    }

    listHost.appendChild(el("div", { class: "bx-feedback-empty", text: "Loading…" }));
    FEEDBACK.listAll().then(function (rows) {
      allRows = rows || [];
      renderRows();
    });
  }

  // ─── New-project chooser ──────────────────────────────────────
  // Two doors: build in the UI from scratch, or seed from an AI prompt.
  function openNewProjectChooser() {
    const wrap = el("div", { class: "bx-newproj-chooser" });
    wrap.appendChild(el("p", { class: "bx-newproj-chooser-lede",
      text: "How do you want to start this holodeck?" }));

    const grid = el("div", { class: "bx-newproj-chooser-grid" });

    function chooserCard(emoji, title, body, onClick) {
      const card = el("button", { class: "bx-newproj-chooser-card", type: "button" }, [
        el("div", { class: "bx-newproj-chooser-emoji", text: emoji }),
        el("div", { class: "bx-newproj-chooser-title", text: title }),
        el("div", { class: "bx-newproj-chooser-body", text: body }),
      ]);
      card.addEventListener("click", onClick);
      return card;
    }

    grid.appendChild(chooserCard(
      "🛠",
      "Create from scratch in the builder",
      "Open an empty project and fill in customer, products, and personas step by step.",
      function () { closeModal(); newProject(); }
    ));
    grid.appendChild(chooserCard(
      "✨",
      "Generate with AI",
      "Paste a demo script or prompt and let AI extract foundations, personas, and slides for you.",
      function () { closeModal(); goAiPrompt(); }
    ));

    wrap.appendChild(grid);

    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);

    openModal("Start a new holodeck", wrap, "bx-modal-card-chooser");
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

  // ─── Guided hints (theme 10) ──────────────────────────────────
  // Shows a dismissible modal once per id. uxHints state (defaulted in
  // project-store) tracks { dismissed: [], neverShowAgain }. A "Don't show
  // again" checkbox persists through commit(). bodyNode is the guide content.
  function guideSeen(id) {
    const h = (app.state && app.state.uxHints) || {};
    if (h.neverShowAgain) return true;
    return (h.dismissed || []).indexOf(id) !== -1;
  }

  // Device-level (not per-project) variant for the per-step contextual tips.
  // A step tip should fire the first time a feature is opened — ONCE EVER on
  // this device — not once per project, so it lives in STORE.getOnboarding().
  function stepTipSeen(id) {
    const ob = STORE.getOnboarding();
    if (ob.neverShowAgain) return true;
    // Soft-migrate: honour legacy per-project dismissals of the original 4.
    const legacy = (app.state && app.state.uxHints && app.state.uxHints.dismissed) || [];
    if (legacy.indexOf(id) !== -1) return true;
    return (ob.stepTipsSeen || []).indexOf(id) !== -1;
  }
  function markStepTipSeen(id, neverAgain) {
    const ob = STORE.getOnboarding();
    if (!ob.stepTipsSeen) ob.stepTipsSeen = [];
    if (ob.stepTipsSeen.indexOf(id) === -1) ob.stepTipsSeen.push(id);
    if (neverAgain) ob.neverShowAgain = true;
    STORE.setOnboarding(ob);
  }
  // anchor (optional): a CSS selector or element. When it resolves to a
  // visible element the guide renders as a coach-mark card pointing at it
  // (onboarding-style); otherwise it falls back to the centered modal.
  function guide(id, title, bodyNode, anchor, scope) {
    const device = scope === "device";
    if (device ? stepTipSeen(id) : guideSeen(id)) return;

    let commitDismiss;
    if (device) {
      // Device-level dismissal (per-step contextual tips).
      commitDismiss = function (neverAgain) { markStepTipSeen(id, neverAgain); };
    } else {
      // Per-project dismissal (legacy default).
      if (!app.state.uxHints) app.state.uxHints = { dismissed: [], version: 1, neverShowAgain: false };
      const h = app.state.uxHints;
      if (!h.dismissed) h.dismissed = [];
      commitDismiss = function (neverAgain) {
        if (h.dismissed.indexOf(id) === -1) h.dismissed.push(id);
        if (neverAgain) h.neverShowAgain = true;
        commit();
      };
    }

    const anchorEl = (typeof anchor === "string") ? document.querySelector(anchor)
      : (anchor && anchor.getBoundingClientRect ? anchor : null);
    const anchorVisible = anchorEl && anchorEl.getClientRects && anchorEl.getClientRects().length > 0;

    if (anchorVisible) {
      openCoachMark(id, title, bodyNode, anchorEl, commitDismiss);
      return;
    }

    // ── Centered-modal fallback ──
    const wrap = el("div", { class: "bx-guide-body" });
    wrap.appendChild(bodyNode);

    const foot = el("div", { class: "bx-guide-foot" });
    const optOut = el("label", { class: "bx-guide-optout" });
    const cb = el("input", { type: "checkbox" });
    optOut.appendChild(cb);
    optOut.appendChild(el("span", { text: "Don't show tips again" }));
    foot.appendChild(optOut);

    const gotIt = el("button", { type: "button", class: "bx-btn bx-btn-primary", text: "Got it" });
    gotIt.addEventListener("click", function () {
      commitDismiss(cb.checked);
      closeModal();
    });
    foot.appendChild(gotIt);
    wrap.appendChild(foot);

    openModal(title, wrap, "bx-guide");
  }

  // Anchored coach-mark. Reuses the same getBoundingClientRect + scroll +
  // right-overflow-flip math as openSlideTextPopover, plus an arrow that
  // points back at the anchor. Dismissal is deferred-bound (doc click /
  // Esc) so the click that opened it doesn't immediately close it.
  let _activeCoach = null;
  function closeCoachMark() {
    if (_activeCoach && _activeCoach.parentNode) _activeCoach.parentNode.removeChild(_activeCoach);
    _activeCoach = null;
    document.removeEventListener("click", onDocClickForCoach, true);
    document.removeEventListener("keydown", onEscForCoach, true);
  }
  function onDocClickForCoach(e) {
    if (_activeCoach && !_activeCoach.contains(e.target)) closeCoachMark();
  }
  function onEscForCoach(e) {
    if (e.key === "Escape") closeCoachMark();
  }
  function openCoachMark(id, title, bodyNode, anchorEl, commitDismiss) {
    closeCoachMark();
    const card = el("div", { class: "bx-coach" });
    card.appendChild(el("div", { class: "bx-coach-arrow" }));
    card.appendChild(el("div", { class: "bx-coach-title", text: title }));
    const body = el("div", { class: "bx-coach-body" });
    body.appendChild(bodyNode);
    card.appendChild(body);

    const foot = el("div", { class: "bx-coach-foot" });
    const optOut = el("label", { class: "bx-guide-optout" });
    const cb = el("input", { type: "checkbox" });
    optOut.appendChild(cb);
    optOut.appendChild(el("span", { text: "Don't show tips again" }));
    foot.appendChild(optOut);
    const gotIt = el("button", { type: "button", class: "bx-btn bx-btn-primary", text: "Got it" });
    gotIt.addEventListener("click", function () {
      commitDismiss(cb.checked);
      closeCoachMark();
    });
    foot.appendChild(gotIt);
    card.appendChild(foot);

    card.style.position = "absolute";
    document.body.appendChild(card);

    const r = anchorEl.getBoundingClientRect();
    const popW = 320;
    const margin = 14;
    let left = r.right + margin + window.scrollX;
    let top  = r.top + window.scrollY;
    let flipped = false;
    if (left + popW > window.innerWidth + window.scrollX - 12) {
      left = Math.max(12 + window.scrollX, r.left + window.scrollX - popW - margin);
      flipped = true;
    }
    if (flipped) card.classList.add("is-flipped");
    card.style.left = left + "px";
    card.style.top  = top  + "px";
    card.style.width = popW + "px";
    _activeCoach = card;
    setTimeout(function () {
      document.addEventListener("click", onDocClickForCoach, true);
      document.addEventListener("keydown", onEscForCoach, true);
    }, 0);
  }

  // ─── First-launch product tour ────────────────────────────────
  // A spotlight walkthrough: a dim backdrop with a cutout over the current
  // anchor + a coach card with Back/Next/Skip and an "N of M" counter. The
  // tour spans two views (home → builder); position lives on app.tour so it
  // survives the renderShell() teardown between them. Reuses the .bx-coach
  // card styling and the getBoundingClientRect+flip math from openCoachMark.
  //
  // Stop: { id, getAnchor(): Element|null, title, body(): Node }
  const HOME_TOUR = [
    {
      id: "home-new",
      getAnchor: function () { return document.querySelector("#bxPage .bx-home-actions .bx-btn-primary") || document.querySelector("#bxPage [data-tour='new-project']"); },
      title: "Start a new demo",
      body: function () { return el("p", { text: "Every demo begins here. A project holds your script, branding, slides, and exports — create one to get started." }); },
    },
    {
      id: "home-profile",
      getAnchor: function () { return document.querySelector("#bxTopbarActions .bx-avatar"); },
      title: "Your profile & keys",
      body: function () { return el("p", { text: "This is you — the initials open your profile. Set your name and title there (they sync to your account and pre-fill the presenter name on new demos). Your optional Aubrey keys live here too, saved on this device; add them once and the builder can pre-fill scripts and embed live demo screens." }); },
    },
    {
      id: "home-open",
      getAnchor: function () { return document.querySelector("#bxPage .bx-home-actions .bx-btn-primary") || document.querySelector("#bxPage [data-tour='new-project']"); },
      title: "Open a project to continue",
      body: function () { return el("p", { text: "Create or open a project and the tour will pick up inside the builder, where the real work happens." }); },
      lastInSegment: true,
    },
  ];
  const BUILDER_TOUR = [
    {
      id: "builder-stepper",
      getAnchor: function () { return document.querySelector("#bxStepList"); },
      title: "Nine guided steps",
      body: function () { return el("p", { text: "These steps take you end to end — from script to a runnable, branded demo. Each one unlocks as the last is ready; tips appear the first time you open each." }); },
    },
    {
      id: "builder-topbar",
      getAnchor: function () { return document.querySelector("#bxTopbarActions"); },
      title: "Save, import & export",
      body: function () { return el("p", { text: "Work autosaves per project. Import an existing config to keep editing, and export a self-contained demo any time from here." }); },
    },
    {
      id: "builder-side",
      getAnchor: function () { return document.querySelector("#bxSide"); },
      title: "Live suggestions",
      body: function () { return el("p", { text: "This panel reacts to what you've entered — surfacing recommended slides, missing inputs, and quality checks as you go." }); },
      lastInSegment: true,
    },
  ];
  // Standalone tour for the AI Prompt view (no handoff to another segment).
  const AI_PROMPT_TOUR = [
    {
      id: "aiPrompt-how",
      getAnchor: function () { return document.querySelector("#bxPage .bx-card"); },
      title: "Generate a config with AI",
      body: function () { return el("p", { text: "Don't build by hand — let ChatGPT or Claude draft the whole config. These steps walk you through it; the builder fills itself in from the result." }); },
    },
    {
      id: "aiPrompt-prompt",
      getAnchor: function () { return document.querySelector("#bxPage .bx-textarea-xl"); },
      title: "Copy this prompt",
      body: function () { return el("p", { text: "Copy this prompt into ChatGPT or Claude, then paste your customer notes and demo context underneath it. The schema is already baked in — nothing else to copy." }); },
    },
    {
      id: "aiPrompt-import",
      getAnchor: function () {
        // Find the "Import AI response" button by its label, scoped to the page.
        const btns = document.querySelectorAll("#bxPage button.bx-btn");
        for (let i = 0; i < btns.length; i++) {
          if (/import ai response/i.test(btns[i].textContent || "")) return btns[i];
        }
        return document.querySelector("#bxPage .bx-btn-primary");
      },
      title: "Import the AI's response",
      body: function () { return el("p", { text: "When the AI returns its JSON, click Import AI response and paste it here — the builder auto-fills setup, personas, story acts, recommendations, slides, and assets." }); },
      lastInSegment: true,
    },
  ];

  let _tourEls = null;          // { dim:[4], ring, card }
  let _tourRepositionRAF = 0;

  function tourSegmentList() {
    return app.tour.segment === "home" ? HOME_TOUR
         : app.tour.segment === "aiPrompt" ? AI_PROMPT_TOUR
         : BUILDER_TOUR;
  }
  function tourTotal() { return tourSegmentList().length; }

  function startTour(segment) {
    // Don't stack: if a tour is already showing this segment, ignore.
    if (app.tour.active && app.tour.segment === segment) return;
    teardownTourDom();
    app.tour.active = true;
    app.tour.segment = segment;
    app.tour.index = 0;
    if (segment === "home") {
      const ob = STORE.getOnboarding();
      if (!ob.homeSeen) { ob.homeSeen = true; STORE.setOnboarding(ob); }
    }
    bindTourListeners();
    renderTourStop();
  }

  function bindTourListeners() {
    window.addEventListener("resize", repositionTour, true);
    window.addEventListener("scroll", repositionTour, true);
    document.addEventListener("keydown", onTourKey, true);
  }
  function unbindTourListeners() {
    window.removeEventListener("resize", repositionTour, true);
    window.removeEventListener("scroll", repositionTour, true);
    document.removeEventListener("keydown", onTourKey, true);
  }
  function onTourKey(e) {
    if (!app.tour.active) return;
    if (e.key === "Escape") { e.preventDefault(); finishTour(true); }
    else if (e.key === "ArrowRight") { e.preventDefault(); tourNext(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); tourBack(); }
  }

  function teardownTourDom() {
    if (!_tourEls) return;
    [].concat(_tourEls.dim, [_tourEls.ring, _tourEls.card]).forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    _tourEls = null;
  }

  function finishTour(skipped) {
    const seg = app.tour.segment;       // capture before the resets below
    teardownTourDom();
    unbindTourListeners();
    app.tour.active = false;
    app.tour.segment = null;
    app.tour.index = 0;
    const ob = STORE.getOnboarding();
    // Skip OR completing the builder segment ends the whole tour for good.
    if (skipped) { ob.tourDone = true; }
    ob.homeSeen = true;
    // The AI Prompt tour is standalone: whenever it ends (finish or skip),
    // mark it seen so it doesn't auto-fire again. The replay link ignores this.
    if (seg === "aiPrompt") ob.aiPromptTourSeen = true;
    STORE.setOnboarding(ob);
  }

  function tourBack() {
    if (app.tour.index > 0) { app.tour.index--; renderTourStop(); }
  }
  function tourNext() {
    const list = tourSegmentList();
    const stop = list[app.tour.index];
    if (app.tour.segment === "home" && stop && stop.lastInSegment) {
      // Hand off to the builder: the user's own New/Open click enters it,
      // and renderShell() resumes the builder segment via resumeOnBuilder.
      app.tour.resumeOnBuilder = true;
      teardownTourDom();
      unbindTourListeners();
      app.tour.active = false;
      app.tour.segment = null;
      app.tour.index = 0;
      const ob = STORE.getOnboarding();
      ob.homeSeen = true;
      STORE.setOnboarding(ob);
      return;
    }
    if (app.tour.index < list.length - 1) { app.tour.index++; renderTourStop(); return; }
    // Past the last stop → segment complete.
    // The builder segment is the end of the first-launch tour; the standalone
    // aiPrompt segment isn't, so it must not set tourDone (finishTour records
    // aiPromptTourSeen on its own).
    if (app.tour.segment === "builder") {
      const ob = STORE.getOnboarding();
      ob.tourDone = true; ob.builderTourSeen = true;
      STORE.setOnboarding(ob);
    }
    finishTour(false);
  }

  // Render the current stop. Retries a few ticks if the anchor isn't in the
  // DOM yet (e.g. just after a view switch), then skips the stop if it never
  // appears so the tour can't get stuck.
  function renderTourStop(attempt) {
    if (!app.tour.active) return;
    attempt = attempt || 0;
    const list = tourSegmentList();
    const stop = list[app.tour.index];
    if (!stop) { finishTour(false); return; }
    const anchor = stop.getAnchor();
    if (!anchor || !anchor.getClientRects || !anchor.getClientRects().length) {
      if (attempt < 8) { setTimeout(function () { renderTourStop(attempt + 1); }, 60); return; }
      // Give up on this stop; advance (or finish if it was the last).
      if (app.tour.index < list.length - 1) { app.tour.index++; renderTourStop(); }
      else { finishTour(false); }
      return;
    }
    drawTourStop(stop, anchor);
  }

  function drawTourStop(stop, anchor) {
    teardownTourDom();

    // Four dim panels frame the anchor rect, leaving a transparent hole.
    const dim = [0, 1, 2, 3].map(function () {
      const d = el("div", { class: "bx-tour-dim" });
      d.addEventListener("click", function (e) { e.stopPropagation(); });
      document.body.appendChild(d);
      return d;
    });
    const ring = el("div", { class: "bx-tour-ring" });
    document.body.appendChild(ring);

    // Coach card (reuse .bx-coach), with a tour footer instead of "Got it".
    const card = el("div", { class: "bx-coach is-tour" });
    card.appendChild(el("div", { class: "bx-coach-arrow" }));
    card.appendChild(el("div", { class: "bx-coach-title", text: stop.title }));
    const body = el("div", { class: "bx-coach-body" });
    body.appendChild(stop.body());
    card.appendChild(body);

    const total = tourTotal();
    const idx = app.tour.index;
    const foot = el("div", { class: "bx-tour-foot" });
    const skip = el("button", { type: "button", class: "bx-tour-skip", text: "Skip tour" });
    skip.addEventListener("click", function () { finishTour(true); });
    foot.appendChild(skip);
    const navWrap = el("div", { class: "bx-tour-nav" });
    navWrap.appendChild(el("span", { class: "bx-tour-progress", text: (idx + 1) + " of " + total }));
    if (idx > 0) {
      const back = el("button", { type: "button", class: "bx-btn bx-btn-ghost", text: "Back" });
      back.addEventListener("click", tourBack);
      navWrap.appendChild(back);
    }
    const isLastBuilder = app.tour.segment === "builder" && idx === total - 1;
    const nextLabel = isLastBuilder ? "Finish" : (stop.lastInSegment ? "Got it" : "Next");
    const next = el("button", { type: "button", class: "bx-btn bx-btn-primary", text: nextLabel });
    next.addEventListener("click", tourNext);
    navWrap.appendChild(next);
    foot.appendChild(navWrap);
    card.appendChild(foot);

    card.style.position = "absolute";
    document.body.appendChild(card);

    _tourEls = { dim: dim, ring: ring, card: card };
    positionTourEls(anchor);
  }

  function positionTourEls(anchor) {
    if (!_tourEls) return;
    const r = anchor.getBoundingClientRect();
    const pad = 6;
    const sx = window.scrollX, sy = window.scrollY;
    const vw = window.innerWidth, vh = window.innerHeight;
    // Hole rect in viewport coords.
    const hx = Math.max(0, r.left - pad), hy = Math.max(0, r.top - pad);
    const hw = Math.min(vw, r.right + pad) - hx, hh = Math.min(vh, r.bottom + pad) - hy;

    function setPanel(d, left, top, width, height) {
      d.style.cssText = "position:fixed;left:" + left + "px;top:" + top + "px;width:" +
        width + "px;height:" + height + "px;";
      d.className = "bx-tour-dim";
    }
    // top, bottom, left, right panels around the hole.
    setPanel(_tourEls.dim[0], 0, 0, vw, hy);
    setPanel(_tourEls.dim[1], 0, hy + hh, vw, Math.max(0, vh - hy - hh));
    setPanel(_tourEls.dim[2], 0, hy, hx, hh);
    setPanel(_tourEls.dim[3], hx + hw, hy, Math.max(0, vw - hx - hw), hh);

    _tourEls.ring.style.cssText = "position:fixed;left:" + hx + "px;top:" + hy +
      "px;width:" + hw + "px;height:" + hh + "px;";

    // Card: to the right of the anchor, flip left on overflow (page coords).
    const card = _tourEls.card;
    const popW = 320, margin = 14;
    let left = r.right + margin + sx;
    let top = r.top + sy;
    let flipped = false;
    if (left + popW > vw + sx - 12) {
      left = Math.max(12 + sx, r.left + sx - popW - margin);
      flipped = true;
    }
    // Keep the card on-screen vertically.
    top = Math.max(12 + sy, Math.min(top, vh + sy - 12 - card.offsetHeight));
    card.classList.toggle("is-flipped", flipped);
    card.style.left = left + "px";
    card.style.top = top + "px";
    card.style.width = popW + "px";
  }

  function repositionTour() {
    if (!app.tour.active || !_tourEls) return;
    if (_tourRepositionRAF) return;
    _tourRepositionRAF = requestAnimationFrame(function () {
      _tourRepositionRAF = 0;
      const stop = tourSegmentList()[app.tour.index];
      const anchor = stop && stop.getAnchor();
      if (anchor && anchor.getClientRects && anchor.getClientRects().length) positionTourEls(anchor);
    });
  }

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
      STORE.saveProject(imported).then(function () {
        (result.warnings || []).forEach(function (msg) {
          status.appendChild(el("div", { class: "bx-alert is-warn", text: msg }));
        });
        closeModal();
        goBuilder(imported.id);
        toast(targetProjectId ? "Project replaced from import" : "New project created from import");
      });
    }));
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Import config", wrap);
  }

  function openExportModal() {
    const cfgJs   = (window.HOLO_ADAPTER && window.HOLO_ADAPTER.toPolishedHolodeckConfigJs)
      ? window.HOLO_ADAPTER.toPolishedHolodeckConfigJs(app.state)
      : CONFIG.toHolodeckConfigJs(app.state);
    const cfgJson = CONFIG.toJsonString(app.state);
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 14px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Use Complete Demo ZIP for a ready-to-run package. Use Config only when updating an existing demo folder." }));
    wrap.appendChild(el("div", { class: "bx-modal-actions", style: "margin-top: 0; margin-bottom: 14px;" }, [
      btn("⬇ Download Complete Demo ZIP", "bx-btn-primary", function () {
        toast("Building polished demo ZIP…");
        Promise.resolve(window.HOLO_ZIP.downloadCompleteDemoZip(app.state)).then(function () {
          toast("Polished demo ZIP downloaded");
        }).catch(function (e) { toast("Couldn't build the ZIP: " + (e && e.message || e)); });
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

  // ═══════════════════════════════════════════════════════════════
  //  AUBREY DEMO INTEGRATION
  //  Additive — every existing manual control on Steps 1, 2, 6 is
  //  untouched. These helpers add a "Pull from Aubrey" affordance
  //  next to each, backed by aubrey-client.js. Credentials live in
  //  a global browser key repository shared by all projects in this
  //  builder, NEVER inside state.
  // ═══════════════════════════════════════════════════════════════

  // Maps the keywords HOLO_PARSER detects in script_data.rows[].talk
  // onto the PRODUCTS chip labels in Step 1. We use the parser's
  // capability buckets — not raw keyword scans — so the mapping
  // stays consistent with the rest of the recommendation engine.
  const AUBREY_CAPABILITY_TO_PRODUCT = {
    agentforce: "Agentforce",
    datacloud:  "Data Cloud",
    commerce:   "Commerce",
    marketing:  "Marketing Cloud",
    service:    "Service Cloud",
    loyalty:    "Loyalty",
  };

  // ── STEP 1 (Connect): credentials + jump-start CTAs ────────
  // Goal of this step: get content flowing in with as little
  // typing as possible. If the user has Aubrey keys, they can
  // pull a script (which then auto-populates brand, persona,
  // products, foundations) and skip straight to Foundations
  // review. If they don't, they can skip to Setup and stay
  // 100% manual. Either path is valid.
  function viewConnect() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 1 · Connect (optional)",
      "Start from your own script & story, or build by hand",
      "The recommended start is to paste or upload your demo script — the builder reads it into customer, persona, products, and story foundations. Already use Aubrey? You can pull a script or brand instead. Prefer to do it yourself? Every step also works with fully manual entry."
    ));

    // ── Script & Story (the recommended starting point) ──────
    // The NATIVE path: the SE pastes/uploads their own demo script in
    // Step 2 — no Aubrey account or keys required. This is the
    // highest-leverage first action that everyone can take, so it
    // leads. (Aubrey is the convenience layer below it.)
    const script = el("div", { class: "bx-card bx-card-feature" });
    script.appendChild(el("div", { class: "bx-card-title", text: "Script & Story" }));
    script.appendChild(el("div", { class: "bx-card-sub",
      text: "The recommended starting point. Paste or upload your own demo script and the builder reads it into customer name, industry, persona, Salesforce products, and story foundations. No account or keys needed — you can change anything afterward." }));
    script.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Paste or upload your script →", "bx-btn-primary", function () {
        app.state.step = "script"; renderShell(); commit();
      }),
    ]));
    wrap.appendChild(script);

    // ── Secondary: pull from Aubrey (script or brand) ────────
    // The convenience layer for SEs who use Aubrey: pull a full script
    // (auto-fills brand + persona + products) or just a brand. Requires
    // Aubrey keys, so it sits below the native script path.
    const aubrey = el("div", { class: "bx-card" });
    aubrey.appendChild(el("div", { class: "bx-card-title", text: "Pull from Aubrey" }));
    aubrey.appendChild(el("div", { class: "bx-card-sub",
      text: "Use Aubrey? Pull a demo script to auto-fill customer, brand colors, persona, products, and story foundations in one go — or pull just a brand for colors and identity. Requires Aubrey keys." }));
    aubrey.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("✨ Pull script from Aubrey →", "bx-btn-secondary",
        function () { openAubreyScriptPicker(); }),
      btn("Or just pull a brand", "bx-btn-secondary",
        function () { openAubreyBrandPicker(); }),
    ]));
    wrap.appendChild(aubrey);

    // Thin status banner that opens the same modal as the topbar
    // button. Keeping one source of truth for credentials means
    // the user can review or swap keys from here OR from any
    // other step via the topbar. Sits under the Aubrey card it serves.
    wrap.appendChild(aubreyKeysBanner());

    // ── Manual path (third) ──────────────────────────────────
    // No keys needed; jump straight to Setup and build by hand.
    const manual = el("div", { class: "bx-card" });
    manual.appendChild(el("div", { class: "bx-card-title", text: "Build it by hand" }));
    manual.appendChild(el("div", { class: "bx-card-sub",
      text: "No script yet? Jump to Setup, add your customer and products by hand, then fill the story foundations yourself. You can come back here any time to paste a script or connect Aubrey." }));
    manual.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("Start with Setup →", "bx-btn-secondary", function () {
        app.state.step = "setup"; renderShell(); commit();
      }),
    ]));
    wrap.appendChild(manual);

    wrap.appendChild(stepFooter("connect"));
    return wrap;
  }

  function getAubreyGlobalKeys() {
    if (!AUBREY) return {};
    if (AUBREY.globalKeys && typeof AUBREY.globalKeys.get === "function") {
      return AUBREY.globalKeys.get();
    }
    // Backward compatibility for older aubrey-client.js payloads.
    return (AUBREY.creds && typeof AUBREY.creds.load === "function") ? AUBREY.creds.load() : {};
  }
  function setAubreyGlobalKeys(partial) {
    if (!AUBREY) return {};
    if (AUBREY.globalKeys && typeof AUBREY.globalKeys.set === "function") {
      return AUBREY.globalKeys.set(partial || {});
    }
    return (AUBREY.creds && typeof AUBREY.creds.save === "function")
      ? AUBREY.creds.save(partial || {})
      : {};
  }

  function sideConnectHint(body) {
    const c = getAubreyGlobalKeys();
    const filled = ["email","demoforgeKey","scriptwriterKey","pocketsicKey"].filter(function (k) { return !!c[k]; }).length;
    const card = el("div", { class: "bx-side-card" });
    card.appendChild(el("div", { class: "bx-side-card-t",
      text: filled === 4 ? "All four set — you're good to pull" :
            filled > 0   ? "Partial setup — pull what you can" :
                           "No keys yet" }));
    card.appendChild(el("div", { style: "margin-top: 6px; color: var(--bx-ink-2); font-size: 11px; line-height: 1.6;",
      text: filled === 4
        ? "Pull a script to land on Foundations with brand + persona + products already filled in."
        : "You can build entirely by hand — every step has its own manual entry." }));
    const manage = el("button", { class: "bx-btn-link", style: "margin-top: 8px; font-size: 11px;",
      type: "button", text: "Manage keys →" });
    manage.addEventListener("click", openAubreyKeysModal);
    card.appendChild(manage);
    body.appendChild(card);
  }

  // ── Connections card on Step 1 ─────────────────────────────
  // mode:
  //   "inline" — used inside Step 1 Connect view (legacy callsite,
  //              still supported but the Connect step now collapses
  //              this to a thin status banner instead).
  //   "modal"  — used by the topbar "Aubrey Keys" modal. Adds masked
  //              previews, per-key Clear, and a "Test connections"
  //              row. The modal is the canonical edit surface — the
  //              topbar button is reachable from every builder step
  //              so mid-project key swaps don't require navigation.
  function aubreyConnectionsCard(mode) {
    mode = mode || "inline";
    if (!AUBREY) {
      const ph = el("div", { class: "bx-card" });
      ph.appendChild(el("div", { class: "bx-card-title", text: "Aubrey Demo connections" }));
      ph.appendChild(el("div", { class: "bx-card-sub", text: "Aubrey client failed to load." }));
      return ph;
    }
    const card = el("div", { class: "bx-card" });
    const head = el("div", { class: "bx-row bx-row-between" });
    const headL = el("div");
    headL.appendChild(el("div", { class: "bx-card-title", text: "Aubrey Demo connections" }));
    headL.appendChild(el("div", { class: "bx-card-sub",
      text: "Optional. Add API keys to pull brands, personas, scripts, and CX components from the Aubrey ecosystem. Keys are global across all projects in this browser and never enter project files or exports." }));
    head.appendChild(headL);
    head.appendChild(aubreyConnectionStatusPill());
    card.appendChild(head);

    const creds = getAubreyGlobalKeys();
    const grid = el("div", { class: "bx-grid-2 bx-mt-12" });

    // Email is treated like any other field but never masked.
    grid.appendChild(credRow({
      mode: mode, name: "email",
      label: "Email", help: "(required by DemoForge & Scriptwriter)",
      placeholder: "you@salesforce.com", value: creds.email, mask: false,
    }));
    grid.appendChild(credRow({
      mode: mode, name: "demoforgeKey",
      label: "DemoForge API key", help: "(starts with dmfg…)",
      placeholder: "dmfg…", value: creds.demoforgeKey, mask: true,
    }));
    grid.appendChild(credRow({
      mode: mode, name: "scriptwriterKey",
      label: "Scriptwriter API key", help: "(starts with dsw_…)",
      placeholder: "dsw_…", value: creds.scriptwriterKey, mask: true,
    }));
    grid.appendChild(credRow({
      mode: mode, name: "pocketsicKey",
      label: "Pocket SIC API key", help: "(starts with psk_…)",
      placeholder: "psk_…", value: creds.pocketsicKey, mask: true,
    }));
    card.appendChild(grid);

    if (mode === "modal") {
      // Test-connections strip — fires one read against each
      // configured API and shows a coloured pill per row.
      const testWrap = el("div", { class: "bx-card bx-mt-12", style: "padding: 12px;" });
      const testHead = el("div", { class: "bx-row bx-row-between" });
      testHead.appendChild(el("div", { class: "bx-card-title", text: "Test connections" }));
      const testBtn = btn("Run test", "bx-btn-secondary", function () { runConnectionTests(testResults); });
      testHead.appendChild(testBtn);
      testWrap.appendChild(testHead);
      const testResults = el("div", { id: "bxAubreyTestResults", class: "bx-row bx-mt-12" });
      testResults.appendChild(connectionTestPill("demoforge",   "DemoForge",   "idle"));
      testResults.appendChild(connectionTestPill("scriptwriter","Scriptwriter","idle"));
      testResults.appendChild(connectionTestPill("pocketsic",   "Pocket SIC",  "idle"));
      testWrap.appendChild(testResults);
      card.appendChild(testWrap);
    }

    card.appendChild(el("div", { class: "bx-help bx-mt-12",
      html: "Each key is independently optional. With all four set, every Aubrey-derived field on Steps 1, 2, and 6 can be pulled with one click — no typing for content Aubrey already produces." }));
    return card;
  }

  // Single credential row. In "inline" mode it's just a plain
  // `field()` like before. In "modal" mode it adds: masked preview
  // by default, Show/Hide toggle, and per-key Clear button.
  function credRow(opts) {
    if (opts.mode !== "modal") {
      return field({
        label: opts.label, help: opts.help,
        placeholder: opts.placeholder, value: opts.value,
        onInput: function (v) { saveAubreyField(opts.name, v); },
      });
    }
    const wrap = el("div", { class: "bx-field" });
    const labelEl = el("label", { class: "bx-label", text: opts.label });
    if (opts.help) labelEl.appendChild(el("span", { class: "bx-help-inline", text: opts.help }));
    wrap.appendChild(labelEl);

    // State local to this row — whether the value is currently
    // masked (only meaningful for `mask: true` rows that have a value).
    let revealed = !opts.mask || !opts.value;

    const row = el("div", { class: "bx-color-row" });
    const input = el("input", { type: "text", class: "bx-input",
      placeholder: opts.placeholder, value: maskValue(opts.value, opts.mask, revealed) });
    // Clicking into the field enters edit mode and shows the
    // full value so the user can edit it without copying out the
    // mask placeholders.
    input.addEventListener("focus", function () {
      if (revealed) return;
      revealed = true;
      input.value = getAubreyGlobalKeys()[opts.name] || "";
    });
    input.addEventListener("input", function () {
      saveAubreyField(opts.name, input.value);
    });
    input.addEventListener("blur", function () {
      // If the value is non-empty and the user typed (so it's
      // already saved), re-mask after blur — but only for keys.
      const stored = getAubreyGlobalKeys()[opts.name] || "";
      if (opts.mask && stored) {
        revealed = false;
        input.value = maskValue(stored, true, false);
      }
    });
    row.appendChild(input);

    if (opts.mask) {
      const showHide = el("button", { type: "button", class: "bx-mini-btn",
        text: revealed && opts.value ? "Hide" : "Show",
        title: "Toggle visibility" });
      showHide.addEventListener("click", function () {
        const stored = getAubreyGlobalKeys()[opts.name] || "";
        revealed = !revealed;
        input.value = revealed ? stored : maskValue(stored, true, false);
        showHide.textContent = revealed && stored ? "Hide" : "Show";
      });
      row.appendChild(showHide);
    }

    const clear = el("button", { type: "button", class: "bx-mini-btn is-danger",
      text: "Clear", title: "Clear this credential" });
    clear.addEventListener("click", function () {
      saveAubreyField(opts.name, "");
      input.value = "";
      revealed = true;
      // Reset Show/Hide label if present.
      const sh = row.querySelector("button.bx-mini-btn:not(.is-danger)");
      if (sh) sh.textContent = "Show";
    });
    row.appendChild(clear);

    wrap.appendChild(row);
    return wrap;
  }

  function maskValue(value, isMaskable, revealed) {
    if (!value) return "";
    if (!isMaskable || revealed) return value;
    // Show first 4 + last 5 characters, masked middle. Keys are
    // long enough (~70 chars) that this is unambiguous; for shorter
    // values (like an email, though we don't mask those) we fall
    // back to all-bullets.
    if (value.length <= 12) return "•".repeat(value.length);
    return value.slice(0, 4) + "…" + value.slice(-5);
  }

  function connectionTestPill(name, label, state) {
    const tone = ({ idle: "", ok: "tone-good", fail: "tone-red", skipped: "tone-gold" })[state] || "";
    const text = ({ idle: label + " — not tested", ok: label + " ✓ ok",
                    fail: label + " ✗ failed", skipped: label + " — no key" })[state] || label;
    return el("span", { class: "bx-rec-pill " + tone,
      "data-aubrey-test": name, text: text });
  }
  function setConnectionTestPill(container, name, state, msg) {
    const old = container.querySelector('[data-aubrey-test="' + name + '"]');
    if (!old) return;
    const labelMap = { demoforge: "DemoForge", scriptwriter: "Scriptwriter", pocketsic: "Pocket SIC" };
    const fresh = connectionTestPill(name, labelMap[name], state);
    if (state === "fail" && msg) fresh.textContent = labelMap[name] + " ✗ " + msg;
    old.parentNode.replaceChild(fresh, old);
  }
  function runConnectionTests(container) {
    const c = getAubreyGlobalKeys();
    // Reset pills to "testing"
    ["demoforge","scriptwriter","pocketsic"].forEach(function (n) {
      setConnectionTestPill(container, n, "idle");
      const old = container.querySelector('[data-aubrey-test="' + n + '"]');
      if (old) old.textContent = ({demoforge:"DemoForge",scriptwriter:"Scriptwriter",pocketsic:"Pocket SIC"})[n] + " · testing…";
    });

    // DemoForge
    if (!c.demoforgeKey || !c.email) setConnectionTestPill(container, "demoforge", "skipped");
    else AUBREY.demoforge.listBrands({ email: c.email, key: c.demoforgeKey })
      .then(function () { setConnectionTestPill(container, "demoforge", "ok"); })
      .catch(function (e) { setConnectionTestPill(container, "demoforge", "fail", e.message); });

    // Scriptwriter
    if (!c.scriptwriterKey || !c.email) setConnectionTestPill(container, "scriptwriter", "skipped");
    else AUBREY.scriptwriter.listScripts({ email: c.email, key: c.scriptwriterKey })
      .then(function () { setConnectionTestPill(container, "scriptwriter", "ok"); })
      .catch(function (e) { setConnectionTestPill(container, "scriptwriter", "fail", e.message); });

    // Pocket SIC
    if (!c.pocketsicKey) setConnectionTestPill(container, "pocketsic", "skipped");
    else AUBREY.pocketsic.listProjects({ key: c.pocketsicKey })
      .then(function () { setConnectionTestPill(container, "pocketsic", "ok"); })
      .catch(function (e) { setConnectionTestPill(container, "pocketsic", "fail", e.message); });
  }

  // The canonical credentials modal — accessible from the topbar
  // (every builder step) and from the Connect step's status banner.
  function openAubreyKeysModal() {
    const wrap = el("div");
    wrap.appendChild(aubreyConnectionsCard("modal"));
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Close", "bx-btn-primary", function () {
      closeModal();
      // Refresh whichever surface might be showing the count
      // (topbar pill, Connect step banner, side panel hint).
      renderTopbar();
      if (app.state && app.state.step === "connect") renderShell();
    }));
    wrap.appendChild(actions);
    openModal("Aubrey Demo keys", wrap);
  }

  // Thin status banner used inside the Step 1 Connect view.
  // Mirrors the topbar pill but lives in the page so first-run
  // users see it before they think to look at the topbar.
  function aubreyKeysBanner() {
    const card = el("div", { class: "bx-card" });
    const head = el("div", { class: "bx-row bx-row-between" });
    const headL = el("div");
    headL.appendChild(el("div", { class: "bx-card-title", text: "🔑 Aubrey Demo keys" }));
    if (AUBREY) {
      const c = getAubreyGlobalKeys();
      const filled = ["email","demoforgeKey","scriptwriterKey","pocketsicKey"]
        .filter(function (k) { return !!c[k]; }).length;
      headL.appendChild(el("div", { class: "bx-card-sub",
        text: filled === 4
          ? "All four set — every Pull-from-Aubrey button on Steps 2 and 6 is ready to go."
          : filled > 0
            ? (filled + " of 4 set — fill in the rest to unlock more pulls.")
            : "No keys yet. Add them once and they'll be available from every step (top-right corner)." }));
    }
    head.appendChild(headL);
    head.appendChild(btn("Manage keys", "bx-btn-secondary", openAubreyKeysModal));
    card.appendChild(head);
    return card;
  }

  // (The Aubrey-keys topbar button was removed — keys are now managed on the
  // Profile page, the canonical entry point. The Connect-step banner and the
  // Profile page's connections card are the remaining surfaces.)
  function saveAubreyField(field, value) {
    const c = getAubreyGlobalKeys();
    c[field] = value;
    setAubreyGlobalKeys(c);
    // Refresh just the status pill so the user sees the chip
    // turn green/grey as they type — no full re-render.
    const pill = $("#bxAubreyStatusPill");
    if (pill && pill.parentNode) {
      pill.parentNode.replaceChild(aubreyConnectionStatusPill(), pill);
    }
  }
  function aubreyConnectionStatusPill() {
    const c = getAubreyGlobalKeys();
    const filled = ["email","demoforgeKey","scriptwriterKey","pocketsicKey"].filter(function (k) { return !!c[k]; }).length;
    const tone = filled === 4 ? "tone-good" : filled > 0 ? "tone-gold" : "";
    return el("span", { id: "bxAubreyStatusPill",
      class: "bx-rec-pill " + tone,
      text: filled === 4 ? "All 4 connected" : (filled + " of 4 set") });
  }

  // ── Shared pre-flight: is the right key present? ───────────
  function ensureAubreyKey(which) {
    const c = getAubreyGlobalKeys();
    const need = {
      demoforge:    { key: "demoforgeKey",    label: "DemoForge",    needsEmail: true  },
      scriptwriter: { key: "scriptwriterKey", label: "Scriptwriter", needsEmail: true  },
      pocketsic:    { key: "pocketsicKey",    label: "Pocket SIC",   needsEmail: false },
    }[which];
    if (!need) return c;
    const hasRequired = (AUBREY && AUBREY.globalKeys && typeof AUBREY.globalKeys.hasRequired === "function")
      ? AUBREY.globalKeys.hasRequired(which)
      : (!!c[need.key] && (!need.needsEmail || !!c.email));
    if (!hasRequired && !c[need.key]) {
      toast("Add your " + need.label + " API key under Setup → Aubrey Demo connections");
      app.state.step = "setup"; renderShell();
      return null;
    }
    if (!hasRequired && need.needsEmail && !c.email) {
      toast("Add your email under Setup → Aubrey Demo connections (required by " + need.label + ")");
      app.state.step = "setup"; renderShell();
      return null;
    }
    return c;
  }

  // ── Brand picker (DemoForge) ───────────────────────────────
  function openAubreyBrandPicker() {
    const creds = ensureAubreyKey("demoforge");
    if (!creds) return;
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a brand from DemoForge. Customer name, industry, tone, primary + secondary color, and logo will be filled in. Existing values get overwritten — manual edits will be replaced." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading brands…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull brand from Aubrey", wrap);

    AUBREY.demoforge.listBrands({ email: creds.email, key: creds.demoforgeKey })
      .then(function (brands) {
        list.innerHTML = "";
        if (!brands.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No brands found for this account." }));
          return;
        }
        brands.forEach(function (b) { list.appendChild(brandRow(b, creds)); });
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "DemoForge: " + e.message }));
      });
  }
  function brandRow(b, creds) {
    const item = el("div", { class: "bx-item" });
    const head = el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: b.brand_name || b.name || ("Brand " + b.id) }),
      el("div", { class: "bx-item-actions" }, [
        btn("Use this brand", "bx-btn-primary", function () {
          importBrandFromAubrey(b.id, creds);
        }),
      ]),
    ]);
    item.appendChild(head);
    const meta = [];
    if (b.industry)    meta.push("Industry: " + b.industry);
    if (b.demo_type)   meta.push("Type: " + b.demo_type);
    if (b.persona_name) meta.push("Persona: " + b.persona_name);
    if (meta.length) item.appendChild(el("div", { class: "bx-help", text: meta.join(" · ") }));
    if (b.description) item.appendChild(el("div", { class: "bx-help bx-mt-6",
      text: String(b.description).slice(0, 180) + (b.description.length > 180 ? "…" : "") }));
    return item;
  }
  function importBrandFromAubrey(brandId, creds) {
    const s = app.state;
    toast("Loading brand from DemoForge…");
    AUBREY.demoforge.getBrand(brandId, { email: creds.email, key: creds.demoforgeKey })
      .then(function (resp) {
        const b = resp.brand;
        if (!b) throw new Error("Brand not found");
        // Fill brand-only fields. Project name is left untouched
        // because it's the user's internal label.
        if (b.brand_name)     s.project.customerName = b.brand_name;
        if (b.website_url)    s.project.website = b.website_url;
        if (b.industry)       s.project.industry = b.industry;
        if (b.tone)           s.project.tone = matchTone(b.tone);
        if (b.color_primary)   s.brand.primaryColor   = b.color_primary;
        if (b.color_secondary) s.brand.secondaryColor = b.color_secondary;
        const logoUrl = b.logo_url;
        const inlineLogo = logoUrl
          ? AUBREY.inlineImageAsDataUrl(logoUrl).catch(function () { return logoUrl; })
          : Promise.resolve("");
        return inlineLogo.then(function (logo) {
          if (logo) s.brand.logoPath = logo;
          // From the Connect step, advance to Setup so the user
          // can fill in the few fields Aubrey doesn't know about
          // (audience, sales stage, presenter, accent color).
          if (s.step === "connect") s.step = "setup";
          recompute(); renderShell(); commit();
          closeModal();
          toast("Brand imported from Aubrey: " + (b.brand_name || ""));
        });
      })
      .catch(function (e) {
        toast("Couldn't import brand: " + e.message);
      });
  }
  // The TONES dropdown only allows a fixed set — Aubrey returns
  // freeform paragraphs, so we softly snap to the closest option
  // by keyword and fall back to leaving it empty.
  function matchTone(text) {
    const t = String(text || "").toLowerCase();
    if (/exec|board|c-suite/.test(t))                       return "Executive";
    if (/vision|inspir/.test(t))                            return "Visionary";
    if (/technic|engineer|developer/.test(t))               return "Technical";
    if (/playful|fun|relax|friendly|casual/.test(t))        return "Playful";
    if (/premium|luxury|sophisticat|refined/.test(t))       return "Premium";
    if (/tactic|practical|how-to|operational/.test(t))      return "Tactical";
    return "";
  }

  // ── Persona picker (DemoForge) ─────────────────────────────
  // Adds (does not replace) a persona derived from the chosen
  // brand's persona_name + persona, and inlines persona_image_url
  // into assetLibrary["persona.portrait"] only if that slot is empty.
  function openAubreyPersonaPicker() {
    const creds = ensureAubreyKey("demoforge");
    if (!creds) return;
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a brand — its persona will be added to your project (existing personas are kept). The persona portrait will be set on Step 6 if that slot is currently empty." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading brands…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull persona from Aubrey", wrap);

    AUBREY.demoforge.listBrands({ email: creds.email, key: creds.demoforgeKey })
      .then(function (brands) {
        list.innerHTML = "";
        if (!brands.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No brands found." }));
          return;
        }
        brands.forEach(function (b) {
          if (!b.persona_name && !b.persona) return;
          list.appendChild(personaBrandRow(b, creds));
        });
        if (!list.children.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No brands with personas in this catalog." }));
        }
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "DemoForge: " + e.message }));
      });
  }
  function personaBrandRow(b, creds) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: (b.persona_name || "Persona") + " · " + (b.brand_name || "") }),
      el("div", { class: "bx-item-actions" }, [
        btn("Add this persona", "bx-btn-primary", function () {
          importPersonaFromAubrey(b, creds);
        }),
      ]),
    ]));
    if (b.persona) {
      item.appendChild(el("div", { class: "bx-help",
        text: String(b.persona).slice(0, 220) + (b.persona.length > 220 ? "…" : "") }));
    }
    return item;
  }
  function importPersonaFromAubrey(b, creds) {
    const s = app.state;
    s.personas = s.personas || [];
    s.assetLibrary = s.assetLibrary || {};
    s.personas.push({
      id: uid("persona_"),
      name: b.persona_name || "",
      role: "",
      goals: "",
      painPoints: "",
      demoRelevance: b.persona || "",
    });
    const portraitTarget = "persona.portrait";
    const slotEmpty = !s.assetLibrary[portraitTarget];
    const portraitJob = (slotEmpty && b.persona_image_url)
      ? AUBREY.inlineImageAsDataUrl(b.persona_image_url)
          .then(function (dataUrl) { if (dataUrl) s.assetLibrary[portraitTarget] = dataUrl; })
          .catch(function () { /* leave slot empty on failure */ })
      : Promise.resolve();
    portraitJob.then(function () {
      recompute(); renderShell(); commit();
      closeModal();
      toast("Persona added: " + (b.persona_name || "(unnamed)"));
    });
  }

  // ── Script picker (Scriptwriter) ───────────────────────────
  // Replaces state.scriptText (matching the manual paste/upload
  // behavior) and auto-runs the existing extraction pipeline.
  // Side-effect: products checkboxes auto-tick from parser output.
  function openAubreyScriptPicker() {
    const creds = ensureAubreyKey("scriptwriter");
    if (!creds) return;
    const s = app.state;
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a script from Scriptwriter. The Synopsis, CX Summary, persona description, and numbered script lines will replace the current Step 2 textarea, then the extractor runs automatically." }));
    if (s.scriptText && s.scriptText.trim()) {
      wrap.appendChild(el("div", { class: "bx-alert is-warn",
        text: "Heads up — your current script text will be replaced." }));
    }
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading scripts…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull script from Aubrey", wrap);

    AUBREY.scriptwriter.listScripts({ email: creds.email, key: creds.scriptwriterKey })
      .then(function (scripts) {
        list.innerHTML = "";
        if (!scripts.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No scripts found." }));
          return;
        }
        scripts.forEach(function (sc) { list.appendChild(scriptRow(sc, creds)); });
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "Scriptwriter: " + e.message }));
      });
  }
  function scriptRow(sc, creds) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: sc.script_name || ("Script " + sc.id) }),
      el("div", { class: "bx-item-actions" }, [
        btn("Use this script", "bx-btn-primary", function () {
          importScriptFromAubrey(sc.id, creds);
        }),
      ]),
    ]));
    const meta = [];
    if (sc.brand_name)   meta.push("Brand: " + sc.brand_name);
    if (sc.industry)     meta.push("Industry: " + sc.industry);
    if (sc.demo_type)    meta.push("Type: " + sc.demo_type);
    if (sc.persona_name) meta.push("Persona: " + sc.persona_name);
    if (meta.length) item.appendChild(el("div", { class: "bx-help", text: meta.join(" · ") }));
    return item;
  }
  function importScriptFromAubrey(scriptId, creds) {
    const s = app.state;
    toast("Loading script from Scriptwriter…");
    AUBREY.scriptwriter.getScript(scriptId, { email: creds.email, key: creds.scriptwriterKey })
      .then(function (sc) {
        if (!sc) throw new Error("Script not found");
        const text = AUBREY.renderScriptRows(sc);
        if (!text) throw new Error("Script has no rows to render");
        s.scriptText = text;

        // Run the existing parser path so foundations + acts +
        // (if missing) personas populate.
        const ok = runScriptExtraction();
        if (ok) autoTickProductsFromScript(s);

        // Fill empty brand / customer / persona fields from the
        // script's brand metadata. We never overwrite a value the
        // user has already set. Color lookup goes through DemoForge
        // since Scriptwriter only carries name + logo, not hexes.
        seedBrandFromScript(sc, creds);

        // If we pulled from Connect (Step 1), jump straight to
        // Foundations review — that's the point of the Aubrey
        // happy path. From Step 2, stay on Script so the user can
        // tweak personas/acts before moving on.
        if (s.step === "connect" && ok) s.step = "foundations";

        closeModal();
        recompute(); renderShell(); commit();
      })
      .catch(function (e) {
        toast("Couldn't import script: " + e.message);
      });
  }

  // Fills any empty Setup / brand / persona field from a Scriptwriter
  // script payload. Then, if DemoForge creds are present, looks up
  // the matching brand (by brand_name) and fills color_primary /
  // color_secondary if those slots are still at their defaults.
  // Existing user values are preserved everywhere.
  function seedBrandFromScript(sc, creds) {
    const s = app.state;
    if (!s.project.customerName && sc.brand_name)   s.project.customerName = sc.brand_name;
    if (!s.project.website      && sc.website_url)  s.project.website      = sc.website_url;
    if (!s.project.industry     && sc.industry)     s.project.industry     = sc.industry;

    // Persona — only if there's no persona at all, or the existing
    // first persona is empty. The script-extraction path may have
    // already added one from the persona description; this step
    // just makes sure the name + paragraph are filled in.
    s.personas = s.personas || [];
    if (sc.persona_name || sc.persona) {
      let persona = s.personas[0];
      if (!persona) {
        persona = { id: uid("persona_"), name: "", role: "", goals: "", painPoints: "", demoRelevance: "" };
        s.personas.push(persona);
      }
      if (!persona.name && sc.persona_name)   persona.name = sc.persona_name;
      if (!persona.demoRelevance && sc.persona) persona.demoRelevance = sc.persona;
    }

    // Brand colors live in DemoForge, not Scriptwriter. If the user
    // has a DemoForge key + email, look up the matching brand by
    // name and fill primary/secondary if still default. Default
    // values come from project-store newBlankState().
    const DEFAULT_PRIMARY = "#b22234";
    const DEFAULT_SECONDARY = "#1a5fa0";
    const stillDefaultColors =
      (s.brand.primaryColor || DEFAULT_PRIMARY) === DEFAULT_PRIMARY &&
      (s.brand.secondaryColor || DEFAULT_SECONDARY) === DEFAULT_SECONDARY;
    const noLogoYet = !s.brand.logoPath;

    if (creds.demoforgeKey && creds.email && (stillDefaultColors || noLogoYet)) {
      AUBREY.demoforge.listBrands({ email: creds.email, key: creds.demoforgeKey })
        .then(function (brands) {
          const target = (sc.brand_name || "").trim().toLowerCase();
          const match = brands.find(function (b) {
            return (b.brand_name || "").trim().toLowerCase() === target;
          });
          if (!match) return;
          if (stillDefaultColors) {
            if (match.color_primary)   s.brand.primaryColor   = match.color_primary;
            if (match.color_secondary) s.brand.secondaryColor = match.color_secondary;
          }
          // Inline the logo so exports stay self-contained.
          const logoUrl = match.logo_url || sc.logo_url;
          if (noLogoYet && logoUrl) {
            return AUBREY.inlineImageAsDataUrl(logoUrl)
              .then(function (data) { if (data) s.brand.logoPath = data; })
              .catch(function () { s.brand.logoPath = logoUrl; });
          }
        })
        .then(function () {
          renderShell(); commit();
        })
        .catch(function () { /* silent — colors stay at defaults */ });
    } else if (noLogoYet && sc.logo_url) {
      // No DemoForge creds but Scriptwriter gave us a logo URL — use it.
      AUBREY.inlineImageAsDataUrl(sc.logo_url)
        .then(function (data) { if (data) { s.brand.logoPath = data; renderShell(); commit(); } })
        .catch(function () { /* leave empty */ });
    }
  }
  function autoTickProductsFromScript(s) {
    if (!PARSER || !PARSER.extractCapabilityMoments) return [];
    const buckets = PARSER.extractCapabilityMoments(s.scriptText || "");
    const detected = [];
    Object.keys(AUBREY_CAPABILITY_TO_PRODUCT).forEach(function (k) {
      if ((buckets[k] || []).length) detected.push(AUBREY_CAPABILITY_TO_PRODUCT[k]);
    });
    if (!detected.length) return [];
    s.project.products = s.project.products || [];
    const added = [];
    detected.forEach(function (p) {
      if (s.project.products.indexOf(p) === -1) {
        s.project.products.push(p); added.push(p);
      }
    });
    s._aubreyAutoTickedProducts = (s._aubreyAutoTickedProducts || []).concat(added);
    if (added.length) {
      toast("Auto-ticked from script: " + added.join(", "));
    }
    return added;
  }

  // ── CX components picker (Pocket SIC) ──────────────────────
  function openAubreyCxPicker() {
    const creds = ensureAubreyKey("pocketsic");
    if (!creds) return;
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a Pocket SIC project. Each scene becomes a CX component (iframable scene URL), with type and device frame auto-mapped from channel. Existing CX components are kept." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading projects…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull CX components from Aubrey", wrap);

    AUBREY.pocketsic.listProjects({ key: creds.pocketsicKey })
      .then(function (projects) {
        list.innerHTML = "";
        if (!projects.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No Pocket SIC projects found." }));
          return;
        }
        projects.forEach(function (p) { list.appendChild(pocketProjectRow(p, creds)); });
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "Pocket SIC: " + e.message }));
      });
  }
  function pocketProjectRow(p, creds) {
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: p.name || ("Project " + p.id) }),
      el("div", { class: "bx-item-actions" }, [
        btn("Browse scenes →", "bx-btn-secondary", function () {
          openAubreyCxScenePicker(p, creds);
        }),
      ]),
    ]));
    const meta = [];
    if (p.brand_name)   meta.push("Brand: " + p.brand_name);
    if (p.industry)     meta.push("Industry: " + p.industry);
    if (p.persona_name) meta.push("Persona: " + p.persona_name);
    if (meta.length) item.appendChild(el("div", { class: "bx-help", text: meta.join(" · ") }));
    return item;
  }
  function openAubreyCxScenePicker(project, creds) {
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick the scenes you want to import as CX components. The first 'site' scene's hero image will be inlined into Step 6's productHero slot if that slot is empty." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading scenes…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    const importBtn = btn("Import selected", "bx-btn-primary", function () { /* set after load */ });
    importBtn.disabled = true;
    actions.appendChild(importBtn);
    actions.appendChild(btn("Back", "bx-btn-secondary", function () { openAubreyCxPicker(); }));
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pocket SIC · " + (project.name || "Project " + project.id), wrap);

    AUBREY.pocketsic.getScenes(project.id, { key: creds.pocketsicKey })
      .then(function (scenes) {
        list.innerHTML = "";
        if (!scenes.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "This project has no scenes." }));
          return;
        }
        const checkboxes = [];
        scenes.forEach(function (sc) {
          const row = el("div", { class: "bx-item" });
          const cb = el("input", { type: "checkbox", style: "margin-right: 10px;" });
          cb.checked = true; checkboxes.push({ cb: cb, scene: sc });
          const label = el("label", { class: "bx-row" });
          label.appendChild(cb);
          label.appendChild(el("div", {}, [
            el("div", { class: "bx-item-handle", text: sc.name || ("Scene " + sc.id) }),
            el("div", { class: "bx-help", text: "Channel: " + (sc.channel || "?") +
              " · URL: " + AUBREY.pocketsic.sceneUrl(sc.id) }),
          ]));
          row.appendChild(label);
          list.appendChild(row);
        });
        importBtn.disabled = false;
        importBtn.onclick = function () {
          const picked = checkboxes.filter(function (x) { return x.cb.checked; }).map(function (x) { return x.scene; });
          importScenesFromAubrey(picked);
        };
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "Pocket SIC: " + e.message }));
      });
  }
  function importScenesFromAubrey(scenes) {
    if (!scenes.length) { toast("Nothing selected"); return; }
    const s = app.state;
    s.cxComponents = s.cxComponents || [];
    s.assetLibrary = s.assetLibrary || {};
    scenes.forEach(function (sc) {
      const cx = AUBREY.sceneToCxComponent(sc);
      cx.id = uid("cx_");
      s.cxComponents.push(cx);
    });
    s._cxSkipped = false;

    // Side-effect: seed productHero from the first site scene's
    // hero image — only if the slot is currently empty (no
    // overwriting manual uploads).
    const heroUrl = AUBREY.pickProductHeroImage(scenes);
    const seedJob = (heroUrl && !s.assetLibrary["productHero"])
      ? AUBREY.inlineImageAsDataUrl(heroUrl)
          .then(function (dataUrl) {
            if (dataUrl) {
              s.assetLibrary["productHero"] = dataUrl;
              s._aubreySeededProductHero = true;
              toast("productHero seeded from Aubrey site scene");
            }
          })
          .catch(function () { /* ignore — user can upload manually */ })
      : Promise.resolve();

    seedJob.then(function () {
      closeModal();
      recompute(); renderShell(); commit();
      toast("Imported " + scenes.length + " CX component" + (scenes.length === 1 ? "" : "s"));
    });
  }

  // ─── Auth: login view ─────────────────────────────────────────
  // Passwordless: enter @salesforce.com email → emailed 6-digit code →
  // in. Same path for new and returning users (OTP sign-in auto-creates
  // the account). @salesforce.com is enforced client-side here (UX) and
  // authoritatively server-side via RLS on the verified JWT email claim.
  function renderLoginPage(wrap) {
    // step: "email" → enter address, "code" → enter the emailed OTP.
    const ui = { step: "email", email: "", otp: "", busy: false, error: "", notice: "" };

    function field(labelText, type, getKey) {
      const input = el("input", { class: "bx-input", type: type, value: ui[getKey] || "" });
      input.addEventListener("input", function () { ui[getKey] = input.value; });
      return { wrap: el("label", { class: "bx-field" }, [
        el("span", { class: "bx-field-label", text: labelText }), input,
      ]), input: input };
    }

    function paint() {
      wrap.innerHTML = "";
      const card = el("div", { class: "bx-login-card" });

      card.appendChild(el("div", { class: "bx-firstrun-mark", text: "🪐" }));
      card.appendChild(el("h1", { class: "bx-main-title",
        text: ui.step === "code" ? "Check your email" : "Holodeck Builder" }));
      card.appendChild(el("p", { class: "bx-main-sub", text:
        ui.step === "code"
          ? ("We sent a 6-digit code to " + ui.email + ". Enter it to sign in.")
          : "Enter your Salesforce email and we'll send you a sign-in code." }));

      if (ui.error)  card.appendChild(el("div", { class: "bx-alert is-error", text: ui.error }));
      if (ui.notice) card.appendChild(el("div", { class: "bx-alert is-warn", text: ui.notice }));

      if (ui.step === "code") {
        const otp = field("Sign-in code", "text", "otp");
        otp.input.setAttribute("inputmode", "numeric");
        otp.input.setAttribute("autocomplete", "one-time-code");
        card.appendChild(otp.wrap);
        card.appendChild(actionBtn(ui.busy ? "Verifying…" : "Verify & continue", "bx-btn-primary is-block", doVerify));
        card.appendChild(el("button", { class: "bx-link",
          on: { click: function () { if (!ui.busy) doResend(); } },
          text: "Resend code" }));
        card.appendChild(el("button", { class: "bx-link",
          on: { click: function () { if (!ui.busy) { ui.step = "email"; ui.otp = ""; ui.error = ""; ui.notice = ""; paint(); } } },
          text: "← Use a different email" }));
        wrap.appendChild(card);
        return;
      }

      const emailF = field("Salesforce email", "email", "email");
      emailF.input.setAttribute("autocomplete", "username");
      emailF.input.setAttribute("placeholder", "you@salesforce.com");
      card.appendChild(emailF.wrap);

      card.appendChild(actionBtn(ui.busy ? "Sending…" : "Email me a code", "bx-btn-primary is-block", doRequestCode));

      wrap.appendChild(card);
    }

    function guardEmail() {
      if (!AUTH.isSalesforceEmail(ui.email)) {
        ui.error = "Use your @salesforce.com email.";
        paint();
        return false;
      }
      return true;
    }

    function doRequestCode() {
      if (ui.busy || !guardEmail()) return;
      ui.busy = true; ui.error = ""; paint();
      AUTH.requestCode(ui.email)
        .then(function () { ui.busy = false; ui.step = "code"; ui.notice = ""; paint(); })
        .catch(function (err) { ui.busy = false; ui.error = (err && err.message) || "Could not send a code."; paint(); });
    }

    function doResend() {
      ui.busy = true; ui.error = ""; paint();
      AUTH.requestCode(ui.email)
        .then(function () { ui.busy = false; ui.notice = "A new code is on its way."; ui.error = ""; paint(); })
        .catch(function (err) { ui.busy = false; ui.error = (err && err.message) || "Could not resend the code."; paint(); });
    }

    function doVerify() {
      if (ui.busy) return;
      ui.busy = true; ui.error = ""; paint();
      AUTH.verifyOtp(ui.email, ui.otp)
        .then(function () { onAuthenticated(); })
        .catch(function (err) { ui.busy = false; ui.error = (err && err.message) || "That code didn't work."; paint(); });
    }

    paint();
  }

  // Transition from the login view into the authenticated app: migrate
  // any local work into the account, then land on home.
  function onAuthenticated() {
    // Load the synced profile up front so it's available to pre-populate the
    // presenter name when a project opens. Best-effort: a failure leaves
    // app.profile as a blank shape and never blocks the boot chain.
    const loadProfile = (STORE && STORE.loadProfile)
      ? STORE.loadProfile().then(function (p) { app.profile = p; }).catch(function () { app.profile = { name: "", title: "", role: "" }; })
      : Promise.resolve();
    return loadProfile
      .then(function () { return STORE.migrateLegacyIfPresent(); })
      .then(function () { return STORE.migrateLocalToAccount(); })
      .then(function () { return STORE.flushDirty(); })
      .then(function () { goHome(); });
  }

  // Seed the active project's presenter fields from the synced profile when
  // they're still empty. Idempotent — never overwrites an SE-typed value, and
  // a no-op when there's no profile/name. Returns true if anything changed.
  function prepopulatePresenterFromProfile(state) {
    if (!state || !state.project || !app.profile) return false;
    let changed = false;
    if (!String(state.project.presenterName || "").trim() && app.profile.name) {
      state.project.presenterName = app.profile.name; changed = true;
    }
    if (!String(state.project.presenterTitle || "").trim() && app.profile.title) {
      state.project.presenterTitle = app.profile.title; changed = true;
    }
    return changed;
  }

  function signOut() {
    // The local session must end and the UI must land on login regardless of
    // whether the network sign-out or cache-clear succeeds. We (1) guard each
    // async step so a rejection can't strand the chain, and (2) wrap the whole
    // thing in try/catch so a synchronous throw (e.g. AUTH/STORE somehow
    // undefined) still flips the view. toLogin() is the single transition.
    function toLogin() {
      app.view = "login";
      app.state = null;
      try { render(); } catch (e) {
        if (typeof console !== "undefined" && console.warn) console.warn("[holo] sign-out render failed:", e);
      }
    }
    try {
      const signedOut = (AUTH && AUTH.signOut) ? AUTH.signOut() : Promise.resolve();
      Promise.resolve(signedOut)
        .catch(function () { /* AUTH.signOut already clears locally on error */ })
        .then(function () { return (STORE && STORE.clearCache) ? STORE.clearCache() : null; })
        .catch(function () { /* cache clear is best-effort */ })
        .then(toLogin)
        .catch(toLogin); // final guard: never skip the view flip
    } catch (e) {
      if (typeof console !== "undefined" && console.warn) console.warn("[holo] sign-out failed:", e);
      toLogin();
    }
  }

  // ─── Boot ─────────────────────────────────────────────────────
  function boot() {
    $("#bxModal").addEventListener("click", function (e) {
      if (e.target === $("#bxModal")) closeModal();
    });
    document.addEventListener("click", function (e) {
      const action = e.target.getAttribute && e.target.getAttribute("data-action");
      if (action === "close-modal") closeModal();
    });

    // Auth gate: no Data API calls until we have a verified session.
    AUTH.init().then(function (user) {
      if (!user) {
        app.view = "login";
        render();
        return;
      }
      // Authenticated: lift legacy/local work, retry any dirty rows, land home.
      onAuthenticated();
    });
  }

  boot();
})();
