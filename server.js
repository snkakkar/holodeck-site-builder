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
  });
});

// ── Gemini: text/JSON generation ───────────────────────────────
// Body: { prompt: string, schema?: object, model?: string }
// When `schema` is present we ask Gemini for application/json and
// pass the schema through as responseSchema so the model returns a
// single valid JSON object. We return { text } — the raw model text
// — and let the caller parse/validate (the builder reuses its
// existing import validator).
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

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (Object.keys(generationConfig).length) payload.generationConfig = generationConfig;

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
      return res.status(502).json({ error: msg });
    }

    // Flatten the first candidate's text parts into one string.
    const cand = parsed && parsed.candidates && parsed.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const text = parts.map((p) => (p && p.text) || "").join("");
    if (!text) {
      const finish = cand && cand.finishReason ? ` (finishReason: ${cand.finishReason})` : "";
      return res.status(502).json({ error: `Gemini returned no text${finish}` });
    }
    return res.json({ text, model });
  } catch (err) {
    return res.status(502).json({ error: `Could not reach Gemini: ${(err && err.message) || err}` });
  }
});

// ── Gemini: image generation ───────────────────────────────────
// Body: { prompt: string, model?: string }
// The image model returns the picture as an inlineData part (base64)
// rather than text, so we can't reuse /generate (which flattens text
// parts only). We pull the first inlineData part and hand the browser
// a ready-to-use data: URL, which drops straight into the builder's
// assetLibrary slots (same shape the manual uploader produces).
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
      return res.status(502).json({ error: msg });
    }

    // Find the first inlineData part in the first candidate.
    const cand = parsed && parsed.candidates && parsed.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const imgPart = parts.filter((p) => p && p.inlineData && p.inlineData.data)[0];
    if (!imgPart) {
      const finish = cand && cand.finishReason ? ` (finishReason: ${cand.finishReason})` : "";
      // Surface any text the model returned instead of an image — it
      // often explains a safety block or refusal.
      const note = parts.map((p) => (p && p.text) || "").join("").trim();
      return res.status(502).json({
        error: `Gemini returned no image${finish}${note ? ": " + note.slice(0, 200) : ""}`,
      });
    }
    const mime = imgPart.inlineData.mimeType || "image/png";
    const dataUrl = `data:${mime};base64,${imgPart.inlineData.data}`;
    return res.json({ dataUrl, model });
  } catch (err) {
    return res.status(502).json({ error: `Could not reach Gemini: ${(err && err.message) || err}` });
  }
});

app.use(express.static(rootDir, { extensions: ["html"] }));

app.listen(port, () => {
  console.log(`Holodeck server listening on port ${port}`);
});
