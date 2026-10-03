import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { deleteProduct, listProducts, type Product } from '@/features/products/api';
import { ProductStrip } from '@/features/products/ProductStrip';
import { fetchProfileStats, type ProfileStats } from '@/features/profile/api';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { useAuth } from '@/lib/auth';
import { confirmAsync } from '@/lib/confirm';
import { colors } from '@/theme/colors';

export default function ProfileScreen() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [p, s] = await Promise.all([listProducts(profile.id), fetchProfileStats(profile.id)]);
      setProducts(p);
      setStats(s);
      setError(null);
    } catch {
      setError('불러오지 못했습니다.');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onDelete = async (product: Product) => {
    if (!(await confirmAsync('상품 삭제', '이 상품을 프로필에서 삭제할까요?', '삭제'))) return;
    try {
      await deleteProduct(product);
      await load();
    } catch {
      setError('삭제하지 못했습니다.');
    }
  };

  if (!profile) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        right={
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="설정"
            hitSlop={8}
          >
            <Ionicons name="menu" size={24} color={colors.text} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <ProfileHeader profile={profile} stats={stats} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>상품</Text>
          <ProductStrip
            products={products}
            editable
            onAdd={() => router.push('/product/new')}
            onDelete={onDelete}
          />
          {products.length > 0 ? <Text style={styles.hint}>상품을 길게 누르면 삭제할 수 있어요</Text> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>게시물</Text>
          <Text style={styles.muted}>3단계에서 구현</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: 8, paddingBottom: 120, gap: 18 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, paddingHorizontal: 16 },
  hint: { fontSize: 11, color: colors.tabInactive, paddingHorizontal: 16 },
  muted: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 16 },
  error: { color: colors.danger, paddingHorizontal: 16 },
});
