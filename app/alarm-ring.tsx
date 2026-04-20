/**
 * AlarmRingScreen
 *
 * Full-screen alarm experience:
 * - Plays alarm sound on loop for up to 30 seconds
 * - Pulsing alarm icon
 * - Shows alarm name and description
 * - Reads alarm name and description aloud via expo-speech (pt-BR)
 * - "Ouvir novamente" button to replay speech
 * - Countdown timer (30s) — when it reaches 0, sends WhatsApp to all emergency contacts
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
import { escalateAlarmToContacts } from '@/lib/alarm-escalation';
import { stopNativeAlarm } from '@/lib/native-alarm-manager';
import { PulseView } from '@/components/animated-components';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { loadAlarmTimer, clearAlarmTimer, computeSecondsLeft } from '@/lib/alarm-timer-store';
import { stopCountdownNotification } from '@/lib/alarm-countdown-notifier';
import { updateAlarmWidgetOnDismiss } from '@/lib/update-widgets';

const ALARM_SOUND = require('@/assets/alarm.mp3');
const COUNTDOWN_SECONDS = 30;

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

  const alarm = state.alarms.find((a) => a.id === alarmId);
  // Initialize with the configured duration; will be overridden by persisted timer on mount
  const configuredDuration: number = state.settings.timerDuration ?? 30;
  const [secondsLeft, setSecondsLeft] = useState<number>(configuredDuration);
  const [escalated, setEscalated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const escalationDoneRef = useRef(false);
  const expiresAtRef = useRef<number | null>(null);

  // Audio player
  const player = useAudioPlayer(ALARM_SOUND);

  // Speak alarm info aloud — uses speechRate and speechVolume from settings
  // Ducks alarm volume during speech so the voice is clearly audible
  const speakAlarm = useCallback(() => {
    if (Platform.OS === 'web') return;
    const text = buildSpeechText(alarm?.description, alarm?.time);
    const speechVol = (state.settings.speechVolume ?? 90) / 100;
    const speechRate = state.settings.speechRate ?? 0.75;
    // Alarm volume at full while speech is not yet started
    const alarmVol = (state.settings.alarmVolume ?? 80) / 100;
    // Ducked alarm volume: 25% of original so voice is clearly heard
    const duckedAlarmVol = alarmVol * 0.25;

    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'pt-BR',
      rate: speechRate,
      pitch: 1.0,
      volume: speechVol,
      onStart: () => {
        setIsSpeaking(true);
        // Duck alarm audio so voice is audible
        try { player.volume = duckedAlarmVol; } catch {}
      },
      onDone: () => {
        setIsSpeaking(false);
        // Restore alarm volume
        try { player.volume = alarmVol; } catch {}
      },
      onStopped: () => {
        setIsSpeaking(false);
        try { player.volume = alarmVol; } catch {}
      },
      onError: () => {
        setIsSpeaking(false);
        try { player.volume = alarmVol; } catch {}
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

          // Set volume AFTER play() — expo-audio requires the player to be
          // actively playing before volume changes take effect
          setTimeout(() => {
            try { player.volume = (state.settings.alarmVolume ?? 80) / 100; } catch {}
          }, 100);

          // Vibrate in a repeating pattern
          Vibration.vibrate([0, 500, 500, 500], true);

          // Wait 1.5s for alarm sound to start, then speak alarm info
          setTimeout(() => {
            speakAlarm();
          }, 1500);
        }
      } catch (e) {
        console.warn('[AlarmRing] Audio error:', e);
      }
    };

    startAlarm();

    return () => {
      try {
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
  // shows exactly 12s — not a fresh 30s countdown.
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
        // Last resort — start a fresh timer from configured duration
        const duration = configuredDuration;
        startCountdown(Date.now() + duration * 1000);
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
    if (countdownRef.current) clearInterval(countdownRef.current);
    // Stop native alarm (Android AlarmManager)
    stopNativeAlarm().catch(() => {});
    // Stop speech
    Speech.stop().catch(() => {});
    // Stop countdown notification and clear persisted timer
    if (alarmId) {
      stopCountdownNotification(alarmId);
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

    // Reset missed alarm counter — user responded
    dispatch({ type: 'RESET_MISSED_ALARM' });
    // Atualiza widget Android para mostrar o próximo alarme pendente
    updateAlarmWidgetOnDismiss(state.alarms).catch(() => {});

    router.replace('/(tabs)/alarms');
  }, [alarmId, player, dispatch, router]);

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

  // ─── Accessibility Mode ───────────────────────────────────────────────────
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

        {/* Speak again button — prominent in accessibility mode */}
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
              <Text style={[styles.countdownLabel, { color: isUrgent ? '#F59E0B' : ac.muted, fontSize: af.sm, fontWeight: isUrgent ? '700' : '400' }]}>
                {isUrgent ? '⚠️ Mensagem de emergência em' : 'Mensagem de emergência em'}
              </Text>
              <Text style={[styles.countdownTimer, { color: isUrgent ? '#F59E0B' : ac.foreground, fontSize: 56 }]}>
                {formatTime(secondsLeft)}
              </Text>
              <Text style={[styles.countdownSub, { color: ac.muted, fontSize: af.xs }]}>
                Toque em "Desligar" para cancelar o envio
              </Text>
            </>
          ) : (
            <View style={[styles.escalatedBox, { borderColor: '#EF4444', borderWidth: 3 }]}>
              <MaterialIcons name="warning" size={36} color="#EF4444" />
              <Text style={[styles.escalatedText, { color: '#FCA5A5', fontSize: af.md, lineHeight: af.md * 1.4 }]}>
                Mensagem de emergência enviada para seus contatos
              </Text>
            </View>
          )}
        </View>

        {/* Dismiss button */}
        <View style={styles.bottomSection}>
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

  // ─── Normal Mode ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* Top section: pulsing icon */}
      <View style={styles.topSection}>
        <PulseView active minScale={0.85} maxScale={1.15} duration={800}>
          <View style={[styles.iconCircle, isUrgent && styles.iconCircleUrgent, isExpired && styles.iconCircleExpired]}>
            <MaterialIcons
              name="alarm"
              size={72}
              color="#FFFFFF"
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
            <Text style={[styles.countdownLabel, isUrgent && styles.countdownLabelUrgent]}>
              {isUrgent ? '⚠️ Mensagem de emergência em' : 'Mensagem de emergência em'}
            </Text>
            <Text style={[styles.countdownTimer, isUrgent && styles.countdownTimerUrgent]}>
              {formatTime(secondsLeft)}
            </Text>
            <Text style={styles.countdownSub}>
              Toque em "Desligar" para cancelar o envio
            </Text>
          </>
        ) : (
          <View style={styles.escalatedBox}>
            <MaterialIcons name="warning" size={28} color="#EF4444" />
            <Text style={styles.escalatedText}>
              Mensagem de emergência enviada para seus contatos
            </Text>
          </View>
        )}
      </View>

      {/* Dismiss button */}
      <View style={styles.bottomSection}>
        <Pressable
          style={({ pressed }) => [
            styles.dismissButton,
            pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
          ]}
          onPress={handleDismiss}
          accessibilityLabel="Desligar alarme"
        >
          <MaterialIcons name="alarm-off" size={32} color="#FFFFFF" />
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
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0066CC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  iconCircleUrgent: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  iconCircleExpired: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
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
    color: '#F59E0B',
    fontWeight: '600',
  },
  countdownTimer: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  countdownTimerUrgent: {
    color: '#F59E0B',
  },
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
    backgroundColor: '#EF444420',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  escalatedText: {
    fontSize: 14,
    color: '#FCA5A5',
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
    backgroundColor: '#EF4444',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 40,
    width: '100%',
    shadowColor: '#EF4444',
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
});
