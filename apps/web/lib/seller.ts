import "server-only";

import { currentUserId, storeOwner } from "./http";
import { DatabaseError, findItem, findStoreById, supabaseRest } from "./supabase-server";
import type { ItemRecord, StoreRecord } from "./types";

export async function storesForUser(userId: string) {
  return supabaseRest<StoreRecord[]>(`stores?owner_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc`);
}

export async function ownedStore(request: Request, requestedStoreId?: string | null): Promise<{ userId: string; store: StoreRecord } | null> {
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
  const userId = await currentUserId(request);
  if (!userId) return null;
  const item = await findItem(itemId);
  if (!item) return null;
  const store = await findStoreById(item.store_id);
  if (!store || !storeOwner(store, userId)) return null;
  return { userId, store, item };
}
