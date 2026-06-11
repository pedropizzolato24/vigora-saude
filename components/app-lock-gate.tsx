/**
 * AppLockGate — monta o overlay de bloqueio acima do Stack (app/_layout.tsx).
 *
 * Isenções críticas: /alarm-ring e /checkin-response NUNCA são cobertas.
 * O idoso precisa conseguir responder ao alarme/check-in mesmo com o app
 * travado — senão o dead man's switch escalaria por engano para os contatos
 * de emergência. Ao sair dessas telas, o bloqueio reaparece (status continua
 * 'locked' no contexto).
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { AppLockScreen } from '@/components/app-lock-screen';
import { useColors } from '@/hooks/use-colors';
import { useAppLock } from '@/lib/app-lock-context';

const EXEMPT_PATHS = ['/alarm-ring', '/checkin-response'];

export function AppLockGate() {
  const { status } = useAppLock();
  const pathname = usePathname();
  const colors = useColors();

  if (Platform.OS === 'web') return null;
  if (status === 'unlocked') return null;
  if (EXEMPT_PATHS.some((path) => pathname?.startsWith(path))) return null;

  if (status === 'loading') {
    // Cobre o conteúdo até sabermos se o bloqueio está ativo no cold start
    // (evita flash de dados de saúde antes da tela de PIN).
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.background, zIndex: 1000, elevation: 24 },
        ]}
      />
    );
  }

  return <AppLockScreen />;
}
