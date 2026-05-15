import { ThemedView } from "@/components/themed-view";
import * as Auth from "@/lib/_core/auth";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiBaseUrl } from "@/constants/oauth";

const LOGIN_COMPLETED_KEY = 'vigora_login_completed';

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        if (params.error) {
          setStatus("error");
          setErrorMessage(params.error);
          return;
        }

        if (!params.code) {
          setStatus("error");
          setErrorMessage("Código de autenticação não recebido");
          return;
        }

        // Exchange PKCE code with Supabase
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeError || !data.session) {
          console.error("[OAuth] Supabase code exchange failed:", exchangeError);
          setStatus("error");
          setErrorMessage("Falha ao trocar código de autenticação");
          return;
        }

        // Exchange Supabase access token for our custom session JWT
        const baseUrl = getApiBaseUrl();
        if (!baseUrl) {
          throw new Error("URL do servidor não configurada. Rebuilde o app com EXPO_PUBLIC_API_BASE_URL.");
        }
        const endpoint = `${baseUrl}/api/auth/supabase`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: data.session.access_token }),
        }).catch((err: unknown) => {
          throw new Error(`Falha ao conectar em ${endpoint}: ${String(err)}`);
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Erro ${res.status}`);
        }

        const result = await res.json() as {
          sessionToken: string;
          user: {
            id: number | null;
            openId: string;
            name: string | null;
            email: string | null;
            phone: string | null;
            userType: "caregiver" | "monitored" | null;
            loginMethod: string | null;
            lastSignedIn: string;
          };
        };

        await Auth.setSessionToken(result.sessionToken);
        await Auth.setUserInfo({
          id: result.user.id ?? 0,
          openId: result.user.openId,
          name: result.user.name,
          email: result.user.email,
          phone: result.user.phone,
          userType: result.user.userType,
          loginMethod: result.user.loginMethod,
          lastSignedIn: new Date(result.user.lastSignedIn),
        });
        await AsyncStorage.setItem(LOGIN_COMPLETED_KEY, 'true');

        setStatus("success");
        const nextRoute = result.user.userType ? "/(tabs)" : "/register";
        setTimeout(() => router.replace(nextRoute), 800);
      } catch (err) {
        console.error("[OAuth] Callback failed:", err);
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Falha ao completar a autenticação",
        );
      }
    };

    handleCallback();
  }, [params.code, params.error, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">
              Concluindo autenticação...
            </Text>
          </>
        )}
        {status === "success" && (
          <Text className="text-base leading-6 text-center text-foreground">
            Login realizado com sucesso! Redirecionando...
          </Text>
        )}
        {status === "error" && (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">
              Falha na autenticação
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              {errorMessage}
            </Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
