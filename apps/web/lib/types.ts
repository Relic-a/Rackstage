export type ItemState = "draft" | "processing" | "available" | "reserved" | "sold" | "archived";
export type ProcessingStatus = "pending" | "running" | "succeeded" | "failed";
export type TryOnStatus = "pending" | "uploading" | "processing" | "succeeded" | "failed" | "expired";

export type StoreRecord = {
  id: string;
  name: string;
  slug: string;
  logo_path?: string | null;
  brand_color?: string | null;
  pickup_instructions?: string | null;
  owner_id?: string | null;
  is_public?: boolean;
  created_at?: string;
};

export type ItemRecord = {
  id: string;
  store_id: string;
  client_request_token?: string | null;
  category: string | null;
  youcam_category: "upper_body" | "full_body" | "lower_body" | null;
  size: string | null;
  brand: string | null;
  condition: string | null;
  price: number | string | null;
  currency?: string;
  notes?: string | null;
  status?: ItemState | null;
  reserved_until?: string | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ItemImageRecord = {
  id: string;
  item_id: string;
  kind: "original" | "catalog";
  storage_path: string;
  mime_type: "image/jpeg" | "image/png";
  width: number;
  height: number;
  bytes: number;
  is_public: boolean;
  created_at?: string;
};

export type ProcessingJobRecord = {
  id: string;
  store_id: string;
  item_id?: string | null;
  try_on_session_id?: string | null;
  operation: "background_removal" | "try_on";
  youcam_task_id?: string | null;
  status: ProcessingStatus;
  attempt_count?: number;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

export type TryOnSessionRecord = {
  id: string;
  item_id: string;
  store_id: string;
  source_storage_path?: string | null;
  result_storage_path?: string | null;
  youcam_task_id?: string | null;
  status: TryOnStatus;
  error_code?: string | null;
  error_message?: string | null;
  expires_at?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

export type PublicItem = ItemRecord & {
  display_state: Exclude<ItemState, "draft" | "processing" | "archived">;
  catalog_image: string | null;
};
