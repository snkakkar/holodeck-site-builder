// ════════════════════════════════════════════════════════════════
//  GEMINI CLIENT — browser-side wrapper for the server Gemini proxy
//
//  Unlike aubrey-client.js, this client holds NO key. The Gemini API
//  key lives only on the server (GEMINI_API_KEY env var); we talk to
//  the same-origin proxy routes in server.js:
//
//    GET  /api/gemini/status    → { configured: bool, model: str }
//    POST /api/gemini/generate  → { text: str, model: str }
//
//  Keeping the key server-side means it never lands in localStorage,
//  exported ZIPs, or shared project JSON — the same isolation goal
//  the Aubrey creds store has, achieved more strongly here.
//
//  Every method returns a promise; failures throw with a friendly
//  message the caller can pipe into toast()/alert UI.
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  const STATUS_URL   = "/api/gemini/status";
  const GENERATE_URL = "/api/gemini/generate";
  const IMAGE_URL    = "/api/gemini/generate-image";

  // Cache the availability probe so repeated UI renders don't spam
  // the server. One probe per page load is plenty; null = not yet
  // checked.
  let _statusPromise = null;

  // ─── Availability ────────────────────────────────────────────
  // Resolves to { configured, model }. Never rejects — a failed
  // probe is treated as "not configured" so the UI degrades to the
  // copy-paste flow instead of erroring.
  function status() {
    if (_statusPromise) return _statusPromise;
    _statusPromise = fetch(STATUS_URL, { headers: { Accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : { configured: false, model: "" }; })
      .catch(function () { return { configured: false, model: "" }; });
    return _statusPromise;
  }

  function isConfigured() {
    return status().then(function (s) { return Boolean(s && s.configured); });
  }

  // ─── Generation ──────────────────────────────────────────────
  // opts: { prompt: string, jsonMode?: bool, schema?: object, model?: string }
  // Resolves to the raw model text (a string). Pass jsonMode:true to
  // ask Gemini for application/json output (the prompt defines the
  // shape). `schema` additionally constrains output to an OpenAPI
  // responseSchema — only pass a real schema object, not a sample.
  function generate(opts) {
    const prompt = opts && opts.prompt;
    if (!prompt || !String(prompt).trim()) {
      return Promise.reject(new Error("A prompt is required"));
    }
    const payload = { prompt: String(prompt) };
    if (opts.jsonMode) payload.jsonMode = true;
    if (opts.schema && typeof opts.schema === "object") payload.schema = opts.schema;
    if (opts.model) payload.model = opts.model;

    return fetch(GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    })
      .catch(function (err) {
        throw new Error("Could not reach the Gemini proxy — is the server running? " +
          "(Underlying: " + ((err && err.message) || err) + ")");
      })
      .then(function (res) {
        return res.text().then(function (body) {
          let parsed;
          try { parsed = JSON.parse(body); } catch (_) { parsed = null; }
          if (!res.ok) {
            const msg = (parsed && parsed.error) || ("HTTP " + res.status);
            throw new Error(msg);
          }
          if (parsed && parsed.error) throw new Error(parsed.error);
          if (!parsed || typeof parsed.text !== "string") {
            throw new Error("Unexpected response from the Gemini proxy");
          }
          return parsed.text;
        });
      });
  }

  // ─── Image generation ────────────────────────────────────────
  // opts: { prompt: string, model?: string }
  // Resolves to a ready-to-use data: URL string (the proxy already
  // wraps the base64 inlineData in a data: URL), so the result drops
  // straight into the builder's assetLibrary slots — the same shape
  // the manual file uploader produces.
  function generateImage(opts) {
    const prompt = opts && opts.prompt;
    if (!prompt || !String(prompt).trim()) {
      return Promise.reject(new Error("A prompt is required"));
    }
    const payload = { prompt: String(prompt) };
    if (opts.model) payload.model = opts.model;

    return fetch(IMAGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    })
      .catch(function (err) {
        throw new Error("Could not reach the Gemini proxy — is the server running? " +
          "(Underlying: " + ((err && err.message) || err) + ")");
      })
      .then(function (res) {
        return res.text().then(function (body) {
          let parsed;
          try { parsed = JSON.parse(body); } catch (_) { parsed = null; }
          if (!res.ok) {
            const msg = (parsed && parsed.error) || ("HTTP " + res.status);
            throw new Error(msg);
          }
          if (parsed && parsed.error) throw new Error(parsed.error);
          if (!parsed || typeof parsed.dataUrl !== "string" || !parsed.dataUrl) {
            throw new Error("Unexpected response from the Gemini image proxy");
          }
          return parsed.dataUrl;
        });
      });
  }

  // ─── Public surface ──────────────────────────────────────────
  window.HOLO_GEMINI = {
    status: status,
    isConfigured: isConfigured,
    generate: generate,
    generateImage: generateImage,
  };
})();
