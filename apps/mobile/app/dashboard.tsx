import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { router } from 'expo-router';
import { Button, ErrorNotice, Screen, SectionTitle, StatusPill, Wordmark, colors, styles } from '@/components/ui';
import { API_BASE_URL } from '@/lib/config';
import { useAuth } from '@/providers/auth';
import { useStore } from '@/providers/store';

export default function DashboardScreen() {
  const { signOut } = useAuth();
  const { store, lastItem, clearStore } = useStore();
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const storefrontUrl = useMemo(() => store?.public_url ?? `${API_BASE_URL}/store/${store?.slug ?? ''}`, [store?.public_url, store?.slug]);

  if (!store) return null;

  const leave = async () => {
    setSigningOut(true);
    try {
      await signOut();
      await clearStore();
      router.replace('/sign-in');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
        <Wordmark compact />
        <Pressable accessibilityRole="button" onPress={leave} disabled={signingOut}><Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>{signingOut ? 'Signing out…' : 'Sign out'}</Text></Pressable>
      </View>
      <SectionTitle eyebrow="Seller home" title={`Good to see you, ${store.name}.`} detail="Photograph a garment and get it in front of shoppers in under a minute." />
      {error ? <ErrorNotice message={error} /> : null}
      <View style={[styles.card, { borderColor: store.brand_color ?? colors.line, borderTopWidth: 4 }]}>
        <Text style={styles.cardEyebrow}>Your storefront</Text>
        <Text style={styles.cardTitle}>{store.name}</Text>
        <Text style={styles.cardDetail}>rackstage.app/store/{store.slug}</Text>
        <View style={styles.qrWrap}><QRCode value={storefrontUrl} size={128} color={colors.ink} backgroundColor={colors.card} /></View>
        <Button label="Open storefront" onPress={() => void Linking.openURL(storefrontUrl)} variant="secondary" icon="open-outline" />
      </View>
      {lastItem ? <View style={[styles.card, { marginTop: 15 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}><Text style={styles.cardEyebrow}>Latest item</Text><StatusPill status={lastItem.status} /></View>
        <Text style={styles.cardTitle}>{lastItem.brand || 'Untitled garment'}</Text>
        <Text style={styles.cardDetail}>{lastItem.category || 'Garment'}{lastItem.size ? ` · ${lastItem.size}` : ''}{lastItem.price != null ? ` · $${Number(lastItem.price).toFixed(0)}` : ''}</Text>
        <Button label="View item" onPress={() => router.push({ pathname: '/item/[itemId]', params: { itemId: lastItem.id } })} variant="ghost" icon="arrow-forward" />
      </View> : null}
      <View style={{ marginTop: 18 }}><Button label="Add a garment" onPress={() => router.push('/add-garment')} icon="camera-outline" /></View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16 }}>Each RackStage item is one unique physical garment.</Text>
    </Screen>
  );
}
