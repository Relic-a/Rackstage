import { NextResponse } from "next/server";
import { describeYouCamError, pollBackgroundRemoval } from "../../../../../../../lib/youcam";
import { imageDimensions, jsonError } from "../../../../../../../lib/http";
import { findItemImage, findJob, storageBucket, storageUpload, updateItem, updateJob, upsertItemImage } from "../../../../../../../lib/supabase-server";
import { ownedItem } from "../../../../../../../lib/seller";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { itemId: string; jobId: string } }) {
  const owned = await ownedItem(request, params.itemId);
  if (!owned) return jsonError("You do not have access to this item.", 403, "FORBIDDEN");
  let job = await findJob(params.jobId).catch(() => null);
  if (!job || job.item_id !== owned.item.id) return jsonError("Processing job not found.", 404, "JOB_NOT_FOUND");
  if (job.status === "running" && job.youcam_task_id) {
    try {
      const poll = await pollBackgroundRemoval(job.youcam_task_id);
      if (poll.status === "success" && poll.resultUrl) {
        const result = await fetch(poll.resultUrl, { cache: "no-store" });
        if (!result.ok) throw new Error("catalog-download");
        const bytes = Buffer.from(await result.arrayBuffer());
        const dimensions = imageDimensions(bytes, "image/png");
        if (!dimensions) throw new Error("catalog-image-invalid");
        const path = `${owned.store.id}/catalog/${owned.item.id}.png`;
        await storageUpload(storageBucket("catalog"), path, bytes, "image/png");
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
  const catalog = await findItemImage(owned.item.id, "catalog").catch(() => null);
  return NextResponse.json({ job, catalog_image_ready: Boolean(catalog), item: { ...owned.item, status: job.status === "succeeded" ? "processing" : owned.item.status } });
}

