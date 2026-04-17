import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useAppContext } from '@/lib/app-context';
import { useThemeContext } from '@/lib/theme-provider';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const { colorScheme, setColorScheme } = useThemeContext();
  const { settings } = state;

  const updateSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } });
  };

  const handleVolumeChange = (delta: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
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
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            dispatch({ type: 'CLEAR_ALL_DATA' });
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Configurações</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Notifications Section */}
        <SectionTitle title="Notificações" colors={colors} />
        <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: colors.primaryLight }]}>
                <MaterialIcons name="notifications" size={20} color="#0066CC" />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>Notificações</Text>
                <Text style={[styles.settingSubLabel, { color: colors.muted }]}>
                  Alertas de alarmes e SOS
                </Text>
              </View>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(v) => updateSetting('notificationsEnabled', v)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Volume Section */}
        <SectionTitle title="Volume do Alarme" colors={colors} />
        <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.volumeSection}>
            <View style={styles.volumeHeader}>
              <MaterialIcons
                name={settings.alarmVolume === 0 ? 'volume-off' : 'volume-up'}
                size={22}
                color={colors.muted}
              />
              <Text style={[styles.volumeValue, { color: colors.foreground }]}>
                {settings.alarmVolume}%
              </Text>
            </View>

            {/* Volume Bar */}
            <View style={[styles.volumeBarBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.volumeBarFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${settings.alarmVolume}%`,
                  },
                ]}
              />
            </View>

            {/* Volume Controls */}
            <View style={styles.volumeControls}>
              <Pressable
                onPress={() => handleVolumeChange(-10)}
                style={({ pressed }) => [
                  styles.volumeBtn,
                  { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.volumeBtnText, { color: colors.foreground }]}>-10%</Text>
              </Pressable>
              <Pressable
                onPress={() => handleVolumeChange(10)}
                style={({ pressed }) => [
                  styles.volumeBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.volumeBtnText, { color: '#FFFFFF' }]}>+10%</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Theme Section */}
        <SectionTitle title="Aparência" colors={colors} />
        <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: colors.warningLight }]}>
                <MaterialIcons name={colorScheme === 'dark' ? 'dark-mode' : 'light-mode'} size={20} color="#F59E0B" />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.foreground }]}>Modo Escuro</Text>
                <Text style={[styles.settingSubLabel, { color: colors.muted }]}>
                  {colorScheme === 'dark' ? 'Ativado' : 'Desativado'}
                </Text>
              </View>
            </View>
            <Switch
              value={colorScheme === 'dark'}
              onValueChange={(v) => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setColorScheme(v ? 'dark' : 'light');
              }}
              trackColor={{ false: colors.border, true: '#F59E0B' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Language Section */}
        <SectionTitle title="Idioma" colors={colors} />
        <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => updateSetting('language', 'pt')}
            style={[
              styles.languageOption,
              settings.language === 'pt' && { backgroundColor: colors.primaryLight },
            ]}
          >
            <Text style={styles.flagEmoji}>🇧🇷</Text>
            <Text style={[styles.languageLabel, { color: colors.foreground }]}>
              Português (Brasil)
            </Text>
            {settings.language === 'pt' && (
              <MaterialIcons name="check" size={20} color="#0066CC" />
            )}
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={() => updateSetting('language', 'en')}
            style={[
              styles.languageOption,
              settings.language === 'en' && { backgroundColor: colors.primaryLight },
            ]}
          >
            <Text style={styles.flagEmoji}>🇺🇸</Text>
            <Text style={[styles.languageLabel, { color: colors.foreground }]}>
              English (USA)
            </Text>
            {settings.language === 'en' && (
              <MaterialIcons name="check" size={20} color="#0066CC" />
            )}
          </Pressable>
        </View>

        {/* About Section */}
        <SectionTitle title="Sobre" colors={colors} />
        <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.aboutRow}>
            <View style={[styles.settingIcon, { backgroundColor: colors.emergencyLight }]}>
              <MaterialIcons name="favorite" size={20} color={colors.emergency} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: colors.foreground }]}>Vigora Saúde</Text>
              <Text style={[styles.settingSubLabel, { color: colors.muted }]}>Versão 1.0.0</Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
            onPress={() => Alert.alert('Termos de Serviço', 'Vigora Saúde - Termos de Serviço\n\nEste aplicativo é fornecido para fins informativos. Não substitui atendimento médico profissional.')}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>Termos de Serviço</Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
            onPress={() => Alert.alert('Política de Privacidade', 'Vigora Saúde - Política de Privacidade\n\nTodos os seus dados são armazenados localmente neste dispositivo. Nenhum dado é enviado para servidores externos.')}
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>Política de Privacidade</Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Danger Zone */}
        <SectionTitle title="Dados" colors={colors} />
        <Pressable
          onPress={handleClearData}
          style={({ pressed }) => [
            styles.dangerButton,
            { borderColor: '#EF4444', opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialIcons name="delete" size={20} color="#EF4444" />
          <Text style={styles.dangerButtonText}>Limpar Todos os Dados</Text>
        </Pressable>
        <Text style={[styles.dangerHint, { color: colors.muted }]}>
          Remove todos os alarmes, contatos, anamnese e histórico de saúde.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function SectionTitle({ title, colors }: { title: string; colors: ReturnType<typeof useColors> }) {
  return (
    <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title.toUpperCase()}</Text>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 28, fontWeight: '800' },
  content: { padding: 20, gap: 8, paddingBottom: 40 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginTop: 16, marginBottom: 4 },
  settingsGroup: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: { fontSize: 16, fontWeight: '500' },
  settingSubLabel: { fontSize: 13, marginTop: 1 },
  volumeSection: { padding: 16, gap: 12 },
  volumeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volumeValue: { fontSize: 22, fontWeight: '700' },
  volumeBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  volumeBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  volumeControls: { flexDirection: 'row', gap: 10 },
  volumeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  volumeBtnText: { fontSize: 15, fontWeight: '600' },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  flagEmoji: { fontSize: 24 },
  languageLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  linkText: { fontSize: 16, fontWeight: '500' },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 8,
  },
  dangerButtonText: { color: "#EF4444", fontSize: 16, fontWeight: '600' },
  dangerHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
