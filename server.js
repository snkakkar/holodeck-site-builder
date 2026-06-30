const express = require("express");
const path = require("path");
const fs = require("fs");

// ── Minimal .env loader (zero dependencies) ────────────────────
// Reads KEY=VALUE lines from a .env file next to server.js and
// populates process.env for any key not already set in the real
// environment. .env is gitignored, so secrets stay out of git.
// We avoid adding a dotenv dependency for one small need.
(function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return; // skip blanks/comments
      const key = m[1];
      let val = m[2];
      // Strip a single layer of surrounding quotes if present.
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    });
  } catch (_) {
    // No .env file — fine, env vars may be set another way.
  }
})();

const app = express();
const port = process.env.PORT || 4173;
const rootDir = __dirname;

// ── Gemini config ──────────────────────────────────────────────
// The API key lives ONLY here, server-side, read from the env. The
// browser never sees it — the builder calls /api/gemini/* and we
// forward to Google with the key attached. This keeps a billable
// Google Cloud credential out of localStorage, exported ZIPs, and
// shared project JSON (mirroring why Aubrey keys are kept out of
// project state — see aubrey-client.js).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ── Google Cloud Storage (image bytes) ─────────────────────────
// AI-generated images come back from Gemini as raw base64 bytes. If
// we leave them inline as data: URLs inside the project state, the
// state blob blows past the Neon Data API's ~1MB request-body limit
// and cloud saves 400. So we upload the bytes to a PRIVATE GCS bucket
// (the org forbids public buckets) and store only the short object
// PATH (e.g. "ai/abc.png") in the project — tiny, so saves never 400.
// The browser can't read a private object directly, so we hand it a
// short-lived V4 SIGNED URL, minted fresh whenever a project loads
// (see /api/asset/sign). Lazily build the client on first use so the
// server still boots (and image gen still works via the data: URL
// fallback) when GCS is not configured.
//
// Credentials: prefer GCS_KEY_JSON (the service-account key's JSON
// contents in one env var — how Heroku gets it), else fall back to
// GOOGLE_APPLICATION_CREDENTIALS (a key file path — local dev / ADC).
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const GCS_SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (V4 max)
let _gcsBucket = null;       // cached Bucket handle
let _gcsInit = false;        // have we attempted init?
const gcsConfigured = () => Boolean(GCS_BUCKET && (process.env.GCS_KEY_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS));

function getGcsBucket() {
  if (_gcsInit) return _gcsBucket;
  _gcsInit = true;
  if (!gcsConfigured()) return null;
  try {
    const { Storage } = require("@google-cloud/storage");
    let opts = {};
    if (process.env.GCS_KEY_JSON) {
      const creds = JSON.parse(process.env.GCS_KEY_JSON);
      opts = { projectId: creds.project_id, credentials: creds };
    }
    // No GCS_KEY_JSON → Storage() picks up GOOGLE_APPLICATION_CREDENTIALS / ADC.
    _gcsBucket = new Storage(opts).bucket(GCS_BUCKET);
  } catch (err) {
    console.warn("[holodeck] GCS init failed; falling back to inline data URLs:", (err && err.message) || err);
    _gcsBucket = null;
  }
  return _gcsBucket;
}

// Upload raw image bytes to the private bucket; resolve to the object
// PATH (e.g. "ai/171234-ab12.png"), NOT a URL — the path is what we
// persist in project state. Object lives under ai/ with a unique name.
function uploadImageToGcs(buffer, mime) {
  const bucket = getGcsBucket();
  if (!bucket) return Promise.reject(new Error("GCS not configured"));
  const ext = String(mime || "image/png").split("/")[1] || "png";
  const name = "ai/" + Date.now() + "-" + Math.random().toString(36).slice(2, 10) + "." + ext;
  return bucket
    .file(name)
    .save(buffer, { contentType: mime || "image/png", resumable: false })
    .then(function () { return name; });
}

// Mint a short-lived V4 signed READ URL for a private object path.
// Only ai/ paths are signable (guards against signing arbitrary
// objects from a client-supplied path). Resolves to the https URL.
function signGcsUrl(objectPath) {
  const bucket = getGcsBucket();
  if (!bucket) return Promise.reject(new Error("GCS not configured"));
  if (typeof objectPath !== "string" || objectPath.indexOf("ai/") !== 0) {
    return Promise.reject(new Error("Refusing to sign non-ai/ path"));
  }
  return bucket
    .file(objectPath)
    .getSignedUrl({ action: "read", version: "v4", expires: Date.now() + GCS_SIGNED_URL_TTL_MS })
    .then(function (res) { return res[0]; });
}

