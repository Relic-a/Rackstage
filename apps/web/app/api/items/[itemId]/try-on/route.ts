import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createVtoTask, describeYouCamError, garmentCategory, uploadClothFile } from "../../../../../lib/youcam";
import { acceptedImageType, imageDimensions, jsonError, MAX_IMAGE_BYTES, validateImage } from "../../../../../lib/http";
import { cleanupExpiredTryOns, findItemImage, findPublicItem, findTryOnBySourcePath, insertJob, insertTryOn, itemState, storageBucket, storageDownload, storageUpload, updateTryOn } from "../../../../../lib/supabase-server";
import type { TryOnSessionRecord } from "../../../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function publicSession(session: TryOnSessionRecord) {
  return { id: session.id, item_id: session.item_id, status: session.status, error_code: session.error_code ?? null, error_message: session.error_message ?? null, created_at: session.created_at ?? null };
}

export async function POST(request: Request, { params }: { params: { itemId: string } }) {
  await cleanupExpiredTryOns();
  const item = await findPublicItem(params.itemId).catch(() => null);
  if (!item || itemState(item) !== "available") return jsonError("This garment is not available for try-on.", 404, "ITEM_NOT_AVAILABLE");
  const form = await request.formData().catch(() => null);
  const photo = (form?.get("photo") ?? form?.get("person")) as File | null;
  if (!photo || typeof photo.arrayBuffer !== "function") return jsonError("Add one clear photo of yourself first.", 422, "SHOPPER_PHOTO_REQUIRED");
  const contentType = photo.type === "image/png" ? "image/png" : photo.type === "image/jpeg" ? "image/jpeg" : undefined;
  if (!contentType) return jsonError("Use a JPG or PNG photo.", 422, "UNSUPPORTED_IMAGE");
  const bytes = Buffer.from(await photo.arrayBuffer());
  const validation = validateImage(bytes, contentType, { requireVtoDimensions: true });
  if (!validation.ok) return jsonError(validation.message, 422, validation.code);
  // Hashing the validated bytes makes retries with the same photo durable and
  // avoids burning another YouCam unit without storing browser headers.
  const imageHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const ext = contentType === "image/png" ? "png" : "jpg";
  const shopperPath = `try-on/input/${item.id}/${imageHash}.${ext}`;
  const existing = await findTryOnBySourcePath(item.id, shopperPath).catch(() => null);
  if (existing && !["failed", "expired"].includes(existing.status)) return NextResponse.json({ session: publicSession(existing) });
  let session: TryOnSessionRecord;
  try {
    session = await insertTryOn({ item_id: item.id, store_id: item.store_id, status: "uploading", source_storage_path: shopperPath, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() });
  } catch {
    const raced = await findTryOnBySourcePath(item.id, shopperPath).catch(() => null);
    if (raced) return NextResponse.json({ session: publicSession(raced), idempotent: true });
    return jsonError("We could not start this private try-on session.", 503, "SESSION_CREATE_FAILED");
  }
  try {
    await storageUpload(storageBucket("private"), shopperPath, bytes, contentType);
    session = await updateTryOn(session.id, { status: "uploading" }) ?? session;
    let garmentBytes: Buffer;
    const original = await findItemImage(item.id, "original");
    if (!original) throw new Error("garment-reference-missing");
    garmentBytes = await storageDownload(storageBucket("catalog"), original.storage_path);
    const garmentType = original.mime_type;
    const sourceUpload = await uploadClothFile({ bytes, fileName: `shopper-${session.id}.${ext}`, contentType });
    const referenceUpload = await uploadClothFile({ bytes: garmentBytes, fileName: `garment-${item.id}.${garmentType === "image/png" ? "png" : "jpg"}`, contentType: garmentType });
    const task = await createVtoTask({ sourceFileId: sourceUpload.fileId, referenceFileId: referenceUpload.fileId, garmentCategory: item.youcam_category ?? garmentCategory(item.category ?? "top") });
    session = await updateTryOn(session.id, { status: "processing", youcam_task_id: task.taskId }) ?? session;
    await insertJob({ store_id: item.store_id, try_on_session_id: session.id, operation: "try_on", status: "running", youcam_task_id: task.taskId, attempt_count: 1 }).catch(() => undefined);
  } catch (error) {
    const readable = describeYouCamError(error);
    session = await updateTryOn(session.id, { status: "failed", error_code: readable.code, error_message: readable.message, completed_at: new Date().toISOString() }) ?? session;
    return NextResponse.json({ session: publicSession(session), error: { code: readable.code, message: readable.message } }, { status: readable.retryable ? 503 : 422 });
  }
  return NextResponse.json({ session: publicSession(session) }, { status: 201 });
}
