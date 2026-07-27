/**
 * appearance-settings.tsx
 *
 * Tela compartilhada de Aparência e Acessibilidade — vive no Stack raiz (fora
 * dos grupos (tabs)/(caregiver-tabs)) para que tanto o monitorado quanto o
 * cuidador possam abri-la com router.push e voltar com router.back() sem
 * trocar de grupo de abas. As 3 preferências (tema, tamanho de fonte, modo
 * acessível) moram em providers globais montados acima dos dois grupos, então
 * a tela funciona idêntica para os dois tipos de usuário.
 */
import React from 'react';
import { Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { useColors } from '@/hooks/use-colors';
import { useAppContext } from '@/lib/app-context';
import { useThemeContext } from '@/lib/theme-provider';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';

const FONT_SIZE_LABELS = { small: 'Pequeno', medium: 'Médio', large: 'Grande' } as const;
const FONT_SIZES = ['small', 'medium', 'large'] as const;

export default function AppearanceSettingsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const router = useRouter();
  const { state, dispatch } = useAppContext();
  const { colorScheme, setColorScheme } = useThemeContext();
  const { dialogProps, showDialog } = useAppDialog();
  const {
    isAccessibilityMode,
    a11yFontSize: af,
    a11yColors: ac,
    a11ySpacing: as_,
  } = useAccessibility();

  const settings = state.settings;

  const updateSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } });
  };

  const handleToggleDarkMode = (v: boolean) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setColorScheme(v ? 'dark' : 'light');
  };

  const handleSelectFontSize = (size: (typeof FONT_SIZES)[number]) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateSetting('fontSize', size);
  };

  const handleToggleAccessibility = () => {
    if (!settings.accessibilityMode) {
      showDialog({
        title: 'Ativar Modo de Acessibilidade?',
        message:
          'O Modo de Acessibilidade simplifica o layout do app para facilitar o uso:\n\n* Fontes maiores e mais legíveis\n* Cores de alto contraste\n* Botões maiores e mais fáceis de tocar\n* Interface simplificada, sem detalhes desnecessários\n* Ideal para pessoas idosas ou com dificuldades visuais\n\nVocê pode desativar a qualquer momento nesta mesma tela.',
        variant: 'info',
        buttons: [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Ativar',
            onPress: () => {
              if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              updateSetting('accessibilityMode', true);
            },
          },
        ],
      });
    } else {
      // Mesma confirmação da tela de Configurações: desativar por toque
      // acidental tirava o idoso do layout grande sem aviso.
      showDialog({
        title: 'Desativar Modo de Acessibilidade?',
        message: 'O app volta ao layout normal:\n\n* Fontes e botões menores\n* Mais informações por tela\n\nVocê pode ativar de novo a qualquer momento nesta mesma tela.',
        variant: 'warning',
        buttons: [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desativar',
            onPress: () => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              updateSetting('accessibilityMode', false);
            },
          },
        ],
      });
    }
  };

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <>
        <ScreenContainer containerStyle={{ backgroundColor: ac.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.bar }}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={12}
              style={({ pressed }) => [{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, pressed && { opacity: 0.6 }]}
            >
              <MaterialIcons name="arrow-back" size={34} color={ac.foreground} />
            </Pressable>
            <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>Aparência</Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {/* Modo de acessibilidade — destaque no topo */}
            <Pressable
              onPress={handleToggleAccessibility}
              accessibilityRole="switch"
              accessibilityState={{ checked: settings.accessibilityMode }}
              accessibilityLabel="Modo de acessibilidade"
              style={({ pressed }) => [{ borderRadius: 20, borderWidth: 3, borderColor: ac.primary, backgroundColor: ac.primary, padding: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.85 : 1 }]}
            >
              <MaterialIcons name="accessibility-new" size={32} color={ac.onPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.onPrimary }}>Modo de acessibilidade</Text>
                <Text style={{ fontSize: af.sm, color: ac.onPrimary }}>Ativado — toque para desativar</Text>
              </View>
            </Pressable>

            {/* Modo escuro */}
            <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <MaterialIcons name="dark-mode" size={30} color={ac.foreground} />
              <Text style={{ flex: 1, fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Modo escuro</Text>
              <Switch
                value={colorScheme === 'dark'}
                onValueChange={handleToggleDarkMode}
                trackColor={{ false: ac.border, true: ac.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Tamanho da fonte */}
            <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.border, padding: as_.buttonPadding, gap: 14 }}>
              <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>Tamanho da fonte</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {FONT_SIZES.map((size) => {
                  const selected = settings.fontSize === size;
                  return (
                    <Pressable
                      key={size}
                      onPress={() => handleSelectFontSize(size)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={FONT_SIZE_LABELS[size]}
                      style={({ pressed }) => [{ flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, backgroundColor: selected ? ac.primary : ac.background, borderColor: selected ? ac.primary : ac.border, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <Text style={{ fontSize: af.sm, fontWeight: '800', color: selected ? ac.onPrimary : ac.foreground }}>
                        {FONT_SIZE_LABELS[size]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </ScreenContainer>
        <AppDialog {...dialogProps} />
      </>
    );
  }

  // --- NORMAL MODE ---------------------------------------------------------
  return (
    <>
      <ScreenContainer>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={12}
            style={({ pressed }) => [{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
          </Pressable>
          <Text style={{ fontSize: fs.lg, fontWeight: '700', color: colors.foreground }}>Aparência e acessibilidade</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
          {/* Modo escuro */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <MaterialIcons name="dark-mode" size={22} color={colors.foreground} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fs.base, fontWeight: '600', color: colors.foreground }}>Modo escuro</Text>
              <Text style={{ fontSize: fs.sm, color: colors.muted }}>{colorScheme === 'dark' ? 'Ativado' : 'Desativado'}</Text>
            </View>
            <Switch
              value={colorScheme === 'dark'}
              onValueChange={handleToggleDarkMode}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Tamanho da fonte */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: fs.base, fontWeight: '600', color: colors.foreground }}>Tamanho da fonte</Text>
            <Text style={{ fontSize: fs.sm, color: colors.muted, marginTop: -6 }}>Atual: {FONT_SIZE_LABELS[settings.fontSize]}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {FONT_SIZES.map((size) => {
                const selected = settings.fontSize === size;
                return (
                  <Pressable
                    key={size}
                    onPress={() => handleSelectFontSize(size)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={FONT_SIZE_LABELS[size]}
                    style={({ pressed }) => [{ flex: 1, minHeight: fs.touch(48), alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1.5, backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={{ fontSize: size === 'small' ? 13 : size === 'medium' ? 15 : 17, fontWeight: '700', color: selected ? colors.onPrimary : colors.foreground }}>
                      {FONT_SIZE_LABELS[size]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Modo de acessibilidade */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <MaterialIcons name="accessibility-new" size={22} color={colors.foreground} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fs.base, fontWeight: '600', color: colors.foreground }}>Modo de acessibilidade</Text>
              <Text style={{ fontSize: fs.sm, color: colors.muted }}>Fontes grandes, alto contraste e layout simplificado</Text>
            </View>
            <Switch
              value={settings.accessibilityMode}
              onValueChange={handleToggleAccessibility}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </ScrollView>
      </ScreenContainer>
      <AppDialog {...dialogProps} />
    </>
  );
}
