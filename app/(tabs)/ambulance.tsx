import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useAppContext } from '@/lib/app-context';

type AmbulanceType = 'sus' | 'plan' | 'private';

interface AmbulanceOption {
  type: AmbulanceType;
  label: string;
  description: string;
  phone: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
}

export default function AmbulanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state } = useAppContext();
  const [selectedType, setSelectedType] = useState<AmbulanceType>('sus');

  const anamnesis = state.anamnesis;

  const options: AmbulanceOption[] = [
    {
      type: 'sus',
      label: 'SAMU (SUS)',
      description: 'Serviço de Atendimento Móvel de Urgência — gratuito',
      phone: '192',
      icon: 'local-hospital',
      color: colors.emergency,
    },
    {
      type: 'plan',
      label: 'Plano de Saúde',
      description: anamnesis?.healthPlanProvider
        ? `${anamnesis.healthPlanProvider} — ${anamnesis.healthPlanNumber || 'Número não informado'}`
        : 'Cadastre seu plano na ficha de anamnese',
      phone: anamnesis?.healthPlanNumber || '',
      icon: 'medical-services',
      color: colors.primary,
    },
    {
      type: 'private',
      label: 'Bombeiros',
      description: 'Corpo de Bombeiros — emergências gerais',
      phone: '193',
      icon: 'warning',
      color: colors.warning,
    },
  ];

  const selectedOption = options.find((o) => o.type === selectedType)!;

  const handleCall = async () => {
    const phone = selectedOption.phone;

    if (!phone) {
      Alert.alert(
        'Número não disponível',
        'Cadastre o número do seu plano de saúde na Ficha de Anamnese.'
      );
      return;
    }

    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    Alert.alert(
      `Chamar ${selectedOption.label}?`,
      `Você será redirecionado para ligar para ${phone}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: `Ligar para ${phone}`,
          onPress: async () => {
            const url = `tel:${phone}`;
            const canOpen = await Linking.canOpenURL(url);
            if (canOpen) {
              await Linking.openURL(url);
            } else {
              Alert.alert('Erro', 'Não foi possível abrir o discador. Ligue manualmente para ' + phone);
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Ambulância</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Acione atendimento de emergência
          </Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.emergencyLight }]}>
          <MaterialIcons name="local-hospital" size={24} color={colors.emergency} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Emergency Banner */}
        <View style={[styles.emergencyBanner, { backgroundColor: colors.emergencyLight, borderColor: '#FF000040' }]}>
          <MaterialIcons name="warning" size={22} color={colors.emergency} />
          <Text style={[styles.emergencyText, { color: colors.foreground }]}>
            <Text style={{ fontWeight: '700', color: colors.emergency }}>Emergência grave? </Text>
            Ligue imediatamente para o SAMU: 192
          </Text>
        </View>

        {/* Type Selection */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>
          SELECIONE O TIPO DE ATENDIMENTO
        </Text>
        <View style={styles.optionsGrid}>
          {options.map((opt) => (
            <Pressable
              key={opt.type}
              onPress={() => setSelectedType(opt.type)}
              style={({ pressed }) => [
                styles.optionCard,
                {
                  backgroundColor: selectedType === opt.type ? opt.color + '15' : colors.surface,
                  borderColor: selectedType === opt.type ? opt.color : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <View style={[styles.optionIcon, { backgroundColor: opt.color + '20' }]}>
                <MaterialIcons name={opt.icon} size={28} color={opt.color} />
              </View>
              <Text style={[styles.optionLabel, { color: colors.foreground }]}>{opt.label}</Text>
              <Text style={[styles.optionDesc, { color: colors.muted }]} numberOfLines={2}>
                {opt.description}
              </Text>
              {selectedType === opt.type && (
                <View style={[styles.selectedBadge, { backgroundColor: opt.color }]}>
                  <MaterialIcons name="check" size={14} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Selected Option Details */}
        <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: selectedOption.color + '40' }]}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Serviço</Text>
            <Text style={[styles.detailValue, { color: colors.foreground }]}>{selectedOption.label}</Text>
          </View>
          <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>Número</Text>
            <Text style={[styles.detailPhone, { color: selectedOption.color }]}>
              {selectedOption.phone || 'Não configurado'}
            </Text>
          </View>
          {anamnesis && (
            <>
              <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.muted }]}>Paciente</Text>
                <Text style={[styles.detailValue, { color: colors.foreground }]}>{anamnesis.fullName || '—'}</Text>
              </View>
            </>
          )}
        </View>

        {/* Call Button */}
        <Pressable
          onPress={handleCall}
          style={({ pressed }) => [
            styles.callButton,
            {
              backgroundColor: selectedOption.color,
              opacity: pressed ? 0.85 : 1,
              shadowColor: selectedOption.color,
            },
          ]}
        >
          <MaterialIcons name="phone" size={28} color="#FFFFFF" />
          <Text style={styles.callButtonText}>
            Chamar {selectedOption.label}
          </Text>
          <Text style={styles.callButtonPhone}>{selectedOption.phone}</Text>
        </Pressable>

        {/* Safety Instructions */}
        <View style={[styles.instructionsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.instructionsTitle, { color: colors.foreground }]}>
            Instruções de Segurança
          </Text>
          {[
            'Mantenha a calma e fale claramente',
            'Informe seu endereço completo',
            'Descreva os sintomas do paciente',
            'Não desligue até o operador autorizar',
            'Desbloqueie o acesso para a ambulância',
          ].map((instruction, i) => (
            <View key={i} style={styles.instructionRow}>
              <View style={[styles.instructionBullet, { backgroundColor: colors.primary }]}>
                <Text style={styles.instructionNumber}>{i + 1}</Text>
              </View>
              <Text style={[styles.instructionText, { color: colors.foreground }]}>
                {instruction}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 2 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  emergencyText: { flex: 1, fontSize: 14, lineHeight: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginTop: 4 },
  optionsGrid: { flexDirection: 'row', gap: 10 },
  optionCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  optionDesc: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  detailLabel: { fontSize: 14, fontWeight: '500' },
  detailValue: { fontSize: 15, fontWeight: '600' },
  detailPhone: { fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  detailDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  callButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    gap: 4,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  callButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  callButtonPhone: { color: '#FFFFFF', fontSize: 16, opacity: 0.85, fontWeight: '600' },
  instructionsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  instructionsTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  instructionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  instructionBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionNumber: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  instructionText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
