import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAccessibility } from '@/lib/accessibility-context';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { ScreenHeaderBack } from '@/components/screen-header-back';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
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
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { state } = useAppContext();
  const [selectedType, setSelectedType] = useState<AmbulanceType>('sus');
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();

  const anamnesis = state.anamnesis;
  const router = useRouter();
  const isHealthPlanConfigured = !!(anamnesis?.healthPlanProvider && anamnesis?.healthPlanNumber);
  const { dialogProps, showDialog } = useAppDialog();

  const options: AmbulanceOption[] = [
    {
      type: 'sus',
      label: 'SAMU (SUS)',
      description: 'Serviço de Atendimento Móvel de Urgência - gratuito',
      phone: '192',
      icon: 'local-hospital',
      color: colors.emergency,
    },
    {
      type: 'plan',
      label: 'Plano de Saúde',
      description: anamnesis?.healthPlanProvider
        ? `${anamnesis.healthPlanProvider} - ${anamnesis.healthPlanNumber || 'Número não informado'}`
        : 'Cadastre seu plano na ficha de anamnese',
      phone: anamnesis?.healthPlanNumber || '',
      icon: 'medical-services',
      color: colors.primary,
    },
    {
      type: 'private',
      label: 'Bombeiros',
      description: 'Corpo de Bombeiros - emergências gerais',
      phone: '193',
      icon: 'warning',
      color: colors.warning,
    },
  ];

  const selectedOption = options.find((o) => o.type === selectedType)!;

  const handleCall = async () => {
    const phone = selectedOption.phone;

    if (!phone || (selectedOption.type === 'plan' && !isHealthPlanConfigured)) {
      showDialog({
        title: 'Plano de Saúde não configurado',
        message: 'Você ainda não cadastrou seu plano de saúde. Deseja ir para a Ficha de Anamnese agora?',
        variant: 'warning',
        buttons: [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Configurar Agora', onPress: () => router.push('/(tabs)/anamnesis') },
        ],
      });
      return;
    }

    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    showDialog({
      title: `Chamar ${selectedOption.label}?`,
      message: `Você será redirecionado para ligar para ${phone}.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: `Ligar para ${phone}`,
          onPress: async () => {
            // Não usar canOpenURL: no Android 11+ retorna false para tel: sem
            // <queries> no manifest (package visibility), mesmo com discador.
            try {
              await Linking.openURL(`tel:${phone}`);
            } catch {
              showDialog({ title: 'Erro', message: 'Não foi possível abrir o discador. Ligue manualmente para ' + phone, variant: 'error', buttons: [{ text: 'OK' }] });
            }
          },
        },
      ],
    });
  };

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    const a11yOptions = [
      { label: 'SAMU (SUS)', phone: '192', icon: 'local-hospital' as const, color: ac.emergency, borderColor: ac.emergency },
      { label: 'Bombeiros', phone: '193', icon: 'warning' as const, color: colors.accent, borderColor: colors.accent },
    ];
    return (
      <>
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.bar, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ScreenHeaderBack />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Ambulância</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>Acione atendimento de emergência</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
          {/* Emergency banner */}
          <View style={{ backgroundColor: ac.error + '20', borderRadius: 16, padding: 16, borderWidth: 2, borderColor: ac.emergency, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <MaterialIcons name="warning" size={36} color={ac.emergency} />
            <Text style={{ flex: 1, fontSize: af.md, fontWeight: '800', color: ac.emergency, lineHeight: af.md * 1.4 }}>
              Emergência grave? Ligue agora: SAMU 192
            </Text>
          </View>
          {/* Large call buttons */}
          {a11yOptions.map((opt) => (
            <Pressable
              key={opt.phone}
              onPress={async () => {
                if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                showDialog({
                  title: `Ligar para ${opt.label}?`,
                  message: `Você será redirecionado para ligar para ${opt.phone}.`,
                  variant: 'confirm',
                  buttons: [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: `Ligar ${opt.phone}`, onPress: async () => { try { await Linking.openURL(`tel:${opt.phone}`); } catch { showDialog({ title: 'Erro', message: 'Ligue manualmente para ' + opt.phone, variant: 'error', buttons: [{ text: 'OK' }] }); } } },
                  ],
                });
              }}
              style={({ pressed }) => [{
                backgroundColor: opt.color,
                borderRadius: 20,
                paddingVertical: as_.buttonPadding + 8,
                paddingHorizontal: 24,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                borderWidth: 4,
                borderColor: opt.borderColor,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}
            >
              <MaterialIcons name={opt.icon} size={44} color={ac.onEmergency} />
              <View>
                <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.onEmergency }}>{opt.label}</Text>
                <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.onEmergency, letterSpacing: 4 }}>{opt.phone}</Text>
              </View>
            </Pressable>
          ))}
          {/* Instructions */}
          <View style={{ backgroundColor: ac.surface, borderRadius: 16, padding: 20, borderWidth: 2, borderColor: ac.border, gap: 14 }}>
            <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>O que fazer enquanto espera:</Text>
            {['Fique em local seguro e visível', 'Informe seu endereço completo', 'Não desligue o telefone', 'Siga as instruções do atendente'].map((tip, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: ac.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: af.sm, fontWeight: '900', color: ac.onPrimary }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: af.md, color: ac.foreground, lineHeight: af.md * 1.4, paddingTop: 4 }}>{tip}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScreenContainer>
      <AppDialog {...dialogProps} />
      </>
    );
  }

  // --- NORMAL MODE --------------------------------------------------
  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <ScreenHeaderBack />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>Ambulância</Text>
            <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
              Acione atendimento de emergência
            </Text>
          </View>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.emergencyLight }]}>
          <MaterialIcons name="local-hospital" size={24} color={colors.emergency} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Emergency Banner */}
        <View style={[styles.emergencyBanner, { backgroundColor: colors.emergencyLight, borderColor: colors.emergency + '40' }]}>
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
                  <MaterialIcons name="check" size={14} color={colors.onPrimary} />
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
                <Text style={[styles.detailValue, { color: colors.foreground }]}>{anamnesis.fullName || '-'}</Text>
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
              backgroundColor: selectedOption.type === 'plan' && !isHealthPlanConfigured
                ? colors.muted
                : selectedOption.color,
              opacity: pressed ? 0.85 : 1,
              shadowColor: selectedOption.color,
            },
          ]}
        >
          <MaterialIcons
            name={selectedOption.type === 'plan' && !isHealthPlanConfigured ? 'settings' : 'phone'}
            size={28}
            color={colors.onPrimary}
          />
          <Text style={[styles.callButtonText, { color: colors.onPrimary }]}>
            {selectedOption.type === 'plan' && !isHealthPlanConfigured
              ? 'Configurar Plano de Saúde'
              : `Chamar ${selectedOption.label}`}
          </Text>
          {!(selectedOption.type === 'plan' && !isHealthPlanConfigured) && (
            <Text style={[styles.callButtonPhone, { color: colors.onPrimary }]}>{selectedOption.phone}</Text>
          )}
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
              <View style={[styles.instructionBullet, { backgroundColor: colors.primarySurface }]}>
                <Text style={[styles.instructionNumber, { color: colors.onPrimary }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.instructionText, { color: colors.foreground }]}>
                {instruction}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 16, marginTop: 2 },
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
  emergencyText: { flex: 1, fontSize: 16, lineHeight: 20 },
  sectionLabel: { fontSize: 15, fontWeight: '600', letterSpacing: 0.8, marginTop: 4 },
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
  optionLabel: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  optionDesc: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
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
  detailLabel: { fontSize: 16, fontWeight: '500' },
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
  callButtonText: { fontSize: 20, fontWeight: '800' },
  callButtonPhone: { fontSize: 16, opacity: 0.85, fontWeight: '600' },
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
  instructionNumber: { fontSize: 15, fontWeight: '700' },
  instructionText: { flex: 1, fontSize: 16, lineHeight: 20 },
});
