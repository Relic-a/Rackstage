import "server-only";

const VTO_BASE = process.env.YOUCAM_VTO_BASE_URL ?? "https://yce-api-01.makeupar.com/s2s/v2.0";
const SOD_BASE = process.env.YOUCAM_SOD_BASE_URL ?? "https://yce-api-01.perfectcorp.com/s2s/v1.0";

export class YouCamError extends Error {
  code: string;
  httpStatus?: number;
  retryable: boolean;

  constructor(message: string, options: { code?: string; httpStatus?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "YouCamError";
    this.code = options.code ?? "YOUCAM_ERROR";
    this.httpStatus = options.httpStatus;
    this.retryable = options.retryable ?? false;
  }
}

type ApiEnvelope = {
  status?: number;
  data?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: unknown;
  message?: string;
};

function requireKey() {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new YouCamError("Virtual try-on is not configured yet.", { code: "MISSING_YOUCAM_KEY" });
  return key;
}

function safeMessage(payload: ApiEnvelope | null, fallback: string) {
  const redact = (value: string) => value.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").replace(/(api[_-]?key|authorization)\s*[:=]\s*[^,\s]+/gi, "$1: [redacted]");
  const error = payload?.error;
  if (typeof error === "string") return redact(error).slice(0, 240);
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const candidate = obj.message ?? obj.code ?? obj.error;
    if (typeof candidate === "string") return redact(candidate).slice(0, 240);
  }
  if (typeof payload?.message === "string") return redact(payload.message).slice(0, 240);
  return fallback;
}

async function youcamJson(url: string, init: RequestInit, operation: string): Promise<ApiEnvelope> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  let body: ApiEnvelope | null = null;
  try {
    body = (await response.json()) as ApiEnvelope;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const status = response.status;
    const retryable = status === 408 || status === 429 || status >= 500;
    throw new YouCamError(safeMessage(body, `${operation} failed.`), {
      code: status === 429 ? "RATE_LIMITED" : `HTTP_${status}`,
      httpStatus: status,
      retryable,
    });
  }
  return body ?? {};
}

export type YouCamUpload = { fileId: string };

/** Upload to the V3 clothes endpoint through its presigned PUT request. */
export async function uploadClothFile(input: {
  bytes: Buffer;
  fileName: string;
  contentType: "image/jpeg" | "image/png";
}): Promise<YouCamUpload> {
  const payload = {
    files: [
      {
        content_type: input.contentType,
        file_name: input.fileName,
        file_size: input.bytes.byteLength,
      },
    ],
  };
  const created = await youcamJson(`${VTO_BASE}/file/cloth-v3`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "YouCam file upload");
  const files = (created.data?.files ?? created.result?.files) as Array<Record<string, unknown>> | undefined;
  const record = files?.[0];
  const requests = record?.requests as Array<Record<string, unknown>> | undefined;
  const request = requests?.[0];
  const fileId = record?.file_id;
  const uploadUrl = request?.url;
  if (typeof fileId !== "string" || typeof uploadUrl !== "string") {
    throw new YouCamError("YouCam did not return an upload request.", { code: "UPLOAD_RESPONSE_INVALID" });
  }
  const requestHeaders = (request?.headers ?? {}) as Record<string, string>;
  const put = await fetch(uploadUrl, {
    method: String(request?.method ?? "PUT"),
    headers: { ...requestHeaders, "Content-Type": requestHeaders["Content-Type"] ?? input.contentType },
    body: input.bytes as unknown as BodyInit,
    cache: "no-store",
  });
  if (!put.ok) {
    throw new YouCamError("We could not upload that image to the try-on service.", {
      code: "UPLOAD_TRANSFER_FAILED",
      httpStatus: put.status,
      retryable: put.status >= 500 || put.status === 408,
    });
  }
  return { fileId };
}

export type VtoTask = { taskId: string };

export async function createVtoTask(input: {
  sourceFileId: string;
  referenceFileId: string;
  garmentCategory: "upper_body" | "lower_body" | "full_body";
}): Promise<VtoTask> {
  const payload = {
    src_file_id: input.sourceFileId,
    ref_file_id: input.referenceFileId,
    garment_category: input.garmentCategory,
  };
  const created = await youcamJson(`${VTO_BASE}/task/cloth-v3`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, "Virtual try-on task creation");
  const taskId = created.data?.task_id ?? created.result?.task_id;
  if (typeof taskId !== "string" || !taskId) {
    throw new YouCamError("YouCam did not return a try-on task.", { code: "TASK_RESPONSE_INVALID" });
  }
  return { taskId };
}

export type VtoPoll = {
  status: "running" | "success" | "error";
  resultUrl?: string;
  errorCode?: string;
  errorMessage?: string;
};

export async function pollVtoTask(taskId: string): Promise<VtoPoll> {
  const body = await youcamJson(`${VTO_BASE}/task/cloth-v3/${encodeURIComponent(taskId)}`, {
    method: "GET",
  }, "Virtual try-on status");
  const data = body.data ?? body.result ?? {};
  const rawStatus = data.task_status ?? data.status;
  if (data.error && !rawStatus) return { status: "error", errorCode: "VTO_FAILED", errorMessage: safeMessage({ error: data.error }, "The try-on could not be completed.") };
  if (rawStatus === "success") {
    const results = data.results as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
    const first = Array.isArray(results) ? results[0] : results;
    const url = first?.url;
    return { status: "success", resultUrl: typeof url === "string" ? url : undefined };
  }
  if (rawStatus === "error" || rawStatus === "failed") {
    const error = data.error;
    const message = typeof error === "string" ? error : safeMessage({ error }, "The try-on could not be completed.");
    return { status: "error", errorCode: "VTO_FAILED", errorMessage: message };
  }
  return { status: "running" };
}

