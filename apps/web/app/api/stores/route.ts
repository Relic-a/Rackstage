import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { acceptedImageType, currentUserId, imageDimensions, jsonError, readJson, safeSlug } from "../../../lib/http";
import { storageBucket, storageSign, storageUpload, supabaseRest } from "../../../lib/supabase-server";
import { storesForUser } from "../../../lib/seller";
import type { StoreRecord } from "../../../lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await currentUserId(request);
  if (!userId) return jsonError("Sign in to create your store.", 401, "UNAUTHENTICATED");
  const isMultipart = (request.headers.get("content-type") ?? "").toLowerCase().includes("multipart/form-data");
  const form = isMultipart ? await request.formData().catch(() => null) : null;
  const body = isMultipart ? null : await readJson(request);
  const field = (key: string) => isMultipart ? (typeof form?.get(key) === "string" ? String(form?.get(key)) : undefined) : body?.[key];
  const name = typeof field("name") === "string" ? String(field("name")).trim().slice(0, 100) : "";
  if (!name) return jsonError("Enter a store name.", 422, "STORE_NAME_REQUIRED");
  let logoInput: { bytes: Buffer; type: "image/jpeg" | "image/png"; dimensions: { width: number; height: number }; name: string } | null = null;
  const incomingLogo = form?.get("logo");
  if (incomingLogo && typeof incomingLogo !== "string") {
    const logoType = incomingLogo.type === "image/png" ? "image/png" : incomingLogo.type === "image/jpeg" ? "image/jpeg" : "";
    const logoBytes = Buffer.from(await incomingLogo.arrayBuffer());
    const dimensions = imageDimensions(logoBytes, logoType);
    if (!acceptedImageType(logoType) || logoBytes.byteLength > 10 * 1024 * 1024 || !dimensions) return jsonError("Use a readable JPG or PNG logo smaller than 10 MB.", 422, "INVALID_LOGO");
    logoInput = { bytes: logoBytes, type: logoType, dimensions, name: incomingLogo.name || "logo" };
  }
  const requested = typeof field("slug") === "string" ? safeSlug(String(field("slug"))) : "";
  let slug = requested || safeSlug(name) || `store-${userId.slice(0, 6)}`;
  const sameOwnerBase = await supabaseRest<StoreRecord[]>(`stores?owner_id=eq.${encodeURIComponent(userId)}&slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`).catch(() => []);
  if (sameOwnerBase[0]) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get("origin") ?? new URL(request.url).origin;
    const logoUrl = sameOwnerBase[0].logo_path ? (/^https?:\/\//i.test(sameOwnerBase[0].logo_path) ? sameOwnerBase[0].logo_path : await storageSign(storageBucket("catalog"), sameOwnerBase[0].logo_path, 900).catch(() => null)) : null;
    return NextResponse.json({ store: { ...sameOwnerBase[0], public_url: `${origin.replace(/\/$/, "")}/store/${sameOwnerBase[0].slug}`, logo_url: logoUrl, logoUrl }, idempotent: true });
  }
  const existing = await supabaseRest<StoreRecord[]>(`stores?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`).catch(() => []);
  if (existing.length) slug = `${slug}-${userId.slice(0, 6)}`;
  if (slug.length < 3) return jsonError("Choose a store slug with at least 3 letters or numbers.", 422, "INVALID_STORE_SLUG");
  const values = {
    owner_id: userId,
    name,
    slug,
    logo_path: typeof field("logo_path") === "string" ? String(field("logo_path")).trim().slice(0, 1000) : (typeof field("logo_url") === "string" ? String(field("logo_url")).trim().slice(0, 1000) : null),
    brand_color: typeof field("brand_color") === "string" && /^#[0-9a-f]{6}$/i.test(String(field("brand_color"))) ? String(field("brand_color")) : null,
    pickup_instructions: typeof field("pickup_instructions") === "string" ? String(field("pickup_instructions")).trim().slice(0, 500) : null,
  };
  let store: StoreRecord | undefined;
  try {
    const rows = await supabaseRest<StoreRecord[]>("stores", { method: "POST", prefer: "return=representation", body: values });
    store = rows[0];
  } catch {
    return jsonError("The store could not be created.", 503, "STORE_CREATE_FAILED");
  }
  if (!store) return jsonError("The store could not be created.", 500, "STORE_CREATE_FAILED");
  if (logoInput) {
    const logoPath = `${store.id}/logo/${crypto.randomUUID()}.${logoInput.type === "image/png" ? "png" : "jpg"}`;
    try {
      await storageUpload(storageBucket("catalog"), logoPath, logoInput.bytes, logoInput.type);
      store = (await supabaseRest<StoreRecord[]>(`stores?id=eq.${encodeURIComponent(store.id)}`, { method: "PATCH", prefer: "return=representation", body: { logo_path: logoPath } }))[0] ?? store;
    } catch {
      // Store creation remains valid without an optional logo.
    }
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get("origin") ?? new URL(request.url).origin;
  const logoUrl = store.logo_path ? (/^https?:\/\//i.test(store.logo_path) ? store.logo_path : await storageSign(storageBucket("catalog"), store.logo_path, 900).catch(() => null)) : null;
  return NextResponse.json({ store: { ...store, public_url: `${origin.replace(/\/$/, "")}/store/${store.slug}`, logo_url: logoUrl, logoUrl } }, { status: 201 });
}

export async function GET(request: Request) {
  const userId = await currentUserId(request);
  if (!userId) return jsonError("Sign in to view your stores.", 401, "UNAUTHENTICATED");
  const stores = await storesForUser(userId);
  return NextResponse.json({ stores });
}
