import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const port = Number(process.env.E2E_PORT ?? 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const testUserId = process.env.E2E_TEST_USER_ID?.trim() || `e2e_${crypto.randomUUID().replaceAll("-", "")}`;
const required = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "YOUCAM_API_KEY", "CLERK_SECRET_KEY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing live E2E configuration: ${missing.join(", ")}`);

const results = [];
const created = { storeId: null, itemId: null, storagePaths: [] };
let server;

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  process.stdout.write(`${status === "PASS" ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}\n`);
}

async function jsonRequest(path, init = {}, expected = [200]) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!expected.includes(response.status)) {
    const safe = typeof body === "object" && body ? JSON.stringify(body) : String(body).slice(0, 300);
    throw new Error(`${init.method ?? "GET"} ${path} returned ${response.status}: ${safe}`);
  }
  return { response, body };
}

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js did not become ready within 90 seconds.");
}

async function validateProviderKeys() {
  const clerk = await fetch("https://api.clerk.com/v1/users?limit=1", {
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  });
  if (!clerk.ok) throw new Error(`Clerk key check returned ${clerk.status}`);
  record("Clerk Backend API key", "PASS", `HTTP ${clerk.status}`);

  const supabase = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/stores?select=id&limit=1`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
  });
  if (!supabase.ok) throw new Error(`Supabase key/schema check returned ${supabase.status}: ${(await supabase.text()).slice(0, 200)}`);
  record("Supabase Data API key and schema", "PASS", `HTTP ${supabase.status}`);
}

async function poll(path, getStatus, terminal, timeoutMs, intervalMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = (await jsonRequest(path)).body;
    const status = getStatus(last);
    if (terminal.includes(status)) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${path} did not finish; last response: ${JSON.stringify(last)}`);
}

