import { NextResponse } from "next/server";
import { findStoreBySlug, storageBucket, storageSign } from "../../../../../lib/supabase-server";
import { jsonError } from "../../../../../lib/http";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { storeSlug: string } }) {
  const store = await findStoreBySlug(params.storeSlug).catch(() => null);
  if (!store) return jsonError("Store not found.", 404, "STORE_NOT_FOUND");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get("origin") ?? new URL(request.url).origin;
  const logoUrl = store.logo_path ? (/^https?:\/\//i.test(store.logo_path) ? store.logo_path : await storageSign(storageBucket("catalog"), store.logo_path, 900).catch(() => null)) : null;
  return NextResponse.json({ url: `${origin.replace(/\/$/, "")}/store/${encodeURIComponent(store.slug)}`, qr: null, store: { id: store.id, name: store.name, slug: store.slug, brand_color: store.brand_color ?? null, pickup_instructions: store.pickup_instructions ?? null, logo_url: logoUrl } });
}
