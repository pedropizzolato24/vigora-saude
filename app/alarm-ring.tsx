/**
 * AlarmRingScreen
 *
 * Full-screen alarm experience:
 * - Plays alarm sound on loop for up to 30 seconds
 * - Pulsing alarm icon
 * - Shows alarm name and description
 * - Reads alarm name and description aloud via expo-speech (pt-BR)
 * - "Ouvir novamente" button to replay speech
 * - Countdown timer (30s) - when it reaches 0, sends WhatsApp to all emergency contacts
 * - Large dismiss button
 * - Accessibility mode: larger elements, high contrast, simplified layout
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Vibration,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useAppContext } from '@/lib/app-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { useColors } from '@/hooks/use-colors';
import { escalateAlarmToContacts } from '@/lib/alarm-escalation';
import { stopNativeAlarm, snoozeNativeAlarm } from '@/lib/native-alarm-manager';
import { PulseView } from '@/components/animated-components';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadAlarmTimer, clearAlarmTimer } from '@/lib/alarm-timer-store';
import { lastAlarmFireMs } from '@/lib/alarm-fire-times';
import { updateAlarmWidgetOnDismiss } from '@/lib/update-widgets';
import { confirmAlarmResponded, confirmAlarmMissed, createPendingAlarmEvent } from '@/lib/monitoring-service';

const ALARM_SOUND = require('@/assets/alarm.mp3');
const COUNTDOWN_SECONDS = 30;
const SNOOZE_MINUTES = 5;

// Builds the speech text for the alarm announcement
function buildSpeechText(alarmDescription?: string, alarmTime?: string): string {
  const parts: string[] = [];
  parts.push('Atenção! Alarme de medicamento.');
  if (alarmTime) {
    parts.push(`Horário: ${alarmTime.replace(':', ' horas e ')} minutos.`);
  }
  if (alarmDescription) {
    parts.push(alarmDescription);
  }
  parts.push('Toque em Desligar Alarme para confirmar que tomou o medicamento.');
  return parts.join(' ');
}

export default function AlarmRingScreen() {
  const router = useRouter();
  const { alarmId, expiresAt: expiresAtParam } = useLocalSearchParams<{ alarmId: string; expiresAt?: string }>();
  const { state, dispatch } = useAppContext();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac } = useAccessibility();
  const colors = useColors();

  const alarm = state.alarms.find((a) => a.id === alarmId);
  // Initialize with the configured duration; will be overridden by persisted timer on mount.
  // Note: configuredDuration from state may be stale if state hasn't loaded yet.
  // The initTimer function reads from AsyncStorage directly as fallback.
  const configuredDuration: number = state.settings.timerDuration ?? 30;
  const [secondsLeft, setSecondsLeft] = useState<number>(configuredDuration);
  const [escalated, setEscalated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const escalationDoneRef = useRef(false);
  const expiresAtRef = useRef<number | null>(null);
  // Timeout que dispara a fala (TTS). Guardado em ref para ser cancelado no
  // dismiss/unmount — senão ele fala depois que o usuário já saiu da tela (#8).
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Marca que o alarme foi respondido, para não retomar o som do alarme depois
  // que a fala termina/para (o handler onDone/onStopped roda de forma assíncrona).
  const dismissedRef = useRef(false);

  // scheduledAt canônico (hora real do disparo) — usado para casar com o evento
  // pré-registrado no servidor. Confirmar com new Date() não batia e o alarme
  // respondido virava "pendente"/"não tocou" (#12.2).
  const canonicalScheduledAt = () =>
    new Date((alarm && lastAlarmFireMs(alarm)) || Date.now());

  // Audio player
  const player = useAudioPlayer(ALARM_SOUND);

  // Speak alarm info aloud - uses speechRate and speechVolume from settings.
  // Pausa o som do alarme durante a fala (em vez de só abaixar): o loop do alarme
  // disputava o foco de áudio e deixava a voz quase inaudível (#7). Ao terminar,
  // retoma o alarme — a menos que o usuário já tenha respondido.
  const speakAlarm = useCallback(() => {
    if (Platform.OS === 'web') return;
    const text = buildSpeechText(alarm?.description, alarm?.time);
    const speechVol = (state.settings.speechVolume ?? 90) / 100;
    const speechRate = state.settings.speechRate ?? 0.75;

    const resumeAlarm = () => {
      if (dismissedRef.current) return;
      try { player.play(); } catch {}
    };

    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'pt-BR',
      rate: speechRate,
      pitch: 1.0,
      volume: speechVol,
      onStart: () => {
        setIsSpeaking(true);
        // Silencia o alarme para a voz ser claramente ouvida
        try { player.pause(); } catch {}
      },
      onDone: () => {
        setIsSpeaking(false);
        resumeAlarm();
      },
      onStopped: () => {
        setIsSpeaking(false);
        resumeAlarm();
      },
      onError: () => {
        setIsSpeaking(false);
        resumeAlarm();
      },
    });
  }, [alarm, state.settings, player]);

  // Start audio, vibration, and speech on mount
  useEffect(() => {
    const startAlarm = async () => {
      try {
        if (Platform.OS !== 'web') {
          // Stop the native alarm sound (expo-alarm-module plays its own audio)
          // so that expo-audio takes full control of the alarm sound
          try { await stopNativeAlarm(); } catch {}

          // Must await setAudioModeAsync before play() to ensure silent mode override
          await setAudioModeAsync({ playsInSilentMode: true });
          // Set loop and seek to start before playing
          player.loop = true;
          player.seekTo(0);
          player.play();

          // Set volume AFTER play() - expo-audio requires the player to be
          // actively playing before volume changes take effect
          setTimeout(() => {
            try { player.volume = (state.settings.alarmVolume ?? 80) / 100; } catch {}
          }, 100);

          // Vibrate in a repeating pattern
          Vibration.vibrate([0, 500, 500, 500], true);

          // Curto atraso para o som iniciar, então fala. Guardado em ref para
          // ser cancelado se o usuário desligar antes de começar (#8).
          speechTimeoutRef.current = setTimeout(() => {
            speechTimeoutRef.current = null;
            speakAlarm();
          }, 500);
        }
      } catch (e) {
        console.warn('[AlarmRing] Audio error:', e);
      }
    };

    startAlarm();

    return () => {
      try {
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        player.pause();
        player.remove();
        Vibration.cancel();
        Speech.stop();
      } catch {}
    };
  }, []);

  // Synchronized countdown timer
  // On mount, load the persisted timer entry to sync with the real elapsed time.
  // This ensures that if the user taps the notification with 12s left, the app
  // shows exactly 12s - not a fresh 30s countdown.
  useEffect(() => {
    let cancelled = false;

    const startCountdown = (expiresAt: number) => {
      expiresAtRef.current = expiresAt;
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        escalationDoneRef.current = true;
        setEscalated(true);
        return;
      }
      countdownRef.current = setInterval(() => {
        if (!expiresAtRef.current) return;
        const rem = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
        setSecondsLeft(rem);
        if (rem <= 0) clearInterval(countdownRef.current!);
      }, 1000);
    };

    const initTimer = async () => {
      if (!alarmId || cancelled) return;

      // Priority 1: expiresAt passed as URL param (most reliable, no AsyncStorage race)
      if (expiresAtParam) {
        const parsedExpiresAt = parseInt(expiresAtParam, 10);
        if (!isNaN(parsedExpiresAt) && parsedExpiresAt > Date.now()) {
          startCountdown(parsedExpiresAt);
          return;
        }
      }

      // Priority 2: AsyncStorage persisted timer (fallback for cold start / re-entry)
      const entry = await loadAlarmTimer(alarmId);
      if (cancelled) return;

      if (entry && entry.expiresAt > Date.now()) {
        // Use the persisted expiresAt to compute real remaining time
        startCountdown(entry.expiresAt);
      } else {
        // Cold start (app morto no disparo, sem timer persistido). Ancoramos a
        // contagem na hora REAL do disparo agendado — não em Date.now() — para
        // continuar de onde deveria em vez de reiniciar em 30s (#10).
        let duration = configuredDuration;
        let alarmForAnchor = alarm;
        try {
          const raw = await AsyncStorage.getItem('vigora_app_state');
          if (raw) {
            const parsed = JSON.parse(raw);
            const stored = parsed?.settings?.timerDuration;
            if (typeof stored === 'number' && [15, 30, 45, 60].includes(stored)) {
              duration = stored;
            }
            if (!alarmForAnchor) {
              alarmForAnchor = parsed?.alarms?.find((a: any) => a.id === alarmId);
            }
          }
        } catch {}
        const fireMs = alarmForAnchor ? lastAlarmFireMs(alarmForAnchor) : null;
        startCountdown((fireMs ?? Date.now()) + duration * 1000);
      }
    };

    initTimer();

    return () => {
      cancelled = true;
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [alarmId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // When countdown reaches 0, send WhatsApp escalation
  useEffect(() => {
    if (secondsLeft === 0 && !escalationDoneRef.current && !dismissed) {
      escalationDoneRef.current = true;
      setEscalated(true);
      // Confirm alarm as missed on server monitoring system
      if (alarm) {
        confirmAlarmMissed(alarm, canonicalScheduledAt()).catch(() => {});
      }

      const doEscalate = async () => {
        let userLocation: { latitude: number; longitude: number } | undefined;
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            userLocation = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
          }
        } catch {}

        if (alarm) {
          await escalateAlarmToContacts(alarm, state.emergencyContacts, userLocation);
        }
      };

      if (Platform.OS !== 'web') {
        doEscalate();
      }
    }
  }, [secondsLeft, dismissed, alarm, state.emergencyContacts]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    dismissedRef.current = true;
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    // Stop native alarm (Android AlarmManager)
    stopNativeAlarm().catch(() => {});
    // Stop speech
    Speech.stop().catch(() => {});
    // Clear persisted timer
    if (alarmId) {
      clearAlarmTimer(alarmId);
    }

    try {
      player.pause();
      player.remove();
      Vibration.cancel();
    } catch {}

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Reset missed alarm counter - user responded
    dispatch({ type: 'RESET_MISSED_ALARM' });
    // Confirm alarm as responded on server monitoring system
    if (alarm) {
      confirmAlarmResponded(alarm, canonicalScheduledAt()).catch(() => {});
    }
    // Atualiza widget Android para mostrar o próximo alarme pendente
    updateAlarmWidgetOnDismiss(state.alarms).catch(() => {});

    router.replace('/(tabs)/alarms');
  }, [alarmId, player, dispatch, router]);

  // Soneca: conta como respondido AGORA (idoso interagiu = vivo), mas re-arma um
  // disparo em 5 min. Se a soneca for ignorada, o evento +5min vira "perdido" no
  // servidor e escala — regra do usuário (feedback do beta, item 4.3).
  const handleSnooze = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    setDismissed(true); // impede a escalação do disparo atual
    dismissedRef.current = true;
    stopNativeAlarm().catch(() => {});
    Speech.stop().catch(() => {});
    if (alarmId) {
      clearAlarmTimer(alarmId);
    }
    try {
      player.pause();
      player.remove();
      Vibration.cancel();
    } catch {}
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (alarm) {
      dispatch({ type: 'RESET_MISSED_ALARM' });
      confirmAlarmResponded(alarm, canonicalScheduledAt()).catch(() => {});
      const fireAt = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000);
      snoozeNativeAlarm(alarm, fireAt).catch(() => {});
      createPendingAlarmEvent(alarm, fireAt).catch(() => {});
    }

    router.replace('/(tabs)/alarms');
  }, [alarmId, alarm, player, dispatch, router]);

  const handleSpeakAgain = useCallback(async () => {
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      await Speech.stop();
      setIsSpeaking(false);
    } else {
      speakAlarm();
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [speakAlarm]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // Urgent when less than 30% of the total duration remains
  const urgentThreshold = Math.ceil(configuredDuration * 0.3);
  const isUrgent = secondsLeft <= urgentThreshold && secondsLeft > 0;
  const isExpired = secondsLeft === 0;

  // --- Accessibility Mode ---------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: ac.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        {/* Icon */}
        <View style={styles.topSection}>
          <PulseView active minScale={0.85} maxScale={1.15} duration={800}>
            <View
              style={[
                styles.iconCircle,
                { width: 180, height: 180, borderRadius: 90 },
                isUrgent && styles.iconCircleUrgent,
                isExpired && styles.iconCircleExpired,
              ]}
            >
              <MaterialIcons name="alarm" size={88} color="#FFFFFF" />
            </View>
          </PulseView>
          <Text style={[styles.alarmLabel, { color: ac.muted, fontSize: af.sm + 2, letterSpacing: 3 }]}>
            ALARME
          </Text>
        </View>

        {/* Alarm info */}
        <View style={styles.infoSection}>
          <Text style={[styles.alarmTime, { color: ac.foreground, fontSize: 72 }]}>
            {alarm?.time ?? '--:--'}
          </Text>
          <Text
            style={[styles.alarmName, { color: ac.muted, fontSize: af.lg, lineHeight: af.lg * 1.4 }]}
            numberOfLines={3}
          >
            {alarm?.description || 'Alarme'}
          </Text>
        </View>

        {/* Speak again button - prominent in accessibility mode */}
        <Pressable
          style={({ pressed }) => [
            styles.speakButton,
            {
              backgroundColor: isSpeaking ? ac.primary + '33' : ac.primary + '22',
              borderColor: ac.primary,
              borderWidth: 3,
              minHeight: 72,
              paddingVertical: 18,
            },
            pressed && { opacity: 0.75 },
          ]}
          onPress={handleSpeakAgain}
          accessibilityLabel={isSpeaking ? 'Parar leitura' : 'Ouvir alarme em voz alta'}
        >
          <MaterialIcons
            name={isSpeaking ? 'stop' : 'volume-up'}
            size={40}
            color={ac.primary}
          />
          <Text style={[styles.speakButtonText, { color: ac.primary, fontSize: af.md, fontWeight: '700' }]}>
            {isSpeaking ? 'Parar Leitura' : 'Ouvir em Voz Alta'}
          </Text>
        </Pressable>

        {/* Countdown */}
        <View style={[styles.countdownSection, { gap: 10 }]}>
          {!isExpired ? (
            <>
              <Text style={[styles.countdownLabel, { color: isUrgent ? colors.warning : ac.muted, fontSize: af.sm, fontWeight: isUrgent ? '700' : '400' }]}>
                {isUrgent ? '⚠️ Mensagem de emergência em' : 'Mensagem de emergência em'}
              </Text>
              <Text style={[styles.countdownTimer, { color: isUrgent ? colors.warning : ac.foreground, fontSize: 56 }]}>
                {formatTime(secondsLeft)}
              </Text>
              <Text style={[styles.countdownSub, { color: ac.muted, fontSize: af.xs }]}>
                Toque em "Desligar" para cancelar o envio
              </Text>
            </>
          ) : (
            <View style={[styles.escalatedBox, { backgroundColor: colors.errorLight, borderColor: colors.error, borderWidth: 3 }]}>
              <MaterialIcons name="warning" size={36} color={colors.error} />
              <Text style={[styles.escalatedText, { color: colors.error, fontSize: af.md, lineHeight: af.md * 1.4 }]}>
                Mensagem de emergência enviada para seus contatos
              </Text>
            </View>
          )}
        </View>

        {/* Snooze + Dismiss buttons */}
        <View style={[styles.bottomSection, { gap: 14 }]}>
          {!isExpired && (
            <Pressable
              style={({ pressed }) => [
                styles.snoozeButton,
                { minHeight: 72, paddingVertical: 20, backgroundColor: ac.surface, borderColor: ac.border, borderWidth: 2 },
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleSnooze}
              accessibilityLabel={`Soneca de ${SNOOZE_MINUTES} minutos`}
            >
              <MaterialIcons name="snooze" size={36} color={ac.foreground} />
              <Text style={[styles.snoozeText, { fontSize: af.md, color: ac.foreground, fontWeight: '800' }]}>
                Soneca ({SNOOZE_MINUTES} min)
              </Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.dismissButton,
              { minHeight: 88, paddingVertical: 26 },
              pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
            ]}
            onPress={handleDismiss}
            accessibilityLabel="Desligar alarme"
          >
            <MaterialIcons name="alarm-off" size={44} color="#FFFFFF" />
            <Text style={[styles.dismissText, { fontSize: af.lg, fontWeight: '900' }]}>
              Desligar Alarme
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // --- Normal Mode ----------------------------------------------------------
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* Top section: pulsing icon */}
      <View style={styles.topSection}>
        <PulseView active minScale={0.85} maxScale={1.15} duration={800}>
          <View style={[
            styles.iconCircle,
            {
              backgroundColor: isExpired ? colors.error : isUrgent ? colors.warning : colors.primary,
              shadowColor: isExpired ? colors.error : isUrgent ? colors.warning : colors.primary,
            },
          ]}>
            <MaterialIcons
              name="alarm"
              size={72}
              color={colors.onPrimary}
            />
          </View>
        </PulseView>

        <Text style={styles.alarmLabel}>ALARME</Text>
      </View>

      {/* Middle section: alarm info */}
      <View style={styles.infoSection}>
        <Text style={styles.alarmTime}>{alarm?.time ?? '--:--'}</Text>
        <Text style={styles.alarmName} numberOfLines={2}>
          {alarm?.description || 'Alarme'}
        </Text>
      </View>

      {/* Speak again button */}
      <Pressable
        style={({ pressed }) => [
          styles.speakButton,
          isSpeaking && styles.speakButtonActive,
          pressed && { opacity: 0.75 },
        ]}
        onPress={handleSpeakAgain}
        accessibilityLabel={isSpeaking ? 'Parar leitura' : 'Ouvir alarme em voz alta'}
      >
        <MaterialIcons
          name={isSpeaking ? 'stop' : 'volume-up'}
          size={24}
          color="#93C5FD"
        />
        <Text style={styles.speakButtonText}>
          {isSpeaking ? 'Parar Leitura' : 'Ouvir em Voz Alta'}
        </Text>
      </Pressable>

      {/* Countdown timer */}
      <View style={styles.countdownSection}>
        {!isExpired ? (
          <>
            <Text style={[styles.countdownLabel, isUrgent && { color: colors.warning, fontWeight: '600' }]}>
              {isUrgent ? '⚠️ Mensagem de emergência em' : 'Mensagem de emergência em'}
            </Text>
            <Text style={[styles.countdownTimer, isUrgent && { color: colors.warning }]}>
              {formatTime(secondsLeft)}
            </Text>
            <Text style={styles.countdownSub}>
              Toque em "Desligar" para cancelar o envio
            </Text>
          </>
        ) : (
          <View style={[styles.escalatedBox, { backgroundColor: colors.errorLight, borderColor: colors.error }]}>
            <MaterialIcons name="warning" size={28} color={colors.error} />
            <Text style={[styles.escalatedText, { color: colors.error }]}>
              Mensagem de emergência enviada para seus contatos
            </Text>
          </View>
        )}
      </View>

      {/* Snooze + Dismiss buttons */}
      <View style={[styles.bottomSection, { gap: 12 }]}>
        {!isExpired && (
          <Pressable
            style={({ pressed }) => [styles.snoozeButton, pressed && { opacity: 0.8 }]}
            onPress={handleSnooze}
            accessibilityLabel={`Soneca de ${SNOOZE_MINUTES} minutos`}
          >
            <MaterialIcons name="snooze" size={24} color="#FFFFFF" />
            <Text style={styles.snoozeText}>Soneca ({SNOOZE_MINUTES} min)</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.dismissButton,
            { backgroundColor: colors.error, shadowColor: colors.error },
            pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
          ]}
          onPress={handleDismiss}
          accessibilityLabel="Desligar alarme"
        >
          <MaterialIcons name="alarm-off" size={32} color={colors.onEmergency} />
          <Text style={styles.dismissText}>Desligar Alarme</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  topSection: {
    alignItems: 'center',
    gap: 16,
    marginTop: 24,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  iconCircleUrgent: {},
  iconCircleExpired: {},
  alarmLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 4,
  },
  infoSection: {
    alignItems: 'center',
    gap: 8,
  },
  alarmTime: {
    fontSize: 64,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  alarmName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 30,
  },
  speakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#93C5FD18',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#93C5FD44',
    minHeight: 48,
    width: '100%',
  },
  speakButtonActive: {
    backgroundColor: '#93C5FD30',
    borderColor: '#93C5FD88',
  },
  speakButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#93C5FD',
  },
  countdownSection: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  countdownLabel: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  countdownLabelUrgent: {
    fontWeight: '600',
  },
  countdownTimer: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  countdownTimerUrgent: {},
  countdownSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  escalatedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
  },
  escalatedText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
  },
  dismissButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 40,
    width: '100%',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  dismissText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  snoozeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  snoozeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
