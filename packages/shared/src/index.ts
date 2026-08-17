import { z } from "zod";

/** Values accepted by the seller form. They intentionally stay small and map
 * deterministically to the categories accepted by YouCam Apparel VTO V3. */
export const sellerCategorySchema = z.enum([
  "shirt",
  "blouse",
  "top",
  "sweater",
  "hoodie",
  "cardigan",
  "coat",
  "jacket",
  "dress",
  "jumpsuit",
  "pants",
  "trousers",
  "skirt",
]);
export type SellerCategory = z.infer<typeof sellerCategorySchema>;

export const youCamGarmentCategorySchema = z.enum([
  "upper_body",
  "full_body",
  "lower_body",
]);
export type YouCamGarmentCategory = z.infer<typeof youCamGarmentCategorySchema>;

const upperBodyCategories = new Set<SellerCategory>([
  "shirt",
  "blouse",
  "top",
  "sweater",
  "hoodie",
  "cardigan",
  "coat",
  "jacket",
]);
const fullBodyCategories = new Set<SellerCategory>(["dress", "jumpsuit"]);

/** Deterministic seller-category to YouCam-category mapping. */
export function mapSellerCategoryToYouCam(
  category: SellerCategory,
): YouCamGarmentCategory {
  if (upperBodyCategories.has(category)) return "upper_body";
  if (fullBodyCategories.has(category)) return "full_body";
  return "lower_body";
}

export const itemStatusSchema = z.enum([
  "draft",
  "processing",
  "available",
  "reserved",
  "sold",
  "archived",
]);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const processingOperationSchema = z.enum([
  "background_removal",
  "try_on",
]);
export type ProcessingOperation = z.infer<typeof processingOperationSchema>;

export const processingStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
]);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

export const tryOnStatusSchema = z.enum([
  "pending",
  "uploading",
  "processing",
  "succeeded",
  "failed",
  "expired",
]);
export type TryOnStatus = z.infer<typeof tryOnStatusSchema>;

export const reservationStatusSchema = z.enum([
  "active",
  "cancelled",
  "expired",
  "completed",
]);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const itemImageKindSchema = z.enum(["original", "catalog"]);
export type ItemImageKind = z.infer<typeof itemImageKindSchema>;

export const imageMimeTypeSchema = z.enum(["image/jpeg", "image/png"]);
export type ImageMimeType = z.infer<typeof imageMimeTypeSchema>;

export const MAX_YOUCAM_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_YOUCAM_IMAGE_SIDE = 4096;
// YouCam's 512 × 384 minimum is orientation-neutral: accept portrait images
// when the short side is at least 384 and the long side is at least 512.
export const MIN_YOUCAM_IMAGE_SHORT_SIDE = 384;
export const MIN_YOUCAM_IMAGE_LONG_SIDE = 512;

export const imageUploadInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: imageMimeTypeSchema,
  bytes: z.number().int().positive().max(MAX_YOUCAM_FILE_BYTES),
  width: z.number().int().positive().max(MAX_YOUCAM_IMAGE_SIDE),
  height: z.number().int().positive().max(MAX_YOUCAM_IMAGE_SIDE),
}).refine(
  ({ width, height }) =>
    Math.min(width, height) >= MIN_YOUCAM_IMAGE_SHORT_SIDE &&
    Math.max(width, height) >= MIN_YOUCAM_IMAGE_LONG_SIDE,
  "Image must be at least 512 × 384 pixels in either orientation",
);
export type ImageUploadInput = z.infer<typeof imageUploadInputSchema>;

export function validateYouCamImage(input: ImageUploadInput): {
  ok: true;
} | { ok: false; reason: "file_type" | "file_size" | "dimensions" } {
  if (!imageMimeTypeSchema.safeParse(input.mimeType).success) {
    return { ok: false, reason: "file_type" };
  }
  if (input.bytes > MAX_YOUCAM_FILE_BYTES) {
    return { ok: false, reason: "file_size" };
  }
  if (
    Math.min(input.width, input.height) < MIN_YOUCAM_IMAGE_SHORT_SIDE ||
    Math.max(input.width, input.height) < MIN_YOUCAM_IMAGE_LONG_SIDE ||
    input.width > MAX_YOUCAM_IMAGE_SIDE ||
    input.height > MAX_YOUCAM_IMAGE_SIDE
  ) {
    return { ok: false, reason: "dimensions" };
  }
  return { ok: true };
}

