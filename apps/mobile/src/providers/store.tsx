import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Store, Item } from '../types/api';
import { useAuth } from './auth';
import { listStores } from '../lib/api';

type StoreContextValue = {
  store: Store | null;
  loading: boolean;
  lastItem: Item | null;
  saveStore: (store: Store) => Promise<void>;
  saveLastItem: (item: Item | null) => Promise<void>;
  clearStore: () => Promise<void>;
};

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [lastItem, setLastItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const key = session?.user.id ? `rackstage:store:${session.user.id}` : null;

  useEffect(() => {
    let alive = true;
    if (!key) {
      setStore(null);
      setLastItem(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    AsyncStorage.getItem(key).then(async (raw) => {
      if (!alive) return;
      let cachedLastItem: Item | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { store?: Store; lastItem?: Item | null };
          setStore(parsed.store ?? null);
          cachedLastItem = parsed.lastItem ?? null;
          setLastItem(cachedLastItem);
        } catch {
          setStore(null);
          setLastItem(null);
        }
      }
      // Recover the seller's store after a reinstall or cleared local cache.
      // The server remains authoritative; the local copy is only a fast route
      // guard and keeps the dashboard usable while offline.
      try {
        const remoteStores = await listStores();
        if (alive && remoteStores[0]) {
          setStore(remoteStores[0]);
          await AsyncStorage.setItem(key, JSON.stringify({ store: remoteStores[0], lastItem: cachedLastItem }));
        }
      } catch {
        // Keep any locally cached store and let onboarding handle a genuinely
        // new seller or an unavailable API.
      }
      setLoading(false);
    }).catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const persist = useCallback(async (nextStore: Store | null, nextItem: Item | null) => {
    if (!key) return;
    await AsyncStorage.setItem(key, JSON.stringify({ store: nextStore, lastItem: nextItem }));
  }, [key]);

  const value = useMemo<StoreContextValue>(() => ({
    store,
    loading,
    lastItem,
    saveStore: async (nextStore) => {
      setStore(nextStore);
      await persist(nextStore, lastItem);
    },
    saveLastItem: async (nextItem) => {
      setLastItem(nextItem);
      await persist(store, nextItem);
    },
    clearStore: async () => {
      setStore(null);
      setLastItem(null);
      if (key) await AsyncStorage.removeItem(key);
    },
  }), [key, lastItem, loading, persist, store]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside StoreProvider');
  return context;
};
