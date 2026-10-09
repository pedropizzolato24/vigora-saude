import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
import { relativeTime } from '@/lib/caregiver-format';
import { useFontSize } from '@/lib/font-size-context';

/**
 * Puxar para atualizar.
 *
 * No Android o ScrollView faz `cloneElement(refreshControl, { style }, <NativeScrollView>…</NativeScrollView>)`:
 * o elemento precisa repassar `children` e `style` ao RefreshControl, senão o conteúdo da tela some.
 */
export function CaregiverRefreshControl({
  refreshing,
  onRefresh,
  ...rest
}: { refreshing: boolean; onRefresh: () => void } & Omit<
  React.ComponentProps<typeof RefreshControl>,
  'refreshing' | 'onRefresh'
>) {
  const colors = useColors();
  return (
    <RefreshControl
      {...rest}
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );
}

/** "Atualizado há 3 min" + botão de atualizar (mesmo gesto do botão da tela do monitorado). */
export function UpdatedAgoBar({
  updatedAt,
  refreshing,
  onRefresh,
}: {
  /** `dataUpdatedAt` da consulta (epoch-ms); 0 enquanto nunca carregou. */
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  // Re-renderiza a cada 30 s para o "há X min" não ficar parado.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const muted = isAccessibilityMode ? ac.muted : colors.muted;
  const primary = isAccessibilityMode ? ac.primary : colors.primary;
  const label = updatedAt > 0 ? `Atualizado ${relativeTime(updatedAt)}` : 'Atualizando…';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: muted, fontSize: isAccessibilityMode ? af.sm : fs.sm, fontFamily: BrandFonts.body }}>
        {label}
      </Text>
      <Pressable
        onPress={onRefresh}
        disabled={refreshing}
        accessibilityRole="button"
        accessibilityLabel="Atualizar agora"
        hitSlop={8}
        style={({ pressed }) => ({
          minWidth: isAccessibilityMode ? 60 : 44,
          minHeight: isAccessibilityMode ? 60 : 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed || refreshing ? 0.6 : 1,
        })}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={primary} />
        ) : (
          <MaterialIcons name="refresh" size={isAccessibilityMode ? 32 : 24} color={primary} />
        )}
      </Pressable>
    </View>
  );
}