// ── NDJSON streaming helper ────────────────────────────────────
// Heroku's router kills any request whose first byte or idle gap
// exceeds ~30s/55s (H12 Request Timeout). Slow Gemini calls (long
// script parses, image generation) blow past that. We answer as
// newline-delimited JSON: a {type:"start"} line flushed immediately,
// {type:"ping"} heartbeats every 10s while we wait, and a terminal
// {type:"done",...} or {type:"error",error}. This keeps the
// connection alive no matter how long the upstream call takes. The
// client (gemini-client.js) reads these lines and ignores pings.
// Returns { writeLine, finish } — call finish() exactly once.
function beginNdjson(res) {
  res.status(200);
  res.set("Content-Type", "application/x-ndjson; charset=utf-8");
  res.set("Cache-Control", "no-cache, no-transform");
  res.set("X-Accel-Buffering", "no");
  const writeLine = (obj) => { try { res.write(JSON.stringify(obj) + "\n"); } catch (_) {} };
  writeLine({ type: "start" });
  const heartbeat = setInterval(() => writeLine({ type: "ping" }), 10000);
  const finish = (obj) => {
    clearInterval(heartbeat);
    writeLine(obj);
    res.end();
  };
  return { writeLine, finish };
}

app.get("/", (_req, res) => {
  res.redirect(302, "/builder/");
});

app.get("/demo/", (_req, res) => {
  res.redirect(302, "/builder/");
});

// JSON body parsing, scoped to the API routes so static serving is
// untouched. 2 MB ceiling comfortably covers a full prompt + script.
app.use("/api", express.json({ limit: "2mb" }));

// ── Gemini: availability probe ─────────────────────────────────
// Lets the builder show/hide AI buttons without ever shipping the
// key. Returns only booleans + the model name.
app.get("/api/gemini/status", (_req, res) => {
  res.json({
    configured: Boolean(GEMINI_API_KEY),
    model: GEMINI_TEXT_MODEL,
    imageModel: GEMINI_IMAGE_MODEL,
    imageHosting: gcsConfigured() ? "gcs" : "inline",
  });
});

