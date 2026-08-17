import { useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, ErrorNotice, Field, Screen, SectionTitle, colors, styles } from '@/components/ui';
import { createDraft, getItem, publishItem } from '@/lib/api';
import { useStore } from '@/providers/store';
import { Item, SellerCategory, normalizeItem, sellerCategoryOptions } from '@/types/api';

type Photo = { uri: string; width?: number; height?: number };

const requiredFileSize = 10 * 1024 * 1024;

export default function AddGarmentScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const activeTokenRef = useRef<string | null>(null);
  const { store, saveLastItem } = useStore();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [requestToken, setRequestToken] = useState<string | null>(null);
  const [category, setCategory] = useState<SellerCategory | ''>('');
  const [size, setSize] = useState('');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<'camera' | 'form'>('camera');
  const [draftStarted, setDraftStarted] = useState(false);
  const [processingStarted, setProcessingStarted] = useState(false);
  const [draft, setDraft] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [pollCount, setPollCount] = useState(0);

  const catalogReady = Boolean(draft?.catalog_image_url) || draft?.status === 'available';

  useEffect(() => {
    if (!permission || permission.granted || permission.canAskAgain === false) return;
    requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!processingStarted || !draft?.id || catalogReady) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await getItem(draft.id);
        if (!cancelled) {
          setDraft(next);
          setPollCount((value) => value + 1);
          setPollError('');
        }
      } catch (cause) {
        if (!cancelled) {
          setPollCount((value) => value + 1);
          setPollError(cause instanceof Error ? cause.message : 'We are still waiting for the catalog image.');
        }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [catalogReady, draft?.id, processingStarted]);

  const takePhoto = async () => {
    setError('');
    try {
      const result = await cameraRef.current?.takePictureAsync({ quality: 0.9, skipProcessing: false, exif: false });
      if (!result?.uri) return;
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || (info.size ?? 0) > requiredFileSize) {
        setError('That photo is over 10 MB. Retake it with a smaller image.');
        return;
      }
      setPhoto({ uri: result.uri, width: result.width, height: result.height });
      const nextRequestToken = randomUUID();
      activeTokenRef.current = nextRequestToken;
      setRequestToken(nextRequestToken);
      setPhase('form');
      setProcessingStarted(true);
      void startProcessing({ uri: result.uri, width: result.width, height: result.height }, nextRequestToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The camera could not capture that photo.');
    }
  };

  const startProcessing = async (photoOverride?: Photo, tokenOverride?: string) => {
    const sourcePhoto = photoOverride ?? photo;
    if (!store || !sourcePhoto) return;
    setError('');
    setBusy(true);
    try {
      const response = await createDraft({
        uri: sourcePhoto.uri,
        storeId: store.id,
        requestToken: tokenOverride ?? requestToken ?? undefined,
      });
      if (activeTokenRef.current !== (tokenOverride ?? requestToken)) return;
      const created = normalizeItem(response);
      setDraft(created);
      setDraftStarted(true);
      await saveLastItem(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not start background removal. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setError('');
    if (!draft?.id || !category) return setError('Choose a category first.');
    if (!size.trim() || !brand.trim() || !condition.trim() || !price.trim()) return setError('Add size, brand, condition, and price before publishing.');
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return setError('Enter a price greater than zero, such as 48 or 48.00.');
    if (!catalogReady) return setError('Your catalog image is still processing. You can publish as soon as it is ready.');
    setBusy(true);
    try {
      const publishedResponse = await publishItem(draft.id, { category, size: size.trim(), brand: brand.trim(), condition: condition.trim(), price: String(parsedPrice), notes: notes.trim() });
      // The publish response may intentionally omit a short-lived signed image
      // URL. Keep the one already fetched while processing for the handoff.
      const published = { ...publishedResponse, catalog_image_url: publishedResponse.catalog_image_url ?? draft.catalog_image_url };
      setDraft(published);
      await saveLastItem(published);
      router.replace({ pathname: '/item/[itemId]', params: { itemId: published.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not publish this item yet.');
    } finally {
      setBusy(false);
    }
  };

  if (!permission?.granted && phase === 'camera') {
    return <Screen scroll={false} style={{ justifyContent: 'center' }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 70, height: 70, borderRadius: 23, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}><Ionicons name="camera-outline" size={33} color={colors.accentDark} /></View>
        <Text style={{ color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', textAlign: 'center' }}>Camera access helps you get started.</Text>
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, marginBottom: 25 }}>RackStage only uses it to photograph a garment you choose to list.</Text>
        {error ? <ErrorNotice message={error} /> : null}
        {permission?.canAskAgain !== false ? <Button label="Allow camera" onPress={() => void requestPermission()} icon="camera-outline" /> : <Button label="Open settings" onPress={() => void Linking.openSettings()} variant="secondary" icon="settings-outline" />}
        <Button label="Back" onPress={() => router.back()} variant="ghost" />
      </View>
    </Screen>;
  }

  if (phase === 'camera') {
    return <View style={{ flex: 1, backgroundColor: '#111' }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
        <View style={{ flex: 1, padding: 22, justifyContent: 'space-between' }}>
          <View style={{ marginTop: 20 }}><Pressable onPress={() => router.back()} style={{ width: 43, height: 43, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={24} color={colors.white} /></Pressable></View>
          <View style={{ backgroundColor: 'rgba(0,0,0,0.56)', borderRadius: 17, padding: 17, marginBottom: 26 }}>
            <Text style={{ color: colors.white, fontSize: 18, fontWeight: '800', marginBottom: 9 }}>One garment, clearly framed.</Text>
            <Text style={{ color: '#EDEAE5', fontSize: 14, lineHeight: 21 }}>• Photograph one garment{`\n`}• Show the complete garment{`\n`}• Use a clear, evenly lit background{`\n`}• Keep hands and other garments out of frame</Text>
          </View>
          <View style={{ alignItems: 'center', paddingBottom: 12 }}>
            {error ? <View style={{ width: '100%' }}><ErrorNotice message={error} /></View> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Take garment photo" onPress={() => void takePhoto()} style={({ pressed }) => [{ width: 78, height: 78, borderRadius: 39, borderWidth: 7, borderColor: colors.white, backgroundColor: colors.accent }, pressed && { transform: [{ scale: 0.95 }] }]} />
          </View>
        </View>
      </CameraView>
    </View>;
  }

  return <Screen>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
      <Pressable onPress={() => { activeTokenRef.current = null; setPhoto(null); setRequestToken(null); setPhase('camera'); setDraft(null); setDraftStarted(false); setProcessingStarted(false); }}><Text style={{ color: colors.accentDark, fontWeight: '800', fontSize: 14 }}>Retake</Text></Pressable>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>New garment</Text>
      <Pressable onPress={() => router.back()}><Text style={{ color: colors.muted, fontWeight: '700', fontSize: 14 }}>Close</Text></Pressable>
    </View>
    <View style={{ marginTop: 17, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.cream, aspectRatio: 1.15 }}><Image source={{ uri: photo?.uri }} alt="Original garment preview" style={{ width: '100%', height: '100%' }} resizeMode="contain" /></View>
    <SectionTitle eyebrow={processingStarted ? 'Catalog details' : 'Step 1 · Start with category'} title={processingStarted ? 'Finish the listing while we work.' : 'What kind of garment is this?'} detail={processingStarted ? 'Background removal runs on the server. Keep filling in the details below.' : 'This maps to the correct YouCam garment category for virtual try-on.'} />
    {error ? <ErrorNotice message={error} /> : null}
    <Text style={styles.fieldLabel}>Category</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {sellerCategoryOptions.map((option) => <Pressable key={option.value} onPress={() => setCategory(option.value)} style={[styles.choice, category === option.value && styles.choiceSelected]}><Text style={[styles.choiceText, category === option.value && styles.choiceTextSelected]}>{option.label}</Text></Pressable>)}
    </View>
    {processingStarted ? <View style={{ borderRadius: 13, backgroundColor: catalogReady ? '#E0EBDD' : colors.cream, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 17 }}><Ionicons name={catalogReady ? 'checkmark-circle-outline' : 'sparkles-outline'} size={20} color={catalogReady ? colors.sage : colors.accentDark} /><Text style={{ flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 }}>{catalogReady ? 'Catalog image ready. Review your details and publish when you’re happy.' : draftStarted ? 'Removing the background now. This usually takes under a minute.' : 'Saving the original and starting background removal…'}</Text></View> : null}
    <Field label="Size" placeholder="M, 10, or One size" value={size} onChangeText={setSize} />
    <Field label="Brand" placeholder="Brand or unbranded" value={brand} onChangeText={setBrand} />
    <Field label="Condition" placeholder="Excellent, good, worn…" value={condition} onChangeText={setCondition} />
    <Field label="Price" placeholder="48.00" value={price} onChangeText={(value) => setPrice(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
    <Field label="Notes (optional)" placeholder="Fabric, fit, provenance, or a small detail shoppers should know." value={notes} onChangeText={setNotes} multiline />
    {processingStarted && !draftStarted && error ? <Button label="Retry background removal" onPress={() => void startProcessing()} loading={busy} variant="secondary" icon="refresh-outline" /> : null}
    <Button label="Publish item" onPress={publish} loading={busy} disabled={!catalogReady || !draft?.id} icon="arrow-up-circle-outline" />
    {draftStarted && pollError && pollCount > 2 ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 }}>We’re still checking the processing status. Keep this screen open and try again in a moment.</Text> : null}
    <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 15 }}>RackStage keeps the original photo private for your records. Shopper photos stay private too.</Text>
  </Screen>;
}
