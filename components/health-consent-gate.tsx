import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAppContext } from '@/lib/app-context';

const CONSENT_TEXT =
  'Autorizo a Vigora a tratar meus dados pessoais sensíveis de saúde (medicações, ' +
  'pressão arterial, glicemia, anamnese e documentos médicos) para: lembretes de ' +
  'medicação, registro de indicadores, armazenamento de prontuário e alertas de ' +
  'emergência aos contatos que eu designar.';

/**
 * Gate for screens that collect sensitive health data (LGPD Art. 11). Until the
 * user gives the separate, highlighted health-data consent, the data entry is
 * replaced by a consent card; granting records the timestamp in settings
 * (persisted + synced). The rest of the app keeps working without it.
 */
export function HealthConsentGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const fs = useFontSize();
  const { state, dispatch } = useAppContext();

  if (state.settings.healthConsentAt) {
    return <>{children}</>;
  }

  const grant = () =>
    dispatch({ type: 'UPDATE_SETTINGS', payload: { healthConsentAt: Date.now() } });

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 18, flexGrow: 1, justifyContent: 'center' }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.primaryLight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialIcons name="health-and-safety" size={32} color={colors.primary} />
        </View>
        <Text
          style={{
            fontSize: fs.xl,
            fontWeight: '700',
            color: colors.foreground,
            textAlign: 'center',
          }}
        >
          Consentimento de dados de saúde
        </Text>
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 18,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: fs.md, lineHeight: fs.md * 1.5, color: colors.foreground }}>
          {CONSENT_TEXT}
        </Text>
        <Text style={{ fontSize: fs.sm, lineHeight: fs.sm * 1.5, color: colors.muted }}>
          Você pode revogar e excluir seus dados a qualquer momento em Configurações.
          Sem este consentimento, as telas de saúde não coletam dados.
        </Text>
      </View>

      <Pressable
        onPress={grant}
        accessibilityRole="button"
        accessibilityLabel="Autorizo o tratamento dos meus dados de saúde"
        style={({ pressed }) => [
          {
            backgroundColor: colors.primary,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={{ color: colors.onPrimary, fontSize: fs.md, fontWeight: '700' }}>
          Autorizo
        </Text>
      </Pressable>
    </ScrollView>
  );
}
