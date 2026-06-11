/**
 * app/phone-login.tsx
 *
 * Login por telefone em duas etapas: número com DDD → código de 6 números
 * entregue no WhatsApp do próprio número. Sem senha para lembrar — pensado
 * para o público 60+ (no Brasil o telefone É a identidade).
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AntDesign from "@expo/vector-icons/AntDesign";
import { FormKeyboardView } from "@/components/form-keyboard-view";
import { useColors } from "@/hooks/use-colors";
import { useAppContext } from "@/lib/app-context";
import { phoneRequestCode, phoneVerifyCode } from "@/lib/phone-signin";

/** "(51) 99999-9999" conforme digita. */
function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  // Número colado com DDI ("+55 51 ...") chega com 12-13 dígitos começando em
  // 55 — remove o DDI para exibir/formatar só a parte nacional (o servidor
  // reanexa o 55). Sem isto, o slice(0,11) cortaria o número errado.
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function PhoneLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reconcileFromCloud } = useAppContext();

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Algo deu errado. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = () => {
    if (loading) return;
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Digite seu celular com DDD, por exemplo (51) 99999-9999.");
      return;
    }
    run(async () => {
      await phoneRequestCode(phone);
      setStep("code");
      setInfo("Código enviado! Veja a mensagem no seu WhatsApp.");
    });
  };

  const handleVerify = () => {
    if (loading) return;
    if (code.length !== 6) {
      setError("Digite os 6 números do código.");
      return;
    }
    run(() => phoneVerifyCode(phone, code, router, reconcileFromCloud));
  };

  return (
    <FormKeyboardView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24) + 12,
            paddingBottom: Math.max(insets.bottom, 20) + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => {
            if (step === "code") {
              setStep("phone");
              setError(null);
              setInfo(null);
              setCode("");
            } else {
              router.back();
            }
          }}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel="Voltar"
          accessibilityRole="button"
          hitSlop={8}
        >
          <AntDesign name="arrow-left" size={24} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Voltar</Text>
        </Pressable>

        <Text style={[styles.title, { color: colors.foreground }]}>
          {step === "phone" ? "Entrar com telefone" : "Digite o código"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {step === "phone"
            ? "Enviaremos um código de 6 números para o seu WhatsApp. Nada de senha para decorar."
            : `Enviamos o código por WhatsApp para ${phone}.`}
        </Text>

        {info ? (
          <View style={[styles.noteBox, { backgroundColor: colors.successLight, borderColor: colors.success + "40" }]}>
            <Text style={[styles.noteText, { color: colors.success }]}>{info}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.noteBox, { backgroundColor: colors.errorLight, borderColor: colors.error + "40" }]}>
            <Text style={[styles.noteText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        {step === "phone" ? (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Celular com DDD</Text>
            <TextInput
              value={phone}
              onChangeText={(t) => setPhone(formatPhone(t))}
              placeholder="(11) 99999-9999"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              autoComplete="tel"
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            />
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Código de 6 números</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              style={[
                styles.input,
                styles.codeInput,
                { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            />
          </View>
        )}

        <Pressable
          onPress={step === "phone" ? handleRequest : handleVerify}
          disabled={loading}
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed || loading ? 0.75 : 1,
            },
          ]}
          accessibilityLabel={step === "phone" ? "Enviar código" : "Confirmar código"}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={[styles.submitText, { color: colors.onPrimary }]}>
              {step === "phone" ? "Enviar código" : "Entrar"}
            </Text>
          )}
        </Pressable>

        {step === "code" ? (
          <Pressable
            onPress={() =>
              run(async () => {
                await phoneRequestCode(phone);
                setInfo("Novo código enviado para o seu WhatsApp.");
              })
            }
            disabled={loading}
            style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Não recebeu? Reenviar código
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </FormKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    gap: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    minHeight: 44,
  },
  backText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    fontFamily: "Fraunces-Italic",
    fontStyle: "italic",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontFamily: "PlusJakartaSans",
    fontSize: 15,
    lineHeight: 22,
  },
  noteBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  noteText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    width: "100%",
    gap: 8,
  },
  label: {
    fontFamily: "PlusJakartaSans",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 52,
  },
  codeInput: {
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 12,
    fontFamily: "SpaceMono-Regular",
  },
  submitButton: {
    width: "100%",
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    marginTop: 4,
  },
  submitText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    fontFamily: "PlusJakartaSans",
    fontSize: 15,
    fontWeight: "600",
  },
});
