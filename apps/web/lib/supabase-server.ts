import "server-only";

import type { ItemImageRecord, ItemRecord, ItemState, ProcessingJobRecord, StoreRecord, TryOnSessionRecord } from "./types";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const secret = process.env.SUPABASE_SECRET_KEY;

export class DatabaseError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "DatabaseError";
    this.status = status;
    this.details = details;
  }
}

function requireSupabase() {
  if (!url || !secret) throw new DatabaseError("RackStage database is not configured.", 503);
  return { url, secret };
}

/** Match the headers emitted by the Supabase server client for Data API and Storage calls. */
function serviceHeaders(key: string, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

type QueryOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
  prefer?: string;
};

export async function supabaseRest<T>(path: string, options: QueryOptions = {}): Promise<T> {
  const config = requireSupabase();
  const extraHeaders = options.headers ? Object.fromEntries(new Headers(options.headers).entries()) : {};
  const response = await fetch(`${config.url}/rest/v1/${path.replace(/^\//, "")}`, {
    method: options.method ?? "GET",
    headers: serviceHeaders(config.secret, {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...extraHeaders,
    }),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message = typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message: unknown }).message) : "Database request failed.";
    throw new DatabaseError(message, response.status, parsed);
  }
  return parsed as T;
}

export async function storageUpload(bucket: string, path: string, body: Buffer | Uint8Array, contentType: string) {
  const config = requireSupabase();
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: serviceHeaders(config.secret, {
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "31536000",
    }),
    body: body as unknown as BodyInit,
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new DatabaseError("Could not save the image to storage.", response.status, text.slice(0, 500));
  }
}

export async function storageDownload(bucket: string, path: string): Promise<Buffer> {
  const config = requireSupabase();
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    headers: serviceHeaders(config.secret),
    cache: "no-store",
  });
  if (!response.ok) throw new DatabaseError("Could not read the image from storage.", response.status);
  return Buffer.from(await response.arrayBuffer());
}

export async function storageDelete(bucket: string, paths: string[]) {
  if (!paths.length) return;
  const config = requireSupabase();
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: serviceHeaders(config.secret, { "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: paths.slice(0, 20) }),
    cache: "no-store",
  });
  if (!response.ok) throw new DatabaseError("Could not clean up private media.", response.status);
}

