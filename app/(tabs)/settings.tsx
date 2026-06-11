import * as Haptics from 'expo-haptics';
import { startCountdownNotification, stopCountdownNotification } from '@/lib/alarm-countdown-notifier';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { FormKeyboardView } from '@/components/form-keyboard-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useAppContext } from '@/lib/app-context';
import { useThemeContext } from '@/lib/theme-provider';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { MonitoringStatusPanel } from '@/components/monitoring-status-panel';
import { TrialBanner, ExpiredBanner } from '@/components/trial-banner';
import { scheduleCheckin, cancelCheckin } from '@/lib/checkin-service';
import DateTimePicker from '@react-native-community/datetimepicker';

const ALARM_SOUND = require('@/assets/alarm.mp3');

// Timer duration options
const TIMER_DURATIONS: { value: 15 | 30 | 45 | 60; label: string; sublabel: string }[] = [
  { value: 15, label: '15s', sublabel: 'Rápido' },
  { value: 30, label: '30s', sublabel: 'Padrão' },
  { value: 45, label: '45s', sublabel: 'Moderado' },
  { value: 60, label: '60s', sublabel: 'Lento' },
];

// Speech rate options
const SPEECH_RATES: { value: 0.5 | 0.75 | 1.0 | 1.25; label: string; sublabel: string }[] = [
  { value: 0.5, label: 'Lenta', sublabel: '0.5×' },
  { value: 0.75, label: 'Normal', sublabel: '0.75×' },
  { value: 1.0, label: 'Rápida', sublabel: '1.0×' },
  { value: 1.25, label: 'Muito Rápida', sublabel: '1.25×' },
];

// --- Collapsible Section ----------------------------------------------------

function CollapsibleSection({
  title,
  icon,
  iconBg,
  iconColor,
  children,
  colors,
  defaultOpen = false,
}: {
  title: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: iconColor + '55' }]}>
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setOpen(!open);
        }}
        style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIconBadge, { backgroundColor: iconBg }]}>
            <MaterialIcons name={icon as any} size={20} color={iconColor} />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        </View>
        <MaterialIcons
          name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={24}
          color={colors.muted}
        />
      </Pressable>
      {open && (
        <View style={[styles.sectionContent, { borderTopColor: colors.border }]}>
          {children}
        </View>
      )}
    </View>
  );
}

// --- Setting Row Components -------------------------------------------------

function SettingToggle({
  label,
  sublabel,
  value,
  onValueChange,
  colors,
  trackColor,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  colors: ReturnType<typeof useColors>;
  trackColor?: string;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingTextBlock}>
        <Text style={[styles.settingLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.settingSubLabel, { color: colors.muted }]}>{sublabel}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: trackColor || colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function SettingLink({
  label,
  sublabel,
  onPress,
  colors,
  chevron = true,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  chevron?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.settingTextBlock}>
        <Text style={[styles.settingLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.settingSubLabel, { color: colors.muted }]}>{sublabel}</Text>}
      </View>
      {chevron && <MaterialIcons name="chevron-right" size={22} color={colors.muted} />}
    </Pressable>
  );
}

