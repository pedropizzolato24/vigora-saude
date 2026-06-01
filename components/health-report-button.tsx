/**
 * HealthReportButton
 *
 * Botão que gera um relatório de saúde em PDF e abre o compartilhamento nativo.
 * Usa expo-print para gerar o PDF e expo-sharing para compartilhar.
 *
 * Fluxo:
 * 1. Usuário toca no botão
 * 2. Exibe indicador de carregamento
 * 3. Gera HTML com gráficos SVG e tabelas
 * 4. Converte para PDF via expo-print
 * 5. Abre sheet de compartilhamento nativo (WhatsApp, e-mail, Drive, etc.)
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppContext } from '@/lib/app-context';
import { buildReportHtml } from '@/lib/health-report-generator';
import { useColors } from '@/hooks/use-colors';

interface HealthReportButtonProps {
  /** Estilo compacto (apenas ícone) ou completo (ícone + texto) */
  compact?: boolean;
}

export function HealthReportButton({ compact = false }: HealthReportButtonProps) {
  const { state } = useAppContext();
  const colors = useColors();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateReport = async () => {
    if (isGenerating) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setIsGenerating(true);

    try {
      // 1. Gera HTML do relatório
      const html = buildReportHtml({
        profile: state.profile,
        healthMetrics: state.healthMetrics,
        alarms: state.alarms,
        generatedAt: Date.now(),
      });

      // 2. Converte HTML para PDF via expo-print
      const { uri } = await Print.printToFileAsync({
        html,
        width: 612,  // US Letter width em pontos (72 PPI)
        height: 792, // US Letter height em pontos
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });

      // 3. Verifica se compartilhamento está disponível
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        // 4. Abre sheet de compartilhamento nativo
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Compartilhar Relatório de Saúde',
          UTI: 'com.adobe.pdf',
        });
      } else {
        // Web: abre diálogo de impressão
        if (Platform.OS === 'web') {
          await Print.printAsync({ html });
        } else {
          Alert.alert(
            'Compartilhamento indisponível',
            'Não foi possível abrir o compartilhamento neste dispositivo.',
          );
        }
      }
    } catch (error: any) {
      console.error('[HealthReport] Erro ao gerar relatório:', error);
      Alert.alert(
        'Erro ao gerar relatório',
        'Não foi possível gerar o relatório. Tente novamente.',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (compact) {
    return (
      <Pressable
        onPress={handleGenerateReport}
        disabled={isGenerating}
        style={({ pressed }) => [
          styles.compactButton,
          {
            backgroundColor: colors.primary + '15',
            opacity: pressed || isGenerating ? 0.7 : 1,
          },
        ]}
        accessibilityLabel="Gerar relatório de saúde em PDF"
        accessibilityHint="Gera e compartilha um relatório mensal com suas métricas de saúde"
      >
        {isGenerating ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialIcons name="picture-as-pdf" size={22} color={colors.primary} />
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handleGenerateReport}
      disabled={isGenerating}
      style={({ pressed }) => [
        styles.fullButton,
        {
          backgroundColor: colors.primary,
          opacity: pressed || isGenerating ? 0.8 : 1,
        },
      ]}
      accessibilityLabel="Gerar relatório de saúde em PDF"
      accessibilityHint="Gera e compartilha um relatório mensal com suas métricas de saúde"
    >
      {isGenerating ? (
        <>
          <ActivityIndicator size="small" color={colors.onPrimary} />
          <Text style={[styles.fullButtonText, { color: colors.onPrimary }]}>Gerando PDF...</Text>
        </>
      ) : (
        <>
          <MaterialIcons name="picture-as-pdf" size={20} color={colors.onPrimary} />
          <Text style={[styles.fullButtonText, { color: colors.onPrimary }]}>Relatório PDF</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  fullButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
