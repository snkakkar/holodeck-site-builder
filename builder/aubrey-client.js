// ════════════════════════════════════════════════════════════════
//  AUBREY CLIENT — three-API wrapper for the Aubrey demo ecosystem
//
//  Surfaces three independent data sources, each driven by its own
//  API key. Keys live in a global localStorage repository under
//  "holodeck.aubrey.creds" (shared across all builder projects)
//  so they never ride along inside project state (and therefore
//  never appear in exported ZIPs / shared project JSON).
//
//  • DemoForge  — brand catalog (colors, logo, persona, industry)
//  • Scriptwriter — structured demo scripts (script_data.rows[])
//  • Pocket SIC — iframable CX scenes per channel
//
//  Every method returns a promise; failures throw with a friendly
//  message that the caller can pipe into toast()/alert UI.
// ════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  const CREDS_KEY = "holodeck.aubrey.creds";
  const CREDS_SCHEMA_VERSION = 1;

  const DEMOFORGE_BASE   = "https://demoforge.aubreydemo.com";
  const SCRIPTWRITER_BASE = "https://scriptwriter.aubreydemo.com";
  const POCKETSIC_BASE   = "https://pocketsic.aubreydemo.com";

  // ─── Credentials store ───────────────────────────────────────
  // Persisted separately from project state so keys never end up
  // inside an exported holodeck.config.js or shared JSON.
  function blankCreds() {
    return { email: "", demoforgeKey: "", scriptwriterKey: "", pocketsicKey: "" };
  }
  function sanitizeCreds(creds) {
    const safe = Object.assign(blankCreds(), creds || {});
    return {
      email: String(safe.email || ""),
      demoforgeKey: String(safe.demoforgeKey || ""),
      scriptwriterKey: String(safe.scriptwriterKey || ""),
      pocketsicKey: String(safe.pocketsicKey || ""),
    };
  }
  function readStoredCredEnvelope() {
    try {
      const raw = localStorage.getItem(CREDS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  function credsFromEnvelope(envelope) {
    if (!envelope) return blankCreds();
    // Legacy shape: plain creds object directly at top-level.
    if (envelope.email != null || envelope.demoforgeKey != null ||
        envelope.scriptwriterKey != null || envelope.pocketsicKey != null) {
      return sanitizeCreds(envelope);
    }
    // Versioned shape for future migration flexibility.
    if (envelope.version === CREDS_SCHEMA_VERSION && envelope.globalKeys) {
      return sanitizeCreds(envelope.globalKeys);
    }
    return blankCreds();
  }
  function writeCredEnvelope(creds) {
    const safe = sanitizeCreds(creds);
    const envelope = {
      version: CREDS_SCHEMA_VERSION,
      globalKeys: safe,
    };
    localStorage.setItem(CREDS_KEY, JSON.stringify(envelope));
    return safe;
  }
  function getGlobalKeys() {
    return credsFromEnvelope(readStoredCredEnvelope());
  }
  function setGlobalKeys(partialOrFull) {
    const merged = Object.assign(getGlobalKeys(), partialOrFull || {});
    return writeCredEnvelope(merged);
  }
  function clearGlobalKey(field) {
    if (!Object.prototype.hasOwnProperty.call(blankCreds(), field)) return getGlobalKeys();
    const next = getGlobalKeys();
    next[field] = "";
    return writeCredEnvelope(next);
  }
  function clearAllGlobalKeys() {
    return writeCredEnvelope(blankCreds());
  }
  function hasRequiredGlobalKey(service) {
    const creds = getGlobalKeys();
    const need = {
      demoforge:    { key: "demoforgeKey", needsEmail: true  },
      scriptwriter: { key: "scriptwriterKey", needsEmail: true  },
      pocketsic:    { key: "pocketsicKey", needsEmail: false },
    }[service];
    if (!need) return true;
    if (!creds[need.key]) return false;
    if (need.needsEmail && !creds.email) return false;
    return true;
  }

  // ─── Low-level fetch helper ──────────────────────────────────
  // Builds the request, tries to surface the API's own error text
  // when the response isn't JSON or returns an error envelope.
  // A "Failed to fetch" / TypeError out of fetch() in the browser
  // almost always means CORS — the API didn't return an
  // access-control-allow-origin header, so the browser dropped
  // the response. We re-label that case explicitly because the
  // raw "Failed to fetch" message tells the user nothing.
  function apiGet(url, key) {
    return fetch(url, { headers: { "X-API-Key": key } })
      .catch(function (err) {
        // Network-level / CORS-level failure — re-throw with a
        // message that points at the likely cause.
        const host = (function () { try { return new URL(url).host; } catch (_) { return url; } })();
        throw new Error(
          "Could not reach " + host + " — likely a CORS or network issue. " +
          "If the same curl request works from the terminal, the API may not be returning " +
          "access-control-allow-origin headers for browser calls. " +
          "(Underlying: " + (err && err.message || err) + ")"
        );
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
          if (!parsed) throw new Error("Unexpected non-JSON response — check the API key");
          return parsed;
        });
      });
  }

  function withEmail(url, email) {
    if (!email) return url;
    const sep = url.indexOf("?") >= 0 ? "&" : "?";
    return url + sep + "email=" + encodeURIComponent(email);
  }
  function currentAuthEmail() {
    const auth = window.HOLO_AUTH;
    const u = auth && auth.currentUser && auth.currentUser();
    return (u && u.email) ? String(u.email).trim().toLowerCase() : "";
  }
  function preferredEmail(opts) {
    return (opts && opts.email) || currentAuthEmail() || getGlobalKeys().email;
  }

  // ─── Shared-key proxy fetch (fallback path) ──────────────────
  // Same-origin GET to /api/aubrey/* — the server holds ONE shared
  // key per app and injects both the X-API-Key header and the
  // signed-in user's email (from the verified JWT). The browser sends
  // neither key nor email; it only carries the salesforce.com bearer
  // that gates every /api/* route (see server.js). Used when the SE
  // has NOT set a personal per-device key for that app; personal keys
  // still go straight to Aubrey via apiGet() above. Never mixes the
  // two: same shape out (parsed JSON / thrown .error) so callers don't
  // care which path ran.
  function authedApiGet(path) {
    const auth = window.HOLO_AUTH;
    // Ensure the auth session is hydrated from cookie first; this avoids false
    // "not signed in" errors when local auth state is stale but the browser
    // still has a valid session cookie.
    const initP = (auth && typeof auth.init === "function") ? auth.init().catch(function () { return null; }) : Promise.resolve(null);
    function cookieTokenFallback() {
      // Last resort: mint a bearer directly from the auth cookie session,
      // independent of local HOLO_AUTH in-memory user state.
      return fetch("/auth/token", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      }).then(function (res) {
        return res.text().then(function (body) {
          let json = null;
          try { json = body ? JSON.parse(body) : null; } catch (_) { json = null; }
          if (!res.ok) {
            const msg = (json && (json.error || json.message)) || ("HTTP " + res.status);
            return { token: null, error: "Auth token exchange failed: " + msg };
          }
          const token = json && (json.token || json.jwt) ? String(json.token || json.jwt) : "";
          if (!token) return { token: null, error: "Auth token exchange returned no token." };
          return { token: token, error: "" };
        });
      }).then(function (json) {
        if (!json || !json.token) return json || { token: null, error: "Auth token exchange returned an empty response." };
        return json;
      }).catch(function (err) {
        return { token: null, error: "Auth token exchange failed: " + ((err && err.message) || "network error") };
      });
    }
    return initP.then(function () {
      return (auth && typeof auth.authHeaders === "function") ? auth.authHeaders() : {};
    }).then(function (headers) {
      const h = Object.assign({ Accept: "application/json" }, headers || {});
      if (!h.Authorization && auth && typeof auth.getToken === "function") {
        return auth.getToken(true).then(function (jwt) {
          if (jwt) {
            h.Authorization = "Bearer " + jwt;
            return h;
          }
          return cookieTokenFallback().then(function (fallback) {
            if (!fallback || !fallback.token) {
              throw new Error((fallback && fallback.error) || "Sign in to pull from Aubrey.");
            }
            h.Authorization = "Bearer " + fallback.token;
            return h;
          });
        });
      }
      if (!h.Authorization) {
        return cookieTokenFallback().then(function (fallback) {
          if (!fallback || !fallback.token) {
            throw new Error((fallback && fallback.error) || "Sign in to pull from Aubrey.");
          }
          h.Authorization = "Bearer " + fallback.token;
          return h;
        });
      }
      return h;
    }).then(function (h) {
      return fetch(path, { headers: h, credentials: "include" }).then(function (res) {
        return res.text().then(function (body) {
          let parsed;
          try { parsed = JSON.parse(body); } catch (_) { parsed = null; }
          if (!res.ok) {
            const msg = (parsed && parsed.error) || ("HTTP " + res.status);
            throw new Error(msg);
          }
          if (parsed && parsed.error) throw new Error(parsed.error);
          if (!parsed) throw new Error("Unexpected non-JSON response from the Aubrey proxy.");
          return parsed;
        });
      });
    });
  }

  // ─── DemoForge ───────────────────────────────────────────────
  // /api/brands and /api/brands/{id} both require ?email= in
  // addition to the X-API-Key header (the example as documented
  // returns "Email required" without it).
  function demoforgeListBrands(opts) {
    const email = preferredEmail(opts);
    const key = opts && opts.key;
    if (!key) return Promise.reject(new Error("DemoForge API key not set"));
    if (!email) return Promise.reject(new Error("Email is required for DemoForge"));
    return apiGet(withEmail(DEMOFORGE_BASE + "/api/brands", email), key)
      .then(function (d) { return d.brands || []; });
  }
  function demoforgeGetBrand(id, opts) {
    const email = preferredEmail(opts);
    const key = opts && opts.key;
    if (!key) return Promise.reject(new Error("DemoForge API key not set"));
    if (!email) return Promise.reject(new Error("Email is required for DemoForge"));
    return apiGet(withEmail(DEMOFORGE_BASE + "/api/brands/" + encodeURIComponent(id), email), key)
      .then(function (d) {
        // Returns { brand, generations: [{ app_slug, remote_id, result_url, status }] }
        return { brand: d.brand || null, generations: d.generations || [] };
      });
  }

  // ─── Scriptwriter ────────────────────────────────────────────
  // Both list and detail require ?email= alongside the X-API-Key.
  function scriptwriterListScripts(opts) {
    const email = preferredEmail(opts);
    const key = opts && opts.key;
    // No personal key → fall back to the shared server proxy (server
    // supplies the key + the signed-in email). Personal key → direct.
    if (!key) return authedApiGet("/api/aubrey/scriptwriter/scripts").then(function (d) { return d.scripts || []; });
    if (!email) return Promise.reject(new Error("Email is required for Scriptwriter"));
    return apiGet(withEmail(SCRIPTWRITER_BASE + "/api/scripts", email), key)
      .then(function (d) { return d.scripts || []; });
  }
  function scriptwriterGetScript(id, opts) {
    const email = preferredEmail(opts);
    const key = opts && opts.key;
    if (!key) return authedApiGet("/api/aubrey/scriptwriter/scripts/" + encodeURIComponent(id)).then(function (d) { return d.script || null; });
    if (!email) return Promise.reject(new Error("Email is required for Scriptwriter"));
    return apiGet(withEmail(SCRIPTWRITER_BASE + "/api/scripts/" + encodeURIComponent(id), email), key)
      .then(function (d) { return d.script || null; });
  }

  // ─── Pocket SIC ──────────────────────────────────────────────
  // PocketSIC supports key-only calls, but we still pass ?email= when available
  // so pulls are scoped to the current signed-in/entered user consistently.
  function pocketsicListProjects(opts) {
    const key = opts && opts.key;
    const email = preferredEmail(opts);
    // No personal key → shared server proxy (server injects the key +
    // signed-in email). Personal key → direct call as before.
    if (!key) return authedApiGet("/api/aubrey/pocketsic/projects").then(function (d) { return d.projects || []; });
    return apiGet(withEmail(POCKETSIC_BASE + "/api/projects", email), key)
      .then(function (d) { return d.projects || []; });
  }
  function pocketsicGetScenes(projectId, opts) {
    const key = opts && opts.key;
    const email = preferredEmail(opts);
    if (!key) return authedApiGet("/api/aubrey/pocketsic/projects/" + encodeURIComponent(projectId) + "/scenes").then(function (d) { return d.scenes || []; });
    return apiGet(withEmail(POCKETSIC_BASE + "/api/projects/" + encodeURIComponent(projectId) + "/scenes", email), key)
      .then(function (d) { return d.scenes || []; });
  }

  // Public iframable scene URL — verified no X-Frame-Options /
  // CSP frame-ancestors restriction at discovery time.
  function pocketsicSceneUrl(sceneId) {
    return POCKETSIC_BASE + "/scene/" + encodeURIComponent(sceneId);
  }

  // ─── Brand Kit Builder (proxy-only) ──────────────────────────
  // Brand Kit has no per-device key path in the UI — it's a new,
  // shared-key-only integration. Both calls go through the server
  // proxy, which supplies the key (if any) + the signed-in email.
  // Pulls fill colors + logo only; fonts are intentionally skipped.
  function brandkitListItems() {
    return authedApiGet("/api/aubrey/brandkit/items").then(function (d) { return d.items || []; });
  }
  function brandkitGetItem(id) {
    return authedApiGet("/api/aubrey/brandkit/items/" + encodeURIComponent(id)).then(function (d) { return d.item || null; });
  }
  // Normalize a Brand Kit item into the brand fields the builder uses.
  // Field names are tolerant of a few likely shapes (color_primary vs
  // primary_color vs primaryColor) since the live response shape is
  // being finalized. Fonts are deliberately excluded.
  function brandKitToBrandFields(item) {
    if (!item) return {};
    const pick = function () {
      for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i];
        if (v != null && v !== "") return v;
      }
      return "";
    };
    return {
      primaryColor:   pick(item.color_primary, item.primary_color, item.primaryColor),
      secondaryColor: pick(item.color_secondary, item.secondary_color, item.secondaryColor),
      accentColor:    pick(item.color_accent, item.accent_color, item.accentColor),
      logoUrl:        pick(item.logo_url, item.logoUrl, item.logo),
      customerName:   pick(item.brand_name, item.name, item.customerName),
    };
  }

  // Server availability probe for the shared-key path — public,
  // returns { pocketsic, scriptwriter, brandkit } booleans. Cached so
  // the UI can poll it freely. Never rejects (treats failure as "no
  // shared path available"). Callers still gate on HOLO_AUTH for auth.
  let _proxyStatusPromise = null;
  function proxyStatus() {
    if (_proxyStatusPromise) return _proxyStatusPromise;
    _proxyStatusPromise = fetch("/api/aubrey/status", { headers: { Accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (s) { return s || {}; })
      .catch(function () { return {}; });
    return _proxyStatusPromise;
  }

  // ─── Image inlining ──────────────────────────────────────────
  // Mirrors the FileReader.readAsDataURL flow used by the manual
  // logo / asset pickers in builder.js. The result is a self-
  // contained data: URL so exported ZIPs work offline regardless
  // of the R2 bucket staying online.
  // `headers` (optional) is merged into the request — used by callers
  // hitting a same-origin /api/* route that now requires the salesforce.com
  // bearer (e.g. /api/logo). External image URLs pass no headers.
  function inlineImageAsDataUrl(url, headers) {
    if (!url) return Promise.resolve("");
    if (/^data:/i.test(url)) return Promise.resolve(url);
    return fetch(url, { mode: "cors", headers: headers || {} })
      .then(function (res) {
        if (!res.ok) throw new Error("Image fetch failed: HTTP " + res.status);
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          const reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result || "")); };
          reader.onerror = function () { reject(new Error("Could not read image")); };
          reader.readAsDataURL(blob);
        });
      });
  }

  // ─── Script renderer ─────────────────────────────────────────
  // Turns a Scriptwriter script_data.rows[] structure into the
  // Synopsis / CX Summary / Persona Description / numbered-step
  // text shape that HOLO_PARSER.parseDemoScript was designed for.
  // The parser keys off "Script Synopsis:", "CX Summary:",
  // "Persona Description:", and numbered list items — so we
  // emit exactly those headers.
  function renderScriptRows(script) {
    if (!script) return "";
    const data = script.script_data || {};
    const rows = data.rows || [];
    const lines = [];

    // Use the script's own meta when present, otherwise fall back
    // to script_data's copies — Scriptwriter populates both.
    const synopsis = script.synopsis || data.synopsis || "";
    const cxSummary = script.cx_summary || data.cx_summary || "";
    const personaSummary = script.persona_summary || data.persona_summary || script.persona || "";

    if (synopsis)        lines.push("Script Synopsis: " + synopsis, "");
    if (cxSummary)       lines.push("CX Summary: " + cxSummary, "");
    if (personaSummary)  lines.push("Persona Description: " + personaSummary, "");

    rows.forEach(function (r) {
      if (!r) return;
      if (r.type === "section") {
        lines.push("", String(r.text || "").trim(), "");
      } else if (r.type === "chapter") {
        lines.push(String(r.text || "").trim());
      } else if (r.type === "channel") {
        lines.push("  " + String(r.text || "").trim());
      } else if (r.type === "script") {
        const num = r.num != null ? (r.num + ". ") : "";
        const talk = String(r.talk || "").trim();
        if (!talk) return;
        const meta = [];
        if (r.device) meta.push("device: " + r.device);
        if (r.visual) meta.push("visual: " + r.visual);
        if (r.click)  meta.push("click: " + String(r.click).replace(/\s+/g, " ").trim());
        const suffix = meta.length ? "    [" + meta.join(" · ") + "]" : "";
        lines.push("    " + num + talk + suffix);
      }
    });

    return lines.join("\n").trim();
  }

  // ─── Pocket SIC scene → CX component shape ───────────────────
  // Maps the channel taxonomy onto the type / deviceFrame fields
  // the existing builder.js cxComponents[] entries use, so the
  // downstream holodeck-adapter routing (instagramAd / agenticSms /
  // shopperAgent) lights up automatically.
  // Every live CX component DEFAULTS to the mobile/phone frame; the SE can still
  // override per component via the "Device frame" dropdown in Step 5.
  const CHANNEL_TO_CX = {
    site:        { type: "commerce", deviceFrame: "mobile" },
    retailcloud: { type: "service",  deviceFrame: "mobile" },
    imessage:    { type: "agent",    deviceFrame: "mobile" },
    insta:       { type: "ad",       deviceFrame: "mobile" },
  };
  function sceneToCxComponent(scene) {
    const fallback = { type: "web", deviceFrame: "mobile" };
    const map = CHANNEL_TO_CX[scene.channel] || fallback;
    return {
      // id is added by the caller via uid("cx_") so it stays
      // consistent with the manual + Add path.
      name: scene.name || ("Scene " + scene.id),
      url: pocketsicSceneUrl(scene.id),
      type: map.type,
      sectionId: "demo",
      linkedStoryActIds: [],
      linkedSlideIds: [],
      deviceFrame: map.deviceFrame,
      iframeAllowed: true,
      fallbackMode: "link-card",
      status: "ready",
      notes: "Pulled from Pocket SIC project " + (scene.project_id || "?") +
             " (channel: " + (scene.channel || "?") + ")",
      _aubreyChannel: scene.channel || "",
      _aubreySceneId: scene.id,
    };
  }

  // Look at an array of scenes and return the first hero image we
  // find on a `site` channel scene. Used for productHero seeding.
  function pickProductHeroImage(scenes) {
    if (!Array.isArray(scenes)) return "";
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (!s || s.channel !== "site") continue;
      const heroes = s.config && s.config.content && s.config.content.site && s.config.content.site.heroImages;
      if (heroes && heroes.length) return heroes[0];
    }
    return "";
  }

  // ─── Public surface ──────────────────────────────────────────
  window.HOLO_AUBREY = {
    creds: { load: getGlobalKeys, save: setGlobalKeys, blank: blankCreds },
    globalKeys: {
      get: getGlobalKeys,
      set: setGlobalKeys,
      clear: clearGlobalKey,
      clearAll: clearAllGlobalKeys,
      hasRequired: hasRequiredGlobalKey,
      blank: blankCreds,
    },
    demoforge: {
      listBrands: demoforgeListBrands,
      getBrand: demoforgeGetBrand,
    },
    scriptwriter: {
      listScripts: scriptwriterListScripts,
      getScript: scriptwriterGetScript,
    },
    pocketsic: {
      listProjects: pocketsicListProjects,
      getScenes: pocketsicGetScenes,
      sceneUrl: pocketsicSceneUrl,
    },
    brandkit: {
      listItems: brandkitListItems,
      getItem: brandkitGetItem,
    },
    brandKitToBrandFields: brandKitToBrandFields,
    proxyStatus: proxyStatus,
    inlineImageAsDataUrl: inlineImageAsDataUrl,
    renderScriptRows: renderScriptRows,
    sceneToCxComponent: sceneToCxComponent,
    pickProductHeroImage: pickProductHeroImage,
  };
})();