// ── Gemini: text/JSON generation (streamed NDJSON) ─────────────
// Body: { prompt: string, schema?: object, jsonMode?: bool, model?: string }
//
// A full-script parse can take well over Heroku's 30s router limit
// (H12 Request Timeout), which killed the old buffered response. We
// avoid that by proxying Gemini's streaming endpoint and replying as
// newline-delimited JSON (NDJSON):
//   {"type":"start"}                       ← flushed immediately (beats
//                                             the 30s time-to-first-byte)
//   {"type":"ping"}                        ← heartbeat while generating
//                                             (keeps the 55s idle window
//                                             from closing)
//   {"type":"done","text":…,"model":…}     ← final, full text
//   {"type":"error","error":…}             ← failure (terminal line)
// The client (gemini-client.js) reads these lines, ignores pings, and
// resolves with the full text — so callers still just get a string.
// The result is still buffered server-side before `done`, so JSON /
// responseSchema validation downstream is unchanged; streaming only
// keeps the HTTP connection alive past 30s.
app.post("/api/gemini/generate", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Gemini is not configured on the server (GEMINI_API_KEY unset)." });
  }
  const body = req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }
  const model = typeof body.model === "string" && body.model ? body.model : GEMINI_TEXT_MODEL;

  // JSON output can be requested two ways:
  //  • jsonMode: true        → ask for application/json, let the
  //                            prompt define the shape (no schema).
  //  • schema: <OpenAPI obj> → also constrain to a responseSchema.
  // The schema MUST be a real OpenAPI/JSON-Schema object
  // ({type, properties, …}) — NOT a sample/example object, or
  // Gemini rejects it field-by-field.
  const generationConfig = {};
  const wantsJson = body.jsonMode === true || (body.schema && typeof body.schema === "object");
  if (wantsJson) generationConfig.responseMimeType = "application/json";
  if (body.schema && typeof body.schema === "object") {
    generationConfig.responseSchema = body.schema;
  }
  // Opt-in latency controls (only applied when the caller asks). For a
  // mechanical JSON extraction these cut a lot of wall-clock:
  //  • fast → disable the 2.5-flash "thinking" pass (the big win)
  //  • temperature / maxOutputTokens → deterministic, bounded output
  if (body.fast === true) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  if (typeof body.temperature === "number") generationConfig.temperature = body.temperature;
  if (typeof body.maxOutputTokens === "number") generationConfig.maxOutputTokens = body.maxOutputTokens;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (Object.keys(generationConfig).length) payload.generationConfig = generationConfig;

  // Begin the NDJSON response immediately so Heroku sees a first byte
  // long before its 30s limit (see beginNdjson).
  const { finish } = beginNdjson(res);

  // Stream from Gemini via SSE (alt=sse). Each event's data is a partial
  // GenerateContentResponse; we concatenate the text parts as they land.
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const raw = await upstream.text();
      let parsed; try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
      const msg = (parsed && parsed.error && parsed.error.message) || `Gemini HTTP ${upstream.status}`;
      return finish({ type: "error", error: msg });
    }

    // Parse the SSE byte stream line-by-line, accumulating "data:" JSON
    // chunks into the full text. `finishReason` is captured for error
    // messages if no text comes back.
    let text = "";
    let finishReason = "";
    let buffer = "";
    const decoder = new TextDecoder();
    const handleEvent = (jsonStr) => {
      let evt; try { evt = JSON.parse(jsonStr); } catch (_) { return; }
      if (evt && evt.error && evt.error.message) { finishReason = "ERROR: " + evt.error.message; return; }
      const cand = evt && evt.candidates && evt.candidates[0];
      if (!cand) return;
      if (cand.finishReason) finishReason = cand.finishReason;
      const parts = (cand.content && cand.content.parts) || [];
      for (const p of parts) if (p && p.text) text += p.text;
    };

    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      // SSE events are separated by blank lines; each event has one or
      // more "data: …" lines.
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data && data !== "[DONE]") handleEvent(data);
        }
      }
    }
    if (buffer.trim().startsWith("data:")) {
      const data = buffer.trim().slice(5).trim();
      if (data && data !== "[DONE]") handleEvent(data);
    }

    if (!text) {
      const fr = finishReason ? ` (finishReason: ${finishReason})` : "";
      return finish({ type: "error", error: `Gemini returned no text${fr}` });
    }
    return finish({ type: "done", text, model });
  } catch (err) {
    return finish({ type: "error", error: `Could not reach Gemini: ${(err && err.message) || err}` });
  }
});

// ── Gemini: image generation (NDJSON-wrapped) ──────────────────
// Body: { prompt: string, model?: string }
// The image model returns the picture as an inlineData part (base64)
// rather than text, so we can't reuse /generate. We pull the first
// inlineData part and hand the browser a ready-to-use data: URL, which
// drops straight into the builder's assetLibrary slots (same shape the
// manual uploader produces).
//
// Image generation can also exceed Heroku's 30s router limit, so the
// response is wrapped in the same NDJSON start/ping/done protocol as
// /generate (see beginNdjson). We still buffer the upstream call (the
// base64 image arrives in one piece); the heartbeat is what keeps the
// connection alive. Terminal line is {type:"done",dataUrl,model}.
app.post("/api/gemini/generate-image", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Gemini is not configured on the server (GEMINI_API_KEY unset)." });
  }
  const body = req.body || {};
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }
  const model = typeof body.model === "string" && body.model ? body.model : GEMINI_IMAGE_MODEL;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  const { finish } = beginNdjson(res);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(payload),
    });
    const raw = await upstream.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }

    if (!upstream.ok) {
      const msg = (parsed && parsed.error && parsed.error.message) || `Gemini HTTP ${upstream.status}`;
      return finish({ type: "error", error: msg });
    }

    // Find the first inlineData part in the first candidate.
    const cand = parsed && parsed.candidates && parsed.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const imgPart = parts.filter((p) => p && p.inlineData && p.inlineData.data)[0];
    if (!imgPart) {
      const fr = cand && cand.finishReason ? ` (finishReason: ${cand.finishReason})` : "";
      // Surface any text the model returned instead of an image — it
      // often explains a safety block or refusal.
      const note = parts.map((p) => (p && p.text) || "").join("").trim();
      return finish({
        type: "error",
        error: `Gemini returned no image${fr}${note ? ": " + note.slice(0, 200) : ""}`,
      });
    }
    const mime = imgPart.inlineData.mimeType || "image/png";
    const b64 = imgPart.inlineData.data;

    // When GCS is configured, upload the bytes and hand back the object
    // PATH (persisted in state) plus a freshly-signed URL (so the client
    // can display the image immediately without a second round-trip).
    // This keeps the saved project state tiny — see the GCS block above.
    // Otherwise fall back to the inline data: URL so image generation
    // still works locally without a bucket. If the upload/sign fails,
    // degrade to the data: URL rather than error out the generation.
    if (gcsConfigured()) {
      try {
        const path = await uploadImageToGcs(Buffer.from(b64, "base64"), mime);
        const signed = await signGcsUrl(path);
        return finish({ type: "done", path, url: signed, model });
      } catch (upErr) {
        console.warn("[holodeck] GCS upload failed; using inline data URL:", (upErr && upErr.message) || upErr);
      }
    }
    return finish({ type: "done", dataUrl: `data:${mime};base64,${b64}`, model });
  } catch (err) {
    return finish({ type: "error", error: `Could not reach Gemini: ${(err && err.message) || err}` });
  }
});

