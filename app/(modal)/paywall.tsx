/**
 * app/(modal)/paywall.tsx
 * Tela modal de assinatura do Vigora Saúde Pro.
 *
 * Apresenta o paywall configurado no painel RevenueCat.
 * Suporta dois modos:
 * 1. RevenueCatUI.presentPaywall() - paywall nativo em sheet (preferido)
 * 2. <RevenueCatUI.Paywall> - componente embutido (fallback)
 *
 * Rota: /paywall (acessada via router.push("/(modal)/paywall"))
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { usePurchases } from "@/hooks/use-purchases";
import { useColors } from "@/hooks/use-colors";
import { useAccessibility } from "@/lib/accessibility-context";

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isAccessibilityMode: isAccessible } = useAccessibility();
  const { isPro, currentOffering, isLoading, purchasePackage, restorePurchases, isRestoring } =
    usePurchases();

  const [presenting, setPresenting] = useState(false);

  // -- Se já é Pro, fechar automaticamente ----------------------------------

  useEffect(() => {
    if (isPro && !isLoading) {
      router.back();
    }
  }, [isPro, isLoading, router]);

  // -- Apresentar paywall nativo RevenueCat ----------------------------------

  const handlePresentNativePaywall = useCallback(async () => {
    if (presenting) return;
    setPresenting(true);

    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: "Vigora Saúde Pro",
      });

      switch (result) {
        case PAYWALL_RESULT.PURCHASED:
        case PAYWALL_RESULT.RESTORED:
          // Compra ou restauração bem-sucedida
          Alert.alert(
            "Bem-vindo ao Vigora Pro! 🎉",
            "Sua assinatura foi ativada com sucesso. Aproveite todos os recursos premium.",
            [{ text: "OK", onPress: () => router.back() }]
          );
          break;
        case PAYWALL_RESULT.CANCELLED:
          // Usuário cancelou - não mostrar erro
          break;
        case PAYWALL_RESULT.NOT_PRESENTED:
          // Já tem acesso - fechar
          router.back();
          break;
        case PAYWALL_RESULT.ERROR:
          Alert.alert(
            "Erro",
            "Não foi possível carregar o paywall. Verifique sua conexão e tente novamente."
          );
          break;
      }
    } catch (error) {
      console.error("[Paywall] Erro ao apresentar paywall:", error);
      Alert.alert("Erro", "Ocorreu um erro inesperado. Tente novamente.");
    } finally {
      setPresenting(false);
    }
  }, [presenting, router]);

  // -- Restaurar compras -----------------------------------------------------

  const handleRestore = useCallback(async () => {
    const result = await restorePurchases();

    if (result.success) {
      const hasEntitlement =
        result.customerInfo?.entitlements.active["Vigora Saúde Pro"] !== undefined;

      if (hasEntitlement) {
        Alert.alert(
          "Compras restauradas! ✅",
          "Seu acesso ao Vigora Pro foi restaurado com sucesso.",
          [{ text: "OK", onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          "Nenhuma compra encontrada",
          "Não encontramos nenhuma assinatura ativa associada a esta conta."
        );
      }
    } else {
      Alert.alert(
        "Erro ao restaurar",
        result.error ?? "Não foi possível restaurar suas compras. Tente novamente."
      );
    }
  }, [restorePurchases, router]);

  // -- Renderização ----------------------------------------------------------

  const baseTextSize = isAccessible ? 18 : 15;
  const titleSize = isAccessible ? 26 : 22;
  const subtitleSize = isAccessible ? 17 : 14;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.muted, fontSize: subtitleSize }]}>
          Carregando planos...
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}
          hitSlop={12}
        >
          <Text style={[styles.closeText, { color: colors.muted, fontSize: baseTextSize }]}>
            ✕
          </Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: titleSize }]}>
          Vigora Saúde Pro
        </Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <Text style={[styles.heroEmoji]}>❤️‍🔥</Text>
          <Text style={[styles.heroTitle, { fontSize: titleSize + 2 }]}>
            Proteção Completa
          </Text>
          <Text style={[styles.heroSubtitle, { fontSize: subtitleSize + 1 }]}>
            Monitoramento 24h, alertas avançados e muito mais
          </Text>
        </View>

        {/* Benefícios */}
        <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: baseTextSize + 2 }]}>
            O que você ganha:
          </Text>
          {BENEFITS.map((benefit) => (
            <View key={benefit.text} style={styles.benefitRow}>
              <Text style={styles.benefitIcon}>{benefit.icon}</Text>
              <Text style={[styles.benefitText, { color: colors.foreground, fontSize: baseTextSize }]}>
                {benefit.text}
              </Text>
            </View>
          ))}
        </View>

        {/* Planos disponíveis */}
        {currentOffering ? (
          <View style={styles.plansSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: baseTextSize + 2 }]}>
              Escolha seu plano:
            </Text>
            {currentOffering.availablePackages.map((pkg) => {
              const label = PACKAGE_LABELS[pkg.packageType] ?? pkg.identifier;
              const isLifetime = pkg.identifier === "lifetime" || pkg.packageType === "LIFETIME";
              return (
                <Pressable
                  key={pkg.identifier}
                  onPress={async () => {
                    const result = await purchasePackage(pkg);
                    if (result.success) {
                      Alert.alert(
                        "Assinatura ativada! 🎉",
                        "Bem-vindo ao Vigora Pro! Aproveite todos os recursos premium.",
                        [{ text: "OK", onPress: () => router.back() }]
                      );
                    } else if (!result.userCancelled && result.error) {
                      Alert.alert("Erro na compra", result.error);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.planCard,
                    {
                      backgroundColor: isLifetime ? colors.primary : colors.surface,
                      borderColor: isLifetime ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {isLifetime && (
                    <View style={styles.bestValueBadge}>
                      <Text style={styles.bestValueText}>Melhor valor</Text>
                    </View>
                  )}
                  <Text
                    style={[
                      styles.planTitle,
                      {
                        color: isLifetime ? "#fff" : colors.foreground,
                        fontSize: baseTextSize + 2,
                      },
                    ]}
                  >
                    {label.title}
                  </Text>
                  <Text
                    style={[
                      styles.planPrice,
                      {
                        color: isLifetime ? "#fff" : colors.primary,
                        fontSize: baseTextSize + 4,
                      },
                    ]}
                  >
                    {pkg.product.priceString}
                  </Text>
                  <Text
                    style={[
                      styles.planPeriod,
                      {
                        color: isLifetime ? "rgba(255,255,255,0.8)" : colors.muted,
                        fontSize: subtitleSize,
                      },
                    ]}
                  >
                    {label.period}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          /* Fallback: botão para abrir paywall nativo */
          <View style={styles.nativePaywallSection}>
            <Text style={[styles.noOffering, { color: colors.muted, fontSize: subtitleSize }]}>
              Carregue os planos disponíveis para assinar.
            </Text>
            <Pressable
              onPress={handlePresentNativePaywall}
              disabled={presenting}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary, opacity: pressed || presenting ? 0.7 : 1 },
              ]}
            >
              {presenting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.primaryButtonText, { fontSize: baseTextSize }]}>
                  Ver planos disponíveis
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Botão principal - abre paywall nativo RevenueCat */}
        <Pressable
          onPress={handlePresentNativePaywall}
          disabled={presenting}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: pressed || presenting ? 0.7 : 1 },
          ]}
        >
          {presenting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.primaryButtonText, { fontSize: baseTextSize }]}>
              Assinar agora
            </Text>
          )}
        </Pressable>

        {/* Restaurar compras */}
        <Pressable
          onPress={handleRestore}
          disabled={isRestoring}
          style={({ pressed }) => [styles.restoreButton, pressed && { opacity: 0.6 }]}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <Text style={[styles.restoreText, { color: colors.muted, fontSize: subtitleSize }]}>
              Restaurar compras anteriores
            </Text>
          )}
        </Pressable>

        {/* Termos */}
        <Text style={[styles.termsText, { color: colors.muted, fontSize: 12 }]}>
          A assinatura é renovada automaticamente. Cancele a qualquer momento nas configurações da
          loja. Ao assinar, você concorda com os Termos de Uso e Política de Privacidade.
        </Text>
      </ScrollView>
    </View>
  );
}

