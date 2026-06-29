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

    // The proxy streams a newline-delimited JSON (NDJSON) response —
    // a {type:"start"} line, periodic {type:"ping"} heartbeats while
    // Gemini generates, then a terminal {type:"done",text} or
    // {type:"error",error}. Streaming keeps the HTTP connection alive
    // past Heroku's 30s router limit (H12) on long script parses. We
    // read the stream, ignore pings, and resolve with the full text so
    // callers are unchanged.
    return fetch(GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(payload),
    })
      .catch(function (err) {
        throw new Error("Could not reach the Gemini proxy — is the server running? " +
          "(Underlying: " + ((err && err.message) || err) + ")");
      })
      .then(function (res) {
        // A non-2xx with no stream (e.g. 503 unconfigured) still arrives
        // as a single JSON object — handle that before streaming.
        if (!res.ok && !res.body) {
          return res.text().then(function (body) {
            let parsed; try { parsed = JSON.parse(body); } catch (_) { parsed = null; }
            throw new Error((parsed && parsed.error) || ("HTTP " + res.status));
          });
        }
        return readNdjson(res, function (msg) {
          if (msg.type === "error") throw new Error(msg.error || "Gemini error");
          if (msg.type === "done") {
            if (typeof msg.text !== "string") throw new Error("Unexpected response from the Gemini proxy");
            return msg.text; // terminal value
          }
          return undefined; // start / ping → keep reading
        });
      });
  }

  // Read an NDJSON stream, passing each parsed line to `onMessage`.
  // Resolves with the first non-undefined value `onMessage` returns
  // (the terminal "done" text); rejects if `onMessage` throws (error
  // line) or the stream ends with no terminal line. Falls back to a
  // buffered read when ReadableStream isn't available.
  function readNdjson(res, onMessage) {
    if (!res.body || typeof res.body.getReader !== "function") {
      // No streaming support — buffer the whole body, then replay lines.
      return res.text().then(function (body) {
        const result = consumeNdjsonLines(body, true, onMessage);
        if (result.done) return result.value;
        throw new Error("Gemini stream ended without a result");
      });
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    function pump() {
      return reader.read().then(function (step) {
        buffer += decoder.decode(step.value || new Uint8Array(), { stream: !step.done });
        const result = consumeNdjsonLines(buffer, step.done, onMessage);
        buffer = result.rest;
        if (result.done) return result.value;
        if (step.done) throw new Error("Gemini stream ended without a result");
        return pump();
      });
    }
    return pump();
  }

  // Pull complete lines out of `buffer`, parse each as JSON, and run
  // `onMessage`. Returns { rest, done, value } — `rest` is the unparsed
  // tail, `done`/`value` set once onMessage yields a terminal value.
  // When `flush` is true the final line need not be newline-terminated.
  function consumeNdjsonLines(buffer, flush, onMessage) {
    let rest = buffer;
    let nl;
    while ((nl = rest.indexOf("\n")) !== -1) {
      const line = rest.slice(0, nl).trim();
      rest = rest.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch (_) { continue; }
      const v = onMessage(msg);
      if (v !== undefined) return { rest: rest, done: true, value: v };
    }
    if (flush && rest.trim()) {
      let msg; try { msg = JSON.parse(rest.trim()); } catch (_) { msg = null; }
      if (msg) {
        const v = onMessage(msg);
        if (v !== undefined) return { rest: "", done: true, value: v };
      }
      rest = "";
    }
    return { rest: rest, done: false, value: undefined };
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

    // Same NDJSON streaming protocol as generate() — start/ping/done —
    // so image generation also survives Heroku's 30s router limit. The
    // terminal line carries {type:"done",dataUrl}. Resolves with the
    // data: URL string, so callers are unchanged.
    return fetch(IMAGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(payload),
    })
      .catch(function (err) {
        throw new Error("Could not reach the Gemini proxy — is the server running? " +
          "(Underlying: " + ((err && err.message) || err) + ")");
      })
      .then(function (res) {
        if (!res.ok && !res.body) {
          return res.text().then(function (body) {
            let parsed; try { parsed = JSON.parse(body); } catch (_) { parsed = null; }
            throw new Error((parsed && parsed.error) || ("HTTP " + res.status));
          });
        }
        return readNdjson(res, function (msg) {
          if (msg.type === "error") throw new Error(msg.error || "Gemini error");
          if (msg.type === "done") {
            if (typeof msg.dataUrl !== "string" || !msg.dataUrl) {
              throw new Error("Unexpected response from the Gemini image proxy");
            }
            return msg.dataUrl; // terminal value
          }
          return undefined; // start / ping → keep reading
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
