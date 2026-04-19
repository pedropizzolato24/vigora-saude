/**
 * AlarmRingScreen
 *
 * Full-screen alarm experience:
 * - Plays alarm sound on loop for up to 30 seconds
 * - Pulsing alarm icon
 * - Shows alarm name and description
 * - Countdown timer (30s) — when it reaches 0, sends WhatsApp to all emergency contacts
 * - Large dismiss button
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
import { useAppContext } from '@/lib/app-context';
import { escalateAlarmToContacts } from '@/lib/alarm-escalation';
import { stopNativeAlarm } from '@/lib/native-alarm-manager';
import { PulseView } from '@/components/animated-components';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const ALARM_SOUND = require('@/assets/alarm.mp3');
const COUNTDOWN_SECONDS = 30;

export default function AlarmRingScreen() {
  const router = useRouter();
  const { alarmId } = useLocalSearchParams<{ alarmId: string }>();
  const { state, dispatch } = useAppContext();

  const alarm = state.alarms.find((a) => a.id === alarmId);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [escalated, setEscalated] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const escalationDoneRef = useRef(false);

  // Audio player
  const player = useAudioPlayer(ALARM_SOUND);

  // Start audio and vibration on mount
  useEffect(() => {
    const startAlarm = async () => {
      try {
        if (Platform.OS !== 'web') {
          // Must await setAudioModeAsync before play() to ensure silent mode override
          await setAudioModeAsync({ playsInSilentMode: true });
          // Set loop and seek to start before playing
          player.loop = true;
          player.seekTo(0);
          player.play();

          // Vibrate in a repeating pattern
          Vibration.vibrate([0, 500, 500, 500], true);
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
      } catch {}
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

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

    router.replace('/(tabs)/alarms');
  }, [player, dispatch, router]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const isUrgent = secondsLeft <= 10 && secondsLeft > 0;
  const isExpired = secondsLeft === 0;

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
