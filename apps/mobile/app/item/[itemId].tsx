import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, ErrorNotice, Screen, StatusPill, colors, styles } from '@/components/ui';
import { API_BASE_URL } from '@/lib/config';
import { getItem } from '@/lib/api';
import { useStore } from '@/providers/store';
import { Item } from '@/types/api';

export default function SellerItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { store, lastItem, saveLastItem } = useStore();
  const [item, setItem] = useState<Item | null>(lastItem?.id === itemId ? lastItem : null);
  const [loading, setLoading] = useState(!item);
  const [error, setError] = useState('');
  const fetchAttempted = useRef(false);
  const publicUrl = useMemo(() => item?.public_url ?? (store ? `${API_BASE_URL}/store/${store.slug}/item/${itemId}` : ''), [item?.public_url, itemId, store]);

  useEffect(() => {
    if (!itemId || (item && item.catalog_image_url) || fetchAttempted.current) return;
    fetchAttempted.current = true;
    getItem(itemId).then((loaded) => { setItem(loaded); void saveLastItem(loaded); }).catch((cause) => setError(cause instanceof Error ? cause.message : 'We could not load this item.')).finally(() => setLoading(false));
  }, [item, itemId, saveLastItem]);

  if (loading) return <Screen scroll={false} style={{ alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></Screen>;
  if (!item) return <Screen><ErrorNotice message={error || 'This item could not be found.'} /><Button label="Back to home" onPress={() => router.replace('/dashboard')} /></Screen>;

  const details = [
    ['Category', item.category],
    ['Size', item.size],
    ['Brand', item.brand],
    ['Condition', item.condition],
  ].filter(([, value]) => Boolean(value));

  return <Screen>
    <Pressable onPress={() => router.back()} style={{ marginTop: 5, marginBottom: 18 }}><Text style={{ color: colors.accentDark, fontWeight: '800', fontSize: 14 }}>‹ Back to seller home</Text></Pressable>
    <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: colors.cream, aspectRatio: 1.05, alignItems: 'center', justifyContent: 'center' }}>
      {item.catalog_image_url ? <Image source={{ uri: item.catalog_image_url }} alt={`${item.brand || 'Garment'} catalog image`} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : <View style={{ alignItems: 'center', padding: 20 }}><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>Catalog image processing…</Text></View>}
    </View>
    <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={styles.eyebrow}>Published item</Text><StatusPill status={item.status} /></View>
    <Text style={{ color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: '800', marginTop: 7 }}>{item.brand || 'Untitled garment'}</Text>
    <Text style={{ color: colors.ink, fontSize: 19, fontWeight: '700', marginTop: 5 }}>{item.price != null ? `$${Number(item.price).toFixed(2)}` : 'Price not set'}</Text>
    <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: 19, paddingTop: 17, gap: 10 }}>{details.map(([label, value]) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{value}</Text></View>)}</View>
    {item.notes ? <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 17 }}>{item.notes}</Text> : null}
    <View style={{ marginTop: 24 }}><Button label="View public item page" onPress={() => publicUrl && void Linking.openURL(publicUrl)} icon="open-outline" /></View>
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 14 }}>The shopper page includes virtual try-on and pickup reservation when this item is available.</Text>
  </Screen>;
}
