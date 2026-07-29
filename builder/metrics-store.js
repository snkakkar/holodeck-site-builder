// ════════════════════════════════════════════════════════════════
//  METRICS STORE  (window.HOLO_METRICS)
//  Admin-only aggregate reporting for the Reporting dashboard.
//
//  Unlike the project/feedback stores, this does NOT talk to the Neon
//  Data API (PostgREST) — RLS scopes every PostgREST read to the caller,
//  so cross-user aggregates are impossible from the browser. Instead it
//  calls the app's own /api/metrics endpoint, which aggregates server-side
//  with the owner DB role and returns counts/series only (never raw rows).
//
//  Access control is the SERVER's job: /api/metrics is gated by the
//  admin-email check (requireAdmin in server.js). isAdmin() here gates the
//  UI (nav link + page) only — a non-admin's getMetrics() 403s regardless.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const AUTH = function () { return global.HOLO_AUTH; };

  // Single source of truth for "am I the admin?" — reuse the feedback
  // store's check so the admin email is defined in exactly one client place
  // (and matches ADMIN_EMAIL in server.js + app.is_feedback_admin() in the DB).
  function isAdmin() {
    const fb = global.HOLO_FEEDBACK;
    return Boolean(fb && typeof fb.isAdmin === "function" && fb.isAdmin());
  }

  // ─── public: fetch aggregate metrics (admin only by server gate) ───
  // Returns the parsed JSON object from /api/metrics, or rejects with an
  // Error whose .status carries the HTTP code (403 for non-admins).
  function getMetrics() {
    const auth = AUTH();
    return (auth ? auth.getToken() : Promise.resolve(null)).then(function (token) {
      if (!token) {
        const e = new Error("Not authenticated");
        e.status = 401;
        throw e;
      }
      return fetch("/api/metrics", {
        method: "GET",
        headers: { "Authorization": "Bearer " + token },
      }).then(function (res) {
        return res.text().then(function (text) {
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch (_) { /* ignore */ }
          if (!res.ok) {
            const err = new Error((json && json.error) || ("Metrics API " + res.status));
            err.status = res.status;
            throw err;
          }
          return json;
        });
      });
    });
  }

  global.HOLO_METRICS = {
    getMetrics: getMetrics,
    isAdmin: isAdmin,
  };
})(window);
