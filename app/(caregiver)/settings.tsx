/**
 * app/(caregiver)/settings.tsx — Configurações do Cuidador
 *
 * Gerencia a vinculação com o monitorado (entrada de código de convite),
 * preferências de notificação e opção de trocar de modo de uso do app.
 */

import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '@/components/screen-container';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { useUserMode } from '@/lib/user-mode-context';
import { useThemeContext } from '@/lib/theme-provider';

const CAREGIVER_COLOR = '#7C3AED';

export default function CaregiverSettingsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, dispatch, linkMonitoredPerson } = useCaregiverContext();
  const { clearMode } = useUserMode();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const { isDark, toggleTheme } = useThemeContext();

  const [inviteCode, setInviteCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const { monitoredPerson } = state;

  const handleLinkCode = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setIsLinking(true);
    const result = await linkMonitoredPerson(code);
    setIsLinking(false);

    if (result.success) {
      setInviteCode('');
      showToast({ message: 'Vinculado com sucesso! Agora você receberá alertas.', variant: 'success' });
    } else {
      showToast({ message: result.error ?? 'Código inválido ou expirado.', variant: 'error' });
    }
  };

  const handleUnlink = () => {
    showDialog({
      title: 'Desvincular monitorado',
      message: `Deseja parar de monitorar ${monitoredPerson?.name}? Você deixará de receber alertas desta pessoa.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'UNLINK_MONITORED_PERSON' });
            showToast({ message: 'Monitorado desvinculado.', variant: 'success' });
          },
        },
      ],
    });
  };

  const handleSwitchMode = () => {
    showDialog({
      title: 'Trocar modo de uso',
      message: 'Deseja mudar para o modo de usuário monitorado? Você sairá do modo cuidador.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Trocar modo',
          onPress: async () => {
            await clearMode();
            router.replace('/mode-select');
          },
        },
      ],
    });
  };

  return (
    <ScreenContainer edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>
            Configurações
          </Text>
          <View style={[styles.modeBadge, { backgroundColor: CAREGIVER_COLOR + '15' }]}>
            <MaterialIcons name="people" size={14} color={CAREGIVER_COLOR} />
            <Text style={[styles.modeBadgeText, { color: CAREGIVER_COLOR }]}>Cuidador</Text>
          </View>
        </View>

        {/* Vinculação */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: CAREGIVER_COLOR + '40' }]}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIcon, { backgroundColor: CAREGIVER_COLOR + '15' }]}>
              <MaterialIcons name="link" size={20} color={CAREGIVER_COLOR} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.base }]}>
              Vinculação com Monitorado
            </Text>
          </View>

          {monitoredPerson ? (
            // Já vinculado
            <View style={styles.linkedBox}>
              <View style={[styles.linkedRow, { backgroundColor: '#F5F3FF', borderColor: CAREGIVER_COLOR + '30' }]}>
                <View style={[styles.linkedAvatar, { backgroundColor: CAREGIVER_COLOR + '20' }]}>
                  <MaterialIcons name="person" size={24} color={CAREGIVER_COLOR} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkedName, { color: colors.foreground }]}>
                    {monitoredPerson.name}
                  </Text>
                  <Text style={[styles.linkedPhone, { color: colors.muted }]}>
                    {monitoredPerson.phone}
                  </Text>
                </View>
                <View style={[styles.activeChip, { backgroundColor: '#DCFCE7' }]}>
                  <MaterialIcons name="check-circle" size={12} color="#16A34A" />
                  <Text style={[styles.activeChipText, { color: '#16A34A' }]}>Ativo</Text>
                </View>
              </View>

              <Pressable
                onPress={handleUnlink}
                style={({ pressed }) => [
                  styles.unlinkBtn,
                  { borderColor: colors.error + '60', opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="link-off" size={16} color={colors.error} />
                <Text style={[styles.unlinkText, { color: colors.error }]}>Desvincular</Text>
              </Pressable>
            </View>
          ) : (
            // Não vinculado
            <View style={styles.linkInputBox}>
              <Text style={[styles.linkInstructions, { color: colors.muted, fontSize: fs.sm }]}>
                Peça ao usuário monitorado que gere um código de convite no app dele e insira abaixo:
              </Text>
              <View style={styles.codeInputRow}>
                <TextInput
                  value={inviteCode}
                  onChangeText={(v) => setInviteCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="XXXXXX"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  style={[
                    styles.codeInput,
                    {
                      backgroundColor: colors.background,
                      color: colors.foreground,
                      borderColor: inviteCode.length === 6 ? CAREGIVER_COLOR : colors.border,
                    },
                  ]}
                />
                <Pressable
                  onPress={handleLinkCode}
                  disabled={inviteCode.length !== 6 || isLinking}
                  style={({ pressed }) => [
                    styles.linkBtn,
                    {
                      backgroundColor: inviteCode.length === 6 ? CAREGIVER_COLOR : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {isLinking
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <MaterialIcons name="check" size={22} color="#FFFFFF" />
                  }
                </Pressable>
              </View>
              {inviteCode.length > 0 && inviteCode.length < 6 && (
                <Text style={[styles.codeHint, { color: colors.muted }]}>
                  {6 - inviteCode.length} caractere(s) restante(s)
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Aparência */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIcon, { backgroundColor: '#6B728015' }]}>
              <MaterialIcons name="palette" size={20} color="#6B7280" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.base }]}>
              Aparência
            </Text>
          </View>

          <Pressable
            onPress={toggleTheme}
            style={({ pressed }) => [
              styles.settingRow,
              { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons
              name={isDark ? 'dark-mode' : 'light-mode'}
              size={20}
              color={colors.muted}
            />
            <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.base }]}>
              {isDark ? 'Modo escuro' : 'Modo claro'}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Sobre */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIcon, { backgroundColor: '#6B728015' }]}>
              <MaterialIcons name="info" size={20} color="#6B7280" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.base }]}>
              Sobre
            </Text>
          </View>

          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <MaterialIcons name="health-and-safety" size={20} color={colors.muted} />
            <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.base }]}>
              Vigora Saúde — Cuidador
            </Text>
            <Text style={[styles.settingValue, { color: colors.muted }]}>v1.0.0</Text>
          </View>

          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <MaterialIcons name="people" size={20} color={colors.muted} />
            <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.base }]}>
              Modo atual
            </Text>
            <Text style={[styles.settingValue, { color: CAREGIVER_COLOR, fontWeight: '700' }]}>
              Cuidador
            </Text>
          </View>
        </View>

        {/* Trocar modo */}
        <Pressable
          onPress={handleSwitchMode}
          style={({ pressed }) => [
            styles.switchModeBtn,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialIcons name="swap-horiz" size={20} color={colors.muted} />
          <Text style={[styles.switchModeText, { color: colors.foreground, fontSize: fs.sm }]}>
            Trocar para modo de usuário monitorado
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
        </Pressable>
      </ScrollView>
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  modeBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontWeight: '700',
    flex: 1,
  },
  // Linked state
  linkedBox: {
    gap: 10,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  linkedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedName: {
    fontSize: 15,
    fontWeight: '700',
  },
  linkedPhone: {
    fontSize: 13,
    marginTop: 2,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  unlinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  unlinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Link input state
  linkInputBox: {
    gap: 12,
  },
  linkInstructions: {
    lineHeight: 20,
  },
  codeInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  codeInput: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 6,
  },
  linkBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  // Settings rows
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingLabel: {
    flex: 1,
    fontWeight: '500',
  },
  settingValue: {
    fontSize: 14,
  },
  // Switch mode
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  switchModeText: {
    flex: 1,
    lineHeight: 19,
  },
});