async function cleanup() {
  const url = process.env.SUPABASE_URL.replace(/\/$/, "");
  const headers = { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" };
  for (const [bucket, paths] of [["catalog", created.storagePaths.filter((entry) => entry.bucket === "catalog").map((entry) => entry.path)], ["private-buyer", created.storagePaths.filter((entry) => entry.bucket === "private-buyer").map((entry) => entry.path)]]) {
    if (paths.length) await fetch(`${url}/storage/v1/object/${bucket}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: paths }) }).catch(() => undefined);
  }
  if (created.storeId) {
    await fetch(`${url}/rest/v1/stores?id=eq.${encodeURIComponent(created.storeId)}`, { method: "DELETE", headers }).catch(() => undefined);
  }
}

async function run() {
  await validateProviderKeys();
  server = spawn(process.execPath, ["--env-file=.env", "apps/web/node_modules/next/dist/bin/next", "dev", "apps/web", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, E2E_TEST_USER_ID: testUserId, NEXT_PUBLIC_SITE_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverError = "";
  server.stderr.on("data", (chunk) => { serverError += String(chunk).slice(0, 2000); });
  await waitForServer();

  const storeName = `RackStage E2E ${Date.now()}`;
  const slug = `rackstage-e2e-${Date.now()}`;
  const storeCreate = await jsonRequest("/api/stores", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: storeName, slug, brand_color: "#224466", pickup_instructions: "E2E test only" }),
  }, [201]);
  created.storeId = storeCreate.body.store.id;
  record("POST /api/stores", "PASS", "created seller store through local E2E identity");

  const stores = await jsonRequest("/api/stores");
  if (!stores.body.stores.some((store) => store.id === created.storeId)) throw new Error("Created store missing from GET /api/stores");
  record("GET /api/stores", "PASS");

  await jsonRequest(`/api/stores/${encodeURIComponent(slug)}/public-link`);
  record("GET /api/stores/:slug/public-link", "PASS");

  const garment = await readFile("youcam-lowerbody-test/inputs/trousers_met_cc0.jpg");
  const draftForm = new FormData();
  draftForm.set("original", new Blob([garment], { type: "image/jpeg" }), "trousers.jpg");
  draftForm.set("store_id", created.storeId);
  draftForm.set("category", "pants");
  draftForm.set("size", "M");
  draftForm.set("brand", "E2E Brand");
  draftForm.set("condition", "Excellent");
  draftForm.set("price", "25.00");
  draftForm.set("request_token", crypto.randomUUID());
  const draft = await jsonRequest("/api/items/create-draft", { method: "POST", body: draftForm }, [201]);
  created.itemId = draft.body.item.id;
  if (draft.body.error) throw new Error(`YouCam background-removal creation failed: ${JSON.stringify(draft.body.error)}`);
  record("POST /api/items/create-draft", "PASS", "real image uploaded and YouCam task created");

  const processStart = await jsonRequest(`/api/seller/items/${created.itemId}/process`, { method: "POST" });
  record("POST /api/seller/items/:id/process", "PASS", `status ${processStart.body.job.status}`);
  const jobId = processStart.body.job.id;
  const processed = await poll(`/api/seller/items/${created.itemId}/process/${jobId}`, (body) => body.job.status, ["succeeded", "failed"], 180_000);
  if (processed.job.status !== "succeeded" || !processed.catalog_image_ready) throw new Error(`Background removal failed: ${JSON.stringify(processed.job)}`);
  record("GET /api/seller/items/:id/process/:jobId", "PASS", "real YouCam background removal succeeded");

  await jsonRequest(`/api/items/${created.itemId}`);
  record("GET /api/items/:id", "PASS");
  await jsonRequest(`/api/items/${created.itemId}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "pants", size: "M", brand: "E2E Brand", condition: "Excellent", price: 25 }),
  });
  record("POST /api/items/:id/publish", "PASS");

  const person = await readFile("youcam-lowerbody-test/inputs/person_youcam_sample.png");
  const tryOnForm = new FormData();
  tryOnForm.set("photo", new Blob([person], { type: "image/png" }), "person.png");
  const tryOn = await jsonRequest(`/api/items/${created.itemId}/try-on`, { method: "POST", body: tryOnForm }, [201]);
  const sessionId = tryOn.body.session.id;
  if (tryOn.body.error) throw new Error(`YouCam VTO creation failed: ${JSON.stringify(tryOn.body.error)}`);
  record("POST /api/items/:id/try-on", "PASS", "real files uploaded and YouCam V3 task created");
  const session = await poll(`/api/items/${created.itemId}/try-on/${sessionId}`, (body) => body.session.status, ["succeeded", "failed", "expired"], 240_000);
  if (session.session.status !== "succeeded" || !session.session.result_url) throw new Error(`Virtual try-on failed: ${JSON.stringify(session.session)}`);
  record("GET /api/items/:id/try-on/:sessionId", "PASS", "real YouCam V3 result persisted to private storage");

  const reservation = await jsonRequest(`/api/items/${created.itemId}/reserve`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyer_name: "E2E Buyer", buyer_contact: "e2e@example.invalid", request_token: crypto.randomUUID() }),
  }, [201]);
  if (reservation.body.item.status !== "reserved") throw new Error("Reservation response did not mark item reserved");
  record("POST /api/items/:id/reserve", "PASS", "atomic Supabase RPC succeeded");

  const url = process.env.SUPABASE_URL.replace(/\/$/, "");
  const headers = { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
  const media = await fetch(`${url}/rest/v1/item_images?item_id=eq.${created.itemId}&select=storage_path`, { headers }).then((response) => response.json());
  for (const entry of media) created.storagePaths.push({ bucket: "catalog", path: entry.storage_path });
  const sessions = await fetch(`${url}/rest/v1/try_on_sessions?item_id=eq.${created.itemId}&select=source_storage_path,result_storage_path`, { headers }).then((response) => response.json());
  for (const entry of sessions) for (const path of [entry.source_storage_path, entry.result_storage_path]) if (path) created.storagePaths.push({ bucket: "private-buyer", path });
}

try {
  await run();
  process.stdout.write(`\nLive E2E passed: ${results.length}/${results.length} checks.\n`);
} catch (error) {
  record("Live E2E suite", "FAIL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await cleanup();
  if (server && !server.killed) server.kill();
}
