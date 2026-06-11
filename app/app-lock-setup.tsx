/**
 * app/app-lock-setup.tsx — configuração do bloqueio de app.
 *
 * Dois modos (via query param `mode`):
 * - padrão: criar PIN (digitar + confirmar) e ativar o bloqueio, com oferta
 *   de biometria quando o aparelho tiver digital/rosto cadastrado;
 * - `?mode=disable`: confirmar o PIN atual (ou biometria) para desativar.
 *
 * Aberto pelos toggles "Bloquear app ao sair" nas Configurações do idoso e
 * do cuidador. O toggle reflete `useAppLock().enabled`, então abandonar esta
 * tela no meio não deixa estado pela metade.
 */
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { PinDots, PinKeypad } from '@/components/pin-keypad';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { useAppLock } from '@/lib/app-lock-context';
import { PIN_LENGTH } from '@/lib/app-lock-core';
import { useFontSize } from '@/lib/font-size-context';

export default function AppLockSetupScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yFontSize: af } = useAccessibility();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { dialogProps, showDialog } = useAppDialog();
  const {
    biometricAvailable,
    biometricEnabled,
    disableLock,
    enableLock,
    unlockWithBiometrics,
    unlockWithPin,
  } = useAppLock();

  const mode: 'setup' | 'disable' = params.mode === 'disable' ? 'disable' : 'setup';

  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const finishSetup = async (finalPin: string, useBiometric: boolean) => {
    await enableLock(finalPin, useBiometric);
    showDialog({
      title: 'Bloqueio ativado',
      message: 'Pronto! Agora o app vai pedir seu PIN sempre que for aberto.',
      variant: 'success',
      buttons: [{ text: 'OK', onPress: () => router.back() }],
    });
  };

  const finishDisable = async () => {
    await disableLock();
    showDialog({
      title: 'Bloqueio desativado',
      message: 'O app não vai mais pedir PIN ao abrir.',
      variant: 'success',
      buttons: [{ text: 'OK', onPress: () => router.back() }],
    });
  };

  const handlePinComplete = async (fullPin: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (mode === 'disable') {
        // Reusa unlockWithPin de propósito: erros aqui também contam para o
        // throttle de tentativas (desativar exige provar que sabe o PIN).
        // O setStatus('unlocked') interno é no-op: se o app estivesse
        // travado, o overlay do AppLockGate cobriria esta tela.
        const result = await unlockWithPin(fullPin);
        if (result === 'ok') {
          await finishDisable();
          return;
        }
        setPin('');
        setError(
          result === 'cooldown'
            ? 'Muitas tentativas. Aguarde um pouco para tentar de novo.'
            : 'PIN incorreto. Tente de novo.',
        );
        return;
      }

      if (step === 'create') {
        setFirstPin(fullPin);
        setPin('');
        setStep('confirm');
        return;
      }

      // step === 'confirm'
      if (fullPin !== firstPin) {
        setPin('');
        setFirstPin('');
        setStep('create');
        setError('Os PINs não são iguais. Vamos começar de novo.');
        return;
      }

      // Zera os dígitos antes do diálogo/ativação: garante que o submit do
      // useEffect não re-dispare com o PIN completo em nenhum re-render.
      setPin('');

      if (biometricAvailable) {
        showDialog({
          title: 'Usar biometria?',
          message:
            'Você pode desbloquear com sua digital ou com seu rosto, sem precisar digitar o PIN.',
          variant: 'confirm',
          buttons: [
            { text: 'Agora não', style: 'cancel', onPress: () => finishSetup(fullPin, false) },
            { text: 'Usar biometria', onPress: () => finishSetup(fullPin, true) },
          ],
        });
      } else {
        await finishSetup(fullPin, false);
      }
    } finally {
      busyRef.current = false;
    }
  };

  // Submit automático no 4º dígito — em effect (não dentro do updater do
  // setPin) para nunca disparar duas vezes em renderização concorrente.
  React.useEffect(() => {
    if (pin.length === PIN_LENGTH) handlePinComplete(pin);
    // handlePinComplete muda de identidade a cada render; só o pin importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleDigit = (digit: string) => {
    setError(null);
    setPin((prev) => (prev.length >= PIN_LENGTH ? prev : prev + digit));
  };

  const handleBiometricDisable = async () => {
    if (await unlockWithBiometrics()) {
      await finishDisable();
    }
  };

  const copy =
    mode === 'disable'
      ? {
          title: 'Digite seu PIN atual',
          subtitle: 'Para desativar o bloqueio do app.',
        }
      : step === 'create'
        ? {
            title: 'Crie um PIN de 4 números',
            subtitle: 'Você vai usar esse número para abrir o app.',
          }
        : {
            title: 'Digite o PIN de novo',
            subtitle: 'Só para confirmar que ficou certo.',
          };

  const titleSize = isAccessibilityMode ? af.xl : fs['2xl'];
  const subtitleSize = isAccessibilityMode ? af.md : fs.md;
  const helperSize = isAccessibilityMode ? af.sm : fs.base;

  return (
    <ScreenContainer>
      {/* Header com voltar */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: isAccessibilityMode ? af.lg : fs.lg, fontWeight: '700', color: colors.foreground }}>
          Bloqueio do app
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.instructions}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primaryLight }]}>
            <MaterialIcons
              name={mode === 'disable' ? 'lock-open' : 'lock'}
              size={28}
              color={colors.primary}
            />
          </View>
          <Text
            style={{
              fontSize: titleSize,
              fontWeight: '800',
              color: colors.foreground,
              textAlign: 'center',
            }}
          >
            {copy.title}
          </Text>
          <Text style={{ fontSize: subtitleSize, color: colors.muted, textAlign: 'center' }}>
            {copy.subtitle}
          </Text>
        </View>

        <View style={styles.middle}>
          <PinDots filled={pin.length} error={error != null} />
          <Text
            style={{
              fontSize: helperSize,
              color: colors.error,
              textAlign: 'center',
              minHeight: helperSize * 2.6,
              paddingHorizontal: 24,
            }}
          >
            {error ?? ''}
          </Text>
        </View>

        <PinKeypad
          onDigit={handleDigit}
          onBackspace={() => {
            setError(null);
            setPin((prev) => prev.slice(0, -1));
          }}
          onBiometric={
            mode === 'disable' && biometricAvailable && biometricEnabled
              ? handleBiometricDisable
              : undefined
          }
        />
      </View>

      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  instructions: {
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  middle: {
    alignItems: 'center',
    gap: 12,
  },
});
