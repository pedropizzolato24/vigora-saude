/**
 * components/trial-banner.tsx
 *
 * Banners de trial e expiração do Vigora Pro.
 *
 * - TrialBanner: exibido durante os 14 dias de trial gratuito
 * - ExpiredBanner: exibido após o trial expirar (sem assinatura ativa)
 *
 * Ambos redirecionam para o paywall ao serem tocados.
 * Seguem a linguagem visual dos section cards das Configurações
 * (superfície branca, chip de ícone com fundo suave, borda colorida).
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { usePurchases } from "@/hooks/use-purchases";
import { useColors } from "@/hooks/use-colors";
import { useFontSize } from "@/lib/font-size-context";

// --- TrialBanner --------------------------------------------------------------

/**
 * Exibido durante o trial gratuito de 14 dias.
 * Mostra quantos dias restam e convida o usuário a assinar.
 */
export function TrialBanner() {
  const { isTrialActive, trialDaysLeft, isPro, isLoading } = usePurchases();
  const colors = useColors();
  const fs = useFontSize();

  // Não exibir durante carregamento, se já for Pro ou se o trial não estiver ativo
  if (isLoading || isPro || !isTrialActive) return null;

  const dayText = trialDaysLeft === 1 ? "1 dia restante" : `${trialDaysLeft} dias restantes`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.primary + "55",
        },
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => router.push("/(modal)/paywall")}
      accessibilityRole="button"
      accessibilityLabel={`Trial gratuito - ${dayText}. Toque para assinar.`}
    >
      <View style={[styles.iconBadge, { backgroundColor: colors.primaryLight }]}>
        <MaterialIcons name="hourglass-empty" size={20} color={colors.primary} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.foreground, fontSize: fs.md }]}>
          Trial gratuito — {dayText}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
          Toque para assinar e manter o acesso completo
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.primary} />
    </Pressable>
  );
}

// --- ExpiredBanner ------------------------------------------------------------

/**
 * Exibido após o trial de 14 dias expirar, sem assinatura ativa.
 * Mesma linguagem de card, com acento vermelho para urgência.
 */
export function ExpiredBanner() {
  const { isTrialActive, isPro, isLoading } = usePurchases();
  const colors = useColors();
  const fs = useFontSize();

  // Não exibir durante carregamento, se ainda estiver no trial ou já for Pro
  if (isLoading || isPro || isTrialActive) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        styles.expiredCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.error,
        },
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => router.push("/(modal)/paywall")}
      accessibilityRole="button"
      accessibilityLabel="Período de teste encerrado. Toque para assinar."
    >
      <View style={[styles.iconBadge, { backgroundColor: colors.errorLight }]}>
        <MaterialIcons name="lock" size={20} color={colors.error} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.error, fontSize: fs.md }]}>
          Período de teste encerrado
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
          Assine o Vigora Pro para continuar usando todos os recursos
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={colors.error} />
    </Pressable>
  );
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  // Urgência: borda mais pesada que os cards comuns
  expiredCard: {
    borderWidth: 1.5,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontWeight: "700",
    lineHeight: 20,
  },
  subtitle: {
    marginTop: 2,
    lineHeight: 18,
  },
});