export const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens");

export function slugifyStoreName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug || "store";
}

/**
 * Suggest a slug without claiming uniqueness. The database unique constraint
 * remains authoritative; the caller should suffix/retry on a conflict.
 */
export function suggestStoreSlug(
  storeName: string,
  takenSlugs: Iterable<string> = [],
): string {
  const taken = new Set(Array.from(takenSlugs, (value) => value.toLowerCase()));
  const base = slugifyStoreName(storeName);
  if (!taken.has(base) && base.length >= 3) return base;
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const suffixText = `-${suffix}`;
    const candidate = `${base.slice(0, 64 - suffixText.length)}${suffixText}`;
    if (!taken.has(candidate) && candidate.length >= 3) return candidate;
  }
  return `${base.slice(0, 58)}-${Date.now().toString(36).slice(-5)}`;
}

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color");

export const storeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema.optional(),
  logoPath: z.string().trim().max(500).optional().nullable(),
  brandColor: hexColorSchema.optional().nullable(),
  pickupInstructions: z.string().trim().max(1000).optional().nullable(),
});
export type StoreInput = z.infer<typeof storeInputSchema>;

export const storeSchema = storeInputSchema.extend({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  slug: slugSchema,
  isPublic: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Store = z.infer<typeof storeSchema>;

export const itemFormSchema = z.object({
  category: sellerCategorySchema,
  size: z.string().trim().min(1).max(40),
  brand: z.string().trim().min(1).max(100),
  condition: z.string().trim().min(1).max(80),
  price: z.coerce
    .number()
    .finite()
    .positive()
    .max(1_000_000)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Use at most two decimals"),
  notes: z.string().trim().max(2000).optional().nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
});
export type ItemForm = z.infer<typeof itemFormSchema>;

export const clientRequestTokenSchema = z.string().uuid();

/** Multipart create-draft contract. Details are optional because the seller
 * can complete them while background removal is running. */
export const itemCreateDraftSchema = z.object({
  storeId: z.string().uuid(),
  clientRequestToken: clientRequestTokenSchema,
  image: imageUploadInputSchema,
  category: sellerCategorySchema.optional().nullable(),
  size: z.string().trim().min(1).max(40).optional().nullable(),
  brand: z.string().trim().min(1).max(100).optional().nullable(),
  condition: z.string().trim().min(1).max(80).optional().nullable(),
  price: z.coerce.number().finite().positive().max(1_000_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().nullable(),
});
export type ItemCreateDraft = z.infer<typeof itemCreateDraftSchema>;

export const itemSchema = itemFormSchema.extend({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  youCamCategory: youCamGarmentCategorySchema,
  status: itemStatusSchema,
  reservedUntil: z.coerce.date().nullable(),
  publishedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Item = z.infer<typeof itemSchema>;

export const itemImageSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  kind: itemImageKindSchema,
  storagePath: z.string().min(1).max(1000),
  mimeType: imageMimeTypeSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  isPublic: z.boolean(),
  createdAt: z.coerce.date(),
});
export type ItemImage = z.infer<typeof itemImageSchema>;

export const processingJobSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  itemId: z.string().uuid().nullable(),
  tryOnSessionId: z.string().uuid().nullable(),
  operation: processingOperationSchema,
  youCamTaskId: z.string().trim().max(200).nullable(),
  status: processingStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  errorCode: z.string().trim().max(120).nullable(),
  errorMessage: z.string().trim().max(1000).nullable(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});
export type ProcessingJob = z.infer<typeof processingJobSchema>;

export const tryOnSessionSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  storeId: z.string().uuid(),
  sourceStoragePath: z.string().trim().max(1000).nullable(),
  resultStoragePath: z.string().trim().max(1000).nullable(),
  youCamTaskId: z.string().trim().max(200).nullable(),
  status: tryOnStatusSchema,
  errorCode: z.string().trim().max(120).nullable(),
  errorMessage: z.string().trim().max(1000).nullable(),
  expiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});
