import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/use-colors';
import { startOAuthLogin } from '@/constants/oauth';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setLoading(true);
    setError(null);
    try {
      await startOAuthLogin();
      // startOAuthLogin opens the system browser and returns immediately.
      // The OAuth callback (app/oauth/callback.tsx) handles navigation after auth.
    } catch {
      setError('Não foi possível iniciar o login. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 40) + 20,
            paddingBottom: Math.max(insets.bottom, 20) + 20,
          },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: '#0066CC' }]}>
          <MaterialIcons name="favorite" size={56} color="#FFFFFF" />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>Vigora Saúde</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Faça login para sincronizar seus dados de saúde e garantir sua segurança em emergências.
        </Text>

        <View style={[styles.benefitsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { icon: 'cloud-upload' as const, text: 'Dados salvos e sincronizados na nuvem' },
            { icon: 'people' as const, text: 'Contatos de emergência sempre protegidos' },
            { icon: 'alarm' as const, text: 'Alarmes de medicamentos preservados' },
            { icon: 'lock' as const, text: 'Informações criptografadas e seguras' },
          ].map((item, i) => (
            <View key={i} style={styles.benefitItem}>
              <MaterialIcons name={item.icon} size={20} color={colors.primary} />
              <Text style={[styles.benefitText, { color: colors.foreground }]}>{item.text}</Text>
            </View>
          ))}
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
            <MaterialIcons name="error-outline" size={18} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={({ pressed }) => [
            styles.loginButton,
            { backgroundColor: colors.primary, opacity: pressed || loading ? 0.75 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialIcons name="login" size={22} color="#FFFFFF" />
              <Text style={styles.loginButtonText}>Entrar com sua conta</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.privacyNote, { color: colors.muted }]}>
          Ao entrar, você concorda com nossos Termos de Uso e Política de Privacidade.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  benefitsBox: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 15,
    flex: 1,
    lineHeight: 22,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#DC2626',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  privacyNote: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
