import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureClerkProfile } from "./clerk-server";

export function jsonError(message: string, status = 400, code?: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code: code ?? "BAD_REQUEST", message }, ...extra }, { status });
}

export function safeSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() && /^\d+(\.\d{1,2})?$/.test(value.trim())) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MIN_IMAGE_WIDTH = 512;
export const MIN_IMAGE_HEIGHT = 384;
export const MAX_IMAGE_SIDE = 4096;

export function acceptedImageType(type: string): type is "image/jpeg" | "image/png" {
  return type === "image/jpeg" || type === "image/png";
}

/** Lightweight JPEG/PNG dimensions check without a native image dependency. */
export function imageDimensions(bytes: Buffer, contentType: string): { width: number; height: number } | null {
  if (contentType === "image/png" && bytes.length >= 24) {
    const signature = bytes.subarray(0, 8).toString("hex");
    if (signature === "89504e470d0a1a0a") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (contentType === "image/jpeg" && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const segmentLength = bytes.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isFrame && offset + 7 <= bytes.length) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      offset += segmentLength;
    }
  }
  return null;
}

export function validateImage(bytes: Buffer, contentType: string, options: { requireVtoDimensions?: boolean } = {}) {
  if (!acceptedImageType(contentType)) return { ok: false as const, message: "Use a JPG or PNG image.", code: "UNSUPPORTED_IMAGE" };
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return { ok: false as const, message: "Images must be smaller than 10 MB.", code: "IMAGE_TOO_LARGE" };
  const dimensions = imageDimensions(bytes, contentType);
  if (!dimensions) return { ok: false as const, message: "We could not read that image. Try a JPG or PNG photo.", code: "INVALID_IMAGE" };
  if (options.requireVtoDimensions && (Math.min(dimensions.width, dimensions.height) < MIN_IMAGE_HEIGHT || Math.max(dimensions.width, dimensions.height) < MIN_IMAGE_WIDTH || Math.max(dimensions.width, dimensions.height) > MAX_IMAGE_SIDE)) {
    return { ok: false as const, message: "Use a photo at least 384 × 512 pixels and no larger than 4096 pixels on either side.", code: "INVALID_IMAGE_DIMENSIONS" };
  }
  return { ok: true as const, dimensions };
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Resolve the Clerk user from the request cookie or Authorization bearer token. */
export async function currentUserId(_request: Request): Promise<string | null> {
  const testUserId = process.env.E2E_TEST_USER_ID?.trim();
  if (process.env.NODE_ENV !== "production" && testUserId) {
    const hostname = new URL(_request.url).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return testUserId;
    }
  }
  const { userId } = await auth();
  if (userId) await ensureClerkProfile(userId).catch(() => undefined);
  return userId;
}

export function storeOwner(store: { owner_id?: string | null }, userId: string | null) {
  if (!userId) return false;
  return store.owner_id === userId;
}
