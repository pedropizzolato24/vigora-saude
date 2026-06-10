/**
 * components/trial-banner.tsx
 *
 * Banners de trial e expiração do Vigora Pro.
 *
 * - TrialBanner: exibido durante os 14 dias de trial gratuito
 * - ExpiredBanner: exibido após o trial expirar (sem assinatura ativa)
 *
 * Ambos redirecionam para o paywall ao serem tocados.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { usePurchases } from "@/hooks/use-purchases";
import { useColors } from "@/hooks/use-colors";

// --- TrialBanner --------------------------------------------------------------

/**
 * Exibido durante o trial gratuito de 14 dias.
 * Mostra quantos dias restam e convida o usuário a assinar.
 */
export function TrialBanner() {
  const { isTrialActive, trialDaysLeft, isPro, isLoading } = usePurchases();
  const colors = useColors();

  // Não exibir durante carregamento, se já for Pro ou se o trial não estiver ativo
  if (isLoading || isPro || !isTrialActive) return null;

  const dayText = trialDaysLeft === 1 ? "1 dia restante" : `${trialDaysLeft} dias restantes`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.primary },
        pressed && { opacity: 0.85 },
      ]}
      onPress={() => router.push("/(modal)/paywall")}
      accessibilityRole="button"
      accessibilityLabel={`Trial gratuito - ${dayText}. Toque para assinar.`}
    >
      <View style={styles.textContainer}>
        <Text style={styles.title}>
          ⏳ Trial gratuito - {dayText}
        </Text>
        <Text style={styles.subtitle}>
          Toque para assinar e manter o acesso completo
        </Text>
      </View>
      <Text style={styles.arrow}>{'->'}</Text>
    </Pressable>
  );
}

// --- ExpiredBanner ------------------------------------------------------------

/**
 * Exibido após o trial de 14 dias expirar, sem assinatura ativa.
 * Urgência visual (vermelho) para converter o usuário.
 */
export function ExpiredBanner() {
  const { isTrialActive, isPro, isLoading } = usePurchases();
  const colors = useColors();

  // Não exibir durante carregamento, se ainda estiver no trial ou já for Pro
  if (isLoading || isPro || isTrialActive) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.emergency },
        pressed && { opacity: 0.85 },
      ]}
      onPress={() => router.push("/(modal)/paywall")}
      accessibilityRole="button"
      accessibilityLabel="Período de teste encerrado. Toque para assinar."
    >
      <View style={styles.textContainer}>
        <Text style={[styles.title, styles.expiredTitle, { color: colors.onEmergency }]}>
          🔒 Período de teste encerrado
        </Text>
        <Text style={[styles.subtitle, styles.expiredSubtitle, { color: colors.onEmergency + 'DD' }]}>
          Assine o Vigora Pro para continuar usando todos os recursos
        </Text>
      </View>
      <Text style={[styles.arrow, styles.expiredArrow, { color: colors.onEmergency }]}>{'->'}</Text>
    </Pressable>
  );
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  expiredContainer: {},
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontWeight: "600",
    fontSize: 13,
    lineHeight: 18,
  },
  expiredTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  expiredSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  arrow: {
    fontSize: 18,
    fontWeight: "600",
  },
  expiredArrow: {
    fontSize: 20,
  },
});
