import { describe, expect, it } from "vitest";
import {
  canPublishItem,
  canTransitionItemStatus,
  imageUploadInputSchema,
  itemCreateDraftSchema,
  mapSellerCategoryToYouCam,
  sellerCategorySchema,
  slugifyStoreName,
  suggestStoreSlug,
  youCamErrorMessage,
} from "./index";

describe("RackStage shared business rules", () => {
  it("maps seller categories deterministically for YouCam", () => {
    expect(mapSellerCategoryToYouCam("shirt")).toBe("upper_body");
    expect(mapSellerCategoryToYouCam("dress")).toBe("full_body");
    expect(mapSellerCategoryToYouCam("pants")).toBe("lower_body");
    expect(sellerCategorySchema.safeParse("shoes").success).toBe(false);
  });

  it("creates a readable, collision-aware slug suggestion", () => {
    expect(slugifyStoreName("  Café & Vintage! ")).toBe("cafe-vintage");
    expect(suggestStoreSlug("Café & Vintage!", ["cafe-vintage"])).toBe(
      "cafe-vintage-2",
    );
  });

  it("only allows intended inventory transitions", () => {
    expect(canTransitionItemStatus("available", "reserved")).toBe(true);
    expect(canTransitionItemStatus("available", "sold")).toBe(false);
    expect(canTransitionItemStatus("reserved", "available")).toBe(true);
  });

  it("requires catalog image and valid form data before publishing", () => {
    const form = {
      category: "jacket",
      size: "M",
      brand: "Vintage label",
      condition: "Excellent",
      price: 42.5,
      currency: "USD",
      notes: null,
    };
    expect(
      canPublishItem({ status: "processing", hasCatalogImage: true, form }),
    ).toBe(true);
    expect(
      canPublishItem({ status: "processing", hasCatalogImage: false, form }),
    ).toBe(false);
  });

  it("does not expose provider error text", () => {
    expect(youCamErrorMessage("invalid_source_pose")).toMatch(/upright/);
    expect(youCamErrorMessage("provider-secret-detail")).toMatch(/failed/);
  });

  it("accepts YouCam minimum dimensions in either orientation", () => {
    const base = { fileName: "shopper.jpg", mimeType: "image/jpeg" as const, bytes: 500_000 };
    expect(imageUploadInputSchema.safeParse({ ...base, width: 512, height: 384 }).success).toBe(true);
    expect(imageUploadInputSchema.safeParse({ ...base, width: 384, height: 512 }).success).toBe(true);
    expect(imageUploadInputSchema.safeParse({ ...base, width: 383, height: 700 }).success).toBe(false);
  });

  it("keeps create-draft details optional while requiring idempotency", () => {
    const result = itemCreateDraftSchema.safeParse({
      storeId: "00000000-0000-4000-8000-000000000001",
      clientRequestToken: "00000000-0000-4000-8000-000000000002",
      image: {
        fileName: "garment.jpg",
        mimeType: "image/jpeg",
        bytes: 1000,
        width: 512,
        height: 384,
      },
    });
    expect(result.success).toBe(true);
  });
});
