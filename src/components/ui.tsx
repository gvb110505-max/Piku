import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { colors } from '@/theme/colors';

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
};

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const inactive = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.ghost,
        pressed && primary && { backgroundColor: colors.callPressed },
        inactive && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.onCall : colors.text} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? colors.onCall : colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.tabInactive} {...props} style={[styles.field, props.style]} />;
}

export function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primary: { backgroundColor: colors.call },
  ghost: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  field: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 14 },
});
