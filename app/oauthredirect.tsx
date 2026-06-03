import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useAppContext } from "@/lib/app-context";
import { finishGoogleLogin } from "@/lib/google-signin";

// Tela de callback do OAuth Google no Android. O Custom Tab redireciona para
// `vigora://oauthredirect?code=...` e o app/+native-intent.ts encaminha pra cá.
// A troca do code usa o PKCE persistido em login.tsx, então funciona mesmo se o
// app tiver sido reaberto do zero (cold start) durante o login.
export default function OAuthRedirectScreen() {
  const colors = useColors();
  const router = useRouter();
  const { reconcileFromCloud } = useAppContext();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = typeof params.code === "string" ? params.code : undefined;
    if (params.error || !code) {
      router.replace("/login");
      return;
    }
    finishGoogleLogin(code, router, reconcileFromCloud).catch((err) => {
      console.error("[OAuthRedirect] Auth failed:", err);
      setFailed(true);
      setTimeout(() => router.replace("/login"), 1500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.text, { color: colors.muted }]}>
        {failed ? "Não foi possível concluir o login." : "Concluindo login…"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  text: {
    fontFamily: "PlusJakartaSans",
    fontSize: 15,
  },
});
