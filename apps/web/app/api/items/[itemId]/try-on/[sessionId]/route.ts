import { NextResponse } from "next/server";
import { describeYouCamError, pollVtoTask } from "../../../../../../lib/youcam";
import { jsonError } from "../../../../../../lib/http";
import { cleanupExpiredTryOns, findJobByTryOnSession, findPublicItem, findTryOn, itemState, storageBucket, storageDelete, storageSign, storageUpload, updateJob, updateTryOn } from "../../../../../../lib/supabase-server";
import type { TryOnSessionRecord } from "../../../../../../lib/types";

export const runtime = "nodejs";

function publicSession(session: TryOnSessionRecord, resultUrl?: string | null) {
  return { id: session.id, item_id: session.item_id, status: session.status, error_code: session.error_code ?? null, error_message: session.error_message ?? null, result_url: resultUrl ?? null, created_at: session.created_at ?? null };
}

export async function GET(_request: Request, { params }: { params: { itemId: string; sessionId: string } }) {
  await cleanupExpiredTryOns();
  const item = await findPublicItem(params.itemId).catch(() => null);
  if (!item || ["sold", "archived"].includes(itemState(item))) return jsonError("This garment is no longer available.", 404, "ITEM_NOT_AVAILABLE");
  let session = await findTryOn(params.sessionId).catch(() => null);
  if (!session || session.item_id !== item.id) return jsonError("Try-on session not found.", 404, "SESSION_NOT_FOUND");
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now() && session.status !== "succeeded") {
    try {
      await storageDelete(storageBucket("private"), [session.source_storage_path ?? "", session.result_storage_path ?? ""].filter(Boolean));
      session = await updateTryOn(session.id, { status: "expired", error_code: "SESSION_EXPIRED", error_message: "This preview expired. Start a new try-on.", source_storage_path: null, result_storage_path: null, completed_at: new Date().toISOString() }) ?? session;
    } catch {
      session = await updateTryOn(session.id, { status: "expired", error_code: "SESSION_EXPIRED", error_message: "This preview expired. Start a new try-on.", completed_at: new Date().toISOString() }) ?? session;
    }
    return NextResponse.json({ session: publicSession(session) });
  }
  if (session.status === "processing" && session.youcam_task_id) {
    try {
      const poll = await pollVtoTask(session.youcam_task_id);
      if (poll.status === "success") {
        if (!poll.resultUrl) throw new Error("missing-result");
        const image = await fetch(poll.resultUrl, { cache: "no-store" });
        if (!image.ok) throw new Error("result-download");
        const bytes = Buffer.from(await image.arrayBuffer());
        const resultPath = `try-on/result/${session.id}.jpg`;
        await storageUpload(storageBucket("private"), resultPath, bytes, "image/jpeg");
        session = await updateTryOn(session.id, { status: "succeeded", result_storage_path: resultPath, completed_at: new Date().toISOString(), error_code: null, error_message: null }) ?? { ...session, status: "succeeded", result_storage_path: resultPath };
        const tryOnJob = await findJobByTryOnSession(session.id).catch(() => null);
        if (tryOnJob) await updateJob(tryOnJob.id, { status: "succeeded", completed_at: new Date().toISOString(), error_code: null, error_message: null }).catch(() => undefined);
      } else if (poll.status === "error") {
        session = await updateTryOn(session.id, { status: "failed", error_code: poll.errorCode ?? "VTO_FAILED", error_message: poll.errorMessage ?? "The photo could not be processed.", completed_at: new Date().toISOString() }) ?? session;
        const tryOnJob = await findJobByTryOnSession(session.id).catch(() => null);
        if (tryOnJob) await updateJob(tryOnJob.id, { status: "failed", completed_at: new Date().toISOString(), error_code: poll.errorCode ?? "VTO_FAILED", error_message: poll.errorMessage ?? "The photo could not be processed." }).catch(() => undefined);
      }
    } catch (error) {
      const readable = describeYouCamError(error);
      session = await updateTryOn(session.id, { status: readable.retryable ? "processing" : "failed", error_code: readable.code, error_message: readable.message, completed_at: readable.retryable ? null : new Date().toISOString() }) ?? session;
      if (!readable.retryable) {
        const tryOnJob = await findJobByTryOnSession(session.id).catch(() => null);
        if (tryOnJob) await updateJob(tryOnJob.id, { status: "failed", completed_at: new Date().toISOString(), error_code: readable.code, error_message: readable.message }).catch(() => undefined);
      }
    }
  }
  let resultUrl: string | null = null;
  if (session.status === "succeeded" && session.result_storage_path) resultUrl = await storageSign(storageBucket("private"), session.result_storage_path, 900).catch(() => null);
  return NextResponse.json({ session: publicSession(session, resultUrl) });
}
