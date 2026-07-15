// ════════════════════════════════════════════════════════════════
//  google-slides-exporter.js — HOLO_GSLIDES
//
//  Creates a real Google Slides deck in the signed-in user's own
//  Google Drive from the normalized export model
//  (HOLO_EXPORT_MODEL.buildExportModel). Unlike the PPTX/PDF exporters
//  (which render entirely in the browser), Slides is created by the
//  Google Slides API server-side, so this module builds a JSON-safe
//  model and POSTs it to /api/slides/create; server.js drives the API
//  with the user's OAuth token and returns a shareable presentation URL.
//
//  Same words + brand + images + order as the PPTX export (honors the
//  Step-5 selection + reorder via the shared manifest). Images are sent
//  as their signed GCS URL (ns.image.url) — the Slides API can't embed
//  base64 data URLs, and the URL keeps the POST body small.
//
//  Public: HOLO_GSLIDES.createDeckGoogleSlides(state) → Promise<{presentationUrl}>
//
//  Depends on: window.HOLO_EXPORT_MODEL, window.HOLO_AUTH.
// ════════════════════════════════════════════════════════════════

(function (global) {
  "use strict";

  const MODEL = global.HOLO_EXPORT_MODEL || {};
  const CREATE_URL = "/api/slides/create";
  const STATUS_URL = "/api/slides/status";

  function authHeaders() {
    const auth = global.HOLO_AUTH;
    return auth && auth.authHeaders ? auth.authHeaders() : Promise.resolve({});
  }

  // Availability probe (mirrors HOLO_GEMINI status) — lets the UI decide
  // whether to offer the button. Never rejects.
  function status() {
    return fetch(STATUS_URL, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : { available: false }; })
      .catch(function () { return { available: false }; });
  }

  // Trim the full normalized model to the JSON the server needs. Drop the
  // heavy image.dataUrl (base64) and keep only image.url + dimensions.
  function toPayload(model) {
    const slides = (model.slides || []).map(function (ns) {
      const out = {
        template: ns.template, layout: ns.layout, sectionId: ns.sectionId,
        title: ns.title, eyebrow: ns.eyebrow, sub: ns.sub,
        bullets: ns.bullets || [], metrics: ns.metrics || [], chat: ns.chat || [],
        facets: ns.facets || [], quote: ns.quote || "",
        speakerNotes: ns.speakerNotes || "",
        cxFallback: ns.cxFallback || null,
        image: null,
      };
      if (ns.image && ns.image.url) {
        out.image = { url: ns.image.url, w: ns.image.w || 0, h: ns.image.h || 0, kind: ns.image.kind || "image" };
      }
      return out;
    });
    return { meta: model.meta || {}, brand: model.brand || {}, slides: slides };
  }

  // ─── Public entry ──────────────────────────────────────────────
  function createDeckGoogleSlides(state) {
    if (!MODEL.buildExportModel) {
      return Promise.reject(new Error("Export model unavailable (export-model.js not loaded)."));
    }
    return MODEL.buildExportModel(state).then(function (model) {
      const payload = toPayload(model);
      if (!payload.slides.length) throw new Error("No slides selected to export.");
      return authHeaders().then(function (auth) {
        return fetch(CREATE_URL, {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, auth),
          body: JSON.stringify(payload),
        });
      }).then(handleResponse);
    });
  }

  function handleResponse(res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (res.status === 409 && data && data.auth_required && data.authUrl) {
        // First-time consent: open Google's OAuth screen in a new tab and
        // ask the user to click Create again once they've authorized.
        try { global.open(data.authUrl, "_blank", "noopener"); } catch (_) {}
        const err = new Error("Google authorization needed — a consent tab opened. After you click Allow, press “Create Google Slides” again.");
        err.authRequired = true;
        throw err;
      }
      if (!res.ok) {
        throw new Error((data && data.error) || ("Google Slides export failed (HTTP " + res.status + ")."));
      }
      if (data && data.presentationUrl) {
        // Success — open the finished deck in a new tab.
        try { global.open(data.presentationUrl, "_blank", "noopener"); } catch (_) {}
      }
      return data;
    });
  }

  global.HOLO_GSLIDES = {
    createDeckGoogleSlides: createDeckGoogleSlides,
    status: status,
    toPayload: toPayload, // exposed for tests
  };
})(typeof window !== "undefined" ? window : this);
