import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  ink: '#20211F',
  muted: '#787A74',
  paper: '#F7F5F0',
  card: '#FFFDF9',
  line: '#E6E0D6',
  accent: '#D9704A',
  accentDark: '#A9472A',
  sage: '#74886F',
  cream: '#F0E8DB',
  white: '#FFFFFF',
  danger: '#A63C3C',
};

export const Screen = ({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) => {
  const body = scroll ? (
    <ScrollView contentContainerStyle={[styles.scrollContent, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fixedContent, style]}>{children}</View>
  );
  return <SafeAreaView style={styles.safe}>{body}</SafeAreaView>;
};

export const Wordmark = ({ compact = false }: { compact?: boolean }) => (
  <View style={styles.wordmark}>
    <View style={styles.wordmarkMark}>
      <View style={styles.wordmarkLine} />
      <View style={[styles.wordmarkLine, styles.wordmarkLineShort]} />
      <View style={styles.wordmarkLine} />
    </View>
    <Text style={[styles.wordmarkText, compact && styles.wordmarkTextCompact]}>RACKSTAGE</Text>
  </View>
);

export const Button = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    disabled={disabled || loading}
    style={({ pressed }) => [
      styles.button,
      variant === 'secondary' && styles.buttonSecondary,
      variant === 'ghost' && styles.buttonGhost,
      (disabled || loading) && styles.buttonDisabled,
      pressed && styles.buttonPressed,
    ]}
  >
    {loading ? <ActivityIndicator color={variant === 'primary' ? colors.white : colors.accentDark} /> : null}
    {!loading && icon ? <Ionicons name={icon} size={18} color={variant === 'primary' ? colors.white : colors.accentDark} /> : null}
    <Text style={[styles.buttonText, variant !== 'primary' && styles.buttonTextSecondary]}>{loading ? 'Working…' : label}</Text>
  </Pressable>
);

export const Field = ({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      {...props}
      placeholderTextColor={colors.muted}
      style={[styles.input, props.multiline && styles.inputMultiline, error && styles.inputError]}
    />
    {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
  </View>
);

export const SectionTitle = ({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) => (
  <View style={styles.sectionTitle}>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
    <Text style={styles.h1}>{title}</Text>
    {detail ? <Text style={styles.detail}>{detail}</Text> : null}
  </View>
);

export const StatusPill = ({ status }: { status: string }) => {
  const normalized = status.toLowerCase();
  const label = normalized === 'processing' ? 'Processing' : normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return (
    <View style={[styles.pill, normalized === 'available' && styles.pillAvailable, normalized === 'reserved' && styles.pillReserved, normalized === 'sold' && styles.pillSold]}>
      <View style={styles.pillDot} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
};

export const ErrorNotice = ({ message }: { message: string }) => (
  <View style={styles.errorNotice}>
    <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
    <Text style={styles.errorNoticeText}>{message}</Text>
  </View>
);

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scrollContent: { padding: 22, paddingBottom: 42 },
  fixedContent: { flex: 1, padding: 22 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmarkMark: { width: 24, height: 24, justifyContent: 'space-between', paddingVertical: 2 },
  wordmarkLine: { height: 3, borderRadius: 2, backgroundColor: colors.accent, width: 23, transform: [{ rotate: '-12deg' }] },
  wordmarkLineShort: { width: 15, backgroundColor: colors.sage, alignSelf: 'flex-end' },
  wordmarkText: { fontSize: 15, color: colors.ink, letterSpacing: 2.3, fontWeight: '800' },
  wordmarkTextCompact: { fontSize: 13, letterSpacing: 1.8 },
  button: { minHeight: 52, borderRadius: 15, backgroundColor: colors.accent, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  buttonSecondary: { backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.line },
  buttonGhost: { backgroundColor: 'transparent', minHeight: 42, paddingHorizontal: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { transform: [{ scale: 0.98 }] },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700', letterSpacing: 0.15 },
  buttonTextSecondary: { color: colors.accentDark },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.2 },
  input: { minHeight: 51, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 15, color: colors.ink, fontSize: 16 },
  inputMultiline: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldHint: { marginTop: 6, color: colors.muted, fontSize: 12, lineHeight: 17 },
  fieldError: { marginTop: 6, color: colors.danger, fontSize: 12, lineHeight: 17 },
  sectionTitle: { marginTop: 22, marginBottom: 22 },
  eyebrow: { color: colors.accentDark, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 7 },
  h1: { color: colors.ink, fontSize: 31, lineHeight: 37, fontWeight: '800', letterSpacing: -0.7 },
  detail: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 9 },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.cream },
  pillAvailable: { backgroundColor: '#E0EBDD' },
  pillReserved: { backgroundColor: '#F5E3BF' },
  pillSold: { backgroundColor: '#EBD8D5' },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sage },
  pillText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  errorNotice: { borderRadius: 13, backgroundColor: '#F7E5E1', padding: 13, flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 16 },
  errorNoticeText: { flex: 1, color: colors.danger, fontSize: 13, lineHeight: 19 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, padding: 18 },
  cardEyebrow: { color: colors.accentDark, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  cardTitle: { color: colors.ink, fontSize: 21, fontWeight: '800', marginTop: 6, letterSpacing: -0.3 },
  cardDetail: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  qrWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 17 },
  choice: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 10 },
  choiceSelected: { borderColor: colors.accent, backgroundColor: '#F8E1D8' },
  choiceDisabled: { opacity: 0.7 },
  choiceText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  choiceTextSelected: { color: colors.accentDark },
  logoPicker: { minHeight: 57, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginBottom: 16 },
});
