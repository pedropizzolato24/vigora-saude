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
import { Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import RevenueCatUI from "react-native-purchases-ui";
import { hasProAccess } from "@/lib/purchases";
import { AppDialog, useAppDialog } from "@/components/app-dialog";

export default function CustomerCenterScreen() {
  const router = useRouter();
  const { dialogProps, showDialog } = useAppDialog();

  // -- Apresentar Customer Center nativo ------------------------------------

  const presentCustomerCenter = useCallback(async () => {
    if (Platform.OS === "web") {
      showDialog({
        variant: "info",
        title: "Não disponível",
        message:
          "O gerenciamento de assinatura está disponível apenas no app iOS ou Android.",
        buttons: [{ text: "OK", onPress: () => router.back() }],
      });
      return;
    }

    // A restauração acontece DENTRO do sheet nativo (renderizado por cima desta
    // tela), então só registramos o resultado e mostramos o AppDialog DEPOIS que
    // o sheet fecha — um AppDialog não apareceria por baixo do sheet nativo.
    let restoredPro = false;

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
            restoredPro = hasProAccess(customerInfo);
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

      if (restoredPro) {
        showDialog({
          variant: "success",
          title: "Compras restauradas! ✅",
          message: "Seu acesso ao Vigora Pro foi restaurado com sucesso.",
          buttons: [{ text: "OK", onPress: () => router.back() }],
        });
      } else {
        router.back();
      }
    } catch (error) {
      console.error("[CustomerCenter] Erro ao apresentar:", error);
      showDialog({
        variant: "error",
        title: "Erro",
        message: "Não foi possível abrir o gerenciamento de assinatura. Tente novamente.",
        buttons: [{ text: "OK", onPress: () => router.back() }],
      });
    }
  }, [router, showDialog]);

  // -- Abrir automaticamente ao montar --------------------------------------

  useEffect(() => {
    presentCustomerCenter();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // O Customer Center é apresentado como sheet nativo; esta tela só hospeda o
  // AppDialog de feedback (restauração/erro) que aparece após o sheet fechar.
  return (
    <View style={styles.container}>
      <AppDialog {...dialogProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
