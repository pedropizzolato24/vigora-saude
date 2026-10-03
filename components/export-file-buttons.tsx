/**
 * ExportFileButtons
 *
 * Dois botões para entregar um arquivo: "Baixar" (escolhe uma pasta e salva) e
 * "Compartilhar" (WhatsApp, e-mail, Drive...). O arquivo só é gerado quando o
 * usuário toca. Erros nunca são engolidos: o motivo real aparece num diálogo.
 *
 * O aviso (AppToast) fica num Modal: estes botões vivem dentro do ScrollView de
 * Configurações, e o `position: absolute` do toast ficaria relativo ao conteúdo
 * que rola (ver data-export-button, que originou o padrão).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { useFontSize } from '@/lib/font-size-context';
import {
  saveFileToFolder,
  shareFile,
  type PreparedFile,
} from '@/lib/_core/save-or-share-file';

type Prepared = PreparedFile & { warning?: string };

interface ExportFileButtonsProps {
  /** Texto que descreve o arquivo ("Meus dados (arquivo técnico)"). */
  label: string;
  /** Linha de ajuda abaixo do título. */
  hint?: string;
  /** Gera o arquivo no cache. Lança em caso de falha. */
  prepare: () => Promise<Prepared>;
}

type Mode = 'save' | 'share';

export function ExportFileButtons({ label, hint, prepare }: ExportFileButtonsProps) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const [busy, setBusy] = useState<Mode | null>(null);

  const run = async (mode: Mode) => {
    if (busy) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(mode);
    try {
      let file: Prepared;
      try {
        file = await prepare();
      } catch (error) {
        console.error('[Exportar] falha ao gerar o arquivo:', error);
        showDialog({
          title: 'Não foi possível gerar o arquivo',
          message: 'Houve um erro ao gerar o arquivo. Tente novamente em instantes.',
          variant: 'error',
          buttons: [{ text: 'OK' }],
        });
        return;
      }

      if (mode === 'save') {
        const result = await saveFileToFolder(file);
        if (result.status === 'saved') {
          showToast({ message: `Salvo em ${result.folderName}: ${result.fileName}`, variant: 'success' });
        } else if (result.status === 'failed') {
          showDialog({
            title: 'Não foi possível baixar',
            message: `${result.reason}\n\nTente o botão "Compartilhar" e escolha onde guardar o arquivo.`,
            variant: 'error',
            buttons: [{ text: 'OK' }],
          });
          return;
        }
      } else {
        const result = await shareFile(file);
        if (result.status === 'unavailable') {
          showDialog({
            title: 'Compartilhamento indisponível',
            message: 'Este celular não oferece a opção de compartilhar. Use o botão "Baixar".',
            variant: 'error',
            buttons: [{ text: 'OK' }],
          });
          return;
        }
        if (result.status === 'failed') {
          showDialog({
            title: 'Não foi possível compartilhar',
            message: `${result.reason}\n\nTente o botão "Baixar".`,
            variant: 'error',
            buttons: [{ text: 'OK' }],
          });
          return;
        }
      }

      if (file.warning) showToast({ message: file.warning, variant: 'warning' });
    } finally {
      setBusy(null);
    }
  };

  const c = isAccessibilityMode
    ? { border: ac.primary, text: ac.primary, surface: ac.surface, muted: ac.muted, title: ac.foreground }
    : { border: colors.primary, text: colors.primary, surface: colors.surface, muted: colors.muted, title: colors.foreground };

  const button = (mode: Mode, icon: 'download' | 'share', text: string, a11yLabel: string) => (
    <Pressable
      onPress={() => run(mode)}
      disabled={busy !== null}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => ({
        flex: isAccessibilityMode ? undefined : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isAccessibilityMode ? 14 : 8,
        minHeight: isAccessibilityMode ? 64 : fs.touch(52),
        borderRadius: isAccessibilityMode ? 20 : 12,
        borderWidth: isAccessibilityMode ? 3 : 2,
        borderColor: c.border,
        backgroundColor: c.surface,
        paddingHorizontal: 12,
        opacity: busy !== null ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      {busy === mode ? (
        <ActivityIndicator size="small" color={c.text} />
      ) : (
        <MaterialIcons name={icon} size={isAccessibilityMode ? 32 : 22} color={c.text} />
      )}
      <Text style={{ fontSize: isAccessibilityMode ? af.xl : fs.scaled(16), fontWeight: '800', color: c.text }}>
        {busy === mode ? 'Preparando...' : text}
      </Text>
    </Pressable>
  );

  return (
    <>
      <View style={{ gap: 8, marginTop: isAccessibilityMode ? 0 : 12 }}>
        <Text style={{ fontSize: isAccessibilityMode ? af.lg : fs.scaled(16), fontWeight: '700', color: c.title }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ fontSize: isAccessibilityMode ? af.sm : fs.sm, color: c.muted }}>{hint}</Text>
        ) : null}
        <View style={{ flexDirection: isAccessibilityMode ? 'column' : 'row', gap: 12 }}>
          {button('save', 'download', 'Baixar', `Baixar ${label} no celular`)}
          {button('share', 'share', 'Compartilhar', `Compartilhar ${label}`)}
        </View>
        <Text style={{ fontSize: isAccessibilityMode ? af.xs : fs.xs, color: c.muted }}>
          Baixar: o celular vai pedir para você escolher uma pasta. Compartilhar: envie por WhatsApp, e-mail ou salve no Drive.
        </Text>
      </View>
      <AppDialog {...dialogProps} />
      <Modal
        visible={toastProps.visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => toastProps.onHide?.()}
      >
        <AppToast {...toastProps} />
      </Modal>
    </>
  );
}
