import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

import { productHost, productImageUrl, type Product } from './api';

type Props = {
  products: Product[];
  /** 내 프로필: 맨 앞에 "상품 추가" 칸, 길게 누르면 삭제 */
  editable?: boolean;
  onAdd?: () => void;
  onDelete?: (product: Product) => void;
};

const CARD = 92;

/** 프로필 상단의 상품 줄 (이미지 + 링크). 누르면 상품 링크로 이동 */
export function ProductStrip({ products, editable, onAdd, onDelete }: Props) {
  if (!editable && products.length === 0) {
    return <Text style={styles.empty}>등록한 상품이 없어요</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {editable ? (
        <Pressable onPress={onAdd} style={styles.card} accessibilityRole="button" accessibilityLabel="상품 추가">
          <View style={[styles.image, styles.add]}>
            <Ionicons name="add" size={28} color={colors.textMuted} />
          </View>
          <Text style={styles.caption}>상품 추가</Text>
        </Pressable>
      ) : null}
      {products.map((p) => (
        <Pressable
          key={p.id}
          style={styles.card}
          onPress={() => void Linking.openURL(p.url)}
          onLongPress={editable && onDelete ? () => onDelete(p) : undefined}
          accessibilityRole="link"
          accessibilityLabel={`상품 링크 ${productHost(p.url)}`}
          accessibilityHint={editable ? '길게 누르면 삭제' : undefined}
        >
          <Image source={{ uri: productImageUrl(p.image_path) }} style={styles.image} contentFit="cover" transition={150} />
          <Text style={styles.caption} numberOfLines={1}>
            {productHost(p.url)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16 },
  card: { width: CARD, gap: 4 },
  image: { width: CARD, height: CARD, borderRadius: 10, backgroundColor: colors.surface },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  caption: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  empty: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 16 },
});
