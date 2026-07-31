import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { FadeInView, StaggeredItem } from "@/components/animated-components";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useAppContext } from "@/lib/app-context";
import * as Auth from "@/lib/_core/auth";
import {
  finishGoogleLogin,
  openGoogleAuth,
  persistOAuthPkce,
} from "@/lib/google-signin";
import { isAppleCancel, signInWithApple } from "@/lib/apple-signin";
import { signInAnonymously } from "@/lib/anonymous-signin";
import { completeServerLogin } from "@/lib/auth-session";
import { fetchAuthMethods, type AuthMethods } from "@/lib/phone-signin";
import {
  APPLE_SIGNIN_ENABLED,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "@/constants/oauth";

WebBrowser.maybeCompleteAuthSession();

// Lua crescente — símbolo da marca Vigora.
// O recorte usa a cor de fundo do tema (não uma cor fixa), então o crescente
// funciona em claro e escuro sem a "bola" creme destoar no escuro (feedback do beta).
function MoonSymbol({ size = 72 }: { size?: number }) {
  const colors = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      {/* Disco da lua na cor da marca */}
      <Circle cx="36" cy="36" r="28" fill={colors.primary} />
      {/* Recorte na cor do fundo cria o crescente (some a "bola" creme solta) */}
      <Circle cx="48" cy="28" r="22" fill={colors.background} />
      {/* Estrelas pequenas */}
      <Circle cx="22" cy="20" r="2" fill={colors.primary} />
      <Circle cx="16" cy="34" r="1.5" fill={colors.primary} />
      <Circle cx="28" cy="54" r="1.5" fill={colors.primary} />
    </Svg>
  );
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reconcileFromCloud } = useAppContext();
  const scheme = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sign in with Apple só existe em iOS com a capability ativa (builds
  // assinados de verdade); em sideload/Android o botão simplesmente não rende.
  const [appleAvailable, setAppleAvailable] = useState(false);
  // E-mail e telefone dependem de infraestrutura no servidor (Resend /
  // template OTP do WhatsApp) — o app esconde o que não está configurado.
  const [methods, setMethods] = useState<AuthMethods>({
    google: true,
    apple: true,
    email: false,
    phone: false,
  });
  // Conta anônima ativa => esta tela está em modo "proteger conta": mostra o
  // hint de proteção e os logins ANEXAM à conta atual. O "Continuar sem conta"
  // continua visível (feedback: sumir confundia quem voltava à tela) — tocar
  // nele apenas reentra na MESMA conta (openId determinístico por aparelho).
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    // Só checa disponibilidade do Apple quando o build foi gerado com a
    // capability (conta paga). Sem o flag, nem o native module foi incluído.
    if (Platform.OS === "ios" && APPLE_SIGNIN_ENABLED) {
      AppleAuthentication.isAvailableAsync()
        .then(setAppleAvailable)
        .catch(() => setAppleAvailable(false));
    }
    fetchAuthMethods().then(setMethods);
    Auth.getUserInfo()
      .then((u) => setIsAnonymous(u?.loginMethod === "anonymous"))
      .catch(() => {});
  }, []);

  const handleAnonymousLogin = async () => {
    if (loading) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setLoading(true);
    setError(null);
    try {
      const result = await signInAnonymously();
      await completeServerLogin(result, router, reconcileFromCloud);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível entrar. Verifique sua conexão e tente novamente."
      );
      setLoading(false);
    }
  };

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ["openid", "email", "profile"],
    // O provider troca o authorization code sozinho por padrão (auto-exchange).
    // No iOS o fluxo "warm" volta como success e finishGoogleLogin troca o code
    // de novo — code é de uso único, então a 2ª troca falhava com invalid_grant
    // ("issued to another client"). Desligamos para a troca acontecer só no
    // nosso fluxo (finishGoogleLogin), com o PKCE/redirect/client por plataforma
    // já corretos. Android (deep link) e web (ResponseType.Token) não mudam.
    shouldAutoExchangeCode: false,
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
      // openGoogleAuth cai no navegador padrão quando o aparelho não tem Custom
      // Tab disponível; nesse caso o app volta na hora e o loading pode sair.
      if (await openGoogleAuth(promptAsync, request?.url)) {
        setLoading(false);
      }
    } catch (err) {
      console.error("[Login] Falha ao abrir o consentimento do Google:", err);
      // Diagnóstico dos builds de teste: quando nem o Custom Tab nem o navegador
      // padrão abrem, a lista de navegadores que o app enxerga diz se o aparelho
      // não tem nenhum ou se é o filtro de visibilidade do Android 11+.
      const browsers = await WebBrowser.getCustomTabsSupportingBrowsersAsync()
        .then((r) => r.browserPackages.join(", ") || "nenhum")
        .catch(() => "não foi possível listar");
      setError(
        `Não foi possível iniciar o login. Verifique sua conexão e tente novamente. (${
          err instanceof Error ? err.message : String(err)
        } | navegadores: ${browsers})`
      );
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      await signInWithApple(router, reconcileFromCloud);
    } catch (err) {
      if (!isAppleCancel(err)) {
        console.error("[Login] Apple auth failed:", err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Não foi possível entrar com a Apple. Tente novamente."
        );
      }
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

        {/* Sign in with Apple — primeiro no iOS (diretriz 4.8 / HIG: o botão
            nativo da Apple com proeminência igual ou maior que os demais) */}
        {Platform.OS === "ios" && APPLE_SIGNIN_ENABLED && appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              scheme === "dark"
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={14}
            style={styles.appleButton}
            onPress={handleAppleLogin}
          />
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

        {/* Alternativas sem conta Google/Apple — visíveis só quando o servidor
            tem a infraestrutura (Resend / template OTP) configurada */}
        {methods.email || methods.phone ? (
          <View style={styles.altRow}>
            {methods.email ? (
              <Pressable
                onPress={() => router.push("/email-login")}
                disabled={loading}
                style={({ pressed }) => [
                  styles.altButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    opacity: pressed || loading ? 0.75 : 1,
                  },
                ]}
                accessibilityLabel="Entrar com e-mail e senha"
                accessibilityRole="button"
              >
                <AntDesign name="mail" size={18} color={colors.primary} />
                <Text style={[styles.altButtonText, { color: colors.primary }]}>
                  E-mail
                </Text>
              </Pressable>
            ) : null}
            {methods.phone ? (
              <Pressable
                onPress={() => router.push("/phone-login")}
                disabled={loading}
                style={({ pressed }) => [
                  styles.altButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    opacity: pressed || loading ? 0.75 : 1,
                  },
                ]}
                accessibilityLabel="Entrar com telefone"
                accessibilityRole="button"
              >
                <AntDesign name="phone" size={18} color={colors.primary} />
                <Text style={[styles.altButtonText, { color: colors.primary }]}>
                  Telefone
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Continuar sem conta — o app funciona inteiro; login vira upgrade
            opcional ("proteja sua conta"). Sempre visível: com sessão anônima
            ativa, tocar reentra na mesma conta (signInAnonymously é
            determinístico por aparelho) — sumir com o botão confundia quem
            voltava para esta tela (item 5 do feedback). */}
        <Pressable
          onPress={handleAnonymousLogin}
          disabled={loading}
          style={({ pressed }) => [
            styles.anonymousButton,
            { opacity: pressed || loading ? 0.6 : 1 },
          ]}
          accessibilityLabel="Continuar sem conta"
          accessibilityRole="button"
        >
          <Text style={[styles.anonymousButtonText, { color: colors.muted }]}>
            Continuar sem conta
          </Text>
        </Pressable>
        {isAnonymous ? (
          <Text style={[styles.linkHint, { color: colors.muted }]}>
            Entre com um dos métodos acima para proteger sua conta — seus dados
            continuam os mesmos.
          </Text>
        ) : null}

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
  appleButton: {
    height: 54,
    width: "100%",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  altRow: {
    flexDirection: "row",
    gap: 12,
  },
  altButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  altButtonText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 16,
    fontWeight: "600",
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
  anonymousButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 10,
  },
  anonymousButtonText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 16,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  linkHint: {
    fontFamily: "PlusJakartaSans",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
