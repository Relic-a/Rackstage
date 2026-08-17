import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError } from "../../../../../lib/http";
import { callSupabaseRpc, cleanupExpiredTryOns, findPublicItem, itemState, supabaseRest } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";

const RESERVATION_MINUTES = 30;

function publicItem(item: { id: string; store_id: string; category: string | null; youcam_category: string | null; size: string | null; brand: string | null; condition: string | null; price: number | string | null; currency?: string; notes?: string | null; status?: string | null; reserved_until?: string | null; published_at?: string | null }, status: string, reservedUntil: string) {
  return { id: item.id, store_id: item.store_id, category: item.category, youcam_category: item.youcam_category, size: item.size, brand: item.brand, condition: item.condition, price: item.price, currency: item.currency, notes: item.notes, status, reserved_until: reservedUntil, published_at: item.published_at };
}

export async function POST(request: Request, { params }: { params: { itemId: string } }) {
  await cleanupExpiredTryOns();
  let body: { buyer_name?: string; buyer_contact?: string; notes?: string; request_token?: string } = {};
  try { body = await request.json() as typeof body; } catch { /* empty body is handled below */ }
  const buyerName = typeof body.buyer_name === "string" ? body.buyer_name.trim().slice(0, 120) : "";
  const buyerContact = typeof body.buyer_contact === "string" ? body.buyer_contact.trim().slice(0, 200) : "";
  if (!buyerName || !buyerContact) return jsonError("Add your name and a way for the store to contact you.", 422, "BUYER_DETAILS_REQUIRED");
  const item = await findPublicItem(params.itemId).catch(() => null);
  if (!item) return jsonError("That piece is not available.", 404, "ITEM_NOT_FOUND");
  const state = itemState(item);
  if (state === "reserved" && item.reserved_until && new Date(item.reserved_until).getTime() < Date.now()) {
    // Expired holds are released before attempting a new atomic reservation.
    await supabaseRest(`items?id=eq.${encodeURIComponent(item.id)}&status=eq.reserved`, { method: "PATCH", body: { status: "available", reserved_until: null } }).catch(() => undefined);
  }
  const reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60_000).toISOString();
  let token = typeof body.request_token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_token) ? body.request_token : undefined;
  if (!token) token = crypto.randomUUID();
  try {
    const rawReservation = await callSupabaseRpc<Record<string, unknown> | Array<Record<string, unknown>>>("reserve_item", {
      p_item_id: item.id,
      p_reserved_until: reservedUntil,
      p_buyer_name: buyerName,
      p_buyer_contact: buyerContact,
      p_notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : null,
      p_request_token: token,
    });
    const raw = Array.isArray(rawReservation) ? rawReservation[0] : rawReservation;
    const reservation = raw ? { id: raw.id, item_id: raw.item_id, status: raw.status, reserved_until: raw.reserved_until } : { item_id: item.id, status: "active", reserved_until: reservedUntil };
    return NextResponse.json({ reservation, item: publicItem(item, "reserved", reservedUntil) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "item_unavailable";
    if (message.toLowerCase().includes("item_unavailable")) return jsonError("This piece was just reserved by someone else. Check back if it returns.", 409, "ITEM_UNAVAILABLE");
    if (message.toLowerCase().includes("buyer_details")) return jsonError("Add your name and a way for the store to contact you.", 422, "BUYER_DETAILS_REQUIRED");
    return jsonError("We could not reserve this piece right now. Please retry.", 503, "RESERVATION_FAILED");
  }
}
