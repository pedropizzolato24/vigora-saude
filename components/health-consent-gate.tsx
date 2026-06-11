import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
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
 *
 * Adapts font size and contrast to Accessibility Mode — this is the first health
 * screen the 60+ monitored user sees, and the legal text must be readable.
 */
export function HealthConsentGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac } = useAccessibility();
  const { state, dispatch } = useAppContext();

  if (state.settings.healthConsentAt) {
    return <>{children}</>;
  }

  const a11y = isAccessibilityMode;
  const c = a11y ? ac : colors;
  const f = a11y ? af : fs;
  const iconBg = a11y ? ac.primary : colors.primaryLight;
  const iconColor = a11y ? ac.onPrimary : colors.primary;

  const grant = () =>
    dispatch({ type: 'UPDATE_SETTINGS', payload: { healthConsentAt: Date.now() } });

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 18,
        flexGrow: 1,
        justifyContent: 'center',
        backgroundColor: c.background,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: a11y ? 80 : 64,
            height: a11y ? 80 : 64,
            borderRadius: a11y ? 40 : 32,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: a11y ? 2 : 0,
            borderColor: c.border,
          }}
        >
          <MaterialIcons name="health-and-safety" size={a11y ? 40 : 32} color={iconColor} />
        </View>
        <Text
          style={{ fontSize: f.xl, fontWeight: '700', color: c.foreground, textAlign: 'center' }}
        >
          Consentimento de dados de saúde
        </Text>
      </View>

      <View
        style={{
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: a11y ? 2 : 1,
          borderRadius: 16,
          padding: 18,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: f.md, lineHeight: f.md * 1.5, color: c.foreground }}>
          {CONSENT_TEXT}
        </Text>
        <Text style={{ fontSize: f.sm, lineHeight: f.sm * 1.5, color: c.muted }}>
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
            backgroundColor: c.primary,
            borderRadius: 14,
            paddingVertical: a11y ? 20 : 16,
            minHeight: a11y ? 60 : 0,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={{ color: c.onPrimary, fontSize: f.md, fontWeight: '700' }}>Autorizo</Text>
      </Pressable>
    </ScrollView>
  );
}
