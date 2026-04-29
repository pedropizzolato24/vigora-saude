/**
 * app/mode-select.tsx
 *
 * Tela de seleção de papel exibida após o onboarding (e futuramente após login).
 * O usuário escolhe se usará o app como monitorado ou como cuidador.
 */

import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useUserMode } from '@/lib/user-mode-context';

type Role = 'monitored' | 'caregiver';

interface RoleOption {
  role: Role;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  subtitle: string;
  features: string[];
  color: string;
  bg: string;
}

const ROLES: RoleOption[] = [
  {
    role: 'monitored',
    icon: 'favorite',
    title: 'Quero monitorar minha saúde',
    subtitle: 'Sou o usuário principal',
    features: [
      'Alarmes de medicação inteligentes',
      'Registro de métricas de saúde',
      'Botão SOS de emergência',
      'Ficha médica (anamnese)',
      'Alertas automáticos para cuidadores',
    ],
    color: '#0066CC',
    bg: '#EFF6FF',
  },
  {
    role: 'caregiver',
    icon: 'people',
    title: 'Sou cuidador de alguém',
    subtitle: 'Vou receber alertas de outra pessoa',
    features: [
      'Alertas quando alarmes não são respondidos',
      'Localização do monitorado em tempo real',
      'Histórico de saúde e medicações',
      'Notificações de emergência',
      'Acompanhamento do status do monitorado',
    ],
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
];

export default function ModeSelectScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setMode } = useUserMode();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleSelect = (role: Role) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRole(role);
  };

  const handleConfirm = async () => {
    if (!selectedRole) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsConfirming(true);
    await setMode(selectedRole);
    if (selectedRole === 'caregiver') {
      router.replace('/(caregiver)/');
    } else {
      router.replace('/(tabs)/');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.logoCircle, { backgroundColor: '#0066CC15' }]}>
              <MaterialIcons name="health-and-safety" size={48} color="#0066CC" />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Como você vai usar o Vigora Saúde?
            </Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Escolha o seu perfil para personalizar a experiência
            </Text>
          </View>

          {/* Role Options */}
          <View style={styles.options}>
            {ROLES.map((opt) => {
              const isSelected = selectedRole === opt.role;
              return (
                <Pressable
                  key={opt.role}
                  onPress={() => handleSelect(opt.role)}
                  style={({ pressed }) => [
                    styles.optionCard,
                    {
                      backgroundColor: isSelected ? opt.bg : colors.surface,
                      borderColor: isSelected ? opt.color : colors.border,
                      borderWidth: isSelected ? 2 : 1,
                      transform: [{ scale: pressed ? 0.985 : 1 }],
                    },
                  ]}
                >
                  {/* Header da opção */}
                  <View style={styles.optionHeader}>
                    <View style={[styles.optionIconBg, { backgroundColor: opt.color + '20' }]}>
                      <MaterialIcons name={opt.icon} size={28} color={opt.color} />
                    </View>
                    <View style={styles.optionTexts}>
                      <Text style={[styles.optionTitle, { color: colors.foreground }]}>
                        {opt.title}
                      </Text>
                      <Text style={[styles.optionSubtitle, { color: opt.color }]}>
                        {opt.subtitle}
                      </Text>
                    </View>
                    <View style={[
                      styles.radioCircle,
                      {
                        borderColor: isSelected ? opt.color : colors.border,
                        backgroundColor: isSelected ? opt.color : 'transparent',
                      },
                    ]}>
                      {isSelected && (
                        <MaterialIcons name="check" size={14} color="#FFFFFF" />
                      )}
                    </View>
                  </View>

                  {/* Funcionalidades */}
                  <View style={styles.featureList}>
                    {opt.features.map((feat) => (
                      <View key={feat} style={styles.featureRow}>
                        <MaterialIcons name="check-circle" size={16} color={opt.color} />
                        <Text style={[styles.featureText, { color: colors.foreground }]}>
                          {feat}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Confirm Button */}
          <Pressable
            onPress={handleConfirm}
            disabled={!selectedRole || isConfirming}
            style={({ pressed }) => [
              styles.confirmBtn,
              {
                backgroundColor: selectedRole
                  ? (selectedRole === 'caregiver' ? '#7C3AED' : '#0066CC')
                  : colors.border,
                opacity: pressed || isConfirming ? 0.8 : 1,
              },
            ]}
          >
            {isConfirming ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.confirmText}>
                  {selectedRole ? 'Continuar' : 'Selecione um perfil'}
                </Text>
                {selectedRole && (
                  <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
                )}
              </>
            )}
          </Pressable>

          {/* Note */}
          <Text style={[styles.note, { color: colors.muted }]}>
            Você poderá alterar essa escolha nas configurações do app.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    padding: 24,
    gap: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
  options: {
    gap: 16,
  },
  optionCard: {
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  optionIconBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTexts: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  optionSubtitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  featureList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    lineHeight: 19,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  confirmText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  note: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
