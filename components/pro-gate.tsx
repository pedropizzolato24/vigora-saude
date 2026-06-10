/**
 * components/pro-gate.tsx
 * Componentes para controle de acesso a recursos premium do Vigora Pro.
 *
 * Exporta:
 * - ProGate: bloqueia renderização de filhos se não for Pro
 * - ProBanner: banner inline de upsell para recursos bloqueados
 * - useProFeature: hook para verificar acesso e abrir paywall
 * - FREE_LIMITS: constantes dos limites do plano gratuito
 */

import React, { useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { usePurchases } from "@/hooks/use-purchases";
import { useColors } from "@/hooks/use-colors";
import { useFontSize } from "@/lib/font-size-context";

// --- Limites do Plano Gratuito ------------------------------------------------
// Fonte de verdade em `./pro-limits` (módulo puro, importável em testes).
export { FREE_LIMITS } from "./pro-limits";

// --- Hook useProFeature -------------------------------------------------------

/**
 * Hook para verificar acesso a um recurso premium e abrir o paywall.
 *
 * Uso:
 *   const { isPro, requirePro } = useProFeature();
 *   // No onPress: if (!requirePro()) return; // bloqueia e abre paywall
 */
export function useProFeature() {
  const { isPro } = usePurchases();
  const router = useRouter();

  const requirePro = useCallback(
    (onGranted?: () => void): boolean => {
      if (isPro) {
        onGranted?.();
        return true;
      }
      router.push("/(modal)/paywall");
      return false;
    },
    [isPro, router]
  );

  const checkLimit = useCallback(
    (current: number, limit: number): boolean => {
      if (isPro) return true;
      if (current < limit) return true;
      router.push("/(modal)/paywall");
      return false;
    },
    [isPro, router]
  );

  return { isPro, requirePro, checkLimit };
}

// --- ProGate ------------------------------------------------------------------

interface ProGateProps {
  /** Conteúdo a exibir se o usuário for Pro */
  children: React.ReactNode;
  /** Conteúdo a exibir se o usuário NÃO for Pro (fallback) */
  fallback?: React.ReactNode;
  /** Estilo do container */
  style?: ViewStyle;
}

/**
 * Renderiza `children` apenas se o usuário tiver acesso Pro.
 * Caso contrário, renderiza `fallback` (ou nada).
 */
export function ProGate({ children, fallback, style }: ProGateProps) {
  const { isPro } = usePurchases();

  if (isPro) {
    return <View style={style}>{children}</View>;
  }

  return fallback ? <View style={style}>{fallback}</View> : null;
}

// --- ProBanner ----------------------------------------------------------------

interface ProBannerProps {
  /** Título do recurso bloqueado */
  title: string;
  /** Descrição do que o Pro desbloqueia */
  description: string;
  /** Ícone MaterialIcons para o recurso */
  icon?: React.ComponentProps<typeof MaterialIcons>["name"];
  /** Estilo do container */
  style?: ViewStyle;
  /** Variante visual */
  variant?: "card" | "inline" | "compact";
}

/**
 * Banner de upsell para recursos bloqueados pelo plano gratuito.
 * Não exibe nada se o usuário já for Pro.
 */
export function ProBanner({
  title,
  description,
  icon = "star",
  style,
  variant = "card",
}: ProBannerProps) {
  const { isPro } = usePurchases();
  const router = useRouter();
  const colors = useColors();
  const fs = useFontSize();

  if (isPro) return null;

  const handlePress = () => router.push("/(modal)/paywall");

  if (variant === "compact") {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.compactBanner,
          {
            backgroundColor: colors.primary + "15",
            borderColor: colors.primary + "40",
            opacity: pressed ? 0.8 : 1,
          },
          style,
        ]}
      >
        <MaterialIcons name={icon} size={14} color={colors.primary} />
        <Text style={[styles.compactText, { color: colors.primary, fontSize: fs.xs }]}>
          {title} - <Text style={{ fontWeight: "700" }}>Vigora Pro</Text>
        </Text>
        <MaterialIcons name="chevron-right" size={14} color={colors.primary} />
      </Pressable>
    );
  }

  if (variant === "inline") {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.inlineBanner,
          {
            backgroundColor: colors.primary + "10",
            borderColor: colors.primary + "35",
            opacity: pressed ? 0.8 : 1,
          },
          style,
        ]}
      >
        <View style={[styles.inlineIconBadge, { backgroundColor: colors.primary + "20" }]}>
          <MaterialIcons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.inlineContent}>
          <Text style={[styles.inlineTitle, { color: colors.foreground, fontSize: fs.sm }]}>
            {title}
          </Text>
          <Text style={[styles.inlineDesc, { color: colors.muted, fontSize: fs.xs }]}>
            {description}
          </Text>
        </View>
        <View style={[styles.inlineButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.inlineButtonText, { fontSize: fs.xs }]}>Pro</Text>
        </View>
      </Pressable>
    );
  }

  // variant === "card" (padrão)
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.cardBanner,
        {
          backgroundColor: colors.surface,
          borderColor: colors.primary + "50",
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.cardIconBadge, { backgroundColor: colors.primary + "18" }]}>
          <MaterialIcons name={icon} size={22} color={colors.primary} />
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: fs.base }]}>
            {title}
          </Text>
          <Text style={[styles.cardDesc, { color: colors.muted, fontSize: fs.sm }]}>
            {description}
          </Text>
        </View>
      </View>
      <View style={[styles.cardButton, { backgroundColor: colors.primary }]}>
        <MaterialIcons name="star" size={14} color="#fff" />
        <Text style={[styles.cardButtonText, { fontSize: fs.sm }]}>
          Assinar Vigora Pro
        </Text>
        <MaterialIcons name="arrow-forward" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}

