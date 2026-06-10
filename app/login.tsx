import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { FadeInView, StaggeredItem } from "@/components/animated-components";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useAppContext } from "@/lib/app-context";
import { finishGoogleLogin, persistOAuthPkce } from "@/lib/google-signin";
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "@/constants/oauth";

WebBrowser.maybeCompleteAuthSession();

// Lua crescente — símbolo da marca Vigora
function MoonSymbol({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      {/* Lua: dois círculos sobrepostos */}
      <Circle cx="36" cy="36" r="28" fill="#1E4D8C" />
      <Circle cx="48" cy="28" r="22" fill="#F4EFE5" />
      {/* Estrelas pequenas */}
      <Circle cx="22" cy="20" r="2" fill="#1E4D8C" />
      <Circle cx="16" cy="34" r="1.5" fill="#1E4D8C" />
      <Circle cx="28" cy="54" r="1.5" fill="#1E4D8C" />
    </Svg>
  );
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reconcileFromCloud } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ["openid", "email", "profile"],
    // Por padrão o provider usa o bundle id EM RUNTIME (Application.applicationId),
    // mas sideload com Apple ID gratuito renomeia o bundle (com.vigora.saude.<teamId>)
    // e o Google rejeita com redirect_uri_mismatch. Fixamos no bundle id registrado
    // no client OAuth; em builds assinados normais o valor é idêntico ao padrão.
    redirectUri: makeRedirectUri({ native: "com.vigora.saude:/oauthredirect" }),
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === "success") {
      // No Android o redirect volta como deep link e é tratado em
      // app/oauthredirect.tsx; aqui tratamos a sessão "warm" (iOS/web).
      if (Platform.OS !== "android") {
        finishGoogleLogin(
          response.params.code,
          router,
          reconcileFromCloud
        ).catch((err) => {
          console.error("[Login] Auth failed:", err);
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao completar a autenticação"
          );
          setLoading(false);
        });
      }
    } else if (response.type === "error") {
      setError("Autenticação cancelada ou recusada pelo Google.");
      setLoading(false);
    } else if (response.type === "dismiss") {
      setLoading(false);
    }
  }, [response]);

  const handleLogin = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setLoading(true);
    setError(null);
    try {
      // Persiste o PKCE antes de abrir o browser: no Android o redirect volta
      // como deep link (podendo reabrir o app do zero) e a troca acontece em
      // app/oauthredirect.tsx, fora do estado em memória deste componente.
      if (request?.codeVerifier && request.redirectUri) {
        await persistOAuthPkce(request.codeVerifier, request.redirectUri);
      }
      await promptAsync();
    } catch {
      setError("Não foi possível iniciar o login. Verifique sua conexão e tente novamente.");
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Área superior — marca */}
      {/* Jakub enter recipe: opacity + translateY, duration 420ms (RARE — brand moment) */}
      <FadeInView delay={0} duration={420} style={[styles.brandArea, { paddingTop: Math.max(insets.top, 48) + 24 }]}>
        <MoonSymbol size={64} />
        <View style={styles.wordmark}>
          <Text style={[styles.wordmarkText, { color: colors.primary }]}>
            Vigora
          </Text>
        </View>
        <FadeInView delay={100} duration={380}>
          <Text style={[styles.tagline, { color: colors.muted }]}>
            Perto de você. Sempre.
          </Text>
        </FadeInView>
      </FadeInView>

      {/* Área inferior — ação: FadeInView com delay maior que brand area */}
      <FadeInView
        delay={200}
        duration={400}
        style={[
          styles.actionArea,
          {
            paddingBottom: Math.max(insets.bottom, 24) + 16,
            borderTopColor: colors.border,
          },
        ]}
      >
        {/* Proposta de valor — staggered (Emil: RARE, each line gets its own moment) */}
        <View style={styles.valueProps}>
          {[
            "Dados sincronizados na nuvem",
            "Contatos de emergência sempre ativos",
            "Se você não responder, sua família saberá",
            "Informações criptografadas",
          ].map((item, i) => (
            <StaggeredItem key={item} index={i} staggerDelay={70} style={styles.valuePropRow}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.valuePropText, { color: colors.foreground }]}>
                {item}
              </Text>
            </StaggeredItem>
          ))}
        </View>

        {/* Erro */}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.errorLight, borderColor: colors.error + '40' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        {/* Botão Google — FadeInView com delay após os value props */}
        {/* Emil: login é raro, entrada suave na ação é ok */}
        <Pressable
          onPress={handleLogin}
          disabled={loading || !request}
          style={({ pressed }) => [
            styles.googleButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed || loading || !request ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          accessibilityLabel="Entrar com o Google"
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <>
              <AntDesign name="google" size={20} color={colors.onPrimary} />
              <Text style={[styles.googleButtonText, { color: colors.onPrimary }]}>Entrar com o Google</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.privacyNote, { color: colors.muted }]}>
          Ao entrar, você concorda com os Termos de Uso e Política de Privacidade.
        </Text>
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  brandArea: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  wordmark: {
    marginTop: 4,
  },
  wordmarkText: {
    fontFamily: "Fraunces-Italic",
    fontStyle: "italic",
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  tagline: {
    fontFamily: "PlusJakartaSans",
    fontSize: 16,
    fontWeight: "400",
    letterSpacing: 0.1,
    textAlign: "center",
  },
  actionArea: {
    paddingHorizontal: 28,
    paddingTop: 28,
    borderTopWidth: 1,
    gap: 20,
  },
  valueProps: {
    gap: 12,
  },
  valuePropRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  valuePropText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
    flex: 1,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 14,
    lineHeight: 20,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  googleButtonText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 16,
    fontWeight: "600",
  },
  privacyNote: {
    fontFamily: "PlusJakartaSans",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
