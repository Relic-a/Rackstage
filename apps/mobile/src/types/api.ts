export type GarmentCategory = 'upper_body' | 'full_body' | 'lower_body';

export type SellerCategory =
  | 'shirt'
  | 'blouse'
  | 'top'
  | 'sweater'
  | 'hoodie'
  | 'cardigan'
  | 'coat'
  | 'jacket'
  | 'dress'
  | 'jumpsuit'
  | 'pants'
  | 'trousers'
  | 'skirt';

export type ItemStatus = 'draft' | 'processing' | 'available' | 'reserved' | 'sold' | 'archived';

export type Store = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  brand_color?: string | null;
  pickup_instructions?: string | null;
  public_url?: string | null;
};

export type Item = {
  id: string;
  store_id?: string;
  category?: SellerCategory | string | null;
  youcam_category?: GarmentCategory | string | null;
  size?: string | null;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  notes?: string | null;
  status: ItemStatus;
  original_image_url?: string | null;
  catalog_image_url?: string | null;
  public_url?: string | null;
  created_at?: string;
  reserved_until?: string | null;
};

export type ProcessingJob = {
  id: string;
  item_id?: string;
  operation: 'background_removal' | 'try_on';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  error_code?: string | null;
  error_message?: string | null;
};

export type StoreResponse = { store: Store } | Store;
export type ItemResponse = { item: Item; job?: ProcessingJob | null } | Item;

const optionalString = (value: unknown): string | null => typeof value === 'string' ? value : null;

export const normalizeStore = (payload: StoreResponse): Store => {
  const raw = ('store' in payload ? payload.store : payload) as Store & Record<string, unknown>;
  return {
    ...raw,
    id: String(raw.id),
    name: String(raw.name ?? ''),
    slug: String(raw.slug ?? ''),
    logo_url: optionalString(raw.logo_url ?? raw.logoUrl),
    brand_color: optionalString(raw.brand_color ?? raw.brandColor),
    pickup_instructions: optionalString(raw.pickup_instructions ?? raw.pickupInstructions),
    public_url: optionalString(raw.public_url ?? raw.publicUrl),
  };
};

export const normalizeItem = (payload: ItemResponse): Item => {
  const raw = ('item' in payload ? payload.item : payload) as Item & Record<string, unknown>;
  const images = Array.isArray(raw.images) ? raw.images as Record<string, unknown>[] : [];
  const catalogImage = images.find((image) => image.kind === 'catalog' || image.type === 'catalog');
  const catalogImageCandidate = catalogImage?.url ?? catalogImage?.public_url;
  return {
    ...raw,
    id: String(raw.id),
    store_id: String(raw.store_id ?? raw.storeId ?? ''),
    category: optionalString(raw.category),
    youcam_category: optionalString(raw.youcam_category ?? raw.youCamCategory) as GarmentCategory | null,
    size: optionalString(raw.size),
    brand: optionalString(raw.brand),
    condition: optionalString(raw.condition),
    price: raw.price == null ? null : Number(raw.price),
    notes: optionalString(raw.notes),
    status: (raw.status ?? raw.state ?? 'draft') as ItemStatus,
    original_image_url: optionalString(raw.original_image_url ?? raw.originalImageUrl ?? raw.original_image),
    catalog_image_url: optionalString(raw.catalog_image_url ?? raw.catalogImageUrl ?? raw.catalog_url ?? raw.catalog_image ?? catalogImageCandidate),
    public_url: optionalString(raw.public_url ?? raw.publicUrl),
    reserved_until: optionalString(raw.reserved_until ?? raw.reservedUntil),
  };
};

export const sellerCategoryOptions: { label: string; value: SellerCategory; youcam: GarmentCategory }[] = [
  { label: 'Shirt', value: 'shirt', youcam: 'upper_body' },
  { label: 'Blouse', value: 'blouse', youcam: 'upper_body' },
  { label: 'Top', value: 'top', youcam: 'upper_body' },
  { label: 'Sweater', value: 'sweater', youcam: 'upper_body' },
  { label: 'Hoodie', value: 'hoodie', youcam: 'upper_body' },
  { label: 'Cardigan', value: 'cardigan', youcam: 'upper_body' },
  { label: 'Coat', value: 'coat', youcam: 'upper_body' },
  { label: 'Jacket', value: 'jacket', youcam: 'upper_body' },
  { label: 'Dress', value: 'dress', youcam: 'full_body' },
  { label: 'Jumpsuit', value: 'jumpsuit', youcam: 'full_body' },
  { label: 'Pants', value: 'pants', youcam: 'lower_body' },
  { label: 'Trousers', value: 'trousers', youcam: 'lower_body' },
  { label: 'Skirt', value: 'skirt', youcam: 'lower_body' },
];

export const youCamCategoryFor = (category: SellerCategory): GarmentCategory =>
  sellerCategoryOptions.find((option) => option.value === category)?.youcam ?? 'upper_body';
