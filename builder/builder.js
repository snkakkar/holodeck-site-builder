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
  // 9-step guided flow. Story used to be one step doing three things
  // (paste, foundations, regenerate). Splitting it into Script /
  // Foundations / Narrative makes each user decision its own surface
  // with one obvious next action. The "Demos" step (after Foundations)
  // is where the one story fans out into a deck + optional apps.
  const STEPS = [
    { id: "script",      num: "1",  label: "Script & Story",        help: "Paste, upload, or generate your demo script with AI" },
    { id: "setup",       num: "2",  label: "Setup",                 help: "Customer, audience, products" },
    { id: "foundations", num: "3",  label: "Story Foundations",     help: "Review what was extracted" },
    { id: "apps",        num: "4",  label: "Demos",                 help: "Choose what to build from this story — slide deck and optional apps" },
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
    // Soft-lock presence. readOnly = a different collaborator holds the live
    // lock, so this session suppresses saves + shows a banner. lockHolder is
    // the foreign holder row {holder_email,holder_name} when read-only.
    readOnly: false,
    lockHolder: null,
  };
  // Heartbeat that renews my presence lock while I'm editing. Cleared on
  // goHome / signOut / when I drop to read-only.
  let _lockTimer = null;

  // Cached Gemini-configured flag. Resolved once at boot (the server tells
  // us whether a key is present). Used to decide whether to show AI actions
  // that re-render synchronously (e.g. the per-slide "Generate conversation"
  // button on the preview step), where an async isConfigured() per render
  // would be awkward.
  let _geminiReady = false;

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
    // Read-only session (another collaborator holds the live lock): never
    // write. Last-write-wins still applies if they later go stale and this
    // session takes over.
    if (app.readOnly) return Promise.resolve();
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
    // Read-only session: don't flash "Saving…" or schedule a write.
    if (app.readOnly) return;
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
    // Release the lock as part of the teardown chain so a re-open of the same
    // project doesn't race an in-flight release. releaseActiveLock resolves
    // even on failure (best-effort), so it never blocks the nav.
    const release = releaseActiveLock();
    Promise.all([save, release]).then(function () {
      app.view = "home";
      app.state = null;
      app.readOnly = false;
      app.lockHolder = null;
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
        // Existing projects load straight from the store (bypassing
        // VALIDATOR.importConfig), so apply the on-load migrations — re-fit
        // overflowing stored copy to complete thoughts, and flip stored
        // deviceFrame "desktop" → "mobile" — here too. Idempotent, so it's a
        // no-op once a project is already migrated.
        if (VALIDATOR && VALIDATOR.migrateState) VALIDATOR.migrateState(state);
        app.state = state;
        app.view = "builder";
        STORE.setActiveProjectId(projectId);
        // Seed presenter name/title from the synced profile if still blank.
        prepopulatePresenterFromProfile(state);
        recompute();
        render();
        // Acquire the soft lock (or drop to read-only if a collaborator is
        // live). This may flip app.readOnly, so run the migration-persisting
        // save AFTER it resolves — saveActive is a no-op when read-only.
        startPresence(projectId).then(function () {
          // Persist unconditionally so the migration (flipped frames / re-fit
          // copy) survives the next load and reaches export/preview.
          saveActive();
        });
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
  // Create a blank project and open the builder on the Script & Story
  // step (the new first step). onReady, if given, runs after the initial
  // render with the fresh state — used by the "Aubrey script" chooser
  // door to pop the script picker once there's an active project to
  // write into.
  function newProject(onReady) {
    STORE.createProject({}).then(function (state) {
      app.state = state;
      app.view = "builder";
      app.readOnly = false;
      app.lockHolder = null;
      state.step = "script"; // land directly on Script & Story
      STORE.setActiveProjectId(state.id);
      if (prepopulatePresenterFromProfile(state)) saveActive();
      recompute();
      render();
      // A brand-new project is owned by me; claim the lock + heartbeat.
      startPresence(state.id);
      if (typeof onReady === "function") onReady(state);
    }).catch(navFailed("Couldn't create a new project. Please try again."));
  }

  // ─── Soft-lock presence ───────────────────────────────────────
  // Called after a project is loaded into app.state. Checks for a live
  // foreign holder: if one exists this session opens READ-ONLY (banner +
  // suppressed saves); otherwise we claim the lock and start the heartbeat.
  // Best-effort — a store failure resolves to "no holder" so editing never
  // gets blocked by a network blip.
  function startPresence(projectId) {
    stopHeartbeat();
    app.readOnly = false;
    app.lockHolder = null;
    const myEmail = (window.HOLO_AUTH && HOLO_AUTH.currentUser() && HOLO_AUTH.currentUser().email || "").toLowerCase();
    return STORE.getPresence(projectId).then(function (holder) {
      if (holder && holder.holder_email && holder.holder_email.toLowerCase() !== myEmail) {
        // Someone else is live — go read-only.
        app.readOnly = true;
        app.lockHolder = holder;
        renderTopbar();
        renderReadOnlyBanner();
        return false;
      }
      // Free (or mine) — claim it and heartbeat.
      return STORE.acquireLock(projectId).then(function () {
        startHeartbeat(projectId);
        return true;
      });
    });
  }
  function startHeartbeat(projectId) {
    stopHeartbeat();
    // Renew well within the 90s TTL so the lock never lapses mid-edit.
    _lockTimer = setInterval(function () {
      // Renew while the project stays active — including transient views
      // (aiPrompt/feedback/profile) that are still part of this edit session.
      // goHome / signOut clear the timer, so a lapse only happens once the
      // user truly leaves the project.
      if (app.state && app.state.id === projectId && !app.readOnly) {
        STORE.renewLock(projectId);
      }
    }, 45 * 1000);
  }
  function stopHeartbeat() {
    if (_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
  }
  function releaseActiveLock() {
    stopHeartbeat();
    const id = app.state && app.state.id;
    if (id && !app.readOnly) return STORE.releaseLock(id);
    return Promise.resolve();
  }
  // "Take over" from the read-only banner: force-claim the lock, drop
  // read-only, re-render editable. Last-write-wins if the prior holder
  // was actually still active.
  function takeOverLock() {
    const id = app.state && app.state.id;
    if (!id) return;
    STORE.acquireLock(id).then(function () {
      app.readOnly = false;
      app.lockHolder = null;
      startHeartbeat(id);
      render();
      toast("You're now editing this project.");
    }).catch(function () { toast("Couldn't take over editing. Try again."); });
  }
  window.__holoTakeOver = takeOverLock; // banner button hook

  // True when the active project is owned by the signed-in user. ownerId is
  // stamped onto state from the row (rowToState); a brand-new/legacy project
  // has no ownerId yet, so absence = mine (I just created it).
  function isActiveProjectMine() {
    if (!app.state) return false;
    if (!app.state.ownerId) return true;
    const me = (AUTH && AUTH.currentUser && AUTH.currentUser()) ? AUTH.currentUser().id : null;
    return !!me && app.state.ownerId === me;
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
      app.readOnly ? "ro" : "",
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
      // Share is owner-only. ownerId is absent on brand-new/legacy projects
      // the current user just created, so treat "no ownerId" as owned by me.
      // RLS is the real gate; this only hides a button that would 403.
      if (isActiveProjectMine() && window.HOLO_SHARE) {
        right.appendChild(actionBtn("Share", "bx-btn-ghost", function () {
          // Pass the known visibility so the gallery toggle is live immediately
          // (no disabled-until-lazy-load delay).
          window.HOLO_SHARE.open(app.state.id, app.state.name || "Untitled project", app.state.visibility);
        }));
      }
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
        // Team Gallery: copy a teammate's published project into my own account
        // (duplicateProject resets owner=me + visibility=private) and open the
        // fresh copy. Opening the gallery row directly would fail owner-only
        // autosave/lock, so we always work on my own duplicate.
        onDuplicateOpen: function (id) {
          toast("Copying to your projects…");
          STORE.duplicateProject(id).then(function (newId) {
            if (newId) goBuilder(newId); else toast("Couldn't copy that project.");
          }).catch(function () { toast("Couldn't copy that project."); });
        },
        onUnpublish: function (id, done) {
          STORE.setVisibility(id, "private").then(function () {
            done && done(); toast("Removed from the team gallery");
          }).catch(function () { toast("Couldn't unpublish. Try again."); });
        },
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
    renderReadOnlyBanner();

    // Persistent Quality Check strip — always visible while in the
    // builder so SEs see issues before reaching the export step.
    renderQualityFooter(shell);

    // Resume the tour's builder segment after the home hand-off.
    if (app.tour.resumeOnBuilder) {
      app.tour.resumeOnBuilder = false;
      setTimeout(function () { startTour("builder"); }, 0);
    }
  }

  // Read-only presence banner. Shown when another collaborator holds the
  // live lock; offers "Take over". Removed when not read-only. Lives on
  // document.body (like the quality footer) so it overlays without shifting
  // the builder grid.
  function renderReadOnlyBanner() {
    let banner = document.getElementById("bxReadOnlyBanner");
    if (app.view !== "builder" || !app.readOnly || !app.lockHolder) {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      return;
    }
    const holder = app.lockHolder.holder_name || app.lockHolder.holder_email || "Someone";
    if (!banner) {
      banner = el("div", { class: "bx-readonly-banner", id: "bxReadOnlyBanner" });
      document.body.appendChild(banner);
    }
    banner.innerHTML = "";
    banner.appendChild(el("span", { class: "bx-readonly-icon", text: "🔒" }));
    banner.appendChild(el("span", { class: "bx-readonly-text",
      text: holder + " is editing this project — you're viewing read-only." }));
    const btn = el("button", { class: "bx-readonly-takeover", type: "button", text: "Take over" });
    btn.addEventListener("click", takeOverLock);
    banner.appendChild(btn);
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

    if (id === "setup") {
      if (!s.project.customerName) return st("needs-input", "Add customer details");
      if (!setupReady)              return st("needs-input", "Needs input");
      return st("complete", "Complete");
    }
    if (id === "script") {
      // Script step is the entry point — a new project lands here to
      // paste, upload, or generate a script. (Setup still gates
      // downstream recommendations.)
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
    if (id === "apps") {
      // The slide deck is always built; the two apps are opt-in, so this step
      // is OPTIONAL by default. Turning an app on (or moving past the step via
      // Next) marks it complete.
      const enabledApps = ["clienteling", "cimulate"].filter(function (k) {
        return s.apps && s.apps[k] && s.apps[k].enabled;
      });
      if (enabledApps.length) return st("complete", enabledApps.length + (enabledApps.length === 1 ? " app added" : " apps added"));
      if (s._appsVisited)      return st("complete", "Deck only");
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
    // "narrative" was removed when Recommended Narrative was retired;
    // "connect" was the old Step 1, folded into the new-project chooser).
    if (app.state.step === "story") app.state.step = "script";
    if (app.state.step === "narrative") app.state.step = "recs";
    if (app.state.step === "connect") app.state.step = "script";
    const step = app.state.step;
    if      (step === "setup")       main.appendChild(viewSetup());
    else if (step === "script")      main.appendChild(viewScript());
    else if (step === "foundations") main.appendChild(viewFoundations());
    else if (step === "apps")        main.appendChild(viewApps());
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
        "You'll turn a demo script into a runnable, customer-branded Salesforce demo in a few quick steps.",
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
        "Once you link a component to a demo slide, pick the exact still image that slide should show right here — it overrides the component default and the auto-match.",
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
    } else if (step === "apps") {
      const a = app.state.apps || {};
      const on = ["slides", "clienteling", "cimulate"].filter(function (k) { return a[k] && a[k].enabled; });
      title.textContent = "Demos selected";
      sub.textContent = on.length + " selected to build";
      sideAppsSummary(body);
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
      "Step 2 · Setup",
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
    // These three selects affect ONLY the stepper badge (setupReady flips the
    // Setup step to Complete) and the Live Suggestions side panel — nothing in
    // this main pane derives from them beyond the <select> value the browser
    // already updated. So re-render just the stepper + side instead of the full
    // shell, avoiding a teardown/rebuild (flash + scroll/focus jump) of the
    // whole Setup form. (Products stays on renderShell() — its main-pane
    // "auto-detected" hint must update on uncheck.)
    grid1.appendChild(field({ label: "Industry", type: "select", options: INDUSTRIES,
      value: s.project.industry,
      onInput: function (v) { s.project.industry = v; recompute(); renderStepper(); renderSide(); commit(); } }));
    grid1.appendChild(field({ label: "Demo audience", type: "select", options: AUDIENCES,
      value: s.project.audience,
      onInput: function (v) { s.project.audience = v; recompute(); renderStepper(); renderSide(); commit(); } }));
    grid1.appendChild(field({ label: "Sales stage", type: "select", options: STAGES,
      value: s.project.salesStage,
      onInput: function (v) { s.project.salesStage = v; recompute(); renderStepper(); renderSide(); commit(); } }));
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
    const c3HeadR = el("div", { class: "bx-row" });
    c3HeadR.appendChild(btn("✨ Pull brand from Aubrey", "bx-btn-secondary",
      function () { openAubreyBrandPicker(); }));
    // Brand Kit Builder is a shared-key-only pull — shown only when the
    // server has it configured and the SE is signed in (see aubreyStatus).
    if (aubreySharedAvailable("brandkit")) {
      c3HeadR.appendChild(btn("✨ Pull brand kit from Aubrey", "bx-btn-secondary",
        function () { openAubreyBrandKitPicker(); }));
    }
    c3Head.appendChild(c3HeadR);
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
  // Parse a Gemini JSON response defensively: strip a ```json fence, then
  // fall back to the outermost {...} slice if the model wrapped it in prose.
  // Returns the parsed object or null (never throws). Shared by the extractor
  // and polishSlideCopy so both handle fenced/preamble responses identically.
  function safeParseJson(text) {
    const raw = String(text || "");
    const tryParse = function (candidate) {
      try { return JSON.parse(candidate); } catch (_) { return null; }
    };
    const fenced = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    let data = tryParse(fenced.trim());
    if (!data) {
      const first = raw.indexOf("{");
      const last  = raw.lastIndexOf("}");
      if (first !== -1 && last > first) data = tryParse(raw.slice(first, last + 1));
    }
    return (data && typeof data === "object") ? data : null;
  }

  // ─── Slot-sized complete-thought slide copy (Gemini) ───────────
  // Generates SHORT, self-contained variants of the foundation + act fields
  // that render in the tightest slide slots (46/42/28 chars). Writes them as
  // `*Short` props on state.storyFoundations and each state.storyActs[]; the
  // renderer + export-model prefer them and always clamp defensively, so a
  // missing/blank short field silently falls back to today's truncate().
  //
  // Contract: resolves to `true` when it wrote at least one new short field,
  // `false` otherwise (Gemini off, nothing to do, or a soft failure). Never
  // rejects. Cached/idempotent — skips fields that already have a Short unless
  // opts.force. Budgets: foundations 46; act summary 46, demoMoment 42,
  // businessValue 28. Every written value is re-clamped via SHARED.truncate.
  function polishSlideCopy(state, opts) {
    opts = opts || {};
    const GEMINI = window.HOLO_GEMINI;
    const SHARED = window.HOLO_SHARED;
    if (!state || !GEMINI || !AI_PROMPT || !AI_PROMPT.getSlideCopyPrompt) return Promise.resolve(false);

    const f = state.storyFoundations || (state.storyFoundations = {});
    const acts = Array.isArray(state.storyActs) ? state.storyActs : [];
    const clamp = function (v, max) {
      const t = SHARED && SHARED.truncate ? SHARED.truncate(v, max) : String(v || "").slice(0, max);
      return String(t || "").trim();
    };
    // A source field "needs" a short variant when it has content but no Short
    // yet (or force). Nothing needed → skip the network call entirely.
    const src = function (o, k) { return String((o && o[k]) || "").trim(); };
    const needs = function (o, k, sk) { return !!src(o, k) && (opts.force || !src(o, sk)); };
    const foundationNeeds =
      needs(f, "businessProblem", "businessProblemShort") ||
      needs(f, "businessProblem", "businessProblemMedium") ||
      needs(f, "currentStatePain", "currentStatePainShort") ||
      needs(f, "futureStateVision", "futureStateVisionShort");
    const actNeeds = acts.some(function (a) {
      return needs(a, "summary", "summaryShort")
          || needs(a, "summary", "summaryMedium")
          || needs(a, "demoMoment", "demoMomentShort")
          || needs(a, "businessValue", "businessValueShort");
    });
    if (!foundationNeeds && !actNeeds) return Promise.resolve(false);

    return Promise.resolve(GEMINI.isConfigured ? GEMINI.isConfigured() : false)
      .then(function (configured) {
        if (!configured) return false;
        return GEMINI.generate({
          prompt: AI_PROMPT.getSlideCopyPrompt(f, acts),
          jsonMode: true,
          fast: true,
          temperature: 0.3,
          maxOutputTokens: 4096,
        }).then(function (text) {
          const data = safeParseJson(text);
          if (!data) return false;
          let changed = false;
          // Foundations — only fill fields with a source value and (unless
          // force) no existing short; always clamp the model's output.
          const fo = (data.foundations && typeof data.foundations === "object") ? data.foundations : {};
          [
            ["businessProblem", "businessProblemShort", 46],
            ["businessProblem", "businessProblemMedium", 180],
            ["currentStatePain", "currentStatePainShort", 46],
            ["futureStateVision", "futureStateVisionShort", 46],
          ].forEach(function (row) {
            const k = row[0], sk = row[1], max = row[2];
            if (!needs(f, k, sk)) return;
            const val = clamp(fo[sk], max);
            if (val) { f[sk] = val; changed = true; }
          });
          // Acts — positional map; skip missing/extra entries.
          const outActs = Array.isArray(data.acts) ? data.acts : [];
          acts.forEach(function (a, i) {
            const oa = outActs[i];
            if (!a || !oa || typeof oa !== "object") return;
            [
              ["summary", "summaryShort", 46],
              ["summary", "summaryMedium", 180],
              ["demoMoment", "demoMomentShort", 42],
              ["businessValue", "businessValueShort", 28],
            ].forEach(function (row) {
              const k = row[0], sk = row[1], max = row[2];
              if (!needs(a, k, sk)) return;
              const val = clamp(oa[sk], max);
              if (val) { a[sk] = val; changed = true; }
            });
          });
          return changed;
        });
      })
      .catch(function (err) {
        if (window.console && console.warn) console.warn("polishSlideCopy failed (non-fatal):", err);
        return false;
      });
  }

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

    // Kick journey-map image generation off NOW (right after acts land), not at
    // export — so the images are ready during preview and the first export is a
    // cache hit. Fire-and-forget: idempotent + cached (skips filled slots,
    // degrades to emoji on failure, commits itself). Guarded so it only runs
    // once acts exist (ensureJourneyImages no-ops when bucketActsIntoFive yields
    // no steps). Never blocks the UI. The export-time calls remain as no-ops.
    if ((s.storyActs || []).length) {
      try { Promise.resolve(ensureJourneyImages(s)).catch(function () {}); } catch (_) {}
    }
    return true;
  }

  // ─── Gemini: generate a script from the SE's prompt ───────────
  // Wraps the SE's free-text request into the holodeck-aware script
  // prompt and asks Gemini for a PLAIN-TEXT labeled script, which we
  // drop into s.scriptText. The SE then reviews/edits and runs Extract
  // exactly as with a pasted script — no new ingestion path. Leaves the
  // user on Step 1 so they can read what was written before extracting.
  function runGeminiScriptGen(promptText, button, status) {
    const GEMINI = window.HOLO_GEMINI;
    const AI_PROMPT = window.HOLO_AI_PROMPT;
    if (!GEMINI || !AI_PROMPT) { toast("Gemini is not available"); return; }
    const req = String(promptText || "").trim();
    if (!req) { toast("Describe the demo you want first"); return; }

    if (status) status.innerHTML = "";
    const origText = button.textContent;
    button.disabled = true;
    button.textContent = "Writing…";

    let pb = null;
    if (status) {
      pb = progressBar("Writing your script with Gemini…");
      pb.indeterminate("Writing your script with Gemini…");
      status.appendChild(pb.node);
    }
    const clearBar = function () { if (pb && pb.node.parentNode) pb.node.parentNode.removeChild(pb.node); };
    const showErr = function (msg) {
      clearBar();
      if (status) status.appendChild(el("div", { class: "bx-alert is-error", text: "Gemini: " + msg }));
      else toast("Gemini: " + msg);
    };

    // Plain text (no jsonMode): we want a script, not a config. Unlike the
    // mechanical JSON extraction, writing a coherent script is a CREATIVE
    // task — so we leave the model's thinking pass ON (fast:false) for
    // quality, and set an explicit maxOutputTokens so the full script has
    // room to land without truncating (an unbounded 2.5-flash call with
    // thinking off can otherwise return empty/short and drop the stream).
    // A little warmth in the temperature keeps the prose readable.
    GEMINI.generate({
      prompt: AI_PROMPT.getScriptGenPrompt(req, app.state),
      fast: false,
      temperature: 0.5,
      maxOutputTokens: 4096,
    })
      .then(function (text) {
        // Strip a stray ```…``` fence if the model wrapped the script.
        const cleaned = String(text || "")
          .replace(/^\s*```(?:\w+)?\s*/i, "")
          .replace(/\s*```\s*$/i, "")
          .trim();
        if (!cleaned) { showErr("returned an empty script — try adding more detail to your request"); return; }
        clearBar();
        const s = app.state;
        s.scriptText = cleaned;
        recompute(); commit(); renderMain();
        toast("Script generated — review it, then Extract Story Foundations");
      })
      .catch(function (err) {
        showErr((err && err.message) || String(err));
      })
      .then(function () {
        button.disabled = false;
        button.textContent = origText;
      });
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
    button.textContent = "Researching…"; // flips to "Parsing with Gemini…" for Call 2

    // Two sequential long calls (research → parse), so an animated
    // (indeterminate) bar is the honest representation. Lives in the
    // status div; cleared on the success render or replaced by the
    // error alert below. The label updates between the two phases.
    let pb = null;
    if (status) {
      pb = progressBar("Researching the customer with Gemini…");
      pb.indeterminate("Researching the customer with Gemini…");
      status.appendChild(pb.node);
    }
    const clearBar = function () { if (pb && pb.node.parentNode) pb.node.parentNode.removeChild(pb.node); };

    const showErr = function (msg) {
      clearBar();
      if (status) status.appendChild(el("div", { class: "bx-alert is-error", text: "Gemini: " + msg }));
      else toast("Gemini: " + msg);
    };

    // ─── Call 1 — grounded research brief (non-fatal) ──────────────
    // Ask Gemini to research the real customer on the web (Google Search
    // grounding on, NO JSON mode — the two are mutually exclusive on
    // Gemini 2.x). Returns a short prose brief that Call 2 injects as
    // verified context so every derived value is grounded in the real
    // brand, not just the pasted script. On any error/empty result we
    // log and continue with an empty brief — Call 2 runs exactly as it
    // did before this feature, so a research failure never blocks parse.
    const customerName = (s.project && s.project.customerName) || "";
    const website = (s.project && s.project.website) || "";
    const researchPromise = GEMINI.generate({
      prompt: AI_PROMPT.getResearchPrompt(customerName, s.scriptText, website),
      groundWithSearch: true, // adds tools:[{googleSearch:{}}] server-side
      fast: false,            // let the model reason over search results
      temperature: 0.3,
      maxOutputTokens: 1024,  // a tight prose brief, not an essay
    }).then(function (brief) {
      return String(brief || "").trim();
    }).catch(function (err) {
      // Non-fatal — surface nothing to the SE, just fall back to no brief.
      if (window.console && console.warn) console.warn("Gemini research pass failed; parsing without a brief:", err);
      return "";
    });

    // ─── Call 2 — the existing JSON extractor, brief injected ──────
    researchPromise.then(function (researchBrief) {
      if (pb) pb.indeterminate("Parsing your script with Gemini…");
      button.textContent = "Parsing with Gemini…";
      return GEMINI.generate({
        prompt: AI_PROMPT.getStoryParsePrompt(s.scriptText, researchBrief),
        jsonMode: true,
        fast: true,            // disable the model's thinking pass — big latency win
        temperature: 0.2,      // extraction is deterministic, not creative
        maxOutputTokens: 8192, // large scripts + full storyFoundations schema can exceed 4k and truncate the JSON
        useCache: true,        // deterministic parse — re-extracting an unchanged script reuses the result (0 tokens)
      });
    })
      .then(function (text) {
        const raw = String(text || "");
        // Strip a ```json fence if present, then parse. If that fails
        // (the model wrapped the JSON in prose, or added a preamble),
        // fall back to the outermost {...} slice before giving up.
        const fenced = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
        let data = null;
        const tryParse = function (candidate) {
          try { return JSON.parse(candidate); } catch (_) { return null; }
        };
        data = tryParse(fenced.trim());
        if (!data) {
          const first = raw.indexOf("{");
          const last  = raw.lastIndexOf("}");
          if (first !== -1 && last > first) data = tryParse(raw.slice(first, last + 1));
        }
        if (!data) {
          // Surface a short snippet so a truncated / prose response is
          // diagnosable instead of an opaque "wasn't valid JSON".
          const snippet = raw.trim().slice(0, 120).replace(/\s+/g, " ");
          if (window.console && console.warn) console.warn("Gemini parse failed. Raw response:", raw);
          showErr("returned text that wasn't valid JSON — try the manual extractor. (Got: “" +
            (snippet || "empty response") + "…”)");
          return;
        }
        if (typeof data !== "object") { showErr("returned an unexpected shape."); return; }

        // Coerce into the storyFoundations shape mergeExtractedStory-
        // IntoState expects — every array MUST exist (it calls .join
        // on several), and strings must be strings.
        const str = function (v) { return typeof v === "string" ? v : ""; };
        const arr = function (v) { return Array.isArray(v) ? v.filter(function (x) { return x != null && x !== ""; }) : []; };
        // Object coercion for imageCues — keep only string values, drop
        // [TODO…] placeholders so buildAssetPrompt's `cue()` reader can
        // treat "missing" and "placeholder" identically.
        const obj = function (v) {
          if (!v || typeof v !== "object" || Array.isArray(v)) return {};
          const out = {};
          Object.keys(v).forEach(function (k) {
            const val = str(v[k]).trim();
            if (val && !/^\[TODO/i.test(val)) out[k] = val;
          });
          return out;
        };
        // A story-driven wishlist row: name + optional badge/emoji/detail,
        // dropping [TODO…] placeholders (consumed by the wishlist chrome).
        const wishRow = function (r) {
          if (!r || typeof r !== "object") return null;
          const name = str(r.name).trim();
          if (!name || /^\[TODO/i.test(name)) return null;
          const clean = function (v) { const t = str(v).trim(); return /^\[TODO/i.test(t) ? "" : t; };
          return { name: name, tag: clean(r.tag), emoji: clean(r.emoji), detail: clean(r.detail) };
        };
        // Presenter preamble ("Hi everyone, my name is [PRESENTER NAME], I'm a
        // [TITLE] here at Salesforce…", agenda, thank-yous) is housekeeping —
        // never the customer's story. Drop any act whose title/summary reads as
        // preamble so it can't become act 1 or the opening moment even if Gemini
        // slips a section header through. Conservative: only obvious preamble.
        const PREAMBLE_RE = /\b(?:my name is|i'?m a\b|here at salesforce|thanks?\b|welcome everyone|agenda)\b/i;
        const GREETING_RE = /^\s*(?:hi|hello|hey)\b/i;
        const isStoryAct = function (a) {
          if (!a || typeof a !== "object") return false;
          const t = str(a.title).trim();
          const sm = str(a.summary).trim();
          if (!t && !sm) return false;
          if (GREETING_RE.test(t) || GREETING_RE.test(sm)) return false;
          if (PREAMBLE_RE.test(t) || PREAMBLE_RE.test(sm)) return false;
          return true;
        };
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
          // ─── Round-6 story-driven fields (all optional) ──────────
          // Gemini derives these from the research brief + this story;
          // downstream generators read them when present and fall back
          // to neutral defaults otherwise (see holodeck-shared.js).
          journeyPhases:        arr(data.journeyPhases),
          wishlistEyebrow:      str(data.wishlistEyebrow),
          wishlistHeadline:     str(data.wishlistHeadline),
          wishlist:             arr(data.wishlist).map(wishRow).filter(Boolean),
          imageCues:            obj(data.imageCues),
        };

        // Pre-populate acts/personas/customer/products from the
        // Gemini result so applyExtractionToState's regex fallbacks
        // are skipped and the structured output wins.
        s.project = s.project || {};
        // The SE explicitly clicked "Parse with Gemini" — its story-aware acts
        // (a narrative arc, preamble excluded) WIN over any regex section-split
        // already in s.storyActs. Only replace when Gemini actually returned
        // usable acts, so a failed/empty parse never wipes good regex acts.
        const acts = arr(data.storyActs).filter(isStoryAct);
        if (acts.length) {
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
        // Personas: same rule — an explicit Gemini parse replaces prior
        // (regex-derived) personas when it returned any.
        const ppl = arr(data.personas);
        if (ppl.length) {
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

        // ─── Call 3 — slot-sized complete-thought slide copy ─────
        // Small, cacheable, independently retryable — kept SEPARATE from the
        // big parse call. Non-blocking: the SE already sees foundations; when
        // the short variants land we persist + re-render so tight slots show a
        // complete phrase. A failure or Gemini-off is silent (renderer falls
        // back to truncate). Guarded so a stale re-render can't clobber a newer
        // project the SE navigated to mid-flight.
        if (pb) pb.indeterminate("Polishing slide copy…");
        polishSlideCopy(s).then(function (changed) {
          if (changed && app.state === s) { commit(); renderShell(); }
        }).then(clearBar, clearBar);
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
      "Step 1 · Script & Story",
      "Add your demo script",
      "Generate a script with AI, or paste/upload your own rough demo story. The builder extracts the narrative, personas, journey moments, and business value automatically."
    ));
    const s = app.state;

    // ── Generate-with-AI card ─────────────────────────────────
    // In-app alternative to going to ChatGPT/Slackbot/Gemini chat: the
    // SE types what demo they want and Gemini writes a labeled script
    // straight into the Script textarea below (which they then review
    // and Extract). Built first and appended above the paste card so
    // "generate" is the leading option; shown only when the server has
    // a Gemini key, otherwise hidden so we never surface a dead button.
    const GEN_GEMINI = window.HOLO_GEMINI;
    if (GEN_GEMINI && window.HOLO_AI_PROMPT) {
      const genCard = el("div", { class: "bx-card bx-card-feature" });
      genCard.style.display = "none"; // revealed once we confirm a key
      genCard.appendChild(el("div", { class: "bx-card-title", text: "Generate a script with AI" }));
      genCard.appendChild(el("div", { class: "bx-card-sub",
        text: "Describe the demo you want and Gemini will draft a structured script below — then review, edit, and extract it like any other. Uses the customer and products you've already entered as context." }));
      const genArea = field({
        label: "What demo do you want?",
        type: "textarea",
        placeholder: "Describe the demo: customer, industry, the story, which Salesforce products, and the audience…",
        value: s.aiScriptPrompt || "",
        onInput: function (v) { s.aiScriptPrompt = v; commit(); },
      });
      genCard.appendChild(genArea);
      const genStatus = el("div", { class: "bx-mt-12" });
      const genBtn = btn("✦ Generate script with Gemini", "bx-btn-primary", function () {
        // Read the freshest value straight from the textarea in the card.
        const ta = genArea.querySelector("textarea");
        runGeminiScriptGen((ta && ta.value) || s.aiScriptPrompt || "", genBtn, genStatus);
      });
      genCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [genBtn]));
      genCard.appendChild(genStatus);
      wrap.appendChild(genCard);
      GEN_GEMINI.isConfigured().then(function (ok) {
        if (ok) genCard.style.display = "";
      });
    }

    // ── Paste / Upload card ──────────────────────────────────
    const c = el("div", { class: "bx-card bx-card-feature" });
    c.appendChild(el("div", { class: "bx-card-title", text: "Or paste your demo script" }));
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
  //  is now selectable and on by default in Step 4 · Slide Selection.)

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

  // Move a slide up/down WITHIN its section in the manifest order. The polished
  // /demo renders sections in a fixed order, so reorder never crosses sections.
  // state.slideOrder is the persisted id list; seed it from the current runtime
  // manifest order (what the SE sees) the first time they reorder, then swap the
  // target with its in-section neighbor.
  function moveSlideInOrder(id, delta) {
    const manifest = (PREVIEW.enumerateRuntimeSlides
      ? PREVIEW.enumerateRuntimeSlides(app.state)
      : (app.state.slides || []));
    // Seed / refresh the order from the current displayed sequence.
    let order = Array.isArray(app.state.slideOrder) && app.state.slideOrder.length
      ? app.state.slideOrder.slice()
      : manifest.map(function (sl) { return sl.id; });
    // Ensure every currently-shown slide is represented (append any newcomers).
    manifest.forEach(function (sl) { if (order.indexOf(sl.id) < 0) order.push(sl.id); });

    const secOf = {};
    manifest.forEach(function (sl) { secOf[sl.id] = sl.sectionId || "demo"; });

    const i = order.indexOf(id);
    if (i < 0) return;
    // Find the nearest neighbor in the SAME section in the move direction.
    let j = i + delta;
    while (j >= 0 && j < order.length && secOf[order[j]] !== secOf[id]) j += delta;
    if (j < 0 || j >= order.length || secOf[order[j]] !== secOf[id]) return; // no in-section neighbor
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;

    app.state.slideOrder = order;
    renderMain(); renderSide(); commit();
  }

  // ─── STEP 3: CX COMPONENTS (AubreyDemo) ───────────────────────
  // ─── Demos step (R1) ──────────────────────────────────────────
  // The single "what do you want to build from this story?" surface.
  // The slide deck is always on. Two optional apps (clienteling, cimulate)
  // are opt-in. In R1 the cards are static and preview the DEFAULT template
  // (Total Wine data) — script-driven Recommended badges (R2) and per-project
  // config generation (R3) light up the same cards later without moving them.
  const APP_CATALOG = [
    {
      id: "clienteling",
      name: "Clienteling app",
      tagline: "Store-associate tool — customer 360, walk-ins, tasks, guided selling",
      icon: "🛍️",
      previewUrl: "/demo-apps/clienteling/",
    },
    {
      id: "cimulate",
      name: "Cimulate search demo",
      tagline: "Intent-aware product search + shopper/service concierge agent",
      icon: "🔎",
      previewUrl: "/demo-apps/cimulate/",
    },
  ];

  // Safe accessor: returns the app slice, defaulting for older projects that
  // predate state.apps. Mirrors the inline `state.x || default` idiom used
  // elsewhere rather than a central normalizer.
  function appsState() {
    const s = app.state;
    const freshSlice = function () {
      return { enabled: false, expanded: false, status: "opt-in", extracted: false, config: null, productImages: null, _previewOnly: false, _aiGenerated: false, _imageStorySig: null };
    };
    if (!s.apps) {
      s.apps = {
        slides:      { enabled: true,  status: "recommended" },
        clienteling: freshSlice(),
        cimulate:    freshSlice(),
      };
    }
    // Backfill any app key missing from an older slice.
    if (!s.apps.slides)      s.apps.slides      = { enabled: true,  status: "recommended" };
    if (!s.apps.clienteling) s.apps.clienteling = freshSlice();
    if (!s.apps.cimulate)    s.apps.cimulate    = freshSlice();
    // Migrate pre-two-tier slices: an older project that already has a
    // generated config (generation always ran the photo pass back then) is
    // effectively AI-generated. If neither tier flag is set but a config
    // exists, classify it so the card shows the right buttons and never
    // silently re-spends tokens on reopen.
    ["clienteling", "cimulate"].forEach(function (id) {
      const sl = s.apps[id];
      if (sl && sl.extracted && sl._previewOnly == null && sl._aiGenerated == null) {
        const hadPhotos = sl.productImages && Object.keys(sl.productImages).length;
        sl._aiGenerated = !!hadPhotos;
        sl._previewOnly = !hadPhotos;
      }
      // Migrated slices predate _imageStorySig. If one already has AI images,
      // stamp the current story signature so a first "Refresh preview" keeps
      // them (reopening a project isn't a story change). Only backfill when
      // missing — never overwrite a real recorded signature.
      if (sl && sl._aiGenerated && sl._imageStorySig == null &&
          sl.productImages && Object.keys(sl.productImages).length) {
        sl._imageStorySig = storySignature();
      }
      // The generic-preview config lives in (per-session) sessionStorage, so its
      // token is stale after a reload. Clear the flag so ensureGenericPreview
      // re-seeds it this session — otherwise the iframe would load an empty
      // token and fall back to the stock Total Wine sample.
      if (sl && !sl.extracted) sl._genericToken = false;
      // Backfill the collapse flag for pre-collapsible-UI slices. An app that
      // was already enabled reopens expanded — before this UI existed, an
      // enabled app always showed its full view, so we preserve that. A
      // disabled app stays collapsed.
      if (sl && sl.expanded == null) sl.expanded = !!sl.enabled;
    });
    // Shared-catalog migration (pre-fix projects). The catalog used to grow via a
    // union-by-id, so old projects may have ballooned past 12 SKUs, and none have
    // the new retailCatalogSig / retailImages fields. Heal + backfill so the next
    // generate reuses (rather than rebuilds/re-images) whenever the story matches.
    if (Array.isArray(s.retailCatalog)) {
      // Heal an already-ballooned catalog: the shared contract is exactly 12.
      if (s.retailCatalog.length > 12) s.retailCatalog = s.retailCatalog.slice(0, 12);
      // Stamp the signature only if a catalog exists AND at least one app is
      // AI-generated (so the story is presumed the one it was built at) — avoids
      // a spurious rebuild on first reopen. Never overwrite a real signature.
      if (s.retailCatalogSig == null && s.retailCatalog.length &&
          ((s.apps.clienteling && s.apps.clienteling._aiGenerated) ||
           (s.apps.cimulate && s.apps.cimulate._aiGenerated))) {
        s.retailCatalogSig = storySignature();
      }
      // Seed the shared image store from both apps' per-app maps so the next
      // generate reuses those images instead of re-imaging the shared 12.
      if (s.retailImages == null) {
        const seed = {};
        ["clienteling", "cimulate"].forEach(function (id) {
          const imgs = s.apps[id] && s.apps[id].productImages;
          if (imgs) Object.keys(imgs).forEach(function (k) { if (!seed[k]) seed[k] = imgs[k]; });
        });
        if (Object.keys(seed).length) s.retailImages = seed;
      }
    }
    return s.apps;
  }

  function viewApps() {
    const wrap = el("div");
    wrap.appendChild(stepHeader(
      "Step 4 · Demos",
      "Choose what to build from this story",
      "Everything here springs from the one script you extracted. The slide deck is always built. The apps below are optional — turn one on to preview it, then generate a version branded to your customer. Nothing is built until you turn it on."
    ));
    const apps = appsState();

    // Read intent signals from the current story. Best-effort: if the rules
    // engine isn't loaded for any reason, everything falls back to opt-in.
    let intents = { clienteling: { hasSignal: false, evidence: [] }, cimulate: { hasSignal: false, evidence: [] } };
    try {
      if (window.HOLO_RULES && HOLO_RULES.detectAppIntents) {
        intents = HOLO_RULES.detectAppIntents(app.state);
      }
    } catch (e) { /* keep the opt-in fallback */ }

    // Slides card — always on, not toggleable.
    const slidesCard = el("div", { class: "bx-card" });
    slidesCard.appendChild(el("div", { class: "bx-row bx-row-between" }, [
      el("div", {}, [
        el("div", { class: "bx-card-title", text: "🖥️  Slide deck" }),
        el("div", { class: "bx-card-sub", text: "The narrated Holodeck deck — built from your slide selection. Always included." }),
      ]),
      el("span", { class: "bx-pill bx-pill-ok", text: "Always on" }),
    ]));
    wrap.appendChild(slidesCard);

    // Every optional app renders as a collapsed toggle row. Toggling one on
    // auto-expands its full view; a chevron collapses it back without turning
    // it off. The ★Recommended badge still surfaces apps the script points to,
    // but all apps get the same collapsed-row treatment.
    APP_CATALOG.forEach(function (def) {
      wrap.appendChild(appCard(def, apps[def.id], intents[def.id]));
    });

    wrap.appendChild(el("div", { class: "bx-help bx-mt-18",
      html: "<strong>Previewing the template:</strong> until you generate a branded version, the preview shows the default sample data. Generate to personalize it to your customer." }));

    wrap.appendChild(stepFooter("apps"));
    return wrap;
  }

  function appCard(def, slice, intent) {
    intent = intent || { hasSignal: false, evidence: [] };
    const card = el("div", { class: "bx-card bx-mt-12" });

    // Header row: title + status pill(s) + toggle.
    const toggle = el("input", { type: "checkbox" });
    if (slice.enabled) toggle.setAttribute("checked", "checked");
    toggle.addEventListener("change", function () {
      slice.enabled = toggle.checked;
      // Turning an app on auto-drops-down its full view. Turning it off leaves
      // `expanded` untouched — the panel is gated on `enabled` too, so a
      // previously-open app reopens expanded if switched back on.
      if (toggle.checked) slice.expanded = true;
      commit();
      renderMain(); // re-render to show/hide the preview panel
    });
    const toggleLabel = el("label", { class: "bx-switch" }, [toggle, el("span", { class: "bx-switch-track" })]);

    const pills = el("div", { class: "bx-row" });
    if (intent.hasSignal) pills.appendChild(el("span", { class: "bx-pill bx-pill-rec", text: "★ Recommended" }));
    const tierLabel = slice._aiGenerated ? "On · AI images" : (slice.extracted ? "On · preview" : "On");
    pills.appendChild(el("span", { class: "bx-pill", text: slice.enabled ? tierLabel : "Opt-in" }));

    // Chevron collapses/expands the view while keeping the app on. Only shown
    // when enabled — a disabled app has nothing to drop down. Hidden while
    // generating so the progress bar stays visible until the build finishes.
    if (slice.enabled && !slice._generating) {
      const chevron = el("button", {
        class: "bx-app-chevron",
        type: "button",
        title: slice.expanded ? "Collapse" : "Expand",
        "aria-label": slice.expanded ? "Collapse" : "Expand",
        text: slice.expanded ? "▾" : "▸",
      });
      chevron.addEventListener("click", function () {
        slice.expanded = !slice.expanded;
        commit();
        renderMain();
      });
      pills.appendChild(chevron);
    }
    pills.appendChild(toggleLabel);

    card.appendChild(el("div", { class: "bx-row bx-row-between" }, [
      el("div", {}, [
        el("div", { class: "bx-card-title", text: def.icon + "  " + def.name }),
        el("div", { class: "bx-card-sub", text: def.tagline }),
      ]),
      pills,
    ]));

    // Preview + generate panel — only when enabled AND expanded. An enabled app
    // that's collapsed still builds; it just hides its full view.
    if (slice.enabled && slice.expanded) {
      // Evidence chips — the actual keywords in the script that triggered the
      // recommendation. Live inside the expanded panel so a collapsed row stays
      // minimal.
      if (intent.hasSignal && intent.evidence && intent.evidence.length) {
        const chips = el("div", { class: "bx-chips bx-mt-12" });
        chips.appendChild(el("span", { class: "bx-chips-label", text: "Signals in your script:" }));
        // De-dupe by keyword; cap at 6 so a keyword-heavy script doesn't flood.
        const seen = {};
        intent.evidence.forEach(function (ev) {
          if (seen[ev.keyword]) return;
          seen[ev.keyword] = 1;
          if (Object.keys(seen).length > 6) return;
          chips.appendChild(el("span", { class: "bx-chip", text: ev.keyword }));
        });
        card.appendChild(chips);
      }

      // Before anything is generated, seed a generic-retail preview so the
      // iframe never shows the stock Total Wine sample. Token-free.
      if (!slice.extracted) ensureGenericPreview(def, slice);
      // Back-compat: an already-generated app persists its config in
      // slice.config, but the per-session storage stash the iframe reads may be
      // missing (project reopened in a fresh browser session, or generated by a
      // build that only wrote sessionStorage). Re-stash it on render so both the
      // inline iframe AND "Open full-screen" load the customer's config instead
      // of the stock Total Wine sample. Storage-only — no Gemini call, no tokens.
      else if (slice.config) ensureConfigStashed(def, slice);
      const panel = el("div", { class: "bx-mt-12" });

      // Two-tier generate row (R4). Preview = cheap text-only pass (neutral
      // SVG products); AI = confirm-gated per-SKU image pass. Tiers gate token
      // spend so look/feel iterations stay cheap.
      const genRow = el("div", { class: "bx-row bx-mt-12" });
      if (slice._generating) {
        // While busy, show a disabled label for the running tier + a live
        // Cancel button so the SE can stop a premature/unwanted AI run. Cancel
        // aborts pending image calls and restores the pre-run version.
        const busy = btn(slice._genMode === "ai" ? "⏳ Generating with AI…" : "⏳ Building preview…", "bx-btn-primary", function () {});
        busy.setAttribute("disabled", "disabled");
        genRow.appendChild(busy);
        genRow.appendChild(btn("✕ Cancel", "bx-btn-secondary", function () {
          cancelAppGen(def, slice);
        }));
      } else if (!slice.extracted) {
        // Nothing generated yet → the cheap preview is the primary action.
        genRow.appendChild(btn("✨ Preview this app", "bx-btn-primary", function () {
          generateApp(def, slice, "preview");
        }));
      } else if (slice._aiGenerated) {
        // AI images already generated → cached; the only re-spend is a
        // confirm-gated regenerate. Plain reopens/re-renders reuse the cache.
        genRow.appendChild(btn("↻ Regenerate with AI", "bx-btn-primary", function () {
          generateAppAI(def, slice);
        }));
        genRow.appendChild(btn("↻ Refresh preview (no AI)", "bx-btn-secondary", function () {
          generateApp(def, slice, "preview");
        }));
      } else {
        // Preview exists (_previewOnly) → offer the confirm-gated AI upgrade,
        // plus a cheap re-preview.
        genRow.appendChild(btn("Looks good — generate with AI ✨", "bx-btn-primary", function () {
          generateAppAI(def, slice);
        }));
        genRow.appendChild(btn("↻ Refresh preview", "bx-btn-secondary", function () {
          generateApp(def, slice, "preview");
        }));
      }
      genRow.appendChild(btn("↗ Open full-screen", "bx-btn-secondary", function () {
        window.open(previewUrlFor(def, slice), "_blank", "noopener");
      }));
      panel.appendChild(genRow);

      if (slice._generating) {
        // One unified progress bar for the whole build (foundation → config →
        // product photos). Fill + label carry stable IDs so generateApp's
        // setProgress can advance them in place without re-rendering the card.
        const fill = el("div", {
          class: "bx-progress-fill",
          id: "bx-appgen-fill-" + def.id,
          style: "width:" + Math.round((slice._progress || 0) * 100) + "%",
        });
        const track = el("div", { class: "bx-progress" }, [fill]);
        const label = el("div", {
          class: "bx-progress-label",
          id: "bx-appgen-status-" + def.id,
          text: slice._genStatus || "Working…",
        });
        panel.appendChild(el("div", { class: "bx-progress-wrap bx-mt-12" }, [track, label]));
      } else {
        // Resting status line — tier-aware.
        let statusText;
        if (slice._genStatus) {
          statusText = slice._genStatus;
        } else if (!slice.extracted) {
          statusText = "Showing a generic retail preview. Click Preview to personalize it to " + (custName() || "your customer") + " (no image tokens spent).";
        } else if (slice._aiGenerated) {
          statusText = "AI-generated — per-product images created for " + (custName() || "your customer") + ". Cached; reopening won't re-spend tokens." + (slice._usedGemini === false ? " (template fallback — AI unavailable)" : "");
        } else {
          statusText = "Preview generated from this project's story data — products use neutral placeholders. Happy with the look? Generate with AI to add real product images." + (slice._usedGemini === false ? " (template fallback — AI unavailable)" : "");
        }
        panel.appendChild(el("div", {
          class: "bx-help bx-mt-12",
          id: "bx-appgen-status-" + def.id,
          text: statusText,
        }));
      }

      // Inline iframe in a light device frame.
      const frame = el("div", { class: "bx-app-preview-frame" });
      const iframe = el("iframe", {
        src: previewUrlFor(def, slice),
        title: def.name + " preview",
        loading: "lazy",
        sandbox: "allow-scripts allow-same-origin allow-forms allow-popups",
        style: "width:100%;height:520px;border:0;border-radius:10px;background:#fff",
      });
      frame.appendChild(iframe);
      panel.appendChild(frame);

      card.appendChild(panel);
    }

    return card;
  }

  function custName() {
    return app.state && app.state.project && app.state.project.customerName;
  }

  // The preview URL. Once an app has a generated config we append a token so
  // the iframe's app-config.js loads the generated APP_CONFIG from
  // sessionStorage (see the "BUILDER PREVIEW OVERRIDE" shim in each
  // demo-apps/<app>/app-config.js).
  function previewUrlFor(def, slice) {
    if ((slice.extracted || slice._genericToken) && slice._previewToken) {
      return def.previewUrl + "?holo=" + encodeURIComponent(slice._previewToken);
    }
    return def.previewUrl;
  }

  // The FIRST preview an enabled-but-not-yet-generated app card shows must be
  // completely GENERIC RETAIL — never the stock Total Wine sample. We build a
  // token-free deterministic fallback config with no customer context and stash
  // it under the app's preview token, so the iframe loads generic retail via
  // ?holo=<token>. No Gemini call, no image tokens. Real generation later
  // overwrites this same token in place.
  function ensureGenericPreview(def, slice) {
    if (slice.extracted) return;              // a real preview/AI config exists
    if (slice._genericToken) return;          // already seeded this session
    if (!window.HOLO_APPFOUND || !window.HOLO_APPFOUND.buildFallbackConfig) return;
    try {
      const generic = window.HOLO_APPFOUND.buildFallbackConfig(def.id, app.state, { generic: true });
      slice._previewToken = stashPreviewConfig(def.id, generic);
      slice._genericToken = true;
    } catch (e) { /* fall back to the stock template if this fails */ }
  }

  // Back-compat re-stash for an already-generated app. Ensures slice.config is
  // present in storage under the app's stable token so the iframe (inline AND
  // full-screen) renders the customer's config on a fresh session. Idempotent:
  // if the token already resolves to a stash we leave it alone; only re-writes
  // when missing. Storage-only — never spends tokens.
  function ensureConfigStashed(def, slice) {
    if (!slice.config) return;
    const token = def.id + "-" + (app.state && app.state.id ? app.state.id : "local");
    const key = "holo-appconfig-" + token;
    let present = false;
    try { present = !!(window.localStorage.getItem(key)); } catch (e) {}
    if (!present) stashPreviewConfig(def.id, slice.config);
    if (!slice._previewToken) slice._previewToken = token;
  }

  // A stable signature over the STORY inputs that drive app generation. When
  // this changes, previously-generated per-SKU images are stale (products may
  // have been renamed/replaced) and should be dropped; when it's unchanged, a
  // text-only "Refresh preview" can safely carry the existing images forward.
  // Uses the same ctx the generator reads (HOLO_RULES.stateToCtx) plus the
  // persona so the signature tracks exactly what feeds the catalog + copy.
  function storySignature() {
    try {
      const rules = window.HOLO_RULES;
      const cx = (rules && rules.stateToCtx) ? rules.stateToCtx(app.state) : {};
      const persona = (app.state && app.state.personas && app.state.personas[0]) || null;
      const sig = {
        customerName: cx.customerName || "",
        industry: cx.industry || "",
        website: cx.website || "",
        audience: cx.audience || "",
        products: cx.products || [],
        storyActs: cx.storyActs || [],
        scriptText: cx.scriptText || "",
        bigProblem: cx.bigProblem || "",
        futureVision: cx.futureVision || "",
        persona: persona ? { name: persona.name, role: persona.role } : null,
      };
      return JSON.stringify(sig);
    } catch (e) { return ""; }
  }

  // Carry already-generated product images from a prior config onto a freshly
  // rebuilt (text-refresh) config, matched by product id. Ids come from the
  // shared catalog so they're stable across a text refresh when the story is
  // unchanged. Returns the count of images carried over.
  function carryImagesForward(prevConfig, newConfig) {
    const prev = (prevConfig && prevConfig.productImages) || {};
    const ids = {};
    ((newConfig && newConfig.products) || []).forEach(function (p) { if (p && p.id) ids[p.id] = true; });
    const kept = {};
    Object.keys(prev).forEach(function (id) { if (ids[id]) kept[id] = prev[id]; });
    if (Object.keys(kept).length) newConfig.productImages = Object.assign({}, newConfig.productImages, kept);
    return Object.keys(kept).length;
  }

  // Persist a generated config where the preview iframe can read it. A stable
  // per-app token keeps the storage key predictable and lets a regenerate
  // overwrite in place. Returns the token.
  //
  // We write to localStorage (NOT sessionStorage) because "Open full-screen"
  // does window.open() into a SEPARATE browsing context, and sessionStorage is
  // per-tab — the new tab wouldn't see a sessionStorage-only config and would
  // fall back to the stock Total Wine sample. localStorage is shared across
  // tabs of the same origin, so the full-screen tab renders the same generated
  // config as the inline iframe. We also mirror to sessionStorage for older
  // read shims.
  function stashPreviewConfig(appId, config) {
    const token = appId + "-" + (app.state && app.state.id ? app.state.id : "local");
    const key = "holo-appconfig-" + token;
    const json = JSON.stringify(config);
    try { window.localStorage.setItem(key, json); } catch (e) { /* quota */ }
    try { window.sessionStorage.setItem(key, json); } catch (e) { /* quota */ }
    return token;
  }

  // R3/R4: generate a per-customer version of an app in TWO gated tiers so we
  // don't crush image-generation tokens on every look/feel iteration.
  //
  //   mode "preview" (cheap, default first click): one Gemini TEXT call + local
  //     assembly. NO per-SKU image generation — products fall back to the
  //     neutral procedural SVG. Sets _previewOnly. Cheap + re-runnable.
  //   mode "ai" (expensive, opt-in): the per-SKU photo pass. If a preview
  //     config is already cached we photograph THAT (no second text call);
  //     otherwise we run text first, then photos. Sets _aiGenerated, clears
  //     _previewOnly. This is the ONLY path that spends image tokens.
  //
  // Guarded so a failure never leaves the card stuck — worst case it keeps the
  // previous config / sample data.
  function generateApp(def, slice, mode, opts) {
    mode = mode || "preview";
    opts = opts || {};
    // forceText: rebuild the TEXT config (chips/copy/catalog) from Gemini even
    // when a cached config exists. Set by an explicit "Regenerate with AI" so a
    // regenerate actually refreshes the copy — not just re-photographs the old
    // config. The first AI upgrade from a fresh preview leaves this false to
    // avoid a redundant second text call (the preview already ran text).
    const forceText = !!opts.forceText;
    if (slice._generating) return;
    if (!window.HOLO_APPFOUND) {
      slice._genStatus = "Generator unavailable.";
      renderMain();
      return;
    }
    slice._generating = true;
    slice._genMode = mode;
    slice._progress = 0;
    slice._genStatus = mode === "ai" ? "Preparing AI generation…" : "Starting preview…";
    // Cancellation support: an AbortController lets the SE stop an in-flight
    // AI run (e.g. started prematurely). We also snapshot the pre-run tier
    // state so a cancel restores exactly what the card showed before.
    const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    slice._abort = controller;
    slice._preRun = {
      config: slice.config,
      productImages: slice.productImages,
      extracted: slice.extracted,
      _previewToken: slice._previewToken,
      _previewOnly: slice._previewOnly,
      _aiGenerated: slice._aiGenerated,
      _genStatus: "",
    };
    slice._cancelled = false;
    renderMain(); // reflect the busy state (and render the progress bar) immediately

    // The preview tier is a single text stage → the whole bar is that stage.
    // The AI tier's bar is dominated by the per-SKU photo stage; if it also has
    // to run text first (no cached config) we give text a small leading slice.
    const hasCachedConfig = !!(slice.config && (slice.config.products || slice.config.catalog));
    // Re-run the text pass for a preview, when there's no cache yet, OR when the
    // caller forces it (explicit Regenerate) so copy/chips actually refresh.
    const needsText = mode === "preview" || !hasCachedConfig || forceText;
    const FOUND_WEIGHT = mode === "preview" ? 1 : (needsText ? 0.25 : 0);
    const PHOTO_WEIGHT = mode === "preview" ? 0 : (1 - FOUND_WEIGHT);

    // Shared 12-SKU catalog policy (single source of truth for reuse-vs-rebuild).
    // The catalog is built ONCE and pinned to the story signature: the first app
    // to generate seeds app.state.retailCatalog; the second app (and any
    // unchanged-story regenerate) reuses it verbatim. We only rebuild — replacing
    // the whole set, never unioning — when there's no shared catalog yet or the
    // story changed. This keeps the catalog at exactly 12 SKUs (12 image calls),
    // instead of ballooning on each regenerate. app-foundations.js assemble()
    // applies the decision; we just compute it here where storySignature() lives.
    const sigNow = storySignature();
    const rebuildCatalog = !(Array.isArray(app.state.retailCatalog) &&
      app.state.retailCatalog.length &&
      app.state.retailCatalogSig === sigNow);

    // Update in place so per-photo ticks don't trigger a full re-render (which
    // would reload the preview iframe). Mirrors the bx-appgen-status pattern.
    function setProgress(frac, text) {
      slice._progress = Math.max(0, Math.min(1, frac));
      if (text != null) slice._genStatus = text;
      const fill = document.getElementById("bx-appgen-fill-" + def.id);
      if (fill) fill.style.width = Math.round(slice._progress * 100) + "%";
      const label = document.getElementById("bx-appgen-status-" + def.id);
      if (label && text != null) label.textContent = text;
    }
    const foundStatus = function (msg, f) { setProgress((f || 0) * FOUND_WEIGHT, msg); };
    const photoStatus = function (msg, f) { setProgress(FOUND_WEIGHT + (f || 0) * PHOTO_WEIGHT, msg); };

    // Finish + persist whichever tier we ran.
    function finish(config, tier) {
      // If the SE cancelled mid-run, cancelAppGen already restored the prior
      // state — don't let a late-resolving promise clobber it.
      if (slice._cancelled) return;
      setProgress(1, "Done.");
      // Product imagery policy: show neutral shopping-cart placeholders until the
      // AI photo pass runs. The preview (text-only) tier keeps _placeholder; the
      // AI tier clears it so the branded silhouette / real photos show through.
      //
      // BUT: a text-only "Refresh preview" must NOT discard images already
      // generated — unless the STORY changed (which makes them stale). If the
      // slice had AI images and the story signature is unchanged, carry them
      // forward, keep the AI tier, and keep photos visible. If the story
      // changed, let them drop (placeholders) so the SE knows to regenerate.
      const prevRun = slice._preRun || {};
      const sigNow = storySignature();
      // The shared image store counts as "images we can carry" even if THIS app
      // never generated them — that's how app B's preview shows the shared 12.
      const sharedFresh = !!(app.state.retailImages &&
        Object.keys(app.state.retailImages).length &&
        app.state.retailCatalogSig === sigNow);
      const hadImages = !!(prevRun._aiGenerated ||
        (slice.productImages && Object.keys(slice.productImages).length) ||
        sharedFresh);
      // Story is "unchanged" for carry purposes if this slice's own image sig
      // matches OR the shared store was built at the current signature.
      const storyUnchanged = hadImages && ((slice._imageStorySig && slice._imageStorySig === sigNow) || sharedFresh);
      let keepAiTier = false;
      if (tier === "preview" && storyUnchanged) {
        // Pool this app's own images on top of the shared store (own wins).
        const pool = Object.assign({}, app.state.retailImages || {}, slice.productImages || {});
        const carried = carryImagesForward({ productImages: pool }, config);
        if (carried) {
          keepAiTier = true;
          slice.productImages = config.productImages;
          slice._genStatus = "Preview refreshed — kept your " + carried + " AI product image" + (carried === 1 ? "" : "s") + " (story unchanged).";
        }
      } else if (tier === "preview" && hadImages && !storyUnchanged) {
        // Story changed → existing images are stale; drop them and flag it.
        slice.productImages = null;
        slice._genStatus = "Preview refreshed — story changed, so AI images were cleared. Regenerate with AI to refresh them.";
      }
      const effTier = keepAiTier ? "ai" : tier;
      config._placeholder = effTier !== "ai";
      slice.config = config;
      slice.extracted = true;
      slice._previewToken = stashPreviewConfig(def.id, config);
      slice._previewOnly = effTier === "preview";
      slice._aiGenerated = effTier === "ai";
      // Record the story signature whenever images are now in play, so a later
      // refresh can tell whether they're still valid.
      if (effTier === "ai") { slice._imageStorySig = sigNow; slice.productImages = config.productImages || slice.productImages; }
      else if (!hadImages || !storyUnchanged) { slice._imageStorySig = null; }
      slice._generating = false;
      slice._genMode = null;
      slice._progress = 0;
      // Keep an informative refresh message (kept/cleared images) as the resting
      // status; otherwise clear it. finish set _genStatus above only in those
      // cases — everything else should rest blank.
      if (slice._genStatus === "Done.") slice._genStatus = "";
      slice._abort = null;
      slice._preRun = null;
      commit();
      renderMain(); // iframe now points at ?holo=<token> → customer data
    }
    function fail(err) {
      if (slice._cancelled) return; // cancel path already restored state
      slice._generating = false;
      slice._genMode = null;
      slice._progress = 0;
      slice._genStatus = "Generation failed: " + ((err && err.message) || err);
      slice._abort = null;
      slice._preRun = null;
      renderMain();
    }

    // The per-SKU photo pass (AI tier only). Best-effort; SVG fallback per item.
    // Reuses the SHARED image store (app.state.retailImages) when it matches the
    // current story, so the second app / an unchanged-story regenerate spend 0
    // image calls; then writes any newly generated images back to the shared
    // store so it stays authoritative for the other app.
    function runPhotos(config) {
      photoStatus("Generating product photos…", 0);
      const proj = (app.state && app.state.project) || {};
      const sharedImgs = (app.state.retailImages && app.state.retailCatalogSig === storySignature())
        ? app.state.retailImages : {};
      return HOLO_APPFOUND.generateProductPhotos(def.id, config, {
        onStatus: photoStatus,
        industry: proj.industry || "",
        customerName: proj.customerName || "",
        existingImages: sharedImgs,
        signal: controller ? controller.signal : null,
      })
        .then(function (images) {
          if (images && Object.keys(images).length) {
            config.productImages = Object.assign({}, config.productImages, images);
            slice.productImages = config.productImages;
            // Keep the shared store authoritative so the other app reuses these.
            app.state.retailImages = Object.assign({}, app.state.retailImages, config.productImages);
          }
          return config;
        })
        .catch(function () { return config; });
    }

    // AI tier with a cached preview config AND no forced text rebuild: skip the
    // text call, just photograph the cached config (the cheap first upgrade).
    if (mode === "ai" && hasCachedConfig && !forceText) {
      runPhotos(slice.config)
        .then(function (config) { finish(config, "ai"); })
        .catch(fail);
      return;
    }

    // Preview tier, or AI tier with no cached config yet: run text first.
    HOLO_APPFOUND.generate(def.id, app.state, { onStatus: foundStatus, storySig: sigNow, rebuildCatalog: rebuildCatalog })
      .then(function (out) {
        slice._usedGemini = out.usedGemini;
        if (mode === "preview") return { config: out.config, tier: "preview" };
        // AI tier without a cache — chain straight into photos.
        return runPhotos(out.config).then(function (config) { return { config: config, tier: "ai" }; });
      })
      .then(function (r) { finish(r.config, r.tier); })
      .catch(fail);
  }

  // AI tier is confirm-gated so it can't silently re-spend image tokens.
  function generateAppAI(def, slice) {
    const already = slice._aiGenerated;
    const msg = already
      ? "Regenerate this app with AI? This rebuilds the copy, search suggestions and catalog AND re-runs the full image pass, spending Gemini text + image tokens."
      : "Generate with AI? This runs per-product image generation and spends image-generation tokens. (Your preview stays if you cancel.)";
    if (!window.confirm(msg)) return;
    // An explicit regenerate on an already-AI'd app must refresh the TEXT too
    // (chips/copy/catalog), not just re-photograph the stale config. The first
    // upgrade from a fresh preview keeps the cheap photograph-the-preview path.
    generateApp(def, slice, "ai", { forceText: already });
  }

  // Cancel an in-flight generation (usually a premature AI run). Aborts any
  // pending image calls and restores the exact tier state the card had before
  // the run started — so cancelling never loses the previous preview/AI result.
  function cancelAppGen(def, slice) {
    if (!slice._generating) return;
    slice._cancelled = true;
    try { if (slice._abort) slice._abort.abort(); } catch (_) {}
    const prev = slice._preRun || {};
    slice.config        = prev.config != null ? prev.config : slice.config;
    slice.productImages = prev.productImages != null ? prev.productImages : slice.productImages;
    slice.extracted     = !!prev.extracted;
    slice._previewToken = prev._previewToken || null;
    slice._previewOnly  = !!prev._previewOnly;
    slice._aiGenerated  = !!prev._aiGenerated;
    slice._generating   = false;
    slice._genMode      = null;
    slice._progress     = 0;
    slice._genStatus    = "Cancelled — kept the previous version.";
    slice._abort        = null;
    slice._preRun       = null;
    commit();
    renderMain();
  }

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
        deviceFrame: "mobile", iframeAllowed: true,
        fallbackMode: "link-card", status: "ready", notes: "",
        imageSlot: "",  // "" = auto-match by type/name; else an explicit CX-still slot (component-wide default)
        imageSlotsBySlide: {},  // { [slideId]: slot } — per-slide override, wins over imageSlot
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

      // Per-slide still image: once a component is tied to a specific slide,
      // the SE can pick exactly which CX still that slide shows — this wins
      // over the component-wide default (Assets page) and the type/name
      // heuristic. Stored on c.imageSlotsBySlide[slideId]; "" clears it.
      if (currentLink) {
        const imgSel = el("select", { class: "bx-select" });
        imgSel.appendChild(el("option", { value: "", text: "Use component default / auto" }));
        const bySlide = c.imageSlotsBySlide || {};
        CX_IMAGE_SLOTS.forEach(function (opt) {
          const o = el("option", { value: opt.slot, text: opt.label });
          if ((bySlide[currentLink] || "") === opt.slot) o.setAttribute("selected", "selected");
          imgSel.appendChild(o);
        });
        imgSel.addEventListener("change", function () {
          c.imageSlotsBySlide = c.imageSlotsBySlide || {};
          if (imgSel.value) c.imageSlotsBySlide[currentLink] = imgSel.value;
          else delete c.imageSlotsBySlide[currentLink];
          commit();
        });
        item.appendChild(el("div", { class: "bx-field" }, [
          el("label", { class: "bx-label", text: "Image for this slide" },
            [el("span", { class: "bx-help-inline", text: "(optional)" })]),
          imgSel,
        ]));
      }

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
    // Note: there is intentionally no "cxUnifiedProfile" still slot — the
    // Unified Profile slide always renders the interactive carousel, so a
    // generated still for it would never be shown.
    { slot: "cxInstagramAd", group: "CX component stills", label: "Instagram ad still",
      help: "Paid-social / Instagram ad creative. Shows inside the phone frame on Embedded CX / device slides.",
      layouts: ["embeddedCxComponent", "deviceMoment"], always: true, accept: "image/*" },
    { slot: "cxShopperAgent", group: "CX component stills", label: "Shopper agent still",
      help: "Shopper / commerce agent chat screenshot. Shows inside the phone frame.",
      layouts: ["embeddedCxComponent", "deviceMoment"], always: true, accept: "image/*" },
    { slot: "cxTextConvo", group: "CX component stills", label: "Agentic text thread still",
      help: "SMS / agentic text-message thread. Shows inside the phone frame on Embedded CX slides. (The Agent Conversation slide now renders an interactive scripted chat, so no still is used there.)",
      layouts: ["embeddedCxComponent"], always: true, accept: "image/*" },
    { slot: "cxEmailConvo", group: "CX component stills", label: "Agentic email still",
      help: "Agentic email / mail-app conversation. Shows inside the phone frame on the Agentic Email Conversation / Embedded CX / device slides.",
      layouts: ["embeddedCxComponent", "deviceMoment"], always: true, accept: "image/*" },
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
      storyInterstitial: "Story / context",
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
  // them as inline form fields on Step 5 so the SE can polish copy
  // without bouncing back through canonical steps. `source` is just
  // a hint label so SEs know where the value normally lives.
  // Editors bind directly to the canonical state path, so edits show
  // up identically on Step 1/2/3/4 — no duplication, no drift.
  function pendingTextItems(state) {
    const out = [];
    const personas = state.personas || [];
    const f = state.storyFoundations = state.storyFoundations || {};

    if (!state.project.presenterName) {
      out.push({
        label: "Presenter name", source: "Step 2 · Setup",
        placeholder: "e.g. Jane Smith", type: "input",
        get: function () { return state.project.presenterName || ""; },
        set: function (v) { state.project.presenterName = v; },
      });
    }
    if (!state.project.presenterTitle) {
      out.push({
        label: "Presenter title", source: "Step 2 · Setup",
        placeholder: "e.g. Senior Account Executive", type: "input",
        get: function () { return state.project.presenterTitle || ""; },
        set: function (v) { state.project.presenterTitle = v; },
      });
    }
    if (!personas.length) {
      out.push({
        label: "No personas added", source: "Step 1 · Personas",
        readonly: true, hint: "Personas are needed for the 'Meet the persona' slide. Add one on Step 1.",
      });
    } else {
      personas.forEach(function (p, i) {
        const tag = p.name ? p.name : "Persona " + (i + 1);
        if (!p.name) {
          out.push({
            label: tag + " name", source: "Step 1 · Personas",
            placeholder: "e.g. Rachel Chen", type: "input",
            get: function () { return p.name || ""; },
            set: function (v) { p.name = v; },
          });
        }
        if (!p.role) {
          out.push({
            label: tag + " role", source: "Step 1 · Personas",
            placeholder: "e.g. Loyalty member · Suburban mom", type: "input",
            get: function () { return p.role || ""; },
            set: function (v) { p.role = v; },
          });
        }
        if (!p.painPoints && !p.goals) {
          out.push({
            label: tag + " quote / pain points", source: "Step 1 · Personas",
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
          label: tag + " pronouns", source: "Step 1 · Personas",
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
    // /api/logo is gated on the same JWT as the Data API — attach the bearer.
    const auth = window.HOLO_AUTH;
    const headersP = auth && auth.authHeaders ? auth.authHeaders() : Promise.resolve({});
    return headersP
      .then(function (headers) {
        return AUBREY.inlineImageAsDataUrl("/api/logo?domain=" + encodeURIComponent(domain), headers);
      })
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

    // Story-specific scene cues the AI extractor derived for THIS customer
    // (storyFoundations.imageCues). Each is a short scene phrase for one asset
    // slot (venue / mobileScreen / webScreen / assistant / socialAd / socialCta
    // / hero). When present they DE-RETAIL the generic defaults below — e.g. an
    // event customer gets a venue exterior + "Book Your Event" CTA instead of a
    // storefront + "Shop Now". Absent (Gemini off, or field missing) → the
    // neutral fallbacks in each intent apply. cue() returns "" for missing/TODO.
    const cues = (f && typeof f.imageCues === "object" && f.imageCues) || {};
    const cue = function (k) { const t = String(cues[k] || "").trim(); return /^\[TODO/i.test(t) ? "" : t; };
    const socialCta = cue("socialCta") || "Learn More"; // neutral default (was hardcoded "Shop Now")

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
      "storeExterior": "an inviting " + (cue("venue") || "building / venue exterior") + " photo" +
        (customer ? " for \"" + customer + "\"" : "") +
        (industry ? " in the " + industry + " industry" : "") + ", daytime, no people",
      "storeInterior": "a bright, modern interior photo of " +
        (cue("venue")
          ? "a " + cue("venue")
          : (industry ? "a " + industry + " space where customers are served" : "a space where customers are served")) +
        ", no people, clean composition",
      "productHero": "a premium hero shot" +
        (cue("hero") ? " of " + cue("hero") : (theme ? " illustrating \"" + theme + "\"" : "")) +
        (!cue("hero") && firstFew(f.commerceMoments, 1).length ? " — " + firstFew(f.commerceMoments, 1)[0] : "") +
        ", studio lighting on a clean background",
      "iPhoneRec": UI_ART + " A mobile app screen" +
        (cue("mobileScreen")
          ? " showing " + cue("mobileScreen")
          : (firstFew(f.customerMoments, 1).length
              ? " showing " + firstFew(f.customerMoments, 1)[0]
              : " showing personalized recommendations")) +
        (products.length ? " (powered by " + products.slice(0, 2).join(", ") + ")" : "") +
        ". 9:16 vertical mobile composition.",
      "webBrowseGif": UI_ART + " A modern " + (cue("webScreen") || "web app / website") + " screen" +
        (customer ? " for \"" + customer + "\"" : "") +
        (!cue("webScreen") && firstFew(f.customerMoments, 1).length ? " showing " + firstFew(f.customerMoments, 1)[0] : "") +
        ". 16:10 desktop browser composition.",
      "laptopBrowsingGif": UI_ART + " A modern web application screen on a laptop" +
        (firstFew(f.customerMoments, 1).length ? " showing " + firstFew(f.customerMoments, 1)[0] : "") +
        ". 16:10 desktop composition.",

      // No "cxUnifiedProfile" prompt — the Unified Profile slide always renders
      // the interactive carousel, so a generated still for it is never shown.
      "cxInstagramAd": UI_ART + " A single full-screen Instagram Story / Reel paid social ad creative" +
        (customer ? " for \"" + customer + "\"" : "") +
        ". A bold hero " + (cue("socialAd") || "product/lifestyle") + " image that bleeds edge-to-edge and " +
        "fills the ENTIRE vertical frame with no borders, no margins and no letterbox bars, a small brand " +
        "handle row at top, like/comment/share icons, a 'Sponsored' tag, one short large headline and a \"" +
        socialCta + "\" button" +
        (!cue("socialAd") && firstFew(f.commerceMoments, 1).length ? " promoting " + firstFew(f.commerceMoments, 1)[0] : "") +
        ". The composition MUST be an EXACT 9:19 vertical (portrait) aspect ratio to match the phone " +
        "screen. Keep all critical elements inside a center-safe area: the brand handle at top and the \"" +
        socialCta + "\" button at bottom must sit within a comfortable margin from every edge (not flush to " +
        "the edges) so nothing important is clipped if the screen letterboxes. Tall 9:19 full-bleed vertical " +
        "mobile story composition that fills the whole phone screen edge to edge.",
      "cxShopperAgent": UI_ART + " " + (cue("assistant") || "An AI assistant chat screen on a phone") +
        (customer ? " for \"" + customer + "\"" : "") +
        ". Header with an agent name, two or three short chat bubbles, and a horizontal row of " +
        "recommendation cards (image + short label)" +
        (personaPain ? " helping with " + personaPain : "") +
        ". Friendly, on-brand. 9:16 vertical mobile composition.",
      "cxTextConvo": UI_ART + " An SMS / iMessage-style text thread on a phone between " +
        (personaName || "a customer") + " and a brand assistant" +
        (customer ? " from \"" + customer + "\"" : "") +
        ". Three or four short bubbles (incoming gray, outgoing brand-color), a typing indicator, " +
        "and a message input bar" +
        (personaPain ? ", resolving " + personaPain : "") +
        ". Short realistic messages only. 9:16 vertical mobile composition.",
      "cxEmailConvo": UI_ART + " A mobile email / mail-app screen on a phone showing an on-brand " +
        "message to " + (personaName || "a customer") +
        (customer ? " from \"" + customer + "\"" : "") +
        ". Mail-app header (back arrow, avatar), a sender row with name and address, a bold subject " +
        "line, and a short readable email body with a clear call-to-action button" +
        (personaPain ? " addressing " + personaPain : "") +
        ". Realistic, concise copy only. 9:16 vertical mobile composition.",
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

  // ─── Journey-map circle image prompt ─────────────────────────
  // One contextual scene per journey phase, rendered into the live
  // /demo map's circle. Mirrors buildAssetPrompt's context extraction
  // but for a photographic phase moment (no UI mockup, no text).
  function buildJourneyStepPrompt(s, step, i) {
    const p = (s && s.project) || {};
    const f = (s && s.storyFoundations) || {};
    const persona = (Array.isArray(s && s.personas) && s.personas[0]) || {};
    const clean = function (v) { const t = String(v || "").trim(); return /^\[TODO/i.test(t) ? "" : t; };
    const snippet = function (v, n) { const t = clean(v); return t ? t.slice(0, n || 160) : ""; };

    const customer = clean(p.customerName);
    const industry = clean(p.industry);
    const personaName = clean(persona.name);
    const personaRole = clean(persona.role);
    const personaGoals = snippet(persona.goals, 120);
    const phaseTitle = clean(step && (step.title || step.phaseTitle)) || ("Phase " + (i + 1));
    const phaseDesc = snippet(step && (step.descriptionShort || step.description), 180);

    const NO_GARBLE = "Avoid: any text, words, letters, numbers, logos, watermarks, UI, " +
      "misspelled or garbled type, borders, or captions.";

    const subject = personaRole
      ? ("a " + personaRole + (personaName ? " (" + personaName + ")" : ""))
      : (personaName || "a customer");

    const ctx = [];
    if (customer) ctx.push("Customer: " + customer);
    if (industry) ctx.push("Industry: " + industry);
    if (personaGoals) ctx.push("Persona goal: " + personaGoals);

    return [
      "A cinematic, photographic scene representing the \"" + phaseTitle + "\" moment of a " +
        (industry ? industry + " " : "") + "customer journey" +
        (customer ? " for " + customer : "") + ", featuring " + subject +
        (phaseDesc ? ": " + phaseDesc : "") + ".",
      ctx.length ? ("Context — " + ctx.join("; ") + ".") : "",
      "Warm, editorial lighting; a single clear focal subject; centered composition that reads " +
        "well cropped into a circle. Realistic and on-brand. No text or logos anywhere in the image.",
      NO_GARBLE,
    ].filter(Boolean).join(" ");
  }

  // ─── Journey-map circle image auto-generation (export-time) ───
  // Called before a demo export/publish builds holodeck.config.js.
  // For each journey phase MISSING a "journeyStep<i>" asset, generate a
  // contextual image via Gemini and store it in state.assetLibrary so it
  // persists (project-store tokenizes it) and flows into the exported
  // config via buildJourney. Cached: already-generated phases are skipped,
  // so re-export is free. Degrades gracefully when Gemini is unavailable.
  function ensureJourneyImages(s) {
    const GEMINI = window.HOLO_GEMINI;
    const SHARED = window.HOLO_SHARED;
    if (!s) return Promise.resolve(0);
    // isConfigured() is async; skip only on the hard "no client" case and let
    // per-image generateImage rejections (incl. unconfigured server) fall back
    // to the emoji gracefully.
    if (!GEMINI || !GEMINI.generateImage) return Promise.resolve(0);
    if (!SHARED || !SHARED.bucketActsIntoFive) return Promise.resolve(0);

    const acts = Array.isArray(s.storyActs) ? s.storyActs : [];
    const prods = (s.project && Array.isArray(s.project.products) ? s.project.products : []).filter(Boolean);
    const f = s.storyFoundations || {};
    const steps = SHARED.bucketActsIntoFive(acts, prods, f.journeyPhases) || [];
    if (!steps.length) return Promise.resolve(0);

    s.assetLibrary = s.assetLibrary || {};
    const missing = [];
    steps.forEach(function (step, i) {
      const slot = "journeyStep" + i;
      const cur = s.assetLibrary[slot];
      if (typeof cur === "string" && cur) return; // cached — skip
      missing.push({ step: step, i: i, slot: slot });
    });
    if (!missing.length) return Promise.resolve(0);

    try { toast("Generating " + missing.length + " journey image" + (missing.length > 1 ? "s" : "") + "…"); } catch (_) {}

    return Promise.all(missing.map(function (m) {
      return GEMINI.generateImage({ prompt: buildJourneyStepPrompt(s, m.step, m.i) })
        .then(function (url) {
          if (typeof url === "string" && url) s.assetLibrary[m.slot] = url;
          return true;
        })
        .catch(function (err) {
          try { console.warn("[holodeck] journey image " + m.i + " failed:", (err && err.message) || err); } catch (_) {}
          return false; // leave slot empty → emoji fallback
        });
    })).then(function (results) {
      const n = results.filter(Boolean).length;
      // Persist newly-generated URLs (tokenize → save) if the store is wired.
      try { if (n && typeof commit === "function") commit(); } catch (_) {}
      return n;
    });
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
      // NOTE: intentionally do NOT inject the Salesforce products list here. The
      // persona wishlist must be CONSUMER products the persona shops for; feeding
      // the SF SKU list primed Gemini to echo "Data Cloud"/"Agentforce" into it.
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
    // Bounded-parallel waves (BATCH personas at a time, matching the image
    // batch) so persona copy fills ~BATCH× faster than one-at-a-time while
    // staying well under the server's 30-req/60s rate limit. Each persona
    // mutates only itself, so concurrent calls don't collide.
    const BATCH = 4;
    const fillOne = function (per) {
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
    };
    const runWave = function (start) {
      const slice = targets.slice(start, start + BATCH);
      if (!slice.length) return Promise.resolve();
      return Promise.all(slice.map(fillOne)).then(function () { return runWave(start + BATCH); });
    };
    return runWave(0).then(function () { return updated; });
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
        text: "Pick slides on Step 4 (Slide Selection) and we'll list out every image slot those slides can use. You can still polish text below." }));
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

          // A few images at a time is ~4x faster than one-at-a-time while
          // staying well under Gemini's rate limits. Advance to the next
          // batch only once the current one fully settles. Matches the batch
          // size used by generateProductPhotos and runPersonaCopyFill.
          const IMG_BATCH = 4;
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
      summaryHint.textContent  = n ? " — optional, edit here or in Preview (Step 7)" : " — all defaults filled in";
    }
    refreshSummary();
    summary.appendChild(summaryTitle);
    summary.appendChild(summaryHint);
    details.appendChild(summary);
    const body = el("div", { class: "bx-pending-body" });
    body.appendChild(el("div", { class: "bx-card-sub",
      text: pendingCount
        ? "Default copy you might want to replace before presenting. Saved as you type — none of this blocks export. You can also edit any of this directly on each slide in Step 7 · Preview."
        : "Every field has a value — nothing's blank. You can still fine-tune any of these below or in Step 7 · Preview." }));
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

    // ─── Attach this CX still to a demo slide ──────────────────
    // Only for CX-component stills. Lists every demo slide; picking one
    // attaches this still to that slide. Writes the same imageSlotsBySlide
    // mapping the Step-7 "Image for this slide" picker uses, so the two
    // surfaces stay in sync.
    if (CX_STILL_SLOTS.indexOf(item.slot) !== -1) {
      const demoSlides = (s.slides || []).filter(function (sl) {
        return (sl.sectionId || "") === "demo";
      });
      if (demoSlides.length) {
        const slideSel = el("select", { class: "bx-select" });
        slideSel.appendChild(el("option", { value: "", text: "Not on a specific slide" }));
        const cur = cxSlideForSlot(s, item.slot);
        demoSlides.forEach(function (sl) {
          const o = el("option", { value: sl.id,
            text: (sl.title || "Untitled") + " · " + layoutLabelShort(sl.layout || "") });
          if (cur === sl.id) o.setAttribute("selected", "selected");
          slideSel.appendChild(o);
        });
        slideSel.addEventListener("change", function () {
          cxAttachSlotToSlide(s, item.slot, slideSel.value || "");
          commit();
        });
        controls.appendChild(el("div", { class: "bx-field" }, [
          el("label", { class: "bx-label", text: "Show on slide" },
            [el("span", { class: "bx-help-inline", text: "(optional)" })]),
          slideSel,
        ]));
      }
    }

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
    { slot: "cxInstagramAd",    label: "Instagram ad still" },
    { slot: "cxShopperAgent",   label: "Shopper agent still" },
    { slot: "cxTextConvo",      label: "Agentic text thread still" },
    { slot: "cxEmailConvo",     label: "Agentic email still" },
  ];
  const CX_STILL_SLOTS = CX_IMAGE_SLOTS.map(function (o) { return o.slot; });

  // The renderer keys a per-slide CX still off the CX component linked to the
  // slide (c.imageSlotsBySlide[slideId]). These helpers let the Assets still
  // rows attach a slot to a slide using that same mapping — so the Assets
  // dropdown and the Step-7 "Image for this slide" picker stay in sync.

  // Demo slides that have a linked CX component (the only slides where a
  // per-slide still actually takes effect). Returns [{id, title, comp}].
  function cxSlideTargets(s) {
    const slides = (s.slides || []).filter(function (sl) {
      return (sl.sectionId || "") === "demo";
    });
    const out = [];
    slides.forEach(function (sl) {
      const comp = (s.cxComponents || []).filter(function (c) {
        return (c.linkedSlideIds && c.linkedSlideIds[0]) === sl.id;
      })[0];
      if (comp) {
        out.push({ id: sl.id, comp: comp,
          title: (sl.title || "Untitled") + " · " + layoutLabelShort(sl.layout || "") });
      }
    });
    return out;
  }

  // Which slide (id) currently shows the given still slot. Two binding styles:
  //   • CX-linked slides bind via the component's imageSlotsBySlide map;
  //   • deviceMoment slides (no linked component) bind via the slide's own
  //     s.imageSlot, which the deviceMoment renderer reads directly.
  // "" = not attached to any slide.
  function cxSlideForSlot(s, slot) {
    const comps = s.cxComponents || [];
    for (let i = 0; i < comps.length; i++) {
      const m = comps[i].imageSlotsBySlide || {};
      const sid = Object.keys(m).filter(function (k) { return m[k] === slot; })[0];
      if (sid) return sid;
    }
    const direct = (s.slides || []).filter(function (sl) {
      return (sl.imageSlot || "") === slot;
    })[0];
    return direct ? direct.id : "";
  }

  // Attach `slot` to `slideId` (or detach when slideId is ""). Clears this
  // slot from every component AND from every slide's direct s.imageSlot first,
  // so a slot maps to at most one slide. Then binds it using the style the
  // target slide supports:
  //   • a slide with a linked CX component → the component's imageSlotsBySlide
  //     (the one linked to it, or the first component the renderer falls back
  //     to: c = linked[0] || cxList[0]);
  //   • a deviceMoment / other slide with no linked component → the slide's own
  //     s.imageSlot, which the deviceMoment renderer reads directly.
  function cxAttachSlotToSlide(s, slot, slideId) {
    const comps = s.cxComponents || [];
    comps.forEach(function (c) {
      const m = c.imageSlotsBySlide || {};
      Object.keys(m).forEach(function (k) { if (m[k] === slot) delete m[k]; });
      c.imageSlotsBySlide = m;
    });
    (s.slides || []).forEach(function (sl) {
      if ((sl.imageSlot || "") === slot) sl.imageSlot = "";
    });
    if (slideId) {
      const linked = comps.filter(function (c) {
        return (c.linkedSlideIds && c.linkedSlideIds[0]) === slideId;
      })[0];
      const target = linked || comps[0];
      const slide = (s.slides || []).filter(function (sl) { return sl.id === slideId; })[0];
      // Prefer the direct s.imageSlot binding when the chosen slide has no CX
      // component of its own to carry the map — i.e. a deviceMoment still.
      const slideHasLinkedComp = comps.some(function (c) {
        return (c.linkedSlideIds && c.linkedSlideIds[0]) === slideId;
      });
      if (slide && !slideHasLinkedComp) {
        slide.imageSlot = slot;
      } else if (target) {
        target.imageSlotsBySlide = target.imageSlotsBySlide || {};
        target.imageSlotsBySlide[slideId] = slot;
      }
    }
  }

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
        text: "Pick slides on Step 4 — we'll surface every image slot they use." }));
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

  // ─── THEME (light / dark) ─────────────────────────────────────
  // The active theme lives on <html data-theme>. It's set before paint
  // by the boot script in index.html (saved choice → else OS). The
  // Appearance card on the Profile page lets the user override + persist
  // via localStorage["bx-theme"]. Mirrors the bx-recs-view convention.
  function getTheme() {
    try {
      var v = localStorage.getItem("bx-theme");
      if (v === "light" || v === "dark") return v;
    } catch (e) {}
    return document.documentElement.getAttribute("data-theme") || "light";
  }
  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    try { localStorage.setItem("bx-theme", mode); } catch (e) {}
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
        } else if (sec.id === "demo") {
          // The demo section carries the bulk of the cards (many near-
          // duplicate device/agent/data moments). Group them by intent and
          // tuck the lower-priority options behind a disclosure so the
          // selector reads as a short curated list, not a wall of cards.
          renderDemoSectionCards(c, sec, mode);
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

  // Fixed display order for the demo section's intent groups. Anything not
  // listed (e.g. "Other moments") falls to the end in encounter order.
  const DEMO_INTENT_ORDER = [
    "Context & story",
    "Agent moments",
    "Data moments",
    "Commerce moments",
    "Live CX moments",
    "Device moments",
    "Other moments",
  ];

  // Render the demo section as intent groups. Within each group the
  // required/recommended cards show inline; the optional long-tail collapses
  // behind a "More options" disclosure. Pure presentation — selection state,
  // ids, and buildSlidePlanFromSelections are untouched.
  function renderDemoSectionCards(container, sec, mode) {
    const s = app.state;
    // Bucket by intentGroup (preserving priority order within each).
    const buckets = {};
    const seen = [];
    sec.slides.forEach(function (r) {
      const g = r.intentGroup || "Other moments";
      if (!buckets[g]) { buckets[g] = []; seen.push(g); }
      buckets[g].push(r);
    });
    // Order groups: known order first, then any extras in encounter order.
    const groups = DEMO_INTENT_ORDER.filter(function (g) { return buckets[g]; })
      .concat(seen.filter(function (g) { return DEMO_INTENT_ORDER.indexOf(g) < 0; }));

    groups.forEach(function (g) {
      const recs = buckets[g];
      // Curated tier = required + recommended; long-tail = optional, but
      // anything the SE has actively selected is promoted to the curated
      // tier so a kept card never hides inside the collapsed disclosure.
      const curated = recs.filter(function (r) {
        return r.selectionStatus === "required"
          || r.selectionStatus === "recommended"
          || !!s.selectedRecIds[r.id];
      });
      const more = recs.filter(function (r) { return curated.indexOf(r) < 0; });

      const groupEl = el("div", { class: "bx-intent-group" });
      groupEl.appendChild(el("div", { class: "bx-intent-head" }, [
        el("span", { class: "bx-intent-label", text: g }),
        el("span", { class: "bx-intent-count", text: String(recs.length) }),
      ]));

      appendCards(groupEl, curated, mode);

      if (more.length) {
        const moreSelected = more.filter(function (r) { return !!s.selectedRecIds[r.id]; }).length;
        const det = el("details", { class: "bx-intent-more" });
        const sum = el("summary", { class: "bx-intent-more-summary",
          text: "More options (" + more.length + ")"
            + (moreSelected ? " · " + moreSelected + " on" : "") });
        det.appendChild(sum);
        const body = el("div", { class: "bx-intent-more-body" });
        appendCards(body, more, mode);
        det.appendChild(body);
        groupEl.appendChild(det);
      }
      container.appendChild(groupEl);
    });
  }

  // Append a list of recs as either grid or list cards into a parent node.
  function appendCards(parent, recs, mode) {
    if (mode === "grid") {
      const grid = el("div", { class: "bx-rec-grid" });
      recs.forEach(function (r) { grid.appendChild(recGridCard(r)); });
      parent.appendChild(grid);
    } else {
      recs.forEach(function (r) { parent.appendChild(recCard(r)); });
    }
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

    // Reorder controls (only for slides that will actually render). Reorder is
    // within-section — moveSlideInOrder enforces that. Buttons stop propagation
    // so they don't toggle the card's select-on-click label.
    if (isOn) {
      const reorder = el("div", { class: "bx-rec-reorder" });
      const up = upBtn(function (e) { e.stopPropagation(); moveSlideInOrder(r.id, -1); });
      const dn = downBtn(function (e) { e.stopPropagation(); moveSlideInOrder(r.id, 1); });
      up.setAttribute("title", "Move up (within section)");
      dn.setAttribute("title", "Move down (within section)");
      reorder.appendChild(up);
      reorder.appendChild(dn);
      row.appendChild(reorder);
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
      scenePhoto: "Scene moment", storyInterstitial: "Story beat",
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
    // Default enrichment: kick off the Gemini agent-conversation script in
    // the background (no-op if already present / Gemini off / no chat slide).
    // The demo falls back to the deterministic script if this never lands.
    ensureAgentChatScript();

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
      // Move works for ALL slides (including synthetic/manifest) via the
      // section-scoped slideOrder. Remove stays limited to real state.slides.
      handlers.onMoveUp   = function (id) { moveSlideInOrder(id, -1); };
      handlers.onMoveDown = function (id) { moveSlideInOrder(id, 1); };
      if (!slide.synthetic) {
        handlers.onRemove   = function (id) {
          app.state.slides = app.state.slides.filter(function (x) { return x.id !== id; });
          renderMain(); commit();
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

    // Re-render the preview body in place on every edit — keeps the
    // editor open and avoids tearing down the whole preview grid.
    const onChange = function () {
      commit();
      const body = card.querySelector(".hp");
      if (body && body.parentNode) {
        const fresh = PREVIEW.renderSlidePreview(slide, app.state, app.previewMode);
        body.parentNode.replaceChild(fresh, body);
      }
    };

    // Slides carrying a list editor (e.g. journey-timeline events) need
    // far more room than the 360px side popover — each row is #num + N
    // inputs + an emoji channel picker + reorder controls. Route those to
    // the centered modal; keep the lightweight anchored popover for the
    // simple title+notes slides where the side UX is nicer.
    const fields = PREVIEW.editorFieldsForSlide(slide) || [];
    const isWide = fields.some(function (f) { return f.kind === "list-objects"; });
    if (isWide) {
      const editor = PREVIEW.buildEditorPopover(slide, app.state, {
        onChange: onChange,
        onClose: closeModal,
      });
      openModal(slide.title || "Edit slide text", editor, "bx-edit-modal");
      return;
    }

    const pop = PREVIEW.buildEditorPopover(slide, app.state, {
      onChange: onChange,
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

    // Honor the SE's manual reorder (state.slideOrder) for the demo slides: a
    // stable re-sort by slideOrder index. Ids absent from slideOrder keep the
    // priority order above (ranked Infinity → tail). Keeps preview↔export in
    // lock-step with buildSlideManifest, which applies the same order.
    if (Array.isArray(s.slideOrder) && s.slideOrder.length) {
      const rank = {};
      s.slideOrder.forEach(function (id, i) { rank[id] = i; });
      ordered.sort(function (a, b) {
        const ra = (a.id in rank) ? rank[a.id] : Infinity;
        const rb = (b.id in rank) ? rank[b.id] : Infinity;
        return ra - rb;
      });
    }

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
    // Which companion apps will be packaged (enabled + generated).
    const exportAppIds = (window.HOLO_ZIP && window.HOLO_ZIP.enabledAppIds)
      ? window.HOLO_ZIP.enabledAppIds(s) : [];
    const appMeta = (window.HOLO_ZIP && window.HOLO_ZIP.APP_META) || {};
    const zipTreeItems = [
      el("li", { text: "📄 README.md  ·  HOW_TO_RUN.md" }),
    ];
    if (exportAppIds.length) {
      zipTreeItems.push(el("li", { text: "📄 index.html  (hub — links deck + apps)" }));
    }
    zipTreeItems.push(el("li", { text: "📁 demo/" }, [
      el("ul", {}, [
        el("li", { text: "index.html" }),
        el("li", { text: "holodeck.config.js  ·  data/holodeck-config.json" }),
        el("li", { text: "css/styles.css" }),
        el("li", { text: "js/app.js  ·  js/renderer.js" }),
        el("li", { text: "assets/  (with ASSET_INSTRUCTIONS.md)" }),
      ]),
    ]));
    if (exportAppIds.length) {
      zipTreeItems.push(el("li", { text: "📁 apps/" }, [
        el("ul", {}, exportAppIds.map(function (id) {
          const nm = (appMeta[id] && appMeta[id].name) || id;
          return el("li", { text: id + "/  (" + nm + " — branded, runnable)" });
        })),
      ]));
    }
    zipTreeItems.push(el("li", { text: "📁 source/  (builder metadata for re-import)" }));
    zipCard.appendChild(el("ul", { class: "bx-zip-tree" }, zipTreeItems));
    zipCard.appendChild(el("div", { class: "bx-card-sub bx-mt-12",
      text: exportAppIds.length
        ? ("To run: unzip and open index.html — the hub links the deck and your "
           + exportAppIds.length + " companion app" + (exportAppIds.length === 1 ? "" : "s")
           + ". No server needed.")
        : ("To run: unzip and open demo/index.html in your browser — no server needed. "
           + "(Only if a live CX component won't load, serve the demo/ folder with python3 -m http.server.)") }));
    zipCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("⬇ Download Complete Demo ZIP", "bx-btn-primary", function () {
        if (incomplete > 0) {
          if (!confirm("You can export now, but " + incomplete + " item" + (incomplete === 1 ? "" : "s") +
                       " still need attention. Export anyway?")) return;
        }
        toast("Building polished demo ZIP…");
        Promise.resolve(ensureJourneyImages(s))
          .catch(function () { return 0; })
          .then(function () { return window.HOLO_ZIP.downloadCompleteDemoZip(s); })
          .then(function () {
            toast("Polished demo ZIP downloaded");
          }).catch(function (e) {
            toast("Couldn't build the ZIP: " + (e && e.message || e));
          });
      }),
    ]));
    wrap.appendChild(zipCard);

    // ── Portable files: PowerPoint + PDF ───────────────────────
    // Native 16:9 files SEs can drop into PowerPoint / import into
    // Google Slides, plus a static PDF handout. Same words + brand +
    // AI images as the ZIP/demo. Built from the full slide manifest
    // (honors Step-5 selection + reorder) via HOLO_EXPORT_MODEL.
    const fileCard = el("div", { class: "bx-card" });
    fileCard.appendChild(el("div", { class: "bx-card-title", text: "Portable files (PowerPoint / PDF)" }));
    fileCard.appendChild(el("div", { class: "bx-card-sub",
      text: "Native 16:9 slides with the same words, brand, and images as the demo. "
          + "Drop the PPTX into PowerPoint or import it into Google Slides; the PDF is a static handout." }));
    const runFileExport = function (label, buildPromise) {
      if (incomplete > 0) {
        if (!confirm("You can export now, but " + incomplete + " item" + (incomplete === 1 ? "" : "s") +
                     " still need attention. Export anyway?")) return;
      }
      toast("Building " + label + "…");
      Promise.resolve(buildPromise()).then(function () {
        toast(label + " downloaded");
      }).catch(function (e) {
        toast("Couldn't build the " + label + ": " + (e && e.message || e));
      });
    };
    fileCard.appendChild(el("div", { class: "bx-row bx-mt-12" }, [
      btn("⬇ Download PowerPoint (.pptx)", "bx-btn-secondary", function () {
        if (!window.HOLO_PPTX) { toast("PowerPoint export isn't available — reload the page and try again."); return; }
        runFileExport("PowerPoint", function () { return window.HOLO_PPTX.downloadDeckPptx(s); });
      }),
      btn("⬇ Download PDF (.pdf)", "bx-btn-secondary", function () {
        if (!window.HOLO_PDF) { toast("PDF export isn't available — reload the page and try again."); return; }
        runFileExport("PDF", function () { return window.HOLO_PDF.downloadDeckPdf(s); });
      }),
      // NOTE: "Create Google Slides" button intentionally hidden. The backend
      // (google-slides-exporter.js / slides-renderer.js / server.js /api/slides/*)
      // is left in place, but @salesforce.com Google Workspace blocks the OAuth
      // consent (Error 400: admin_policy_enforced) until the app clears
      // Procurement / SAM / Third-Party Security review. Re-add this btn(...) to
      // re-enable once approved — no server/env changes needed:
      //   btn("⬆ Create Google Slides", "bx-btn-secondary", function () {
      //     if (!window.HOLO_GSLIDES) { toast("Google Slides export isn't available — reload the page and try again."); return; }
      //     runFileExport("Google Slides deck", function () { return window.HOLO_GSLIDES.createDeckGoogleSlides(s); });
      //   }),
    ]));
    fileCard.appendChild(el("div", { class: "bx-card-sub bx-mt-12",
      text: "Note: these are clean native slides — no CSS device-frame chrome and no live/interactive components. "
          + "A CX component shows its still image if you added one, otherwise a labeled placeholder. "
          + "Speaker notes are included in the PPTX (PDF has no notes field)." }));
    wrap.appendChild(fileCard);

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
    out.push({ label: "Story foundations populated", done: foundationsReady, hint: foundationsReady ? "" : "Run Extract Story Foundations on Step 1" });
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
        : filledAssets + " of " + relevantAssets.length + " uploaded · upload more on Step 5",
    });
    if (cx.length === 0) {
      out.push({
        label: "Live CX scene URLs added",
        done: false,
        hint: "Optional — paste AubreyDemo /frame URLs in Step 6 to embed live screens",
      });
    } else if (cxUrls < cx.length) {
      out.push({
        label: "All CX components have URLs",
        done: false,
        hint: (cx.length - cxUrls) + " of " + cx.length + " missing URLs",
      });
    }

    // Companion apps — flag any that are enabled on the Demos step but not
    // yet generated. Ungenerated apps are silently skipped in the ZIP, so
    // surface it here rather than let the SE ship a deck-only package by
    // surprise. The label names the app so it's actionable.
    const apps = s.apps || {};
    Object.keys(apps).forEach(function (id) {
      if (id === "slides") return;
      const slice = apps[id];
      if (!slice || !slice.enabled) return;
      const nm = (window.HOLO_ZIP && window.HOLO_ZIP.APP_META && window.HOLO_ZIP.APP_META[id] && window.HOLO_ZIP.APP_META[id].name) || id;
      const ready = !!slice.config;
      out.push({
        label: nm + " app generated",
        done: ready,
        hint: ready ? "Will be packaged under apps/" + id + "/" : "Enabled but not generated — click Generate on the Demos step, or it won't be in the ZIP",
      });
    });

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
  function sideAppsSummary(body) {
    const a = app.state.apps || {};
    const rows = [
      { key: "slides",      name: "Slide deck",         always: true },
      { key: "clienteling", name: "Clienteling app" },
      { key: "cimulate",    name: "Cimulate search demo" },
    ];
    rows.forEach(function (r) {
      const slice = a[r.key] || {};
      const enabled = r.always || slice.enabled;
      const card = el("div", { class: "bx-side-card" });
      card.appendChild(el("div", { class: "bx-side-card-t", text: r.name }));
      const label = r.always
        ? "Always built"
        : (enabled ? (slice.extracted ? "On · branded" : "On · sample data") : "Not selected");
      card.appendChild(el("div", { class: "bx-side-card-s", text: label }));
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
      const sub = c.url ? (c.type || "web") + " · " + (c.deviceFrame || "mobile") : "URL needed";
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
      b.addEventListener("click", function () {
        // The apps step is optional; advancing past it counts as acknowledged,
        // so its status flips from "Optional" to "Complete".
        if (stepId === "apps") app.state._appsVisited = true;
        app.state.step = next.id; renderShell(); commit();
      });
      right.appendChild(b);
    }
    wrap.appendChild(left); wrap.appendChild(right);
    return wrap;
  }

  // ─── Recompute recommendations from current state ─────────────
  // Cache for recompute(): the last ctx signature and the rule/manifest output
  // it produced. The signature is derived from the ctx object itself (below),
  // so it covers EXACTLY the fields recompute reads — a new ctx field is caught
  // automatically, never silently stale. Cleared implicitly whenever any ctx
  // field changes. The selection projection is NOT cached: it must re-run every
  // call so selectedRecIds toggles reflect immediately (see below).
  let _recomputeSig = null;
  let _recomputeOut = null; // { manifestRecs, demoRules }

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
    // Signature over the exact fields recompute consumes. When it matches the
    // last run, the heavy RULES.recommend() + manifestRecommendations() scan
    // (signal-map build + ~80-rule + script/act keyword scans) is skipped and
    // we reuse the prior output — but the merge + selection projection still
    // run below, so brand-color/presenter edits that call recompute() no longer
    // pay for a full rule scan they can't affect.
    let sig;
    try { sig = JSON.stringify(ctx); } catch (e) { sig = null; }
    let manifestRecs, demoRules;
    if (sig != null && sig === _recomputeSig && _recomputeOut) {
      manifestRecs = _recomputeOut.manifestRecs;
      demoRules = _recomputeOut.demoRules;
    } else {
      const res = RULES.recommend(ctx);
      // Merge the synthetic manifest slides (intro/journey/persona/bv) into the
      // recommendation list so the selector is 1:1 with what gets generated.
      // RULES entries for those four fixed sections never render (the export
      // uses the synthetic slides), so drop them to avoid phantom cards.
      manifestRecs = RULES.manifestRecommendations ? RULES.manifestRecommendations(s) : [];
      const fixedSections = RULES.MANIFEST_SECTIONS || ["intro", "journey-map", "meet-persona", "business-value"];
      demoRules = res.recommendations.filter(function (r) {
        return fixedSections.indexOf(r.sectionId || "demo") < 0;
      });
      _recomputeSig = sig;
      _recomputeOut = { manifestRecs: manifestRecs, demoRules: demoRules };
    }
    s.recommendations = manifestRecs.concat(demoRules);
    s.recommendations.forEach(function (r) {
      // Synthetic slides default ON (everything generated is selected), except
      // those flagged defaultOff (e.g. Business Value bv-1..bv-4 — the section
      // leads with just the Closing Quote), which seed OFF but stay toggleable;
      // demo recommendations keep the priority>=80 auto-select heuristic. Only
      // seed when the SE hasn't chosen yet (id absent) — never override a choice.
      if (s.selectedRecIds[r.id] == null) {
        if (r.defaultOff) s.selectedRecIds[r.id] = false;
        else if (r.synthetic || r.priority >= 80) s.selectedRecIds[r.id] = true;
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
        text: "Add a demo script or some context first — go to Step 1 (Script & Story) to paste a script, or fill in the SE Inputs box above. Without it the AI will invent the whole demo." }));
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
    GEMINI.generate({ prompt: promptText, jsonMode: true, useCache: true })
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

  // ─── Auto-generate the agent-conversation script (Gemini) ─────
  // Runs silently in the background when the SE reaches the Preview step:
  // builds a contextual chat from the loaded story (company/industry +
  // first persona + story acts + business value) and persists it on
  // state.agentChatScript. The demo's agentConversation slide reads this
  // cached script; if generation is skipped or fails, the demo falls back
  // to the deterministic SHARED.agentChat(). No button, no toasts — purely
  // a default enrichment. Skips when: no project, no agentConversation
  // slide, a script already exists, Gemini isn't configured, or there's
  // no story context yet. _agentChatGenInFlight guards against re-entry
  // while a request is outstanding (the Preview step re-renders often).
  let _agentChatGenInFlight = false;
  function ensureAgentChatScript() {
    const s = app.state;
    if (!s || _agentChatGenInFlight) return;
    // Already have a script → nothing to do (regeneration is manual via
    // re-running the story / clearing the field; we never overwrite).
    if (s.agentChatScript && Array.isArray(s.agentChatScript.turns) && s.agentChatScript.turns.length) return;
    // Only worth generating if the deck actually shows an agent conversation.
    const hasChatSlide = (s.slides || []).some(function (sl) { return sl.layout === "agentConversation"; });
    if (!hasChatSlide) return;
    if (!_geminiReady) return; // configured-flag resolved once at boot

    const GEMINI = window.HOLO_GEMINI;
    const AI_PROMPT = window.HOLO_AI_PROMPT;
    if (!GEMINI || !GEMINI.generate || !AI_PROMPT || !AI_PROMPT.getAgentChatPrompt) return;

    const p = s.project || {};
    const f = s.storyFoundations || {};
    const story = s.story || {};
    const persona = (s.personas || [])[0] || {};
    const acts = s.storyActs || [];

    // Compact, grounded context — the real company, the persona's pain,
    // and the actual demo acts/business value so the model writes a
    // story-specific conversation rather than a generic one.
    const clip = function (v, n) { return v ? String(v).slice(0, n) : ""; };
    const actLines = acts.slice(0, 4).map(function (a, i) {
      const bits = [
        a.title || a.demoMoment || ("Act " + (i + 1)),
        a.demoMoment && a.demoMoment !== a.title ? ("— " + clip(a.demoMoment, 140)) : "",
        a.salesforceCapabilities ? ("[" + clip(a.salesforceCapabilities, 80) + "]") : "",
        a.businessValue ? ("→ value: " + clip(a.businessValue, 100)) : "",
      ].filter(Boolean).join(" ");
      return (i + 1) + ". " + bits;
    });
    const context = [
      p.customerName ? ("Company: " + p.customerName) : "",
      p.industry ? ("Industry: " + p.industry) : "",
      p.theme ? ("Demo theme: " + clip(p.theme, 120)) : "",
      persona.name ? ("Customer persona: " + persona.name + (persona.role ? (", " + persona.role) : "")) : "",
      persona.painPoints ? ("Persona pain: " + clip(persona.painPoints, 160)) : "",
      persona.goals ? ("Persona goals: " + clip(persona.goals, 160)) : "",
      (story.bigProblem || f.businessProblem) ? ("Business problem: " + clip(story.bigProblem || f.businessProblem, 200)) : "",
      (story.businessValueMoments || f.executiveTakeaway) ? ("Business value: " + clip(story.businessValueMoments || f.executiveTakeaway, 200)) : "",
      actLines.length ? ("Demo acts:\n" + actLines.join("\n")) : "",
    ].filter(Boolean).join("\n");

    // Without real story context the model would invent a generic chat —
    // skip silently and let the deterministic fallback handle it.
    if (!context.trim()) return;

    _agentChatGenInFlight = true;
    const prompt = AI_PROMPT.getAgentChatPrompt(context);
    GEMINI.generate({ prompt: prompt, jsonMode: true })
      .then(function (text) {
        const cleaned = String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
        let data;
        try { data = JSON.parse(cleaned); } catch (_) { data = null; }
        // Validate the {turns:[{from,text|card}]} shape; keep only well-formed
        // turns so a partial response can't break the demo renderer.
        const rawTurns = (data && Array.isArray(data.turns)) ? data.turns : [];
        const turns = rawTurns.map(function (t) {
          if (!t || typeof t !== "object") return null;
          const from = (t.from === "user") ? "user" : "agent";
          if (t.kind === "card" && t.card && typeof t.card === "object") {
            const c = t.card;
            return { from: from, kind: "card", card: {
              eyebrow: String(c.eyebrow || ""), title: String(c.title || ""),
              sub: String(c.sub || ""), cta: String(c.cta || "See how"),
            } };
          }
          const txt = String(t.text || "").trim();
          if (!txt) return null;
          return { from: from, text: txt };
        }).filter(Boolean);

        // Too few usable turns → leave agentChatScript null so the demo
        // uses the deterministic fallback. Don't persist a broken script.
        if (turns.length < 2) return;
        s.agentChatScript = { turns: turns };
        commit();        // persists via the debounced saveActive (local + cloud)
        // Re-render only if still on the Preview step so the SE sees the
        // generated chat; otherwise it's already saved for the demo.
        if (app.view === "builder" && app.state === s && app.state.step === "preview") renderMain();
      })
      .catch(function () {
        // Silent: the demo falls back to SHARED.agentChat() when the script
        // is null. A failed background enrichment shouldn't interrupt the SE.
      })
      .then(function () {
        _agentChatGenInFlight = false;
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

    // Appearance — device-local light/dark preference, like the Aubrey keys
    // below. Applies instantly (flips <html data-theme>) and persists.
    container.appendChild(appearanceCard());

    // Aubrey Demo keys — device-local. This is now the canonical place to
    // manage them (removed from the topbar).
    container.appendChild(aubreyConnectionsCard("inline"));
  }

  // Light/Dark segmented control for the Profile page. Reuses the
  // .bx-segmented / .bx-seg-btn styling from the recs view toggle.
  function appearanceCard() {
    const card = el("div", { class: "bx-card" });
    card.appendChild(el("div", { class: "bx-card-title", text: "Appearance" }));
    card.appendChild(el("div", { class: "bx-card-sub",
      text: "Choose light or dark for this device. Defaults to your system setting." }));

    const seg = el("div", { class: "bx-segmented bx-mt-12" });
    function paint() {
      const active = getTheme();
      seg.replaceChildren();
      [["light", "Light"], ["dark", "Dark"]].forEach(function (opt) {
        const b = el("button", {
          type: "button",
          class: "bx-seg-btn" + (opt[0] === active ? " is-on" : ""),
          text: opt[1],
        });
        b.addEventListener("click", function () {
          if (opt[0] === getTheme()) return;
          setTheme(opt[0]);   // applies instantly via <html data-theme>
          paint();            // refresh the active-button styling
        });
        seg.appendChild(b);
      });
    }
    paint();
    card.appendChild(seg);
    return card;
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
  // Two doors, both landing in the ONE builder on Script & Story:
  //   • Script & Story — a blank project you seed by pasting, uploading,
  //     or generating a script with Gemini (all offered on that step).
  //   • Aubrey script  — pull a ready-made script from Aubrey, which
  //     auto-fills the project, then drops you on the same step.
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
      "📝",
      "Script & Story",
      "Start a new project and paste, upload, or generate a demo script with AI — the builder reads it into your foundations.",
      function () { closeModal(); newProject(); }
    ));
    grid.appendChild(chooserCard(
      "✨",
      "Aubrey script",
      "Use Aubrey? Pull a ready-made script to auto-fill customer, brand, persona, products, and story foundations in one go.",
      function () { closeModal(); newProject(function () { openAubreyScriptPicker(); }); }
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
    // Backfill slot-sized complete-thought copy before building the export
    // model, so existing projects (extracted before this feature) export with
    // the short variants too. Cached/idempotent — runs at most once per project
    // and is a no-op when Gemini is off or every field already has its Short.
    // Non-blocking to the user is unnecessary here: they clicked Export and
    // expect the current copy, so we await the (usually cached, instant) result.
    Promise.resolve(polishSlideCopy(app.state))
      .then(function (changed) { if (changed) commit(); })
      .catch(function () {})
      .then(function () { buildExportModal(); });
  }

  function buildExportModal() {
    const cfgJs   = (window.HOLO_ADAPTER && window.HOLO_ADAPTER.toPolishedHolodeckConfigJs)
      ? window.HOLO_ADAPTER.toPolishedHolodeckConfigJs(app.state)
      : CONFIG.toHolodeckConfigJs(app.state);
    const cfgJson = CONFIG.toJsonString(app.state);
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 14px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Use Complete Demo ZIP for a ready-to-run package. Use Config only when updating an existing demo folder." }));
    wrap.appendChild(el("p", { style: "margin: 0 0 14px; font-size: 13px; color: var(--bx-ink-2);",
      text: "To run the ZIP: unzip and open demo/index.html in your browser — no server needed. "
          + "(Only if a live CX component won't load, serve the demo/ folder with python3 -m http.server.)" }));
    wrap.appendChild(el("div", { class: "bx-modal-actions", style: "margin-top: 0; margin-bottom: 14px;" }, [
      btn("⬇ Download Complete Demo ZIP", "bx-btn-primary", function () {
        toast("Building polished demo ZIP…");
        Promise.resolve(ensureJourneyImages(app.state))
          .catch(function () { return 0; })
          .then(function () { return window.HOLO_ZIP.downloadCompleteDemoZip(app.state); })
          .then(function () {
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

  // ── Shared-key proxy availability (fallback path) ──────────
  // The server can hold ONE shared Aubrey key per app; when an app is
  // shared-configured, a signed-in SE with no personal key can still
  // pull (the server injects the key + their email). We cache the last
  // resolved /api/aubrey/status here so the synchronous ensureAubreyKey
  // gate can consult it; the first read kicks off the async probe and
  // re-renders when it lands. Falls back to "nothing shared" until then.
  let _aubreyStatus = { pocketsic: false, scriptwriter: false, brandkit: false };
  let _aubreyStatusLoaded = false;
  let _aubreyStatusPending = false;
  function aubreyStatus() {
    if (!_aubreyStatusLoaded && !_aubreyStatusPending && AUBREY && typeof AUBREY.proxyStatus === "function") {
      _aubreyStatusPending = true;
      AUBREY.proxyStatus().then(function (s) {
        _aubreyStatus = {
          pocketsic:    !!(s && s.pocketsic),
          scriptwriter: !!(s && s.scriptwriter),
          brandkit:     !!(s && s.brandkit),
        };
        _aubreyStatusLoaded = true;
        _aubreyStatusPending = false;
        // Re-render so status-gated UI (Brand Kit button, status lines)
        // appears once the probe resolves.
        try { renderShell(); } catch (_) {}
      });
    }
    return _aubreyStatus;
  }
  // True when the SE could pull `which` via the shared proxy right now:
  // signed in AND that app is shared-configured on the server.
  function aubreySharedAvailable(which) {
    return !!(AUTH && AUTH.isAuthed && AUTH.isAuthed() && aubreyStatus()[which]);
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

    // Shared-key status. When the server holds a shared key for an app,
    // a signed-in SE can pull WITHOUT setting their own key here — the
    // server acts on behalf of their signed-in email. This is a
    // fallback; a personal key above still takes precedence.
    const st = aubreyStatus();
    const signedIn = !!(AUTH && AUTH.isAuthed && AUTH.isAuthed());
    const sharedApps = [];
    if (st.scriptwriter) sharedApps.push("Scriptwriter");
    if (st.pocketsic)    sharedApps.push("Pocket SIC");
    if (st.brandkit)     sharedApps.push("Brand Kit");
    if (sharedApps.length) {
      card.appendChild(el("div", { class: "bx-alert bx-mt-12" + (signedIn ? " is-ok" : ""),
        text: signedIn
          ? "Shared key available for " + sharedApps.join(", ") + " — you can pull these without your own key, using your signed-in email."
          : "A shared key is available for " + sharedApps.join(", ") + " — sign in to pull these without your own key." }));
    }

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
      // Brand Kit is proxy-only — tested via the shared server key.
      testResults.appendChild(connectionTestPill("brandkit",    "Brand Kit",   "idle"));
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
    const labelMap = { demoforge: "DemoForge", scriptwriter: "Scriptwriter", pocketsic: "Pocket SIC", brandkit: "Brand Kit" };
    const fresh = connectionTestPill(name, labelMap[name], state);
    if (state === "fail" && msg) fresh.textContent = labelMap[name] + " ✗ " + msg;
    old.parentNode.replaceChild(fresh, old);
  }
  function runConnectionTests(container) {
    const c = getAubreyGlobalKeys();
    // Reset pills to "testing"
    ["demoforge","scriptwriter","pocketsic","brandkit"].forEach(function (n) {
      setConnectionTestPill(container, n, "idle");
      const old = container.querySelector('[data-aubrey-test="' + n + '"]');
      if (old) old.textContent = ({demoforge:"DemoForge",scriptwriter:"Scriptwriter",pocketsic:"Pocket SIC",brandkit:"Brand Kit"})[n] + " · testing…";
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

    // Brand Kit — proxy-only (no personal key). Tests the shared server
    // path, which needs the SE signed in and the server configured.
    if (!aubreySharedAvailable("brandkit")) setConnectionTestPill(container, "brandkit", "skipped");
    else AUBREY.brandkit.listItems()
      .then(function () { setConnectionTestPill(container, "brandkit", "ok"); })
      .catch(function (e) { setConnectionTestPill(container, "brandkit", "fail", e.message); });
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
    if (hasRequired) return c;

    // No complete personal-key setup. For the apps that have a shared
    // server-side key (pocketsic / scriptwriter), a signed-in SE can
    // still pull via the proxy — return the creds as-is (empty key),
    // which routes the client method through /api/aubrey/*. DemoForge
    // has no proxy path, so it keeps the original bail behavior.
    if ((which === "pocketsic" || which === "scriptwriter") && aubreySharedAvailable(which)) {
      return c;
    }

    if (!c[need.key]) {
      toast("Add your " + need.label + " API key under Setup → Aubrey Demo connections");
      app.state.step = "setup"; renderShell();
      return null;
    }
    if (need.needsEmail && !c.email) {
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
          recompute(); renderShell(); commit();
          closeModal();
          toast("Brand imported from Aubrey: " + (b.brand_name || ""));
        });
      })
      .catch(function (e) {
        toast("Couldn't import brand: " + e.message);
      });
  }

  // ── Brand Kit picker (Brand Kit Builder — proxy-only) ──────
  // New, shared-key-only integration: no per-device key. Requires the
  // SE to be signed in (the server injects the shared key + their
  // email). Pulls fill colors + logo only — fonts are skipped.
  function openAubreyBrandKitPicker() {
    if (!aubreySharedAvailable("brandkit")) {
      toast("Brand Kit isn't available — sign in with your salesforce.com account.");
      return;
    }
    const wrap = el("div");
    wrap.appendChild(el("p", { style: "margin: 0 0 12px; font-size: 13px; color: var(--bx-ink-2);",
      text: "Pick a brand kit. Primary, secondary + accent color and the logo will be filled in for the current customer. Existing values get overwritten." }));
    const status = el("div", { class: "bx-mt-12" });
    const list = el("div", { class: "bx-list bx-mt-12" });
    list.appendChild(el("div", { class: "bx-empty", text: "Loading brand kits…" }));
    wrap.appendChild(status); wrap.appendChild(list);
    const actions = el("div", { class: "bx-modal-actions" });
    actions.appendChild(btn("Cancel", "bx-btn-secondary", closeModal));
    wrap.appendChild(actions);
    openModal("Pull brand kit from Aubrey", wrap);

    AUBREY.brandkit.listItems()
      .then(function (items) {
        list.innerHTML = "";
        if (!items.length) {
          list.appendChild(el("div", { class: "bx-empty", text: "No brand kits found for this account." }));
          return;
        }
        items.forEach(function (it) { list.appendChild(brandKitRow(it)); });
      })
      .catch(function (e) {
        list.innerHTML = "";
        status.appendChild(el("div", { class: "bx-alert is-error", text: "Brand Kit: " + e.message }));
      });
  }
  function brandKitRow(it) {
    const fields = AUBREY.brandKitToBrandFields(it);
    const item = el("div", { class: "bx-item" });
    item.appendChild(el("div", { class: "bx-item-head" }, [
      el("div", { class: "bx-item-handle", text: fields.customerName || it.name || ("Brand kit " + it.id) }),
      el("div", { class: "bx-item-actions" }, [
        btn("Use this brand kit", "bx-btn-primary", function () {
          importBrandKitFromAubrey(it.id);
        }),
      ]),
    ]));
    const swatches = [fields.primaryColor, fields.secondaryColor, fields.accentColor].filter(Boolean);
    if (swatches.length) {
      item.appendChild(el("div", { class: "bx-help", text: "Colors: " + swatches.join(" · ") }));
    }
    return item;
  }
  function importBrandKitFromAubrey(itemId) {
    const s = app.state;
    toast("Loading brand kit from Aubrey…");
    AUBREY.brandkit.getItem(itemId)
      .then(function (item) {
        if (!item) throw new Error("Brand kit not found");
        const f = AUBREY.brandKitToBrandFields(item);
        if (f.customerName)   s.project.customerName = f.customerName;
        if (f.primaryColor)   s.brand.primaryColor   = f.primaryColor;
        if (f.secondaryColor) s.brand.secondaryColor = f.secondaryColor;
        if (f.accentColor)    s.brand.accentColor    = f.accentColor;
        const logoUrl = f.logoUrl;
        const inlineLogo = logoUrl
          ? AUBREY.inlineImageAsDataUrl(logoUrl).catch(function () { return logoUrl; })
          : Promise.resolve("");
        return inlineLogo.then(function (logo) {
          if (logo) s.brand.logoPath = logo;
          recompute(); renderShell(); commit();
          closeModal();
          toast("Brand kit imported from Aubrey" + (f.customerName ? ": " + f.customerName : ""));
        });
      })
      .catch(function (e) {
        toast("Couldn't import brand kit: " + e.message);
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
      text: "Pick a brand — its persona will be added to your project (existing personas are kept). The persona portrait will be set on Step 5 if that slot is currently empty." }));
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

        // Land the SE on the Script step so they see the pulled script
        // with the "Parse with Gemini" option available — they can choose
        // the grounded AI parser instead of only the regex extraction that
        // just ran, then continue into Foundations.
        s.step = "script";

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
      text: "Pick the scenes you want to import as CX components. The first 'site' scene's hero image will be inlined into Step 5's productHero slot if that slot is empty." }));
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
      // Evict any rows cached under a DIFFERENT account on this device so they
      // never appear under this user's "My Projects" (shared-device leak guard).
      // Runs on every sign-in; best-effort so it never blocks the boot chain.
      .then(function () { return (STORE.reconcileOwnership ? STORE.reconcileOwnership() : null); })
      .catch(function () { /* reconcile is best-effort */ })
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
    // Release my editing lock before the session ends so a collaborator can
    // pick the project up immediately (best-effort; never blocks sign-out).
    try { releaseActiveLock(); } catch (e) { /* ignore */ }
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
    // Resolve the Gemini-configured flag once; re-render if we're already
    // sitting on the preview step so the "Generate conversation" action
    // appears without a manual refresh.
    if (window.HOLO_GEMINI && window.HOLO_GEMINI.isConfigured) {
      window.HOLO_GEMINI.isConfigured().then(function (ok) {
        _geminiReady = !!ok;
        if (ok && app.view === "builder" && app.state && app.state.step === "preview") renderMain();
      });
    }

    $("#bxModal").addEventListener("click", function (e) {
      if (e.target === $("#bxModal")) closeModal();
    });
    document.addEventListener("click", function (e) {
      const action = e.target.getAttribute && e.target.getAttribute("data-action");
      if (action === "close-modal") closeModal();
    });

    // Release my editing lock on tab close / refresh so a collaborator isn't
    // blocked for the full TTL. The store issues the DELETE with keepalive so
    // it survives the page teardown (the JWT is already cached mid-session, so
    // the token lookup resolves synchronously). Best-effort — the 90s TTL is
    // the backstop if this doesn't fire (e.g. crash / stale token).
    window.addEventListener("pagehide", function () {
      try { releaseActiveLock(); } catch (e) { /* ignore */ }
    });

    // Global save shortcut: Cmd+S (mac) / Ctrl+S (win/linux) saves the active
    // project from anywhere, so the SE never has to scroll up to the Save
    // button. We always preventDefault the browser's "save page" dialog while
    // in the builder view; the actual write is a no-op in read-only sessions
    // (saveActive guards that) and off the builder view.
    document.addEventListener("keydown", function (e) {
      const isSaveKey = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
        && (e.key === "s" || e.key === "S");
      if (!isSaveKey) return;
      if (app.view !== "builder" || !app.state) return; // let the browser handle it elsewhere
      e.preventDefault();
      if (app.readOnly) { toast("This project is open in read-only mode."); return; }
      saveActive().then(function () { toast("Saved"); });
    }, true);

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
