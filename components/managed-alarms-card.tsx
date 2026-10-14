/**
 * managed-alarms-card.tsx
 *
 * Cartão de Configurações do idoso: "[Nome] cuida dos seus alarmes" com o botão
 * "Parar" (spec 3.4 e 6.2). Só aparece com um acordo ativo. Duas versões: normal
 * e modo acessível (fonte e alvo de toque maiores).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
import { useAppContext } from '@/lib/app-context';
import { useFontSize } from '@/lib/font-size-context';
import { managementCardCopy, STOPPED_TOAST_TEXT, stopDialogCopy } from '@/lib/managed-alarms-copy';
import { requestManagedSync } from '@/lib/managed-alarms-sync';
import { trpcMutation } from '@/lib/monitoring-service';

export function ManagedAlarmsCard() {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const { state, dispatch } = useAppContext();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const [busy, setBusy] = useState(false);

  const management = state.management;
  const name = management?.caregiverName;

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // trpcMutation devolve null em toda falha e nunca lança.
      const result = await trpcMutation('managedAlarms.stopBeingManaged', {});
      if (result === null) {
        // O acordo pode já ter terminado (o cuidador parou antes): a busca da
        // lista tira o cartão se for o caso.
        requestManagedSync();
        showDialog({
          title: 'Não foi possível parar',
          message: 'Confira a internet e tente de novo. Por enquanto, quem cuida dos seus alarmes continua o mesmo.',
          variant: 'error',
          buttons: [{ text: 'Entendi' }],
        });
        return;
      }
      dispatch({ type: 'SET_MANAGEMENT', payload: null });
      showToast({ message: STOPPED_TOAST_TEXT, variant: 'success' });
    } finally {
      setBusy(false);
    }
  };

  const confirmStop = () => {
    const copy = stopDialogCopy(name);
    showDialog({
      title: copy.title,
      message: copy.message,
      variant: 'confirm',
      buttons: [
        { text: copy.cancelLabel, style: 'cancel' },
        { text: copy.confirmLabel, style: 'destructive', onPress: () => void stop() },
      ],
    });
  };

  const copy = managementCardCopy(name);

  return (
    <>
      {management ? (
        isAccessibilityMode ? (
          <View
            style={{
              backgroundColor: ac.surface,
              borderRadius: 20,
              borderWidth: 2,
              borderColor: ac.border,
              padding: 20,
              gap: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <MaterialIcons name="supervisor-account" size={36} color={ac.primary} />
              <Text style={{ flex: 1, fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>{copy.title}</Text>
            </View>
            <Text style={{ fontSize: af.md, color: ac.muted, lineHeight: af.md * 1.4 }}>{copy.subtitle}</Text>
            <Pressable
              onPress={confirmStop}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={copy.stopLabel}
              style={({ pressed }) => [
                {
                  minHeight: as_.touchTarget,
                  borderRadius: 16,
                  borderWidth: 3,
                  borderColor: ac.primary,
                  backgroundColor: ac.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed || busy ? 0.7 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.primary }}>{copy.stopLabel}</Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: colors.primary,
              padding: 16,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: colors.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialIcons name="supervisor-account" size={24} color={colors.primary} />
              </View>
              <Text
                style={{ flex: 1, fontSize: fs.md, fontWeight: '800', color: colors.foreground, fontFamily: BrandFonts.body }}
              >
                {copy.title}
              </Text>
            </View>
            <Text style={{ fontSize: fs.base, color: colors.muted, lineHeight: fs.scaled(22) }}>{copy.subtitle}</Text>
            <Pressable
              onPress={confirmStop}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={copy.stopLabel}
              style={({ pressed }) => [
                {
                  minHeight: fs.touch(44),
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed || busy ? 0.7 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: fs.md, fontWeight: '700', color: colors.primary, fontFamily: BrandFonts.body }}>
                {copy.stopLabel}
              </Text>
            </Pressable>
          </View>
        )
      ) : null}
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </>
  );
}
