import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useAppContext } from '@/lib/app-context';
import { useThemeContext } from '@/lib/theme-provider';
import { useFontSize } from '@/lib/font-size-context';

// ─── Collapsible Section ────────────────────────────────────────────────────

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
    <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

// ─── Setting Row Components ─────────────────────────────────────────────────

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

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const { colorScheme, setColorScheme } = useThemeContext();
  const fs = useFontSize();
  const { settings } = state;

  const updateSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } });
  };

  const handleVolumeChange = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newVolume = Math.max(0, Math.min(100, settings.alarmVolume + delta));
    updateSetting('alarmVolume', newVolume);
  };

  const handleClearData = () => {
    Alert.alert(
      'Limpar Todos os Dados',
      'Esta ação removerá todos os alarmes, contatos, ficha de anamnese e histórico de saúde. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar Tudo',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            dispatch({ type: 'CLEAR_ALL_DATA' });
          },
        },
      ]
    );
  };

  const fontSizeLabels = { small: 'Pequeno', medium: 'Médio', large: 'Grande' };

  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs['2xl'] }]}>Configurações</Text>
        <Text style={[styles.headerSubtitle, { color: colors.muted, fontSize: fs.sm }]}>Personalize sua experiência</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ═══ SECTION 1: Notificações e Alarmes ═══ */}
        <CollapsibleSection
          title="Notificações e Alarmes"
          icon="notifications"
          iconBg={colors.primaryLight}
          iconColor={colors.primary}
          colors={colors}
          defaultOpen={true}
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

          {/* Volume */}
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
            trackColor="#F59E0B"
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
                Vigora Saúde
              </Text>
              <Text style={{ fontSize: fs.base, color: colors.foreground, lineHeight: fs.scaled(22) }}>
                Seu assistente pessoal de saúde e segurança.
              </Text>
              <Text style={{ fontSize: fs.sm, color: colors.muted, marginTop: 4 }}>
                Próximo alarme: 08:00 — Remédio
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

        {/* ═══ Footer: Sobre e Legal ═══ */}
        <View style={styles.footerSection}>
          <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
          <View style={styles.footerLogoRow}>
            <View style={[styles.footerLogoBadge, { backgroundColor: colors.emergencyLight }]}>
              <MaterialIcons name="favorite" size={20} color={colors.emergency} />
            </View>
            <View>
              <Text style={[styles.footerAppName, { color: colors.foreground }]}>Vigora Saúde</Text>
              <Text style={[styles.footerVersion, { color: colors.muted }]}>Versão 1.0.0</Text>
            </View>
          </View>
          <View style={styles.footerLinks}>
            <Pressable
              onPress={() =>
                Alert.alert(
                  'Termos de Serviço',
                  'Vigora Saúde - Termos de Serviço\n\nEste aplicativo é fornecido para fins informativos. Não substitui atendimento médico profissional.'
                )
              }
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.footerLink, { color: colors.primary }]}>Termos de Serviço</Text>
            </Pressable>
            <Text style={[styles.footerDot, { color: colors.muted }]}>·</Text>
            <Pressable
              onPress={() =>
                Alert.alert(
                  'Política de Privacidade',
                  'Vigora Saúde - Política de Privacidade\n\nTodos os seus dados são armazenados localmente neste dispositivo. Nenhum dado é enviado para servidores externos.'
                )
              }
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.footerLink, { color: colors.primary }]}>Privacidade</Text>
            </Pressable>
            <Text style={[styles.footerDot, { color: colors.muted }]}>·</Text>
            <Pressable
              onPress={() =>
                Alert.alert('Licenças', 'Este aplicativo utiliza bibliotecas de código aberto. Obrigado à comunidade de desenvolvedores!')
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
            © 2026 Vigora Saúde. Todos os direitos reservados.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
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
