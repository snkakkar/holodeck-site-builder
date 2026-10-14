// ════════════════════════════════════════════════════════════════
//  load-check.mjs — mock-Gemini load test for the generate proxy.
//
//  Starts a server (default ./server.js, or argv[2]) pointed at a local mock
//  Gemini via GEMINI_BASE_URL, then simulates N users (default 20) each
//  issuing a Retail-CAB-shaped burst: 3 waves of 18 concurrent image calls +
//  6 text calls. Raw HTTP is used (no client retry) so every 429 our own
//  caps hand out is counted.
//
//    node test/load-check.mjs                 # phase 1 (healthy upstream) + phase 2 (saturated)
//    node test/load-check.mjs ./baseline.js   # same, against another server file
//
//  Exits non-zero if the targeted server hands out cap 429s, drops a build,
//  exceeds its configured image concurrency, or fails to adapt/recover.
// ════════════════════════════════════════════════════════════════
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { SignJWT } from "jose";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = resolve(ROOT, process.argv[2] || "server.js");
const USERS = Number(process.env.LOAD_USERS || 20);
const IMG_LATENCY = Number(process.env.MOCK_IMG_MS || 600);
const TXT_LATENCY = Number(process.env.MOCK_TXT_MS || 300);
const SERVER_PORT = 4900 + Math.floor(Math.random() * 90);
const MOCK_PORT = SERVER_PORT + 100;
const SECRET = "load-test-secret";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ── mock Gemini ────────────────────────────────────────────────
let mockCap = Infinity; // concurrent calls above this get a 429
const mock = { active: 0, peak: 0, served: 0, rejected: 0 };
const mockServer = http.createServer((req, res) => {
  req.resume();
  const isImg = /:generateContent/.test(req.url);
  if (mock.active >= mockCap) {
    mock.rejected++;
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "1" });
    return res.end(JSON.stringify({ error: { message: "quota" } }));
  }
  mock.active++; mock.peak = Math.max(mock.peak, mock.active);
  setTimeout(() => {
    mock.active--; mock.served++;
    if (isImg) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG } }] } }] }));
    } else {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] })}\n\n`);
    }
  }, isImg ? IMG_LATENCY : TXT_LATENCY);
});

// ── client helpers ─────────────────────────────────────────────
async function token(i) {
  return new SignJWT({ email: `user${i}@salesforce.com` })
    .setProtectedHeader({ alg: "HS256" }).setSubject(`user-${i}`)
    .setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
}
const stats = { cap429: 0, other429: 0, ok: 0, errLines: 0, httpErr: 0 };
async function call(path, jwt, prompt) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${SERVER_PORT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ prompt }),
    });
  } catch (_) { stats.httpErr++; return false; }
  if (res.status === 429) {
    let code = "";
    try { code = (await res.json()).code || ""; } catch (_) {}
    if (code === "RATE_LIMIT" || code === "INFLIGHT_CAP" || !code) stats.cap429++; else stats.other429++;
    return false;
  }
  if (!res.ok) { stats.httpErr++; return false; }
  const body = await res.text();
  const lines = body.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const last = lines[lines.length - 1];
  if (last && last.type === "done") { stats.ok++; return true; }
  if (last && last.type === "image") { stats.ok++; return true; }
  stats.errLines++; return false;
}
// One user's build: 3 waves, each 18 concurrent images + 2 text.
async function build(i, jwt) {
  let bad = 0;
  for (let w = 0; w < 3; w++) {
    const jobs = [];
    for (let k = 0; k < 18; k++) jobs.push(call("/api/gemini/generate-image", jwt, `img ${i}.${w}.${k}`));
    for (let k = 0; k < 2; k++) jobs.push(call("/api/gemini/generate", jwt, `txt ${i}.${w}.${k}`));
    (await Promise.all(jobs)).forEach((ok) => { if (!ok) bad++; });
  }
  return bad;
}
async function status() { return (await fetch(`http://127.0.0.1:${SERVER_PORT}/api/gemini/status`)).json(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── run ────────────────────────────────────────────────────────
const checks = [];
const check = (name, ok, detail) => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

await new Promise((r) => mockServer.listen(MOCK_PORT, r));
const child = spawn(process.execPath, [SERVER], {
  cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(SERVER_PORT), JWT_SECRET: SECRET, GEMINI_API_KEY: "test",
    GEMINI_BASE_URL: `http://127.0.0.1:${MOCK_PORT}` },
});
let logs = "";
child.stdout.on("data", (d) => { logs += d; });
child.stderr.on("data", (d) => { logs += d; });
for (let i = 0; i < 50; i++) { try { await status(); break; } catch (_) { await sleep(200); } }

try {
  const s0 = await status();
  const maxImg = s0.load.image.limit;
  console.log(`server: ${SERVER}\nconfigured image limit=${maxImg} text limit=${s0.load.text.limit}; users=${USERS}`);
  const jwts = await Promise.all(Array.from({ length: USERS }, (_, i) => token(i)));

  // Phase 1 — healthy upstream: no cap 429s, every build completes.
  let t = Date.now();
  const bad1 = (await Promise.all(jwts.map((j, i) => build(i, j)))).reduce((a, b) => a + b, 0);
  console.log(`phase 1: ${Math.round((Date.now() - t) / 1000)}s, mock peak=${mock.peak}, ok=${stats.ok}, cap429=${stats.cap429}, errLines=${stats.errLines}`);
  check("phase 1: zero 429s from our own caps", stats.cap429 === 0, `${stats.cap429} cap 429s`);
  check("phase 1: all calls completed", bad1 === 0, `${bad1} failed of ${USERS * 60}`);
  check("phase 1: upstream concurrency <= configured image+text limits", mock.peak <= maxImg + s0.load.text.limit, `peak ${mock.peak}`);

  // Phase 2 — saturated upstream: mock 429s above 8 concurrent.
  Object.assign(stats, { cap429: 0, other429: 0, ok: 0, errLines: 0, httpErr: 0 });
  mockCap = 8; mock.peak = 0;
  const minSeen = { v: maxImg };
  const poll = setInterval(() => status().then((s) => { if (s.load.image.limit < minSeen.v) minSeen.v = s.load.image.limit; }).catch(() => {}), 300);
  t = Date.now();
  const half = jwts.slice(0, Math.min(6, USERS));
  const bad2 = (await Promise.all(half.map((j, i) => build(i, j)))).reduce((a, b) => a + b, 0);
  clearInterval(poll);
  console.log(`phase 2: ${Math.round((Date.now() - t) / 1000)}s, mock rejected=${mock.rejected}, min image limit seen=${minSeen.v}, errLines=${stats.errLines}`);
  check("phase 2: adaptive limit dropped under upstream 429s", minSeen.v < maxImg, `min ${minSeen.v} of ${maxImg}`);
  check("phase 2: no cap 429s while backing off", stats.cap429 === 0, `${stats.cap429}`);

  // Phase 3 — upstream healthy again: limit climbs back.
  mockCap = Infinity;
  for (let round = 0; round < 40; round++) {
    await Promise.all(Array.from({ length: 8 }, () => call("/api/gemini/generate-image", jwts[0], "recover")));
    if ((await status()).load.image.limit >= maxImg) break;
  }
  const s3 = await status();
  check("phase 3: image limit recovered to configured max", s3.load.image.limit === maxImg, `${s3.load.image.limit}/${maxImg}`);
} finally {
  child.kill();
  mockServer.close();
}
console.log(checks.every(Boolean) ? "\nALL PASS" : "\nFAILURES");
process.exit(checks.every(Boolean) ? 0 : 1);
