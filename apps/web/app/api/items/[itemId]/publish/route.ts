import { NextResponse } from "next/server";
import { jsonError, parsePrice, readJson } from "../../../../../lib/http";
import { findItemImage, findLatestJob, updateItem } from "../../../../../lib/supabase-server";
import { ownedItem } from "../../../../../lib/seller";
import type { ItemRecord } from "../../../../../lib/types";
import { garmentCategory } from "../../../../../lib/youcam";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { itemId: string } }) {
  const owned = await ownedItem(request, params.itemId);
  if (!owned) return jsonError("You do not have access to this item.", 403, "FORBIDDEN");
  const body = await readJson(request);
  const patch: Partial<ItemRecord> = {};
  for (const key of ["category", "size", "brand", "condition", "notes"] as const) {
    if (typeof body?.[key] === "string") patch[key] = String(body[key]).trim().slice(0, key === "notes" ? 1000 : 160) as never;
  }
  if (body && Object.prototype.hasOwnProperty.call(body, "price")) {
    const price = parsePrice(body.price);
    if (price === null) return jsonError("Enter a valid price.", 422, "INVALID_PRICE");
    patch.price = price;
  }
  const merged = { ...owned.item, ...patch };
  if (!["draft", "processing"].includes(String(owned.item.status))) return jsonError("This item can no longer be published.", 409, "INVALID_ITEM_STATUS");
  if (!["shirt", "blouse", "top", "sweater", "hoodie", "cardigan", "coat", "jacket", "dress", "jumpsuit", "pants", "trousers", "skirt"].includes(String(merged.category)) || !merged.size || merged.size === "one-size" || !merged.brand || merged.brand === "Unknown vintage" || !merged.condition || merged.condition === "Needs details" || parsePrice(merged.price) === null || Number(merged.price) <= 0) return jsonError("Category, size, brand, condition, and price are required before publishing.", 422, "REQUIRED_DETAILS");
  const job = await findLatestJob(owned.item.id, "background_removal").catch(() => null);
  const catalogImage = await findItemImage(owned.item.id, "catalog").catch(() => null);
  if (!catalogImage || !job || job.status !== "succeeded") return jsonError(job?.status === "failed" ? (job.error_message || "Background removal failed. Retry processing before publishing.") : "The catalog image is still processing. Try again when it is ready.", 409, "CATALOG_IMAGE_NOT_READY");
  const updated = await updateItem(owned.item.id, { ...patch, youcam_category: garmentCategory(String(merged.category)), status: "available", published_at: new Date().toISOString() });
  if (!updated) return jsonError("We could not publish this item.", 503, "PUBLISH_FAILED");
  return NextResponse.json({ item: { ...updated, state: updated.status } });
}
