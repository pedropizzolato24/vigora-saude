/**
 * UpdateBanner — aviso amigável de versão nova na loja.
 *
 * Roda uma única verificação por abertura do app (cold start) e, se houver
 * versão mais nova na Play Store / App Store, mostra um cartão flutuante
 * dispensável no rodapé. Nunca bloqueia o uso: sem botão de "forçar",
 * sem modal, e some na sessão ao tocar "Agora não".
 *
 * Fica oculto nas telas de alarme/check-in (prioridade absoluta do dead
 * man's switch) e no funil de login/onboarding. Montado em app/_layout.tsx
 * ANTES do AppLockGate, então a tela de bloqueio cobre o aviso.
 */
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { checkForStoreUpdate, openStorePage, type UpdateInfo } from '@/lib/app-update-check';
import { useFontSize } from '@/lib/font-size-context';

// Telas onde o aviso nunca aparece: alarme/check-in (nada pode competir com
// eles) e o funil de entrada (login/onboarding/registro).
const HIDDEN_PATHS = [
  '/alarm-ring',
  '/checkin-response',
  '/login',
  '/email-login',
  '/phone-login',
  '/register',
  '/onboarding',
  '/caregiver-onboarding',
  '/oauthredirect',
  '/convite',
  '/app-lock-setup',
];

export function UpdateBanner() {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yFontSize: af } = useAccessibility();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    checkForStoreUpdate().then((info) => {
      if (!cancelled && info) setUpdateInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!updateInfo || dismissed) return null;
  if (HIDDEN_PATHS.some((path) => pathname?.startsWith(path))) return null;

  const titleSize = isAccessibilityMode ? af.md : fs.md;
  const bodySize = isAccessibilityMode ? af.sm : fs.base;
  const buttonSize = isAccessibilityMode ? af.md : fs.md;
  const buttonMinHeight = isAccessibilityMode ? 60 : 48;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          bottom: insets.bottom + 88,
        },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconBadge, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name="system-update" size={26} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: titleSize, fontWeight: '800', color: colors.foreground }}>
            Tem uma versão nova do Vigora!
          </Text>
          <Text style={{ fontSize: bodySize, color: colors.muted, lineHeight: bodySize * 1.4 }}>
            Atualize para deixar o app mais seguro e funcionando ainda melhor.
          </Text>
        </View>
      </View>
      <View style={styles.buttonsRow}>
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel="Agora não"
          style={({ pressed }) => [
            styles.button,
            {
              minHeight: buttonMinHeight,
              borderWidth: 1.5,
              borderColor: colors.border,
              backgroundColor: 'transparent',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ fontSize: buttonSize, fontWeight: '600', color: colors.muted }}>
            Agora não
          </Text>
        </Pressable>
        <Pressable
          onPress={() => openStorePage(updateInfo.storeUrl)}
          accessibilityRole="button"
          accessibilityLabel="Atualizar o aplicativo"
          style={({ pressed }) => [
            styles.button,
            {
              minHeight: buttonMinHeight,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={{ fontSize: buttonSize, fontWeight: '700', color: colors.onPrimary }}>
            Atualizar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    // Abaixo do AppLockGate (zIndex 1000): a tela de bloqueio cobre o aviso.
    zIndex: 900,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
