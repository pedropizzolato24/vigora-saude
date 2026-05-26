import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { exchangeCodeAsync } from "expo-auth-session";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { useAppContext } from "@/lib/app-context";
import * as Auth from "@/lib/_core/auth";
import {
  getApiBaseUrl,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "@/constants/oauth";

// Obrigatório: limpa sessão de browser pendente ao montar a tela.
// Deve ser chamado no nível do módulo, fora do componente.
WebBrowser.maybeCompleteAuthSession();

const LOGIN_COMPLETED_KEY = "vigora_login_completed";
const CAREGIVER_ONBOARDING_KEY = "vigora_caregiver_onboarding_completed";

function getNextRoute(
  userType: "caregiver" | "monitored" | null,
  caregiverOnboardingDone: boolean
): string {
  if (!userType) return "/register";
  if (userType === "caregiver") {
    return caregiverOnboardingDone
      ? "/(caregiver-tabs)"
      : "/caregiver-onboarding";
  }
  return "/(tabs)";
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reconcileFromCloud } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // expo-auth-session seleciona o clientId e redirect URI corretos por plataforma.
  // Android/iOS usam o formato de domínio reverso (com.vigora.saude:/).
  // Web usa o proxy Expo (https://auth.expo.io) com o webClientId.
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ["openid", "email", "profile"],
  });

  // expo-web-browser intercepta o redirect antes do Expo Router.
  // O resultado da autenticação chega aqui via hook, não via app/oauth/callback.tsx.
  useEffect(() => {
    if (!response) return;

    if (response.type === "success") {
      handleAuthCode(response.params.code);
    } else if (response.type === "error") {
      setError("Autenticação cancelada ou recusada pelo Google.");
      setLoading(false);
    } else if (response.type === "dismiss") {
      // Usuário fechou o browser — silencioso
      setLoading(false);
    }
  }, [response]);

  async function handleAuthCode(code: string) {
    if (!request) return;

    try {
      // 1. Trocar code por tokens diretamente com o Google
      const tokens = await exchangeCodeAsync(
        {
          clientId: request.clientId,
          code,
          redirectUri: request.redirectUri,
          extraParams: { code_verifier: request.codeVerifier ?? "" },
        },
        { tokenEndpoint: "https://oauth2.googleapis.com/token" }
      );

      if (!tokens.idToken) {
        throw new Error("id_token não recebido do Google");
      }

      // 2. Trocar Google id_token por JWT de sessão do Railway
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        throw new Error(
          "URL do servidor não configurada. Rebuilde o app com EXPO_PUBLIC_API_BASE_URL."
        );
      }

      const res = await fetch(`${baseUrl}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: tokens.idToken }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Erro ${res.status}`);
      }

      const result = (await res.json()) as {
        sessionToken: string;
        user: {
          id: number | null;
          openId: string;
          name: string | null;
          email: string | null;
          phone: string | null;
          userType: "caregiver" | "monitored" | null;
          birthDate: string | null;
          bloodType: string | null;
          loginMethod: string | null;
          lastSignedIn: string;
        };
      };

      // 3. Persistir sessão (mesma lógica que era feita em oauth/callback.tsx)
      await Auth.setSessionToken(result.sessionToken);
      await Auth.setUserInfo({
        id: result.user.id ?? 0,
        openId: result.user.openId,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        userType: result.user.userType,
        birthDate: result.user.birthDate,
        bloodType: result.user.bloodType,
        loginMethod: result.user.loginMethod,
        lastSignedIn: new Date(result.user.lastSignedIn),
      });

      await AsyncStorage.setItem(LOGIN_COMPLETED_KEY, "true");
      reconcileFromCloud().catch(() => {});

      const flag = await AsyncStorage.getItem(CAREGIVER_ONBOARDING_KEY);
      router.replace(getNextRoute(result.user.userType, flag === "true"));
    } catch (err) {
      console.error("[Login] Auth failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao completar a autenticação"
      );
    } finally {
      setLoading(false);
    }
  }

  const handleLogin = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setLoading(true);
    setError(null);
    try {
      await promptAsync();
    } catch {
      setError(
        "Não foi possível iniciar o login. Verifique sua conexão e tente novamente."
      );
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
        <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
          <MaterialIcons name="favorite" size={56} color={colors.onPrimary} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          Vigora Saúde
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Faça login para sincronizar seus dados de saúde e garantir sua
          segurança em emergências.
        </Text>

        <View
          style={[
            styles.benefitsBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {[
            {
              icon: "cloud-upload" as const,
              text: "Dados salvos e sincronizados na nuvem",
            },
            {
              icon: "people" as const,
              text: "Contatos de emergência sempre protegidos",
            },
            {
              icon: "alarm" as const,
              text: "Alarmes de medicamentos preservados",
            },
            {
              icon: "lock" as const,
              text: "Informações criptografadas e seguras",
            },
          ].map((item, i) => (
            <View key={i} style={styles.benefitItem}>
              <MaterialIcons name={item.icon} size={20} color={colors.primary} />
              <Text
                style={[styles.benefitText, { color: colors.foreground }]}
              >
                {item.text}
              </Text>
            </View>
          ))}
        </View>

        {error && (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" },
            ]}
          >
            <MaterialIcons name="error-outline" size={18} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={handleLogin}
          disabled={loading || !request}
          style={({ pressed }) => [
            styles.googleButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed || loading || !request ? 0.7 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : (
            <>
              <AntDesign name="google" size={22} color="#4285F4" />
              <Text
                style={[styles.googleButtonText, { color: colors.foreground }]}
              >
                Entrar com o Google
              </Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.privacyNote, { color: colors.muted }]}>
          Ao entrar, você concorda com nossos Termos de Uso e Política de
          Privacidade.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: { fontSize: 32, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },
  benefitsBox: {
    width: "100%",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  benefitItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitText: { fontSize: 15, flex: 1, lineHeight: 22 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
  },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20, color: "#DC2626" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  googleButtonText: { fontSize: 17, fontWeight: "600" },
  privacyNote: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});
