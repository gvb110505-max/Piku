import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ErrorText, Field } from '@/components/ui';
import { createProduct, normalizeProductUrl, ProductError, type PickedImage } from '@/features/products/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme/colors';

/** 상품 추가: 사진 1장 + 상품 링크 → 프로필 상단에 표시 */
export default function NewProductScreen() {
  const { profile } = useAuth();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setImage({ uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize });
  };

  const submit = async () => {
    if (!profile) return;
    if (!image) {
      setError('상품 사진을 선택해 주세요.');
      return;
    }
    const url = normalizeProductUrl(link);
    if (!url) {
      setError('상품 링크를 확인해 주세요. (예: https://smartstore.naver.com/...)');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createProduct(profile.id, url, image);
      router.back();
    } catch (e) {
      setError(e instanceof ProductError ? e.message : '상품을 등록하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="상품 추가" icon="close" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.row}>
            <Pressable
              onPress={pick}
              style={styles.picker}
              accessibilityRole="button"
              accessibilityLabel={image ? '상품 사진 바꾸기' : '상품 사진 선택'}
            >
              {image ? (
                <Image source={{ uri: image.uri }} style={styles.preview} contentFit="cover" />
              ) : (
                <>
                  <Ionicons name="image-outline" size={26} color={colors.textMuted} />
                  <Text style={styles.pickerText}>사진 선택</Text>
                </>
              )}
            </Pressable>
            <View style={styles.fields}>
              <Text style={styles.label}>상품 링크</Text>
              <Field
                value={link}
                onChangeText={(t) => {
                  setLink(t);
                  if (error) setError(null);
                }}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                returnKeyType="done"
                onSubmitEditing={submit}
                accessibilityLabel="상품 링크"
                style={styles.field}
              />
              <Text style={styles.help}>스마트스토어 · 쿠팡 · 도매 사이트 등 상품 페이지 주소</Text>
            </View>
          </View>
          <ErrorText>{error}</ErrorText>
          <Button title="게시" onPress={submit} loading={saving} disabled={!image || !link.trim()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const PICKER = 104;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  picker: {
    width: PICKER,
    height: PICKER,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  preview: { width: '100%', height: '100%' },
  pickerText: { fontSize: 12, color: colors.textMuted },
  fields: { flex: 1, gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  field: { height: 44, fontSize: 15 },
  help: { fontSize: 11, color: colors.textMuted },
});
