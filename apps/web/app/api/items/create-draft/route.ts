import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createBackgroundRemoval, describeYouCamError, garmentCategory } from "../../../../lib/youcam";
import { acceptedImageType, imageDimensions, jsonError, parsePrice } from "../../../../lib/http";
import { findDraftByClientToken, findLatestJob, insertItem, insertItemImage, insertJob, storageBucket, storageDelete, storageUpload, updateItem, updateJob } from "../../../../lib/supabase-server";
import { ownedStore } from "../../../../lib/seller";
import type { ItemRecord, ProcessingJobRecord } from "../../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function text(form: FormData, key: string, max = 200) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Send the garment photo as multipart form data.", 400, "INVALID_FORM");
  const original = (form.get("original") ?? form.get("photo")) as File | null;
  if (!original || typeof original.arrayBuffer !== "function") return jsonError("Add one garment photo first.", 422, "ORIGINAL_REQUIRED");
  const contentType = original.type === "image/png" ? "image/png" : original.type === "image/jpeg" ? "image/jpeg" : "";
  if (!acceptedImageType(contentType) || original.size > 10 * 1024 * 1024) return jsonError("Use a JPG or PNG smaller than 10 MB.", 422, "INVALID_IMAGE");
  const owned = await ownedStore(request, text(form, "store_id", 80) || null);
  if (!owned) return jsonError("Create a store before adding inventory.", 403, "STORE_REQUIRED");
  const requestToken = text(form, "request_token", 80) || (request.headers.get("Idempotency-Key") ?? "").trim();
  const validRequestToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestToken) ? requestToken : null;
  if (validRequestToken) {
    const existing = await findDraftByClientToken(owned.store.id, validRequestToken).catch(() => null);
    if (existing) return NextResponse.json({ item: { ...existing, state: existing.status }, job: await findLatestJob(existing.id, "background_removal").catch(() => null), idempotent: true });
  }
  const bytes = Buffer.from(await original.arrayBuffer());
  const dimensions = imageDimensions(bytes, contentType);
  if (!dimensions) return jsonError("We could not read that garment image. Try another JPG or PNG.", 422, "INVALID_IMAGE");
  if (Math.min(dimensions.width, dimensions.height) < 384 || Math.max(dimensions.width, dimensions.height) < 512 || Math.max(dimensions.width, dimensions.height) > 4096) return jsonError("Use a garment photo at least 512 × 384 pixels and no larger than 4096 pixels on either side.", 422, "INVALID_IMAGE_DIMENSIONS");
  const extension = contentType === "image/png" ? "png" : "jpg";
  // The migration's storage policy expects the first path segment to be the
  // owning store UUID; original images stay private in the catalog bucket.
  const imagePath = `${owned.store.id}/original/${crypto.randomUUID()}.${extension}`;
  try {
    await storageUpload(storageBucket("catalog"), imagePath, bytes, contentType);
  } catch {
    return jsonError("We could not save the original photo. Check storage configuration and retry.", 503, "STORAGE_UNAVAILABLE");
  }
  const category = text(form, "category", 80);
  const values: Partial<ItemRecord> = {
    store_id: owned.store.id,
    client_request_token: validRequestToken,
    category: category || null,
    youcam_category: category ? garmentCategory(category) : null,
    size: text(form, "size", 40) || null,
    brand: text(form, "brand", 100) || null,
    condition: text(form, "condition", 100) || null,
    price: parsePrice(form.get("price")),
    notes: text(form, "notes", 1000) || null,
    status: "processing",
  };
  let item: ItemRecord | undefined;
  try {
    item = await insertItem(values);
    await insertItemImage({ item_id: item.id, kind: "original", storage_path: imagePath, mime_type: contentType, width: dimensions.width, height: dimensions.height, bytes: bytes.byteLength, is_public: false });
  } catch {
    if (validRequestToken) {
      const existing = await findDraftByClientToken(owned.store.id, validRequestToken).catch(() => null);
      if (existing) return NextResponse.json({ item: { ...existing, state: existing.status }, job: await findLatestJob(existing.id, "background_removal").catch(() => null), idempotent: true });
    }
    await storageDelete(storageBucket("catalog"), [imagePath]).catch(() => undefined);
    return jsonError("We could not create the draft item.", 503, "ITEM_CREATE_FAILED");
  }
  if (!item) return jsonError("We could not create the draft item.", 503, "ITEM_CREATE_FAILED");
  let job: ProcessingJobRecord | undefined;
  try {
    job = await insertJob({ store_id: owned.store.id, item_id: item.id, operation: "background_removal", status: "pending", attempt_count: 0, error_code: null, error_message: null });
    const created = await createBackgroundRemoval({ bytes, fileName: original.name || `garment.${extension}`, contentType, requestId: 0 });
    job = await updateJob(job.id, { status: "running", youcam_task_id: created.taskId, attempt_count: 1 }) ?? job;
  } catch (error) {
    const readable = describeYouCamError(error);
    if (job) job = await updateJob(job.id, { status: "failed", error_code: readable.code, error_message: readable.message, attempt_count: (job.attempt_count ?? 0) + 1 }) ?? job;
    // Keep the draft: the seller can retry processing once credentials or a
    // transient API issue is fixed. Do not fabricate a catalog image.
    const draft = await updateItem(item.id, { status: "draft" }) ?? item;
    return NextResponse.json({ item: { ...draft, state: draft.status }, job, error: { code: readable.code, message: readable.message } }, { status: 201 });
  }
  item = await updateItem(item.id, { status: "processing" }) ?? item;
  return NextResponse.json({ item: { ...item, state: item.status }, job }, { status: 201 });
}
