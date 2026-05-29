// ════════════════════════════════════════════════════════════════
//  PROJECT STORE
//  localStorage-backed multi-project persistence layer.
//
//  Layout
//  ──────
//  • holodeck.projects.index       → array of {id, name, customerName, ...}
//  • holodeck.project.{projectId}  → full state for one project
//  • holodeck.activeProjectId      → which project the builder reopened to
//
//  We deliberately keep the "index" tiny so the home page can render
//  fast even with dozens of projects. The full state lives in its own
//  key so saving one project never rewrites the others.
//
//  We also migrate the legacy single-project key (holodeckBuilder.state.v1)
//  on first run so SEs don't lose the demo they were already building.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const KEY_INDEX  = "holodeck.projects.index";
  const KEY_ACTIVE = "holodeck.activeProjectId";
  const KEY_PREFIX = "holodeck.project.";
  const LEGACY_KEY = "holodeckBuilder.state.v1";

  // ─── ID generator (stable, URL-safe) ───────────────────────────
  function uid(prefix) {
    return (prefix || "p_") + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  // ─── Low-level read/write (one place that touches localStorage) ─
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ─── Index ─────────────────────────────────────────────────────
  function getIndex() {
    const arr = readJSON(KEY_INDEX, []);
    return Array.isArray(arr) ? arr : [];
  }
  function setIndex(arr) { writeJSON(KEY_INDEX, arr); }

  function summaryFromState(state) {
    const project = state.project || {};
    return {
      id:            state.id,
      name:          state.name || project.customerName || "Untitled project",
      customerName:  project.customerName || "",
      industry:      project.industry || "",
      audience:      project.audience || "",
      salesStage:    project.salesStage || "",
      products:      Array.isArray(project.products) ? project.products.slice() : [],
      status:        state.status || derivedStatus(state),
      createdAt:     state.createdAt || new Date().toISOString(),
      updatedAt:     state.updatedAt || new Date().toISOString(),
      slidesCount:   (state.slides || []).length,
      personasCount: (state.personas || []).length,
    };
  }

  function derivedStatus(state) {
    if (state.slides && state.slides.length) return "Plan ready";
    if (state.recommendations && state.recommendations.some(function (r) { return r.selected; })) return "Picking slides";
    if ((state.storyActs && state.storyActs.length) || state.scriptText) return "Story drafted";
    if (state.project && state.project.customerName) return "Setup started";
    return "New";
  }

  // ─── CRUD ──────────────────────────────────────────────────────
  function listProjects() {
    return getIndex().slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
  }

  function loadProject(id) {
    if (!id) return null;
    const state = readJSON(KEY_PREFIX + id, null);
    if (!state) return null;
    state.id = id;
    return state;
  }

  function saveProject(state) {
    if (!state) return null;
    if (!state.id) state.id = uid();
    const now = new Date().toISOString();
    if (!state.createdAt) state.createdAt = now;
    state.updatedAt = now;
    writeJSON(KEY_PREFIX + state.id, state);
    upsertIndex(summaryFromState(state));
    return state.id;
  }

  function upsertIndex(summary) {
    const idx = getIndex();
    const i = idx.findIndex(function (p) { return p.id === summary.id; });
    if (i >= 0) idx[i] = summary; else idx.push(summary);
    setIndex(idx);
  }

  function deleteProject(id) {
    const idx = getIndex().filter(function (p) { return p.id !== id; });
    setIndex(idx);
    remove(KEY_PREFIX + id);
    if (getActiveProjectId() === id) setActiveProjectId(null);
  }

  function renameProject(id, newName) {
    const state = loadProject(id);
    if (!state) return false;
    state.name = (newName || "").trim() || state.name;
    saveProject(state);
    return true;
  }

  function duplicateProject(id) {
    const original = loadProject(id);
    if (!original) return null;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = uid();
    copy.name = (original.name || original.project && original.project.customerName || "Untitled project") + " (Copy)";
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    saveProject(copy);
    return copy.id;
  }

  function createProject(seed) {
    const state = newBlankState(seed || {});
    saveProject(state);
    return state;
  }

  // Reconcile: if the index lists a project but the body record is gone,
  // drop it from the index so the home page never shows a ghost.
  function reconcile() {
    const idx = getIndex();
    const cleaned = idx.filter(function (p) { return readJSON(KEY_PREFIX + p.id, null) != null; });
    if (cleaned.length !== idx.length) setIndex(cleaned);
  }

  // ─── Active project pointer ────────────────────────────────────
  function getActiveProjectId() {
    try { return localStorage.getItem(KEY_ACTIVE) || null; } catch (e) { return null; }
  }
  function setActiveProjectId(id) {
    try {
      if (id) localStorage.setItem(KEY_ACTIVE, id);
      else localStorage.removeItem(KEY_ACTIVE);
    } catch (e) { /* ignore */ }
  }

  // ─── Blank state shape ─────────────────────────────────────────
  // Owned here so multiple modules (home, builder, importer) all
  // produce the same shape.
  function newBlankState(seed) {
    const now = new Date().toISOString();
    const id = seed.id || uid();
    return {
      id: id,
      name: seed.name || (seed.project && seed.project.customerName) || "Untitled project",
      step: "connect",
      createdAt: seed.createdAt || now,
      updatedAt: now,
      project: Object.assign({
        customerName: "", website: "", industry: "", audience: "",
        salesStage: "", products: [], theme: "", tone: "",
        presenterName: "", presenterTitle: "",
      }, seed.project || {}),
      brand: Object.assign({
        logoPath: "", primaryColor: "#b22234",
        secondaryColor: "#1a5fa0", accentColor: "#f5c06a",
        visualDirection: "", notes: "",
      }, seed.brand || {}),
      story: Object.assign({
        bigProblem: "", currentPain: "", futureVision: "",
        keyCustomerMoments: "", operationalMoments: "",
        agentforceMoments: "", dataCloudMoments: "",
        businessValueMoments: "", executiveTakeaway: "",
      }, seed.story || {}),
      personas:        seed.personas        || [],
      storyActs:       seed.storyActs       || [],
      // Step 7 asset library — keyed by adapter slot name, each value
      // is a string (data URL or file path). Empty string means "use
      // the template default / leave blank". Persona slots use
      // "persona.<slot>" so the adapter can route them.
      assetLibrary:    seed.assetLibrary    || {},
      scriptText:      seed.scriptText      || "",
      storyMode:       seed.storyMode       || "script",
      scenes:          seed.scenes          || [],
      assets:          seed.assets          || [],
      cxComponents:    seed.cxComponents    || [],
      recommendations: seed.recommendations || [],
      selectedRecIds:  seed.selectedRecIds  || {},
      customRecTitles: seed.customRecTitles || {},
      slides:          seed.slides          || [],
      slideSections:   seed.slideSections   || [],
      storyFoundations: seed.storyFoundations || blankFoundations(),
      buildNotes:      seed.buildNotes      || [],
      status:          seed.status          || "New",
    };
  }

  function blankFoundations() {
    return {
      businessProblem: "", currentStatePain: "", futureStateVision: "",
      primaryNarrative: "", transformationThesis: "", executiveTakeaway: "",
      customerMoments: [], operationalMoments: [],
      agentforceMoments: [], dataCloudMoments: [],
      commerceMoments: [], marketingMoments: [],
      serviceMoments: [], loyaltyMoments: [],
      valueDrivers: [], assumptions: [], openQuestions: [],
      bvsMetrics: [],
    };
  }

  // ─── Legacy migration ──────────────────────────────────────────
  // The builder used to autosave to "holodeckBuilder.state.v1". On
  // first run with the new home page, lift that into a project so
  // SEs don't lose the demo they were already in the middle of.
  function migrateLegacyIfPresent() {
    const legacy = readJSON(LEGACY_KEY, null);
    if (!legacy || typeof legacy !== "object") return null;
    const state = newBlankState(legacy);
    state.name = (legacy.project && legacy.project.customerName)
      ? legacy.project.customerName + " (migrated)"
      : "Migrated draft";
    saveProject(state);
    remove(LEGACY_KEY);
    return state.id;
  }

  global.HOLO_STORE = {
    listProjects: listProjects,
    loadProject: loadProject,
    saveProject: saveProject,
    deleteProject: deleteProject,
    renameProject: renameProject,
    duplicateProject: duplicateProject,
    createProject: createProject,
    getActiveProjectId: getActiveProjectId,
    setActiveProjectId: setActiveProjectId,
    newBlankState: newBlankState,
    summaryFromState: summaryFromState,
    derivedStatus: derivedStatus,
    migrateLegacyIfPresent: migrateLegacyIfPresent,
    reconcile: reconcile,
    uid: uid,
  };
})(window);
