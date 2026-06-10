/**
 * app/email-login.tsx
 *
 * Login e cadastro por e-mail+senha, em etapas simples (uma decisão por tela,
 * público 60+): entrar → ou criar conta (nome/e-mail/senha → código de
 * confirmação) → ou recuperar senha (e-mail → código → nova senha).
 *
 * O código de confirmação prova a posse do e-mail — é o que permite que o
 * mesmo e-mail do Google/Apple caia na MESMA conta, com os mesmos dados.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { useColors } from "@/hooks/use-colors";
import { useAppContext } from "@/lib/app-context";
import {
  emailForgot,
  emailLogin,
  emailReset,
  emailSignup,
  emailVerify,
} from "@/lib/email-signin";

type Mode = "login" | "signup" | "verify" | "forgot" | "reset";

const TITLES: Record<Mode, { title: string; subtitle: string }> = {
  login: {
    title: "Entrar com e-mail",
    subtitle: "Use o e-mail e a senha da sua conta Vigora.",
  },
  signup: {
    title: "Criar conta",
    subtitle: "Vamos precisar do seu nome, e-mail e uma senha.",
  },
  verify: {
    title: "Confirme seu e-mail",
    subtitle: "Digite o código de 6 números que enviamos para o seu e-mail.",
  },
  forgot: {
    title: "Recuperar senha",
    subtitle: "Informe seu e-mail e enviaremos um código de recuperação.",
  },
  reset: {
    title: "Nova senha",
    subtitle: "Digite o código que enviamos por e-mail e escolha a nova senha.",
  },
};

export default function EmailLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reconcileFromCloud } = useAppContext();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setCode("");
    // Limpa a senha ao trocar de fluxo para que a senha digitada numa tentativa
    // de login não vaze pré-preenchida no campo "Nova senha" do reset.
    setPassword("");
  };

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

  const trimmedEmail = email.trim();

  const handleSubmit = () => {
    if (loading) return;
    switch (mode) {
      case "login":
        if (!trimmedEmail || !password) {
          setError("Preencha e-mail e senha.");
          return;
        }
        run(() => emailLogin(trimmedEmail, password, router, reconcileFromCloud));
        break;
      case "signup":
        if (!name.trim() || !trimmedEmail || password.length < 8) {
          setError(
            password.length > 0 && password.length < 8
              ? "A senha precisa de pelo menos 8 caracteres."
              : "Preencha nome, e-mail e senha (mínimo 8 caracteres)."
          );
          return;
        }
        run(async () => {
          await emailSignup(trimmedEmail, password, name.trim());
          setMode("verify");
          setInfo(`Código enviado para ${trimmedEmail}. Confira sua caixa de entrada (e o spam).`);
        });
        break;
      case "verify":
        if (code.length !== 6) {
          setError("Digite os 6 números do código.");
          return;
        }
        run(() => emailVerify(trimmedEmail, code, router, reconcileFromCloud));
        break;
      case "forgot":
        if (!trimmedEmail) {
          setError("Informe seu e-mail.");
          return;
        }
        run(async () => {
          await emailForgot(trimmedEmail);
          setMode("reset");
          setInfo(`Se ${trimmedEmail} tiver uma conta, o código chega em instantes.`);
        });
        break;
      case "reset":
        if (code.length !== 6 || password.length < 8) {
          setError("Digite o código de 6 números e uma nova senha com pelo menos 8 caracteres.");
          return;
        }
        run(() => emailReset(trimmedEmail, code, password, router, reconcileFromCloud));
        break;
    }
  };

  const submitLabel: Record<Mode, string> = {
    login: "Entrar",
    signup: "Criar conta",
    verify: "Confirmar",
    forgot: "Enviar código",
    reset: "Salvar nova senha",
  };

  const { title, subtitle } = TITLES[mode];
  const showName = mode === "signup";
  const showEmail = mode === "login" || mode === "signup" || mode === "forgot";
  const showCode = mode === "verify" || mode === "reset";
  const showPasswordField = mode === "login" || mode === "signup" || mode === "reset";
  const passwordLabel =
    mode === "reset" ? "Nova senha" : mode === "signup" ? "Crie uma senha" : "Senha";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
          onPress={() => (mode === "login" ? router.back() : switchMode("login"))}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel="Voltar"
          accessibilityRole="button"
          hitSlop={8}
        >
          <AntDesign name="arrow-left" size={24} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Voltar</Text>
        </Pressable>

        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>

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

        {showName ? (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Nome completo</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Como devemos te chamar?"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
        ) : null}

        {showEmail ? (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="seuemail@exemplo.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            />
          </View>
        ) : null}

        {showCode ? (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>Código de 6 números</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              style={[
                styles.input,
                styles.codeInput,
                { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            />
          </View>
        ) : null}

        {showPasswordField ? (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{passwordLabel}</Text>
            <View>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  styles.passwordInput,
                  { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
                accessibilityRole="button"
                hitSlop={8}
              >
                <AntDesign
                  name={showPassword ? "eye" : "eye-invisible"}
                  size={22}
                  color={colors.muted}
                />
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed || loading ? 0.75 : 1,
            },
          ]}
          accessibilityLabel={submitLabel[mode]}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={[styles.submitText, { color: colors.onPrimary }]}>
              {submitLabel[mode]}
            </Text>
          )}
        </Pressable>

        {mode === "login" ? (
          <>
            <Pressable
              onPress={() => switchMode("signup")}
              disabled={loading}
              style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>
                Não tem conta? Criar conta
              </Text>
            </Pressable>
            <Pressable
              onPress={() => switchMode("forgot")}
              disabled={loading}
              style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>
                Esqueci minha senha
              </Text>
            </Pressable>
          </>
        ) : null}

        {mode === "verify" ? (
          <Pressable
            onPress={() =>
              run(async () => {
                await emailSignup(trimmedEmail, password, name.trim());
                setInfo(`Novo código enviado para ${trimmedEmail}.`);
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
    </KeyboardAvoidingView>
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
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
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