function Divider({ colors }: { colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

// --- Main Screen ------------------------------------------------------------

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const { colorScheme, setColorScheme } = useThemeContext();
  const fs = useFontSize();
  const { settings } = state;
  const { dialogProps, showDialog } = useAppDialog();

  const [countdownTestActive, setCountdownTestActive] = useState(false);
  const [countdownTestSecondsLeft, setCountdownTestSecondsLeft] = useState(10);
  const [showCheckinTimePicker, setShowCheckinTimePicker] = useState(false);
  const countdownTestIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const TEST_ALARM_ID = 'settings_test';
  const TEST_DURATION = 10;

  function parseCheckinTime(timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  function formatCheckinHHMM(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  const handleTestCountdown = useCallback(() => {
    if (countdownTestActive) {
      // Cancel running test
      if (countdownTestIntervalRef.current) {
        clearInterval(countdownTestIntervalRef.current);
        countdownTestIntervalRef.current = null;
      }
      stopCountdownNotification(TEST_ALARM_ID, 'Teste de Notificação');
      setCountdownTestActive(false);
      setCountdownTestSecondsLeft(TEST_DURATION);
      return;
    }

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const expiresAt = Date.now() + TEST_DURATION * 1000;
    setCountdownTestActive(true);
    setCountdownTestSecondsLeft(TEST_DURATION);

    // Start native countdown notification
    startCountdownNotification(TEST_ALARM_ID, 'Teste de Notificação', expiresAt);

    // Update local UI counter
    countdownTestIntervalRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setCountdownTestSecondsLeft(left);
      if (left <= 0) {
        if (countdownTestIntervalRef.current) clearInterval(countdownTestIntervalRef.current);
        countdownTestIntervalRef.current = null;
        stopCountdownNotification(TEST_ALARM_ID, 'Teste de Notificação');
        setCountdownTestActive(false);
        setCountdownTestSecondsLeft(TEST_DURATION);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 500);
  }, [countdownTestActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTestIntervalRef.current) clearInterval(countdownTestIntervalRef.current);
      stopCountdownNotification(TEST_ALARM_ID, 'Teste de Notificação');
    };
  }, []);

  const updateSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } });
  };

  // Audio player for volume preview
  const previewPlayer = useAudioPlayer(ALARM_SOUND);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playVolumePreview = useCallback(async (volume: number) => {
    if (Platform.OS === 'web') return;
    try {
      // Cancel any pending stop
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }

      await setAudioModeAsync({ playsInSilentMode: true });
      previewPlayer.volume = volume / 100;
      previewPlayer.loop = false;
      // Seek to start so it always plays from beginning
      previewPlayer.seekTo(0);
      previewPlayer.play();

      // Stop after 1 second
      previewTimeoutRef.current = setTimeout(() => {
        previewPlayer.pause();
        previewTimeoutRef.current = null;
      }, 1000);
    } catch {
      // Ignore audio errors silently
    }
  }, [previewPlayer]);

  const handleVolumeChange = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newVolume = Math.max(0, Math.min(100, settings.alarmVolume + delta));
    updateSetting('alarmVolume', newVolume);
    playVolumePreview(newVolume);
  };

  const handleSpeechVolumeChange = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newVol = Math.max(0, Math.min(100, settings.speechVolume + delta));
    updateSetting('speechVolume', newVol);
  };

  const handleTimerDurationChange = (duration: 15 | 30 | 45 | 60) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSetting('timerDuration', duration);
  };

  const handleSpeechRateChange = (rate: 0.5 | 0.75 | 1.0 | 1.25) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSetting('speechRate', rate);
    // Preview the new rate
    if (Platform.OS !== 'web') {
      Speech.stop().then(() => {
        Speech.speak('Alarme de medicamento.', {
          language: 'pt-BR',
          rate,
          volume: settings.speechVolume / 100,
        });
      });
    }
  };

  // --- Location Permission Status -------------------------------------------
  const [locationStatus, setLocationStatus] = useState<'granted' | 'background' | 'denied' | 'unknown'>('unknown');

  const checkLocationPermission = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        setLocationStatus('denied');
        return;
      }
      const bg = await Location.getBackgroundPermissionsAsync();
      setLocationStatus(bg.status === 'granted' ? 'background' : 'granted');
    } catch {
      setLocationStatus('unknown');
    }
  }, []);

  useEffect(() => {
    checkLocationPermission();
  }, [checkLocationPermission]);

  const handleOpenLocationSettings = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openSettings();
  };

  const locationStatusInfo = {
    background: { label: 'Ativo (Tempo Todo)', color: colors.success, icon: 'location-on' as const },
    granted: { label: 'Ativo (Apenas em Uso)', color: colors.warning, icon: 'location-on' as const },
    denied: { label: 'Negado', color: colors.error, icon: 'location-off' as const },
    unknown: { label: 'Verificando...', color: colors.muted, icon: 'location-searching' as const },
  };

  const handleClearData = () => {
    showDialog({
      title: 'Limpar Todos os Dados',
      message: 'Esta ação removerá todos os alarmes, contatos, ficha de anamnese e histórico de saúde. Esta ação não pode ser desfeita.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar Tudo',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            dispatch({ type: 'CLEAR_ALL_DATA' });
          },
        },
      ],
    });
  };

  const fontSizeLabels = { small: 'Pequeno', medium: 'Médio', large: 'Grande' };
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();

  const handleToggleAccessibility = () => {
    if (!settings.accessibilityMode) {
      // Show confirmation before enabling
      showDialog({
        title: 'Ativar Modo de Acessibilidade?',
        message: 'O Modo de Acessibilidade simplifica o layout do app para facilitar o uso:\n\n* Fontes maiores e mais legíveis\n* Cores de alto contraste\n* Botões maiores e mais fáceis de tocar\n* Interface simplificada, sem detalhes desnecessários\n* Ideal para pessoas idosas ou com dificuldades visuais\n\nVocê pode desativar a qualquer momento nesta mesma tela.',
        variant: 'info',
        buttons: [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Ativar',
            onPress: () => {
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              updateSetting('accessibilityMode', true);
            },
          },
        ],
      });
    } else {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateSetting('accessibilityMode', false);
    }
  };

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.bar }}>
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Configurações</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Accessibility toggle - always visible at top */}
          <Pressable
            onPress={handleToggleAccessibility}
            style={({ pressed }) => [{ borderRadius: 20, borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.primary, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="accessibility-new" size={36} color={colors.onPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: af.lg, fontWeight: '900', color: colors.onPrimary }}>Modo de Acessibilidade</Text>
              <Text style={{ fontSize: af.sm, color: colors.onPrimary + 'CC', marginTop: 4 }}>Ativado - toque para desativar</Text>
            </View>
            <Switch value={true} onValueChange={handleToggleAccessibility} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
          </Pressable>

          {/* Status do Monitoramento - logo abaixo do toggle de acessibilidade */}
          <MonitoringStatusPanel accessible={true} />

          {/* Notifications toggle */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: 20, gap: 16 }}>
            <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>Notificações</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Alertas de alarmes</Text>
                <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>Avisos quando o alarme tocar</Text>
              </View>
              <Switch value={settings.notificationsEnabled} onValueChange={(v) => updateSetting('notificationsEnabled', v)} trackColor={{ false: ac.border, true: ac.primary }} thumbColor="#FFFFFF" />
            </View>
            <View style={{ height: 2, backgroundColor: ac.border }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Vibração</Text>
                <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>Vibrar ao disparar alarmes</Text>
              </View>
              <Switch value={settings.vibrationEnabled} onValueChange={(v) => updateSetting('vibrationEnabled', v)} trackColor={{ false: ac.border, true: ac.primary }} thumbColor="#FFFFFF" />
            </View>
          </View>

          {/* Volume */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: 20, gap: 16 }}>
            <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>Volume do Alarme</Text>
            <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.primary, textAlign: 'center' }}>{settings.alarmVolume}%</Text>
            <View style={{ height: 12, backgroundColor: ac.border, borderRadius: 6, overflow: 'hidden' }}>
              <View style={{ height: 12, backgroundColor: ac.primary, width: `${settings.alarmVolume}%` as any, borderRadius: 6 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable
                onPress={() => handleVolumeChange(-10)}
                style={({ pressed }) => [{ flex: 1, backgroundColor: ac.surface, borderRadius: 16, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 3, borderColor: ac.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="volume-down" size={28} color={ac.foreground} />
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>-10</Text>
              </Pressable>
              <Pressable
                onPress={() => handleVolumeChange(10)}
                style={({ pressed }) => [{ flex: 1, backgroundColor: ac.primary, borderRadius: 16, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 3, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="volume-up" size={28} color={colors.onPrimary} />
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: colors.onPrimary }}>+10</Text>
              </Pressable>
            </View>
          </View>

          {/* Voice Settings */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: 20, gap: 16 }}>
            <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>Voz do Alarme</Text>

            {/* Speech Volume */}
            <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Volume da Voz</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted }}>Independente do volume do alarme</Text>
            <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.primary, textAlign: 'center' }}>{settings.speechVolume}%</Text>
            <View style={{ height: 12, backgroundColor: ac.border, borderRadius: 6, overflow: 'hidden' }}>
              <View style={{ height: 12, backgroundColor: ac.primary, width: `${settings.speechVolume}%` as any, borderRadius: 6 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable
                onPress={() => handleSpeechVolumeChange(-10)}
                style={({ pressed }) => [{ flex: 1, backgroundColor: ac.surface, borderRadius: 16, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 3, borderColor: ac.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="volume-down" size={28} color={ac.foreground} />
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>-10</Text>
              </Pressable>
              <Pressable
                onPress={() => handleSpeechVolumeChange(10)}
                style={({ pressed }) => [{ flex: 1, backgroundColor: ac.primary, borderRadius: 16, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 3, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="volume-up" size={28} color={colors.onPrimary} />
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: colors.onPrimary }}>+10</Text>
              </Pressable>
            </View>

            <View style={{ height: 2, backgroundColor: ac.border }} />

            {/* Speech Rate */}
            <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Velocidade da Voz</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted }}>Toque para ouvir uma prévia</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {SPEECH_RATES.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleSpeechRateChange(opt.value)}
                  style={({ pressed }) => [{
                    flex: 1,
                    minWidth: '40%',
                    backgroundColor: settings.speechRate === opt.value ? ac.primary : ac.surface,
                    borderRadius: 16,
                    paddingVertical: 18,
                    alignItems: 'center',
                    borderWidth: 3,
                    borderColor: settings.speechRate === opt.value ? colors.primary : ac.border,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <Text style={{ fontSize: af.md, fontWeight: '800', color: settings.speechRate === opt.value ? colors.onPrimary : ac.foreground }}>
                    {opt.label}
                  </Text>
                  <Text style={{ fontSize: af.sm, color: settings.speechRate === opt.value ? colors.onPrimary + 'BB' : ac.muted, marginTop: 2 }}>
                    {opt.sublabel}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ height: 2, backgroundColor: ac.border }} />

            {/* Timer de Emergência */}
            <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Timer de Emergência</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted }}>Tempo até contatar emergência automaticamente</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {TIMER_DURATIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleTimerDurationChange(opt.value)}
                  style={({ pressed }) => [{
                    flex: 1,
                    minWidth: '40%',
                    backgroundColor: settings.timerDuration === opt.value ? ac.primary : ac.surface,
                    borderRadius: 16,
                    paddingVertical: 18,
                    alignItems: 'center',
                    borderWidth: 3,
                    borderColor: settings.timerDuration === opt.value ? colors.primary : ac.border,
                    opacity: pressed ? 0.7 : 1,
                  }]}
                >
                  <Text style={{ fontSize: af.lg, fontWeight: '900', color: settings.timerDuration === opt.value ? colors.onPrimary : ac.foreground }}>
                    {opt.label}
                  </Text>
                  <Text style={{ fontSize: af.sm, color: settings.timerDuration === opt.value ? colors.onPrimary + 'BB' : ac.muted, marginTop: 2 }}>
                    {opt.sublabel}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Teste do Módulo Nativo de Countdown - Accessibility */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: 20, gap: 14 }}>
            <Text style={{ fontSize: af.md, fontWeight: '900', color: ac.foreground }}>Testar Countdown na Notificação</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted }}>Minimize o app para ver o countdown na bandeja de notificações.</Text>
            <Pressable
              onPress={handleTestCountdown}
              style={({ pressed }) => [{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                backgroundColor: countdownTestActive ? colors.emergency : ac.primary,
                borderRadius: 16,
                paddingVertical: as_.buttonPadding,
                borderWidth: 3,
                borderColor: countdownTestActive ? colors.emergency : colors.primary,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <MaterialIcons
                name={countdownTestActive ? 'stop' : 'notifications-active'}
                size={32}
                color={colors.onPrimary}
              />
              <Text style={{ fontSize: af.lg, fontWeight: '900', color: colors.onPrimary }}>
                {countdownTestActive
                  ? `Parar Teste (${countdownTestSecondsLeft}s)`
                  : 'Iniciar Teste (10s)'}
              </Text>
            </Pressable>
            {countdownTestActive && (
              <View style={{ height: 10, backgroundColor: ac.border, borderRadius: 5, overflow: 'hidden' }}>
                <View style={{
                  height: 10,
                  backgroundColor: colors.emergency,
                  borderRadius: 5,
                  width: `${(countdownTestSecondsLeft / TEST_DURATION) * 100}%` as any,
                }} />
              </View>
            )}
          </View>

          {/* SOS confirmation */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Confirmar SOS</Text>
                <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>Pedir confirmação antes de acionar</Text>
              </View>
              <Switch value={settings.sosConfirmation} onValueChange={(v) => updateSetting('sosConfirmation', v)} trackColor={{ false: ac.border, true: ac.emergency }} thumbColor="#FFFFFF" />
            </View>
          </View>

          {/* Location Permission Status - Accessibility */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Permissão de Localização</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons
                name={locationStatusInfo[locationStatus].icon}
                size={20}
                color={locationStatusInfo[locationStatus].color}
              />
              <Text style={{ fontSize: af.sm, fontWeight: '700', color: locationStatusInfo[locationStatus].color }}>
                {locationStatusInfo[locationStatus].label}
              </Text>
            </View>
            {locationStatus !== 'background' && locationStatus !== 'unknown' && (
              <Text style={{ fontSize: af.sm, color: ac.muted }}>
                {locationStatus === 'denied'
                  ? 'Ative a localização para enviar SOS com GPS'
                  : 'Ative "Tempo Todo" para SOS com app fechado'}
              </Text>
            )}
            <Pressable
              onPress={handleOpenLocationSettings}
              style={({ pressed }) => [{
                backgroundColor: ac.primary,
                paddingVertical: 14,
                borderRadius: 16,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontSize: af.md, fontWeight: '800', color: colors.onPrimary }}>Abrir Configurações</Text>
            </Pressable>
          </View>

          {/* Version info */}
          <View style={{ alignItems: 'center', gap: 4, paddingTop: 8 }}>
            <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600' }}>Vigora - Versão 1.0.0</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted }}>Dados armazenados localmente no dispositivo.</Text>
          </View>
        </ScrollView>
        <AppDialog {...dialogProps} />
      </ScreenContainer>
    );
  }

  // --- NORMAL MODE --------------------------------------------------
  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs['2xl'] }]}>Configurações</Text>
        <Text style={[styles.headerSubtitle, { color: colors.muted, fontSize: fs.sm }]}>Personalize sua experiência</Text>
      </View>

      <FormKeyboardView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ═══ ACCESSIBILITY TOGGLE (always at top, outside any group) ═══ */}
        <Pressable
          onPress={handleToggleAccessibility}
          style={({ pressed }) => [{
            borderRadius: 24,
            borderWidth: 3,
            borderColor: colors.primary,
            backgroundColor: settings.accessibilityMode ? colors.primary : colors.surface,
            overflow: 'hidden',
            opacity: pressed ? 0.88 : 1,
          }]}
        >
          {/* Top banner strip */}
          <View style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 18,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}>
            <MaterialIcons name="accessibility-new" size={22} color={colors.onPrimary} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.onPrimary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {settings.accessibilityMode ? 'Modo de Acessibilidade - Ativado' : 'Modo de Acessibilidade'}
            </Text>
          </View>
          {/* Card body */}
          <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: settings.accessibilityMode ? colors.onPrimary + '20' : colors.primaryLight,
              borderWidth: 2,
              borderColor: settings.accessibilityMode ? colors.onPrimary + '40' : colors.primary + '40',
            }}>
              <MaterialIcons
                name="accessibility-new"
                size={36}
                color={settings.accessibilityMode ? colors.onPrimary : colors.primary}
              />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: settings.accessibilityMode ? colors.onPrimary : colors.primary, lineHeight: 22 }}>
                {settings.accessibilityMode ? 'Ativado' : 'Para idosos e pessoas com\ndificuldades visuais'}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: settings.accessibilityMode ? colors.onPrimary + 'BB' : colors.muted, lineHeight: 18 }}>
                {settings.accessibilityMode
                  ? 'Fontes maiores, alto contraste e interface simplificada'
                  : 'Fontes maiores * Alto contraste * Botões maiores'}
              </Text>
            </View>
            <Switch
              value={settings.accessibilityMode}
              onValueChange={handleToggleAccessibility}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Pressable>

        {/* ═══ STATUS DO MONITORAMENTO (abaixo de Acessibilidade) ═══ */}
        {/* Liberado para todos — a experiência completa não é restrita por plano. */}
        <MonitoringStatusPanel accessible={false} />

        {/* ═══ SECTION 1: Notificações e Alarmes ═══ */}
        <CollapsibleSection
          title="Notificações e Alarmes"
          icon="notifications"
          iconBg={colors.primaryLight}
          iconColor={colors.primary}
          colors={colors}
          defaultOpen={false}
        >
          <SettingToggle
            label="Notificações"
            sublabel="Alertas de alarmes e SOS"
            value={settings.notificationsEnabled}
            onValueChange={(v) => updateSetting('notificationsEnabled', v)}
            colors={colors}
          />
          <Divider colors={colors} />
          <SettingToggle
            label="Vibração"
            sublabel="Vibrar ao disparar alarmes"
            value={settings.vibrationEnabled}
            onValueChange={(v) => updateSetting('vibrationEnabled', v)}
            colors={colors}
          />
          <Divider colors={colors} />

          {/* Volume do Alarme */}
          <View style={styles.volumeSection}>
            <View style={styles.volumeHeader}>
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>Volume do Alarme</Text>
              <Text style={[styles.volumeValue, { color: colors.primary }]}>
                {settings.alarmVolume}%
              </Text>
            </View>
            <View style={[styles.volumeBarBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.volumeBarFill,
                  { backgroundColor: colors.primary, width: `${settings.alarmVolume}%` },
                ]}
              />
            </View>
            <View style={styles.volumeControls}>
              <Pressable
                onPress={() => handleVolumeChange(-10)}
                style={({ pressed }) => [
                  styles.volumeBtn,
                  { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="volume-down" size={18} color={colors.foreground} />
                <Text style={[styles.volumeBtnText, { color: colors.foreground }]}>-10</Text>
              </Pressable>
              <Pressable
                onPress={() => handleVolumeChange(10)}
                style={({ pressed }) => [
                  styles.volumeBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="volume-up" size={18} color={colors.onPrimary} />
                <Text style={[styles.volumeBtnText, { color: colors.onPrimary }]}>+10</Text>
              </Pressable>
            </View>
          </View>
          <Divider colors={colors} />

          {/* Volume da Voz */}
          <View style={styles.volumeSection}>
            <View style={styles.volumeHeader}>
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>Volume da Voz</Text>
              <Text style={[styles.volumeValue, { color: colors.primary }]}>
                {settings.speechVolume}%
              </Text>
            </View>
            <Text style={[styles.settingSubLabel, { color: colors.muted, marginBottom: 6 }]}>
              Independente do volume do alarme
            </Text>
            <View style={[styles.volumeBarBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.volumeBarFill,
                  { backgroundColor: colors.primary, width: `${settings.speechVolume}%` },
                ]}
              />
            </View>
            <View style={styles.volumeControls}>
              <Pressable
                onPress={() => handleSpeechVolumeChange(-10)}
                style={({ pressed }) => [
                  styles.volumeBtn,
                  { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="volume-down" size={18} color={colors.foreground} />
                <Text style={[styles.volumeBtnText, { color: colors.foreground }]}>-10</Text>
              </Pressable>
              <Pressable
                onPress={() => handleSpeechVolumeChange(10)}
                style={({ pressed }) => [
                  styles.volumeBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="volume-up" size={18} color={colors.onPrimary} />
                <Text style={[styles.volumeBtnText, { color: colors.onPrimary }]}>+10</Text>
              </Pressable>
            </View>
          </View>
          <Divider colors={colors} />

          {/* Velocidade da Voz */}
          <View style={styles.fontSizeSection}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Velocidade da Voz</Text>
            <Text style={[styles.settingSubLabel, { color: colors.muted, marginBottom: 10 }]}>
              Toque para ouvir uma prévia
            </Text>
            <View style={[styles.fontSizeRow, { flexWrap: 'wrap' }]}>
              {SPEECH_RATES.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleSpeechRateChange(opt.value)}
                  style={({ pressed }) => [
                    styles.fontSizeBtn,
                    {
                      backgroundColor: settings.speechRate === opt.value ? colors.primary : colors.background,
                      borderColor: settings.speechRate === opt.value ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.fontSizeBtnText,
                      {
                        color: settings.speechRate === opt.value ? colors.onPrimary : colors.foreground,
                        fontSize: 13,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={{ fontSize: 11, color: settings.speechRate === opt.value ? colors.onPrimary + 'BB' : colors.muted }}>
                    {opt.sublabel}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Divider colors={colors} />

          {/* Timer de Emergência */}
          <View style={styles.fontSizeSection}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Timer de Emergência</Text>
            <Text style={[styles.settingSubLabel, { color: colors.muted, marginBottom: 10 }]}>
              Tempo até contatar emergência automaticamente
            </Text>
            <View style={[styles.fontSizeRow, { flexWrap: 'wrap' }]}>
              {TIMER_DURATIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleTimerDurationChange(opt.value)}
                  style={({ pressed }) => [
                    styles.fontSizeBtn,
                    {
                      backgroundColor: settings.timerDuration === opt.value ? colors.primary : colors.background,
                      borderColor: settings.timerDuration === opt.value ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.fontSizeBtnText,
                      {
                        color: settings.timerDuration === opt.value ? colors.onPrimary : colors.foreground,
                        fontSize: 15,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={{ fontSize: 11, color: settings.timerDuration === opt.value ? colors.onPrimary + 'BB' : colors.muted }}>
                    {opt.sublabel}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Divider colors={colors} />

          {/* Teste do Módulo Nativo de Countdown */}
          <View style={styles.fontSizeSection}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Testar Countdown na Notificação</Text>
            <Text style={[styles.settingSubLabel, { color: colors.muted, marginBottom: 10 }]}>
              Verifica se o módulo nativo está funcionando. Minimize o app para ver o countdown na bandeja.
            </Text>
            <Pressable
              onPress={handleTestCountdown}
              style={({ pressed }) => [{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                backgroundColor: countdownTestActive ? colors.error : colors.primary,
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 20,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <MaterialIcons
                name={countdownTestActive ? 'stop' : 'notifications-active'}
                size={22}
                color={colors.onPrimary}
              />
              <Text style={{ fontSize: fs.md, fontWeight: '700', color: colors.onPrimary }}>
                {countdownTestActive
                  ? `Cancelar Teste (${countdownTestSecondsLeft}s)`
                  : 'Iniciar Teste (10s)'}
              </Text>
            </Pressable>
            {countdownTestActive && (
              <View style={{ marginTop: 10, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{
                  height: 6,
                  backgroundColor: colors.error,
                  borderRadius: 3,
                  width: `${(countdownTestSecondsLeft / TEST_DURATION) * 100}%` as any,
                }} />
              </View>
            )}
          </View>
        </CollapsibleSection>

        {/* ═══ SECTION: Check-in Diário ═══ */}
        <CollapsibleSection
          title="Check-in Diário"
          icon="check-circle"
          iconBg={colors.successLight}
          iconColor={colors.success}
          colors={colors}
          defaultOpen={false}
        >
          {/* Toggle: habilitar/desabilitar */}
          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <View style={styles.settingTextBlock}>
              <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.md }]}>
                Check-in ativo
              </Text>
              <Text style={[styles.settingSubLabel, { color: colors.muted, fontSize: fs.sm }]}>
                Notificação diária para confirmar que está bem
              </Text>
            </View>
            <Switch
              value={settings.checkinEnabled}
              onValueChange={async (value) => {
                updateSetting('checkinEnabled', value);
                if (value) {
                  await scheduleCheckin(settings.checkinTime, settings.checkinWindowMinutes);
                } else {
                  await cancelCheckin();
                }
              }}
              trackColor={{ false: colors.border, true: colors.success }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Horário e janela (só visíveis quando ativo) */}
          {settings.checkinEnabled && (
            <>
              {/* Horário do check-in — preset buttons + Personalizar */}
              <View style={{ padding: 16, gap: 10 }}>
                <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.md, marginBottom: 2 }]}>
                  Horário
                </Text>
                <Text style={[styles.settingSubLabel, { color: colors.muted, fontSize: fs.sm }]}>
                  Quando você receberá a notificação diária
                </Text>

                {/* Botões de atalho */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  {(['09:00', '17:00'] as const).map((preset) => {
                    const label = preset === '09:00' ? '☀️ Manhã — 09:00' : '🌆 Tarde — 17:00';
                    const isSelected = settings.checkinTime === preset;
                    return (
                      <Pressable
                        key={preset}
                        onPress={async () => {
                          updateSetting('checkinTime', preset);
                          await scheduleCheckin(preset, settings.checkinWindowMinutes);
                        }}
                        style={({ pressed }) => [{
                          flex: 1,
                          paddingVertical: 14,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          alignItems: 'center' as const,
                          justifyContent: 'center' as const,
                          backgroundColor: isSelected ? colors.success : colors.surface,
                          borderColor: isSelected ? colors.success : colors.border,
                          opacity: pressed ? 0.75 : 1,
                        }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={{
                          color: isSelected ? colors.onSuccess : colors.foreground,
                          fontSize: fs.sm,
                          fontWeight: '700',
                          textAlign: 'center',
                        }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Botão personalizar */}
                {(() => {
                  const isCustom = settings.checkinTime !== '09:00' && settings.checkinTime !== '17:00';
                  return (
                    <Pressable
                      onPress={() => setShowCheckinTimePicker(true)}
                      style={({ pressed }) => [{
                        flexDirection: 'row' as const,
                        alignItems: 'center' as const,
                        justifyContent: 'center' as const,
                        gap: 8,
                        paddingVertical: 12,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: isCustom ? colors.success : colors.border,
                        backgroundColor: isCustom ? colors.successLight : colors.surface,
                        opacity: pressed ? 0.75 : 1,
                      }]}
                      accessibilityRole="button"
                      accessibilityLabel="Personalizar horário do check-in"
                    >
                      <MaterialIcons
                        name="schedule"
                        size={20}
                        color={isCustom ? colors.success : colors.muted}
                      />
                      <Text style={{
                        fontSize: fs.sm,
                        fontWeight: '600',
                        color: isCustom ? colors.success : colors.muted,
                      }}>
                        {isCustom ? `🕐 ${settings.checkinTime} — Personalizado` : 'Personalizar horário'}
                      </Text>
                    </Pressable>
                  );
                })()}

                {/* DateTimePicker nativo */}
                {showCheckinTimePicker && (
                  <DateTimePicker
                    value={parseCheckinTime(settings.checkinTime)}
                    mode="time"
                    is24Hour={true}
                    display={Platform.OS === 'android' ? 'spinner' : 'spinner'}
                    onChange={(event, date) => {
                      setShowCheckinTimePicker(false);
                      if (event.type === 'set' && date) {
                        const newTime = formatCheckinHHMM(date);
                        updateSetting('checkinTime', newTime);
                        scheduleCheckin(newTime, settings.checkinWindowMinutes).catch(() => {});
                      }
                    }}
                  />
                )}
              </View>

              {/* Disclaimer LGPD */}
              <View style={{ padding: 16, paddingTop: 8 }}>
                <Text style={{ color: colors.muted, fontSize: fs.xs, lineHeight: 18 }}>
                  ⚠️ O check-in não substitui serviços de emergência. Em caso de emergência, ligue 192 (SAMU).
                </Text>
              </View>
            </>
          )}
        </CollapsibleSection>

        {/* ═══ SECTION 2: Segurança e Emergência ═══ */}
        <CollapsibleSection
          title="Segurança e Emergência"
          icon="shield"
          iconBg={colors.emergencyLight}
          iconColor={colors.emergency}
          colors={colors}
          defaultOpen={false}
        >
          <SettingToggle
            label="Confirmar SOS"
            sublabel="Pedir confirmação antes de acionar SOS"
            value={settings.sosConfirmation}
            onValueChange={(v) => updateSetting('sosConfirmation', v)}
            colors={colors}
            trackColor={colors.emergency}
          />
          <Divider colors={colors} />
          <SettingToggle
            label="Compartilhar Localização"
            sublabel="Enviar localização GPS automaticamente no SOS"
            value={settings.autoShareLocation}
            onValueChange={(v) => updateSetting('autoShareLocation', v)}
            colors={colors}
            trackColor={colors.success}
          />
          <Divider colors={colors} />

          {/* Location Permission Status */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextBlock}>
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>Permissão de Localização</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <MaterialIcons
                  name={locationStatusInfo[locationStatus].icon}
                  size={14}
                  color={locationStatusInfo[locationStatus].color}
                />
                <Text style={[styles.settingSubLabel, { color: locationStatusInfo[locationStatus].color, marginTop: 0 }]}>
                  {locationStatusInfo[locationStatus].label}
                </Text>
              </View>
              {locationStatus !== 'background' && locationStatus !== 'unknown' && (
                <Text style={[styles.settingSubLabel, { color: colors.muted, marginTop: 2 }]}>
                  {locationStatus === 'denied'
                    ? 'Ative a localização para enviar SOS com GPS'
                    : 'Ative "Tempo Todo" para SOS com app fechado'}
                </Text>
              )}
            </View>
            <Pressable
              onPress={handleOpenLocationSettings}
              style={({ pressed }) => [{
                backgroundColor: colors.primary,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 8,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ color: colors.onPrimary, fontSize: 12, fontWeight: '600' }}>Configurar</Text>
            </Pressable>
          </View>
          <Divider colors={colors} />

          {/* Missed Alarm Threshold */}
          <View style={styles.thresholdSection}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>
              Alarmes não respondidos
            </Text>
            <Text style={[styles.settingSubLabel, { color: colors.muted, marginBottom: 12 }]}>
              Após {settings.missedAlarmThreshold} alarme(s), enviar WhatsApp para contatos
            </Text>
            <View style={styles.thresholdRow}>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateSetting('missedAlarmThreshold', Math.max(1, settings.missedAlarmThreshold - 1));
                }}
                style={({ pressed }) => [
                  styles.thresholdBtn,
                  { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="remove" size={20} color={colors.foreground} />
              </Pressable>
              <View style={[styles.thresholdDisplay, { backgroundColor: colors.emergencyLight }]}>
                <Text style={[styles.thresholdValue, { color: colors.emergency }]}>
                  {settings.missedAlarmThreshold}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateSetting('missedAlarmThreshold', Math.min(10, settings.missedAlarmThreshold + 1));
                }}
                style={({ pressed }) => [
                  styles.thresholdBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="add" size={20} color={colors.onPrimary} />
              </Pressable>
            </View>

            {/* Missed count banner */}
            <View style={[
              styles.missedBanner,
              {
                backgroundColor: state.missedAlarmCount > 0 ? colors.warningLight : colors.successLight,
                borderColor: state.missedAlarmCount > 0 ? colors.warningLight : colors.successLight,
              },
            ]}>
              <MaterialIcons
                name={state.missedAlarmCount > 0 ? 'notifications-off' : 'check-circle'}
                size={16}
                color={state.missedAlarmCount > 0 ? colors.warning : colors.success}
              />
              <Text style={[styles.missedBannerText, { color: colors.foreground }]}>
                {state.missedAlarmCount > 0
                  ? `${state.missedAlarmCount} alarme(s) não respondido(s)`
                  : 'Nenhum alarme não respondido'}
              </Text>
            </View>

            {state.missedAlarmCount > 0 && (
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  dispatch({ type: 'RESET_MISSED_ALARM' });
                }}
                style={({ pressed }) => [styles.resetBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>Resetar contador</Text>
              </Pressable>
            )}
          </View>
          <Divider colors={colors} />

          {/* Custom Emergency Message */}
          <View style={styles.messageSection}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>
              Mensagem de Emergência
            </Text>
            <Text style={[styles.settingSubLabel, { color: colors.muted, marginBottom: 8 }]}>
              Texto enviado via WhatsApp na escalação
            </Text>
            <TextInput
              style={[
                styles.messageInput,
                {
                  color: colors.foreground,
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
              value={settings.emergencyMessage}
              onChangeText={(v) => updateSetting('emergencyMessage', v)}
              multiline
              numberOfLines={3}
              placeholder="Digite a mensagem de emergência..."
              placeholderTextColor={colors.muted}
            />
          </View>
         </CollapsibleSection>
        {/* ═══ SECTION 3: Aparência ═══ */}
        <CollapsibleSection
          title="Aparência"
          icon="palette"
          iconBg={colors.warningLight}
          iconColor={colors.warning}
          colors={colors}
          defaultOpen={false}
        >
          <SettingToggle
            label="Modo Escuro"
            sublabel={colorScheme === 'dark' ? 'Ativado' : 'Desativado'}
            value={colorScheme === 'dark'}
            onValueChange={(v) => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setColorScheme(v ? 'dark' : 'light');
            }}
            colors={colors}
            trackColor={colors.warning}
          />
          <Divider colors={colors} />

          {/* Font Size */}
          <View style={styles.fontSizeSection}>
            <Text style={[styles.settingLabel, { color: colors.foreground }]}>Tamanho da Fonte</Text>
            <Text style={[styles.settingSubLabel, { color: colors.muted, marginBottom: 10 }]}>
              Atual: {fontSizeLabels[settings.fontSize]}
            </Text>
            <View style={styles.fontSizeRow}>
              {(['small', 'medium', 'large'] as const).map((size) => (
                <Pressable
                  key={size}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSetting('fontSize', size);
                  }}
                  style={({ pressed }) => [
                    styles.fontSizeBtn,
                    {
                      backgroundColor: settings.fontSize === size ? colors.primary : colors.background,
                      borderColor: settings.fontSize === size ? colors.primary : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.fontSizeBtnText,
                      {
                        color: settings.fontSize === size ? colors.onPrimary : colors.foreground,
                        fontSize: size === 'small' ? 13 : size === 'medium' ? 15 : 17,
                      },
                    ]}
                  >
                    {fontSizeLabels[size]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Live Preview */}
            <View style={[styles.fontPreviewBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.fontPreviewHeader}>
                <MaterialIcons name="visibility" size={14} color={colors.muted} />
                <Text style={[styles.fontPreviewLabel, { color: colors.muted }]}>Pré-visualização</Text>
              </View>
              <Text style={{ fontSize: fs['2xl'], fontWeight: '800', color: colors.foreground, marginBottom: 2 }}>
                Vigora
              </Text>
              <Text style={{ fontSize: fs.base, color: colors.foreground, lineHeight: fs.scaled(22) }}>
                Seu assistente pessoal de saúde e segurança.
              </Text>
              <Text style={{ fontSize: fs.sm, color: colors.muted, marginTop: 4 }}>
                Próximo alarme: 08:00 - Remédio
              </Text>
            </View>
          </View>
        </CollapsibleSection>

        {/* ═══ SECTION 4: Idioma ═══ */}
        <CollapsibleSection
          title="Idioma"
          icon="language"
          iconBg={colors.successLight}
          iconColor={colors.success}
          colors={colors}
          defaultOpen={false}
        >
          {[
            { code: 'pt' as const, flag: '🇧🇷', label: 'Português (Brasil)' },
            { code: 'en' as const, flag: '🇺🇸', label: 'English (USA)' },
          ].map((lang, idx) => (
            <React.Fragment key={lang.code}>
              {idx > 0 && <Divider colors={colors} />}
              <Pressable
                onPress={() => updateSetting('language', lang.code)}
                style={({ pressed }) => [
                  styles.languageOption,
                  settings.language === lang.code && { backgroundColor: colors.primaryLight },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.flagEmoji}>{lang.flag}</Text>
                <Text style={[styles.languageLabel, { color: colors.foreground }]}>{lang.label}</Text>
                {settings.language === lang.code && (
                  <MaterialIcons name="check-circle" size={22} color={colors.primary} />
                )}
              </Pressable>
            </React.Fragment>
          ))}
        </CollapsibleSection>

        {/* ═══ SECTION 5: Dados e Armazenamento ═══ */}
        <CollapsibleSection
          title="Dados e Armazenamento"
          icon="storage"
          iconBg={colors.errorLight}
          iconColor={colors.error}
          colors={colors}
          defaultOpen={false}
        >
          <View style={styles.storageInfo}>
            <View style={styles.storageRow}>
              <Text style={[styles.storageLabel, { color: colors.foreground }]}>Alarmes salvos</Text>
              <Text style={[styles.storageValue, { color: colors.muted }]}>{state.alarms.length}/24</Text>
            </View>
            <View style={styles.storageRow}>
              <Text style={[styles.storageLabel, { color: colors.foreground }]}>Contatos de emergência</Text>
              <Text style={[styles.storageValue, { color: colors.muted }]}>{state.emergencyContacts.length}</Text>
            </View>
            <View style={styles.storageRow}>
              <Text style={[styles.storageLabel, { color: colors.foreground }]}>Métricas de saúde</Text>
              <Text style={[styles.storageValue, { color: colors.muted }]}>{state.healthMetrics.length}</Text>
            </View>
            <View style={styles.storageRow}>
              <Text style={[styles.storageLabel, { color: colors.foreground }]}>Ficha de anamnese</Text>
              <Text style={[styles.storageValue, { color: colors.muted }]}>{state.anamnesis ? 'Preenchida' : 'Vazia'}</Text>
            </View>
          </View>
          <Divider colors={colors} />
          <View style={styles.dangerZone}>
            <Pressable
              onPress={handleClearData}
              style={({ pressed }) => [
                styles.dangerButton,
                { borderColor: colors.error, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <MaterialIcons name="delete-forever" size={20} color={colors.error} />
              <Text style={[styles.dangerButtonText, { color: colors.error }]}>Limpar Todos os Dados</Text>
            </Pressable>
            <Text style={[styles.dangerHint, { color: colors.muted }]}>
              Remove alarmes, contatos, anamnese e histórico de saúde permanentemente.
            </Text>
          </View>
        </CollapsibleSection>

        {/* ═══ Trial / assinatura: nada é exibido para quem já paga ═══ */}
        <TrialBanner />
        <ExpiredBanner />

        {/* ═══ Footer: Sobre e Legal ═══ */}
        <View style={styles.footerSection}>
          <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
          <View style={styles.footerLogoRow}>
            <View style={[styles.footerLogoBadge, { backgroundColor: colors.emergencyLight }]}>
              <MaterialIcons name="favorite" size={20} color={colors.emergency} />
            </View>
            <View>
              <Text style={[styles.footerAppName, { color: colors.foreground }]}>Vigora</Text>
              <Text style={[styles.footerVersion, { color: colors.muted }]}>Versão 1.0.0</Text>
            </View>
          </View>
          <View style={styles.footerLinks}>
            <Pressable
              onPress={() =>
                showDialog({ title: 'Termos de Serviço', message: 'Vigora - Termos de Serviço\n\nEste aplicativo é fornecido para fins informativos. Não substitui atendimento médico profissional.', variant: 'info', buttons: [{ text: 'OK' }] })
              }
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.footerLink, { color: colors.primary }]}>Termos de Serviço</Text>
            </Pressable>
            <Text style={[styles.footerDot, { color: colors.muted }]}>·</Text>
            <Pressable
              onPress={() =>
                showDialog({ title: 'Política de Privacidade', message: 'Vigora - Política de Privacidade\n\nTodos os seus dados são armazenados localmente neste dispositivo. Nenhum dado é enviado para servidores externos.', variant: 'info', buttons: [{ text: 'OK' }] })
              }
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.footerLink, { color: colors.primary }]}>Privacidade</Text>
            </Pressable>
            <Text style={[styles.footerDot, { color: colors.muted }]}>·</Text>
            <Pressable
              onPress={() =>
                showDialog({ title: 'Licenças', message: 'Este aplicativo utiliza bibliotecas de código aberto. Obrigado à comunidade de desenvolvedores!', variant: 'info', buttons: [{ text: 'OK' }] })
              }
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.footerLink, { color: colors.primary }]}>Licenças</Text>
            </Pressable>
          </View>
          <Text style={[styles.footerCopyright, { color: colors.muted }]}>
            Dados armazenados localmente no dispositivo.
          </Text>
          <Text style={[styles.footerCopyright, { color: colors.muted }]}>
            © 2026 Vigora. Todos os direitos reservados.
          </Text>
        </View>
      </ScrollView>
      </FormKeyboardView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

// --- Styles -----------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSubtitle: { fontSize: 14, marginTop: 2 },
  content: { padding: 16, gap: 12 },

  // Section Card
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Setting Rows
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingTextBlock: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: { fontSize: 15, fontWeight: '500' },
  settingSubLabel: { fontSize: 13, marginTop: 1 },

  // Divider
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  // Volume
  volumeSection: { padding: 16, gap: 10 },
  volumeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  volumeValue: { fontSize: 20, fontWeight: '700' },
  volumeBarBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  volumeBarFill: { height: '100%', borderRadius: 4 },
  volumeControls: { flexDirection: 'row', gap: 10 },
  volumeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  volumeBtnText: { fontSize: 14, fontWeight: '600' },

  // Threshold
  thresholdSection: { padding: 16 },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  thresholdBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdDisplay: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdValue: { fontSize: 24, fontWeight: '800' },
  missedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  missedBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  resetBtn: { alignItems: 'center', paddingVertical: 8, marginTop: 4 },

  // Emergency Message
  messageSection: { padding: 16 },
  messageInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Font Size
  fontSizeSection: { padding: 16 },
  fontSizeRow: { flexDirection: 'row', gap: 10 },
  fontPreviewBox: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 2,
  },
  fontPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  fontPreviewLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fontSizeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeBtnText: { fontWeight: '600' },

  // Language
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  flagEmoji: { fontSize: 24 },
  languageLabel: { flex: 1, fontSize: 15, fontWeight: '500' },

  // About
  aboutBlock: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  aboutLogoBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  aboutAppName: { fontSize: 20, fontWeight: '800' },
  aboutVersion: { fontSize: 14 },

  // Storage
  storageInfo: { padding: 16, gap: 10 },
  storageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storageLabel: { fontSize: 14, fontWeight: '500' },
  storageValue: { fontSize: 14, fontWeight: '600' },

  // Danger Zone
  dangerZone: { padding: 16, gap: 8 },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  dangerButtonText: { fontSize: 15, fontWeight: '600' },
  dangerHint: { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Footer
  footerSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 10,
  },
  footerDivider: {
    width: '60%',
    height: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  footerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerLogoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerAppName: {
    fontSize: 16,
    fontWeight: '700',
  },
  footerVersion: {
    fontSize: 12,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '500',
  },
  footerDot: {
    fontSize: 14,
    fontWeight: '700',
  },
  footerCopyright: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
