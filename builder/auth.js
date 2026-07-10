// ════════════════════════════════════════════════════════════════
//  AUTH  (window.HOLO_AUTH)
//  Neon Auth (Better Auth) email + OTP (passwordless) sign-in.
//
//  Flow: enter @salesforce.com email → a 6-digit code is emailed →
//  enter the code → in. Same path for new and returning users:
//  OTP sign-in auto-creates the account on first use (the email-OTP
//  plugin's sign-up is enabled), so there is no separate signup. No
//  password is ever set or stored. (Magic-link isn't available in
//  managed Neon Auth; email+password was the prior fallback and was
//  replaced by passwordless OTP at the user's request.)
//
//  Why a hand-written fetch client instead of an SDK?
//  ─────────────────────────────────────────────────
//  The app is a no-build static bundle of classic <script> IIFEs.
//  Better Auth's REST surface is plain JSON, so a thin fetch wrapper
//  keeps us bundler-free and avoids dragging Node-only deps in via a
//  CDN ESM import.
//
//  Access model (two layers — the server is authoritative):
//   1. CLIENT GUARD (UX only): reject non-@salesforce.com up front so
//      the user gets a clear message and no verification email is sent.
//   2. SERVER (authoritative): every RLS policy on the Data API ANDs an
//      @salesforce.com predicate against the JWT email claim, and email
//      verification is REQUIRED, so a forged or unverified account can
//      read/write nothing regardless of what the client does.
//
//  Token: Better Auth issues a session; the Data API wants a JWT bearer.
//  We fetch the JWT via /token and cache it; NeonBackend calls getToken()
//  on every request and we refresh transparently on 401/expiry.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  // Auth base. Served same-origin (/auth) and reverse-proxied by server.js:
  //   /auth/token → local token-exchange shim (Neon EdDSA JWT → HS256 for PostgREST)
  //   /auth/**     → Neon Auth origin, unchanged (login, OTP, session).
  // window.HOLO_ENV (from /env-config.js) supplies the base; the literal is a
  // same-origin fallback for load-order safety. See memory: neon-multiuser-backend.
  const AUTH_BASE = (global.HOLO_ENV && global.HOLO_ENV.AUTH_BASE) || "/auth";
  const ALLOWED_DOMAIN = "salesforce.com";

  // localStorage keys (device-local session mirror).
  const KEY_TOKEN   = "holodeck.auth.token";   // { jwt, exp }  (exp = ms epoch, best-effort)
  const KEY_USER    = "holodeck.auth.user";    // { id, email, name }

  // ─── tiny localStorage helpers ─────────────────────────────────
  function readJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function removeKey(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  // ─── in-memory session state ───────────────────────────────────
  const session = {
    user:  readJSON(KEY_USER, null),   // { id, email, name } once signed in + verified
    jwt:   null,                       // cached bearer for the Data API
    jwtExp: 0,                         // ms epoch the cached jwt expires (best-effort)
  };

  // ─── domain guard ──────────────────────────────────────────────
  function isSalesforceEmail(email) {
    if (!email) return false;
    const parts = String(email).trim().toLowerCase().split("@");
    return parts.length === 2 && parts[1] === ALLOWED_DOMAIN;
  }

  // ─── low-level REST call (cookie session; same-origin creds) ───
  // Better Auth sets an httpOnly session cookie. We rely on cookies for
  // the session and exchange it for a JWT bearer for the Data API.
  function authFetch(path, body, opts) {
    opts = opts || {};
    const init = {
      method: opts.method || (body ? "POST" : "GET"),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    };
    if (body) init.body = JSON.stringify(body);
    return fetch(AUTH_BASE + path, init).then(function (res) {
      return res.text().then(function (text) {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }
        if (!res.ok) {
          const msg = (json && (json.message || json.error || (json.code && String(json.code)))) ||
            ("Request failed (" + res.status + ")");
          const err = new Error(msg);
          err.status = res.status;
          err.body = json;
          throw err;
        }
        return json;
      });
    });
  }

  // ─── JWT decode (no verification — server verifies; we just read exp) ─
  function decodeExp(jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.exp ? payload.exp * 1000 : 0;
    } catch (e) { return 0; }
  }

  // ─── token exchange ────────────────────────────────────────────
  // Better Auth exposes GET /token which mints a JWT from the active
  // session cookie. Cache it until ~60s before expiry.
  function fetchToken() {
    return authFetch("/token", null, { method: "GET" }).then(function (json) {
      const jwt = json && (json.token || json.jwt);
      if (!jwt) throw new Error("No token returned");
      session.jwt = jwt;
      session.jwtExp = decodeExp(jwt) || (Date.now() + 5 * 60 * 1000);
      return jwt;
    });
  }

  // Returns a valid bearer (refreshing if missing/near-expiry), or null
  // if there is no usable session.
  function getToken(forceRefresh) {
    if (!session.user) return Promise.resolve(null);
    const fresh = session.jwt && session.jwtExp - 60000 > Date.now();
    if (fresh && !forceRefresh) return Promise.resolve(session.jwt);
    return fetchToken().catch(function () { return null; });
  }

  // Resolves to an { Authorization: "Bearer <jwt>" } object when a
  // session is available, or {} otherwise. Convenience for the
  // same-origin /api/* callers (Gemini, logo, asset sign/proxy) that
  // the server now gates on the same JWT the Data API uses.
  function authHeaders(forceRefresh) {
    return getToken(forceRefresh).then(function (jwt) {
      return jwt ? { Authorization: "Bearer " + jwt } : {};
    });
  }

  // ─── session hydration ─────────────────────────────────────────
  // On boot, confirm the cookie session is still alive and the email is
  // verified; otherwise treat as logged out.
  function refreshSession() {
    return authFetch("/get-session", null, { method: "GET" })
      .then(function (json) {
        const user = json && json.user;
        if (!user || !user.id) { clearLocal(); return null; }
        // Require a verified @salesforce.com email — server enforces too,
        // but bail early so we never show the app to an unverified user.
        if (!user.emailVerified) { clearLocal(); return null; }
        if (!isSalesforceEmail(user.email)) { clearLocal(); return null; }
        session.user = { id: user.id, email: user.email, name: user.name || "" };
        writeJSON(KEY_USER, session.user);
        return session.user;
      })
      .catch(function () {
        // Network failure on boot: keep any cached user so the offline
        // cache path in the store still works; data calls will 401 and
        // fall back to the local cache.
        return session.user;
      });
  }

  function clearLocal() {
    session.user = null;
    session.jwt = null;
    session.jwtExp = 0;
    removeKey(KEY_USER);
    removeKey(KEY_TOKEN);
  }

  // ─── public: init (called by boot before anything touches data) ─
  function init() {
    return refreshSession().then(function (user) {
      // Warm the token cache so the first data call doesn't pay the
      // round-trip; ignore failures (offline → cache fallback).
      if (user) return getToken().then(function () { return user; });
      return user;
    });
  }

  // ─── public: request a sign-in code (email-only, passwordless) ─
  // Sends a 6-digit code. Works for both new and returning users —
  // the email-OTP plugin auto-creates the account on first sign-in.
  // The @salesforce.com guard here is UX only; the server's RLS gate
  // on the verified JWT email claim is authoritative.
  function requestCode(email) {
    email = String(email || "").trim().toLowerCase();
    if (!isSalesforceEmail(email)) {
      return Promise.reject(new Error("Use your @salesforce.com email."));
    }
    return authFetch("/email-otp/send-verification-otp", {
      email: email,
      type: "sign-in",
    }).then(function () { return { sent: true, email: email }; });
  }

  // ─── public: verify the code and sign in ───────────────────────
  function verifyOtp(email, otp) {
    email = String(email || "").trim().toLowerCase();
    return authFetch("/sign-in/email-otp", { email: email, otp: String(otp || "").trim() })
      .then(function () {
        // Session cookie is now set; hydrate user + confirm verified
        // @salesforce.com, then warm the Data API token.
        return refreshSession();
      })
      .then(function (user) {
        if (!user) throw new Error("Verification did not complete. Try again.");
        return getToken().then(function () { return user; });
      });
  }

  // ─── public: sign out ──────────────────────────────────────────
  function signOut() {
    return authFetch("/sign-out", {}, { method: "POST" })
      .catch(function () { /* best effort; clear locally regardless */ })
      .then(function () { clearLocal(); });
  }

  // ─── public: accessors ─────────────────────────────────────────
  function currentUser() { return session.user; }
  function isAuthed() { return !!session.user; }

  global.HOLO_AUTH = {
    init: init,
    requestCode: requestCode,
    verifyOtp: verifyOtp,
    signOut: signOut,
    getToken: getToken,
    authHeaders: authHeaders,
    currentUser: currentUser,
    isAuthed: isAuthed,
    isSalesforceEmail: isSalesforceEmail,
    // Exposed so the store's NeonBackend can read the Data API base/JWT.
    _authBase: AUTH_BASE,
  };
})(window);
