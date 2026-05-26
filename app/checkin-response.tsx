/**
 * CheckinResponseScreen
 *
 * Tela de resposta ao check-in diário.
 * Aberta via deep link quando o usuário toca a notificação de check-in.
 *
 * - Countdown de checkinWindowMinutes × 60 segundos
 * - Botão "Estou Bem ✓" — cancela escalação, reagenda para amanhã
 * - Ao expirar: escalona para contatos de emergência, volta para /(tabs)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppContext } from '@/lib/app-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { markCheckinResponded, formatCountdown } from '@/lib/checkin-service';
import { escalateAlarmToContacts } from '@/lib/alarm-escalation';

type Status = 'waiting' | 'responded' | 'escalated';

export default function CheckinResponseScreen() {
  const router = useRouter();
  const { state } = useAppContext();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac } = useAccessibility();

  const { checkinTime, checkinWindowMinutes } = state.settings;
  const totalSeconds = checkinWindowMinutes * 60;

  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [status, setStatus] = useState<Status>('waiting');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Escalona para contatos e volta para a home
  const handleEscalate = useCallback(async () => {
    if (status !== 'waiting') return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus('escalated');

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    try {
      // Reutiliza o sistema de escalonamento existente dos alarmes
      const checkinAsAlarm = {
        id: 'checkin-daily',
        time: checkinTime,
        description: 'Check-in diário sem resposta',
        enabled: true,
        repeat: 'daily' as const,
        customDays: [],
        sound: false,
        vibration: false,
      };
      await escalateAlarmToContacts(checkinAsAlarm, state.emergencyContacts);
    } catch (error) {
      console.error('[Checkin] Escalation error:', error);
    }

    // Reagenda o timeout para amanhã mesmo após escalonar
    await markCheckinResponded(checkinTime, checkinWindowMinutes);

    // Volta para a home após 3s
    setTimeout(() => router.replace('/(tabs)'), 3000);
  }, [status, checkinTime, checkinWindowMinutes, state.emergencyContacts, router]);

  // Usuário confirmou que está bem
  const handleResponded = useCallback(async () => {
    if (status !== 'waiting') return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus('responded');

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    await markCheckinResponded(checkinTime, checkinWindowMinutes);

    // Volta para a home após 1.5s
    setTimeout(() => router.replace('/(tabs)'), 1500);
  }, [status, checkinTime, checkinWindowMinutes, router]);

  // Inicia o countdown
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          handleEscalate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [handleEscalate]);

  // --- Estado: respondido ---
  if (status === 'responded') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#E8F5E9' }]}>
        <View style={styles.centerContent}>
          <MaterialIcons name="check-circle" size={96} color="#2E7D32" />
          <Text style={[styles.statusTitle, { color: '#2E7D32' }]}>Ótimo! Que bom que está bem.</Text>
          <Text style={[styles.statusSubtitle, { color: '#388E3C' }]}>Voltando ao início...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Estado: escalonado ---
  if (status === 'escalated') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFF3E0' }]}>
        <View style={styles.centerContent}>
          <MaterialIcons name="warning" size={96} color="#E65100" />
          <Text style={[styles.statusTitle, { color: '#BF360C' }]}>Seus contatos foram notificados.</Text>
          <Text style={[styles.statusSubtitle, { color: '#E64A19' }]}>
            Seus contatos de emergência receberam um aviso de bem-estar.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Estado: aguardando resposta ---
  const bgColor = isAccessibilityMode ? ac.background : '#F1F8E9';
  const primaryColor = isAccessibilityMode ? ac.primary : '#2E7D32';
  const textColor = isAccessibilityMode ? ac.foreground : '#1B5E20';
  const mutedColor = isAccessibilityMode ? ac.muted : '#4CAF50';
  const titleSize = isAccessibilityMode ? af['3xl'] : 28;
  const subtitleSize = isAccessibilityMode ? af.md : 16;
  const buttonSize = isAccessibilityMode ? af.xl : 20;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.centerContent}>
        {/* Ícone */}
        <MaterialIcons name="favorite" size={isAccessibilityMode ? 100 : 80} color={primaryColor} />

        {/* Título */}
        <Text style={[styles.title, { color: textColor, fontSize: titleSize }]}>
          Você está bem?
        </Text>

        {/* Subtítulo */}
        <Text style={[styles.subtitle, { color: mutedColor, fontSize: subtitleSize }]}>
          Confirme que está tudo bem.{'\n'}
          Se não responder, seus contatos serão avisados.
        </Text>

        {/* Countdown */}
        <View style={[styles.countdownBox, { borderColor: primaryColor + '44' }]}>
          <Text style={[styles.countdownLabel, { color: mutedColor, fontSize: subtitleSize - 2 }]}>
            Tempo restante
          </Text>
          <Text style={[styles.countdownValue, { color: textColor, fontSize: isAccessibilityMode ? af['4xl'] : 48 }]}>
            {formatCountdown(secondsLeft)}
          </Text>
        </View>

        {/* Botão principal */}
        <Pressable
          onPress={handleResponded}
          style={({ pressed }) => [
            styles.respondButton,
            {
              backgroundColor: primaryColor,
              opacity: pressed ? 0.85 : 1,
              minHeight: isAccessibilityMode ? 80 : 64,
            },
          ]}
          accessibilityLabel="Confirmar que estou bem"
          accessibilityRole="button"
        >
          <MaterialIcons name="check" size={isAccessibilityMode ? 36 : 28} color="#FFFFFF" />
          <Text style={[styles.respondButtonText, { fontSize: buttonSize }]}>
            Estou Bem ✓
          </Text>
        </Pressable>

        {/* Aviso LGPD */}
        <Text style={[styles.disclaimer, { color: mutedColor, fontSize: subtitleSize - 2 }]}>
          Vigora não é um serviço de emergência.{'\n'}
          Em caso de emergência, ligue 192 (SAMU).
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 24,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 24,
  },
  countdownBox: {
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 16,
    gap: 4,
  },
  countdownLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countdownValue: {
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  respondButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
    borderRadius: 20,
    width: '100%',
  },
  respondButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  disclaimer: {
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.7,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