// ── Asset signing (private GCS → short-lived signed URLs) ──────
// Body: { paths: ["ai/abc.png", ...] }
// Returns: { urls: { "ai/abc.png": "<signed https url>", ... } }
// The client calls this on project load to turn the stored gcs object
// paths into displayable URLs (and again right before export). Paths
// that can't be signed (not ai/, sign failure) are simply omitted from
// the result — the caller leaves a placeholder. Permissive CORS so a
// same-origin exported deck could refresh too; the bucket stays private
// and only ai/ paths are signable (see signGcsUrl), so this exposes
// nothing beyond the demo images it already generated.
app.options("/api/asset/sign", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(204);
});
app.post("/api/asset/sign", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (!gcsConfigured()) {
    return res.status(503).json({ error: "GCS not configured", urls: {} });
  }
  const paths = Array.isArray(req.body && req.body.paths) ? req.body.paths : [];
  // De-dupe and bound the batch so a bad caller can't ask for thousands.
  const unique = Array.from(new Set(paths.filter((p) => typeof p === "string"))).slice(0, 100);
  const urls = {};
  await Promise.all(unique.map(async (p) => {
    try { urls[p] = await signGcsUrl(p); }
    catch (_) { /* unsignable → omit; caller falls back to placeholder */ }
  }));
  return res.json({ urls });
});

// ── Real brand logo proxy ──────────────────────────────────────
// Query: ?domain=<bare domain, e.g. salesforce.com>
// Fetches the REAL brand logo/icon from a public service so the
// builder can use the genuine mark instead of an AI-invented one.
// Done server-side because these services aren't guaranteed to send
// CORS headers for a browser fetch; same-origin keeps it simple.
// Tries Clearbit (full transparent-PNG logo, when reachable) first,
// then DuckDuckGo's icon service (largest real favicon), then
// Google's favicon service at a high size — falling back through the
// list until one returns a real image. Streams the bytes back with
// the upstream mime type. On a complete miss the client falls back
// to AI generation.
app.get("/api/logo", async (req, res) => {
  const raw = typeof req.query.domain === "string" ? req.query.domain : "";
  // Normalize to a bare host: strip protocol, path, and a leading www.
  const domain = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ error: "a valid domain is required" });
  }

  const sources = [
    `https://logo.clearbit.com/${encodeURIComponent(domain)}?size=512`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
  ];

  for (const src of sources) {
    try {
      const upstream = await fetch(src, { redirect: "follow" });
      if (!upstream.ok) continue;
      const buf = Buffer.from(await upstream.arrayBuffer());
      // Skip trivially-blank / placeholder responses (a real icon is
      // comfortably larger than ~150 bytes; a 1px transparent gif is not).
      if (buf.length < 150) continue;
      const type = upstream.headers.get("content-type") || "image/png";
      if (!/^image\//i.test(type)) continue;
      res.set("Content-Type", type);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(buf);
    } catch (_) {
      // Try the next source.
    }
  }
  return res.status(404).json({ error: `No logo found for ${domain}` });
});

app.use(express.static(rootDir, { extensions: ["html"] }));

app.listen(port, () => {
  console.log(`Holodeck server listening on port ${port}`);
});
