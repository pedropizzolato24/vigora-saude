/**
 * protect-account-banner.tsx — CTA de upgrade da conta anônima.
 *
 * Renderiza NADA para contas com login. Copy sem pressão (spec "Contas sem
 * login"): enquadra como proteção da família/dados, nunca "faça login para
 * continuar" — o app funciona 100% sem o upgrade.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
import * as Auth from '@/lib/_core/auth';

export function ProtectAccountBanner() {
  const colors = useColors();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const router = useRouter();
  const [anonymous, setAnonymous] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      Auth.getUserInfo()
        .then((u) => {
          if (alive) setAnonymous(u?.loginMethod === 'anonymous');
        })
        .catch(() => {});
    refresh();
    // Após o upgrade (completeServerLogin) o loginMethod muda sem trocar de
    // openId — re-checa em qualquer notificação de usuário para o banner sumir.
    const unsubscribe = Auth.subscribeActiveUser(() => refresh());
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (!anonymous) return null;

  const fg = isAccessibilityMode ? ac.foreground : colors.foreground;
  const muted = isAccessibilityMode ? ac.muted : colors.muted;
  const surface = isAccessibilityMode ? ac.surface : colors.surface;
  const border = isAccessibilityMode ? ac.border : colors.border;
  const primary = isAccessibilityMode ? ac.primary : colors.primary;
  const onPrimary = isAccessibilityMode ? ac.onPrimary : colors.onPrimary;
  const sz = (normal: number, a11y: number) => (isAccessibilityMode ? a11y : normal);

  return (
    <View
      style={{
        backgroundColor: surface,
        borderColor: border,
        borderWidth: isAccessibilityMode ? 2 : 1,
        borderRadius: 16,
        padding: 16,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MaterialIcons name="shield" size={isAccessibilityMode ? 30 : 24} color={primary} />
        <Text
          style={{
            flex: 1,
            fontSize: sz(16, af.md),
            fontWeight: '800',
            color: fg,
            fontFamily: BrandFonts.body,
          }}
        >
          Proteja sua conta
        </Text>
      </View>
      <Text
        style={{
          fontSize: sz(15, af.sm),
          lineHeight: sz(22, af.sm * 1.5),
          color: muted,
          fontFamily: BrandFonts.body,
        }}
      >
        Você está usando o Vigora sem login. Ligue sua conta (Google, e-mail ou
        telefone) para não perder seus dados se trocar de celular — e para poder
        se conectar com um cuidador.
      </Text>
      <Pressable
        onPress={() => router.push('/login')}
        accessibilityRole="button"
        accessibilityLabel="Proteger minha conta"
        style={({ pressed }) => [
          {
            backgroundColor: primary,
            minHeight: isAccessibilityMode ? 60 : 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={{
            fontSize: sz(16, af.md),
            fontWeight: '700',
            color: onPrimary,
            fontFamily: BrandFonts.body,
          }}
        >
          Proteger minha conta
        </Text>
      </Pressable>
    </View>
  );
}
