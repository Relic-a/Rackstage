import "server-only";

import { currentUserId, storeOwner } from "./http";
import { DatabaseError, findItem, findStoreById, supabaseRest } from "./supabase-server";
import type { ItemRecord, StoreRecord } from "./types";
import { captureTokenFrom, verifyCaptureToken } from "./capture-token";

export async function storesForUser(userId: string) {
  return supabaseRest<StoreRecord[]>(`stores?owner_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc`);
}

export async function ownedStore(request: Request, requestedStoreId?: string | null): Promise<{ userId: string; store: StoreRecord } | null> {
  const capture = verifyCaptureToken(captureTokenFrom(request));
  if (capture && (!requestedStoreId || requestedStoreId === capture.storeId)) {
    const store = await findStoreById(capture.storeId);
    if (store) return { userId: `capture:${capture.nonce}`, store };
  }
  const userId = await currentUserId(request);
  if (!userId) return null;
  if (requestedStoreId) {
    const store = await findStoreById(requestedStoreId);
    return store && storeOwner(store, userId) ? { userId, store } : null;
  }
  const stores = await storesForUser(userId);
  return stores[0] ? { userId, store: stores[0] } : null;
}

export async function ownedItem(request: Request, itemId: string): Promise<{ userId: string; store: StoreRecord; item: ItemRecord } | null> {
  const item = await findItem(itemId);
  if (!item) return null;
  const store = await findStoreById(item.store_id);
  const capture = verifyCaptureToken(captureTokenFrom(request));
  if (capture?.storeId === item.store_id && store) return { userId: `capture:${capture.nonce}`, store, item };
  const userId = await currentUserId(request);
  if (!userId) return null;
  if (!store || !storeOwner(store, userId)) return null;
  return { userId, store, item };
}
