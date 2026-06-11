/**
 * AppLockScreen — tela de desbloqueio (PIN + biometria).
 *
 * Renderizada como overlay pelo AppLockGate (não é rota), então cobre o app
 * inteiro preservando o estado de navegação por baixo. Comportamentos:
 * - Auto-dispara a biometria ao aparecer (se habilitada e disponível).
 * - PIN com submit automático no 4º dígito.
 * - Cooldown de 30s após 5 erros (lib/app-lock-core.ts), com contagem visível.
 * - "Esqueci o PIN" → sair da conta (única recuperação possível: o PIN não é
 *   recuperável e a senha da conta pode nem existir em logins Google/Apple).
 * - Botão voltar (Android) é bloqueado: voltar navegaria o app destravado
 *   por baixo do overlay.
 */
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { PinDots, PinKeypad } from '@/components/pin-keypad';
import { useColors } from '@/hooks/use-colors';
import { useAuth } from '@/hooks/use-auth';
import { useAccessibility } from '@/lib/accessibility-context';
import { useAppLock } from '@/lib/app-lock-context';
import { attemptCooldownMs, PIN_LENGTH } from '@/lib/app-lock-core';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';

export function AppLockScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yFontSize: af } = useAccessibility();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dialogProps, showDialog } = useAppDialog();
  const { logout } = useAuth({ autoFetch: false });
  const {
    attempts,
    biometricAvailable,
    biometricEnabled,
    unlockWithBiometrics,
    unlockWithPin,
  } = useAppLock();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const submittingRef = useRef(false);

  const biometricUsable = biometricAvailable && biometricEnabled;

  // Contagem regressiva do cooldown (re-renderiza 1×/s só enquanto ativo).
  useEffect(() => {
    const update = () => {
      const remaining = Math.ceil(attemptCooldownMs(attempts, Date.now()) / 1000);
      setCooldownSeconds(remaining);
      return remaining;
    };
    if (update() <= 0) return;
    const interval = setInterval(() => {
      if (update() <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [attempts]);

  // Auto-prompt da biometria ao aparecer a tela.
  useEffect(() => {
    if (!biometricUsable) return;
    const timer = setTimeout(() => {
      unlockWithBiometrics();
    }, 350);
    return () => clearTimeout(timer);
    // Dispara só na montagem: re-tentar a cada render irritaria o usuário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bloqueia o botão voltar do Android enquanto travado.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const submitPin = useCallback(
    async (fullPin: string) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        const result = await unlockWithPin(fullPin);
        if (result === 'ok') return; // gate desmonta a tela
        setPin('');
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        setError(
          result === 'cooldown'
            ? 'Muitas tentativas. Aguarde um pouco para tentar de novo.'
            : 'PIN incorreto. Tente de novo.',
        );
      } finally {
        submittingRef.current = false;
      }
    },
    [unlockWithPin],
  );

  // Submit automático no 4º dígito. Fica num effect (não dentro do updater
  // do setPin) para nunca disparar duas vezes em renderização concorrente;
  // submittingRef cobre re-renders enquanto o unlock está em andamento.
  useEffect(() => {
    if (pin.length === PIN_LENGTH) submitPin(pin);
  }, [pin, submitPin]);

  const handleDigit = (digit: string) => {
    if (cooldownSeconds > 0) return;
    setError(null);
    setPin((prev) => (prev.length >= PIN_LENGTH ? prev : prev + digit));
  };

  const handleBackspace = () => {
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  const handleForgotPin = () => {
    showDialog({
      title: 'Esqueceu o PIN?',
      message:
        'Para criar um PIN novo, você vai sair da conta e entrar de novo. Seus dados continuam salvos.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair da conta',
          style: 'destructive',
          onPress: async () => {
            // Navega primeiro: o overlay continua cobrindo até o logout limpar
            // o bloqueio (via clearAppLockStorage), sem flash do conteúdo.
            router.replace('/login');
            await logout();
          },
        },
      ],
    });
  };

  const titleSize = isAccessibilityMode ? af['3xl'] : fs.scaled(34);
  const subtitleSize = isAccessibilityMode ? af.md : fs.md;
  const helperSize = isAccessibilityMode ? af.sm : fs.base;

  return (
    <View
      style={[
        styles.overlay,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.logoBadge, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name="lock" size={30} color={colors.primary} />
        </View>
        <Text
          style={{
            fontFamily: BrandFonts.display,
            fontSize: titleSize,
            color: colors.foreground,
          }}
        >
          Vigora
        </Text>
        <Text style={{ fontSize: subtitleSize, color: colors.muted, textAlign: 'center' }}>
          Digite seu PIN para desbloquear
        </Text>
      </View>

      <View style={styles.middle}>
        <PinDots filled={pin.length} error={error != null} />
        <Text
          style={{
            fontSize: helperSize,
            color: cooldownSeconds > 0 ? colors.warningDark : colors.error,
            textAlign: 'center',
            minHeight: helperSize * 2.6,
            paddingHorizontal: 24,
          }}
        >
          {cooldownSeconds > 0
            ? `Muitas tentativas. Aguarde ${cooldownSeconds}s para tentar de novo.`
            : (error ?? '')}
        </Text>
      </View>

      <PinKeypad
        onDigit={handleDigit}
        onBackspace={handleBackspace}
        onBiometric={biometricUsable ? () => unlockWithBiometrics() : undefined}
        disabled={cooldownSeconds > 0}
      />

      <Pressable
        onPress={handleForgotPin}
        accessibilityRole="button"
        accessibilityLabel="Esqueci o PIN"
        style={({ pressed }) => [styles.forgotButton, pressed && { opacity: 0.6 }]}
      >
        <Text style={{ fontSize: helperSize, fontWeight: '600', color: colors.primary }}>
          Esqueci o PIN
        </Text>
      </Pressable>

      <AppDialog {...dialogProps} />
    </View>
  );
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  middle: {
    alignItems: 'center',
    gap: 16,
  },
  forgotButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