/** Background removal via documented legacy SOD v1 flow. */
export async function createBackgroundRemoval(input: {
  bytes: Buffer;
  fileName: string;
  contentType: "image/jpeg" | "image/png";
  requestId?: number;
}): Promise<{ fileId: string; taskId: string }> {
  const created = await youcamJson(`${SOD_BASE}/file/sod`, {
    method: "POST",
    body: JSON.stringify({ files: [{ content_type: input.contentType, file_name: input.fileName }] }),
  }, "Background-removal file upload");
  const root = created.result ?? created.data ?? {};
  const files = root.files as Array<Record<string, unknown>> | undefined;
  const record = files?.[0];
  const requests = record?.requests as Array<Record<string, unknown>> | undefined;
  const request = requests?.[0];
  const fileId = record?.file_id;
  const uploadUrl = request?.url;
  if (typeof fileId !== "string" || typeof uploadUrl !== "string") {
    throw new YouCamError("YouCam did not return a background-removal upload request.", { code: "SOD_UPLOAD_RESPONSE_INVALID" });
  }
  const requestHeaders = (request?.headers ?? {}) as Record<string, string>;
  const put = await fetch(uploadUrl, {
    method: String(request?.method ?? "PUT"),
    headers: { ...requestHeaders, "Content-Type": requestHeaders["Content-Type"] ?? input.contentType },
    body: input.bytes as unknown as BodyInit,
    cache: "no-store",
  });
  if (!put.ok) {
    throw new YouCamError("We could not upload that garment image for background removal.", {
      code: "SOD_UPLOAD_TRANSFER_FAILED",
      httpStatus: put.status,
      retryable: put.status >= 500 || put.status === 408,
    });
  }
  const task = await youcamJson(`${SOD_BASE}/task/sod`, {
    method: "POST",
    body: JSON.stringify({
      // SOD request_id is client-generated and must be reused for retries. The
      // processing job owns this integer; the first job uses 0 by convention.
      request_id: Number.isInteger(input.requestId) && (input.requestId as number) >= 0 ? input.requestId : 0,
      payload: { file_sets: { src_ids: [fileId] }, actions: [{ id: 0 }], output_ext: "png" },
    }),
  }, "Background-removal task creation");
  const taskRoot = task.result ?? task.data ?? {};
  const taskId = taskRoot.task_id;
  if (typeof taskId !== "string" && typeof taskId !== "number") {
    throw new YouCamError("YouCam did not return a background-removal task.", { code: "SOD_TASK_RESPONSE_INVALID" });
  }
  return { fileId, taskId: String(taskId) };
}

export async function pollBackgroundRemoval(taskId: string): Promise<{ status: "running" | "success" | "error"; resultUrl?: string; errorMessage?: string }> {
  const body = await youcamJson(`${SOD_BASE}/task/sod?task_id=${encodeURIComponent(taskId)}`, { method: "GET" }, "Background-removal status");
  const result = body.result ?? body.data ?? {};
  if (result.error && !result.status) return { status: "error", errorMessage: safeMessage({ error: result.error }, "Background removal failed.") };
  if (result.status === "success") {
    const results = result.results as Array<Record<string, unknown>> | undefined;
    const first = results?.[0];
    const data = first?.data as Array<Record<string, unknown>> | undefined;
    const url = data?.[0]?.url ?? first?.url;
    return { status: "success", resultUrl: typeof url === "string" ? url : undefined };
  }
  if (result.status === "error" || result.status === "failed") {
    return { status: "error", errorMessage: safeMessage({ error: result.error }, "Background removal failed.") };
  }
  return { status: "running" };
}

export function garmentCategory(category: string): "upper_body" | "lower_body" | "full_body" {
  const normalized = category.trim().toLowerCase();
  if (["dress", "dresses", "jumpsuit", "jumpsuits", "romper", "full_body"].includes(normalized)) return "full_body";
  if (["pants", "pant", "trousers", "skirt", "skirts", "shorts", "lower_body"].includes(normalized)) return "lower_body";
  return "upper_body";
}

export function describeYouCamError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof YouCamError) {
    const lower = error.message.toLowerCase();
    if (lower.includes("pose") || lower.includes("person")) return { code: "INVALID_POSE", message: "Use a clear, upright photo of one person facing forward.", retryable: false };
    if (lower.includes("garment") || lower.includes("reference") || lower.includes("region")) return { code: "INVALID_GARMENT_REFERENCE", message: "That garment photo is not compatible with this try-on. Try the original catalog image again.", retryable: false };
    if (lower.includes("download")) return { code: "DOWNLOAD_FAILED", message: "The image could not be downloaded for processing. Please retry.", retryable: true };
    if (lower.includes("unsupported") || lower.includes("dimension") || lower.includes("size")) return { code: "UNSUPPORTED_IMAGE", message: "Use a JPG or PNG image within the supported dimensions and file size.", retryable: false };
    if (lower.includes("nsfw") || lower.includes("safety")) return { code: "SAFETY_REJECTION", message: "That photo cannot be processed. Please choose another suitable image.", retryable: false };
    if (lower.includes("insufficient") || lower.includes("unit")) return { code: "INSUFFICIENT_UNITS", message: "Virtual try-on is temporarily unavailable. Please try again later.", retryable: false };
    if (error.code === "RATE_LIMITED") return { code: error.code, message: "Try-on is busy right now. Please retry in a moment.", retryable: true };
    return { code: error.code, message: error.message || "The try-on could not be completed.", retryable: error.retryable };
  }
  return { code: "YOUCAM_ERROR", message: "The try-on could not be completed. Please retry.", retryable: true };
}