// --- Dados --------------------------------------------------------------------

const BENEFITS = [
  { icon: "🔔", text: "Alertas de emergência ilimitados via WhatsApp, Email e SMS" },
  { icon: "📊", text: "Monitoramento contínuo de saúde 24 horas por dia" },
  { icon: "💊", text: "Alarmes de medicamentos com escalação automática" },
  { icon: "📍", text: "Compartilhamento de localização em emergências" },
  { icon: "👥", text: "Contatos de emergência ilimitados" },
  { icon: "📋", text: "Ficha de anamnese completa e exportação em PDF" },
  { icon: "🆘", text: "Botão SOS com acionamento rápido" },
  { icon: "🌙", text: "Modo acessível para idosos e usuários com necessidades especiais" },
];

const PACKAGE_LABELS: Record<string, { title: string; period: string }> = {
  LIFETIME: { title: "Vitalício", period: "Pagamento único, para sempre" },
  ANNUAL: { title: "Anual", period: "por ano - economize 40%" },
  MONTHLY: { title: "Mensal", period: "por mês" },
  lifetime: { title: "Vitalício", period: "Pagamento único, para sempre" },
  yearly: { title: "Anual", period: "por ano - economize 40%" },
  monthly: { title: "Mensal", period: "por mês" },
};

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontWeight: "600",
  },
  headerTitle: {
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  heroCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  heroEmoji: {
    fontSize: 48,
  },
  heroTitle: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 22,
  },
  benefitsCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 12,
  },
  sectionTitle: {
    fontWeight: "700",
    marginBottom: 4,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  benefitIcon: {
    fontSize: 18,
    width: 24,
  },
  benefitText: {
    flex: 1,
    lineHeight: 22,
  },
  plansSection: {
    gap: 12,
  },
  planCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    gap: 4,
    position: "relative",
    overflow: "hidden",
  },
  bestValueBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bestValueText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  planTitle: {
    fontWeight: "700",
  },
  planPrice: {
    fontWeight: "800",
  },
  planPeriod: {
    marginTop: 2,
  },
  nativePaywallSection: {
    gap: 12,
    alignItems: "center",
  },
  noOffering: {
    textAlign: "center",
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  restoreText: {
    textDecorationLine: "underline",
  },
  termsText: {
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
});