export type TryOnSession = z.infer<typeof tryOnSessionSchema>;

export const reservationInputSchema = z.object({
  itemId: z.string().uuid(),
  requestToken: z.string().uuid().optional(),
  buyerName: z.string().trim().min(1).max(120),
  buyerContact: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type ReservationInput = z.infer<typeof reservationInputSchema>;

export const reservationSchema = reservationInputSchema.extend({
  id: z.string().uuid(),
  requestToken: z.string().uuid(),
  status: reservationStatusSchema,
  reservedUntil: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Reservation = z.infer<typeof reservationSchema>;

export const publicItemSchema = itemSchema.pick({
  id: true,
  storeId: true,
  category: true,
  youCamCategory: true,
  size: true,
  brand: true,
  condition: true,
  price: true,
  currency: true,
  notes: true,
  status: true,
  reservedUntil: true,
  publishedAt: true,
});
export type PublicItem = z.infer<typeof publicItemSchema>;

export const vtoSessionCreateSchema = z.object({
  itemId: z.string().uuid(),
  image: imageUploadInputSchema,
});
export type VtoSessionCreate = z.infer<typeof vtoSessionCreateSchema>;

export const vtoSessionStatusSchema = z.object({
  sessionId: z.string().uuid(),
  status: tryOnStatusSchema,
  resultUrl: z.string().url().nullable().optional(),
  error: z.string().max(1000).nullable().optional(),
});
export type VtoSessionStatus = z.infer<typeof vtoSessionStatusSchema>;

export const youCamErrorCodeSchema = z.enum([
  "invalid_source_pose",
  "invalid_garment_reference",
  "garment_region_mismatch",
  "unsupported_image",
  "image_too_large",
  "download_failed",
  "nsfw_rejected",
  "processing_failed",
  "rate_limited",
  "insufficient_units",
  "unknown",
]);
export type YouCamErrorCode = z.infer<typeof youCamErrorCodeSchema>;

const YOUCAM_ERROR_MESSAGES: Record<YouCamErrorCode, string> = {
  invalid_source_pose: "Use a clear, upright, forward-facing photo of one person.",
  invalid_garment_reference: "This garment photo could not be used. Try a single, front-facing garment on a clear background.",
  garment_region_mismatch: "The garment category does not match the selected item. Try another photo or category.",
  unsupported_image: "Use a JPG or PNG image within the supported dimensions.",
  image_too_large: "That image is too large. Choose an image under 10 MB.",
  download_failed: "The image could not be downloaded for processing. Please retry.",
  nsfw_rejected: "This photo could not be processed. Please choose a different photo.",
  processing_failed: "Virtual try-on could not finish. Please retry with another suitable photo.",
  rate_limited: "Try-on is busy right now. Please wait a moment and retry.",
  insufficient_units: "Virtual try-on is temporarily unavailable. Please try again later.",
  unknown: "Virtual try-on failed. Please retry.",
};

/** Convert documented/provider error codes to a safe shopper-facing message. */
export function youCamErrorMessage(code: string | null | undefined): string {
  const parsed = youCamErrorCodeSchema.safeParse(code);
  return YOUCAM_ERROR_MESSAGES[parsed.success ? parsed.data : "unknown"];
}

const itemTransitions: Record<ItemStatus, readonly ItemStatus[]> = {
  draft: ["processing", "available", "archived"],
  processing: ["draft", "available", "archived"],
  available: ["reserved", "archived"],
  reserved: ["available", "sold", "archived"],
  sold: ["archived"],
  archived: [],
};

export function canTransitionItemStatus(
  from: ItemStatus,
  to: ItemStatus,
): boolean {
  return itemTransitions[from].includes(to);
}

export function canPublishItem(input: {
  status: ItemStatus;
  hasCatalogImage: boolean;
  form: unknown;
}): boolean {
  return (
    (input.status === "draft" || input.status === "processing") &&
    input.hasCatalogImage &&
    itemFormSchema.safeParse(input.form).success
  );
}

export const apiErrorSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(1000),
  retryable: z.boolean().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export function apiError(
  code: string,
  message: string,
  retryable = false,
): ApiError {
  return { code, message, retryable };
}