export async function storageSign(bucket: string, path: string, expiresIn = 900): Promise<string> {
  const config = requireSupabase();
  const response = await fetch(`${config.url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: serviceHeaders(config.secret, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { signedURL?: string; signedUrl?: string } | null;
  if (!response.ok || !body) throw new DatabaseError("Could not create a private image link.", response.status);
  const signed = body.signedURL ?? body.signedUrl;
  if (!signed) throw new DatabaseError("Could not create a private image link.", 500);
  return signed.startsWith("http") ? signed : `${config.url}/storage/v1${signed}`;
}

export async function findStoreBySlug(slug: string): Promise<StoreRecord | null> {
  const rows = await supabaseRest<StoreRecord[]>(`stores?slug=eq.${encodeURIComponent(slug)}&is_public=eq.true&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function findStoreById(id: string): Promise<StoreRecord | null> {
  const rows = await supabaseRest<StoreRecord[]>(`stores?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function findPublicItems(storeId: string): Promise<ItemRecord[]> {
  await releaseExpiredReservations();
  const store = await findStoreById(storeId);
  if (!store || store.is_public !== true) return [];
  return supabaseRest<ItemRecord[]>(`items?store_id=eq.${encodeURIComponent(storeId)}&status=in.(available,reserved,sold)&select=*&order=created_at.desc`);
}

export async function findPublicItem(itemId: string): Promise<ItemRecord | null> {
  await releaseExpiredReservations();
  const rows = await supabaseRest<ItemRecord[]>(`items?id=eq.${encodeURIComponent(itemId)}&status=in.(available,reserved,sold)&select=*&limit=1`);
  const item = rows[0] ?? null;
  if (!item) return null;
  const store = await findStoreById(item.store_id);
  return store?.is_public === true ? item : null;
}

export async function findItem(itemId: string): Promise<ItemRecord | null> {
  const rows = await supabaseRest<ItemRecord[]>(`items?id=eq.${encodeURIComponent(itemId)}&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function findSellerItems(storeId: string): Promise<ItemRecord[]> {
  return supabaseRest<ItemRecord[]>(`items?store_id=eq.${encodeURIComponent(storeId)}&select=*&order=created_at.desc`);
}

export async function findDraftByClientToken(storeId: string, token: string): Promise<ItemRecord | null> {
  const rows = await supabaseRest<ItemRecord[]>(`items?store_id=eq.${encodeURIComponent(storeId)}&client_request_token=eq.${encodeURIComponent(token)}&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function insertItem(values: Partial<ItemRecord>): Promise<ItemRecord> {
  const rows = await supabaseRest<ItemRecord[]>("items", {
    method: "POST",
    prefer: "return=representation",
    body: values,
  });
  if (!rows[0]) throw new DatabaseError("Database did not return the new item.");
  return rows[0];
}

export async function insertItemImage(values: Partial<ItemImageRecord>): Promise<ItemImageRecord> {
  const rows = await supabaseRest<ItemImageRecord[]>("item_images", { method: "POST", prefer: "return=representation", body: values });
  if (!rows[0]) throw new DatabaseError("Database did not return the image record.");
  return rows[0];
}

export async function upsertItemImage(values: Partial<ItemImageRecord>): Promise<ItemImageRecord> {
  const rows = await supabaseRest<ItemImageRecord[]>("item_images?on_conflict=item_id,kind", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: values });
  if (!rows[0]) throw new DatabaseError("Database did not return the image record.");
  return rows[0];
}

export function findItemImage(itemId: string, kind: "original" | "catalog"): Promise<ItemImageRecord | null>;
export function findItemImage(itemId: string, kind?: undefined): Promise<ItemImageRecord[]>;
export async function findItemImage(itemId: string, kind?: "original" | "catalog"): Promise<ItemImageRecord | ItemImageRecord[] | null> {
  const kindFilter = kind ? `&kind=eq.${kind}` : "";
  const rows = await supabaseRest<ItemImageRecord[]>(`item_images?item_id=eq.${encodeURIComponent(itemId)}${kindFilter}&select=*&order=created_at.asc`);
  return kind ? rows[0] ?? null : rows;
}

export async function updateItem(itemId: string, values: Partial<ItemRecord>) {
  const rows = await supabaseRest<ItemRecord[]>(`items?id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: values,
  });
  return rows[0] ?? null;
}

export async function updateAvailableItem(itemId: string, values: Partial<ItemRecord>): Promise<ItemRecord | null> {
  // PostgREST translates this into one conditional UPDATE. PostgreSQL row locks make
  // concurrent reservations race safely: only one request can update an available row.
  const rows = await supabaseRest<ItemRecord[]>(`items?id=eq.${encodeURIComponent(itemId)}&status=eq.available`, {
    method: "PATCH",
    prefer: "return=representation",
    body: values,
  });
  return rows[0] ?? null;
}

export async function insertJob(values: Partial<ProcessingJobRecord>): Promise<ProcessingJobRecord> {
  const rows = await supabaseRest<ProcessingJobRecord[]>("processing_jobs", { method: "POST", prefer: "return=representation", body: values });
  if (!rows[0]) throw new DatabaseError("Database did not return the processing job.");
  return rows[0];
}

export async function findJob(jobId: string) {
  const rows = await supabaseRest<ProcessingJobRecord[]>(`processing_jobs?id=eq.${encodeURIComponent(jobId)}&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function findLatestJob(itemId: string, operation: string) {
  const rows = await supabaseRest<ProcessingJobRecord[]>(`processing_jobs?item_id=eq.${encodeURIComponent(itemId)}&operation=eq.${encodeURIComponent(operation)}&select=*&order=created_at.desc&limit=1`);
  return rows[0] ?? null;
}

export async function findJobByTryOnSession(sessionId: string) {
  const rows = await supabaseRest<ProcessingJobRecord[]>(`processing_jobs?try_on_session_id=eq.${encodeURIComponent(sessionId)}&operation=eq.try_on&select=*&order=created_at.desc&limit=1`);
  return rows[0] ?? null;
}

export async function updateJob(jobId: string, values: Partial<ProcessingJobRecord>) {
  const rows = await supabaseRest<ProcessingJobRecord[]>(`processing_jobs?id=eq.${encodeURIComponent(jobId)}`, { method: "PATCH", prefer: "return=representation", body: values });
  return rows[0] ?? null;
}

export async function insertTryOn(values: Partial<TryOnSessionRecord>): Promise<TryOnSessionRecord> {
  const rows = await supabaseRest<TryOnSessionRecord[]>("try_on_sessions", { method: "POST", prefer: "return=representation", body: values });
  if (!rows[0]) throw new DatabaseError("Database did not return the try-on session.");
  return rows[0];
}

export async function findTryOn(sessionId: string) {
  const rows = await supabaseRest<TryOnSessionRecord[]>(`try_on_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function findTryOnBySourcePath(itemId: string, sourcePath: string) {
  const rows = await supabaseRest<TryOnSessionRecord[]>(`try_on_sessions?item_id=eq.${encodeURIComponent(itemId)}&source_storage_path=eq.${encodeURIComponent(sourcePath)}&select=*&order=created_at.desc&limit=1`);
  return rows[0] ?? null;
}

export async function updateTryOn(sessionId: string, values: Partial<TryOnSessionRecord>) {
  const rows = await supabaseRest<TryOnSessionRecord[]>(`try_on_sessions?id=eq.${encodeURIComponent(sessionId)}`, { method: "PATCH", prefer: "return=representation", body: values });
  return rows[0] ?? null;
}

export function itemState(item: ItemRecord): ItemState {
  return (item.status ?? "draft") as ItemState;
}

export function storageBucket(kind: "catalog" | "private") {
  return kind === "catalog"
    ? process.env.SUPABASE_CATALOG_BUCKET ?? "catalog"
    : process.env.SUPABASE_PRIVATE_BUCKET ?? "private-buyer";
}

export async function catalogImageFor(itemId: string) {
  const image = await findItemImage(itemId, "catalog").catch(() => null);
  if (!image) return null;
  return storageSign(storageBucket("catalog"), image.storage_path, 900).catch(() => null);
}

export async function originalImageFor(itemId: string) {
  return findItemImage(itemId, "original").catch(() => null);
}

export async function callSupabaseRpc<T>(name: string, body: Record<string, unknown>) {
  return supabaseRest<T>(`rpc/${name}`, { method: "POST", body });
}

export async function releaseExpiredReservations() {
  return callSupabaseRpc<number>("release_expired_reservations", {}).catch(() => 0);
}

export async function cleanupExpiredTryOns() {
  const expired = await callSupabaseRpc<Array<{ session_id: string; source_storage_path?: string | null; result_storage_path?: string | null }>>("cleanup_expired_try_ons", {}).catch(() => []);
  for (const row of expired.slice(0, 5)) {
    try {
      await storageDelete(storageBucket("private"), [row.source_storage_path ?? "", row.result_storage_path ?? ""].filter(Boolean));
      await updateTryOn(row.session_id, { source_storage_path: null, result_storage_path: null });
    } catch {
      // Leave paths for the next cleanup pass when a provider call fails.
    }
  }
  return expired.length;
}
