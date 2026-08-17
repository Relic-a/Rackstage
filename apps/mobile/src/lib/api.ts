import { getClerkInstance } from '@clerk/expo';
import { API_BASE_URL } from './config';
import { ItemResponse, Store, StoreResponse, normalizeItem, normalizeStore } from '../types/api';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const errorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === 'object') {
    const value = payload as Record<string, unknown>;
    const message = value.message ?? value.error;
    if (typeof message === 'string' && message.length > 0 && message.length < 500) return message;
    if (message && typeof message === 'object' && typeof (message as Record<string, unknown>).message === 'string') {
      return String((message as Record<string, unknown>).message);
    }
  }
  return fallback;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const token = await getClerkInstance().session?.getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const parsed = typeof payload === 'string' ? undefined : payload;
    const value = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined;
    const nested = value?.error && typeof value.error === 'object' ? value.error as Record<string, unknown> : undefined;
    throw new ApiError(errorMessage(parsed, `Request failed (${response.status})`), response.status, typeof (value?.code ?? nested?.code) === 'string' ? String(value?.code ?? nested?.code) : undefined);
  }
  return payload as T;
};

export type StoreInput = Pick<Store, 'name' | 'slug' | 'logo_url' | 'brand_color' | 'pickup_instructions'>;

export type LogoUpload = { uri: string; name?: string; type?: string };

export const createStore = async (input: StoreInput, logo?: LogoUpload | null) => {
  if (logo) {
    const form = new FormData();
    form.append('name', input.name);
    form.append('slug', input.slug);
    if (input.brand_color) form.append('brand_color', input.brand_color);
    if (input.pickup_instructions) form.append('pickup_instructions', input.pickup_instructions);
    form.append('logo', { uri: logo.uri, name: logo.name ?? 'store-logo.jpg', type: logo.type ?? 'image/jpeg' } as unknown as Blob);
    return normalizeStore(await request<StoreResponse>('/api/stores', { method: 'POST', body: form }));
  }
  return normalizeStore(await request<StoreResponse>('/api/stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }));
};

export const listStores = async () => {
  const response = await request<{ stores?: Store[] }>('/api/stores');
  return (response.stores ?? []).map((store) => normalizeStore(store));
};

export const getPublicLink = async (slug: string) => request<{ url?: string; public_url?: string; qr_code_url?: string }>(`/api/stores/${encodeURIComponent(slug)}/public-link`);

export type DraftInput = {
  uri: string;
  fileName?: string;
  mimeType?: string;
  storeId: string;
  requestToken?: string;
  category?: string;
  youcamCategory?: string;
  size?: string;
  brand?: string;
  condition?: string;
  price?: string;
  notes?: string;
};

export const createDraft = async (input: DraftInput) => {
  const form = new FormData();
  form.append('original', { uri: input.uri, name: input.fileName ?? 'garment.jpg', type: input.mimeType ?? 'image/jpeg' } as unknown as Blob);
  form.append('store_id', input.storeId);
  if (input.requestToken) form.append('request_token', input.requestToken);
  if (input.category) form.append('category', input.category);
  if (input.youcamCategory) form.append('youcam_category', input.youcamCategory);
  if (input.size) form.append('size', input.size);
  if (input.brand) form.append('brand', input.brand);
  if (input.condition) form.append('condition', input.condition);
  if (input.price) form.append('price', input.price);
  if (input.notes) form.append('notes', input.notes);
  return request<ItemResponse & { job?: unknown }>('/api/items/create-draft', { method: 'POST', body: form });
};

export const getItem = async (itemId: string) => normalizeItem(await request<ItemResponse>(`/api/items/${encodeURIComponent(itemId)}`));

export const publishItem = async (itemId: string, input: Omit<DraftInput, 'uri' | 'fileName' | 'mimeType' | 'storeId' | 'youcamCategory'> & { category: string }) => normalizeItem(await request<ItemResponse>(`/api/items/${encodeURIComponent(itemId)}/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
}));
