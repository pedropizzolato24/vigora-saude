/**
 * DataExportButton
 *
 * "Baixar meus dados" — exportação de dados do titular (LGPD Art. 18, V).
 * Busca o que o servidor guarda, junta com o que está no aparelho, escreve um
 * JSON e abre o compartilhamento nativo.
 *
 * Fallback deliberado: se o servidor não responder (offline, 503, timeout), o
 * arquivo é gerado assim mesmo com os dados locais e marcado com
 * `servidor_incluido: false` + aviso. O usuário nunca sai de mãos vazias.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text } from 'react-native';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { useAccessibility } from '@/lib/accessibility-context';
import { useAppContext } from '@/lib/app-context';
import {
  buildExportPayload,
  exportFileName,
  type ExportLocalData,
  type ExportServerData,
} from '@/lib/_core/data-export';
import { useFontSize } from '@/lib/font-size-context';
import { trpc } from '@/lib/trpc';
import { useColors } from '@/hooks/use-colors';

export function DataExportButton() {
  const { state } = useAppContext();
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const [isExporting, setIsExporting] = useState(false);
  const utils = trpc.useUtils();

  const handleExport = async () => {
    if (isExporting) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);

    try {
      const local: ExportLocalData = {
        alarmes: state.alarms,
        contatosDeEmergencia: state.emergencyContacts,
        anamnese: state.anamnesis,
        metricasDeSaude: state.healthMetrics,
        configuracoes: state.settings,
        perfil: state.profile,
      };

      let server: ExportServerData | null = null;
      let serverUnavailable = false;
      try {
        server = (await utils.userData.export.fetch()) as ExportServerData;
      } catch (error) {
        // Fallback: segue com os dados locais e marca a ausência no arquivo.
        // Motivo real no log — nunca engolir em silêncio.
        serverUnavailable = true;
        console.warn('[DataExport] servidor indisponível:', error);
      }

      const payload = buildExportPayload({
        local,
        server,
        serverUnavailable,
        appVersion: Application.nativeApplicationVersion ?? 'desconhecida',
      });

      const file = new File(Paths.cache, exportFileName());
      file.write(JSON.stringify(payload, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Baixar meus dados',
          UTI: 'public.json',
        });
      } else {
        showDialog({
          title: 'Compartilhamento indisponível',
          message: 'Não foi possível abrir o compartilhamento neste aparelho.',
          variant: 'error',
          buttons: [{ text: 'OK' }],
        });
        return;
      }

      if (serverUnavailable) {
        showToast({
          message: 'Arquivo gerado só com os dados do aparelho — sem conexão com o servidor.',
          variant: 'warning',
        });
      }
    } catch (error) {
      console.error('[DataExport] falha ao gerar o arquivo:', error);
      showDialog({
        title: 'Não foi possível baixar',
        message:
          'Houve um erro ao gerar o arquivo com os seus dados. Tente novamente em instantes.',
        variant: 'error',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setIsExporting(false);
    }
  };

  const c = isAccessibilityMode
    ? { border: ac.primary, text: ac.primary, surface: ac.surface }
    : { border: colors.primary, text: colors.primary, surface: colors.surface };

  return (
    <>
      <Pressable
        onPress={handleExport}
        disabled={isExporting}
        accessibilityRole="button"
        accessibilityLabel="Baixar meus dados em arquivo"
        accessibilityHint="Gera um arquivo com todos os seus dados e abre o compartilhamento"
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isAccessibilityMode ? 14 : 8,
            minHeight: isAccessibilityMode ? 64 : fs.touch(56),
            borderRadius: isAccessibilityMode ? 20 : 12,
            borderWidth: isAccessibilityMode ? 3 : 2,
            borderColor: c.border,
            backgroundColor: c.surface,
            paddingHorizontal: 16,
            opacity: isExporting ? 0.6 : pressed ? 0.8 : 1,
          },
        ]}
      >
        {isExporting ? (
          <ActivityIndicator size="small" color={c.text} />
        ) : (
          <MaterialIcons name="download" size={isAccessibilityMode ? 32 : 22} color={c.text} />
        )}
        <Text
          style={{
            fontSize: isAccessibilityMode ? af.xl : fs.scaled(17),
            fontWeight: '800',
            color: c.text,
          }}
        >
          {isExporting ? 'Preparando...' : 'Baixar meus dados'}
        </Text>
      </Pressable>
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </>
  );
}
