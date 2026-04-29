/**
 * app/(modal)/customer-center.tsx
 * Tela modal do Customer Center do RevenueCat.
 *
 * Permite ao usuário:
 * - Cancelar assinatura ativa
 * - Restaurar compras anteriores
 * - Solicitar reembolso (iOS)
 * - Trocar de plano (iOS)
 * - Contatar suporte
 *
 * Rota: /(modal)/customer-center
 * Acesso: Configurações -> "Gerenciar assinatura"
 */

import React, { useCallback, useEffect } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import RevenueCatUI from "react-native-purchases-ui";
import { usePurchases } from "@/hooks/use-purchases";

export default function CustomerCenterScreen() {
  const router = useRouter();
  const { isPro } = usePurchases();

  // -- Apresentar Customer Center nativo ------------------------------------

  const presentCustomerCenter = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Não disponível",
        "O gerenciamento de assinatura está disponível apenas no app iOS ou Android."
      );
      router.back();
      return;
    }

    try {
      await RevenueCatUI.presentCustomerCenter({
        callbacks: {
          onFeedbackSurveyCompleted: ({ feedbackSurveyOptionId }) => {
            console.log("[CustomerCenter] Feedback enviado:", feedbackSurveyOptionId);
          },
          onShowingManageSubscriptions: () => {
            console.log("[CustomerCenter] Tela de gerenciamento exibida");
          },
          onRestoreStarted: () => {
            console.log("[CustomerCenter] Restauração iniciada");
          },
          onRestoreCompleted: ({ customerInfo }) => {
            const hasPro =
              customerInfo.entitlements.active["Vigora Saúde Pro"] !== undefined;
            if (hasPro) {
              Alert.alert(
                "Compras restauradas! ✅",
                "Seu acesso ao Vigora Pro foi restaurado com sucesso."
              );
            }
          },
          onRestoreFailed: ({ error }) => {
            console.error("[CustomerCenter] Restauração falhou:", error);
          },
          onRefundRequestStarted: ({ productIdentifier }) => {
            console.log("[CustomerCenter] Reembolso solicitado para:", productIdentifier);
          },
          onRefundRequestCompleted: ({ productIdentifier, refundRequestStatus }) => {
            console.log(
              "[CustomerCenter] Reembolso concluído:",
              productIdentifier,
              refundRequestStatus
            );
          },
          onManagementOptionSelected: ({ option, url }) => {
            console.log("[CustomerCenter] Opção selecionada:", option, url);
          },
        },
      });
    } catch (error) {
      console.error("[CustomerCenter] Erro ao apresentar:", error);
      Alert.alert(
        "Erro",
        "Não foi possível abrir o gerenciamento de assinatura. Tente novamente."
      );
    } finally {
      // Voltar para a tela anterior após fechar o Customer Center
      router.back();
    }
  }, [router]);

  // -- Abrir automaticamente ao montar --------------------------------------

  useEffect(() => {
    presentCustomerCenter();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tela vazia - o Customer Center é apresentado como sheet nativo
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