// --- ProLimitBadge ------------------------------------------------------------

interface ProLimitBadgeProps {
  /** Quantidade atual */
  current: number;
  /** Limite do plano gratuito */
  limit: number;
  /** Rótulo do recurso (ex: "alarmes", "contatos") */
  label: string;
}

/**
 * Badge que mostra o uso atual vs. limite do plano gratuito.
 * Exibe em vermelho quando no limite. Oculto para usuários Pro.
 */
export function ProLimitBadge({ current, limit, label }: ProLimitBadgeProps) {
  const { isPro } = usePurchases();
  const router = useRouter();
  const colors = useColors();
  const fs = useFontSize();

  if (isPro) return null;

  const isAtLimit = current >= limit;
  const color = isAtLimit ? colors.error : colors.muted;

  return (
    <Pressable
      onPress={isAtLimit ? () => router.push("/(modal)/paywall") : undefined}
      style={({ pressed }) => [
        styles.limitBadge,
        {
          backgroundColor: isAtLimit ? colors.error + "15" : colors.surface,
          borderColor: isAtLimit ? colors.error + "40" : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {isAtLimit && <MaterialIcons name="lock" size={11} color={color} />}
      <Text style={[styles.limitText, { color, fontSize: fs.xs }]}>
        {current}/{limit} {label}
        {isAtLimit ? " - Upgrade Pro" : " (plano gratuito)"}
      </Text>
    </Pressable>
  );
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  // Compact
  compactBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  compactText: {
    flex: 1,
  },
  // Inline
  inlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  inlineIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineContent: {
    flex: 1,
    gap: 2,
  },
  inlineTitle: {
    fontWeight: "600",
  },
  inlineDesc: {
    lineHeight: 16,
  },
  inlineButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inlineButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  // Card
  cardBanner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontWeight: "700",
  },
  cardDesc: {
    lineHeight: 18,
  },
  cardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
  },
  cardButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  // Limit badge
  limitBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  limitText: {
    fontWeight: "500",
  },
});
