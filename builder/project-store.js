// ════════════════════════════════════════════════════════════════
//  PROJECT STORE
//  Online-first multi-project persistence with a localStorage cache.
//
//  Two backends behind one async interface:
//   • LocalBackend  — the original localStorage logic, Promise-wrapped.
//                     Also the OFFLINE / write-through cache.
//   • NeonBackend   — fetch() to the Neon Data API (PostgREST) with the
//                     user's JWT bearer; RLS enforces ownership/sharing.
//
//  The active backend is NeonBackend whenever HOLO_AUTH has a session;
//  otherwise (or on network failure) we fall back to the local cache so
//  in-flight edits are never lost.
//
//  localStorage layout (cache + offline):
//   • holodeck.projects.index       → array of summaries {id, name, ...}
//   • holodeck.project.{projectId}  → full state for one project
//   • holodeck.activeProjectId      → which project the builder reopened to
//   • holodeck.dirty                → ids of rows that failed to reach Neon
//   • holodeck.migrated.{userId}    → "1" once local rows were lifted
//
//  Method names/signatures match the old sync API 1:1, except data CRUD
//  now returns Promises. getActiveProjectId/setActiveProjectId/uid stay
//  synchronous (device-local UI state / id generation, not server data).
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const KEY_INDEX   = "holodeck.projects.index";
  const KEY_ACTIVE  = "holodeck.activeProjectId";
  const KEY_PREFIX  = "holodeck.project.";
  const KEY_DIRTY   = "holodeck.dirty";
  const KEY_MIGRATED = "holodeck.migrated.";
  const KEY_ONBOARD = "holo.onboarding.v1";
  const LEGACY_KEY  = "holodeckBuilder.state.v1";

  // Data API base. See memory: neon-multiuser-backend.
  const DATA_API = "https://ep-round-hill-ajwf0r6a.apirest.c-3.us-east-2.aws.neon.tech/neondb/rest/v1";

  const AUTH = function () { return global.HOLO_AUTH; };

  // ─── ID generator (stable, URL-safe) ───────────────────────────
  function uid(prefix) {
    return (prefix || "p_") + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  // ─── Low-level localStorage read/write ─────────────────────────
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

  // ─── Index (cache) ─────────────────────────────────────────────
  function getIndex() {
    const arr = readJSON(KEY_INDEX, []);
    return Array.isArray(arr) ? arr : [];
  }
  function setIndex(arr) { writeJSON(KEY_INDEX, arr); }
  function upsertIndex(summary) {
    const idx = getIndex();
    const i = idx.findIndex(function (p) { return p.id === summary.id; });
    if (i >= 0) idx[i] = summary; else idx.push(summary);
    setIndex(idx);
  }
  function removeFromIndex(id) {
    setIndex(getIndex().filter(function (p) { return p.id !== id; }));
  }

  // ─── Dirty-row tracking (rows that didn't reach Neon) ──────────
  function getDirty() {
    const arr = readJSON(KEY_DIRTY, []);
    return Array.isArray(arr) ? arr : [];
  }
  function markDirty(id) {
    const d = getDirty();
    if (d.indexOf(id) === -1) { d.push(id); writeJSON(KEY_DIRTY, d); }
  }
  function clearDirty(id) {
    writeJSON(KEY_DIRTY, getDirty().filter(function (x) { return x !== id; }));
  }

  // ─── Pure derivations (unchanged, synchronous) ─────────────────
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

  // ════════════════════════════════════════════════════════════
  //  LocalBackend — the original logic, Promise-wrapped. Doubles as
  //  the write-through cache for NeonBackend.
  // ════════════════════════════════════════════════════════════
  const LocalBackend = {
    listProjects: function () {
      return Promise.resolve(getIndex().slice().sort(function (a, b) {
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      }));
    },
    loadProject: function (id) {
      if (!id) return Promise.resolve(null);
      const state = readJSON(KEY_PREFIX + id, null);
      if (!state) return Promise.resolve(null);
      state.id = id;
      return Promise.resolve(state);
    },
    saveProject: function (state) {
      cacheWrite(state);
      return Promise.resolve(state.id);
    },
    deleteProject: function (id) {
      cacheDelete(id);
      return Promise.resolve();
    },
  };

  // Synchronous cache primitives shared by both backends.
  function cacheWrite(state) {
    writeJSON(KEY_PREFIX + state.id, state);
    upsertIndex(summaryFromState(state));
  }
  function cacheDelete(id) {
    removeFromIndex(id);
    remove(KEY_PREFIX + id);
    clearDirty(id);
  }

  // ════════════════════════════════════════════════════════════
  //  NeonBackend — Data API (PostgREST) with JWT bearer. RLS does
  //  the access control; we just shape rows ↔ state.
  // ════════════════════════════════════════════════════════════
  function rowToState(row) {
    // state column holds the full project json; stamp server fields onto it.
    const state = row.state || {};
    state.id = row.id;
    if (row.name) state.name = row.name;
    if (row.created_at) state.createdAt = row.created_at;
    if (row.updated_at) state.updatedAt = row.updated_at;
    if (row.visibility) state.visibility = row.visibility;
    return state;
  }
  function rowToSummary(row) {
    // Prefer the stored summary jsonb; fall back to deriving from state.
    const base = (row.summary && typeof row.summary === "object" && row.summary.id)
      ? row.summary
      : summaryFromState(rowToState(row));
    base.id = row.id;
    if (row.name) base.name = row.name;
    if (row.updated_at) base.updatedAt = row.updated_at;
    if (row.created_at) base.createdAt = row.created_at;
    if (row.visibility) base.visibility = row.visibility;
    return base;
  }
  function stateToRow(state) {
    return {
      id: state.id,
      name: state.name || (state.project && state.project.customerName) || "Untitled project",
      summary: summaryFromState(state),
      state: state,
      updated_at: state.updatedAt || new Date().toISOString(),
    };
  }

  function dataFetch(path, opts) {
    opts = opts || {};
    const auth = AUTH();
    return (auth ? auth.getToken() : Promise.resolve(null)).then(function (token) {
      if (!token) {
        const err = new Error("Not authenticated");
        err.offline = true;
        throw err;
      }
      const headers = Object.assign({
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
      }, opts.headers || {});
      const init = { method: opts.method || "GET", headers: headers };
      if (opts.body != null) init.body = JSON.stringify(opts.body);
      return fetch(DATA_API + path, init).then(function (res) {
        return res.text().then(function (text) {
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
          if (!res.ok) {
            const err = new Error((json && (json.message || json.hint)) || ("Data API " + res.status));
            err.status = res.status;
            throw err;
          }
          return json;
        });
      });
    });
  }

  const NeonBackend = {
    listProjects: function () {
      const me = currentUserId();
      // Own projects only for the main list; sharing/gallery have their
      // own methods. select summary (light) to keep the home page fast.
      return dataFetch("/projects?owner_id=eq." + encodeURIComponent(me) +
        "&select=id,name,summary,visibility,created_at,updated_at&order=updated_at.desc")
        .then(function (rows) {
          const summaries = (rows || []).map(rowToSummary);
          // Refresh the cache index so offline reads stay current.
          setIndex(summaries);
          return summaries;
        });
    },
    loadProject: function (id) {
      return dataFetch("/projects?id=eq." + encodeURIComponent(id) + "&select=*&limit=1")
        .then(function (rows) {
          if (!rows || !rows.length) return null;
          const state = rowToState(rows[0]);
          cacheWrite(state); // refresh cache
          return state;
        });
    },
    saveProject: function (state) {
      const row = stateToRow(state);
      // Upsert: PostgREST merge-duplicates on the primary key.
      return dataFetch("/projects?on_conflict=id", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: [row],
      }).then(function () { clearDirty(state.id); return state.id; });
    },
    deleteProject: function (id) {
      return dataFetch("/projects?id=eq." + encodeURIComponent(id), { method: "DELETE" })
        .then(function () { return; });
    },
  };

  function currentUserId() {
    const auth = AUTH();
    const u = auth && auth.currentUser();
    return u ? u.id : null;
  }
  function online() {
    const auth = AUTH();
    return !!(auth && auth.isAuthed());
  }

  // ════════════════════════════════════════════════════════════
  //  Public CRUD — online-first with optimistic local cache.
  // ════════════════════════════════════════════════════════════

  function listProjects() {
    if (!online()) return LocalBackend.listProjects();
    return NeonBackend.listProjects().catch(function () {
      // Offline / server error → serve the cache.
      return LocalBackend.listProjects();
    });
  }

  function loadProject(id) {
    if (!id) return Promise.resolve(null);
    if (!online()) return LocalBackend.loadProject(id);
    return NeonBackend.loadProject(id).catch(function () {
      return LocalBackend.loadProject(id);
    });
  }

  // Optimistic: write the cache synchronously first (autosave indicator
  // + immediate re-reads stay correct), then push to Neon. On failure,
  // mark dirty and resolve anyway — the cache holds the truth.
  function saveProject(state) {
    if (!state) return Promise.resolve(null);
    if (!state.id) state.id = uid();
    const now = new Date().toISOString();
    if (!state.createdAt) state.createdAt = now;
    state.updatedAt = now;

    cacheWrite(state); // synchronous, never lost

    if (!online()) return Promise.resolve(state.id);
    return NeonBackend.saveProject(state).catch(function () {
      markDirty(state.id);
      return state.id;
    });
  }

  function deleteProject(id) {
    cacheDelete(id);
    if (getActiveProjectId() === id) setActiveProjectId(null);
    if (!online()) return Promise.resolve();
    return NeonBackend.deleteProject(id).catch(function () { /* gone locally regardless */ });
  }

  function renameProject(id, newName) {
    return loadProject(id).then(function (state) {
      if (!state) return false;
      state.name = (newName || "").trim() || state.name;
      return saveProject(state).then(function () { return true; });
    });
  }

  function duplicateProject(id) {
    return loadProject(id).then(function (original) {
      if (!original) return null;
      const copy = JSON.parse(JSON.stringify(original));
      copy.id = uid();
      copy.name = (original.name || (original.project && original.project.customerName) || "Untitled project") + " (Copy)";
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      copy.visibility = "private";
      return saveProject(copy).then(function () { return copy.id; });
    });
  }

  function createProject(seed) {
    const state = newBlankState(seed || {});
    return saveProject(state).then(function () { return state; });
  }

  // Retry rows that failed to reach Neon (called on boot / next success).
  function flushDirty() {
    if (!online()) return Promise.resolve();
    const ids = getDirty();
    if (!ids.length) return Promise.resolve();
    return Promise.all(ids.map(function (id) {
      const state = readJSON(KEY_PREFIX + id, null);
      if (!state) { clearDirty(id); return Promise.resolve(); }
      return NeonBackend.saveProject(state).catch(function () { /* still dirty */ });
    }));
  }

  // Reconcile the cache: drop index entries whose body is missing.
  // (Offline-only hygiene; online, the list refresh is authoritative.)
  function reconcile() {
    const idx = getIndex();
    const cleaned = idx.filter(function (p) { return readJSON(KEY_PREFIX + p.id, null) != null; });
    if (cleaned.length !== idx.length) setIndex(cleaned);
    return Promise.resolve();
  }

  // ─── Active project pointer (sync, device-local) ───────────────
  function getActiveProjectId() {
    try { return localStorage.getItem(KEY_ACTIVE) || null; } catch (e) { return null; }
  }
  function setActiveProjectId(id) {
    try {
      if (id) localStorage.setItem(KEY_ACTIVE, id);
      else localStorage.removeItem(KEY_ACTIVE);
    } catch (e) { /* ignore */ }
  }

  // ─── Onboarding flags (sync, device-local) ─────────────────────
  // Account/device-level — NOT per-project — because the product tour and
  // first-time-on-home fire before any project exists. Every field reads
  // through a default so a missing/old key is safe (back-compat).
  function getOnboarding() {
    const d = {
      version: 1, tourDone: false, homeSeen: false,
      builderTourSeen: false, aiPromptTourSeen: false,
      stepTipsSeen: [], neverShowAgain: false,
    };
    return Object.assign(d, readJSON(KEY_ONBOARD, {}) || {});
  }
  function setOnboarding(obj) { return writeJSON(KEY_ONBOARD, obj); }

  // ─── Blank state shape (unchanged) ─────────────────────────────
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
        // mode: who the demo is "dressed" as.
        //   "salesforce" (default — identical to legacy behavior),
        //   "customer"   (lead with the customer's logo/colors),
        //   "cobrand"    (Salesforce + customer lockup side by side).
        mode: "salesforce",
        logoPath: "",            // Salesforce-side / primary mark (legacy field)
        customerLogoPath: "",    // customer mark, used in customer/cobrand modes
        primaryColor: "#b22234",
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
      visibility:      seed.visibility      || "private",
      // Derived "Powered by Salesforce" attribution. `auto:true` → recompute
      // from the story/products; `auto:false` → the SE pinned `products`.
      poweredBy: Object.assign({ products: [], auto: true }, seed.poweredBy || {}),
      // Dismissible in-product guidance state (guided modals). `dismissed`
      // holds hint ids already seen; `neverShowAgain` mutes all of them.
      uxHints: Object.assign({ dismissed: [], version: 1, neverShowAgain: false }, seed.uxHints || {}),
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

  // ─── Legacy migration (single legacy key → a project) ──────────
  // Returns a Promise<projectId|null>. Chains in before the per-user
  // localStorage→account migration.
  function migrateLegacyIfPresent() {
    const legacy = readJSON(LEGACY_KEY, null);
    if (!legacy || typeof legacy !== "object") return Promise.resolve(null);
    const state = newBlankState(legacy);
    state.name = (legacy.project && legacy.project.customerName)
      ? legacy.project.customerName + " (migrated)"
      : "Migrated draft";
    return saveProject(state).then(function () {
      remove(LEGACY_KEY);
      return state.id;
    });
  }

  // ─── First-authenticated-boot: lift local projects into the account ─
  // Idempotent via a per-user flag. INSERTs each cached project that the
  // server doesn't already have. Local data is NOT deleted — it stays as
  // the offline cache.
  function migrateLocalToAccount() {
    const userId = currentUserId();
    if (!userId || !online()) return Promise.resolve(0);
    const flagKey = KEY_MIGRATED + userId;
    if (localStorage.getItem(flagKey) === "1") return Promise.resolve(0);

    return NeonBackend.listProjects().then(function (serverSummaries) {
      const have = {};
      (serverSummaries || []).forEach(function (s) { have[s.id] = true; });
      const localStates = getIndex()
        .filter(function (p) { return !have[p.id]; })
        .map(function (p) { return readJSON(KEY_PREFIX + p.id, null); })
        .filter(Boolean);

      if (!localStates.length) {
        try { localStorage.setItem(flagKey, "1"); } catch (e) { /* ignore */ }
        return 0;
      }
      // Insert each owned row (RLS with-check forces owner_id = me).
      return Promise.all(localStates.map(function (state) {
        return NeonBackend.saveProject(state).catch(function () { markDirty(state.id); });
      })).then(function () {
        try { localStorage.setItem(flagKey, "1"); } catch (e) { /* ignore */ }
        return localStates.length;
      });
    }).catch(function () { return 0; });
  }

  // Clear server-sourced cached rows on sign-out (shared-machine safety).
  // Keeps device-local UI pointers untouched.
  function clearCache() {
    getIndex().forEach(function (p) { remove(KEY_PREFIX + p.id); });
    remove(KEY_INDEX);
    remove(KEY_DIRTY);
    setActiveProjectId(null);
    return Promise.resolve();
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
    getOnboarding: getOnboarding,
    setOnboarding: setOnboarding,
    newBlankState: newBlankState,
    summaryFromState: summaryFromState,
    derivedStatus: derivedStatus,
    migrateLegacyIfPresent: migrateLegacyIfPresent,
    migrateLocalToAccount: migrateLocalToAccount,
    flushDirty: flushDirty,
    clearCache: clearCache,
    reconcile: reconcile,
    uid: uid,
  };
})(window);
