import { NextResponse } from "next/server";
import { createBackgroundRemoval, describeYouCamError } from "../../../../../../lib/youcam";
import { imageDimensions, jsonError } from "../../../../../../lib/http";
import { findItemImage, findLatestJob, insertJob, storageBucket, storageDownload, updateItem, updateJob } from "../../../../../../lib/supabase-server";
import { ownedItem } from "../../../../../../lib/seller";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: { itemId: string } }) {
  const owned = await ownedItem(request, params.itemId);
  if (!owned) return jsonError("You do not have access to this item.", 403, "FORBIDDEN");
  const original = await findItemImage(owned.item.id, "original").catch(() => null);
  if (!original) return jsonError("The original garment image is missing.", 409, "ORIGINAL_IMAGE_MISSING");
  let job = await findLatestJob(owned.item.id, "background_removal").catch(() => null);
  if (job?.status === "running" && job.youcam_task_id) return NextResponse.json({ job });
  if (job?.status === "succeeded" && await findItemImage(owned.item.id, "catalog").catch(() => null)) return NextResponse.json({ job, catalog_image_ready: true });
  const attempt = job ? (job.attempt_count ?? 0) : 0;
  if (!job) job = await insertJob({ store_id: owned.store.id, item_id: owned.item.id, operation: "background_removal", status: "pending", attempt_count: attempt });
  else job = await updateJob(job.id, { status: "pending", error_code: null, error_message: null, completed_at: null });
  try {
    const bytes = await storageDownload(storageBucket("catalog"), original.storage_path);
    // Reuse the job's first SOD request id on retries; a repeat tap should not
    // create a new generation or consume another unit.
    const created = await createBackgroundRemoval({ bytes, fileName: original.storage_path.split("/").pop() || `garment.${original.mime_type === "image/png" ? "png" : "jpg"}`, contentType: original.mime_type, requestId: 0 });
    job = await updateJob(job.id, { status: "running", youcam_task_id: created.taskId, attempt_count: attempt + 1 }) ?? job;
    await updateItem(owned.item.id, { status: "processing" });
    return NextResponse.json({ job });
  } catch (error) {
    const readable = describeYouCamError(error);
    job = await updateJob(job.id, { status: "failed", error_code: readable.code, error_message: readable.message, attempt_count: attempt + 1, completed_at: new Date().toISOString() }) ?? job;
    await updateItem(owned.item.id, { status: "draft" }).catch(() => undefined);
    return NextResponse.json({ job, error: { code: readable.code, message: readable.message } }, { status: readable.retryable ? 503 : 422 });
  }
}
