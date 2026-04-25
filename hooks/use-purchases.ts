/**
 * hooks/use-purchases.ts
 * Hook React para acessar o estado de assinatura do RevenueCat.
 *
 * Uso:
 *   const { isPro, customerInfo, isLoading, purchasePackage } = usePurchases();
 */

import { useContext } from "react";
import { PurchasesContext } from "@/context/purchases-context";

export function usePurchases() {
  const context = useContext(PurchasesContext);
  if (!context) {
    throw new Error("usePurchases deve ser usado dentro de PurchasesProvider");
  }
  return context;
}
