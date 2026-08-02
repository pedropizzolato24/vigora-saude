/**
 * AccountDangerZone
 *
 * Caixa "Zona perigosa" com a exclusão definitiva de conta (LGPD Art. 18, VI).
 * Isolada num bloco delimitado, no rodapé da tela, para separar visualmente o
 * que é irreversível do resto — mesma ideia da danger zone do GitHub.
 *
 * `clearLocalData` é prop porque monitorado e cuidador limpam contextos locais
 * diferentes; o hook já foi desenhado para receber essa função.
 */
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { useAccessibility } from '@/lib/accessibility-context';
import { useFontSize } from '@/lib/font-size-context';
import { useDeleteAccount } from '@/hooks/use-delete-account';
import { useColors } from '@/hooks/use-colors';

/** Texto padrão — conta de monitorado, que guarda dados de saúde. */
const MENSAGEM_PADRAO =
  'Esta ação é PERMANENTE. Apaga sua conta e todos os seus dados dos nossos servidores — perfil, anamnese, histórico de saúde, contatos, alarmes e vínculos com cuidadores. Não há como desfazer.';

interface AccountDangerZoneProps {
  /** Limpeza do estado local rodada DEPOIS que a conta é apagada no servidor. */
  clearLocalData?: () => void | Promise<void>;
  /**
   * Ação de "limpar todos os dados do aparelho" sem apagar a conta. Quando
   * ausente, o botão não é renderizado — a conta de cuidador não tem dados
   * locais próprios para limpar.
   */
  onClearAllData?: () => void;
  /**
   * Texto do diálogo de confirmação. Existe como prop porque a conta de
   * cuidador não guarda anamnese nem histórico de saúde — listar dados que
   * ela não tem seria impreciso num aviso irreversível.
   */
  message?: string;
}

export function AccountDangerZone({
  clearLocalData,
  onClearAllData,
  message = MENSAGEM_PADRAO,
}: AccountDangerZoneProps) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { runDeleteAccount, isDeleting } = useDeleteAccount(clearLocalData);

  const handleClearAllData = () => {
    showDialog({
      title: 'Limpar Todos os Dados',
      message:
        'Esta ação removerá todos os alarmes, contatos, ficha de anamnese e histórico de saúde. Esta ação não pode ser desfeita.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar Tudo',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            onClearAllData?.();
          },
        },
      ],
    });
  };

  const handleDeleteAccount = () => {
    if (isDeleting) return;
    showDialog({
      title: 'Excluir minha conta',
      message,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir conta',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            try {
              await runDeleteAccount();
            } catch (error) {
              console.error('[DangerZone] falha ao excluir conta:', error);
              showDialog({
                title: 'Não foi possível excluir',
                message:
                  'Houve um erro ao excluir sua conta no servidor. Seus dados não foram apagados. Tente novamente em instantes; se persistir, verifique sua conexão.',
                variant: 'error',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  const c = isAccessibilityMode
    ? { error: ac.error, surface: ac.surface, muted: ac.muted, background: ac.background }
    : {
        error: colors.error,
        surface: colors.surface,
        muted: colors.muted,
        background: colors.background,
      };

  const titleSize = isAccessibilityMode ? af.lg : fs.scaled(16);
  const bodySize = isAccessibilityMode ? af.sm : fs.scaled(14);
  const buttonSize = isAccessibilityMode ? af.md : fs.scaled(16);

  return (
    <>
      <View
        style={{
          borderWidth: 2,
          borderColor: c.error,
          borderRadius: isAccessibilityMode ? 20 : 12,
          backgroundColor: c.background,
          padding: 16,
          gap: 12,
          marginTop: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialIcons name="warning" size={isAccessibilityMode ? 28 : 20} color={c.error} />
          <Text style={{ fontSize: titleSize, fontWeight: '900', color: c.error }}>
            Zona perigosa
          </Text>
        </View>

        <Text style={{ fontSize: bodySize, color: c.muted }}>
          As ações abaixo são permanentes e não podem ser desfeitas.
        </Text>

        {onClearAllData ? (
          <>
            <Pressable
              onPress={handleClearAllData}
              accessibilityRole="button"
              accessibilityLabel="Limpar todos os dados do aparelho"
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  minHeight: isAccessibilityMode ? 64 : fs.touch(56),
                  borderRadius: isAccessibilityMode ? 16 : 12,
                  borderWidth: isAccessibilityMode ? 3 : 2,
                  borderColor: c.error,
                  backgroundColor: c.surface,
                  paddingHorizontal: 16,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <MaterialIcons
                name="delete-forever"
                size={isAccessibilityMode ? 26 : 20}
                color={c.error}
              />
              <Text style={{ fontSize: buttonSize, fontWeight: '800', color: c.error }}>
                Limpar Todos os Dados
              </Text>
            </Pressable>
            <Text style={{ fontSize: bodySize, color: c.muted }}>
              Remove alarmes, contatos, anamnese e histórico de saúde do aparelho. A conta
              continua existindo.
            </Text>
          </>
        ) : null}

        <Pressable
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Excluir minha conta e todos os dados do servidor"
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              minHeight: isAccessibilityMode ? 64 : fs.touch(56),
              borderRadius: isAccessibilityMode ? 16 : 12,
              borderWidth: isAccessibilityMode ? 3 : 2,
              borderColor: c.error,
              backgroundColor: c.surface,
              paddingHorizontal: 16,
              opacity: isDeleting ? 0.6 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialIcons name="no-accounts" size={isAccessibilityMode ? 26 : 20} color={c.error} />
          <Text style={{ fontSize: buttonSize, fontWeight: '800', color: c.error }}>
            {isDeleting ? 'Excluindo...' : 'Excluir minha conta'}
          </Text>
        </Pressable>
        <Text style={{ fontSize: bodySize, color: c.muted }}>
          Apaga a conta e todos os dados dos nossos servidores (LGPD, Art. 18).
        </Text>
      </View>
      <AppDialog {...dialogProps} />
    </>
  );
}
