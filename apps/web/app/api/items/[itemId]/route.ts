import { NextResponse } from "next/server";
import { describeYouCamError, pollBackgroundRemoval } from "../../../../lib/youcam";
import { imageDimensions, jsonError, parsePrice, readJson } from "../../../../lib/http";
import { catalogImageFor, findItemImage, findLatestJob, storageBucket, storageUpload, updateItem, updateJob, upsertItemImage } from "../../../../lib/supabase-server";
import { ownedItem } from "../../../../lib/seller";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { itemId: string } }) {
  const owned = await ownedItem(request, params.itemId);
  if (!owned) return jsonError("You do not have access to this item.", 403, "FORBIDDEN");
  let job = await findLatestJob(owned.item.id, "background_removal").catch(() => null);
  if (job?.status === "running" && job.youcam_task_id) {
    try {
      const poll = await pollBackgroundRemoval(job.youcam_task_id);
      if (poll.status === "success" && poll.resultUrl) {
        const result = await fetch(poll.resultUrl, { cache: "no-store" });
        if (!result.ok) throw new Error("catalog-download");
        const bytes = Buffer.from(await result.arrayBuffer());
        const path = `${owned.store.id}/catalog/${owned.item.id}.png`;
        await storageUpload(storageBucket("catalog"), path, bytes, "image/png");
        // The endpoint returns a signed URL only after the private storage copy
        // and item-image row are durable.
        const dimensions = imageDimensions(bytes, "image/png");
        if (!dimensions) throw new Error("catalog-image-invalid");
        await upsertItemImage({ item_id: owned.item.id, kind: "catalog", storage_path: path, mime_type: "image/png", width: dimensions.width, height: dimensions.height, bytes: bytes.byteLength, is_public: true });
        job = await updateJob(job.id, { status: "succeeded", completed_at: new Date().toISOString(), error_code: null, error_message: null }) ?? job;
        await updateItem(owned.item.id, { status: "processing" });
      } else if (poll.status === "error") {
        job = await updateJob(job.id, { status: "failed", error_code: "SOD_FAILED", error_message: poll.errorMessage ?? "Background removal failed.", completed_at: new Date().toISOString() }) ?? job;
      }
    } catch (error) {
      const readable = describeYouCamError(error);
      job = await updateJob(job.id, { status: readable.retryable ? "running" : "failed", error_code: readable.code, error_message: readable.message, completed_at: readable.retryable ? null : new Date().toISOString() }) ?? job;
    }
  }
  const [catalog] = await Promise.all([findItemImage(owned.item.id, "catalog").catch(() => null)]);
  const catalogImageUrl = catalog ? await catalogImageFor(owned.item.id) : null;
  return NextResponse.json({ item: { ...owned.item, state: owned.item.status, catalog_image_url: catalogImageUrl }, job });
}

export async function PATCH(request: Request, { params }: { params: { itemId: string } }) {
  const owned = await ownedItem(request, params.itemId);
  if (!owned) return jsonError("You do not have access to this item.", 403, "FORBIDDEN");
  const body = await readJson(request);
  const patch: Record<string, unknown> = {};
  for (const key of ["category", "size", "brand", "condition", "notes"] as const) {
    if (typeof body?.[key] === "string") patch[key] = body[key].trim().slice(0, key === "notes" ? 1000 : 160) || null;
  }
  if (body && Object.prototype.hasOwnProperty.call(body, "price")) {
    const price = parsePrice(body.price);
    if (price === null) return jsonError("Enter a valid price.", 422, "INVALID_PRICE");
    patch.price = price;
  }
  if (typeof body?.status === "string") {
    const allowed = owned.item.status === "available" ? ["sold", "archived"] : owned.item.status === "reserved" ? ["available", "sold"] : owned.item.status === "sold" ? ["available", "archived"] : ["archived"];
    if (!allowed.includes(body.status)) return jsonError("That status change is not available.", 409, "INVALID_STATUS_CHANGE");
    patch.status = body.status;
    if (body.status === "available") patch.reserved_until = null;
  }
  const updated = await updateItem(owned.item.id, patch);
  if (!updated) return jsonError("The item could not be updated.", 503, "ITEM_UPDATE_FAILED");
  return NextResponse.json({ item: { ...updated, state: updated.status } });
}
