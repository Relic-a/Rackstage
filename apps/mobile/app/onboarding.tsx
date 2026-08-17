import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, ErrorNotice, Field, Screen, SectionTitle, Wordmark, colors, styles } from '@/components/ui';
import { createStore } from '@/lib/api';
import { slugify } from '@/lib/slug';
import { useStore } from '@/providers/store';

export default function OnboardingScreen() {
  const { store, saveStore } = useStore();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [logo, setLogo] = useState<{ uri: string; name?: string; type?: string } | null>(null);
  const [brandColor, setBrandColor] = useState('#D9704A');
  const [pickup, setPickup] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (store) router.replace('/dashboard');
  }, [store]);

  const updateName = (value: string) => {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  };

  const submit = async () => {
    setError('');
    const cleanName = name.trim();
    const cleanSlug = slugify(slug);
    if (cleanName.length < 2) return setError('Add your store name to continue.');
    if (cleanSlug.length < 3) return setError('Choose a store slug with at least 3 letters or numbers.');
    if (!/^#[0-9a-f]{6}$/i.test(brandColor.trim())) return setError('Brand color must be a 6-digit hex value, like #D9704A.');
    setBusy(true);
    try {
      const created = await createStore({ name: cleanName, slug: cleanSlug, logo_url: null, brand_color: brandColor.trim().toUpperCase(), pickup_instructions: pickup.trim() || null }, logo);
      await saveStore(created);
      router.replace('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not create your storefront. Try another slug.');
    } finally {
      setBusy(false);
    }
  };

  const selectLogo = async () => {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo access to choose a logo, or continue without one.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.85, exif: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
      setError('Choose a logo smaller than 10 MB.');
      return;
    }
    setLogo({ uri: asset.uri, name: asset.fileName ?? 'store-logo.jpg', type: asset.mimeType ?? 'image/jpeg' });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: 13 }}><Wordmark /></View>
        <SectionTitle eyebrow="Set up your storefront" title="Make your rack feel like yours." detail="Start with the essentials. You can update these details later from the web storefront." />
        {error ? <ErrorNotice message={error} /> : null}
        <Field label="Store name" placeholder="Vintage Vault" value={name} onChangeText={updateName} autoCapitalize="words" />
        <Field label="Store link" placeholder="vintage-vault" value={slug} onChangeText={(value) => { setSlugEdited(true); setSlug(slugify(value)); }} autoCapitalize="none" autoCorrect={false} hint="This becomes rackstage.app/store/your-slug." />
        <Field label="Brand color" placeholder="#D9704A" value={brandColor} onChangeText={setBrandColor} autoCapitalize="characters" hint="A small accent for your public storefront." />
        <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>Logo (optional)</Text>
        {logo ? <View style={{ height: 95, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, marginBottom: 16, padding: 10, flexDirection: 'row', alignItems: 'center' }}><Image source={{ uri: logo.uri }} alt="Store logo preview" style={{ width: 75, height: 75, borderRadius: 10 }} /><View style={{ flex: 1, marginLeft: 13 }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>Ready to upload</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>Your square logo will appear on the storefront.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove logo" onPress={() => setLogo(null)}><Ionicons name="close-circle-outline" size={24} color={colors.muted} /></Pressable></View> : <Pressable onPress={() => void selectLogo()} style={({ pressed }) => [styles.logoPicker, pressed && { opacity: 0.7 }]}><Ionicons name="image-outline" size={21} color={colors.accentDark} /><Text style={{ color: colors.accentDark, fontSize: 14, fontWeight: '700' }}>Choose a logo photo</Text></Pressable>}
        <Field label="Pickup instructions (optional)" placeholder="Pick up during opening hours at the front desk." value={pickup} onChangeText={setPickup} multiline />
        <Button label="Create my storefront" onPress={submit} loading={busy} icon="sparkles-outline" />
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 15 }}>Your public page will only show items you publish.</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
