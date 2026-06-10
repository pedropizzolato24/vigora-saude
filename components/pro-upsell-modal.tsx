/**
 * components/pro-upsell-modal.tsx
 * Modal de upsell contextual para recursos premium do Vigora Pro.
 *
 * Exibe um bottom sheet animado com:
 * - Ícone e badge do recurso bloqueado
 * - Título e descrição específicos do benefício
 * - Lista de features desbloqueadas pelo Pro
 * - Botão "Assinar Vigora Pro" -> abre paywall
 * - Botão "Agora não" -> fecha o modal
 *
 * Uso:
 *   const { showUpsell, UpsellModal } = useProUpsell();
 *   // No onPress de um recurso bloqueado:
 *   showUpsell({
 *     icon: "people",
 *     title: "Contatos Ilimitados",
 *     description: "Você atingiu o limite de 3 contatos no plano gratuito.",
 *     benefit: "Com o Vigora Pro, adicione quantos contatos precisar.",
 *     features: ["Contatos ilimitados", "Alarmes ilimitados", "Exportação PDF"],
 *   });
 *   // No JSX: <UpsellModal />
 */

import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useFontSize } from "@/lib/font-size-context";

// --- Tipos --------------------------------------------------------------------

export interface ProUpsellConfig {
  /** Ícone MaterialIcons representando o recurso bloqueado */
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  /** Título do recurso bloqueado (ex: "Contatos Ilimitados") */
  title: string;
  /** Frase curta explicando o bloqueio (ex: "Você atingiu o limite de 3 contatos.") */
  description: string;
  /** Frase de benefício específico (ex: "Com o Pro, adicione quantos contatos precisar.") */
  benefit: string;
  /** Lista de 3-4 features desbloqueadas pelo Pro */
  features?: string[];
}

// --- Hook useProUpsell --------------------------------------------------------

/**
 * Hook que fornece o modal de upsell contextual e a função para exibi-lo.
 *
 * @returns `showUpsell(config)` - exibe o modal com a configuração fornecida
 * @returns `UpsellModal` - componente do modal (deve ser renderizado no JSX)
 */
export function useProUpsell() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ProUpsellConfig | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const colors = useColors();
  const fs = useFontSize();

  const showUpsell = useCallback((cfg: ProUpsellConfig) => {
    setConfig(cfg);
    setVisible(true);
    // Animar entrada: fundo fade in + sheet slide up
    slideAnim.setValue(300);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [slideAnim, fadeAnim]);

  const hideUpsell = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 300, duration: 180, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }, [fadeAnim, slideAnim]);

  const handleSubscribe = useCallback(() => {
    hideUpsell();
    // Pequeno delay para a animação de saída terminar antes de navegar
    setTimeout(() => router.push("/(modal)/paywall"), 200);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [hideUpsell, router]);

  const UpsellModal = useCallback(() => {
    if (!config) return null;

    const defaultFeatures = [
      "Contatos de emergência ilimitados",
      "Alarmes ilimitados",
      "Exportação PDF da Anamnese",
      "Monitoramento contínuo de saúde",
    ];
    const features = config.features ?? defaultFeatures;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={hideUpsell}
        statusBarTranslucent
      >
        {/* Fundo escuro */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={hideUpsell} />
        </Animated.View>

        {/* Bottom sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            bounces={false}
          >
            {/* Ícone do recurso */}
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + "18" }]}>
              <View style={[styles.iconBadge, { backgroundColor: colors.primary + "30" }]}>
                <MaterialIcons name={config.icon} size={32} color={colors.primary} />
              </View>
              {/* Badge PRO */}
              <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="star" size={10} color="#fff" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>

            {/* Título */}
            <Text style={[styles.title, { color: colors.foreground, fontSize: fs.xl }]}>
              {config.title}
            </Text>

            {/* Descrição do bloqueio */}
            <Text style={[styles.description, { color: colors.muted, fontSize: fs.sm }]}>
              {config.description}
            </Text>

            {/* Card de benefício */}
            <View style={[styles.benefitCard, { backgroundColor: colors.primary + "0D", borderColor: colors.primary + "35" }]}>
              <MaterialIcons name="check-circle" size={18} color={colors.primary} />
              <Text style={[styles.benefitText, { color: colors.foreground, fontSize: fs.sm }]}>
                {config.benefit}
              </Text>
            </View>

            {/* Lista de features */}
            <View style={[styles.featureList, { borderColor: colors.border }]}>
              <Text style={[styles.featureListTitle, { color: colors.muted, fontSize: fs.xs }]}>
                VIGORA PRO INCLUI
              </Text>
              {features.map((feature, i) => (
                <View key={i} style={styles.featureItem}>
                  <View style={[styles.featureDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.featureText, { color: colors.foreground, fontSize: fs.sm }]}>
                    {feature}
                  </Text>
                </View>
              ))}
            </View>

            {/* Botão principal */}
            <Pressable
              onPress={handleSubscribe}
              style={({ pressed }) => [
                styles.subscribeButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <MaterialIcons name="star" size={18} color="#fff" />
              <Text style={[styles.subscribeText, { fontSize: fs.base }]}>
                Assinar Vigora Pro
              </Text>
              <MaterialIcons name="arrow-forward" size={18} color="#fff" />
            </Pressable>

            {/* Botão secundário */}
            <Pressable
              onPress={hideUpsell}
              style={({ pressed }) => [styles.dismissButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.dismissText, { color: colors.muted, fontSize: fs.sm }]}>
                Agora não
              </Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </Modal>
    );
  }, [visible, config, colors, fs, fadeAnim, slideAnim, hideUpsell, handleSubscribe]);

  return { showUpsell, hideUpsell, UpsellModal };
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
    gap: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  proBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  proBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  title: {
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  description: {
    textAlign: "center",
    lineHeight: 20,
    marginTop: -4,
  },
  benefitCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    width: "100%",
  },
  benefitText: {
    flex: 1,
    lineHeight: 20,
    fontWeight: "500",
  },
  featureList: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  featureListTitle: {
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  featureText: {
    flex: 1,
    lineHeight: 20,
  },
  subscribeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 16,
    width: "100%",
    marginTop: 4,
  },
  subscribeText: {
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  dismissButton: {
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  dismissText: {
    fontWeight: "500",
  },
});
