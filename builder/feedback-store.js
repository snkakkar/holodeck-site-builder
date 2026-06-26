// ════════════════════════════════════════════════════════════════
//  FEEDBACK STORE  (window.HOLO_FEEDBACK)
//  In-product SE feedback: submit + (admin-only) triage inbox.
//
//  Backed by the same Neon Data API (PostgREST) and JWT bearer as the
//  project store. Access control is the SERVER's job (RLS on
//  app.feedback): any verified @salesforce.com SE may INSERT; only the
//  admin email may SELECT/UPDATE. The isAdmin() check here gates the UI
//  only — a non-admin's listAll() returns [] regardless of the client.
//
//  Feedback is fire-and-forget: no offline cache, no localStorage. A
//  failed submit rejects so the UI can surface the error.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // Same Data API base as project-store.js. See memory: neon-multiuser-backend.
  const DATA_API = "https://ep-round-hill-ajwf0r6a.apirest.c-3.us-east-2.aws.neon.tech/neondb/rest/v1";

  // The single admin who can read/triage all feedback (UI gating only;
  // the RLS policy app.is_feedback_admin() is authoritative server-side).
  const ADMIN_EMAIL = "shachi.kakkar@salesforce.com";

  const VALID_TYPES = ["like", "dislike", "bug", "complaint"];
  const VALID_STATUS = ["new", "in_progress", "resolved"];

  const AUTH = function () { return global.HOLO_AUTH; };

  // Stable, URL-safe id (mirrors project-store's uid()).
  function uid() {
    return "f_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  // Authenticated PostgREST fetch — same shape as project-store.js dataFetch.
  function dataFetch(path, opts) {
    opts = opts || {};
    const auth = AUTH();
    return (auth ? auth.getToken() : Promise.resolve(null)).then(function (token) {
      if (!token) throw new Error("Not authenticated");
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

  function currentEmail() {
    const auth = AUTH();
    const u = auth && auth.currentUser();
    return u && u.email ? String(u.email).trim().toLowerCase() : "";
  }

  // ─── public: am I the admin? (UI gating only) ──────────────────
  function isAdmin() {
    return currentEmail() === ADMIN_EMAIL;
  }

  // ─── public: submit feedback (any verified SE) ─────────────────
  // submitter_id / submitter_email / timestamps default server-side.
  function submit(input) {
    input = input || {};
    const type = String(input.type || "").trim();
    const message = String(input.message || "").trim();
    if (VALID_TYPES.indexOf(type) === -1) {
      return Promise.reject(new Error("Pick a feedback type."));
    }
    if (!message) {
      return Promise.reject(new Error("Add a short message."));
    }
    let rating = input.rating;
    rating = (rating === 0 || rating == null || rating === "") ? null : parseInt(rating, 10);
    if (rating != null && (isNaN(rating) || rating < 1 || rating > 5)) rating = null;

    const row = {
      id: uid(),
      type: type,
      message: message,
      rating: rating,
      context: (String(input.context || "").trim()) || null,
    };
    return dataFetch("/feedback", {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      body: [row],
    }).then(function () { return row.id; });
  }

  // ─── public: list all feedback (admin only by RLS) ─────────────
  function listAll() {
    return dataFetch("/feedback?select=*&order=created_at.desc")
      .then(function (rows) { return Array.isArray(rows) ? rows : []; })
      .catch(function () { return []; });
  }

  // ─── public: triage status (admin only by RLS) ─────────────────
  function setStatus(id, status) {
    if (!id) return Promise.reject(new Error("Missing id."));
    if (VALID_STATUS.indexOf(status) === -1) return Promise.reject(new Error("Bad status."));
    return dataFetch("/feedback?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      body: { status: status, updated_at: new Date().toISOString() },
    });
  }

  global.HOLO_FEEDBACK = {
    submit: submit,
    listAll: listAll,
    setStatus: setStatus,
    isAdmin: isAdmin,
    ADMIN_EMAIL: ADMIN_EMAIL,
    TYPES: VALID_TYPES.slice(),
    STATUSES: VALID_STATUS.slice(),
  };
})(window);
