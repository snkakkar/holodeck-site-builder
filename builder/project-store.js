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
  const KEY_DIRTY_OWNER = "holodeck.dirty.owner"; // { [id]: ownerId } — who owns each dirty row
  const KEY_HIDDEN  = "holodeck.hidden"; // [id,…] — suppressed from My Projects (body kept, never deleted)
  const KEY_MIGRATED = "holodeck.migrated.";
  const KEY_ONBOARD = "holo.onboarding.v1";
  const LEGACY_KEY  = "holodeckBuilder.state.v1";

  // Data API base. Served same-origin (/rest/v1) and reverse-proxied by
  // server.js to the self-hosted PostgREST on Heroku Postgres. window.HOLO_ENV
  // (from /env-config.js) supplies the base; the literal is a same-origin
  // fallback for load-order safety. See memory: neon-multiuser-backend.
  const DATA_API = (global.HOLO_ENV && global.HOLO_ENV.DATA_API) || "/rest/v1";

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
    // Remember who owns this dirty row so a different account signing in on the
    // same device never re-injects it (mergeDirtyIntoSummaries) or is blocked
    // from evicting it (login reconcile). Owner = whoever is signed in now.
    const me = currentUserId();
    if (me) {
      const owners = readJSON(KEY_DIRTY_OWNER, {}) || {};
      owners[id] = me;
      writeJSON(KEY_DIRTY_OWNER, owners);
    }
  }
  function clearDirty(id) {
    writeJSON(KEY_DIRTY, getDirty().filter(function (x) { return x !== id; }));
    const owners = readJSON(KEY_DIRTY_OWNER, {}) || {};
    if (id in owners) { delete owners[id]; writeJSON(KEY_DIRTY_OWNER, owners); }
  }
  // Owner recorded for a dirty row (null if unknown — legacy dirty entries
  // written before owner-tagging, treated as "belongs to whoever is here").
  function dirtyOwner(id) {
    const owners = readJSON(KEY_DIRTY_OWNER, {}) || {};
    return owners[id] || null;
  }
  // Is this dirty row safe to keep/act on for the current user? True when the
  // owner is unknown (legacy) or matches the signed-in user.
  function dirtyOwnedByCurrent(id) {
    const owner = dirtyOwner(id);
    const me = currentUserId();
    return !owner || !me || owner === me;
  }

  // ─── Hidden set (suppress from "My Projects" WITHOUT deleting the body) ──
  // A row is hidden when a SUCCESSFUL server check proves it's foreign / not
  // ours to own. We never delete the cached body — a once-shared project (e.g.
  // opened via a share that was later removed) stays readable under "Shared
  // with me", and nothing is ever destroyed on a timeout/offline response.
  function getHidden() { return readJSON(KEY_HIDDEN, []) || []; }
  function isHidden(id) { return getHidden().indexOf(id) >= 0; }
  function hide(id) {
    const h = getHidden();
    if (h.indexOf(id) === -1) { h.push(id); writeJSON(KEY_HIDDEN, h); }
  }
  function unhide(id) {
    writeJSON(KEY_HIDDEN, getHidden().filter(function (x) { return x !== id; }));
  }

  // Merge any locally-known dirty projects (saved here but never confirmed by
  // Neon) into a fresh server summary list, so a refresh of the index can't
  // erase a project whose server upsert failed. Server rows win on id; dirty
  // ids the server didn't return are appended from the local body. When there
  // are zero dirty rows this returns the server list unchanged (identity for
  // the common healthy case).
  function mergeDirtyIntoSummaries(serverSummaries) {
    const dirty = getDirty();
    if (!dirty.length) return serverSummaries;
    const present = {};
    serverSummaries.forEach(function (s) { present[s.id] = true; });
    const extras = [];
    dirty.forEach(function (id) {
      if (present[id]) return;                 // server already has it; not lost
      if (!dirtyOwnedByCurrent(id)) return;     // another account's dirty row — never leak it here
      const state = readJSON(KEY_PREFIX + id, null);
      if (!state) return;                       // dirty body gone (e.g. deleted) — skip
      // Provably foreign body (real owner_id set and ≠ me) — never re-inject,
      // even if the dirty entry is untagged/legacy. Guards the same leak the
      // login reconcile evicts, but before reconcile has a chance to run.
      const me = currentUserId();
      if (state.ownerId && me && state.ownerId !== me) return;
      state.id = id;
      extras.push(summaryFromState(state));
    });
    if (!extras.length) return serverSummaries;
    return serverSummaries.concat(extras);
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
      // Owner stamp so the login reconcile can evict rows cached under a
      // DIFFERENT account (shared-device leak). Absent on brand-new local
      // projects until cacheWrite fills it with the current user.
      ownerId:       state.ownerId || null,
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
  // Tracks whether the most recent cacheWrite's primary state write hit the
  // localStorage quota (writeJSON returns false). Lets the UI surface a
  // silent local-save failure instead of falsely showing "Autosaved".
  let _lastCacheWriteFailed = false;
  let _lastSyncFailed = false; // last saveProject couldn't reach Neon (saved locally, queued dirty)
  // Full detail of the most recent failed Neon write, so the UI/console can
  // show WHY (status + PostgREST message) instead of a generic "saved locally".
  let _lastSyncError = null;   // { status, message, offline, at } | null
  function recordSyncError(err) {
    _lastSyncFailed = true;
    _lastSyncError = {
      status: (err && err.status) || 0,
      message: (err && err.message) || "Unknown error",
      offline: !!(err && err.offline),
      at: Date.now(),
    };
  }
  // Large AI/uploaded images are stored as base64 data: URLs inside the state
  // blob. The cloud row keeps them in full; the device cache only needs a
  // lightweight offline fallback, so we drop big data: URLs before writing to
  // localStorage (a few stills otherwise blow past the ~5MB quota and ALL local
  // saves start failing). We empty the slot rather than leave a sentinel so the
  // offline UI/renderer treats it as "no image" (mock/placeholder) instead of a
  // broken <img>; the real bytes rehydrate from the cloud on next online load.
  const CACHE_DATAURL_MAX = 2048; // keep tiny inline images; drop the heavy ones
  function isHeavyDataUrl(v) {
    return typeof v === "string" && v.lastIndexOf("data:", 0) === 0 && v.length > CACHE_DATAURL_MAX;
  }
  function slimForCache(state) {
    // Structural clone with heavy data: URLs emptied out.
    let slim;
    try { slim = JSON.parse(JSON.stringify(state)); }
    catch (e) { return state; } // non-serializable → fall back to raw
    if (slim.assetLibrary && typeof slim.assetLibrary === "object") {
      Object.keys(slim.assetLibrary).forEach(function (k) {
        if (isHeavyDataUrl(slim.assetLibrary[k])) slim.assetLibrary[k] = "";
      });
    }
    if (slim.brand) {
      if (isHeavyDataUrl(slim.brand.logoPath)) slim.brand.logoPath = "";
      if (isHeavyDataUrl(slim.brand.customerLogoPath)) slim.brand.customerLogoPath = "";
    }
    // Persona portraits live in assetLibrary["persona.portrait"] (handled above).
    // Re-tokenize signed GCS urls so the offline cache holds the stable
    // token, not an expiring signed url (rehydrated via signAssets on load).
    tokenizeForPersist(slim);
    return slim;
  }
  function cacheWrite(state) {
    // A brand-new local project has no server ownerId yet; it belongs to
    // whoever is signed in when it's first cached. Stamp it so the login
    // reconcile can tell it apart from another account's rows. Server-loaded
    // states already carry state.ownerId (rowToState) — never overwrite that.
    if (!state.ownerId) {
      const me = currentUserId();
      if (me) state.ownerId = me;
    }
    const ok = writeJSON(KEY_PREFIX + state.id, slimForCache(state));
    _lastCacheWriteFailed = !ok;
    upsertIndex(summaryFromState(state));
  }
  function lastCacheWriteFailed() { return _lastCacheWriteFailed; }
  function lastSyncFailed() { return _lastSyncFailed; }
  function lastSyncError() { return _lastSyncError; }
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
    // owner_id lets the client tell "my project" from "shared with me" for
    // owner-only UI (Share button, gallery toggle). RLS remains authoritative.
    if (row.owner_id) state.ownerId = row.owner_id;
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
    // Persist a CLONE with any signed GCS URLs swapped back to their
    // tiny "gcs:" tokens — never store a signed url (it expires and
    // bloats the row). Live state keeps its displayable urls untouched.
    let persistState = state;
    try { persistState = tokenizeForPersist(JSON.parse(JSON.stringify(state))); }
    catch (e) { persistState = state; }
    const row = {
      id: state.id,
      name: state.name || (state.project && state.project.customerName) || "Untitled project",
      summary: summaryFromState(state),
      state: persistState,
      updated_at: state.updatedAt || new Date().toISOString(),
    };
    // Persist visibility so team-gallery / share round-trips (read back in
    // rowToState/rowToSummary). Default 'private' when unset so the column
    // never regresses to NULL on an upsert UPDATE. Only the two known values
    // are written — anything else falls back to 'private'.
    row.visibility = (state.visibility === "gallery") ? "gallery" : "private";
    // Send owner_id explicitly. The column DEFAULT (auth.user_id()) only fires
    // on a fresh INSERT, but our upsert uses resolution=merge-duplicates — on
    // the conflict/UPDATE branch the default does NOT apply, so without this the
    // row's owner_id stays NULL and the RLS WITH CHECK (owner_id = auth.user_id())
    // rejects the write. Setting it satisfies both the INSERT and UPDATE checks.
    const me = currentUserId();
    if (me) row.owner_id = me;
    return row;
  }

  // Factory for an authenticated PostgREST fetch bound to DATA_API.
  // factoryOpts.offlineFlag: when true, the no-token error carries
  // err.offline = true so callers can distinguish "not signed in" from a
  // server error and fall back to the local cache. project-store needs
  // this; feedback-store (fire-and-forget) does not — it reuses this same
  // factory with offlineFlag:false. See HOLO_STORE.makeDataFetch.
  function makeDataFetch(factoryOpts) {
    const offlineFlag = !!(factoryOpts && factoryOpts.offlineFlag);
    return function dataFetch(path, opts) {
      opts = opts || {};
      const auth = AUTH();
      return (auth ? auth.getToken() : Promise.resolve(null)).then(function (token) {
        if (!token) {
          const err = new Error("Not authenticated");
          if (offlineFlag) err.offline = true;
          throw err;
        }
        const headers = Object.assign({
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json",
        }, opts.headers || {});
        const init = { method: opts.method || "GET", headers: headers };
        if (opts.body != null) init.body = JSON.stringify(opts.body);
        // keepalive lets a request outlive the page (pagehide/unload) so the
        // presence release actually reaches the server on tab close. Only set
        // when asked — keepalive bodies are size-capped, so it's opt-in.
        if (opts.keepalive) init.keepalive = true;
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
    };
  }

  // project-store's own client: no-token errors are flagged offline so the
  // optimistic write-through path can fall back to the local cache.
  const dataFetch = makeDataFetch({ offlineFlag: true });

  const NeonBackend = {
    listProjects: function () {
      const me = currentUserId();
      // Own projects only for the main list; sharing/gallery have their
      // own methods. select summary (light) to keep the home page fast.
      return dataFetch("/projects?owner_id=eq." + encodeURIComponent(me) +
        "&select=id,name,summary,visibility,created_at,updated_at&order=updated_at.desc")
        .then(function (rows) {
          const summaries = (rows || []).map(rowToSummary);
          // Refresh the cache index so offline reads stay current — but do NOT
          // drop projects that exist locally yet never reached Neon (dirty
          // rows), or a failed-to-sync project would vanish from the home list
          // for good. Re-attach each dirty id the server didn't return.
          const merged = mergeDirtyIntoSummaries(summaries);
          setIndex(merged);
          return merged;
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
  function currentUserEmail() {
    const auth = AUTH();
    const u = auth && auth.currentUser();
    return (u && u.email) ? String(u.email).toLowerCase() : null;
  }
  function currentUserName() {
    const auth = AUTH();
    const u = auth && auth.currentUser();
    return (u && (u.name || u.email)) || null;
  }
  function isSalesforceEmail(email) {
    const auth = AUTH();
    if (auth && typeof auth.isSalesforceEmail === "function") return auth.isSalesforceEmail(email);
    return /@salesforce\.com$/i.test(String(email || ""));
  }

  // ════════════════════════════════════════════════════════════
  //  Sharing — email-keyed. RLS is authoritative (see
  //  neon-multiuser-backend memory); the client guards are UX-only.
  //  All rows key on shared_with_email (lowercased) so a share works
  //  on the recipient's FIRST login even if they had no account when
  //  it was created.
  // ════════════════════════════════════════════════════════════
  const ShareBackend = {
    // Owner grants access. Upsert on the (project_id, shared_with_email) PK
    // so re-sharing the same email just updates the permission.
    shareProject: function (projectId, email, permission) {
      const row = {
        project_id: projectId,
        shared_with_email: String(email || "").trim().toLowerCase(),
        permission: (permission === "edit") ? "edit" : "view",
      };
      const me = currentUserId();
      if (me) row.created_by = me; // satisfies created_by=user_id() checks on UPDATE branch
      return dataFetch("/project_shares?on_conflict=project_id,shared_with_email", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: [row],
      }).then(function () { return true; });
    },
    updateShare: function (projectId, email, permission) {
      const perm = (permission === "edit") ? "edit" : "view";
      return dataFetch("/project_shares?project_id=eq." + encodeURIComponent(projectId) +
        "&shared_with_email=eq." + encodeURIComponent(String(email || "").toLowerCase()), {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: { permission: perm },
      }).then(function () { return true; });
    },
    unshareProject: function (projectId, email) {
      return dataFetch("/project_shares?project_id=eq." + encodeURIComponent(projectId) +
        "&shared_with_email=eq." + encodeURIComponent(String(email || "").toLowerCase()),
        { method: "DELETE" }).then(function () { return true; });
    },
    listShares: function (projectId) {
      return dataFetch("/project_shares?project_id=eq." + encodeURIComponent(projectId) +
        "&select=shared_with_email,permission,created_at&order=created_at.asc")
        .then(function (rows) { return rows || []; });
    },
    // Projects shared with me (not my own, not gallery). Labels each with my
    // permission by reading project_shares for my own email — RLS's
    // shares_select already returns exactly my rows (lower(shared_with_email)
    // = current_email()), so this needs no filter and no server RPC (the
    // app.* schema isn't exposed through PostgREST).
    listSharedWithMe: function () {
      const me = currentUserId();
      const myEmail = currentUserEmail();
      return Promise.all([
        myEmail
          ? dataFetch("/project_shares?shared_with_email=eq." + encodeURIComponent(myEmail) +
              "&select=project_id,permission").catch(function () { return []; })
          : Promise.resolve([]),
        dataFetch("/projects?select=id,name,summary,visibility,updated_at,created_at,owner_id&order=updated_at.desc"),
      ]).then(function (res) {
        const shares = res[0] || [];
        const permByProject = {};
        shares.forEach(function (s) { permByProject[s.project_id] = s.permission; });
        const rows = (res[1] || []).filter(function (r) {
          return r.owner_id !== me && r.visibility !== "gallery" &&
            Object.prototype.hasOwnProperty.call(permByProject, r.id);
        });
        return rows.map(function (r) {
          const sum = rowToSummary(r);
          sum.sharedPermission = permByProject[r.id] || "view";
          sum.ownerId = r.owner_id;
          sum.shared = true;
          return sum;
        });
      });
    },
    // Team gallery — every project published to the team (visibility='gallery').
    // RLS (projects_select) already returns these to any @salesforce.com user,
    // so a plain visibility filter is enough. INCLUDES my own published rows so
    // the SE gets immediate confirmation a publish took effect; each row is
    // tagged `mine` (owner_id === me) so the card can branch: my own → Open +
    // Unpublish; a teammate's → Duplicate to my projects. owner_id rides along.
    listGallery: function () {
      const me = currentUserId();
      return dataFetch("/projects?visibility=eq.gallery" +
        "&select=id,name,summary,visibility,updated_at,created_at,owner_id&order=updated_at.desc")
        .then(function (rows) {
          return (rows || []).map(function (r) {
            const sum = rowToSummary(r);
            sum.ownerId = r.owner_id;
            sum.mine = (r.owner_id === me);
            sum.gallery = true;
            return sum;
          });
        });
    },
  };

  // ════════════════════════════════════════════════════════════
  //  Soft-lock presence — one live holder per project, ~90s TTL.
  //  Best-effort: a network failure never blocks the editor.
  // ════════════════════════════════════════════════════════════
  const PRESENCE_TTL_MS = 90 * 1000;
  const PresenceBackend = {
    // Who (if anyone) currently holds the lock. Returns the live holder row
    // or null. A row past expires_at is treated as stale (no holder).
    getPresence: function (projectId) {
      return dataFetch("/project_presence?project_id=eq." + encodeURIComponent(projectId) +
        "&select=project_id,holder_email,holder_name,expires_at&limit=1")
        .then(function (rows) {
          const row = rows && rows[0];
          if (!row) return null;
          const exp = Date.parse(row.expires_at);
          if (isFinite(exp) && exp < Date.now()) return null; // stale
          return row;
        });
    },
    // Claim / renew my presence. A plain upsert on the project_id PK; because
    // it targets the single presence row, it also serves as "Take over" (the
    // presence RLS lets any salesforce collaborator UPDATE the row as long as
    // the NEW holder_email is their own — WITH CHECK). Upsert on project_id PK.
    acquireLock: function (projectId) { return PresenceBackend._upsert(projectId); },
    renewLock:   function (projectId) { return PresenceBackend._upsert(projectId); },
    _upsert: function (projectId) {
      const email = currentUserEmail();
      // holder_email is NOT NULL and the RLS WITH CHECK ties the row to my
      // email. If we somehow have no email (token present but user not yet
      // hydrated), skip rather than fire a guaranteed-rejected write that
      // would leave presence in a confusing half-state.
      if (!email) return Promise.resolve(false);
      const row = {
        project_id: projectId,
        holder_email: email,
        holder_name: currentUserName(),
        expires_at: new Date(Date.now() + PRESENCE_TTL_MS).toISOString(),
        updated_at: new Date().toISOString(),
      };
      return dataFetch("/project_presence?on_conflict=project_id", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: [row],
      }).then(function () { return true; });
    },
    releaseLock: function (projectId) {
      // Only deletes rows whose holder_email = me (RLS enforces this too).
      // keepalive so a release triggered by pagehide/tab-close still reaches
      // the server instead of being dropped when the document tears down.
      return dataFetch("/project_presence?project_id=eq." + encodeURIComponent(projectId) +
        "&holder_email=eq." + encodeURIComponent(currentUserEmail() || ""),
        { method: "DELETE", keepalive: true }).then(function () { return true; });
    },
  };
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
    return NeonBackend.loadProject(id).then(function (state) {
      // A just-created project is written to Neon optimistically: saveProject
      // resolves off the synchronous cache write before the POST commits (and,
      // on a transient failure, the row is only queued dirty). If the caller
      // opens it before that write lands, Neon returns 0 rows → null. Falling
      // back to the write-through cache here closes the create→open race so a
      // brand-new project always opens. (An error path also falls back below.)
      if (state) return state;
      return LocalBackend.loadProject(id);
    }).catch(function () {
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

    _lastSyncFailed = false;
    _lastSyncError = null;
    cacheWrite(state); // synchronous, never lost

    if (!online()) return Promise.resolve(state.id);
    return NeonBackend.saveProject(state).catch(function (err) {
      markDirty(state.id);
      recordSyncError(err); // saved locally, will retry via flushDirty
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
      // Drop the source's ownerId so cacheWrite restamps the copy with the
      // current user. Duplicating a gallery/shared project would otherwise carry
      // the ORIGINAL owner's id on the cached body (cacheWrite only stamps when
      // ownerId is unset), leaving a mislabeled row that later poisons flushDirty.
      delete copy.ownerId;
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
      // Never flush a row that isn't the current user's. A foreign/stale dirty
      // row (e.g. a teammate's cached body, or a pre-owner-tagging leftover) would
      // hit an existing server row owned by someone else and be rejected by the
      // projects UPDATE RLS USING predicate (owner_id = app.user_id()) — a noisy
      // 403/42501 on boot. Leave the body in place; reconcileOwnership (which runs
      // right after flushDirty) hides it from "My Projects". Same guards it uses.
      if (!dirtyOwnedByCurrent(id) || bodyIsForeign(id)) return Promise.resolve();
      return NeonBackend.saveProject(state).catch(function (err) { recordSyncError(err); /* still dirty */ });
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
      step: "script",
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
      // AI-generated agent-conversation script ({turns:[…]}), produced in the
      // builder via Gemini and read by the demo's agentConversation slide. Null
      // until generated → the deterministic SHARED.agentChat() fallback is used.
      agentChatScript: seed.agentChatScript || null,
      // Config-driven Salesforce console/CRM screens offered as generated slide
      // types. Keyed by screenId (see screen-registry.js HOLO_SCREENS); each
      // value is { enabled, config } where config is the generated screenConfig.
      // Purely additive — decks with no screens selected are unaffected.
      screens:         seed.screens         || {},
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
        return NeonBackend.saveProject(state).catch(function (err) { markDirty(state.id); recordSyncError(err); });
      })).then(function () {
        try { localStorage.setItem(flagKey, "1"); } catch (e) { /* ignore */ }
        return localStates.length;
      });
    }).catch(function () { return 0; });
  }

  // ─── Every-login ownership reconcile (shared-device leak guard) ─────
  // Runs on EVERY sign-in (unlike migrateLocalToAccount, which is flag-gated
  // to the first boot). Fetches the authoritative server list for the current
  // user, then evicts from the local index any row that:
  //   • is owned by a DIFFERENT account (ownerId set and ≠ me), OR
  //   • isn't returned by the server AND isn't a dirty row PROVABLY owned by me.
  // Rows the server returned are kept (they're mine). Genuinely dirty rows
  // owned by the current user are ALWAYS preserved so unsynced work survives.
  // Offline → no-op (can't reconcile without the server truth).
  //
  // A row's ownerId (on its index summary and cached body) is the strongest
  // signal: server-loaded rows carry the real owner_id (rowToState), and
  // cacheWrite stamps new local rows with the creator. If that ownerId is set
  // and ≠ me, the row is PROVABLY FOREIGN.
  function provablyForeign(summary) {
    const me = currentUserId();
    return !!(summary && summary.ownerId && me && summary.ownerId !== me);
  }
  // Reconcile HIDES foreign / stranded rows from "My Projects" — it NEVER
  // deletes a cached body. A once-shared project whose share was later removed
  // stays readable under "Shared with me"; a provably-foreign leak (another
  // account's private row cached on this device) is merely suppressed from my
  // owned list. Everything here keys off a SUCCESSFUL server response — on a
  // timeout / offline / empty-error the .catch() below no-ops, so a transient
  // outage can never hide legitimate work.
  function reconcileOwnership() {
    const me = currentUserId();
    if (!me || !online()) return Promise.resolve(0);
    return NeonBackend.listProjects().then(function (serverSummaries) {
      // Guard: only trust a response that actually came back as an array.
      if (!Array.isArray(serverSummaries)) return 0;
      const onServer = {};
      serverSummaries.forEach(function (s) { onServer[s.id] = true; });
      const dirtyIds = getDirty();
      let hidden = 0;
      getIndex().forEach(function (p) {
        if (onServer[p.id]) { if (isHidden(p.id)) unhide(p.id); return; } // mine on server — ensure visible
        // My unsynced work (dirty & mine) — always keep visible so a
        // save-in-flight or offline edit isn't hidden out from under me.
        if (dirtyIds.indexOf(p.id) >= 0 && dirtyOwnedByCurrent(p.id) && !bodyIsForeign(p.id)) {
          if (isHidden(p.id)) unhide(p.id);
          return;
        }
        // Provably foreign (real owner_id ≠ me): another account's row cached on
        // this device. Hide from My Projects — but keep the body (it may be a
        // legitimately-received share, surfaced separately under Shared-with-me).
        if (provablyForeign(p) || bodyIsForeign(p.id)) {
          if (!isHidden(p.id)) { hide(p.id); hidden++; }
          return;
        }
        // Off-server, non-dirty, no ownerId at all (legacy/untagged phantom that
        // migrateLocalToAccount didn't push and the server doesn't return). Hide
        // it from My Projects; body is retained so nothing is lost.
        if (!isHidden(p.id)) { hide(p.id); hidden++; }
      });
      return hidden;
    }).catch(function () { return 0; });
  }
  // True when a cached body carries a foreign ownerId (set and ≠ me). Consulted
  // for untagged dirty rows whose index summary lacks an ownerId but whose
  // server-loaded body recorded the real owner (e.g. a teammate's private row).
  function bodyIsForeign(id) {
    const me = currentUserId();
    const body = readJSON(KEY_PREFIX + id, null);
    return !!(body && body.ownerId && me && body.ownerId !== me);
  }

  // Clear server-sourced cached rows on sign-out (shared-machine safety).
  // Keeps device-local UI pointers untouched. CRITICAL: never drop rows that
  // are still dirty (saved locally but not yet confirmed by Neon) or their
  // retry queue — doing so destroys un-synced work permanently. Only confirmed
  // (server-sourced) rows are safe to evict.
  function clearCache() {
    const dirty = getDirty();
    const keepDirty = {};
    dirty.forEach(function (id) { keepDirty[id] = true; });

    getIndex().forEach(function (p) {
      if (!keepDirty[p.id]) remove(KEY_PREFIX + p.id);
    });

    if (dirty.length) {
      // Rebuild the index to hold only the surviving dirty rows; keep the
      // dirty queue AND its owner map so flushDirty can sync them, and the
      // next sign-in's reconcile can tell whose rows they are.
      const survivors = getIndex().filter(function (p) { return keepDirty[p.id]; });
      setIndex(survivors);
    } else {
      remove(KEY_INDEX);
      remove(KEY_DIRTY);
      remove(KEY_DIRTY_OWNER);
    }
    setActiveProjectId(null);
    return Promise.resolve();
  }

  // ════════════════════════════════════════════════════════════
  //  USER PROFILE (Neon `profiles` table — synced name/title/role)
  //  One row per auth user, keyed on user_id (= app.user_id()). RLS
  //  restricts read/write to the owner. Aubrey API keys are NOT here —
  //  they stay device-local in localStorage (aubrey-client.js), so they
  //  never sync and never ride along in a JWT-scoped row.
  // ════════════════════════════════════════════════════════════
  const KEY_PROFILE_CACHE = "holodeck.profile.";  // + userId  (offline mirror)

  function blankProfile() { return { name: "", title: "", role: "" }; }
  function sanitizeProfile(p) {
    const b = blankProfile();
    if (!p || typeof p !== "object") return b;
    b.name  = String(p.name  || "");
    b.title = String(p.title || "");
    b.role  = String(p.role  || "");
    return b;
  }

  // Read the cached profile for the current user (offline fallback).
  function readProfileCache() {
    const me = currentUserId();
    if (!me) return null;
    return readJSON(KEY_PROFILE_CACHE + me, null);
  }
  function writeProfileCache(profile) {
    const me = currentUserId();
    if (!me) return;
    writeJSON(KEY_PROFILE_CACHE + me, sanitizeProfile(profile));
  }

  // loadProfile(): the user's saved {name,title,role}, or a blank shape.
  // Online → Data API (cache-refreshed); offline / signed-out → cache.
  function loadProfile() {
    if (!online()) return Promise.resolve(sanitizeProfile(readProfileCache()));
    const me = currentUserId();
    return dataFetch("/profiles?user_id=eq." + encodeURIComponent(me) +
      "&select=name,title,role&limit=1")
      .then(function (rows) {
        const p = sanitizeProfile(rows && rows[0]);
        writeProfileCache(p);
        return p;
      })
      .catch(function () { return sanitizeProfile(readProfileCache()); });
  }

  // saveProfile({name,title,role}): upsert the user's row. Writes the
  // cache first (so a same-tick reload is correct) then pushes to Neon;
  // a sync failure resolves anyway with the saved value (cache holds it).
  function saveProfile(profile) {
    const clean = sanitizeProfile(profile);
    writeProfileCache(clean);
    if (!online()) return Promise.resolve(clean);
    const me = currentUserId();
    // owner_id-equivalent: user_id must equal app.user_id() for the RLS
    // WITH CHECK to pass on both the INSERT and the merge UPDATE branch.
    const row = {
      user_id: me, name: clean.name, title: clean.title, role: clean.role,
      updated_at: new Date().toISOString(),
    };
    return dataFetch("/profiles?on_conflict=user_id", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: [row],
    }).then(function () { return clean; })
      .catch(function () { return clean; });
  }

  // ════════════════════════════════════════════════════════════
  //  GCS asset tokens ↔ signed URLs
  //  AI images live in a private GCS bucket. Project state persists a
  //  tiny token "gcs:ai/abc.png" (never a signed URL — those expire and
  //  would also bloat the row). On load we sign tokens into displayable
  //  URLs; on save we convert any signed URL back to its token. The
  //  url→token map is the bridge: it's filled both when we sign (here)
  //  and right after generation (gemini-client → HOLO_ASSETS.remember).
  // ════════════════════════════════════════════════════════════
  const SIGN_API = "/api/asset/sign";
  const _urlToToken = Object.create(null); // signed url → "gcs:ai/.."

  function rememberSigned(url, token) {
    if (typeof url === "string" && url && typeof token === "string" && token) {
      _urlToToken[url] = token;
    }
  }
  function isGcsToken(v) { return typeof v === "string" && v.lastIndexOf("gcs:", 0) === 0; }
  function tokenPath(token) { return token.slice(4); } // strip "gcs:"

  // Walk every asset-bearing slot in a state, applying fn(value) and
  // writing back any string it returns. Covers assetLibrary.* plus the
  // two brand logo fields (same shape the cache slimmer handles).
  function mapAssetValues(state, fn) {
    if (!state) return;
    if (state.assetLibrary && typeof state.assetLibrary === "object") {
      Object.keys(state.assetLibrary).forEach(function (k) {
        const out = fn(state.assetLibrary[k]);
        if (typeof out === "string") state.assetLibrary[k] = out;
      });
    }
    if (state.brand && typeof state.brand === "object") {
      ["logoPath", "customerLogoPath"].forEach(function (k) {
        const out = fn(state.brand[k]);
        if (typeof out === "string") state.brand[k] = out;
      });
    }
  }

  // PERSIST guard: on a CLONE bound for cache/cloud, swap any signed URL
  // we know the token for back to the token. Never mutates live state.
  function tokenizeForPersist(stateClone) {
    mapAssetValues(stateClone, function (v) {
      return (typeof v === "string" && _urlToToken[v]) || undefined;
    });
    return stateClone;
  }

  // LOAD step: replace every "gcs:" token in the live state with a fresh
  // signed URL so the editor/preview can display it. Records url→token so
  // a later save re-tokenizes. Resolves to the (mutated) state; on sign
  // failure leaves the token in place (renderer shows a placeholder).
  function signAssets(state) {
    if (!state) return Promise.resolve(state);
    const tokens = [];
    mapAssetValues(state, function (v) { if (isGcsToken(v)) tokens.push(v); return undefined; });
    if (!tokens.length) return Promise.resolve(state);
    const paths = tokens.map(tokenPath);
    // The sign endpoint is gated on the same JWT as the Data API; attach it.
    const auth = AUTH();
    const headersP = auth && auth.authHeaders ? auth.authHeaders() : Promise.resolve({});
    return headersP
      .then(function (authHeaders) {
        return fetch(SIGN_API, {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders),
          body: JSON.stringify({ paths: paths }),
        });
      })
      .then(function (res) { return res.ok ? res.json() : { urls: {} }; })
      .then(function (data) {
        const urls = (data && data.urls) || {};
        mapAssetValues(state, function (v) {
          if (!isGcsToken(v)) return undefined;
          const signed = urls[tokenPath(v)];
          if (!signed) return undefined; // unsignable → leave token
          rememberSigned(signed, v);
          return signed;
        });
        return state;
      })
      .catch(function () { return state; }); // network error → leave tokens
  }

  // ─── Sharing / presence public wrappers ───────────────────────
  // These are online-only (server-authoritative). When signed out they
  // reject with an offline-flagged error so callers can show a message
  // rather than silently no-op.
  function requireOnline() {
    if (online()) return null;
    const err = new Error("Sign in to use sharing.");
    err.offline = true;
    return err;
  }
  function shareProject(projectId, email, permission) {
    const off = requireOnline(); if (off) return Promise.reject(off);
    if (!isSalesforceEmail(email)) {
      return Promise.reject(new Error("Only @salesforce.com emails can be added."));
    }
    return ShareBackend.shareProject(projectId, email, permission);
  }
  function updateShare(projectId, email, permission) {
    const off = requireOnline(); if (off) return Promise.reject(off);
    return ShareBackend.updateShare(projectId, email, permission);
  }
  function unshareProject(projectId, email) {
    const off = requireOnline(); if (off) return Promise.reject(off);
    return ShareBackend.unshareProject(projectId, email);
  }
  function listShares(projectId) {
    const off = requireOnline(); if (off) return Promise.reject(off);
    return ShareBackend.listShares(projectId);
  }
  function listSharedWithMe() {
    if (!online()) return Promise.resolve([]);
    return ShareBackend.listSharedWithMe().catch(function () { return []; });
  }
  function listGallery() {
    if (!online()) return Promise.resolve([]);
    return ShareBackend.listGallery().catch(function () { return []; });
  }
  // Publish/unpublish a project to the team gallery. Issues a TARGETED PATCH on
  // just the visibility column — no full-project load+save round-trip — so the
  // toggle responds fast and gives an honest success/failure signal. Owner-only
  // in practice: RLS projects_update lets the owner (or an edit-collaborator)
  // write, and the UI only offers this to owners; a denied write returns zero
  // rows (RLS-filtered), which we surface as a rejection. Also patches the local
  // cache (index summary + cached body) so the change survives an offline reload.
  // Resolves to the new visibility, or rejects with a clear message.
  function setVisibility(projectId, visibility) {
    const off = requireOnline(); if (off) return Promise.reject(off);
    const vis = (visibility === "gallery") ? "gallery" : "private";
    return dataFetch(
      "/projects?id=eq." + encodeURIComponent(projectId) + "&select=id,visibility",
      { method: "PATCH", body: { visibility: vis }, headers: { "Prefer": "return=representation" } }
    ).then(function (rows) {
      // PostgREST returns the updated rows. Empty = the row wasn't visible/writable
      // to us (RLS denied, or it isn't synced to Neon yet) — treat as a failure so
      // the toggle reverts instead of silently lying.
      if (!rows || !rows.length) {
        throw new Error("Couldn't update the gallery — the project may not be saved yet.");
      }
      // Reflect the new visibility in the local cache without a full reload.
      const idx = getIndex();
      const i = idx.findIndex(function (p) { return p.id === projectId; });
      if (i >= 0) { idx[i].visibility = vis; setIndex(idx); }
      const body = readJSON(KEY_PREFIX + projectId, null);
      if (body) { body.visibility = vis; writeJSON(KEY_PREFIX + projectId, body); }
      return vis;
    });
  }
  function getPresence(projectId) {
    if (!online()) return Promise.resolve(null);
    return PresenceBackend.getPresence(projectId).catch(function () { return null; });
  }
  function acquireLock(projectId) {
    if (!online()) return Promise.resolve(false);
    return PresenceBackend.acquireLock(projectId).catch(function () { return false; });
  }
  function renewLock(projectId) {
    if (!online()) return Promise.resolve(false);
    return PresenceBackend.renewLock(projectId).catch(function () { return false; });
  }
  function releaseLock(projectId) {
    if (!online()) return Promise.resolve(false);
    return PresenceBackend.releaseLock(projectId).catch(function () { return false; });
  }

  // Exposed for gemini-client to register a freshly-generated image's
  // signed url ↔ token the moment it's applied to a slot.
  global.HOLO_ASSETS = { remember: rememberSigned };

  global.HOLO_STORE = {
    listProjects: listProjects,
    loadProject: loadProject,
    saveProject: saveProject,
    loadProfile: loadProfile,
    saveProfile: saveProfile,
    signAssets: signAssets,
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
    reconcileOwnership: reconcileOwnership,
    flushDirty: flushDirty,
    clearCache: clearCache,
    reconcile: reconcile,
    // Sharing (email-keyed; RLS authoritative)
    shareProject: shareProject,
    updateShare: updateShare,
    unshareProject: unshareProject,
    listShares: listShares,
    listSharedWithMe: listSharedWithMe,
    // Team gallery (visibility='gallery'; RLS authoritative)
    listGallery: listGallery,
    setVisibility: setVisibility,
    // Soft-lock presence
    getPresence: getPresence,
    acquireLock: acquireLock,
    renewLock: renewLock,
    releaseLock: releaseLock,
    uid: uid,
    lastCacheWriteFailed: lastCacheWriteFailed,
    lastSyncFailed: lastSyncFailed,
    lastSyncError: lastSyncError,
    // Shared by feedback-store so the authenticated PostgREST client lives
    // in one place. DATA_API is the single source of the Data API base.
    makeDataFetch: makeDataFetch,
    DATA_API: DATA_API,
  };
})(window);
