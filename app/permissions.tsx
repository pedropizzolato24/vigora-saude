/**
 * app/permissions.tsx — central de permissões.
 *
 * Uma tela só, com o estado REAL de cada permissão que o perfil precisa e um
 * botão por item. Substitui os avisos espalhados que apareciam uma vez, em
 * telas diferentes, e disputavam a mesma vaga por sessão — quem tocasse
 * "Agora não" ficava sem a permissão para sempre, em silêncio.
 *
 * Abre sozinha no boot enquanto faltar algo (components/permissions-gate.tsx) e
 * fica linkada nas Configurações para quem quiser conferir depois.
 *
 * Re-checa quando o app volta ao primeiro plano: o idoso sai daqui para os
 * Ajustes do Android, concede, e volta — o item precisa virar ✓ sozinho, senão
 * ele acha que não funcionou e tenta de novo.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { getUserInfo } from '@/lib/_core/auth';
import { useFontSize } from '@/lib/font-size-context';
import { checkPermissions, type PermissionItem } from '@/lib/permissions-check';

export default function PermissionsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const router = useRouter();
  const {
    isAccessibilityMode,
    a11yFontSize: af,
    a11yColors: ac,
    a11ySpacing: as_,
  } = useAccessibility();

  const [itens, setItens] = useState<PermissionItem[] | null>(null);

  const recarregar = useCallback(async () => {
    const user = await getUserInfo().catch((e) => {
      console.warn('[permissions] não leu o perfil; assumindo idoso:', e);
      return null;
    });
    setItens(await checkPermissions(user?.userType === 'caregiver' ? 'caregiver' : 'monitored'));
  }, []);

  useEffect(() => {
    recarregar();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') recarregar();
    });
    return () => sub.remove();
  }, [recarregar]);

  const c = isAccessibilityMode
    ? {
        fg: ac.foreground,
        muted: ac.muted,
        surface: ac.surface,
        border: ac.cardBorder,
        primary: ac.primary,
        onPrimary: ac.onPrimary,
        ok: ac.success,
        falta: ac.warning,
      }
    : {
        fg: colors.foreground,
        muted: colors.muted,
        surface: colors.surface,
        border: colors.border,
        primary: colors.primary,
        onPrimary: colors.onPrimary,
        ok: colors.success,
        // `warning` é o âmbar de fundo; o texto/ícone de aviso usa warningDark.
        falta: colors.warningDark,
      };

  const titleSize = isAccessibilityMode ? af.xl : fs['2xl'];
  const itemTitleSize = isAccessibilityMode ? af.md : fs.lg;
  const bodySize = isAccessibilityMode ? af.sm : fs.base;
  const buttonSize = isAccessibilityMode ? af.md : fs.lg;
  const touch = isAccessibilityMode ? as_.touchTarget : 44;

  const faltando = itens?.filter((p) => !p.granted) ?? [];
  const tudoCerto = itens !== null && faltando.length === 0;

  return (
    <ScreenContainer>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={({ pressed }) => [
            { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
            pressed && { opacity: 0.6 },
          ]}
        >
          <MaterialIcons name="arrow-back" size={26} color={c.fg} />
        </Pressable>
        <Text
          style={{ fontSize: isAccessibilityMode ? af.lg : fs.lg, fontWeight: '700', color: c.fg }}
        >
          Permissões
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: titleSize, fontWeight: '800', color: c.fg }}>
            {tudoCerto ? 'Está tudo certo' : 'Para o Vigora funcionar'}
          </Text>
          <Text style={{ fontSize: bodySize, color: c.muted }}>
            {tudoCerto
              ? 'O celular já liberou tudo que o Vigora precisa.'
              : 'O celular ainda não liberou tudo. Toque em "Liberar" nos itens marcados abaixo.'}
          </Text>
        </View>

        {itens === null ? (
          <ActivityIndicator color={c.primary} style={{ marginTop: 24 }} />
        ) : (
          itens.map((item) => (
            <View
              key={item.key}
              style={{
                backgroundColor: c.surface,
                borderColor: c.border,
                borderWidth: isAccessibilityMode ? 2 : 1,
                borderRadius: isAccessibilityMode ? as_.cardRadius : 16,
                padding: 16,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons
                  name={item.granted ? 'check-circle' : 'error-outline'}
                  size={isAccessibilityMode ? 30 : 24}
                  color={item.granted ? c.ok : c.falta}
                />
                <Text
                  style={{ flex: 1, fontSize: itemTitleSize, fontWeight: '700', color: c.fg }}
                  accessibilityLabel={`${item.title}: ${item.granted ? 'liberado' : 'falta liberar'}`}
                >
                  {item.title}
                </Text>
              </View>

              <Text style={{ fontSize: bodySize, color: c.muted }}>{item.why}</Text>

              {!item.granted && (
                <Pressable
                  onPress={async () => {
                    try {
                      await item.request();
                    } catch (e) {
                      console.warn(`[permissions] pedido de ${item.key} falhou:`, e);
                    }
                    // Não re-checa aqui de propósito: quem decide é o retorno ao
                    // primeiro plano (o AppState acima). Ler agora pegaria o
                    // estado antigo — o diálogo do sistema, ou a tela de
                    // Ajustes, ainda nem apareceu.
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Liberar ${item.title}`}
                  style={({ pressed }) => [
                    {
                      minHeight: touch,
                      borderRadius: 12,
                      backgroundColor: c.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 20,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={{ fontSize: buttonSize, fontWeight: '700', color: c.onPrimary }}>
                    Liberar
                  </Text>
                </Pressable>
              )}
            </View>
          ))
        )}

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tudoCerto ? 'Fechar' : 'Agora não'}
          style={({ pressed }) => [
            { minHeight: touch, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={{ fontSize: buttonSize, fontWeight: '600', color: c.muted }}>
            {tudoCerto ? 'Fechar' : 'Agora não'}
          </Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
